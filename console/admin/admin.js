// 云端管理后台 — 顶级客户向：功能完整、路径最短
import {
  COGNITO, IOT_ENDPOINT, S3_BUCKET, APPSYNC, getRegion, setRegion, REGIONS, REGION_ORDER, isAdminAccount,
} from '../config.js';
import { signIn, restoreSession, resolvedCreds, signOut, warmupAuth } from '../lib/auth.js';
import {
  listAllUsers, listAllDevices, listAllDeviceUsers, listDeviceUpgrades,
  listCloudRecordsAdmin, createDeviceUpgrade,
  updateUserAdmin, deleteUserCompletely,
  updateDeviceAdmin, deleteDeviceCompletely,
} from '../lib/graphql.js';
import { putS3Object, presignS3Get } from '../lib/sigv4.js';
import { signS3MediaUrl } from '../lib/s3-media.js';
import { sendCommand as iotSend, disconnect as iotDisconnect } from '../lib/iot-rpc.js';
import { h, mount, loading, emptyState } from '../lib/ui.js';
import {
  t, applyTheme, applyLang, setLangChangeHandler, switcherBar, tabDefs, regionLabel, getTheme,
} from './i18n.js';

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
  upgrade: { deviceId: '', packageId: '', partition: '', busy: false, msg: '', err: '', tracking: false, progress: 0, status: '', statusText: '', detail: '' },
  loadingTab: false,
  edit: null, // { type:'user'|'device', id, values, busy, err }
};

function tabs() {
  return tabDefs().map((x) => ({ id: x.id, icon: x.icon, label: t(x.labelKey) }));
}

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
  navigator.clipboard.writeText(s).then(() => toast(t('copied'))).catch(() => toast(t('copyFail'), 'err'));
}
function mediaThumb(raw, opts) {
  const o = opts || {};
  const box = h('div', {
    class: 'thumb',
    style: {
      width: o.w || '56px', height: o.h || '40px', borderRadius: '8px',
      background: 'var(--fill-md)', overflow: 'hidden', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)',
    },
  }, h('span', { class: 'faint', style: { fontSize: '10px' } }, '…'));
  if (!raw) return h('span', { class: 'faint' }, '—');
  resolvedCreds().then((c) => {
    const url = signS3MediaUrl(c, raw, 3600);
    if (!url) return;
    const img = h('img', {
      src: url, alt: '',
      style: { width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' },
      onclick: () => window.open(url, '_blank'),
      onerror: function () { this.style.display = 'none'; },
    });
    box.replaceChildren(img);
  }).catch(() => {});
  return box;
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
  // Amplify list 偶发 items 含 null，读 b.deviceId 会把设备页整页打挂
  return (state.binds || []).filter((b) => b && (b.deviceId === deviceId || (b.device && b.device.id === deviceId)));
}
function latestPackageForType(deviceType, preferPart) {
  const t = deviceType || 'smartRobot';
  const part = preferPart == null ? 'system' : preferPart;
  // packages 已按 upgradeOtaTime 新→旧排序
  const list = (state.packages || []).filter((p) => (p.upgradeDeviceType || 'smartRobot') === t);
  if (!list.length) return null;
  if (part) {
    const hit = list.find((p) => (p.upgradeDevicePartion || 'system') === part);
    if (hit) return hit;
  }
  return list[0];
}
/** OTA 页：无包/包失效/机型不匹配时，默认选该机型最新包（优先 system） */
function ensureDefaultUpgradeSelection() {
  const packages = state.packages || [];
  if (!packages.length) return;
  const ug = state.upgrade;
  const dev = (state.devices || []).find((d) => d.id === ug.deviceId);
  const dtype = resolveDeviceType(dev);
  const latest = latestPackageForType(dtype);
  const cur = packages.find((p) => p.id === ug.packageId);
  const typeOk = cur && (cur.upgradeDeviceType || 'smartRobot') === dtype;
  if (!cur || !typeOk) {
    if (latest) {
      ug.packageId = latest.id;
      ug.partition = latest.upgradeDevicePartion || 'system';
    }
  }
}
function otaPhaseText(status, progress) {
  const st = String(status == null ? '' : status);
  const pr = Math.max(0, Math.min(100, Number(progress) || 0));
  if (st === '1' || st === '4' || st === 'IN_PROGRESS' || st === 'QUEUED') return `下载/准备中 ${pr}%`;
  if (st === '2') return `写入中 ${pr}%`;
  if (st === '3') return `重启服务中 ${pr}%`;
  if (st === '5' || st === 'FAILED' || st === 'REJECTED' || st === 'TIMED_OUT') return '升级失败';
  if (st === '6' || st === 'SUCCEEDED') return '升级成功';
  if (!st) return pr ? `升级中 ${pr}%` : t('waitingDevice');
  return `状态 ${st} · ${pr}%`;
}
function applyOtaPush(detail) {
  const d = detail || {};
  if (d.method !== 'updateRemoteOtaStatusCommand') return;
  const ug = state.upgrade;
  if (!ug.tracking) return;
  let p = d.params || {};
  if (p.remoteOtaStatus && typeof p.remoteOtaStatus === 'object') p = p.remoteOtaStatus;
  const progress = Number(p.progress);
  if (!Number.isNaN(progress)) ug.progress = Math.max(0, Math.min(100, progress));
  if (p.status != null && p.status !== '') ug.status = p.status;
  if (p.detail) ug.detail = String(p.detail);
  if (p.installDir) ug.detail = String(p.installDir);
  ug.statusText = otaPhaseText(ug.status, ug.progress);
  const st = String(ug.status);
  if (st === '5' || st === 'FAILED' || st === 'REJECTED' || st === 'TIMED_OUT') {
    ug.tracking = false;
    ug.busy = false;
    ug.err = '升级失败' + (ug.detail ? ('：' + ug.detail) : '');
    ug.msg = '';
    toast(ug.err, 'err');
  } else if (st === '6' || st === 'SUCCEEDED') {
    ug.tracking = false;
    ug.busy = false;
    ug.progress = 100;
    ug.msg = '升级成功' + (ug.detail ? (' · ' + ug.detail) : '');
    ug.err = '';
    ug.statusText = '升级成功';
    toast(ug.msg);
  } else {
    ug.msg = ug.statusText;
    ug.err = '';
  }
  if (state.tab === 'ota' || state.tab === 'devices') render();
}
if (!window.__adminOtaPushBound) {
  window.__adminOtaPushBound = true;
  window.addEventListener('iot-push', (ev) => {
    try { applyOtaPush(ev && ev.detail); } catch (e) { console.warn('[admin] ota push', e); }
  });
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
      h('a', { class: 'brand', href: '../index.html#/devices' }, h('span', { class: 'b' }), t('brand')),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted', style: { fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' } },
        fa('fa-user-shield'),
        (u && (u.account || (u.userRow && u.userRow.awsUserName) || u.email)) || '',
        h('span', { class: 'chip', style: { fontSize: '10.5px', padding: '2px 8px', background: 'var(--acc-soft)', color: 'var(--accent)', border: '1px solid var(--acc-soft-bd)' } },
          regionLabel(getRegion()))),
      ...switcherBar(true).reverse(),
      h('a', { class: 'gbtn btn-sm', href: '../index.html#/devices', style: { textDecoration: 'none' } }, fa('fa-arrow-left'), ' ' + t('consoleLink')),
      h('button', { class: 'gbtn icon', title: t('logout'), onclick: async () => { iotDisconnect(); await signOut(); state.session = null; viewLogin(); } },
        fa('fa-right-from-bracket')),
    ),
  );
}

function shell(body) {
  const nav = h('div', { class: 'admin-nav' }, ...tabs().map((tb) => h('button', {
    class: state.tab === tb.id ? 'active' : '',
    onclick: () => goTab(tb.id),
  }, fa(tb.icon), tb.label)));
  const sideHint = t('sideHint').split('\n');
  const side = h('aside', { class: 'admin-side' },
    h('div', { class: 'logo' }, h('span', { class: 'b' }), t('brandShort')),
    nav,
    h('div', { class: 'faint', style: { fontSize: '11px', padding: '18px 10px 0', lineHeight: '1.55' } },
      sideHint[0] || '', h('br'), sideHint[1] || ''),
  );
  const toastEl = state.toast
    ? h('div', { class: 'toast-host' }, h('div', { class: 'toast ' + state.toast.type }, state.toast.msg))
    : null;
  const modal = state.confirm ? renderConfirm() : (state.edit ? renderEdit() : null);
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
  toast(t('dataRefreshed'));
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
    h('div', { class: 'admin-head' }, h('h1', {}, t('overview')), chip(getRegion().toUpperCase())),
    h('div', { class: 'admin-sub' }, t('overviewSub')),
    state._err ? h('div', { class: 'admin-msg err' }, state._err) : null,
    h('div', { class: 'admin-grid-stats' },
      stat(t('usersCount'), u, () => goTab('users')),
      stat(t('devicesCount'), d, () => goTab('devices')),
      stat(t('onlineCount'), online, () => { state.deviceFilter = 'online'; goTab('devices'); }),
      stat(t('pkgsCount'), p, () => goTab('ota')),
      stat(t('recordsCount'), r + (trunc ? '+' : ''), () => goTab('records')),
    ),
    h('div', { class: 'glass admin-panel' },
      h('div', { style: { fontWeight: 800, marginBottom: '6px' } }, t('commonOps')),
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
  const rows = (state.users || []).filter((u) => u && matchQ([u.awsUserName, u.email, u.phoneNumber, u.id, u.awsUserID, u.region]));
  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, t('users')), chip(String(rows.length))),
    h('div', { class: 'admin-sub' }, t('usersSub')),
    h('div', { class: 'admin-toolbar' },
      searchBox(t('searchUsers')),
      h('button', { class: 'gbtn btn-sm', onclick: async () => { state.users = null; await loadTab('users'); } }, t('refresh'))),
    state.loadingTab || !state.users ? loading('加载用户…') : tableWrap(
      [t('colUser'), t('colEmail'), t('colPhone'), t('colRegion'), 'User.id', 'Cognito', t('colUpdated'), t('colActions')],
      rows.map((u) => [
        u.awsUserName || '—', u.email || '—', u.phoneNumber || '—', u.region || '—',
        copyable(u.id), copyable(u.awsUserID), fmt(u.updatedAt),
        h('div', { class: 'row-actions' },
          h('button', { class: 'gbtn btn-sm', onclick: () => openEditUser(u) }, t('edit')),
          h('button', { class: 'gbtn btn-sm danger', onclick: () => askDeleteUser(u) }, t('delete')),
        ),
      ]),
    ),
  );
}

function viewDevices() {
  let rows = (state.devices || []).filter(Boolean);
  if (state.deviceFilter === 'online') rows = rows.filter((d) => d.online);
  if (state.deviceFilter === 'offline') rows = rows.filter((d) => !d.online);
  rows = rows.filter((d) => matchQ([d.name, d.model, d.uuid, d.id, d.firmware, d.ownerUserId, ownerName(d.ownerUserId)]));

  const seg = h('div', { class: 'seg' },
    ...[['all', t('all')], ['online', t('online')], ['offline', t('offline')]].map(([k, lab]) => h('button', {
      class: state.deviceFilter === k ? 'on' : '',
      onclick: () => { state.deviceFilter = k; render(); },
    }, lab)));

  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, t('devices')), chip(String(rows.length)),
      chip(`${(state.devices || []).filter((d) => d.online).length} ${t('online')}`, 'stat-online')),
    h('div', { class: 'admin-sub' }, t('devicesSub')),
    h('div', { class: 'admin-toolbar' },
      searchBox(t('searchDevices')), seg,
      h('button', { class: 'gbtn btn-sm', onclick: async () => { state.devices = state.binds = null; await loadTab('devices'); } }, t('refresh'))),
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
        [t('colStatus'), '图', t('colName'), t('colModel'), t('colVersion'), 'UUID', t('colOwner'), t('colBinds'), t('colActions')],
        rows.filter((d) => d && d.id).map((d) => {
          const binds = bindUsersForDevice(d.id);
          const latest = latestPackageForType(resolveDeviceType(d));
          return [
            d.online ? chip(t('online'), 'stat-online') : chip(t('offline'), 'stat-offline'),
            mediaThumb(d._pictureRaw || d.picture || (d.raw && d.raw.devicePicture) || ''),
            d.name || '—',
            d.model || '—',
            d.firmware ? ('v' + d.firmware) : '—',
            d.uuid ? copyable(d.uuid) : h('span', { class: 'faint' }, '无 UUID'),
            ownerName(d.ownerUserId),
            String(binds.length),
            h('div', { class: 'row-actions' },
              h('button', { class: 'gbtn btn-sm', onclick: () => openEditDevice(d) }, t('edit')),
              h('button', { class: 'gbtn btn-sm', onclick: () => openDevice(d) }, t('enter')),
              h('button', {
                class: 'gbtn primary btn-sm',
                disabled: !d.uuid || !latest,
                title: !d.uuid ? '缺少 deviceUuid' : (!latest ? '无可用升级包' : `升级到 ${latest.upgradeDeviceVersion}`),
                onclick: () => askUpgradeLatest(d),
              }, t('upgradeLatest')),
              h('button', { class: 'gbtn btn-sm danger', onclick: () => askDeleteDevice(d) }, t('delete')),
            ),
          ];
        }),
      );
    })(),
  );
}


function openEditUser(u) {
  state.edit = {
    type: 'user',
    id: u.id,
    busy: false,
    err: '',
    values: {
      awsUserName: u.awsUserName || '',
      email: u.email || '',
      phoneNumber: u.phoneNumber || '',
      region: u.region || '',
      picture: u.picture || '',
    },
  };
  render();
}
function askDeleteUser(u) {
  const name = u.awsUserName || u.email || u.id;
  state.confirm = {
    title: t('confirmDelUser'),
    body: `将删除 User 行与其全部设备绑定(DeviceUser)。\n用户：${name}\nUser.id：${u.id}\n\n不会删除 Cognito 账号，也不会删除 Device 行。`,
    okText: t('confirmDelOk'),
    onOk: async () => {
      state.confirm = null; render();
      try {
        const r = await deleteUserCompletely(u.id);
        toast(`用户已删除（清绑定 ${r.binds}）`);
        state.users = null; state.binds = null;
        await loadTab('users');
      } catch (e) {
        console.error('[admin] delete user', e);
        toast((e && e.message) || String(e), 'err');
      }
    },
  };
  render();
}
function openEditDevice(d) {
  state.edit = {
    type: 'device',
    id: d.id,
    busy: false,
    err: '',
    values: {
      name: d.name || '',
      model: d.model || '',
      firmware: d.firmware || '',
      uuid: d.uuid || '',
      ownerUserId: d.ownerUserId || '',
      connectStatus: d.connectStatus || (d.online ? 'online' : 'offline'),
      picture: d.picture || '',
    },
    _rawInfo: (() => {
      try {
        const raw = d.raw && d.raw.deviceGeneralInformation;
        if (typeof raw === 'string' && raw.trim()) return JSON.parse(raw);
        if (raw && typeof raw === 'object') return { ...raw };
      } catch (_) {}
      return {};
    })(),
  };
  render();
}
function askDeleteDevice(d) {
  const binds = bindUsersForDevice(d.id);
  state.confirm = {
    title: t('confirmDelDevice'),
    body: `将删除设备及其全部用户绑定。\n设备：${d.name || d.id}\nUUID：${d.uuid || '—'}\n绑定数：${binds.length}\n\n删除后设备可被重新配网/绑定。`,
    okText: t('confirmDelOk'),
    onOk: async () => {
      state.confirm = null; render();
      try {
        const r = await deleteDeviceCompletely(d.id);
        toast(`设备已删除（清绑定 ${r.binds}）`);
        state.devices = null; state.binds = null;
        await loadTab('devices');
      } catch (e) {
        console.error('[admin] delete device', e);
        toast((e && e.message) || String(e), 'err');
      }
    },
  };
  render();
}
function fieldInput(edit, key, label, opts) {
  const o = opts || {};
  const inp = h(o.textarea ? 'textarea' : 'input', {
    type: o.type || 'text',
    value: edit.values[key] || '',
    placeholder: o.ph || '',
    style: o.textarea ? { minHeight: '64px' } : {},
  });
  if (o.textarea) inp.textContent = edit.values[key] || '';
  inp.addEventListener('input', () => { edit.values[key] = inp.value; });
  return h('div', { class: 'admin-field' + (o.span2 ? ' span2' : '') }, h('label', {}, label), inp);
}
function renderEdit() {
  const e = state.edit;
  if (!e) return null;
  const isUser = e.type === 'user';
  const title = isUser ? t('editUser') : t('editDevice');
  const fields = isUser
    ? [
        fieldInput(e, 'awsUserName', '用户名'),
        fieldInput(e, 'email', '邮箱'),
        fieldInput(e, 'phoneNumber', '手机'),
        fieldInput(e, 'region', '区域', { ph: '如 ap-northeast-1 / 东南亚' }),
        fieldInput(e, 'picture', '头像 URL', { span2: true }),
      ]
    : [
        fieldInput(e, 'name', '设备名称'),
        fieldInput(e, 'model', '型号'),
        fieldInput(e, 'firmware', '固件版本'),
        fieldInput(e, 'uuid', 'deviceUuid'),
        fieldInput(e, 'ownerUserId', '所有者(Cognito sub / User 标识)'),
        fieldInput(e, 'connectStatus', '连接状态', { ph: 'online / offline' }),
        fieldInput(e, 'picture', '图片 URL', { span2: true }),
      ];
  async function save() {
    e.err = ''; e.busy = true; render();
    try {
      if (isUser) {
        await updateUserAdmin({
          id: e.id,
          awsUserName: (e.values.awsUserName || '').trim() || null,
          email: (e.values.email || '').trim() || null,
          phoneNumber: (e.values.phoneNumber || '').trim() || null,
          region: (e.values.region || '').trim() || null,
          picture: (e.values.picture || '').trim() || null,
        });
        toast('用户已更新');
        state.edit = null;
        state.users = null;
        await loadTab('users');
      } else {
        const info = Object.assign({}, e._rawInfo || {});
        info.deviceName = (e.values.name || '').trim();
        info.deviceModelName = (e.values.model || '').trim();
        info.deviceVersion = (e.values.firmware || '').trim();
        info.deviceUuid = (e.values.uuid || '').trim();
        await updateDeviceAdmin({
          id: e.id,
          ownerUserId: (e.values.ownerUserId || '').trim() || null,
          deviceConnectStatus: (e.values.connectStatus || '').trim() || null,
          devicePicture: (e.values.picture || '').trim() || null,
          deviceGeneralInformation: JSON.stringify(info),
        });
        toast('设备已更新');
        state.edit = null;
        state.devices = null;
        await loadTab('devices');
      }
    } catch (err) {
      console.error('[admin] save edit', err);
      e.err = (err && err.message) || String(err);
      toast(e.err, 'err');
    } finally {
      e.busy = false;
      render();
    }
  }
  return h('div', { class: 'modal-mask', onclick: (ev) => { if (ev.target === ev.currentTarget && !e.busy) { state.edit = null; render(); } } },
    h('div', { class: 'glass modal wide' },
      h('h3', {}, title),
      h('div', { class: 'faint', style: { fontSize: '12px', marginBottom: '8px' } }, 'ID: ' + e.id),
      h('div', { class: 'admin-form' }, ...fields),
      e.err ? h('div', { class: 'admin-msg err' }, e.err) : null,
      h('div', { class: 'row-actions', style: { justifyContent: 'flex-end', marginTop: '14px' } },
        h('button', { class: 'gbtn', disabled: e.busy, onclick: () => { state.edit = null; render(); } }, t('cancel')),
        h('button', { class: 'gbtn primary', disabled: e.busy, onclick: () => save() }, e.busy ? t('saving') : t('save')),
      ),
    ),
  );
}

function askUpgradeLatest(dev) {
  const pkg = latestPackageForType(resolveDeviceType(dev));
  if (!pkg) { toast('没有可用升级包', 'err'); return; }
  if (!dev.uuid) { toast('设备缺少 deviceUuid', 'err'); return; }
  state.confirm = {
    title: t('confirmUpgrade'),
    body: `设备：${dev.name || dev.id}\n当前版本：${dev.firmware || '?'}\n目标：${pkg.upgradeDeviceType} v${pkg.upgradeDeviceVersion}（${pkg.upgradeDevicePartion || 'system'}）\n说明：${pkg.upgradeDescribe || '—'}\n\n设备需在线。确认后立即经 AWS IoT 下发。`,
    okText: t('confirmUpgradeOk'),
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
        h('button', { class: 'gbtn', onclick: () => { state.confirm = null; render(); } }, t('cancel')),
        h('button', { class: 'gbtn primary', onclick: () => c.onOk && c.onOk() }, c.okText || t('confirmOk')),
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
    h('div', { class: 'admin-head' }, h('h1', {}, t('records')), chip(String(rows.length)),
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
        mediaThumb(r.thumbnailUrl, { w: '72px', h: '48px' }),
      ]),
    ),
  );
}

function viewOta() {
  const u = state.upload;
  const ug = state.upgrade;
  const devices = state.devices || [];
  const packages = state.packages || [];
  ensureDefaultUpgradeSelection();
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
  const latestIds = new Set();
  ['smartRobot', 'smartIpcamera'].forEach((t) => { const L = latestPackageForType(t); if (L) latestIds.add(L.id); });
  const pkgSel = h('select', { style: { width: '100%' } },
    h('option', { value: '' }, t('pickPkg')),
    ...packages.slice(0, 80).map((p) => h('option', { value: p.id, selected: ug.packageId === p.id },
      `${latestIds.has(p.id) ? t('latestMark') : ''}${p.upgradeDeviceType} v${p.upgradeDeviceVersion || '?'} · ${p.upgradeDevicePartion || '?'} · ${p.upgradeDescribe || ''}`)));
  pkgSel.addEventListener('change', () => {
    ug.packageId = pkgSel.value;
    const p = packages.find((x) => x.id === ug.packageId);
    if (p) ug.partition = p.upgradeDevicePartion || '';
    render();
  });
  const partOver = h('select', {},
    ...['', 'system', 'website', 'model', 'config', 'all'].map((part) => h('option', { value: part, selected: (ug.partition || '') === part }, part || t('followPkg'))));
  partOver.addEventListener('change', () => { ug.partition = partOver.value; });

  const filterType = h('select', {},
    h('option', { value: '' }, '全部机型'),
    ...['smartRobot', 'smartIpcamera'].map((t) => h('option', { value: t, selected: state.pkgFilterType === t }, t)));
  filterType.addEventListener('change', () => { state.pkgFilterType = filterType.value; render(); });

  return h('div', {},
    h('div', { class: 'admin-head' }, h('h1', {}, t('ota')), chip(String(packages.length) + ' 包')),
    h('div', { class: 'admin-sub' }, t('otaSub')),
    h('div', { class: 'ota-grid' },
      h('div', { class: 'glass admin-panel' },
        h('div', { class: 'step' }, h('b', {}, '1'), t('stepUpload')),
        h('div', { class: 'admin-form' },
          h('div', { class: 'admin-field span2' }, h('label', {}, t('file')), fileInput,
            h('div', { class: 'faint', style: { marginTop: '4px' } },
              u.file ? `${u.file.name} (${Math.round(u.file.size / 1024)} KB)` : '支持 robot_*.tar.gz / .tgz（选不到时改用「所有文件」）')),
          h('div', { class: 'admin-field' }, h('label', {}, t('deviceType')), typeSel),
          h('div', { class: 'admin-field' }, h('label', {}, t('partition')), partSel),
          h('div', { class: 'admin-field' }, h('label', {}, t('version')), verIn),
          h('div', { class: 'admin-field span2' }, h('label', {}, t('describe')), descIn),
        ),
        h('div', { class: 'progress' }, h('i', { style: { width: (u.progress || 0) + '%' } })),
        h('div', { class: 'row-actions', style: { marginTop: '12px' } },
          h('button', { class: 'gbtn primary', disabled: u.busy, onclick: () => doUpload() },
            u.busy ? `${t('uploading')} ${u.progress}%` : t('btnUpload'))),
        u.msg ? h('div', { class: 'admin-msg ok' }, u.msg) : null,
        u.err ? h('div', { class: 'admin-msg err' }, u.err) : null,
      ),
      h('div', { class: 'glass admin-panel' },
        h('div', { class: 'step' }, h('b', {}, '2'), t('stepPush')),
        h('div', { class: 'admin-form' },
          h('div', { class: 'admin-field span2' }, h('label', {}, t('device')), devSel),
          h('div', { class: 'admin-field span2' }, h('label', {}, t('package')), pkgSel),
          h('div', { class: 'admin-field' }, h('label', {}, t('partOverride')), partOver),
        ),
        h('div', { class: 'row-actions', style: { marginTop: '12px' } },
          h('button', {
            class: 'gbtn primary', disabled: ug.busy,
            onclick: () => {
              const dev = devices.find((d) => d.id === ug.deviceId);
              const pkg = packages.find((p) => p.id === ug.packageId);
              if (!dev || !pkg) { toast(t('pickDevicePkg'), 'err'); return; }
              state.confirm = {
                title: t('confirmUpgrade'),
                body: `设备：${dev.name}\n包：v${pkg.upgradeDeviceVersion} ${pkg.upgradeDevicePartion || ''}\n${pkg.upgradeDescribe || ''}`,
                okText: t('confirmUpgradeOk'),
                onOk: async () => { state.confirm = null; render(); await doRemoteUpgrade(); },
              };
              render();
            },
          }, ug.busy || ug.tracking ? (ug.tracking ? `${t('upgrading')} ${ug.progress || 0}%` : t('dispatching')) : t('btnRemote'))),
        (ug.tracking || ug.progress > 0 || ug.statusText) ? h('div', { class: 'admin-field span2', style: { marginTop: '10px' } },
          h('label', {}, t('upgradeStatus')),
          h('div', { class: 'progress', style: { marginTop: '6px' } }, h('i', { style: { width: (ug.progress || 0) + '%' } })),
          h('div', {
            class: 'admin-msg ' + (ug.err ? 'err' : (String(ug.status) === '6' || String(ug.status) === 'SUCCEEDED' ? 'ok' : 'info')),
            style: { marginTop: '8px' },
          }, ug.err || ug.statusText || ug.msg || t('waitingDevice')),
        ) : null,
        ug.msg && !ug.tracking ? h('div', { class: 'admin-msg ok' }, ug.msg) : null,
        ug.err && !ug.tracking ? h('div', { class: 'admin-msg err' }, ug.err) : null,
        h('div', { class: 'admin-msg info' }, 'S3 预签名 2h → IoT 下发后监听 updateRemoteOtaStatusCommand 进度（与设备页一致）'),
      ),
    ),
    h('div', { class: 'admin-toolbar', style: { marginTop: '8px' } },
      searchBox(t('searchPkgs')), filterType,
      h('button', { class: 'gbtn btn-sm', onclick: async () => { state.packages = null; await loadTab('ota'); } }, t('refresh'))),
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
  ug.err = ''; ug.msg = ''; ug.statusText = ''; ug.detail = ''; ug.progress = 0; ug.status = '';
  const dev = (state.devices || []).find((d) => d.id === ug.deviceId);
  if (!dev) { ug.err = '请选择设备'; toast(ug.err, 'err'); render(); return; }
  ensureDefaultUpgradeSelection();
  let pkg = (state.packages || []).find((p) => p.id === ug.packageId);
  if (!pkg) {
    pkg = latestPackageForType(resolveDeviceType(dev));
    if (pkg) { ug.packageId = pkg.id; ug.partition = pkg.upgradeDevicePartion || 'system'; }
  }
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
    const stCode = resp && resp.status;
    if (stCode !== 1055 && stCode !== '1055') {
      throw new Error('设备拒绝远程 OTA status=' + stCode);
    }
    ug.tracking = true;
    ug.progress = 0;
    ug.status = '';
    ug.detail = '';
    ug.statusText = '已下发，等待设备上报进度…';
    ug.msg = ug.statusText;
    ug.err = '';
    toast('远程升级已下发，正在跟踪进度');
    if (ug._trackTimer) clearTimeout(ug._trackTimer);
    ug._trackTimer = setTimeout(() => {
      if (!ug.tracking) return;
      ug.tracking = false;
      ug.busy = false;
      if (!ug.err && String(ug.status) !== '6' && String(ug.status) !== 'SUCCEEDED') {
        ug.statusText = (ug.statusText || '升级中') + '（长时间无终态，请到设备页核对）';
        ug.msg = ug.statusText;
      }
      render();
    }, 15 * 60 * 1000);
  } catch (e) {
    console.error('[admin] remote ota', e);
    ug.tracking = false;
    ug.err = (e && e.message) || String(e);
    toast(ug.err, 'err');
  } finally {
    if (!ug.tracking) ug.busy = false;
    render();
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

function mapAuthError(e) {
  const m = (e && e.message) || '';
  if (/UserNotFound|does not exist|Incorrect username or password|NotAuthorized/i.test(m)) return t('authBad');
  if (/UserNotConfirmed/i.test(m)) return t('authUnconfirmed');
  if (/Network|Failed to fetch/i.test(m)) return t('authNet');
  return m || t('authFail');
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
      h('div', { style: { fontWeight: 800, fontSize: '18px', marginBottom: '8px' } }, t('noPermTitle')),
      h('div', { class: 'faint', style: { fontSize: '13px', lineHeight: '1.6', marginBottom: '16px' } },
        '当前账号 ', h('strong', {}, account || '—'),
        ' 不是运维白名单。管理后台须用独立运维账号(如 admin)登录,与 App 个人账号无关。请打开本页 ',
        h('code', {}, '/console/admin/'), ' 并用 ADMIN_ALLOWLIST 中的账号登录。'),
      h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' } },
        h('button', { class: 'gbtn primary', onclick: async () => { iotDisconnect(); await signOut(); state.session = null; viewLogin(); } },
          t('reLogin')),
        h('a', { class: 'gbtn btn-sm', href: '../index.html#/devices', style: { textDecoration: 'none', opacity: '0.75' } },
          t('backConsole')),
      ),
    )));
}

function viewLogin(preErr) {
  const username = h('input', {
    class: 'form-input', type: 'text', id: 'admin-username', placeholder: t('phUser'),
    autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true,
  });
  const pass = h('input', {
    class: 'form-input', type: 'password', id: 'admin-password', placeholder: t('phPass'),
    autocomplete: 'current-password', required: true,
  });
  const errMsg = h('span', {}, preErr || '');
  const err = h('div', { class: 'login-error' + (preErr ? ' show' : '') }, fa('fa-circle-exclamation'), errMsg);
  const btn = h('button', { type: 'submit', class: 'btn-login' }, t('loginBtn'));
  async function submit(ev) {
    ev && ev.preventDefault();
    err.classList.remove('show');
    if (!username.value || !pass.value) {
      errMsg.textContent = t('errEmpty');
      err.classList.add('show');
      return;
    }
    btn.disabled = true;
    btn.textContent = t('loginLoading');
    try {
      const session = await signIn(username.value.trim(), pass.value);
      await enterAdmin(session);
    } catch (e) {
      errMsg.textContent = mapAuthError(e);
      err.classList.add('show');
      btn.disabled = false;
      btn.textContent = t('loginBtn');
    }
  }
  mount(app,
    ...switcherBar(false),
    h('div', { class: 'center', style: { minHeight: '100vh', padding: '40px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      h('div', { class: 'glass', style: { padding: '28px 32px', width: '100%', maxWidth: '420px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' } },
          fa('fa-shield-halved'),
          h('div', { style: { fontWeight: 800, fontSize: '18px' } }, t('loginTitle')),
        ),
        h('div', { class: 'faint', style: { fontSize: '13px', lineHeight: '1.55', marginBottom: '18px' } },
          t('loginSub')),
        h('form', { onsubmit: submit },
          err,
          h('div', { class: 'admin-field', style: { marginBottom: '12px' } },
            h('label', {}, t('labelRegion')),
            h('div', { class: 'region-tabs' }, ...REGION_ORDER.map((rc) => h('button', {
              type: 'button',
              class: 'region-tab' + (getRegion() === rc ? ' active' : ''),
              onclick: () => { setRegion(rc); viewLogin(); },
            }, regionLabel(rc)))),
          ),
          h('div', { class: 'admin-field', style: { marginBottom: '12px' } },
            h('label', { for: 'admin-username' }, t('labelUser')),
            username,
          ),
          h('div', { class: 'admin-field', style: { marginBottom: '8px' } },
            h('label', { for: 'admin-password' }, t('labelPass')),
            pass,
          ),
          btn,
        ),
        h('div', { style: { marginTop: '14px', textAlign: 'center' } },
          h('a', { class: 'faint', href: '../index.html#/devices', style: { fontSize: '12px', textDecoration: 'none' } },
            t('goConsole')),
        ),
      ),
    ),
  );
  username.focus();
}

(async function boot() {
  applyTheme(getTheme());
  setLangChangeHandler(() => {
    if (!state.session) viewLogin();
    else render();
  });
  warmupAuth();
  mount(app, h('div', { class: 'center', style: { padding: '80px' } }, loading(t('restoring'))));
  let session = null;
  try { session = await restoreSession(); } catch (_) {}
  if (!session || !session.userRow) {
    viewLogin();
    return;
  }
  await enterAdmin(session);
})();

