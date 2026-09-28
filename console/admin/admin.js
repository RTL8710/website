// 云端管理后台 — 顶级客户向：功能完整、路径最短
import {
  COGNITO, IOT_ENDPOINT, S3_BUCKET, APPSYNC, getRegion, setRegion, REGIONS, REGION_ORDER, isAdminAccount,
} from '../config.js';
import { signIn, restoreSession, resolvedCreds, signOut, warmupAuth } from '../lib/auth.js';
import {
  listAllUsers, resolveUserRow, listAllDevices, listAllDeviceUsers, listDeviceUpgrades,
  listCloudRecordsAdmin, createDeviceUpgrade, updateDeviceUpgrade, deleteDeviceUpgrade,
  updateUserAdmin, deleteUserCompletely,
  updateDeviceAdmin, deleteDeviceCompletely,
} from '../lib/graphql.js';
import { putS3Object, presignS3Get, listS3Objects, deleteS3Object, getS3Object } from '../lib/sigv4.js';
import { signS3MediaUrl } from '../lib/s3-media.js';
import { sendCommand as iotSend, disconnect as iotDisconnect } from '../lib/iot-rpc.js';
import { h, mount, loading, emptyState } from '../lib/ui.js';
import {
  t, applyTheme, applyLang, setLangChangeHandler, switcherBar, regionSwitcher, tabDefs, regionLabel, getTheme,
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
  diagLogs: null,
  diagLogsMeta: null,
  logsSource: 'app', // app | device
  q: '',
  deviceFilter: 'all', // all | online | offline
  deviceSort: 'updated', // updated | online
  deviceSortDir: 'desc', // desc | asc
  recDeviceId: '',
  recDays: 7,
  pkgFilterType: '',
  otaScope: 'device', // device | app
  toast: null,
  confirm: null,
  upload: {
    file: null, deviceType: 'smartRobot', partition: 'system', version: '',
    describe: '', upgradeType: 'AHS', mode: 'normal', progress: 0, busy: false, msg: '', err: '',
  },
  upgrade: { deviceId: '', packageId: '', partition: '', busy: false, msg: '', err: '', tracking: false, progress: 0, status: '', statusText: '', detail: '' },
  loadingTab: false,
  edit: null, // { type:'user'|'device', id, values, busy, err }
  logView: null, // { key, title, item, busy, err, files, fileName, q, wrap, showAll }
  dataRegion: null, // 当前内存数据所属区域，切区必清
};

function tabs() {
  return tabDefs().map((x) => ({ id: x.id, icon: x.icon, label: t(x.labelKey) }));
}


function clearAdminDataCache() {
  state.users = state.devices = state.binds = state.packages = state.records = null;
  state.recordsMeta = null;
  state.diagLogs = state.diagLogsMeta = null;
  // keep logsSource
  state.q = '';
  state.deviceFilter = 'all';
  state.deviceSort = 'updated';
  state.deviceSortDir = 'desc';
  state.recDeviceId = '';
  state.upgrade = {
    deviceId: '', packageId: '', partition: '', busy: false, msg: '', err: '',
    tracking: false, progress: 0, status: '', statusText: '', detail: '',
  };
  state.upload.file = null; state.upload.msg = ''; state.upload.err = '';
  state.edit = null; state.confirm = null; state.logView = null;
  state.dataRegion = null;
}
/** 切区域：先登出旧池，再换配置，清内存，回登录（各区域 Cognito/AppSync/S3 独立） */
async function changeRegion(rc) {
  if (!rc || rc === getRegion()) return;
  try { iotDisconnect(); } catch (_) {}
  try { await signOut(); } catch (_) {}
  state.session = null;
  clearAdminDataCache();
  setRegion(rc);
  warmupAuth();
  viewLogin();
}
function ensureDataRegionFresh() {
  const r = getRegion();
  if (state.dataRegion != null && state.dataRegion !== r) clearAdminDataCache();
  state.dataRegion = r;
}
function fa(cls) { return h('i', { class: 'fa-solid ' + cls }); }
function chip(text, cls) { return h('span', { class: 'chip ' + (cls || 'count') }, text); }
function statusTag(online) {
  return h('span', { class: 'status-tag ' + (online ? 'is-online' : 'is-offline') },
    h('span', { class: 'dot' }),
    online ? t('online') : t('offline'));
}
function toggleDeviceSort(key) {
  if (state.deviceSort === key) {
    state.deviceSortDir = state.deviceSortDir === 'desc' ? 'asc' : 'desc';
  } else {
    state.deviceSort = key;
    state.deviceSortDir = key === 'online' ? 'desc' : 'desc'; // 默认：在线优先 / 最近更新
  }
  render();
}
function sortTh(key, label) {
  const on = state.deviceSort === key;
  const arrow = on ? (state.deviceSortDir === 'desc' ? ' ↓' : ' ↑') : '';
  return h('button', {
    type: 'button',
    class: 'th-sort' + (on ? ' on' : ''),
    title: t('sortByCol'),
    onclick: () => toggleDeviceSort(key),
  }, label + arrow);
}
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
function idsMatch(a, b) {
  const x = String(a || '').trim();
  const y = String(b || '').trim();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.toLowerCase() === y.toLowerCase()) return true;
  const nx = x.toLowerCase().replace(/-/g, '');
  const ny = y.toLowerCase().replace(/-/g, '');
  if (nx && ny && nx === ny) return true;
  const sx = x.split(':').pop();
  const sy = y.split(':').pop();
  if (sx && sy && (sx !== x || sy !== y) && sx.toLowerCase().replace(/-/g, '') === sy.toLowerCase().replace(/-/g, '')) return true;
  return false;
}
function findUserRow(id) {
  if (!id || !state.users) return null;
  const raw = String(id).trim();
  if (!raw) return null;
  return (state.users || []).find((x) => x && (
    idsMatch(x.awsUserID, raw) || idsMatch(x.id, raw)
    || String(x.awsUserName || '').toLowerCase() === raw.toLowerCase()
    || String(x.email || '').toLowerCase() === raw.toLowerCase()
  )) || null;
}
function mergeUsers(rows) {
  if (!rows || !rows.length) return;
  const cur = state.users || [];
  rows.forEach((row) => {
    if (!row || !row.id) return;
    if (cur.some((u) => u && u.id === row.id)) return;
    cur.push(row);
  });
  state.users = cur;
}
function userLabel(id, fallbackName) {
  const u = findUserRow(id);
  return (u && (u.awsUserName || u.email)) || fallbackName || '';
}
function ownerName(ownerUserId) {
  return userLabel(ownerUserId) || shortId(ownerUserId);
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
        (u && (u.account || (u.userRow && u.userRow.awsUserName) || u.email)) || ''),
      regionSwitcher(true, getRegion(), changeRegion),
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
  const modal = state.confirm ? renderConfirm() : (state.edit ? renderEdit() : (state.logView ? renderLogView() : null));
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
  clearAdminDataCache();
  state.dataRegion = getRegion();
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
  if (kind === 'diagLogs' && state.diagLogs == null) await loadDiagLogs();
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
  ensureDataRegionFresh();
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
      if (state.diagLogs == null) {
        try { await loadDiagLogs(); } catch (_) { state.diagLogs = []; }
      }
    } else if (id === 'users') await ensure('users');
    else if (id === 'devices') { await ensure('devices'); await ensure('packages'); }
    else if (id === 'records') { await ensure('devices'); await ensure('records'); }
    else if (id === 'ota') { await ensure('devices'); await ensure('packages'); }
    else if (id === 'logs') {
      try { await ensure('users'); } catch (_) { if (!state.users) state.users = []; }
      await ensure('diagLogs');
      await hydrateLogUsers();
    }
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
  const logsN = (state.diagLogs || []).length;
  const logsTrunc = state.diagLogsMeta && state.diagLogsMeta.truncated;
  const pkgs = state.packages || [];
  const latest = pkgs.find((x) => !isAppOtaType(x.upgradeDeviceType)) || pkgs[0];
  const appN = pkgs.filter((x) => isAppOtaType(x.upgradeDeviceType)).length;
  const rc = getRegion();
  const mod = (icon, extraCls, k, v, s, onClick) => h('button', {
    type: 'button',
    class: 'logs-source' + (extraCls || ''),
    onclick: onClick,
  },
    h('span', { class: 'logs-source-ico' }, fa(icon)),
    h('span', { class: 'k' }, k),
    h('span', { class: 'v num' }, String(v)),
    h('span', { class: 's' }, s),
  );
  return h('div', { class: 'overview-page logs-page' },
    state._err ? h('div', { class: 'admin-msg err' }, state._err) : null,
    h('div', { class: 'glass logs-hero' },
      h('div', {},
        h('div', { class: 'logs-kicker' }, t('overviewEyebrow')),
        h('h1', {}, t('overview')),
        h('div', { class: 'logs-hero-sub' }, t('overviewSub')),
        h('div', { class: 'logs-hero-meta' },
          chip(regionLabel(rc)),
          chip(online + ' ' + t('online'), 'stat-online'),
        ),
      ),
      h('div', { class: 'logs-source-grid' },
        h('button', {
          type: 'button',
          class: 'logs-source on',
          onclick: () => { state.deviceFilter = 'online'; goTab('devices'); },
        },
          h('span', { class: 'logs-source-ico' }, fa('fa-wifi')),
          h('span', { class: 'k' }, t('onlineCount')),
          h('span', { class: 'v num' }, String(online)),
          h('span', { class: 's' }, d ? (online + ' / ' + d + ' ' + t('devicesCount')) : t('devicesEmpty')),
        ),
        h('button', {
          type: 'button',
          class: 'logs-source is-device' + (latest ? ' on' : ''),
          onclick: () => { state.otaScope = 'device'; goTab('ota'); },
        },
          h('span', { class: 'logs-source-ico' }, fa('fa-rocket')),
          h('span', { class: 'k' }, t('overviewLatestPkg')),
          h('span', { class: 'v num' }, latest ? ('v' + (latest.upgradeDeviceVersion || '?')) : '—'),
          h('span', { class: 's' }, latest
            ? ((latest.upgradeDeviceType || '') + (latest.upgradeOtaTime ? ' · ' + logsRelTime(latest.upgradeOtaTime) : ''))
            : t('overviewNoPkg')),
        ),
      ),
    ),
    h('div', { class: 'logs-source-grid trio' },
      mod('fa-user', '', t('tabUsers'), u, t('usersCount'), () => goTab('users')),
      mod('fa-robot', '', t('tabDevices'), d, t('devicesCount'), () => { state.deviceFilter = 'all'; goTab('devices'); }),
      mod('fa-file-lines', '', t('tabLogs'), logsN + (logsTrunc ? '+' : ''), t('logsCount'), () => goTab('logs')),
      mod('fa-cloud', ' is-device', t('tabRecords'), r + (trunc ? '+' : ''), t('recordsCount'), () => goTab('records')),
      mod('fa-rocket', ' is-device', t('tabOta'), p, t('pkgsCount'), () => { state.otaScope = 'device'; goTab('ota'); }),
      mod('fa-mobile-alt', '', t('otaScopeApp'),
        appN,
        t('pkgsCount'), () => { state.otaScope = 'app'; goTab('ota'); }),
    ),
    h('div', { class: 'glass ota-panel' },
      h('h3', {}, h('span', { class: 'logs-source-ico' }, fa('fa-bolt')), t('commonOps')),
      latest
        ? h('div', { class: 'ota-latest' },
            h('div', { class: 'faint', style: { fontSize: '11px', fontWeight: '800', letterSpacing: '.08em', textTransform: 'uppercase' } }, t('overviewLatestPkg')),
            h('div', { class: 'v' }, 'v' + (latest.upgradeDeviceVersion || '?')),
            h('div', { class: 's' },
              (latest.upgradeDeviceType || '') + ' · ' + (latest.upgradeDevicePartion || '') + ' · ' + (latest.upgradeDescribe || '')),
          )
        : h('div', { class: 'ota-latest' }, h('div', { class: 's' }, t('overviewNoPkg'))),
      h('div', { class: 'row-actions', style: { marginTop: '14px' } },
        h('button', { class: 'gbtn primary', onclick: () => goTab('devices') }, fa('fa-rocket'), ' ' + t('upgradeDevices')),
        h('button', { class: 'gbtn', onclick: () => goTab('ota') }, fa('fa-upload'), ' ' + t('uploadPkg')),
        h('button', { class: 'gbtn', onclick: () => refreshAll() }, fa('fa-rotate'), ' ' + t('refresh')),
      ),
    ),
  );
}

function studioSearch(ph) {
  const wrap = h('div', { class: 'logs-search' }, fa('fa-magnifying-glass'));
  wrap.appendChild(searchBox(ph));
  return wrap;
}
function studioGroups(items, timeFn, limit) {
  const groups = [];
  (items || []).slice(0, limit || 500).forEach((it) => {
    const key = logsDayKey(timeFn(it));
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) groups.push({ key, items: [it] });
    else last.items.push(it);
  });
  return groups;
}
function studioEmpty(icon, title, hint) {
  return h('div', { class: 'glass logs-empty' },
    fa(icon), h('h2', {}, title), hint ? h('p', {}, hint) : null);
}
function studioStream(groups, renderItem) {
  return h('div', { class: 'logs-stream' },
    ...groups.map((g) => h('section', { class: 'logs-day' },
      h('div', { class: 'logs-day-h' }, logsDayLabel(g.key) + ' · ' + g.items.length),
      ...g.items.map(renderItem),
    )));
}

function viewUsers() {
  let rows = (state.users || []).filter((u) => u && matchQ([u.awsUserName, u.email, u.phoneNumber, u.id, u.awsUserID, u.region]));
  rows = rows.slice().sort((a, b) => {
    const ta = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    const tb = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    return tb - ta;
  });
  const latest = rows[0];
  const stream = state.loadingTab || !state.users
    ? loading('…')
    : (!rows.length
      ? studioEmpty('fa-user', t('usersEmpty'), t('usersEmptyHint'))
      : studioStream(studioGroups(rows, (u) => u.updatedAt || u.createdAt), (u) => {
          const name = u.awsUserName || u.email || shortId(u.id);
          return h('article', {
            class: 'glass logs-card',
            onclick: () => openEditUser(u),
          },
            h('div', { class: 'logs-card-mark' }, fa('fa-user')),
            h('div', { class: 'logs-card-body' },
              h('div', { class: 'logs-card-code', style: { cursor: 'default' } }, name),
              h('div', { class: 'logs-card-meta' },
                u.email ? h('span', { class: 'logs-chip mute' }, h('span', { class: 'clip' }, u.email)) : null,
                u.phoneNumber ? h('span', { class: 'logs-chip mute' }, u.phoneNumber) : null,
                u.region ? h('span', { class: 'logs-chip' }, u.region) : null,
                u.id ? h('span', {
                  class: 'logs-chip mute', title: u.id,
                  onclick: (e) => { e.stopPropagation(); copyText(u.id); },
                }, 'ID', h('span', { class: 'clip' }, shortId(u.id))) : null,
                u.awsUserID ? h('span', {
                  class: 'logs-chip mute', title: u.awsUserID,
                  onclick: (e) => { e.stopPropagation(); copyText(u.awsUserID); },
                }, 'Cognito', h('span', { class: 'clip' }, shortId(u.awsUserID))) : null,
              ),
            ),
            h('div', { class: 'logs-card-side' },
              h('div', { class: 'logs-card-when' },
                h('b', {}, logsRelTime(u.updatedAt || u.createdAt)),
                fmt(u.updatedAt || u.createdAt),
              ),
              h('div', { class: 'row-actions', onclick: (e) => e.stopPropagation() },
                h('button', { class: 'gbtn icon btn-sm', title: t('edit'), 'aria-label': t('edit'), onclick: () => openEditUser(u) }, fa('fa-pen')),
                h('button', { class: 'gbtn icon btn-sm danger', title: t('delete'), 'aria-label': t('delete'), onclick: () => askDeleteUser(u) }, fa('fa-trash')),
              ),
            ),
          );
        }));
  return h('div', { class: 'users-page logs-page' },
    h('div', { class: 'glass logs-hero' },
      h('div', {},
        h('div', { class: 'logs-kicker' }, t('usersEyebrow')),
        h('h1', {}, t('users')),
        h('div', { class: 'logs-hero-sub' }, t('usersSub')),
        h('div', { class: 'logs-hero-meta' }, chip(String(rows.length) + ' ' + t('usersCount'))),
      ),
      h('div', { class: 'logs-source-grid' },
        h('div', { class: 'logs-source on info' },
          h('span', { class: 'logs-source-ico' }, fa('fa-user')),
          h('span', { class: 'k' }, t('usersCount')),
          h('span', { class: 'v num' }, String((state.users || []).length)),
          h('span', { class: 's' }, getRegion().toUpperCase()),
        ),
        h('div', { class: 'logs-source info' },
          h('span', { class: 'logs-source-ico' }, fa('fa-clock')),
          h('span', { class: 'k' }, t('logsLatest')),
          h('span', { class: 'v num' }, latest ? shortId(latest.awsUserName || latest.email || latest.id) : '—'),
          h('span', { class: 's' }, latest ? logsRelTime(latest.updatedAt || latest.createdAt) : '—'),
        ),
      ),
    ),
    h('div', { class: 'glass logs-dock' },
      studioSearch(t('searchUsers')),
      h('button', { class: 'gbtn btn-sm', onclick: async () => { state.users = null; await loadTab('users'); } }, fa('fa-rotate'), ' ' + t('refresh')),
    ),
    stream,
  );
}

function deviceCardMark(d) {
  const raw = d._pictureRaw || d.picture || (d.raw && d.raw.devicePicture) || '';
  const mark = h('div', { class: 'logs-card-mark' + (raw ? ' has-thumb' : '') + (d.online ? '' : ' is-off') });
  if (raw) mark.appendChild(mediaThumb(raw, { w: '44px', h: '44px' }));
  else mark.appendChild(fa(otaPkgIcon(resolveDeviceType(d))));
  return mark;
}

function viewDevices() {
  const all = (state.devices || []).filter(Boolean);
  const onlineN = all.filter((d) => d.online).length;
  const offlineN = all.length - onlineN;
  let rows = all.slice();
  if (state.deviceFilter === 'online') rows = rows.filter((d) => d.online);
  if (state.deviceFilter === 'offline') rows = rows.filter((d) => !d.online);
  rows = rows.filter((d) => matchQ([d.name, d.model, d.uuid, d.id, d.firmware, d.ownerUserId, ownerName(d.ownerUserId)]));
  const dir = state.deviceSortDir === 'asc' ? 1 : -1;
  rows = rows.slice().sort((a, b) => {
    if (state.deviceSort === 'online') {
      const o = (a.online|0) - (b.online|0);
      if (o !== 0) return o * dir;
      const ta = Date.parse(a.updatedAt || a.createdAt || '') || 0;
      const tb = Date.parse(b.updatedAt || b.createdAt || '') || 0;
      return (tb - ta);
    }
    const ta = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    const tb = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    if (ta !== tb) return (ta - tb) * dir;
    if ((b.online|0) !== (a.online|0)) return (b.online|0) - (a.online|0);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const filterCard = (id, count, icon, extraCls) => h('button', {
    type: 'button',
    class: 'logs-source' + (extraCls || '') + ((state.deviceFilter || 'all') === id ? ' on' : ''),
    onclick: () => { state.deviceFilter = id; render(); },
  },
    h('span', { class: 'logs-source-ico' }, fa(icon)),
    h('span', { class: 'k' }, id === 'all' ? t('all') : (id === 'online' ? t('online') : t('offline'))),
    h('span', { class: 'v num' }, String(count)),
    h('span', { class: 's' }, t('devicesCount')),
  );

  let stream;
  if (state.loadingTab && !state.devices) stream = loading('…');
  else if (state._err && !(state.devices && state.devices.length)) {
    stream = h('div', {},
      h('div', { class: 'admin-msg err' }, state._err),
      h('button', { class: 'gbtn', style: { marginTop: '10px' },
        onclick: async () => { state.devices = null; state._err = ''; await loadTab('devices'); } }, t('refresh')));
  } else if (!state.devices) stream = loading('…');
  else {
    const list = rows.filter((d) => d && d.id);
    stream = !list.length
      ? studioEmpty('fa-robot', t('devicesEmpty'), t('devicesEmptyHint'))
      : studioStream(studioGroups(list, (d) => d.updatedAt || d.createdAt), (d) => {
          const binds = bindUsersForDevice(d.id);
          const latest = latestPackageForType(resolveDeviceType(d));
          return h('article', {
            class: 'glass logs-card' + (d.online ? '' : ' is-device'),
            onclick: () => openDevice(d),
          },
            deviceCardMark(d),
            h('div', { class: 'logs-card-body' },
              h('div', { class: 'logs-card-code', style: { cursor: 'default' } }, d.name || shortId(d.id)),
              h('div', { class: 'logs-card-meta' },
                statusTag(!!d.online),
                d.model ? h('span', { class: 'logs-chip' }, d.model) : null,
                d.firmware ? h('span', { class: 'logs-chip mute' }, 'v' + d.firmware) : null,
                h('span', { class: 'logs-chip mute' }, t('colOwner') + ' ' + ownerName(d.ownerUserId)),
                h('span', { class: 'logs-chip mute' }, t('colBinds') + ' ' + binds.length),
                d.uuid
                  ? h('span', {
                      class: 'logs-chip mute', title: d.uuid,
                      onclick: (e) => { e.stopPropagation(); copyText(d.uuid); },
                    }, 'UUID', h('span', { class: 'clip' }, shortId(d.uuid)))
                  : h('span', { class: 'logs-chip warn' }, 'UUID —'),
              ),
            ),
            h('div', { class: 'logs-card-side' },
              h('div', { class: 'logs-card-when' },
                h('b', {}, logsRelTime(d.updatedAt || d.createdAt)),
                fmt(d.updatedAt || d.createdAt),
              ),
              h('div', { class: 'row-actions', onclick: (e) => e.stopPropagation() },
                h('button', { class: 'gbtn primary btn-sm', onclick: () => openDevice(d) }, t('enter')),
                h('button', {
                  class: 'gbtn btn-sm',
                  disabled: !d.uuid || !latest,
                  title: !d.uuid ? '缺少 deviceUuid' : (!latest ? '无可用升级包' : `升级到 ${latest.upgradeDeviceVersion}`),
                  onclick: () => askUpgradeLatest(d),
                }, t('upgradeLatest')),
                h('button', { class: 'gbtn icon btn-sm', title: t('edit'), 'aria-label': t('edit'), onclick: () => openEditDevice(d) }, fa('fa-pen')),
                h('button', { class: 'gbtn icon btn-sm danger', title: t('delete'), 'aria-label': t('delete'), onclick: () => askDeleteDevice(d) }, fa('fa-trash')),
              ),
            ),
          );
        });
  }

  return h('div', { class: 'devices-page logs-page' },
    h('div', { class: 'glass logs-hero' },
      h('div', {},
        h('div', { class: 'logs-kicker' }, t('devicesEyebrow')),
        h('h1', {}, t('devices')),
        h('div', { class: 'logs-hero-sub' }, t('devicesSub')),
        h('div', { class: 'logs-hero-meta' },
          chip(String(rows.length) + ' ' + t('devicesCount')),
          chip(onlineN + ' ' + t('online'), 'stat-online'),
        ),
      ),
      h('div', { class: 'logs-source-grid trio' },
        filterCard('all', all.length, 'fa-robot', ''),
        filterCard('online', onlineN, 'fa-wifi', ''),
        filterCard('offline', offlineN, 'fa-power-off', ' is-device'),
      ),
    ),
    h('div', { class: 'glass logs-dock' },
      studioSearch(t('searchDevices')),
      h('button', { class: 'gbtn btn-sm', onclick: async () => { state.devices = state.binds = null; await loadTab('devices'); } }, fa('fa-rotate'), ' ' + t('refresh')),
    ),
    stream,
  );
}

function viewRecords() {
  const rows = (state.records || []).filter((r) => matchQ([r.deviceID, r.id, r.resolution, r.type, String(r.channel)])).slice()
    .sort((a, b) => (Date.parse(b.dateTime || '') || 0) - (Date.parse(a.dateTime || '') || 0));
  const trunc = state.recordsMeta && state.recordsMeta.truncated;
  const deviceSel = h('select', {},
    h('option', { value: '' }, t('recordsAllDevices')),
    ...(state.devices || []).map((d) => h('option', { value: d.id, selected: state.recDeviceId === d.id },
      `${d.name || d.id}`)));
  deviceSel.addEventListener('change', () => { state.recDeviceId = deviceSel.value; });
  const daysSel = h('select', {},
    ...[1, 3, 7, 14, 30].map((n) => h('option', { value: String(n), selected: Number(state.recDays) === n }, t('recordsDays').replace('{n}', String(n)))));
  daysSel.addEventListener('change', () => { state.recDays = Number(daysSel.value); });

  const dayCard = (n) => h('button', {
    type: 'button',
    class: 'logs-source' + (Number(state.recDays) === n ? ' on' : ''),
    onclick: async () => {
      state.recDays = n;
      state.records = null; render();
      try { await loadRecords(); toast(t('dataRefreshed')); }
      catch (e) { toast((e && e.message) || String(e), 'err'); }
      render();
    },
  },
    h('span', { class: 'logs-source-ico' }, fa('fa-calendar-day')),
    h('span', { class: 'k' }, t('recordsDays').replace('{n}', String(n))),
    h('span', { class: 'v num' }, String(n)),
    h('span', { class: 's' }, Number(state.recDays) === n ? (String(rows.length) + ' ' + t('recordsCount')) : t('recordsDays').replace('{n}', String(n))),
  );

  const stream = state.records == null
    ? loading('…')
    : (!rows.length
      ? studioEmpty('fa-cloud', t('recordsEmpty'), t('recordsEmptyHint'))
      : studioStream(studioGroups(rows, (r) => r.dateTime), (r) => {
          const dur = r.duration ? (r.duration + 's') : '—';
          const dev = (state.devices || []).find((d) => d.id === r.deviceID || d.uuid === r.deviceID);
          return h('article', { class: 'glass logs-card static is-device' },
            h('div', { class: 'logs-card-mark has-thumb rec-thumb' },
              mediaThumb(r.thumbnailUrl, { w: '72px', h: '44px' })),
            h('div', { class: 'logs-card-body' },
              h('div', { class: 'logs-card-code', style: { cursor: 'default' } }, fmt(r.dateTime)),
              h('div', { class: 'logs-card-meta' },
                h('span', {
                  class: 'logs-chip', title: r.deviceID,
                  onclick: () => copyText(r.deviceID),
                }, fa('fa-microchip'), h('span', { class: 'clip' }, (dev && dev.name) || shortId(r.deviceID))),
                h('span', { class: 'logs-chip mute' }, dur),
                r.channel != null ? h('span', { class: 'logs-chip mute' }, 'CH ' + r.channel) : null,
                r.resolution ? h('span', { class: 'logs-chip mute' }, r.resolution) : null,
                r.type ? h('span', { class: 'logs-chip' }, r.type) : null,
              ),
            ),
            h('div', { class: 'logs-card-side' },
              h('div', { class: 'logs-card-when' },
                h('b', {}, logsRelTime(r.dateTime)),
                fmt(r.dateTime),
              ),
            ),
          );
        }));

  return h('div', { class: 'records-page logs-page' },
    h('div', { class: 'glass logs-hero' },
      h('div', {},
        h('div', { class: 'logs-kicker' }, t('recordsEyebrow')),
        h('h1', {}, t('records')),
        h('div', { class: 'logs-hero-sub' }, t('recordsSub')),
        h('div', { class: 'logs-hero-meta' },
          chip(String(rows.length) + ' ' + t('recordsCount')),
          trunc ? chip(t('recordsTrunc'), 'stat-offline') : null,
        ),
      ),
      h('div', { class: 'logs-source-grid trio' },
        dayCard(1), dayCard(7), dayCard(30),
      ),
    ),
    h('div', { class: 'glass logs-dock' },
      studioSearch(t('recordsSearch')),
      deviceSel, daysSel,
      h('button', { class: 'gbtn primary btn-sm', onclick: async () => {
        state.records = null; render();
        try { await loadRecords(); toast(t('dataRefreshed')); }
        catch (e) { toast((e && e.message) || String(e), 'err'); }
        render();
      } }, t('recordsQuery')),
      h('button', { class: 'gbtn btn-sm', onclick: async () => {
        state.records = null; render();
        try { await loadRecords(); toast(t('dataRefreshed')); }
        catch (e) { toast((e && e.message) || String(e), 'err'); }
        render();
      } }, fa('fa-rotate'), ' ' + t('refresh')),
    ),
    stream,
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
  const isPkg = e.type === 'upgrade';
  const title = isUser ? t('editUser') : (isPkg ? t('editPkg') : t('editDevice'));
  const fields = isUser
    ? [
        fieldInput(e, 'awsUserName', '用户名'),
        fieldInput(e, 'email', '邮箱'),
        fieldInput(e, 'phoneNumber', '手机'),
        fieldInput(e, 'region', '区域', { ph: '如 ap-northeast-1 / 东南亚' }),
        fieldInput(e, 'picture', '头像 URL', { span2: true }),
      ]
    : isPkg
    ? [
        fieldInput(e, 'upgradeDeviceType', t('appType')),
        fieldInput(e, 'upgradeDeviceVersion', t('version')),
        fieldInput(e, 'upgradeDevicePartion', t('partition')),
        fieldInput(e, 'upgradeMode', t('upgradeMode'), { ph: 'normal / force / night' }),
        fieldInput(e, 'upgradeDescribe', t('describe'), { textarea: true, span2: true }),
        fieldInput(e, 'upgradeFileUrl', 'S3', { span2: true }),
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
      } else if (isPkg) {
        const ver = (e.values.upgradeDeviceVersion || '').trim();
        const desc = (e.values.upgradeDescribe || '').trim();
        if (!ver) throw new Error('请填写版本');
        if (!desc) throw new Error('请填写说明');
        await updateDeviceUpgrade({
          id: e.id,
          upgradeDeviceType: (e.values.upgradeDeviceType || '').trim() || null,
          upgradeDeviceVersion: ver,
          upgradeDevicePartion: (e.values.upgradeDevicePartion || '').trim() || null,
          upgradeMode: (e.values.upgradeMode || '').trim() || 'normal',
          upgradeDescribe: desc,
          upgradeFileUrl: (e.values.upgradeFileUrl || '').trim() || null,
        });
        toast('升级包已更新');
        state.edit = null;
        state.packages = null;
        await loadTab('ota');
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

const DEVICE_OTA_TYPES = ['smartRobot', 'smartIpcamera'];
const APP_OTA_TYPES = ['smartCameraApp', 'robotApp', 'cardvApp', 'smartScreenApp', 'iosApp'];
const DEFAULT_APP_OTA_TYPE = 'smartCameraApp';
const DEFAULT_APP_OTA_DESC = '细节优化，提升用户体验。';
function isAppOtaType(type) { return APP_OTA_TYPES.indexOf(String(type || '')) >= 0; }
function ensureOtaScopeDefaults() {
  const u = state.upload;
  if (state.otaScope === 'app') {
    if (!isAppOtaType(u.deviceType)) u.deviceType = DEFAULT_APP_OTA_TYPE;
    if (!String(u.describe || '').trim()) u.describe = DEFAULT_APP_OTA_DESC;
    if (DEVICE_OTA_TYPES.indexOf(u.partition) >= 0 || ['system', 'website', 'model', 'config', 'all'].indexOf(u.partition) >= 0) {
      // keep android/ios if already set; else default android
      if (['android', 'ios', 'all'].indexOf(u.partition) < 0) u.partition = 'android';
    }
    if (!u.mode) u.mode = 'normal';
  } else if (isAppOtaType(u.deviceType)) {
    u.deviceType = 'smartRobot';
    if (['android', 'ios'].indexOf(u.partition) >= 0) u.partition = 'system';
  }
}


function s3KeyFromUpgradeUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (s.startsWith('public/')) return s;
  try {
    const u = new URL(s);
    const path = decodeURIComponent(u.pathname || '').replace(/^\/+/, '');
    return path.split('?')[0];
  } catch (_) {
    return '';
  }
}
function openEditPackage(pkg) {
  state.edit = {
    type: 'upgrade',
    id: pkg.id,
    busy: false,
    err: '',
    values: {
      upgradeDeviceType: pkg.upgradeDeviceType || '',
      upgradeDeviceVersion: pkg.upgradeDeviceVersion || '',
      upgradeDevicePartion: pkg.upgradeDevicePartion || '',
      upgradeMode: pkg.upgradeMode || 'normal',
      upgradeDescribe: pkg.upgradeDescribe || '',
      upgradeFileUrl: pkg.upgradeFileUrl || '',
    },
  };
  render();
}
function askDeletePackage(pkg) {
  const label = `${pkg.upgradeDeviceType || ''} v${pkg.upgradeDeviceVersion || '?'} · ${pkg.upgradeDevicePartion || ''} · ${pkg.upgradeMode || 'normal'}`;
  state.confirm = {
    title: t('confirmDelPkg'),
    body: `${label}\n${pkg.upgradeDescribe || ''}\n${pkg.upgradeFileUrl || ''}\n\n将删除云端登记记录，并尝试删除对应 S3 文件。`,
    okText: t('confirmDelOk'),
    onOk: async () => {
      state.confirm = null; render();
      try {
        const key = s3KeyFromUpgradeUrl(pkg.upgradeFileUrl);
        if (key) {
          try {
            const creds = await resolvedCreds();
            await deleteS3Object(creds, { bucket: S3_BUCKET, region: COGNITO.region, key });
          } catch (e) {
            console.warn('[admin] delete pkg s3', e);
          }
        }
        await deleteDeviceUpgrade(pkg.id);
        toast('升级包已删除');
        state.packages = null;
        await loadTab('ota');
      } catch (e) {
        console.error('[admin] delete pkg', e);
        toast((e && e.message) || String(e), 'err');
      }
    },
  };
  render();
}
function pkgRowActions(pkg, ug, isApp) {
  const btns = [];
  if (!isApp) {
    btns.push(h('button', { class: 'gbtn primary btn-sm', onclick: (e) => {
      e.stopPropagation();
      ug.packageId = pkg.id; ug.partition = pkg.upgradeDevicePartion || '';
      toast(t('otaPicked'));
      render();
    } }, t('otaUse')));
  }
  btns.push(h('button', {
    class: 'gbtn icon btn-sm', title: t('edit'), 'aria-label': t('edit'),
    onclick: (e) => { e.stopPropagation(); openEditPackage(pkg); },
  }, fa('fa-pen')));
  btns.push(h('button', {
    class: 'gbtn icon btn-sm danger', title: t('delete'), 'aria-label': t('delete'),
    onclick: (e) => { e.stopPropagation(); askDeletePackage(pkg); },
  }, fa('fa-trash')));
  return h('div', { class: 'row-actions' }, ...btns);
}

function otaPkgTime(pkg) {
  return (pkg && (pkg.upgradeOtaTime || pkg.createdAt)) || '';
}

function otaPkgIcon(typ) {
  const s = String(typ || '').toLowerCase();
  if (s.includes('app') || s.includes('ios')) return 'fa-mobile-alt';
  if (s.includes('ipc') || s.includes('camera')) return 'fa-video';
  if (s.includes('robot')) return 'fa-robot';
  return 'fa-rocket';
}

function otaModeChip(mode) {
  const m = String(mode || 'normal');
  const cls = m === 'force' ? 'warn' : (m === 'night' ? 'night' : '');
  return h('span', { class: 'logs-chip' + (cls ? ' ' + cls : '') }, m);
}

function switchOtaScope(k) {
  const u = state.upload;
  state.otaScope = k;
  state.pkgFilterType = '';
  state.q = '';
  if (k === 'app') {
    if (!isAppOtaType(u.deviceType)) u.deviceType = DEFAULT_APP_OTA_TYPE;
    if (!String(u.describe || '').trim()) u.describe = DEFAULT_APP_OTA_DESC;
    if (['android', 'ios', 'all'].indexOf(u.partition) < 0) u.partition = 'android';
  } else if (isAppOtaType(u.deviceType)) {
    u.deviceType = 'smartRobot';
    u.partition = 'system';
  }
  render();
}

function otaSourceCard(id, count, latestIso, latestVer) {
  const on = (state.otaScope === 'app' ? 'app' : 'device') === id;
  const isDev = id === 'device';
  const empty = isDev ? t('otaEmptyDevice') : t('otaAppListEmpty');
  const sub = latestVer
    ? ('v' + latestVer + (latestIso ? ' · ' + logsRelTime(latestIso) : ''))
    : empty;
  return h('button', {
    type: 'button',
    class: 'logs-source' + (isDev ? ' is-device' : '') + (on ? ' on' : ''),
    onclick: () => switchOtaScope(id),
  },
    h('span', { class: 'logs-source-ico' }, fa(isDev ? 'fa-robot' : 'fa-mobile-alt')),
    h('span', { class: 'k' }, isDev ? t('otaScopeDevice') : t('otaScopeApp')),
    h('span', { class: 'v num' }, String(count)),
    h('span', { class: 's' }, sub),
  );
}

function otaPkgCard(pkg, ug, isApp, latestIds) {
  const when = otaPkgTime(pkg);
  const selected = !isApp && ug.packageId === pkg.id;
  const latest = latestIds.has(pkg.id);
  const ver = pkg.upgradeDeviceVersion || '—';
  const url = pkg.upgradeFileUrl || '';
  return h('article', {
    class: 'glass logs-card' + (isApp ? ' static' : ' is-device') + (selected ? ' on' : ''),
    onclick: isApp ? undefined : () => {
      ug.packageId = pkg.id;
      ug.partition = pkg.upgradeDevicePartion || '';
      render();
    },
  },
    h('div', { class: 'logs-card-mark' }, fa(otaPkgIcon(pkg.upgradeDeviceType))),
    h('div', { class: 'logs-card-body' },
      h('div', { class: 'logs-card-code', style: { cursor: 'default' } },
        'v' + ver,
        latest ? h('span', { class: 'log-now' }, t('otaLatestBadge')) : null,
      ),
      h('div', { class: 'logs-card-meta' },
        pkg.upgradeDeviceType ? h('span', { class: 'logs-chip' }, pkg.upgradeDeviceType) : null,
        pkg.upgradeDevicePartion ? h('span', { class: 'logs-chip mute' }, pkg.upgradeDevicePartion) : null,
        otaModeChip(pkg.upgradeMode),
        pkg.upgradeDescribe ? h('span', { class: 'logs-chip mute' }, h('span', { class: 'clip' }, pkg.upgradeDescribe)) : null,
        url ? h('span', {
          class: 'logs-chip mute',
          title: url,
          onclick: (e) => { e.stopPropagation(); copyText(url); },
        }, fa('fa-link'), h('span', { class: 'clip' }, shortId(url))) : null,
      ),
    ),
    h('div', { class: 'logs-card-side' },
      h('div', { class: 'logs-card-when' },
        h('b', {}, logsRelTime(when)),
        fmt(when),
      ),
      pkgRowActions(pkg, ug, isApp),
    ),
  );
}

function viewOta() {
  const u = state.upload;
  const ug = state.upgrade;
  const devices = state.devices || [];
  const packages = state.packages || [];
  ensureOtaScopeDefaults();
  const isApp = state.otaScope === 'app';
  if (!isApp) ensureDefaultUpgradeSelection();

  const appPkgs = packages.filter((p) => isAppOtaType(p.upgradeDeviceType));
  const devPkgs = packages.filter((p) => !isAppOtaType(p.upgradeDeviceType));
  const sortPkg = (a, b) => (Date.parse(otaPkgTime(b)) || 0) - (Date.parse(otaPkgTime(a)) || 0);
  const appSorted = appPkgs.slice().sort(sortPkg);
  const devSorted = devPkgs.slice().sort(sortPkg);

  let list = (isApp ? appPkgs : devPkgs).slice();
  if (state.pkgFilterType) list = list.filter((p) => p.upgradeDeviceType === state.pkgFilterType);
  list = list.filter((p) => matchQ([p.upgradeDeviceVersion, p.upgradeDescribe, p.upgradeFileUrl, p.upgradeDeviceType, p.upgradeDevicePartion, p.upgradeMode]));
  list.sort(sortPkg);

  const fileInput = h('input', { type: 'file', accept: isApp ? '.apk,application/vnd.android.package-archive' : undefined, style: { display: 'none' } });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    u.file = f || null;
    if (f) {
      const name = f.name || '';
      if (isApp) {
        if (/\.apk$/i.test(name)) {
          if (!isAppOtaType(u.deviceType)) u.deviceType = DEFAULT_APP_OTA_TYPE;
          u.partition = 'android';
        }
        if (/ios|ipa/i.test(name)) { u.deviceType = 'iosApp'; u.partition = 'ios'; }
        if (/robot/i.test(name) && isAppOtaType('robotApp')) u.deviceType = 'robotApp';
        if (/camera|ipc/i.test(name)) u.deviceType = 'smartCameraApp';
        if (/cardv/i.test(name)) u.deviceType = 'cardvApp';
      } else {
        if (looksRobot(name)) u.deviceType = 'smartRobot';
        const part = inferPart(name); if (part) u.partition = part;
      }
      const ver = inferVer(name); if (ver) u.version = ver;
      if (!u.describe) u.describe = isApp ? DEFAULT_APP_OTA_DESC : name;
    }
    render();
  });

  const typeOptions = isApp ? APP_OTA_TYPES : DEVICE_OTA_TYPES;
  const typeSel = h('select', {}, ...typeOptions.map((typ) => h('option', { value: typ, selected: u.deviceType === typ }, typ)));
  typeSel.addEventListener('change', () => { u.deviceType = typeSel.value; render(); });

  const partOptions = isApp ? ['android', 'ios', 'all'] : ['system', 'website', 'model', 'config', 'all'];
  const partSel = h('select', {}, ...partOptions.map((part) => h('option', { value: part, selected: u.partition === part }, part)));
  partSel.addEventListener('change', () => { u.partition = partSel.value; });

  const modeSel = h('select', {}, ...['normal', 'force', 'night'].map((m) => h('option', { value: m, selected: (u.mode || 'normal') === m }, m)));
  modeSel.addEventListener('change', () => { u.mode = modeSel.value; });

  const verIn = h('input', { value: u.version, placeholder: isApp ? '1.0.0+1' : '1.0.27' });
  verIn.addEventListener('input', () => { u.version = verIn.value; });
  const descIn = h('textarea', { placeholder: t('describe') }, u.describe);
  descIn.addEventListener('input', () => { u.describe = descIn.value; });

  const filterType = h('select', {},
    h('option', { value: '' }, isApp ? t('allAppTypes') : t('otaAllTypes')),
    ...typeOptions.map((typ) => h('option', { value: typ, selected: state.pkgFilterType === typ }, typ)));
  filterType.addEventListener('change', () => { state.pkgFilterType = filterType.value; render(); });

  const drop = h('button', {
    type: 'button',
    class: 'ota-drop',
    onclick: () => fileInput.click(),
  },
    h('span', { class: 'logs-source-ico' }, fa('fa-cloud-arrow-up')),
    h('span', {},
      h('div', { class: 'nm' }, u.file ? u.file.name : t('otaDrop')),
      h('div', { class: 'hint' },
        u.file
          ? (Math.round(u.file.size / 1024) + ' KB')
          : (isApp ? t('otaAppFileHint') : t('otaFileHintDevice'))),
    ),
  );

  const uploadPanel = h('div', { class: 'glass ota-panel' },
    h('h3', {}, h('span', { class: 'logs-source-ico' }, fa('fa-upload')), isApp ? t('btnUploadApp') : t('stepUpload')),
    fileInput,
    drop,
    h('div', { class: 'admin-form', style: { marginTop: '14px' } },
      h('div', { class: 'admin-field' }, h('label', {}, isApp ? t('appType') : t('deviceType')), typeSel),
      h('div', { class: 'admin-field' }, h('label', {}, t('partition')), partSel),
      h('div', { class: 'admin-field' }, h('label', {}, t('upgradeMode')), modeSel),
      h('div', { class: 'admin-field' }, h('label', {}, t('version')), verIn),
      h('div', { class: 'admin-field span2' }, h('label', {}, t('describe')), descIn),
    ),
    h('div', { class: 'progress' }, h('i', { style: { width: (u.progress || 0) + '%' } })),
    h('div', { class: 'row-actions', style: { marginTop: '12px' } },
      h('button', { class: 'gbtn primary', disabled: u.busy, onclick: () => doUpload() },
        u.busy ? `${t('uploading')} ${u.progress}%` : (isApp ? t('btnUploadApp') : t('btnUpload')))),
    u.msg ? h('div', { class: 'admin-msg ok' }, u.msg) : null,
    u.err ? h('div', { class: 'admin-msg err' }, u.err) : null,
  );

  let secondPanel;
  if (isApp) {
    const latestApp = latestPackageForType(u.deviceType);
    secondPanel = h('div', { class: 'glass ota-panel' },
      h('h3', {}, h('span', { class: 'logs-source-ico' }, fa('fa-mobile-alt')), t('otaScopeApp')),
      h('div', { class: 'ota-note' }, t('otaAppHint')),
      latestApp
        ? h('div', { class: 'ota-latest' },
            h('div', { class: 'faint', style: { fontSize: '11px', fontWeight: '800', letterSpacing: '.08em', textTransform: 'uppercase' } }, t('logsLatest')),
            h('div', { class: 'v' }, 'v' + (latestApp.upgradeDeviceVersion || '?')),
            h('div', { class: 's' },
              (latestApp.upgradeDeviceType || '') + ' · ' + (latestApp.upgradeMode || 'normal') + ' · ' + (latestApp.upgradeDescribe || '')),
          )
        : h('div', { class: 'ota-latest' },
            h('div', { class: 's' }, t('otaNoPkgForType'))),
      h('div', { class: 'row-actions', style: { marginTop: '14px' } },
        h('button', { class: 'gbtn', onclick: async () => { state.packages = null; await loadTab('ota'); } }, fa('fa-rotate'), ' ' + t('refresh')),
      ),
    );
  } else {
    const onlineDevs = devices.filter((d) => d.online);
    const onlineReady = devices.filter((d) => d.online && d.uuid);
    const devSel = h('select', { style: { width: '100%' } },
      h('option', { value: '' }, t('otaPickDevice').replace('{online}', String(onlineDevs.length)).replace('{ready}', String(onlineReady.length))),
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
    const latestIdsSel = new Set();
    DEVICE_OTA_TYPES.forEach((typ) => { const L = latestPackageForType(typ); if (L) latestIdsSel.add(L.id); });
    const devicePkgs = packages.filter((p) => !isAppOtaType(p.upgradeDeviceType));
    const pkgSel = h('select', { style: { width: '100%' } },
      h('option', { value: '' }, t('pickPkg')),
      ...devicePkgs.slice().sort(sortPkg).slice(0, 80).map((p) => h('option', { value: p.id, selected: ug.packageId === p.id },
        `${latestIdsSel.has(p.id) ? t('latestMark') : ''}${p.upgradeDeviceType} v${p.upgradeDeviceVersion || '?'} · ${p.upgradeDevicePartion || '?'} · ${p.upgradeDescribe || ''}`)));
    pkgSel.addEventListener('change', () => {
      ug.packageId = pkgSel.value;
      const p = packages.find((x) => x.id === ug.packageId);
      if (p) ug.partition = p.upgradeDevicePartion || '';
      render();
    });
    const partOver = h('select', {},
      ...['', 'system', 'website', 'model', 'config', 'all'].map((part) => h('option', { value: part, selected: (ug.partition || '') === part }, part || t('followPkg'))));
    partOver.addEventListener('change', () => { ug.partition = partOver.value; });

    secondPanel = h('div', { class: 'glass ota-panel' },
      h('h3', {}, h('span', { class: 'logs-source-ico is-device' }, fa('fa-rocket')), t('stepPush')),
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
      h('div', { class: 'admin-msg info', style: { marginTop: '12px' } }, t('otaIotHint')),
    );
  }

  const latestIds = new Set();
  (isApp ? APP_OTA_TYPES : DEVICE_OTA_TYPES).forEach((typ) => {
    const L = latestPackageForType(typ);
    if (L) latestIds.add(L.id);
  });

  const groups = [];
  list.slice(0, 100).forEach((pkg) => {
    const key = logsDayKey(otaPkgTime(pkg));
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) groups.push({ key, items: [pkg] });
    else last.items.push(pkg);
  });

  const stream = !state.packages
    ? loading('…')
    : (!list.length
      ? h('div', { class: 'glass logs-empty' },
          fa(isApp ? 'fa-mobile-alt' : 'fa-robot'),
          h('h2', {}, isApp ? t('otaAppListEmpty') : t('otaEmptyDevice')),
          h('p', {}, isApp ? t('otaEmptyHintApp') : t('otaEmptyHintDevice')),
        )
      : h('div', { class: 'logs-stream' },
          ...groups.map((g) => h('section', { class: 'logs-day' },
            h('div', { class: 'logs-day-h' }, logsDayLabel(g.key) + ' · ' + g.items.length),
            ...g.items.map((pkg) => otaPkgCard(pkg, ug, isApp, latestIds)),
          )),
        ));

  const searchWrap = h('div', { class: 'logs-search' }, fa('fa-magnifying-glass'));
  searchWrap.appendChild(searchBox(isApp ? t('searchAppPkgs') : t('searchPkgs')));

  return h('div', { class: 'ota-page logs-page' },
    h('div', { class: 'glass logs-hero' },
      h('div', {},
        h('div', { class: 'logs-kicker' }, t('otaEyebrow')),
        h('h1', {}, isApp ? t('otaAppTitle') : t('otaDeviceTitle')),
        h('div', { class: 'logs-hero-sub' }, isApp ? t('otaAppSub') : t('otaSub')),
        h('div', { class: 'logs-hero-meta' },
          chip(String(list.length) + ' ' + t('otaCount')),
        ),
      ),
      h('div', { class: 'logs-source-grid' },
        otaSourceCard('app', appPkgs.length, otaPkgTime(appSorted[0]), appSorted[0] && appSorted[0].upgradeDeviceVersion),
        otaSourceCard('device', devPkgs.length, otaPkgTime(devSorted[0]), devSorted[0] && devSorted[0].upgradeDeviceVersion),
      ),
    ),
    h('div', { class: 'ota-studio' }, uploadPanel, secondPanel),
    h('div', { class: 'glass logs-dock' },
      searchWrap, filterType,
      h('button', { class: 'gbtn btn-sm', onclick: async () => { state.packages = null; await loadTab('ota'); } }, fa('fa-rotate'), ' ' + t('refresh')),
    ),
    stream,
  );
}

async function doUpload() {
  const u = state.upload;
  u.err = ''; u.msg = '';
  if (!u.file) { u.err = '请选择文件'; render(); return; }
  if (!u.version.trim()) { u.err = '请填写版本'; render(); return; }
  if (!u.describe.trim()) { u.err = '请填写说明'; render(); return; }
  if (state.otaScope === 'app' && !isAppOtaType(u.deviceType)) {
    u.err = '请选择 App 类型（如 robotApp）'; render(); return;
  }
  if (state.otaScope === 'app') {
    if (['android', 'ios', 'all'].indexOf(u.partition) < 0) u.partition = 'android';
    if (!String(u.describe || '').trim()) u.describe = DEFAULT_APP_OTA_DESC;
  }
  u.busy = true; u.progress = 0; render();
  try {
    const creds = await resolvedCreds();
    if (!creds.accessKeyId) throw new Error('无临时凭证，请重新登录');
    const key = `public/${u.upgradeType}/${u.deviceType}/${u.file.name}`;
    const isApk = /\.apk$/i.test(u.file.name || '');
    await putS3Object(creds, {
      bucket: S3_BUCKET, region: COGNITO.region, key, body: u.file,
      contentType: isApk ? 'application/vnd.android.package-archive' : 'application/octet-stream',
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


const DIAG_PREFIX = 'public/diagnostics/';

function deviceCodePrefix(kind) {
  const k = String(kind || '').toLowerCase();
  if (k.includes('robot')) return 'ROBOT';
  if (k.includes('ipc') || k.includes('camera')) return 'CAM';
  return 'DEV';
}

function inferLegacyDiagSource(fileName) {
  const f = String(fileName || '').toLowerCase();
  if (f.includes('console_systemd') || f.endsWith('.out.gz') || f.endsWith('.out')) return 'device';
  return 'app';
}

function isDiagSupportCode(s) {
  return /^[A-HJ-NP-Z2-9]{8}$/.test(String(s || ''));
}

function parseDiagKey(key) {
  // New:
  //   public/diagnostics/app/{userId}/{code}/{file}
  //   public/diagnostics/device/{kind}/{deviceId}/{userId}/{code}/{file}
  // Mid (no deviceId):
  //   public/diagnostics/device/{kind}/{userId}/{code}/{file}
  // Legacy:
  //   public/diagnostics/{userId}/{code}/{file}
  const parts = String(key || '').split('/').filter(Boolean);
  const i = parts.indexOf('diagnostics');
  if (i < 0 || parts.length < i + 3) {
    return {
      source: 'app', deviceKind: '', deviceId: '', userId: '', code: '',
      fileName: parts[parts.length - 1] || key, supportCode: '',
    };
  }
  const head = parts[i + 1] || '';
  let source = 'app';
  let deviceKind = '';
  let deviceId = '';
  let userId = '';
  let code = '';
  let fileName = '';
  if (head === 'app') {
    source = 'app';
    userId = parts[i + 2] || '';
    code = parts[i + 3] || '';
    fileName = parts.slice(i + 4).join('/') || '';
  } else if (head === 'device') {
    source = 'device';
    deviceKind = parts[i + 2] || '';
    // Prefer path with deviceId when the 8-char support code sits at i+5.
    if (isDiagSupportCode(parts[i + 5])) {
      deviceId = parts[i + 3] || '';
      userId = parts[i + 4] || '';
      code = parts[i + 5] || '';
      fileName = parts.slice(i + 6).join('/') || '';
    } else {
      userId = parts[i + 3] || '';
      code = parts[i + 4] || '';
      fileName = parts.slice(i + 5).join('/') || '';
    }
  } else {
    // legacy flat path
    userId = head;
    code = parts[i + 2] || '';
    fileName = parts.slice(i + 3).join('/') || '';
    source = inferLegacyDiagSource(fileName);
    if (source === 'device') deviceKind = 'legacy';
  }
  let supportCode = '';
  if (code) {
    if (source === 'app') supportCode = 'APP-' + code;
    else if (deviceKind === 'legacy') supportCode = 'DIAG-' + code;
    else supportCode = deviceCodePrefix(deviceKind) + '-' + code;
  }
  return { source, deviceKind, deviceId, userId, code, fileName, supportCode };
}

function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  return (v / (1024 * 1024)).toFixed(2) + ' MB';
}

async function loadDiagLogs(opts) {
  const o = opts || {};
  const creds = await resolvedCreds();
  if (!creds || !creds.accessKeyId) throw new Error('无临时凭证，请重新登录');
  const append = !!o.append && Array.isArray(state.diagLogs);
  const token = append && state.diagLogsMeta ? state.diagLogsMeta.nextToken : '';
  const res = await listS3Objects(creds, {
    bucket: S3_BUCKET,
    region: COGNITO.region,
    prefix: DIAG_PREFIX,
    continuationToken: token || undefined,
    maxKeys: 200,
  });
  const mapped = (res.items || [])
    .filter((it) => it.key && !it.key.endsWith('/'))
    .map((it) => {
      const meta = parseDiagKey(it.key);
      return Object.assign({}, it, meta);
    });
  state.diagLogs = append ? (state.diagLogs || []).concat(mapped) : mapped;
  state.diagLogsMeta = { nextToken: res.nextToken || '', truncated: !!res.truncated };
}


const DIAG_ZIP_CACHE = new Map(); // s3 key → { files:[{name,size,text,binary}] }
const LOG_TAIL_LINES = 4000;
const LOG_MAX_SHOW_LINES = 8000;
let _fflateUnzip = null;

async function loadFflateUnzip() {
  if (_fflateUnzip) return _fflateUnzip;
  const mod = await import('https://esm.sh/fflate@0.8.2');
  if (typeof mod.unzipSync !== 'function') throw new Error('unzip 库加载失败');
  _fflateUnzip = mod.unzipSync;
  return _fflateUnzip;
}

function decodeLogBytes(u8) {
  const nuls = u8.length > 256 ? 8 : Math.max(1, Math.floor(u8.length / 32));
  let hits = 0;
  const lim = Math.min(u8.length, 4096);
  for (let i = 0; i < lim; i++) {
    if (u8[i] === 0) hits++;
    if (hits >= nuls && u8.length > 8) return { binary: true, text: '' };
  }
  try {
    return { binary: false, text: new TextDecoder('utf-8', { fatal: false }).decode(u8) };
  } catch (_) {
    return { binary: true, text: '' };
  }
}

function pickDefaultLogFile(files) {
  if (!files || !files.length) return '';
  const names = files.map((f) => f.name);
  const prefer = names.find((n) => /^ahs_app\.log$/i.test(n))
    || names.find((n) => /console_systemd/i.test(n))
    || names.find((n) => /\.log$/i.test(n))
    || names.find((n) => /device-info/i.test(n))
    || names[0];
  return prefer || '';
}

const LOG_TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)/;

function parseLogTs(line) {
  const m = LOG_TS_RE.exec(line);
  if (!m) return NaN;
  const t = Date.parse(m[1]);
  return Number.isNaN(t) ? NaN : t;
}

function shortLogTs(iso) {
  if (!iso) return '';
  const s = String(iso).replace('T', ' ');
  return s.length >= 16 ? s.slice(5, 16) : s;
}

function logFileRange(f) {
  if (!f || !f.t0) return '';
  const a = shortLogTs(f.t0);
  const b = shortLogTs(f.t1 || f.t0);
  if (!b || a === b) return a;
  const sameDay = String(f.t0).slice(0, 10) === String(f.t1 || '').slice(0, 10);
  return a + ' → ' + (sameDay ? b.slice(6) : b);
}

function logGenRank(name) {
  const s = String(name || '').toLowerCase();
  if (s === 'device-info.txt') return -1000;
  const m = /^ahs_app(?:\.(\d+))?\.log$/.exec(s);
  if (!m) return 500;
  return m[1] ? Number(m[1]) : 0; // .2 更旧=2，当前=0
}

function enrichLogFile(f) {
  if (!f || f.t0 != null) return f;
  if (f.binary || !f.text) {
    f.t0 = '';
    f.t1 = '';
    f.ts0 = 0;
    return f;
  }
  const lines = String(f.text).split(/\r?\n/);
  let t0 = '', t1 = '', ts0 = 0, ts1 = 0;
  for (let i = 0; i < lines.length; i++) {
    const ts = parseLogTs(lines[i]);
    if (!Number.isNaN(ts)) {
      t0 = LOG_TS_RE.exec(lines[i])[1];
      ts0 = ts;
      break;
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const ts = parseLogTs(lines[i]);
    if (!Number.isNaN(ts)) {
      t1 = LOG_TS_RE.exec(lines[i])[1];
      ts1 = ts;
      break;
    }
  }
  f.t0 = t0;
  f.t1 = t1;
  f.ts0 = ts0 || ts1 || 0;
  return f;
}

function sortLinesByTime(lines, newestFirst) {
  const groups = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ts = parseLogTs(line);
    if (!Number.isNaN(ts) || !groups.length) {
      groups.push({ ts: Number.isNaN(ts) ? 0 : ts, idx: i, lines: [line] });
    } else {
      groups[groups.length - 1].lines.push(line);
    }
  }
  groups.sort((a, b) => {
    const d = newestFirst ? (b.ts - a.ts) : (a.ts - b.ts);
    return d !== 0 ? d : (newestFirst ? b.idx - a.idx : a.idx - b.idx);
  });
  const out = [];
  for (let g = 0; g < groups.length; g++) {
    const ls = groups[g].lines;
    for (let k = 0; k < ls.length; k++) out.push(ls[k]);
  }
  return out;
}

function sortLogFiles(files) {
  const list = (files || []).map(enrichLogFile);
  return list.sort((a, b) => {
    const ra = logGenRank(a.name);
    const rb = logGenRank(b.name);
    if (ra < 0 || rb < 0) return ra - rb; // device-info 置顶
    if (a.ts0 && b.ts0 && a.ts0 !== b.ts0) return a.ts0 - b.ts0; // 旧 → 新
    if (ra !== rb) return rb - ra; // 无时间戳时 .2/.1 在当前之前
    return String(a.name).localeCompare(String(b.name));
  });
}

function buildLogViewText(file, q, showAll, newestFirst) {
  if (!file) return { text: '', meta: '', truncated: false, total: 0, shown: 0 };
  if (file.binary) return { text: '', meta: t('logBinary'), truncated: false, total: 0, shown: 0 };
  const newest = newestFirst !== false;
  let lines = String(file.text || '').split(/\r?\n/);
  const total = lines.length;
  const needle = (q || '').trim().toLowerCase();
  let picked;
  let truncated = false;
  if (needle) {
    const hit = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(needle)) hit.push(lines[i]);
    }
    picked = sortLinesByTime(hit, newest);
    if (picked.length > LOG_MAX_SHOW_LINES) {
      picked = newest ? picked.slice(0, LOG_MAX_SHOW_LINES) : picked.slice(picked.length - LOG_MAX_SHOW_LINES);
      truncated = true;
    }
  } else {
    lines = sortLinesByTime(lines, newest);
    if (!showAll && lines.length > LOG_TAIL_LINES) {
      picked = newest ? lines.slice(0, LOG_TAIL_LINES) : lines.slice(lines.length - LOG_TAIL_LINES);
      truncated = true;
    } else if (lines.length > LOG_MAX_SHOW_LINES) {
      picked = newest ? lines.slice(0, LOG_MAX_SHOW_LINES) : lines.slice(lines.length - LOG_MAX_SHOW_LINES);
      truncated = true;
    } else {
      picked = lines;
    }
  }
  const shown = picked.length;
  let meta;
  if (needle) meta = t('logMatchHint').replace('{n}', String(shown)).replace('{total}', String(total));
  else if (truncated) meta = t('logTailHint').replace('{n}', String(shown)).replace('{total}', String(total));
  else meta = t('logLinesHint').replace('{n}', String(total));
  if (file.t0) meta += ' · ' + logFileRange(file);
  return { text: picked.join('\n'), meta, truncated, total, shown };
}

async function unzipDiagPack(buf) {
  const unzipSync = await loadFflateUnzip();
  const entries = unzipSync(new Uint8Array(buf));
  const files = [];
  Object.keys(entries || {}).forEach((name) => {
    if (!name || /\/$/.test(name)) return;
    const u8 = entries[name];
    const decoded = decodeLogBytes(u8);
    files.push({
      name: name.replace(/^.*\//, '') || name,
      path: name,
      size: u8.length,
      text: decoded.text,
      binary: decoded.binary,
    });
  });
  return sortLogFiles(files);
}

async function openDiagLogView(item) {
  const key = item && item.key;
  if (!key) return;
  const cached = DIAG_ZIP_CACHE.get(key);
  const title = item.supportCode || item.code || item.fileName || key;
  if (cached && cached.files && cached.files.length) {
    const unpackedName = parseDeviceInfoUserName(cached.files);
    if (unpackedName && item) {
      item.userName = unpackedName;
      const hit = (state.diagLogs || []).find((x) => x && x.key === key);
      if (hit) hit.userName = unpackedName;
    }
    state.logView = {
      key, title, item, busy: false, err: '',
      files: cached.files,
      fileName: pickDefaultLogFile(cached.files),
      q: '', wrap: false, showAll: false, newestFirst: true,
    };
    render();
    return;
  }
  state.logView = {
    key, title, item, busy: true, err: '', files: [], fileName: '', q: '', wrap: false, showAll: false, newestFirst: true,
  };
  render();
  try {
    const creds = await resolvedCreds();
    if (!creds || !creds.accessKeyId) throw new Error('无临时凭证，请重新登录');
    const buf = await getS3Object(creds, { bucket: S3_BUCKET, region: COGNITO.region, key });
    let files;
    if (/\.gz$/i.test(key) && !/\.tar\.gz$/i.test(key)) {
      const gunzipSync = (await import('https://esm.sh/fflate@0.8.2')).gunzipSync;
      const u8 = gunzipSync(new Uint8Array(buf));
      const decoded = decodeLogBytes(u8);
      const name = (item.fileName || key).replace(/\.gz$/i, '') || 'console_systemd.out';
      files = [{ name, path: name, size: u8.length, text: decoded.text, binary: decoded.binary }];
    } else if (/\.zip$/i.test(key)) {
      files = await unzipDiagPack(buf);
    } else {
      const u8 = new Uint8Array(buf);
      const decoded = decodeLogBytes(u8);
      const name = item.fileName || key.split('/').pop() || 'log.txt';
      files = [{ name, path: name, size: u8.length, text: decoded.text, binary: decoded.binary }];
    }
    if (!files.length) throw new Error(t('logEmptyZip'));
    DIAG_ZIP_CACHE.set(key, { files });
    const unpackedName = parseDeviceInfoUserName(files);
    if (unpackedName && item) {
      item.userName = unpackedName;
      const hit = (state.diagLogs || []).find((x) => x && x.key === key);
      if (hit) hit.userName = unpackedName;
    }
    if (!state.logView || state.logView.key !== key) return;
    state.logView.files = files;
    state.logView.fileName = pickDefaultLogFile(files);
    state.logView.busy = false;
    state.logView.err = '';
  } catch (e) {
    console.error('[admin] open diag log', e);
    if (state.logView && state.logView.key === key) {
      state.logView.busy = false;
      state.logView.err = (e && e.message) || String(e);
    }
    toast((e && e.message) || String(e), 'err');
  }
  render();
}

function renderLogView() {
  const v = state.logView;
  if (!v) return null;
  const files = sortLogFiles(v.files || []);
  const newest = v.newestFirst !== false;
  const cur = files.find((f) => f.name === v.fileName) || files[0] || null;
  const view = v.busy ? null : buildLogViewText(cur, v.q, v.showAll, newest);
  const fileBtns = files.map((f) => {
    const range = logFileRange(f);
    const isCurLog = /^ahs_app\.log$/i.test(f.name);
    return h('button', {
      class: 'log-file' + (cur && cur.name === f.name ? ' on' : ''),
      onclick: () => { v.fileName = f.name; v.q = ''; v.showAll = false; render(); },
    },
      h('span', { class: 'name' }, f.name, isCurLog ? h('em', { class: 'log-now' }, t('logNow')) : null),
      h('span', { class: 'sz' }, fmtBytes(f.size) + (range ? ' · ' + range : '')),
    );
  });

  const pre = h('pre', { class: 'log-pre' + (v.wrap ? ' wrap' : '') }, (view && view.text) || '');
  if (!v.busy && !v.q) {
    requestAnimationFrame(() => { pre.scrollTop = newest ? 0 : pre.scrollHeight; });
  }
  const metaEl = h('div', { class: 'log-meta faint' },
    v.busy ? t('logLoading') : (v.err || (view && view.meta) || ''));

  const qInp = h('input', {
    type: 'search',
    placeholder: t('searchInLog'),
    value: v.q || '',
    style: { flex: '1', minWidth: '160px' },
  });
  qInp.addEventListener('input', () => {
    v.q = qInp.value;
    const next = buildLogViewText(cur, v.q, v.showAll, newest);
    pre.textContent = next.text || (v.q.trim() ? t('logNoMatch') : '');
    metaEl.textContent = next.meta || '';
  });

  return h('div', { class: 'modal-mask log-mask', onclick: (ev) => { if (ev.target === ev.currentTarget && !v.busy) { state.logView = null; render(); } } },
    h('div', { class: 'glass modal log-view' },
      h('div', { class: 'log-head' },
        h('div', { class: 'log-head-id' },
          h('h3', {}, v.title || t('viewLog')),
          h('div', { class: 'log-path' },
            (v.item && userLabel(v.item.userId, v.item.userName))
              ? (userLabel(v.item.userId, v.item.userName) + '  ·  ') : '',
            v.item && v.item.fileName ? v.item.fileName : '',
            v.item && v.item.key ? '  ·  ' + v.item.key : ''),
        ),
        h('div', { class: 'row-actions' },
          h('button', { class: 'gbtn btn-sm', onclick: () => downloadDiagLog(v.item) }, fa('fa-download'), ' ' + t('download')),
          h('button', { class: 'gbtn icon btn-sm', title: t('cancel'), 'aria-label': t('cancel'), onclick: () => { state.logView = null; render(); } }, fa('fa-xmark')),
        ),
      ),
      v.err && !v.busy ? h('div', { class: 'admin-msg err' }, v.err) : null,
      v.busy
        ? h('div', { class: 'log-loading' }, loading(t('logLoading')))
        : h('div', { class: 'log-body' },
            h('div', { class: 'log-files' },
              h('div', { class: 'log-files-title' }, t('logFiles')),
              ...fileBtns,
            ),
            h('div', { class: 'log-main' },
              h('div', { class: 'log-toolbar' },
                qInp,
                h('button', {
                  class: 'gbtn btn-sm' + (newest ? ' primary' : ''),
                  onclick: () => { v.newestFirst = !newest; render(); },
                }, newest ? t('logNewestFirst') : t('logOldestFirst')),
                h('button', {
                  class: 'gbtn btn-sm' + (v.wrap ? ' primary' : ''),
                  onclick: () => { v.wrap = !v.wrap; render(); },
                }, t('logWrap')),
                (!v.q && view && view.truncated)
                  ? h('button', { class: 'gbtn btn-sm', onclick: () => { v.showAll = true; render(); } }, t('showAllLog'))
                  : null,
                h('button', {
                  class: 'gbtn btn-sm',
                  onclick: () => copyText(pre.textContent || ''),
                }, t('copyView')),
              ),
              metaEl,
              pre,
            ),
          ),
    ),
  );
}

function sanitizeFilePart(s) {
  return String(s || '')
    .replace(/[<>:"/\\|?*\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function diagStamp(iso) {
  const d = new Date(iso || Date.now());
  const t = Number.isNaN(d.getTime()) ? new Date() : d;
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`;
}

function origDiagExt(fileName, key) {
  const orig = String(fileName || (key && String(key).split('/').pop()) || 'log.bin');
  if (/\.tar\.gz$/i.test(orig)) return '.tar.gz';
  if (/\.out\.gz$/i.test(orig)) return '.out.gz';
  const i = orig.lastIndexOf('.');
  return i >= 0 ? orig.slice(i) : '';
}

function diagDownloadName(item) {
  const it = item || {};
  const code = sanitizeFilePart(it.supportCode || it.code) || 'log';
  const isDev = (it.source || 'app') === 'device';
  const rawId = isDev ? (it.deviceId || it.userId) : it.userId;
  const id = sanitizeFilePart(rawId);
  const idSeg = id ? ((isDev ? 'dev-' : 'app-') + id) : (isDev ? 'device' : 'app');
  return `${code}_${idSeg}_${diagStamp(it.lastModified)}${origDiagExt(it.fileName, it.key)}`;
}

function saveBlobAs(buf, name) {
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function downloadDiagLog(item) {
  try {
    const creds = await resolvedCreds();
    const buf = await getS3Object(creds, { bucket: S3_BUCKET, region: COGNITO.region, key: item.key });
    const name = diagDownloadName(item);
    saveBlobAs(buf, name);
    toast(name);
  } catch (e) {
    toast((e && e.message) || String(e), 'err');
  }
}

function askDeleteDiagLog(item) {
  state.confirm = {
    title: t('confirmDelLog'),
    body: (item.supportCode || item.code || item.key) + '\n' + (item.fileName || item.key),
    okText: t('confirmDelOk'),
    onOk: async () => {
      state.confirm = null; render();
      try {
        const creds = await resolvedCreds();
        await deleteS3Object(creds, { bucket: S3_BUCKET, region: COGNITO.region, key: item.key });
        state.diagLogs = (state.diagLogs || []).filter((x) => x.key !== item.key);
        DIAG_ZIP_CACHE.delete(item.key);
        if (state.logView && state.logView.key === item.key) state.logView = null;
        toast(t('dataRefreshed'));
      } catch (e) {
        toast((e && e.message) || String(e), 'err');
      }
      render();
    },
  };
  render();
}

function logsRelTime(iso) {
  const ts = Date.parse(iso || '');
  if (!ts) return '—';
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 45) return t('logsJustNow');
  if (sec < 3600) return t('logsMinsAgo').replace('{n}', String(Math.max(1, Math.floor(sec / 60))));
  if (sec < 86400) return t('logsHoursAgo').replace('{n}', String(Math.floor(sec / 3600)));
  if (sec < 86400 * 7) return t('logsDaysAgo').replace('{n}', String(Math.floor(sec / 86400)));
  return fmt(iso);
}

function logsDayKey(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return 'other';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function logsDayLabel(key) {
  if (key === 'other') return t('colUpdated');
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`;
  if (key === today) return t('logsToday');
  if (key === yesterday) return t('logsYesterday');
  return key;
}

function logsKindIcon(row) {
  if ((row.source || 'app') === 'app') return 'fa-mobile-alt';
  const k = String(row.deviceKind || '').toLowerCase();
  if (k.includes('cam') || k.includes('ipc')) return 'fa-video';
  if (k.includes('robot')) return 'fa-robot';
  return 'fa-microchip';
}

function logsSearchBox() {
  const wrap = h('div', { class: 'logs-search' }, fa('fa-magnifying-glass'));
  wrap.appendChild(searchBox(t('searchLogs')));
  return wrap;
}

function logsSourceCard(id, count, latestIso) {
  const on = (state.logsSource === 'device' ? 'device' : 'app') === id;
  const isDev = id === 'device';
  return h('button', {
    type: 'button',
    class: 'logs-source' + (isDev ? ' is-device' : '') + (on ? ' on' : ''),
    onclick: () => { state.logsSource = id; state.q = ''; render(); },
  },
    h('span', { class: 'logs-source-ico' }, fa(isDev ? 'fa-robot' : 'fa-mobile-alt')),
    h('span', { class: 'k' }, isDev ? t('logsTabDevice') : t('logsTabApp')),
    h('span', { class: 'v num' }, String(count)),
    h('span', { class: 's' }, latestIso ? (t('logsLatest') + ' · ' + logsRelTime(latestIso)) : t(isDev ? 'logsDeviceEmpty' : 'logsAppEmpty')),
  );
}

function parseDeviceInfoUserName(files) {
  const f = (files || []).find((x) => /device-info/i.test(x.name || x.path || ''));
  if (!f || !f.text) return '';
  const m = String(f.text).match(/^userName=(.*)$/m);
  return (m && m[1].trim()) || '';
}
async function hydrateLogUsers() {
  const rows = state.diagLogs || [];
  const ids = [...new Set(rows.map((r) => r && r.userId).filter(Boolean))];
  const missing = ids.filter((id) => !userLabel(id));
  if (!missing.length) return;
  await Promise.all(missing.slice(0, 40).map(async (id) => {
    try {
      let row = await resolveUserRow(id);
      if (!row) {
        const byPk = await listAllUsers({ id: { eq: id } });
        row = byPk && byPk[0];
      }
      if (!row) {
        const byName = await listAllUsers({ awsUserName: { eq: id } });
        row = byName && byName[0];
      }
      if (row) mergeUsers([row]);
    } catch (_) {}
  }));
}
function logsUserChips(r) {
  const userId = (r && r.userId) || '';
  const name = userLabel(userId, r && r.userName);
  const out = [];
  if (name) {
    out.push(h('span', {
      class: 'logs-chip',
      title: userId ? (name + ' · ' + userId) : name,
      onclick: (e) => { e.stopPropagation(); copyText(name); },
    }, fa('fa-user'), h('span', { class: 'clip' }, name)));
  }
  if (userId) {
    out.push(h('span', {
      class: 'logs-chip mute',
      title: userId,
      onclick: (e) => { e.stopPropagation(); copyText(userId); },
    }, h('span', { class: 'clip' }, shortId(userId))));
  }
  return out;
}

function logsPackCard(r) {
  const isDev = (r.source || 'app') === 'device';
  const code = r.supportCode || r.code || '—';
  return h('article', {
    class: 'glass logs-card' + (isDev ? ' is-device' : ''),
    onclick: () => openDiagLogView(r),
  },
    h('div', { class: 'logs-card-mark' }, fa(logsKindIcon(r))),
    h('div', { class: 'logs-card-body' },
      h('button', {
        type: 'button',
        class: 'logs-card-code',
        title: t('copyCode'),
        onclick: (e) => { e.stopPropagation(); copyText(code); },
      }, code, fa('fa-copy')),
      h('div', { class: 'logs-card-meta' },
        r.fileName ? h('span', { class: 'logs-chip mute' }, h('span', { class: 'clip' }, r.fileName)) : null,
        isDev && r.deviceKind ? h('span', { class: 'logs-chip' }, r.deviceKind) : null,
        isDev && r.deviceId
          ? h('span', {
              class: 'logs-chip',
              title: r.deviceId,
              onclick: (e) => { e.stopPropagation(); copyText(r.deviceId); },
            }, fa('fa-microchip'), h('span', { class: 'clip' }, shortId(r.deviceId)))
          : null,
        ...logsUserChips(r),
        h('span', { class: 'logs-chip mute' }, fmtBytes(r.size)),
      ),
    ),
    h('div', { class: 'logs-card-side' },
      h('div', { class: 'logs-card-when' },
        h('b', {}, logsRelTime(r.lastModified)),
        fmt(r.lastModified),
      ),
      h('div', { class: 'row-actions', onclick: (e) => e.stopPropagation() },
        h('button', { class: 'gbtn primary btn-sm', onclick: () => openDiagLogView(r) }, t('viewLog')),
        h('button', { class: 'gbtn icon btn-sm', title: t('download'), 'aria-label': t('download'), onclick: () => downloadDiagLog(r) }, fa('fa-download')),
        h('button', { class: 'gbtn icon btn-sm danger', title: t('delete'), 'aria-label': t('delete'), onclick: () => askDeleteDiagLog(r) }, fa('fa-trash')),
      ),
    ),
  );
}

function viewLogs() {
  const src = state.logsSource === 'device' ? 'device' : 'app';
  const all = state.diagLogs || [];
  const appRows = all.filter((r) => (r.source || 'app') === 'app');
  const devRows = all.filter((r) => (r.source || 'app') === 'device');
  let rows = (src === 'device' ? devRows : appRows).slice();
  rows = rows.filter((r) => matchQ([r.supportCode, r.code, r.userId, userLabel(r.userId, r.userName), r.deviceId, r.fileName, r.deviceKind, r.key]));
  rows.sort((a, b) => (Date.parse(b.lastModified || '') || 0) - (Date.parse(a.lastModified || '') || 0));
  const meta = state.diagLogsMeta || {};
  const latestOf = (list) => (list[0] && list[0].lastModified) || '';
  const appSorted = appRows.slice().sort((a, b) => (Date.parse(b.lastModified || '') || 0) - (Date.parse(a.lastModified || '') || 0));
  const devSorted = devRows.slice().sort((a, b) => (Date.parse(b.lastModified || '') || 0) - (Date.parse(a.lastModified || '') || 0));

  const groups = [];
  rows.slice(0, 500).forEach((r) => {
    const key = logsDayKey(r.lastModified);
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) groups.push({ key, items: [r] });
    else last.items.push(r);
  });

  const stream = state.loadingTab || state.diagLogs == null
    ? loading('…')
    : (!rows.length
      ? h('div', { class: 'glass logs-empty' },
          fa(src === 'device' ? 'fa-robot' : 'fa-mobile-alt'),
          h('h2', {}, src === 'device' ? t('logsDeviceEmpty') : t('logsAppEmpty')),
          h('p', {}, src === 'device' ? t('logsDeviceHint') : t('logsAppHint')),
        )
      : h('div', { class: 'logs-stream' },
          ...groups.map((g) => h('section', { class: 'logs-day' },
            h('div', { class: 'logs-day-h' }, logsDayLabel(g.key) + ' · ' + g.items.length),
            ...g.items.map(logsPackCard),
          )),
        ));

  return h('div', { class: 'logs-page' },
    h('div', { class: 'glass logs-hero' },
      h('div', {},
        h('div', { class: 'logs-kicker' }, t('logsEyebrow')),
        h('h1', {}, src === 'device' ? t('logsDevice') : t('logsApp')),
        h('div', { class: 'logs-hero-sub' }, src === 'device' ? t('logsDeviceSub') : t('logsAppSub')),
        h('div', { class: 'logs-hero-meta' },
          chip(String(rows.length) + ' ' + t('logsCount')),
          meta.truncated ? chip(t('logsTrunc'), 'stat-offline') : null,
        ),
      ),
      h('div', { class: 'logs-source-grid' },
        logsSourceCard('app', appRows.length, latestOf(appSorted)),
        logsSourceCard('device', devRows.length, latestOf(devSorted)),
      ),
    ),
    h('div', { class: 'glass logs-dock' },
      logsSearchBox(),
      h('button', { class: 'gbtn btn-sm', onclick: async () => {
        state.diagLogs = null; state.diagLogsMeta = null; render();
        try { await loadDiagLogs(); await hydrateLogUsers(); toast(t('dataRefreshed')); }
        catch (e) { toast((e && e.message) || String(e), 'err'); }
        render();
      } }, fa('fa-rotate'), ' ' + t('refresh')),
      meta.nextToken ? h('button', { class: 'gbtn primary btn-sm', onclick: async () => {
        try { await loadDiagLogs({ append: true }); await hydrateLogUsers(); toast(t('dataRefreshed')); }
        catch (e) { toast((e && e.message) || String(e), 'err'); }
        render();
      } }, t('logsLoadMore')) : null,
    ),
    stream,
  );
}

function render() {
  let body;
  if (state.tab === 'overview') body = viewOverview();
  else if (state.tab === 'users') body = viewUsers();
  else if (state.tab === 'devices') body = viewDevices();
  else if (state.tab === 'records') body = viewRecords();
  else if (state.tab === 'logs') body = viewLogs();
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
  clearAdminDataCache(); // 登录后强制拉当前区域，避免上一区残留
  state.dataRegion = getRegion();
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
              onclick: () => { changeRegion(rc); },
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

