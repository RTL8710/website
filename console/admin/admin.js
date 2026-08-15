// 云端管理后台 — 顶级客户向：功能完整、路径最短
import {
  COGNITO, IOT_ENDPOINT, S3_BUCKET, APPSYNC, getRegion, setRegion, REGIONS, REGION_ORDER, isAdminAccount,
} from '../config.js';
import { signIn, restoreSession, resolvedCreds, signOut, warmupAuth } from '../lib/auth.js';
import {
  listAllUsers, listAllDevices, listAllDeviceUsers, listDeviceUpgrades,
  listCloudRecordsAdmin, createDeviceUpgrade,
} from '../lib/graphql.js';
import { putS3Object, presignS3Get } from '../lib/sigv4.js';
import { sendCommand as iotSend, disconnect as iotDisconnect } from '../lib/iot-rpc.js';
import { h, mount, loading, emptyState } from '../lib/ui.js';

const app = document.getElementById('app');
const state = {
  session: null,
  tab: 'overview',
  users: null,
  devices: null,
  binds: null,
  packages: null,
  records: null,
  recordsMeta: null,
  q: '',
  deviceFilter: 'all', // all | online | offline
  recDeviceId: '',
  recDays: 7,
  pkgFilterType: '',
  toast: null,
  confirm: null,
  upload: {
    file: null, deviceType: 'smartRobot', partition: 'system', version: '',
    describe: '', upgradeType: 'AHS', mode: 'normal', progress: 0, busy: false, msg: '', err: '',
  },
  upgrade: { deviceId: '', packageId: '', partition: '', busy: false, msg: '', err: '' },
  loadingTab: false,
};

const TABS = [
  { id: 'overview', icon: 'fa-gauge-high', label: '总览' },
  { id: 'users', icon: 'fa-users', label: '用户' },
  { id: 'devices', icon: 'fa-robot', label: '设备' },
  { id: 'records', icon: 'fa-cloud', label: '云录像' },
  { id: 'ota', icon: 'fa-rocket', label: 'OTA' },
];

function fa(cls) { return h('i', { class: 'fa-solid ' + cls }); }
function chip(text, cls) { return h('span', { class: 'chip ' + (cls || 'count') }, text); }
function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function shortId(id) {
  if (!id) return '—';
  const s = String(id);
  return s.length > 14 ? s.slice(0, 8) + '…' + s.slice(-4) : s;
}
function matchQ(fields) {
  const q = (state.q || '').trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(f || '').toLowerCase().includes(q));
}
function toast(msg, type = 'ok') {
  state.toast = { msg, type, t: Date.now() };
  render();
  setTimeout(() => {
    if (state.toast && Date.now() - state.toast.t >= 2800) { state.toast = null; render(); }
  }, 3000);
}
function copyText(t) {
  const s = String(t || '');
  if (!s) return;
  navigator.clipboard.writeText(s).then(() => toast('已复制')).catch(() => toast('复制失败', 'err'));
}
function copyable(text, title) {
  return h('span', {
    class: 'mono copy', title: title || text,
    onclick: (e) => { e.stopPropagation(); copyText(text); },
  }, shortId(text));
}
function inferPart(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return '';
  if (n.includes('robot_all') || n.includes('_all_') || /(^|[._-])all([._-]|$)/.test(n)) return 'all';
  if (n.includes('website')) return 'website';
  if (n.includes('model')) return 'model';
  if (n.includes('config')) return 'config';
  if (n.includes('system')) return 'system';
  return '';
}
function inferVer(name) {
  const m = String(name || '').match(/v?(\d+\.\d+(?:\.\d+)?)/i);
  return m ? m[1] : '';
}
function looksRobot(name) {
  const n = String(name || '').toLowerCase();
  return n.startsWith('robot_') || n.includes('smartrobot')
    || ((n.endsWith('.tar.gz') || n.endsWith('.tgz')) && n.includes('robot'));
}
function ownerName(ownerUserId) {
  if (!ownerUserId || !state.users) return shortId(ownerUserId);
  const u = state.users.find((x) => x.awsUserID === ownerUserId || x.id === ownerUserId);
  return (u && (u.awsUserName || u.email)) || shortId(ownerUserId);
}
function bindUsersForDevice(deviceId) {
  return (state.binds || []).filter((b) => b.deviceId === deviceId || (b.device && b.device.id === deviceId));
}
function latestPackageForType(deviceType) {
  const t = deviceType || 'smartRobot';
  return (state.packages || []).find((p) => (p.upgradeDeviceType || 'smartRobot') === t) || null;
}
function resolveDeviceType(dev) {
  if (!dev) return 'smartRobot';
  const m = String(dev.model || '').toLowerCase();
  if (m.includes('ipc') || m.includes('camera')) return 'smartIpcamera';
  if (dev.deviceType != null) {
    const dt = String(dev.deviceType);
    if (dt === '1' || dt.toLowerCase().includes('ipc')) return 'smartIpcamera';
  }
  return 'smartRobot';
}

function topbar() {
  const u = state.session;
  return h('div', { class: 'topbar' },
    h('div', { class: 'in', style: { maxWidth: 'none' } },
      h('a', { class: 'brand', href: '../index.html#/devices' }, h('span', { class: 'b' }), '云端管理后台'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted', style: { fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' } },
        fa('fa-user-shield'),
        (u && (u.account || (u.userRow && u.userRow.awsUserName) || u.email)) || '',
        h('span', { class: 'chip', style: { fontSize: '10.5px', padding: '2px 8px', background: 'var(--acc-soft)', color: 'var(--accent)', border: '1px solid var(--acc-soft-bd)' } },
          (REGIONS[getRegion()] && REGIONS[getRegion()].label) || getRegion())),
      h('a', { class: 'gbtn btn-sm', href: '../index.html#/devices', style: { textDecoration: 'none' } }, fa('fa-arrow-left'), ' 控制台'),
      h('button', { class: 'gbtn icon', title: '退出', onclick: async () => { iotDisconnect(); await signOut(); state.session = null; viewLogin(); } },
        fa('fa-right-from-bracket')),
    ),
  );
}

function shell(body) {
  const nav = h('div', { class: 'admin-nav' }, ...TABS.map((t) => h('button', {
    class: state.tab === t.id ? 'active' : '',
    onclick: () => goTab(t.id),
  }, fa(t.icon), t.label)));
  const side = h('aside', { class: 'admin-side' },
    h('div', { class: 'logo' }, h('span', { class: 'b' }), 'Admin'),
    nav,
    h('div', { class: 'faint', style: { fontSize: '11px', padding: '18px 10px 0', lineHeight: '1.55' } },
      '最短路径：设备 → 升级到最新', h('br'), '或 OTA 页上传后一键下发'),
  );
  const toastEl = state.toast
    ? h('div', { class: 'toast-host' }, h('div', { class: 'toast ' + state.toast.type }, state.toast.msg))
    : null;
  const modal = state.confirm ? renderConfirm() : null;
  return mount(app, topbar(), h('div', { class: 'admin-shell' }, side, h('main', { class: 'admin-main' }, body)), toastEl, modal);
}

function goTab(id) {
  state.tab = id;
  state.q = '';
  render();
  loadTab(id);
}

function searchBox(ph) {
  const inp = h('input', { type: 'search', placeholder: ph || '搜索…', value: state.q, style: { minWidth: '200px', flex: '1' } });
  inp.addEventListener('input', () => { state.q = inp.value; render(); });
  return inp;
}

async function refreshAll() {
  state.users = state.devices = state.binds = state.packages = state.records = null;
  state.recordsMeta = null;
  await loadTab(state.tab);
  toast('数据已刷新');
}

async function ensure(kind) {
  if (kind === 'users' && !state.users) state.users = await listAllUsers();
  if (kind === 'devices') {
    if (!state.devices) {
      try {
        state.devices = await listAllDevices();
      } catch (e) {
        state.devices = [];
        throw e;
      }
    }
    if (!state.binds) {
      try { state.binds = await listAllDeviceUsers(); } catch (_) { state.binds = []; }
    }
    if (!state.users) {
      try { state.users = await listAllUsers(); } catch (_) {}
    }
  }
  if (kind === 'packages' && !state.packages) state.packages = await listDeviceUpgrades();
  if (kind === 'records' && state.records == null) await loadRecords();
}

async function loadRecords() {
  const days = Math.max(1, Number(state.recDays) || 7);
  const end = new Date();
  const start = new Date(Date.now() - days * 864e5);
  const filter = { and: [{ dateTime: { between: [start.toISOString(), end.toISOString()] } }] };
  if (state.recDeviceId.trim()) filter.and.push({ deviceID: { eq: state.recDeviceId.trim() } });
  const res = await listCloudRecordsAdmin({ filter, limit: 200, maxPages: 15 });
  state.records = res.items;
  state.recordsMeta = res;
}

async function loadTab(id) {
  state.loadingTab = true;
  state._err = '';
  render();
  try {
    if (id === 'overview') {
      await Promise.all([
        ensure('users'), ensure('devices'), ensure('packages'),
      ]);
      if (state.records == null) {
        try { await loadRecords(); } catch (_) { state.records = []; }
      }
    } else if (id === 'users') await ensure('users');
    else if (id === 'devices') { await ensure('devices'); await ensure('packages'); }
    else if (id === 'records') { await ensure('devices'); await ensure('records'); }
    else if (id === 'ota') { await ensure('devices'); await ensure('packages'); }
  } catch (e) {
    console.error('[admin]', id, e);
    state._err = (e && e.message) || String(e);
    toast(state._err, 'err');
  } finally {
    state.loadingTab = false;
    render();
  }
}

function tableWrap(headers, rows) {
  if (!rows.length) return emptyState('无匹配数据');
  return h('div', { class: 'glass admin-table-wrap' },
    h('table', { class: 'admin-table' },
      h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, ...rows.map((cells) => h('tr', {}, ...cells.map((c) => h('td', {}, c))))),
    ),
  );
}

function viewOverview() {
  const u = (state.users || []).length;
  const d = (state.devices || []).length;
  const online = (state.devices || []).filter((x) => x.online).length;
  const p = (state.packages || []).length;
  const r = (state.records || []).length;
  const trunc = state.recordsMeta && state.recordsMeta.truncated;
  const latest = (state.packages || [])[0];
  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, '总览'), chip(getRegion().toUpperCase())),
    h('div', { class: 'admin-sub' }, 'Amplify 全库数据 · 远程 OTA 与 App 同协议'),
    state._err ? h('div', { class: 'admin-msg err' }, state._err) : null,
    h('div', { class: 'admin-grid-stats' },
      stat('用户', u, () => goTab('users')),
      stat('设备', d, () => goTab('devices')),
      stat('在线', online, () => { state.deviceFilter = 'online'; goTab('devices'); }),
      stat('升级包', p, () => goTab('ota')),
      stat('云录像', r + (trunc ? '+' : ''), () => goTab('records')),
    ),
    h('div', { class: 'glass admin-panel' },
      h('div', { style: { fontWeight: 800, marginBottom: '6px' } }, '常用操作'),
      h('div', { class: 'faint', style: { fontSize: '12.5px', marginBottom: '12px' } },
        latest
          ? `云端最新包：${latest.upgradeDeviceType} v${latest.upgradeDeviceVersion || '?'} · ${latest.upgradeDevicePartion || ''} · ${latest.upgradeDescribe || ''}`
          : '暂无升级包，请先在 OTA 页上传'),
      h('div', { class: 'row-actions' },
        h('button', { class: 'gbtn primary', onclick: () => goTab('devices') }, fa('fa-rocket'), ' 升级设备'),
        h('button', { class: 'gbtn', onclick: () => goTab('ota') }, fa('fa-upload'), ' 上传升级包'),
        h('button', { class: 'gbtn', onclick: () => refreshAll() }, fa('fa-rotate'), ' 刷新'),
      ),
    ),
  );
}
function stat(k, v, onClick) {
  return h('div', { class: 'glass stat-card', onclick: onClick },
    h('div', { class: 'k' }, k), h('div', { class: 'v num' }, String(v)));
}

function viewUsers() {
  const rows = (state.users || []).filter((u) => matchQ([u.awsUserName, u.email, u.phoneNumber, u.id, u.awsUserID, u.region]));
  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, '用户'), chip(String(rows.length))),
    h('div', { class: 'admin-sub' }, 'User 表全量 · 点击 ID 可复制'),
    h('div', { class: 'admin-toolbar' },
      searchBox('用户名 / 邮箱 / ID…'),
      h('button', { class: 'gbtn btn-sm', onclick: async () => { state.users = null; await loadTab('users'); } }, '刷新')),
    state.loadingTab || !state.users ? loading('加载用户…') : tableWrap(
      ['用户名', '邮箱', '手机', '区域', 'User.id', 'Cognito', '更新'],
      rows.map((u) => [
        u.awsUserName || '—', u.email || '—', u.phoneNumber || '—', u.region || '—',
        copyable(u.id), copyable(u.awsUserID), fmt(u.updatedAt),
      ]),
    ),
  );
}

function viewDevices() {
  let rows = state.devices || [];
  if (state.deviceFilter === 'online') rows = rows.filter((d) => d.online);
  if (state.deviceFilter === 'offline') rows = rows.filter((d) => !d.online);
  rows = rows.filter((d) => matchQ([d.name, d.model, d.uuid, d.id, d.firmware, d.ownerUserId, ownerName(d.ownerUserId)]));

  const seg = h('div', { class: 'seg' },
    ...[['all', '全部'], ['online', '在线'], ['offline', '离线']].map(([k, lab]) => h('button', {
      class: state.deviceFilter === k ? 'on' : '',
      onclick: () => { state.deviceFilter = k; render(); },
    }, lab)));

  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, '设备'), chip(String(rows.length)),
      chip(`${(state.devices || []).filter((d) => d.online).length} 在线`, 'stat-online')),
    h('div', { class: 'admin-sub' }, '点「升级到最新」= 自动选对应机型最新包并确认下发'),
    h('div', { class: 'admin-toolbar' },
      searchBox('名称 / UUID / 型号 / 所有者…'), seg,
      h('button', { class: 'gbtn btn-sm', onclick: async () => { state.devices = state.binds = null; await loadTab('devices'); } }, '刷新')),
    (() => {
      if (state.loadingTab && !state.devices) return loading('加载设备…');
      if (state._err && !(state.devices && state.devices.length)) {
        return h('div', {},
          h('div', { class: 'admin-msg err' }, state._err),
          h('button', { class: 'gbtn', style: { marginTop: '10px' },
            onclick: async () => { state.devices = null; state._err = ''; await loadTab('devices'); } }, '重试'));
      }
      if (!state.devices) return loading('加载设备…');
      return tableWrap(
        ['状态', '名称', '型号', '版本', 'UUID', '所有者', '绑定', '操作'],
        rows.map((d) => {
          const binds = bindUsersForDevice(d.id);
          const latest = latestPackageForType(resolveDeviceType(d));
          return [
            d.online ? chip('在线', 'stat-online') : chip('离线', 'stat-offline'),
            d.name || '—',
            d.model || '—',
            d.firmware ? ('v' + d.firmware) : '—',
            d.uuid ? copyable(d.uuid) : h('span', { class: 'faint' }, '无 UUID'),
            ownerName(d.ownerUserId),
            String(binds.length),
            h('div', { class: 'row-actions' },
              h('button', { class: 'gbtn btn-sm', onclick: () => openDevice(d) }, '进入'),
              h('button', {
                class: 'gbtn primary btn-sm',
                disabled: !d.uuid || !latest,
                title: !d.uuid ? '缺少 deviceUuid' : (!latest ? '无可用升级包' : `升级到 ${latest.upgradeDeviceVersion}`),
                onclick: () => askUpgradeLatest(d),
              }, '升级到最新'),
            ),
          ];
        }),
      );
    })(),
  );
}

function askUpgradeLatest(dev) {
  const pkg = latestPackageForType(resolveDeviceType(dev));
  if (!pkg) { toast('没有可用升级包', 'err'); return; }
  if (!dev.uuid) { toast('设备缺少 deviceUuid', 'err'); return; }
  state.confirm = {
    title: '确认远程升级',
    body: `设备：${dev.name || dev.id}\n当前版本：${dev.firmware || '?'}\n目标：${pkg.upgradeDeviceType} v${pkg.upgradeDeviceVersion}（${pkg.upgradeDevicePartion || 'system'}）\n说明：${pkg.upgradeDescribe || '—'}\n\n设备需在线。确认后立即经 AWS IoT 下发。`,
    okText: '确认升级',
    onOk: async () => {
      state.confirm = null;
      state.upgrade.deviceId = dev.id;
      state.upgrade.packageId = pkg.id;
      state.upgrade.partition = pkg.upgradeDevicePartion || 'system';
      render();
      await doRemoteUpgrade();
    },
  };
  render();
}

function renderConfirm() {
  const c = state.confirm;
  return h('div', { class: 'modal-mask', onclick: (e) => { if (e.target === e.currentTarget) { state.confirm = null; render(); } } },
    h('div', { class: 'glass modal' },
      h('h3', {}, c.title),
      h('div', { class: 'body', style: { whiteSpace: 'pre-wrap' } }, c.body),
      h('div', { class: 'row-actions', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'gbtn', onclick: () => { state.confirm = null; render(); } }, '取消'),
        h('button', { class: 'gbtn primary', onclick: () => c.onOk && c.onOk() }, c.okText || '确认'),
      ),
    ),
  );
}

async function openDevice(dev) {
  const uuid = dev.uuid || dev.id;
  if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) { toast('设备 UUID 无效', 'err'); return; }
  try {
    const c = await resolvedCreds();
    sessionStorage.setItem('iot_creds', JSON.stringify({
      accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken,
      region: COGNITO.region, endpoint: IOT_ENDPOINT, s3Bucket: S3_BUCKET,
      appsyncEndpoint: APPSYNC.endpoint, appsyncApiKey: APPSYNC.apiKey,
    }));
    sessionStorage.setItem('dv_auth', '1');
    sessionStorage.setItem('dv_user', (state.session.userRow && state.session.userRow.awsUserName) || state.session.account || 'admin');
    location.href = '../device/index.html?deviceId=' + encodeURIComponent(uuid);
  } catch (e) { toast('进入失败: ' + ((e && e.message) || e), 'err'); }
}

function viewRecords() {
  const rows = (state.records || []).filter((r) => matchQ([r.deviceID, r.id, r.resolution, r.type, String(r.channel)]));
  const deviceSel = h('select', {},
    h('option', { value: '' }, '全部设备'),
    ...(state.devices || []).map((d) => h('option', { value: d.id, selected: state.recDeviceId === d.id },
      `${d.name || d.id}`)));
  deviceSel.addEventListener('change', () => { state.recDeviceId = deviceSel.value; });
  const days = h('select', {},
    ...[1, 3, 7, 14, 30].map((n) => h('option', { value: String(n), selected: Number(state.recDays) === n }, `近 ${n} 天`)));
  days.addEventListener('change', () => { state.recDays = Number(days.value); });

  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, '云录像'), chip(String(rows.length)),
      (state.recordsMeta && state.recordsMeta.truncated) ? chip('结果已截断', 'stat-offline') : null),
    h('div', { class: 'admin-sub' }, '默认近 7 天，避免全表扫描'),
    h('div', { class: 'admin-toolbar' },
      searchBox('deviceID / 分辨率…'), deviceSel, days,
      h('button', { class: 'gbtn primary btn-sm', onclick: async () => {
        state.records = null; render();
        try { await loadRecords(); toast(`查到 ${(state.records || []).length} 条`); }
        catch (e) { toast(e.message, 'err'); }
        render();
      } }, '查询')),
    state.records == null ? loading('加载云录像…') : tableWrap(
      ['时间', '设备', '时长', '通道', '分辨率', '类型', '缩略图'],
      rows.slice(0, 500).map((r) => [
        fmt(r.dateTime), copyable(r.deviceID),
        (r.duration || '—') + (r.duration ? 's' : ''),
        r.channel != null ? String(r.channel) : '—',
        r.resolution || '—', r.type || '—',
        r.thumbnailUrl ? h('button', { class: 'gbtn btn-sm', onclick: async () => {
          try {
            const c = await resolvedCreds();
            let raw = r.thumbnailUrl;
            if (!/^https?:/.test(raw)) raw = `https://${S3_BUCKET}.s3.${COGNITO.region}.amazonaws.com/${String(raw).replace(/^\/+/, '')}`;
            window.open(presignS3Get(Object.assign({ region: COGNITO.region }, c), raw), '_blank');
          } catch (e) { toast(e.message, 'err'); }
        } }, '打开') : '—',
      ]),
    ),
  );
}

function viewOta() {
  const u = state.upload;
  const ug = state.upgrade;
  const devices = state.devices || [];
  const packages = state.packages || [];
  let list = packages;
  if (state.pkgFilterType) list = list.filter((p) => p.upgradeDeviceType === state.pkgFilterType);
  list = list.filter((p) => matchQ([p.upgradeDeviceVersion, p.upgradeDescribe, p.upgradeFileUrl, p.upgradeDeviceType, p.upgradeDevicePartion]));

  const fileInput = h('input', { type: 'file' }); // 不设 accept：Chrome 对 .tar.gz 的 accept 过滤常误伤
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    u.file = f || null;
    if (f) {
      if (looksRobot(f.name)) u.deviceType = 'smartRobot';
      const part = inferPart(f.name); if (part) u.partition = part;
      const ver = inferVer(f.name); if (ver) u.version = ver;
      if (!u.describe) u.describe = f.name;
    }
    render();
  });
  const typeSel = h('select', {}, ...['smartRobot', 'smartIpcamera'].map((t) => h('option', { value: t, selected: u.deviceType === t }, t)));
  typeSel.addEventListener('change', () => { u.deviceType = typeSel.value; });
  const partSel = h('select', {}, ...['system', 'website', 'model', 'config', 'all'].map((t) => h('option', { value: t, selected: u.partition === t }, t)));
  partSel.addEventListener('change', () => { u.partition = partSel.value; });
  const verIn = h('input', { value: u.version, placeholder: '1.0.27' });
  verIn.addEventListener('input', () => { u.version = verIn.value; });
  const descIn = h('textarea', { placeholder: '升级说明' }, u.describe);
  descIn.addEventListener('input', () => { u.describe = descIn.value; });

  const onlineDevs = devices.filter((d) => d.online);
  const onlineReady = devices.filter((d) => d.online && d.uuid);
  const devSel = h('select', { style: { width: '100%' } },
    h('option', { value: '' }, `选择设备（在线 ${onlineDevs.length}，可升级 ${onlineReady.length}）…`),
    ...devices.map((d) => h('option', { value: d.id, selected: ug.deviceId === d.id },
      `${d.online ? '●' : '○'} ${d.name || shortId(d.id)} · v${d.firmware || '?'} ${d.uuid ? '' : '·缺UUID'}`)));
  devSel.addEventListener('change', () => {
    ug.deviceId = devSel.value;
    const d = devices.find((x) => x.id === ug.deviceId);
    if (d) {
      const latest = latestPackageForType(resolveDeviceType(d));
      if (latest) { ug.packageId = latest.id; ug.partition = latest.upgradeDevicePartion || ''; }
    }
    render();
  });
  const pkgSel = h('select', { style: { width: '100%' } },
    h('option', { value: '' }, '选择升级包…'),
    ...packages.slice(0, 80).map((p) => h('option', { value: p.id, selected: ug.packageId === p.id },
      `${p.upgradeDeviceType} v${p.upgradeDeviceVersion || '?'} · ${p.upgradeDevicePartion || '?'} · ${p.upgradeDescribe || ''}`)));
  pkgSel.addEventListener('change', () => {
    ug.packageId = pkgSel.value;
    const p = packages.find((x) => x.id === ug.packageId);
    if (p) ug.partition = p.upgradeDevicePartion || '';
    render();
  });
  const partOver = h('select', {},
    ...['', 'system', 'website', 'model', 'config', 'all'].map((t) => h('option', { value: t, selected: (ug.partition || '') === t }, t || '跟随升级包')));
  partOver.addEventListener('change', () => { ug.partition = partOver.value; });

  const filterType = h('select', {},
    h('option', { value: '' }, '全部机型'),
    ...['smartRobot', 'smartIpcamera'].map((t) => h('option', { value: t, selected: state.pkgFilterType === t }, t)));
  filterType.addEventListener('change', () => { state.pkgFilterType = filterType.value; render(); });

  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, 'OTA'), chip(String(packages.length) + ' 包')),
    h('div', { class: 'admin-sub' }, '上传与远程升级合在一页 · 协议对齐 App CLOUD_ONLY'),
    h('div', { class: 'ota-grid' },
      h('div', { class: 'glass admin-panel' },
        h('div', { class: 'step' }, h('b', {}, '1'), '上传升级包到云端'),
        h('div', { class: 'admin-form' },
          h('div', { class: 'admin-field span2' }, h('label', {}, '文件'), fileInput,
            h('div', { class: 'faint', style: { marginTop: '4px' } },
              u.file ? `${u.file.name} (${Math.round(u.file.size / 1024)} KB)` : '支持 robot_*.tar.gz / .tgz（选不到时改用「所有文件」）')),
          h('div', { class: 'admin-field' }, h('label', {}, '机型'), typeSel),
          h('div', { class: 'admin-field' }, h('label', {}, '分区'), partSel),
          h('div', { class: 'admin-field' }, h('label', {}, '版本'), verIn),
          h('div', { class: 'admin-field span2' }, h('label', {}, '说明'), descIn),
        ),
        h('div', { class: 'progress' }, h('i', { style: { width: (u.progress || 0) + '%' } })),
        h('div', { class: 'row-actions', style: { marginTop: '12px' } },
          h('button', { class: 'gbtn primary', disabled: u.busy, onclick: () => doUpload() },
            u.busy ? `上传中 ${u.progress}%` : '上传并登记')),
        u.msg ? h('div', { class: 'admin-msg ok' }, u.msg) : null,
        u.err ? h('div', { class: 'admin-msg err' }, u.err) : null,
      ),
      h('div', { class: 'glass admin-panel' },
        h('div', { class: 'step' }, h('b', {}, '2'), '选择设备与包，一键下发'),
        h('div', { class: 'admin-form' },
          h('div', { class: 'admin-field span2' }, h('label', {}, '设备'), devSel),
          h('div', { class: 'admin-field span2' }, h('label', {}, '升级包'), pkgSel),
          h('div', { class: 'admin-field' }, h('label', {}, '分区覆盖'), partOver),
        ),
        h('div', { class: 'row-actions', style: { marginTop: '12px' } },
          h('button', {
            class: 'gbtn primary', disabled: ug.busy,
            onclick: () => {
              const dev = devices.find((d) => d.id === ug.deviceId);
              const pkg = packages.find((p) => p.id === ug.packageId);
              if (!dev || !pkg) { toast('请先选择设备和升级包', 'err'); return; }
              state.confirm = {
                title: '确认远程升级',
                body: `设备：${dev.name}\n包：v${pkg.upgradeDeviceVersion} ${pkg.upgradeDevicePartion || ''}\n${pkg.upgradeDescribe || ''}`,
                okText: '确认升级',
                onOk: async () => { state.confirm = null; render(); await doRemoteUpgrade(); },
              };
              render();
            },
          }, ug.busy ? '下发中…' : '一键远程升级')),
        ug.msg ? h('div', { class: 'admin-msg ok' }, ug.msg) : null,
        ug.err ? h('div', { class: 'admin-msg err' }, ug.err) : null,
        h('div', { class: 'admin-msg info' }, 'S3 预签名 2h → IoT setRemoteOtaServiceCommand（与 App / 设备页一致）'),
      ),
    ),
    h('div', { class: 'admin-toolbar', style: { marginTop: '8px' } },
      searchBox('搜包版本 / 说明…'), filterType,
      h('button', { class: 'gbtn btn-sm', onclick: async () => { state.packages = null; await loadTab('ota'); } }, '刷新列表')),
    !state.packages ? loading('加载升级包…') : tableWrap(
      ['时间', '机型', '版本', '分区', '说明', 'S3', '操作'],
      list.slice(0, 100).map((p) => [
        fmt(p.upgradeOtaTime || p.createdAt),
        p.upgradeDeviceType || '—', p.upgradeDeviceVersion || '—', p.upgradeDevicePartion || '—',
        p.upgradeDescribe || '—',
        copyable(p.upgradeFileUrl, p.upgradeFileUrl),
        h('button', { class: 'gbtn primary btn-sm', onclick: () => {
          ug.packageId = p.id; ug.partition = p.upgradeDevicePartion || '';
          toast('已选中升级包，请在上方选设备');
          render();
        } }, '选用'),
      ]),
    ),
  );
}

async function doUpload() {
  const u = state.upload;
  u.err = ''; u.msg = '';
  if (!u.file) { u.err = '请选择文件'; render(); return; }
  if (!u.version.trim()) { u.err = '请填写版本'; render(); return; }
  if (!u.describe.trim()) { u.err = '请填写说明'; render(); return; }
  u.busy = true; u.progress = 0; render();
  try {
    const creds = await resolvedCreds();
    if (!creds.accessKeyId) throw new Error('无临时凭证，请重新登录');
    const key = `public/${u.upgradeType}/${u.deviceType}/${u.file.name}`;
    await putS3Object(creds, {
      bucket: S3_BUCKET, region: COGNITO.region, key, body: u.file,
      contentType: 'application/octet-stream',
      onProgress: (p) => { u.progress = p; render(); },
    });
    const created = await createDeviceUpgrade({
      upgradeMode: u.mode || 'normal',
      upgradeType: u.upgradeType || 'AHS',
      upgradeDeviceType: u.deviceType,
      upgradeDevicePartion: u.partition,
      upgradeDeviceVersion: u.version.trim(),
      upgradeDescribe: u.describe.trim(),
      upgradeFileUrl: key,
      upgradeOtaTime: new Date().toISOString(),
    });
    u.msg = `已登记 ${created && created.id ? shortId(created.id) : ''}`;
    u.file = null; u.progress = 100;
    state.packages = null;
    state.upgrade.packageId = created && created.id ? created.id : state.upgrade.packageId;
    toast('上传成功');
    await loadTab('ota');
  } catch (e) {
    console.error('[admin] upload', e);
    u.err = (e && e.message) || String(e);
    toast(u.err, 'err');
  } finally {
    u.busy = false; render();
  }
}

async function doRemoteUpgrade() {
  const ug = state.upgrade;
  ug.err = ''; ug.msg = '';
  const dev = (state.devices || []).find((d) => d.id === ug.deviceId);
  const pkg = (state.packages || []).find((p) => p.id === ug.packageId);
  if (!dev) { ug.err = '请选择设备'; toast(ug.err, 'err'); render(); return; }
  if (!pkg || !pkg.upgradeFileUrl) { ug.err = '请选择升级包'; toast(ug.err, 'err'); render(); return; }
  const uuid = dev.uuid;
  if (!uuid || !/^[0-9a-fA-F-]{36}$/.test(uuid)) {
    ug.err = '设备缺少 deviceUuid，无法 IoT 升级';
    toast(ug.err, 'err'); render(); return;
  }
  if (!dev.online) toast('设备当前离线，仍尝试下发…', 'err');
  ug.busy = true; render();
  try {
    const creds = await resolvedCreds();
    const raw = String(pkg.upgradeFileUrl).trim();
    let httpsUrl = raw;
    if (!/^https?:\/\//i.test(raw)) {
      const key = raw.replace(/^\/+/, '');
      const path = (key.indexOf('public/') === 0 ? key : 'public/' + key).split('/').map(encodeURIComponent).join('/');
      httpsUrl = `https://${S3_BUCKET}.s3.${COGNITO.region}.amazonaws.com/${path}`;
    }
    const signed = presignS3Get(Object.assign({ region: COGNITO.region }, creds), httpsUrl, 7200);
    if (!signed || signed.indexOf('X-Amz-') < 0) throw new Error('预签名失败');
    const part = (ug.partition || pkg.upgradeDevicePartion || 'system').trim() || 'system';
    const resp = await iotSend(uuid, 'setRemoteOtaServiceCommand', {
      remoteOtaService: {
        upgradeMode: pkg.upgradeMode || 'normal',
        upgradeType: pkg.upgradeType || 'AHS',
        upgradeFileUrl: signed,
        upgradeDeviceType: pkg.upgradeDeviceType || 'smartRobot',
        upgradeDeviceVersion: pkg.upgradeDeviceVersion || '',
        upgradeDevicePartion: part,
        upgradeDescribe: pkg.upgradeDescribe || '',
      },
    });
    ug.msg = `已下发 · status=${resp && resp.status}`;
    toast('远程升级命令已下发');
  } catch (e) {
    console.error('[admin] remote ota', e);
    ug.err = (e && e.message) || String(e);
    toast(ug.err, 'err');
  } finally {
    ug.busy = false; render();
  }
}

function render() {
  let body;
  if (state.tab === 'overview') body = viewOverview();
  else if (state.tab === 'users') body = viewUsers();
  else if (state.tab === 'devices') body = viewDevices();
  else if (state.tab === 'records') body = viewRecords();
  else body = viewOta();
  shell(body);
}

function regionLabel(rc) {
  return (REGIONS[rc] && REGIONS[rc].label) || rc;
}
function mapAuthError(e) {
  const m = (e && e.message) || '';
  if (/UserNotFound|does not exist|Incorrect username or password|NotAuthorized/i.test(m)) return '用户名或密码不正确';
  if (/UserNotConfirmed/i.test(m)) return '账号未验证,请先在 App 内完成验证';
  if (/Network|Failed to fetch/i.test(m)) return '网络错误,请重试';
  return m || '登录失败';
}

async function enterAdmin(session) {
  if (!session || !session.userRow) {
    viewLogin();
    return;
  }
  if (!isAdminAccount(session)) {
    viewDenied(session);
    return;
  }
  state.session = session;
  render();
  await loadTab('overview');
}

function viewDenied(session) {
  const account = (session && (session.account || (session.userRow && session.userRow.awsUserName) || session.email)) || '';
  mount(app, h('div', { class: 'center', style: { padding: '80px', textAlign: 'center' } },
    h('div', { class: 'glass', style: { padding: '28px 32px', maxWidth: '440px', margin: '0 auto' } },
      h('div', { style: { fontWeight: 800, fontSize: '18px', marginBottom: '8px' } }, '无管理后台权限'),
      h('div', { class: 'faint', style: { fontSize: '13px', lineHeight: '1.6', marginBottom: '16px' } },
        '当前账号 ', h('strong', {}, account || '—'),
        ' 不是运维白名单。管理后台须用独立运维账号(如 admin)登录,与 App 个人账号无关。请打开本页 ',
        h('code', {}, '/console/admin/'), ' 并用 ADMIN_ALLOWLIST 中的账号登录。'),
      h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' } },
        h('button', { class: 'gbtn primary', onclick: async () => { iotDisconnect(); await signOut(); state.session = null; viewLogin(); } },
          '退出并重新登录'),
        h('a', { class: 'gbtn btn-sm', href: '../index.html#/devices', style: { textDecoration: 'none', opacity: '0.75' } },
          '返回设备控制台'),
      ),
    )));
}

function viewLogin(preErr) {
  const username = h('input', {
    class: 'form-input', type: 'text', id: 'admin-username', placeholder: '运维账号(如 admin)',
    autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true,
  });
  const pass = h('input', {
    class: 'form-input', type: 'password', id: 'admin-password', placeholder: '密码',
    autocomplete: 'current-password', required: true,
  });
  const errMsg = h('span', {}, preErr || '');
  const err = h('div', { class: 'login-error' + (preErr ? ' show' : '') }, fa('fa-circle-exclamation'), errMsg);
  const btn = h('button', { type: 'submit', class: 'btn-login' }, '登录管理后台');
  async function submit(ev) {
    ev && ev.preventDefault();
    err.classList.remove('show');
    if (!username.value || !pass.value) {
      errMsg.textContent = '请输入用户名和密码';
      err.classList.add('show');
      return;
    }
    btn.disabled = true;
    btn.textContent = '登录中…';
    try {
      const session = await signIn(username.value.trim(), pass.value);
      await enterAdmin(session);
    } catch (e) {
      errMsg.textContent = mapAuthError(e);
      err.classList.add('show');
      btn.disabled = false;
      btn.textContent = '登录管理后台';
    }
  }
  mount(app,
    h('div', { class: 'center', style: { minHeight: '100vh', padding: '40px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      h('div', { class: 'glass', style: { padding: '28px 32px', width: '100%', maxWidth: '420px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' } },
          fa('fa-shield-halved'),
          h('div', { style: { fontWeight: 800, fontSize: '18px' } }, '云端管理后台'),
        ),
        h('div', { class: 'faint', style: { fontSize: '13px', lineHeight: '1.55', marginBottom: '18px' } },
          '独立入口 · 仅运维白名单账号。设备控制台无此入口。'),
        h('form', { onsubmit: submit },
          err,
          h('div', { class: 'admin-field', style: { marginBottom: '12px' } },
            h('label', {}, '区域'),
            h('div', { class: 'region-tabs' }, ...REGION_ORDER.map((rc) => h('button', {
              type: 'button',
              class: 'region-tab' + (getRegion() === rc ? ' active' : ''),
              onclick: () => { setRegion(rc); viewLogin(); },
            }, regionLabel(rc)))),
          ),
          h('div', { class: 'admin-field', style: { marginBottom: '12px' } },
            h('label', { for: 'admin-username' }, '用户名'),
            username,
          ),
          h('div', { class: 'admin-field', style: { marginBottom: '8px' } },
            h('label', { for: 'admin-password' }, '密码'),
            pass,
          ),
          btn,
        ),
        h('div', { style: { marginTop: '14px', textAlign: 'center' } },
          h('a', { class: 'faint', href: '../index.html#/devices', style: { fontSize: '12px', textDecoration: 'none' } },
            '前往设备控制台'),
        ),
      ),
    ),
  );
  username.focus();
}

(async function boot() {
  warmupAuth();
  mount(app, h('div', { class: 'center', style: { padding: '80px' } }, loading('恢复会话…')));
  let session = null;
  try { session = await restoreSession(); } catch (_) {}
  if (!session || !session.userRow) {
    viewLogin();
    return;
  }
  await enterAdmin(session);
})();

