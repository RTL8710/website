// AWS IoT MQTT-over-WSS 设备通信 —— 搬 ipcwebsite/public/device/device-transport.js(实测握手 101)。
// 依赖全局 window.mqtt(vendor/mqtt.min.js)+ window.CryptoJS(vendor/crypto.js)。
// 主题:发布 v1/devices/{deviceUuid}/rpc/request/{webUserId};订阅 v1/devices/{webUserId}/rpc/response/+。
// 信封 {method, params, requestId},按 requestId 配对。凭证走 Identity Pool 临时凭证。
import { COGNITO, IOT_ENDPOINT } from '../config.js';
import { resolvedCreds } from './auth.js';
// IOT_ENDPOINT 来自 config.js live binding（随区域切换）
const REPLY_TIMEOUT = 12000;

let _client = null;
let _ready = false;
let _connecting = null;
const _webUserId = 'web_' + Math.random().toString(36).slice(2, 10);
const _pending = new Map();

// SigV4 presign(关键坑:X-Amz-Security-Token 不参与签名,算完签名后再追加)
function signedUrl(creds) {
  const C = window.CryptoJS;
  const H = (m, k) => C.HmacSHA256(m, k);
  const now = new Date();
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amz.slice(0, 8);
  const service = 'iotdevicegateway', host = IOT_ENDPOINT, region = COGNITO.region;
  const scope = `${date}/${region}/${service}/aws4_request`;
  const qs = 'X-Amz-Algorithm=AWS4-HMAC-SHA256'
    + '&X-Amz-Credential=' + encodeURIComponent(creds.accessKeyId + '/' + scope)
    + '&X-Amz-Date=' + amz
    + '&X-Amz-SignedHeaders=host';
  const canonicalReq = 'GET\n/mqtt\n' + qs + '\nhost:' + host + '\n\nhost\n'
    + C.SHA256('').toString(C.enc.Hex);
  const sts = 'AWS4-HMAC-SHA256\n' + amz + '\n' + scope + '\n'
    + C.SHA256(canonicalReq).toString(C.enc.Hex);
  const kDate = H(date, 'AWS4' + creds.secretAccessKey);
  const kSigning = H('aws4_request', H(service, H(region, kDate)));
  const sig = H(sts, kSigning).toString(C.enc.Hex);
  let url = 'wss://' + host + '/mqtt?' + qs + '&X-Amz-Signature=' + sig;
  if (creds.sessionToken) url += '&X-Amz-Security-Token=' + encodeURIComponent(creds.sessionToken);
  return url;
}

export function iotAvailable() {
  return !!(window.mqtt && window.CryptoJS);
}

export async function connect() {
  if (_ready && _client) return;
  if (_connecting) return _connecting;
  if (!iotAvailable()) throw new Error('IoT 依赖缺失(mqtt.js / CryptoJS 未加载)');
  _connecting = (async () => {
    const creds = await resolvedCreds();
    if (!creds.accessKeyId) throw new Error('无临时凭证,请重新登录');
    const url = signedUrl(creds);
    const clientId = _webUserId + '_' + Math.random().toString(36).slice(2, 6);
    console.info('[iot] 连接 WSS…', 'clientId=' + clientId);
    const client = window.mqtt.connect(url, { clientId, keepalive: 60, reconnectPeriod: 0, protocolVersion: 4 });
    let closed = false;
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(closed
        ? 'AWS IoT 在 CONNECT 后断开(无 CONNACK)——服务器拒绝连接,非权限问题(IAM 已确认允许 iot:Connect)'
        : 'IoT 连接超时')), REPLY_TIMEOUT);
      client.on('connect', () => { clearTimeout(to); console.info('[iot] ✅ CONNACK,已连接'); resolve(); });
      client.on('error', (e) => { clearTimeout(to); console.warn('[iot] error', e && e.message); reject(e); });
      client.on('close', () => { closed = true; console.warn('[iot] ⚠️ WSS 被关闭(CONNECT 后无 CONNACK 即断)'); });
    });
    const respTopic = `v1/devices/${_webUserId}/rpc/response/+`;
    await new Promise((resolve, reject) => client.subscribe(respTopic, { qos: 1 }, (e) => e ? reject(e) : resolve()));
    client.on('message', (_topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        const pend = data.requestId && _pending.get(data.requestId);
        if (pend) { clearTimeout(pend.timer); _pending.delete(data.requestId); pend.resolve(data); }
        else { try { window.dispatchEvent(new CustomEvent('iot-push', { detail: data })); } catch (_) {} }
      } catch (_) {}
    });
    _client = client; _ready = true;
    return;
  })();
  try { await _connecting; } finally { _connecting = null; }
}

// 发命令并等应答。method 如 getDeviceGeneralInfo / setNetworkInfo;params 为 {key: data}。
export async function sendCommand(deviceUuid, method, params = {}) {
  if (!deviceUuid) throw new Error('缺少设备 UUID(deviceGeneralInformation.deviceUuid)');
  await connect();
  const requestId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : ('r' + Date.now() + Math.random().toString(36).slice(2, 8));
  const payload = JSON.stringify({ method, params, requestId });
  const reqTopic = `v1/devices/${deviceUuid}/rpc/request/${_webUserId}`;
  const p = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { _pending.delete(requestId); reject(new Error('IoT 应答超时: ' + method)); }, REPLY_TIMEOUT);
    _pending.set(requestId, { resolve, reject, timer });
  });
  _client.publish(reqTopic, payload, { qos: 1 });
  return p; // { method:"xxxRespone", status, params, requestId }
}

export function disconnect() {
  if (_client) { try { _client.end(true); } catch (_) {} }
  _client = null; _ready = false; _pending.clear();
}
