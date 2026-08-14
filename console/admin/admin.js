// 云端管理后台：Amplify 全表浏览 + OTA 上传 + 一键远程升级
import {
  COGNITO, IOT_ENDPOINT, S3_BUCKET, APPSYNC, getRegion, REGION_ORDER, REGIONS, isAdminAccount,
} from '../config.js';
import { restoreSession, resolvedCreds, signOut, warmupAuth } from '../lib/auth.js';
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
  recDeviceId: '',
  recDays: 7,
  pkgFilterType: '',
  upload: {
    file: null,
    deviceType: 'smartRobot',
    partition: 'system',
    version: '',
    describe: '',
    upgradeType: 'AHS',
    mode: 'normal',
    progress: 0,
    busy: false,
    msg: '',
    err: '',
  },
  upgrade: {
    deviceId: '',
    packageId: '',
    partition: '',
    busy: false,
    msg: '',
    err: '',
  },
};

const TABS = [
  { id: 'overview', icon: 'fa-gauge-high', label: '总览' },
  { id: 'users', icon: 'fa-users', label: '用户' },
  { id: 'devices', icon: 'fa-robot', label: '设备' },
  { id: 'records', icon: 'fa-cloud', label: '云录像' },
  { id: 'packages', icon: 'fa-box-archive', label: '升级包' },
  { id: 'upgrade', icon: 'fa-rocket', label: '远程升级' },
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
  return s.length > 12 ? s.slice(0, 8) + '…' : s;
}
function matchQ(row, fields) {
  const q = (state.q || '').trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(f || '').toLowerCase().includes(q));
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
  return n.startsWith('robot_') || n.includes('smartrobot') || ((n.endsWith('.tar.gz') || n.endsWith('.tgz')) && n.includes('robot'));
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
      h('a', { class: 'gbtn', href: '../index.html#/devices', style: { textDecoration: 'none' } }, fa('fa-arrow-left'), ' 设备控制台'),
      h('button', { class: 'gbtn icon', title: '退出', onclick: async () => { iotDisconnect(); await signOut(); location.href = '../index.html#/login'; } }, fa('fa-right-from-bracket')),
    ),
  );
}

function shell(body) {
  const nav = h('div', { class: 'admin-nav' }, ...TABS.map((t) => h('button', {
    class: state.tab === t.id ? 'active' : '',
    onclick: () => { state.tab = t.id; render(); loadTab(t.id); },
  }, fa(t.icon), t.label)));
  const side = h('aside', { class: 'admin-side' },
    h('div', { class: 'logo' }, h('span', { class: 'b' }), 'Admin'),
    nav,
    h('div', { class: 'faint', style: { fontSize: '11px', padding: '16px 10px 0', lineHeight: '1.5' } },
      '数据源：Amplify AppSync（当前区域）', h('br'),
      'OTA：S3 public/ + DeviceUpgrade + IoT setRemoteOta'),
  );
  return mount(app, topbar(), h('div', { class: 'admin-shell' }, side, h('main', { class: 'admin-main' }, body)));
}

function searchBox(placeholder) {
  const inp = h('input', { type: 'search', placeholder: placeholder || '搜索…', value: state.q,
    style: { minWidth: '220px', flex: '1' } });
  inp.addEventListener('input', () => { state.q = inp.value; render(); });
  return inp;
}

async function ensureData(kind) {
  if (kind === 'users' && !state.users) state.users = await listAllUsers();
  if (kind === 'devices' && !state.devices) {
    state.devices = await listAllDevices();
    try { state.binds = await listAllDeviceUsers(); } catch (_) { state.binds = []; }
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
  try {
    if (id === 'overview') {
      await Promise.all([
        state.users ? null : listAllUsers().then((x) => { state.users = x; }),
        state.devices ? null : listAllDevices().then((x) => { state.devices = x; }),
        state.packages ? null : listDeviceUpgrades().then((x) => { state.packages = x; }),
      ]);
      if (state.records == null) {
        try { await loadRecords(); } catch (_) { state.records = []; }
      }
    } else if (id === 'users') await ensureData('users');
    else if (id === 'devices' || id === 'upgrade') await ensureData('devices');
    else if (id === 'packages' || id === 'upgrade') await ensureData('packages');
    else if (id === 'records') await ensureData('records');
    if (id === 'upgrade') {
      await ensureData('devices');
      await ensureData('packages');
    }
  } catch (e) {
    console.error('[admin] load', id, e);
    state._err = (e && e.message) || String(e);
  }
  render();
}

function viewOverview() {
  const u = (state.users || []).length;
  const d = (state.devices || []).length;
  const online = (state.devices || []).filter((x) => x.online).length;
  const p = (state.packages || []).length;
  const r = (state.records || []).length;
  const trunc = state.recordsMeta && state.recordsMeta.truncated;
  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, '总览'), chip(getRegion().toUpperCase())),
    state._err ? h('div', { class: 'admin-msg err' }, state._err) : null,
    h('div', { class: 'admin-grid-stats' },
      stat('用户', u), stat('设备', d), stat('在线', online),
      stat('升级包', p), stat('云录像(近' + state.recDays + '天)', r + (trunc ? '+' : '')),
    ),
    h('div', { class: 'glass admin-panel' },
      h('div', { style: { fontWeight: 700, marginBottom: '8px' } }, '快捷操作'),
      h('div', { class: 'row-actions' },
        h('button', { class: 'gbtn primary', onclick: () => { state.tab = 'upgrade'; render(); loadTab('upgrade'); } }, fa('fa-rocket'), ' 远程升级'),
        h('button', { class: 'gbtn', onclick: () => { state.tab = 'packages'; render(); loadTab('packages'); } }, fa('fa-upload'), ' 上传升级包'),
        h('button', { class: 'gbtn', onclick: () => { state.users = state.devices = state.packages = state.records = null; loadTab('overview'); } }, fa('fa-rotate'), ' 刷新数据'),
      ),
    ),
  );
}
function stat(k, v) {
  return h('div', { class: 'glass stat-card' }, h('div', { class: 'k' }, k), h('div', { class: 'v num' }, String(v)));
}

function viewUsers() {
  const rows = (state.users || []).filter((u) => matchQ(u, [u.awsUserName, u.email, u.phoneNumber, u.id, u.awsUserID, u.region]));
  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, '用户'), chip(String(rows.length))),
    h('div', { class: 'admin-toolbar' }, searchBox('搜用户名 / 邮箱 / id…'),
      h('button', { class: 'gbtn', onclick: async () => { state.users = null; render(); await loadTab('users'); } }, '刷新')),
    !state.users ? loading('加载用户…') : tableWrap(
      ['用户名', '邮箱', '手机', '区域', 'User.id', 'Cognito sub', '更新'],
      rows.map((u) => [u.awsUserName || '—', u.email || '—', u.phoneNumber || '—', u.region || '—',
        h('span', { class: 'mono' }, shortId(u.id)), h('span', { class: 'mono' }, shortId(u.awsUserID)), fmt(u.updatedAt)]),
    ),
  );
}

function viewDevices() {
  const rows = (state.devices || []).filter((d) => matchQ(d, [d.name, d.model, d.uuid, d.id, d.firmware, d.ownerUserId]));
  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, '设备'), chip(String(rows.length)),
      chip(`${rows.filter((d) => d.online).length} 在线`, 'stat-online')),
    h('div', { class: 'admin-toolbar' }, searchBox('搜名称 / UUID / 型号…'),
      h('button', { class: 'gbtn', onclick: async () => { state.devices = null; render(); await loadTab('devices'); } }, '刷新')),
    !state.devices ? loading('加载设备…') : tableWrap(
      ['状态', '名称', '型号', '版本', 'UUID', 'Owner', '操作'],
      rows.map((d) => [
        d.online ? chip('在线', 'stat-online') : chip('离线', 'stat-offline'),
        d.name || '—', d.model || '—', d.firmware ? ('v' + d.firmware) : '—',
        h('span', { class: 'mono', title: d.uuid || d.id }, shortId(d.uuid || d.id)),
        h('span', { class: 'mono' }, shortId(d.ownerUserId)),
        h('div', { class: 'row-actions' },
          h('button', { class: 'gbtn', style: { height: '32px', fontSize: '12px' },
            onclick: () => openDevice(d) }, '进入'),
          h('button', { class: 'gbtn primary', style: { height: '32px', fontSize: '12px' },
            onclick: () => { state.upgrade.deviceId = d.id; state.tab = 'upgrade'; render(); } }, '升级'),
        ),
      ]),
    ),
  );
}

async function openDevice(dev) {
  const uuid = dev.uuid || dev.id;
  if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) { alert('设备 UUID 无效'); return; }
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
  } catch (e) { alert('进入设备失败: ' + ((e && e.message) || e)); }
}

function viewRecords() {
  const rows = (state.records || []).filter((r) => matchQ(r, [r.deviceID, r.id, r.resolution, r.type, String(r.channel)]));
  const deviceSel = h('select', {},
    h('option', { value: '' }, '全部设备'),
    ...(state.devices || []).map((d) => h('option', {
      value: d.id, selected: state.recDeviceId === d.id,
    }, `${d.name || d.id} (${shortId(d.id)})`)));
  deviceSel.addEventListener('change', () => { state.recDeviceId = deviceSel.value; });
  const days = h('select', {},
    ...[1, 3, 7, 14, 30].map((n) => h('option', { value: String(n), selected: Number(state.recDays) === n }, `近 ${n} 天`)));
  days.addEventListener('change', () => { state.recDays = Number(days.value); });
  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, '云录像'), chip(String(rows.length)),
      (state.recordsMeta && state.recordsMeta.truncated) ? chip('已截断翻页', 'stat-offline') : null),
    h('div', { class: 'admin-toolbar' },
      searchBox('搜 deviceID / 分辨率…'), deviceSel, days,
      h('button', { class: 'gbtn primary', onclick: async () => {
        state.records = null; render();
        try { await loadRecords(); } catch (e) { state._err = e.message; }
        render();
      } }, '查询'),
    ),
    state.records == null ? loading('加载云录像…') : tableWrap(
      ['时间', '设备', '时长', '通道', '分辨率', '类型', '缩略图'],
      rows.slice(0, 500).map((r) => [
        fmt(r.dateTime), h('span', { class: 'mono', title: r.deviceID }, shortId(r.deviceID)),
        (r.duration || '—') + (r.duration ? 's' : ''), r.channel != null ? String(r.channel) : '—',
        r.resolution || '—', r.type || '—',
        r.thumbnailUrl ? h('a', { href: '#', onclick: async (ev) => {
          ev.preventDefault();
          try {
            const c = await resolvedCreds();
            const url = presignS3Get(Object.assign({ region: COGNITO.region }, c),
              /^https?:/.test(r.thumbnailUrl) ? r.thumbnailUrl
                : `https://${S3_BUCKET}.s3.${COGNITO.region}.amazonaws.com/${String(r.thumbnailUrl).replace(/^\/+/, '')}`);
            window.open(url, '_blank');
          } catch (e) { alert(e.message); }
        } }, '打开') : '—',
      ]),
    ),
  );
}

function viewPackages() {
  const u = state.upload;
  let list = state.packages || [];
  if (state.pkgFilterType) list = list.filter((p) => p.upgradeDeviceType === state.pkgFilterType);
  list = list.filter((p) => matchQ(p, [p.upgradeDeviceVersion, p.upgradeDescribe, p.upgradeFileUrl, p.upgradeDeviceType, p.upgradeDevicePartion]));

  const fileInput = h('input', { type: 'file', accept: '.tar.gz,.tgz,.zip,.bin,*/*' });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    u.file = f || null;
    if (f) {
      if (looksRobot(f.name)) u.deviceType = 'smartRobot';
      const part = inferPart(f.name); if (part) u.partition = part;
      const ver = inferVer(f.name); if (ver && !u.version) u.version = ver;
    }
    render();
  });

  const typeSel = h('select', {},
    ...['smartRobot', 'smartIpcamera'].map((t) => h('option', { value: t, selected: u.deviceType === t }, t)));
  typeSel.addEventListener('change', () => { u.deviceType = typeSel.value; });
  const partSel = h('select', {},
    ...['system', 'website', 'model', 'config', 'all'].map((t) => h('option', { value: t, selected: u.partition === t }, t)));
  partSel.addEventListener('change', () => { u.partition = partSel.value; });
  const verIn = h('input', { value: u.version, placeholder: '如 1.0.27' });
  verIn.addEventListener('input', () => { u.version = verIn.value; });
  const descIn = h('textarea', { placeholder: '升级说明（必填）' }, u.describe);
  descIn.addEventListener('input', () => { u.describe = descIn.value; });

  const filterType = h('select', {},
    h('option', { value: '' }, '全部机型'),
    ...['smartRobot', 'smartIpcamera'].map((t) => h('option', { value: t, selected: state.pkgFilterType === t }, t)));
  filterType.addEventListener('change', () => { state.pkgFilterType = filterType.value; render(); });

  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, '升级包'), chip(String(list.length))),
    h('div', { class: 'glass admin-panel' },
      h('div', { style: { fontWeight: 700, marginBottom: '12px' } }, '上传 OTA 包（对齐 App）'),
      h('div', { class: 'admin-form' },
        h('div', { class: 'admin-field span2' }, h('label', {}, '文件'), fileInput,
          h('div', { class: 'faint', style: { marginTop: '4px' } }, u.file ? `${u.file.name} (${Math.round(u.file.size / 1024)} KB)` : '未选择')),
        h('div', { class: 'admin-field' }, h('label', {}, '机型 upgradeDeviceType'), typeSel),
        h('div', { class: 'admin-field' }, h('label', {}, '分区 upgradeDevicePartion'), partSel),
        h('div', { class: 'admin-field' }, h('label', {}, '版本'), verIn),
        h('div', { class: 'admin-field span2' }, h('label', {}, '说明'), descIn),
      ),
      h('div', { class: 'progress' }, h('i', { style: { width: u.progress + '%' } })),
      h('div', { class: 'row-actions', style: { marginTop: '12px' } },
        h('button', { class: 'gbtn primary', disabled: u.busy, onclick: () => doUpload() },
          u.busy ? `上传中 ${u.progress}%` : '上传到云端并登记'),
        h('button', { class: 'gbtn', onclick: async () => { state.packages = null; render(); await loadTab('packages'); } }, '刷新列表'),
      ),
      u.msg ? h('div', { class: 'admin-msg ok' }, u.msg) : null,
      u.err ? h('div', { class: 'admin-msg err' }, u.err) : null,
    ),
    h('div', { class: 'admin-toolbar' }, searchBox('搜版本 / 说明 / 路径…'), filterType),
    !state.packages ? loading('加载升级包…') : tableWrap(
      ['时间', '机型', '版本', '分区', '类型', '说明', 'S3 Key', '操作'],
      list.map((p) => [
        fmt(p.upgradeOtaTime || p.createdAt),
        p.upgradeDeviceType || '—', p.upgradeDeviceVersion || '—', p.upgradeDevicePartion || '—',
        p.upgradeType || '—', p.upgradeDescribe || '—',
        h('span', { class: 'mono', title: p.upgradeFileUrl }, shortId(p.upgradeFileUrl)),
        h('button', { class: 'gbtn primary', style: { height: '32px', fontSize: '12px' },
          onclick: () => { state.upgrade.packageId = p.id; state.upgrade.partition = p.upgradeDevicePartion || ''; state.tab = 'upgrade'; render(); } },
          '用于升级'),
      ]),
    ),
  );
}

async function doUpload() {
  const u = state.upload;
  u.err = ''; u.msg = '';
  if (!u.file) { u.err = '请先选择文件'; render(); return; }
  if (!u.version.trim()) { u.err = '请填写版本号'; render(); return; }
  if (!u.describe.trim()) { u.err = '请填写升级说明'; render(); return; }
  u.busy = true; u.progress = 0; render();
  try {
    const creds = await resolvedCreds();
    if (!creds.accessKeyId) throw new Error('无临时凭证，请重新登录');
    const fileName = u.file.name;
    const key = `public/${u.upgradeType}/${u.deviceType}/${fileName}`;
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
    u.msg = `上传并登记成功：${created && created.id ? created.id : fileName}`;
    u.file = null; u.progress = 100;
    state.packages = null;
    await loadTab('packages');
  } catch (e) {
    console.error('[admin] upload', e);
    u.err = (e && e.message) || String(e);
  } finally {
    u.busy = false; render();
  }
}

function viewUpgrade() {
  const ug = state.upgrade;
  const devices = state.devices || [];
  const packages = state.packages || [];
  const devSel = h('select', { style: { minWidth: '260px' } },
    h('option', { value: '' }, '选择设备…'),
    ...devices.map((d) => h('option', { value: d.id, selected: ug.deviceId === d.id },
      `${d.online ? '🟢' : '⚪'} ${d.name || d.id} · ${d.model || ''} · v${d.firmware || '?'}`)));
  devSel.addEventListener('change', () => { ug.deviceId = devSel.value; render(); });
  const pkgSel = h('select', { style: { minWidth: '280px' } },
    h('option', { value: '' }, '选择升级包…'),
    ...packages.map((p) => h('option', { value: p.id, selected: ug.packageId === p.id },
      `${p.upgradeDeviceType || '?'} ${p.upgradeDeviceVersion || '?'} · ${p.upgradeDevicePartion || '?'} · ${p.upgradeDescribe || ''}`)));
  pkgSel.addEventListener('change', () => {
    ug.packageId = pkgSel.value;
    const p = packages.find((x) => x.id === ug.packageId);
    if (p && p.upgradeDevicePartion) ug.partition = p.upgradeDevicePartion;
    render();
  });
  const partSel = h('select', {},
    ...['', 'system', 'website', 'model', 'config', 'all'].map((t) => h('option', {
      value: t, selected: (ug.partition || '') === t,
    }, t || '跟随升级包')));
  partSel.addEventListener('change', () => { ug.partition = partSel.value; });

  const selectedDev = devices.find((d) => d.id === ug.deviceId);
  const selectedPkg = packages.find((p) => p.id === ug.packageId);

  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, '远程升级'), chip('一键下发')),
    h('div', { class: 'glass admin-panel' },
      h('div', { class: 'admin-form' },
        h('div', { class: 'admin-field span2' }, h('label', {}, '目标设备'), devSel),
        h('div', { class: 'admin-field span2' }, h('label', {}, '升级包'), pkgSel),
        h('div', { class: 'admin-field' }, h('label', {}, '分区覆盖'), partSel),
      ),
      selectedDev || selectedPkg ? h('div', { class: 'faint', style: { marginTop: '10px', fontSize: '12px', lineHeight: '1.6' } },
        selectedDev ? `设备 UUID: ${selectedDev.uuid || '(缺失 deviceUuid)'} · Amplify id: ${shortId(selectedDev.id)} · 状态: ${selectedDev.online ? '在线' : '离线'}` : '',
        selectedDev && !selectedDev.uuid ? h('div', { class: 'admin-msg err', style: { marginTop: '8px' } }, '该设备 deviceGeneralInformation 无 deviceUuid，IoT 升级可能失败') : null,
        selectedDev && selectedPkg ? h('br') : null,
        selectedPkg ? `包: ${selectedPkg.upgradeFileUrl}` : '',
      ) : null,
      h('div', { class: 'row-actions', style: { marginTop: '14px' } },
        h('button', { class: 'gbtn primary', disabled: ug.busy, onclick: () => doRemoteUpgrade() },
          ug.busy ? '下发中…' : '一键远程升级'),
        h('button', { class: 'gbtn', onclick: async () => {
          state.devices = state.packages = null; render(); await loadTab('upgrade');
        } }, '刷新设备/包'),
      ),
      ug.msg ? h('div', { class: 'admin-msg ok' }, ug.msg) : null,
      ug.err ? h('div', { class: 'admin-msg err' }, ug.err) : null,
      h('div', { class: 'admin-msg info', style: { marginTop: '12px' } },
        '流程与 App / 设备页一致：S3 预签名(2h) → IoT setRemoteOtaServiceCommand。设备需在线且已连 AWS IoT。'),
    ),
  );
}

async function doRemoteUpgrade() {
  const ug = state.upgrade;
  ug.err = ''; ug.msg = '';
  const dev = (state.devices || []).find((d) => d.id === ug.deviceId);
  const pkg = (state.packages || []).find((p) => p.id === ug.packageId);
  if (!dev) { ug.err = '请选择设备'; render(); return; }
  if (!pkg || !pkg.upgradeFileUrl) { ug.err = '请选择升级包'; render(); return; }
  const uuid = dev.uuid;
  if (!uuid || !/^[0-9a-fA-F-]{36}$/.test(uuid)) {
    ug.err = '设备缺少 deviceUuid（deviceGeneralInformation），无法走 IoT 远程升级';
    render(); return;
  }
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
    if (!signed || signed.indexOf('X-Amz-') < 0) throw new Error('预签名失败（检查 Identity Pool S3 权限）');
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
    ug.msg = `已下发远程升级命令。应答 status=${resp && resp.status} method=${resp && resp.method}`;
  } catch (e) {
    console.error('[admin] remote ota', e);
    ug.err = (e && e.message) || String(e);
  } finally {
    ug.busy = false; render();
  }
}

function tableWrap(headers, rows) {
  if (!rows.length) return emptyState('无数据');
  return h('div', { class: 'glass admin-table-wrap' },
    h('table', { class: 'admin-table' },
      h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, ...rows.map((cells) => h('tr', {}, ...cells.map((c) => h('td', {}, c))))),
    ),
  );
}

function render() {
  let body;
  if (state.tab === 'overview') body = viewOverview();
  else if (state.tab === 'users') body = viewUsers();
  else if (state.tab === 'devices') body = viewDevices();
  else if (state.tab === 'records') body = viewRecords();
  else if (state.tab === 'packages') body = viewPackages();
  else body = viewUpgrade();
  shell(body);
}

(async function boot() {
  warmupAuth();
  mount(app, h('div', { class: 'center', style: { padding: '80px' } }, loading('恢复会话…')));
  let session = null;
  try { session = await restoreSession(); } catch (_) {}
  if (!session || !session.userRow) {
    location.href = '../index.html#/login';
    return;
  }
  if (!isAdminAccount(session)) {
    mount(app, h('div', { class: 'center', style: { padding: '80px', textAlign: 'center' } },
      h('div', { class: 'glass', style: { padding: '28px 32px', maxWidth: '420px', margin: '0 auto' } },
        h('div', { style: { fontWeight: 800, fontSize: '18px', marginBottom: '8px' } }, '无管理后台权限'),
        h('div', { class: 'faint', style: { fontSize: '13px', lineHeight: '1.6', marginBottom: '16px' } },
          '当前账号不在 ADMIN_ALLOWLIST。如需开通，请在 console/config.js 加入用户名或邮箱。'),
        h('a', { class: 'gbtn primary', href: '../index.html#/devices', style: { textDecoration: 'none' } }, '返回设备控制台'),
      )));
    return;
  }
  state.session = session;
  // 预取总览
  render();
  await loadTab('overview');
})();
