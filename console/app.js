// 控制台入口:路由 + 登录门禁 + 视图
import { COGNITO } from './config.js';
import { signIn, restoreSession, signOut, resolvedCreds } from './lib/auth.js';
import { fetchMyDevices, fetchCloudRecords } from './lib/graphql.js';
import { getHlsUrl, playHls, destroyHls } from './lib/kvs-hls.js';
import { sendCommand as iotSend, disconnect as iotDisconnect } from './lib/iot-rpc.js';
import { presignS3Get } from './lib/sigv4.js';
import { h, mount, icon, deviceCard, statusChip, loading, emptyState } from './lib/ui.js';

const app = document.getElementById('app');
const state = { session: null, devices: null, current: null };

// ── 工具 ─────────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
function dayRange(dateStr) { // 'YYYY-MM-DD' → [ISO start, ISO end]
  const s = new Date(dateStr + 'T00:00:00');
  const e = new Date(dateStr + 'T23:59:59');
  return [s.toISOString(), e.toISOString()];
}
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtTime(iso) { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function go(hash) { location.hash = hash; }

// ── 顶栏 ─────────────────────────────────────────────────────────────────────
function topbar() {
  return h('div', { class: 'topbar' },
    h('div', { class: 'in' },
      h('a', { class: 'brand', href: '#/devices' }, h('span', { class: 'b' }), '设备管理控制台'),
      h('span', { class: 'spacer' }),
      state.session ? h('span', { class: 'muted', style: { fontSize: '13px' } }, state.session.email || '') : null,
      state.session ? h('button', { class: 'gbtn icon', title: '退出', onclick: doSignOut }, icon('logout')) : null,
    ),
  );
}
function shell(...body) { return mount(app, topbar(), h('div', { class: 'wrap' }, ...body)); }

// ── 登录(双栏 hero+form,移植设备端 login.html 视觉,登录逻辑走 Cognito signIn)──────
function fa(cls) { return h('i', { class: cls }); }
function viewLogin() {
  const username = h('input', { class: 'form-input', type: 'text', id: 'username', placeholder: '请输入用户名',
    autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const pass = h('input', { class: 'form-input', type: 'password', id: 'password', placeholder: '请输入密码',
    autocomplete: 'current-password', required: true });
  const pwIcon = fa('fas fa-eye');
  const togglePw = h('button', { type: 'button', class: 'toggle-pw', title: '显示/隐藏密码',
    onclick: () => { const show = pass.type === 'password'; pass.type = show ? 'text' : 'password'; pwIcon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye'; } }, pwIcon);
  const errMsg = h('span', {}, '用户名或密码不正确');
  const err = h('div', { class: 'login-error' }, fa('fas fa-circle-exclamation'), errMsg);
  const btn = h('button', { type: 'submit', class: 'btn-login' }, '登录');
  async function submit(ev) {
    ev && ev.preventDefault();
    err.classList.remove('show');
    if (!username.value || !pass.value) { errMsg.textContent = '请输入用户名和密码'; err.classList.add('show'); return; }
    btn.disabled = true; btn.textContent = '登录中…';
    try {
      state.session = await signIn(username.value.trim(), pass.value);
      state.devices = null;
      go('#/devices');
    } catch (e) {
      errMsg.textContent = mapAuthError(e); err.classList.add('show');
      btn.disabled = false; btn.textContent = '登录';
    }
  }
  const badge = () => h('div', { class: 'brand-badge' }, fa('fas fa-robot'));
  const feat = (ic, tx) => h('div', { class: 'feature-item' }, h('div', { class: 'feature-ic' }, fa('fas ' + ic)), h('div', { class: 'feature-tx' }, tx));
  const field = (labelText, forId, iconCls, input, extra) => h('div', { class: 'form-group' },
    h('label', { class: 'form-label', for: forId }, labelText),
    h('div', { class: 'input-wrap' }, fa('fas ' + iconCls + ' input-icon'), input, extra || null),
  );
  const shellEl = h('div', { class: 'login-shell' },
    h('aside', { class: 'login-hero' },
      h('div', { class: 'hero-top brand-row' }, badge(),
        h('div', {}, h('div', { class: 'brand-name' }, '设备管理控制台'), h('div', { class: 'brand-sub' }, 'Device Management'))),
      h('div', { class: 'hero-mid' },
        h('h1', { class: 'hero-title' }, '机器人设备云控制台'),
        h('p', { class: 'hero-tagline' }, '实时监控、录像回放与设备全参数控制,一站式云端管理。'),
        h('div', { class: 'feature-list' },
          feat('fa-video', '实时音视频监控'),
          feat('fa-clock-rotate-left', '录像回放'),
          feat('fa-sliders', '音视频 · 网络 · IoT 设置'),
          feat('fa-cloud', '云端管理'),
        ),
      ),
      h('div', { class: 'hero-bottom' }, '安全设备接入 · 局域网 & 广域网'),
    ),
    h('main', { class: 'login-main' },
      h('form', { class: 'login-card', onsubmit: submit },
        h('div', { class: 'card-brand' }, badge(),
          h('div', {}, h('div', { class: 'brand-name', style: { fontSize: '17px' } }, '设备管理控制台'), h('div', { class: 'brand-sub' }, 'Device Management'))),
        h('div', { class: 'login-title' }, '欢迎回来'),
        h('div', { class: 'login-subtitle' }, '用你的设备账号(用户名)登录,管理名下设备'),
        err,
        field('用户名', 'username', 'fa-user', username),
        field('密码', 'password', 'fa-lock', pass, togglePw),
        btn,
      ),
    ),
  );
  mount(app, shellEl);
  username.focus();
}
function mapAuthError(e) {
  const m = (e && e.message) || '';
  if (/UserNotFound|does not exist|Incorrect username or password|NotAuthorized/i.test(m)) return '用户名或密码不正确';
  if (/UserNotConfirmed/i.test(m)) return '账号未验证,请先在 App 内完成验证';
  if (/Network|Failed to fetch/i.test(m)) return '网络错误,请重试';
  return m || '登录失败';
}
async function doSignOut() { iotDisconnect(); await signOut(); state.session = null; state.devices = null; go('#/login'); }

// ── 进入设备控制页(复用固件 web UI,注入 Cognito 临时凭证走 AWS IoT + KVS)────────
const IOT_ENDPOINT = 'atwwuuu2m6zxs-ats.iot.ap-northeast-1.amazonaws.com';
async function enterDevice(dev) {
  const uuid = dev.uuid || dev.id;
  if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) { alert('设备 UUID 无效,无法进入控制页'); return; }
  shell(loading('正在获取安全凭证,进入设备…'));
  try {
    const c = await resolvedCreds();
    // 契约:device-transport.js iotCreds() + index.html resolveKvsCredentials() 都读 sessionStorage['iot_creds']
    sessionStorage.setItem('iot_creds', JSON.stringify({
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
      sessionToken: c.sessionToken,
      region: COGNITO.region,
      endpoint: IOT_ENDPOINT,
    }));
    sessionStorage.setItem('dv_auth', '1'); // 跳过设备本地登录
    sessionStorage.setItem('dv_user', (state.session.userRow && state.session.userRow.awsUserName) || state.session.email || 'user');
    localStorage.setItem('previewTransport', 'kvs'); // 实时预览走 KVS(不用声网)
    if (!localStorage.getItem('dv_lang')) localStorage.setItem('dv_lang', 'zh');
    location.href = 'device/index.html?deviceId=' + encodeURIComponent(uuid);
  } catch (e) {
    shell(errorBox('进入设备失败', e));
  }
}

// 设备封面:优先 devicePicture(整机 S3 封面),为空则回退到最新一条云录像的 thumbnailUrl。
// 一律用【预签名 URL 直接给 <img>】——图片加载不受 S3 CORS 限制(不能 fetch→base64,那会被 CORS 拦,
// 是仪表盘封面踩过的坑)。预签名 1h 有效,每次进列表本地 SigV4 重签(快),浏览器再缓存图片本身。
async function resolveDeviceCover(d, creds) {
  let raw = (d.picture && /amazonaws\.com/.test(d.picture)) ? d.picture : '';
  if (!raw) {
    // devicePicture 空 → 拉最新一条云录像封面兜底
    try {
      const end = new Date(Date.now() + 864e5).toISOString();
      const start = new Date(Date.now() - 7 * 864e5).toISOString();
      const recs = await fetchCloudRecords(d.uuid || d.id, start, end);
      const withThumb = recs.find((r) => r.thumbnailUrl);
      if (withThumb) raw = withThumb.thumbnailUrl;
    } catch (e) { /* 兜底失败保持无封面 */ }
  }
  return raw ? presignS3Get(creds, raw) : '';
}

// ── 设备列表 ─────────────────────────────────────────────────────────────────
async function viewDevices() {
  shell(loading('加载设备…'));
  try {
    if (!state.devices) state.devices = await fetchMyDevices(state.session.userRow.id);
    const list = state.devices;
    // 设备封面:devicePicture(整机 S3 封面)优先,空则回退最新云录像封面;都用预签名 URL 给 <img>(见 resolveDeviceCover)。
    try {
      const creds = await resolvedCreds();
      await Promise.all(list.map(async (d) => {
        if (d._picSigned) return;
        d.picture = await resolveDeviceCover(d, creds);
        d._picSigned = true;
      }));
    } catch (e) { console.warn('[devices] 封面解析跳过:', e && e.message); }
    const head = h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '24px 0 4px' } },
      h('h1', { class: 'title' }, '我的设备'),
      h('span', { class: 'chip count' }, `${list.length}`),
    );
    shell(head, list.length
      ? h('div', { class: 'grid' }, ...list.map((d) => deviceCard(d, enterDevice)))
      : emptyState('暂无设备'));
  } catch (e) {
    shell(errorBox('设备加载失败', e));
  }
}

// ── 设备详情(MVP:云端回放;实时/参数/OTA 占位)────────────────────────────────
function viewDevice(id) {
  const dev = (state.devices || []).find((d) => d.id === id);
  if (!dev) { go('#/devices'); return; }
  state.current = dev;

  const tabs = ['云端回放', '实时预览', '参数设置', 'OTA 升级'];
  let active = 0;
  const panel = h('div', { style: { marginTop: '16px' } });
  const tabBar = h('div', { class: 'glass', style: { display: 'flex', gap: '4px', padding: '5px', borderRadius: '14px', width: 'fit-content' } });
  function renderTabs() {
    mount(tabBar, ...tabs.map((t, i) => h('button', {
      class: 'gbtn', style: i === active
        ? { background: 'linear-gradient(180deg,#7fe6d9,var(--accent))', color: '#04211d', border: 'none' }
        : { background: 'transparent', border: 'none' },
      onclick: () => { active = i; renderTabs(); renderPanel(); },
    }, t)));
  }
  function renderPanel() {
    destroyHls();
    if (active === 0) mount(panel, cloudPlayback(dev));
    else if (active === 2) mount(panel, paramsPanel(dev));
    else mount(panel, comingSoon(tabs[active]));
  }
  const header = h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '24px 0 6px' } },
    h('button', { class: 'gbtn icon', title: '返回', onclick: () => { iotDisconnect(); go('#/devices'); } },
      h('span', { style: { transform: 'rotate(180deg)', display: 'inline-flex' } }, icon('chevron'))),
    h('h1', { class: 'title' }, dev.name),
    statusChip(dev.online === 1),
    dev.model ? h('span', { class: 'meta' }, dev.model) : null,
    dev.firmware ? h('span', { class: 'meta' }, 'v' + dev.firmware) : null,
  );
  shell(header, tabBar, panel);
  renderTabs(); renderPanel();
}

function comingSoon(name) {
  const box = h('div', { class: 'glass empty', style: { marginTop: '0' } });
  box.appendChild(icon('gear', 46));
  box.appendChild(h('div', { class: 'faint' }, `${name} · 即将上线`));
  box.appendChild(h('div', { class: 'faint', style: { fontSize: '12px' } }, '需 AWS 侧开通 KVS / IoT 权限后启用'));
  return box;
}

// 参数设置(IoT)：先用 getDeviceGeneralInfo 做一次往返,验证 AWS IoT 通道打通
function paramsPanel(dev) {
  if (!dev.uuid) {
    const b = h('div', { class: 'glass empty' });
    b.appendChild(icon('gear', 44));
    b.appendChild(h('div', { class: 'faint' }, '该设备缺少 UUID(deviceGeneralInformation.deviceUuid),无法通过 IoT 通信'));
    return b;
  }
  const status = h('span', { class: 'muted', style: { fontSize: '13px' } }, '未连接');
  const out = h('pre', { class: 'glass', style: { marginTop: '14px', padding: '14px 16px', fontSize: '12px', lineHeight: '1.6', color: 'var(--text-md)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '420px', overflow: 'auto', fontFamily: 'var(--font-display)' } }, '点「读取设备信息」发起一次 AWS IoT 往返(getDeviceGeneralInformationCommand)。');
  const btn = h('button', { class: 'gbtn primary' }, '读取设备信息');
  async function run() {
    btn.disabled = true; status.textContent = '连接 IoT…';
    mount(out, loading('等待设备应答(经 AWS IoT MQTT-over-WSS)…'));
    try {
      const t0 = performance.now();
      const resp = await iotSend(dev.uuid, 'getDeviceGeneralInformationCommand', {});
      const ms = Math.round(performance.now() - t0);
      status.textContent = `已连接 · 往返 ${ms}ms`;
      out.textContent = JSON.stringify(resp, null, 2);
    } catch (e) {
      status.textContent = '失败';
      mount(out, errorBox('IoT 往返失败', e));
    } finally { btn.disabled = false; }
  }
  btn.addEventListener('click', run);
  const bar = h('div', { class: 'glass', style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' } },
    icon('gear'), h('span', { style: { fontWeight: 700, fontSize: '14px' } }, '设备参数 · AWS IoT'),
    h('span', { class: 'meta' }, 'UUID ' + dev.uuid), h('span', { style: { flex: 1 } }), status, btn);
  return h('div', {}, bar, out);
}

// 云端回放:日期 → 录像列表(时间轴)→ 点选播放 HLS
function cloudPlayback(dev) {
  const video = h('video', { controls: true, playsinline: true });
  const player = h('div', { class: 'player' },
    h('div', { class: 'ph' }, icon('touch', 46), h('div', {}, '选择下方录像片段播放')));
  const listBox = h('div', { class: 'glass', style: { marginTop: '14px', padding: '10px 14px', maxHeight: '440px', overflow: 'auto' } });
  const dateInput = h('input', { type: 'date', value: todayStr(),
    style: { height: '38px', padding: '0 10px', borderRadius: '10px', background: 'rgba(5,7,14,.5)', border: '1px solid var(--border)', color: 'var(--text-hi)', fontFamily: 'inherit' } });
  const countChip = h('span', { class: 'chip count' }, '0');
  const bar = h('div', { class: 'glass', style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px' } },
    icon('cloud'), h('span', { class: 'muted', style: { fontSize: '13px' } }, '云端录像'),
    dateInput, countChip, h('span', { class: 'spacer', style: { flex: 1 } }));

  async function load() {
    mount(listBox, loading('查询云端录像…'));
    try {
      const [s, e] = dayRange(dateInput.value);
      const recs = await fetchCloudRecords(dev.id, s, e);
      countChip.textContent = String(recs.length);
      if (!recs.length) { mount(listBox, emptyState('这一天没有云端录像')); return; }
      const rows = recs.map((r) => recRow(dev, r));
      mount(listBox, h('div', { class: 'rec-list' }, ...rows));
    } catch (err) {
      mount(listBox, errorBox('录像查询失败', err));
    }
  }
  function recRow(dev, rec) {
    const chips = [];
    if (rec.resolution) chips.push(h('span', { class: 'meta' }, rec.resolution));
    if (rec.channel != null) chips.push(h('span', { class: 'meta' }, 'CH' + rec.channel));
    if (rec.duration) chips.push(h('span', { class: 'meta' }, rec.duration + 's'));
    const end = h('div', { class: 'end' },
      h('div', { style: { fontWeight: 700, fontSize: '13px' } }, fmtTime(rec.dateTime)),
      h('div', { style: { marginTop: '4px' } }, ...chips));
    const row = h('div', { class: 'rec' }, h('div', { class: 'time' }, fmtTime(rec.dateTime)),
      h('div', { class: 'rail' }, h('div', { class: 'node' })), end);
    end.addEventListener('click', async () => {
      document.querySelectorAll('.rec.on').forEach((x) => x.classList.remove('on'));
      row.classList.add('on');
      mount(player, video); // 用 <video> 替换占位
      try {
        const startIso = rec.dateTime;
        const endIso = new Date(new Date(rec.dateTime).getTime() + (parseInt(rec.duration || '60', 10) * 1000)).toISOString();
        const url = await getHlsUrl(dev.id, { startIso, endIso });
        playHls(video, url);
      } catch (err) {
        mount(player, errorBox('无法获取回放地址', err));
      }
    });
    return row;
  }
  dateInput.addEventListener('change', load);
  load();
  return h('div', {}, player, bar, listBox);
}

function errorBox(title, e) {
  const msg = (e && e.message) || String(e);
  const hint = /403|not authorized|AccessDenied|credential/i.test(msg)
    ? ' — 可能是 AWS 侧未给 Identity Pool 授权(KVS/IoT),见部署说明' : '';
  return h('div', { class: 'err show', style: { display: 'block' } },
    h('div', { style: { fontWeight: 700, marginBottom: '4px' } }, title),
    h('div', { style: { fontSize: '12px', opacity: .85 } }, msg + hint));
}

// ── 路由 ─────────────────────────────────────────────────────────────────────
function route() {
  const hash = location.hash || '#/devices';
  if (!state.session && hash !== '#/login') { go('#/login'); return; }
  if (hash === '#/login') { if (state.session) { go('#/devices'); return; } return viewLogin(); }
  const m = hash.match(/^#\/device\/(.+)$/);
  if (m) return viewDevice(decodeURIComponent(m[1]));
  return viewDevices();
}
window.addEventListener('hashchange', route);

// ── 启动:首屏立即渲染登录页(不再黑屏空等 restoreSession + esm.sh 导入),会话在后台恢复 ──
(async function boot() {
  if (!location.hash) location.hash = '#/login';
  route();   // 先按当前 hash 渲染(未登录 → 立即出登录页)
  try {
    const s = await restoreSession();   // 后台恢复 Cognito 会话
    if (s && s.userRow) {
      state.session = s;
      // 恢复到会话且用户还停在登录页/根 → 自动进设备列表
      if (location.hash === '#/login' || !location.hash) go('#/devices');
    }
  } catch (_) {}
})();
