// 控制台入口:路由 + 登录门禁 + 视图
import { COGNITO } from './config.js';
import { signIn, restoreSession, signOut, resolvedCreds } from './lib/auth.js';
import { fetchMyDevices, fetchCloudRecords } from './lib/graphql.js';
import { getHlsUrl, playHls, destroyHls } from './lib/kvs-hls.js';
import { sendCommand as iotSend, disconnect as iotDisconnect } from './lib/iot-rpc.js';
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

// ── 登录 ─────────────────────────────────────────────────────────────────────
function viewLogin() {
  const username = h('input', { type: 'text', placeholder: '用户名', autocomplete: 'username',
    autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const pass = h('input', { type: 'password', placeholder: '••••••••', autocomplete: 'current-password' });
  const err = h('div', { class: 'err' });
  const btn = h('button', { class: 'gbtn primary', style: { width: '100%', marginTop: '22px', height: '46px' } }, '登录');
  async function submit(ev) {
    ev && ev.preventDefault();
    err.classList.remove('show');
    if (!username.value || !pass.value) { err.textContent = '请输入用户名和密码'; err.classList.add('show'); return; }
    btn.disabled = true; btn.textContent = '登录中…';
    try {
      state.session = await signIn(username.value.trim(), pass.value);
      state.devices = null;
      go('#/devices');
    } catch (e) {
      err.textContent = mapAuthError(e); err.classList.add('show');
      btn.disabled = false; btn.textContent = '登录';
    }
  }
  const form = h('form', { class: 'glass card-lg', onsubmit: submit },
    h('h1', { class: 'title' }, '登录'),
    h('div', { class: 'sub' }, '用你的设备账号(用户名)登录,管理名下设备'),
    h('div', { class: 'field' }, h('label', {}, '用户名'), username),
    h('div', { class: 'field' }, h('label', {}, '密码'), pass),
    err, btn,
  );
  mount(app, h('div', { class: 'center' }, form));
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

// ── 设备列表 ─────────────────────────────────────────────────────────────────
async function viewDevices() {
  shell(loading('加载设备…'));
  try {
    if (!state.devices) state.devices = await fetchMyDevices(state.session.userRow.id);
    const list = state.devices;
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

// ── 启动:尝试恢复会话 ────────────────────────────────────────────────────────
(async function boot() {
  mount(app, h('div', { class: 'center' }, loading('启动中…')));
  try {
    const s = await restoreSession();
    if (s && s.userRow) state.session = s;
  } catch (_) {}
  if (!location.hash) location.hash = state.session ? '#/devices' : '#/login';
  route();
})();
