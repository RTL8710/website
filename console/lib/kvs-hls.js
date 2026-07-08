// 云端回放 —— KVS Archived Media,裸 SigV4 fetch(不用 @aws-sdk esm,其在浏览器崩)。
// GetDataEndpoint → GetHLSStreamingSessionURL(StreamName = device.id)→ hls.js。
// 依赖 Identity Pool 临时凭证(node 实测该角色对真实设备返回 200)。
import { COGNITO } from '../config.js';
import { resolvedCreds } from './auth.js';
import { sigv4PostJson } from './sigv4.js';

export async function getHlsUrl(deviceId, { startIso, endIso } = {}) {
  const creds = await resolvedCreds();
  const region = COGNITO.region;
  const service = 'kinesisvideo';

  // 1. 取数据端点
  const ep = await sigv4PostJson(creds, {
    host: `kinesisvideo.${region}.amazonaws.com`, path: '/getDataEndpoint', service, region,
    body: { StreamName: deviceId, APIName: 'GET_HLS_STREAMING_SESSION_URL' },
  });
  const dataEndpoint = ep.DataEndpoint;          // https://xxx.kinesisvideo...
  const dataHost = new URL(dataEndpoint).host;

  // 2. 取 HLS 会话 URL(点播)
  const body = { StreamName: deviceId, PlaybackMode: 'ON_DEMAND', Expires: 3600 };
  if (startIso && endIso) {
    body.HLSFragmentSelector = {
      FragmentSelectorType: 'SERVER_TIMESTAMP',
      TimestampRange: { StartTimestamp: new Date(startIso).getTime() / 1000, EndTimestamp: new Date(endIso).getTime() / 1000 },
    };
  }
  const out = await sigv4PostJson(creds, {
    host: dataHost, endpoint: dataEndpoint, path: '/getHLSStreamingSessionURL', service, region, body,
  });
  return out.HLSStreamingSessionURL;
}

// 把 m3u8 挂到 <video>。用全局 hls.js(index.html 里 <script> 引入),Safari 原生兜底。
let _hls = null;
export function playHls(videoEl, url) {
  destroyHls();
  const Hls = window.Hls;
  if (Hls && Hls.isSupported()) {
    _hls = new Hls({ enableWorker: true, lowLatencyMode: false });
    _hls.loadSource(url);
    _hls.attachMedia(videoEl);
    _hls.on(Hls.Events.MANIFEST_PARSED, () => videoEl.play().catch(() => {}));
    return;
  }
  videoEl.src = url;
  videoEl.addEventListener('loadedmetadata', () => videoEl.play().catch(() => {}), { once: true });
}

export function destroyHls() {
  if (_hls) { try { _hls.destroy(); } catch (_) {} _hls = null; }
}
