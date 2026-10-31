// AppSync GraphQL 数据层 —— 纯 fetch,用 API key(数据表都是 @auth public)。
// 移植 device_repository.dart / AmplifyHandleModule 的查询,含 nextToken 翻页(limit 1000,直到 null)。
import { APPSYNC } from '../config.js';

async function gql(query, variables) {
  const res = await fetch(APPSYNC.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': APPSYNC.apiKey },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  // Amplify 老数据常缺 createdAt/updatedAt：有 data 时降级告警，勿整表抛死
  if (json.errors && json.errors.length) {
    if (!json.data) throw new Error(json.errors.map((e) => e.message).join('; '));
    console.warn('[graphql] partial errors', json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

// 通用翻页:反复取 items 直到 nextToken 为 null
async function pageAll(query, variables, pick) {
  let token = null, out = [];
  do {
    const data = await gql(query, { ...variables, limit: 1000, nextToken: token });
    const conn = pick(data);
    const items = (conn.items || []).filter((x) => x != null);
    out = out.concat(items);
    token = conn.nextToken;
  } while (token);
  return out;
}

// ── 1. Cognito sub → User 行 ────────────────────────────────────────────────
const Q_LIST_USERS = /* GraphQL */ `
  query ListUsers($filter: ModelUserFilterInput, $limit: Int, $nextToken: String) {
    listUsers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items { id awsUserID awsUserName email region createdAt }
      nextToken
    }
  }`;

export async function resolveUserRow(cognitoSub) {
  const items = await pageAll(
    Q_LIST_USERS,
    { filter: { awsUserID: { eq: cognitoSub } } },
    (d) => d.listUsers,
  );
  if (!items.length) return null;
  // 同 awsUserID 多行时取最早(与 App 一致);避免命中空壳新行导致「我的设备」为空。
  // 管理后台本身走 listAll*,不依赖 DeviceUser;此处仅保证登录档案稳定。
  items.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  if (items.length > 1) {
    console.warn('[graphql] resolveUserRow: duplicate User rows for sub, using oldest', items[0].id);
  }
  return items[0]; // { id, awsUserID, email, ... }
}

// ── 2. 我的设备(DeviceUser join,filter userId eq User.id)────────────────────
const Q_LIST_DEVICEUSERS = /* GraphQL */ `
  query ListDeviceUsers($filter: ModelDeviceUserFilterInput, $limit: Int, $nextToken: String) {
    listDeviceUsers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        device {
          id
          ownerUserId
          deviceConnectStatus
          devicePicture
          deviceGeneralInformation
        }
      }
      nextToken
    }
  }`;

export async function fetchMyDevices(userRowId) {
  const rows = await pageAll(
    Q_LIST_DEVICEUSERS,
    { filter: { userId: { eq: userRowId } } },
    (d) => d.listDeviceUsers,
  );
  const devices = rows.map((r) => r.device).filter(Boolean).map(normalizeDevice).filter(Boolean);
  // 在线优先排序(移植 device_list_controller)
  devices.sort((a, b) => (b.online - a.online));
  return devices;
}

// deviceGeneralInformation 是 AWSJSON blob,解析出 name/model/firmware/uuid/datetime
function normalizeDevice(d) {
  if (!d || d.id == null || d.id === '') return null;
  let info = {};
  const rawInfo = d.deviceGeneralInformation;
  try {
    if (typeof rawInfo === 'string' && rawInfo.trim()) info = JSON.parse(rawInfo);
    else if (rawInfo && typeof rawInfo === 'object') info = rawInfo;
  } catch (_) {}
  // 设备侧写入 "true"/"false" 字符串；兼容 online/1/boolean
  const rawStatus = d && d.deviceConnectStatus;
  const s = String(rawStatus == null ? '' : rawStatus).trim().toLowerCase();
  const online = (s === 'online' || s === 'true' || s === '1' || rawStatus === true) ? 1 : 0;
  const ra = (info && info.remoteAccess && typeof info.remoteAccess === 'object') ? info.remoteAccess : null;
  return {
    id: d.id,
    online,
    connectStatus: rawStatus == null || rawStatus === '' ? 'offline' : String(rawStatus),
    picture: d.devicePicture || '',
    ownerUserId: d.ownerUserId || '',
    name: info.deviceName || info.deviceModelName || d.id,
    model: info.deviceModelName || '',
    firmware: info.deviceVersion || '',
    uuid: info.deviceUuid || '',
    deviceType: info.deviceType,
    remoteAccess: ra,
    remoteHost: ra && ra.host ? String(ra.host) : '',
    remoteSshPort: ra && ra.sshPort != null ? Number(ra.sshPort) : 0,
    remoteHttpPort: ra && ra.httpPort != null ? Number(ra.httpPort) : 0,
    remoteHttpsPort: ra && ra.httpsPort != null ? Number(ra.httpsPort) : (ra && ra.host ? 100 : 0),
    remoteHttpsAltPort: ra && ra.httpsAltPort != null ? Number(ra.httpsAltPort) : (ra && ra.host ? 443 : 0),
    remoteNetwork: ra && ra.network ? String(ra.network) : '',
    createdAt: d.createdAt || '',
    updatedAt: d.updatedAt || '',
    raw: d,
  };
}

// ── 3. 云端录像列表(deviceID eq + dateTime between)──────────────────────────
const Q_LIST_CLOUDRECORDS = /* GraphQL */ `
  query ListCloudRecords($filter: ModelCloudRecordFilterInput, $limit: Int, $nextToken: String) {
    listCloudRecords(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items { id dateTime duration deviceID type channel resolution thumbnailUrl expireAt }
      nextToken
    }
  }`;

// startIso/endIso 为 AWSDateTime(ISO8601)。返回按时间倒序。
export async function fetchCloudRecords(deviceId, startIso, endIso) {
  const filter = {
    and: [
      { deviceID: { eq: deviceId } },
      { dateTime: { between: [startIso, endIso] } },
    ],
  };
  const items = await pageAll(Q_LIST_CLOUDRECORDS, { filter }, (d) => d.listCloudRecords);
  const now = Date.now();
  return items
    .filter((r) => !r.expireAt || new Date(r.expireAt).getTime() > now) // 过滤已到期
    .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
}


// ── Admin: 全表数据（API Key public）──────────────────────────────────────────
const Q_LIST_USERS_FULL = /* GraphQL */ `
  query ListUsers($filter: ModelUserFilterInput, $limit: Int, $nextToken: String) {
    listUsers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items { id awsUserID awsUserName phoneNumber email picture region createdAt updatedAt }
      nextToken
    }
  }`;

export async function listAllUsers(filter) {
  const rows = await pageAll(Q_LIST_USERS_FULL, { filter: filter || null }, (d) => d.listUsers);
  return (rows || []).filter((u) => u && u.id);
}

const Q_LIST_DEVICES = /* GraphQL */ `
  query ListDevices($filter: ModelDeviceFilterInput, $limit: Int, $nextToken: String) {
    listDevices(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id ownerUserId deviceConnectStatus devicePicture deviceGeneralInformation
        createdAt updatedAt
      }
      nextToken
    }
  }`;

function deviceUpdatedMs(d) {
  const t = Date.parse((d && (d.updatedAt || d.createdAt)) || '') || 0;
  return t;
}

export async function listAllDevices(filter) {
  const rows = await pageAll(Q_LIST_DEVICES, { filter: filter || null }, (d) => d.listDevices);
  // AppSync 可能返回 null item（已删/稀疏）；最近更新在上，同秒在线优先
  return rows.map(normalizeDevice).filter(Boolean).sort((a, b) => {
    const dt = deviceUpdatedMs(b) - deviceUpdatedMs(a);
    if (dt !== 0) return dt;
    if (b.online !== a.online) return b.online - a.online;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

const Q_LIST_DEVICEUSERS_FULL = /* GraphQL */ `
  query ListDeviceUsers($filter: ModelDeviceUserFilterInput, $limit: Int, $nextToken: String) {
    listDeviceUsers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id userId deviceId createdAt
        user { id awsUserName email }
        device { id ownerUserId deviceConnectStatus deviceGeneralInformation }
      }
      nextToken
    }
  }`;

export async function listAllDeviceUsers(filter) {
  const items = await pageAll(Q_LIST_DEVICEUSERS_FULL, { filter: filter || null }, (d) => d.listDeviceUsers);
  return (items || []).filter(Boolean);
}

const Q_LIST_UPGRADES = /* GraphQL */ `
  query ListDeviceUpgrades($filter: ModelDeviceUpgradeFilterInput, $limit: Int, $nextToken: String) {
    listDeviceUpgrades(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id upgradeMode upgradeFileUrl upgradeDeviceType upgradeDeviceVersion
        upgradeDevicePartion upgradeType upgradeDescribe upgradeOtaTime createdAt updatedAt
      }
      nextToken
    }
  }`;

export async function listDeviceUpgrades(filter) {
  const items = await pageAll(Q_LIST_UPGRADES, { filter: filter || null }, (d) => d.listDeviceUpgrades);
  items.sort((a, b) => {
    const ta = Date.parse(a.upgradeOtaTime || a.createdAt || 0) || 0;
    const tb = Date.parse(b.upgradeOtaTime || b.createdAt || 0) || 0;
    return tb - ta;
  });
  return items;
}

const M_CREATE_UPGRADE = /* GraphQL */ `
  mutation CreateDeviceUpgrade($input: CreateDeviceUpgradeInput!) {
    createDeviceUpgrade(input: $input) {
      id upgradeMode upgradeFileUrl upgradeDeviceType upgradeDeviceVersion
      upgradeDevicePartion upgradeType upgradeDescribe upgradeOtaTime createdAt
    }
  }`;

export async function createDeviceUpgrade(input) {
  const data = await gql(M_CREATE_UPGRADE, { input });
  return data.createDeviceUpgrade;
}

const M_UPDATE_UPGRADE = /* GraphQL */ `
  mutation UpdateDeviceUpgrade($input: UpdateDeviceUpgradeInput!) {
    updateDeviceUpgrade(input: $input) {
      id upgradeMode upgradeFileUrl upgradeDeviceType upgradeDeviceVersion
      upgradeDevicePartion upgradeType upgradeDescribe upgradeOtaTime updatedAt
    }
  }`;
const M_DELETE_UPGRADE = /* GraphQL */ `
  mutation DeleteDeviceUpgrade($input: DeleteDeviceUpgradeInput!) {
    deleteDeviceUpgrade(input: $input) { id }
  }`;

export async function updateDeviceUpgrade(input) {
  if (!input || !input.id) throw new Error('缺少 DeviceUpgrade.id');
  const data = await gql(M_UPDATE_UPGRADE, { input });
  if (!data || !data.updateDeviceUpgrade) throw new Error('updateDeviceUpgrade 无返回');
  return data.updateDeviceUpgrade;
}

export async function deleteDeviceUpgrade(id) {
  if (!id) throw new Error('缺少 DeviceUpgrade.id');
  const data = await gql(M_DELETE_UPGRADE, { input: { id } });
  return !!(data && data.deleteDeviceUpgrade);
}

// 云录像：支持 filter + 可选 maxPages 防止全表扫描卡死（默认最多 20 页 × limit）
export async function listCloudRecordsAdmin({ filter = null, limit = 200, maxPages = 20 } = {}) {
  let token = null, out = [], pages = 0;
  do {
    const data = await gql(Q_LIST_CLOUDRECORDS, { filter, limit, nextToken: token });
    const conn = data.listCloudRecords || {};
    out = out.concat(conn.items || []);
    token = conn.nextToken || null;
    pages += 1;
  } while (token && pages < maxPages);
  const now = Date.now();
  return {
    items: out
      .filter((r) => !r.expireAt || new Date(r.expireAt).getTime() > now)
      .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)),
    nextToken: token,
    truncated: !!token,
  };
}

// ── Admin CRUD: User / Device / DeviceUser（对齐 App repository）──────────────
const M_UPDATE_USER = /* GraphQL */ `
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id awsUserID awsUserName phoneNumber email picture region updatedAt
    }
  }`;
const M_DELETE_USER = /* GraphQL */ `
  mutation DeleteUser($input: DeleteUserInput!) {
    deleteUser(input: $input) { id }
  }`;
const M_UPDATE_DEVICE = /* GraphQL */ `
  mutation UpdateDevice($input: UpdateDeviceInput!) {
    updateDevice(input: $input) {
      id ownerUserId deviceConnectStatus devicePicture deviceGeneralInformation updatedAt
    }
  }`;
const M_DELETE_DEVICE = /* GraphQL */ `
  mutation DeleteDevice($input: DeleteDeviceInput!) {
    deleteDevice(input: $input) { id }
  }`;
const M_DELETE_DEVICEUSER = /* GraphQL */ `
  mutation DeleteDeviceUser($input: DeleteDeviceUserInput!) {
    deleteDeviceUser(input: $input) { id }
  }`;

export async function updateUserAdmin(input) {
  if (!input || !input.id) throw new Error('缺少 User.id');
  const data = await gql(M_UPDATE_USER, { input });
  if (!data || !data.updateUser) throw new Error('updateUser 无返回');
  return data.updateUser;
}

export async function deleteUserRow(userId) {
  if (!userId) throw new Error('缺少 User.id');
  const data = await gql(M_DELETE_USER, { input: { id: userId } });
  return !!(data && data.deleteUser);
}

export async function updateDeviceAdmin(input) {
  if (!input || !input.id) throw new Error('缺少 Device.id');
  const data = await gql(M_UPDATE_DEVICE, { input });
  if (!data || !data.updateDevice) throw new Error('updateDevice 无返回');
  return data.updateDevice;
}

export async function deleteDeviceRow(deviceId) {
  if (!deviceId) throw new Error('缺少 Device.id');
  const data = await gql(M_DELETE_DEVICE, { input: { id: deviceId } });
  return !!(data && data.deleteDevice);
}

export async function deleteDeviceUserRow(bindId) {
  if (!bindId) throw new Error('缺少 DeviceUser.id');
  const data = await gql(M_DELETE_DEVICEUSER, { input: { id: bindId } });
  return !!(data && data.deleteDeviceUser);
}

/** 删用户：先清该用户全部 DeviceUser，再删 User 行（不删 Cognito、不删 Device） */
export async function deleteUserCompletely(userId) {
  if (!userId) throw new Error('缺少 User.id');
  const binds = await listAllDeviceUsers({ userId: { eq: userId } });
  let fail = 0;
  for (const b of binds) {
    try { await deleteDeviceUserRow(b.id); }
    catch (e) { fail += 1; console.warn('[graphql] delete DeviceUser', b && b.id, e); }
  }
  await deleteUserRow(userId);
  return { binds: binds.length, bindFails: fail };
}

/** 删设备：先清全部绑定，再删 Device 行（对齐 App deleteDeviceCompletely） */
export async function deleteDeviceCompletely(deviceId) {
  if (!deviceId) throw new Error('缺少 Device.id');
  const binds = await listAllDeviceUsers({ deviceId: { eq: deviceId } });
  let fail = 0;
  for (const b of binds) {
    try { await deleteDeviceUserRow(b.id); }
    catch (e) { fail += 1; console.warn('[graphql] delete DeviceUser', b && b.id, e); }
  }
  try { await deleteDeviceRow(deviceId); }
  catch (e) {
    console.warn('[graphql] delete Device', deviceId, e);
    if (binds.length === 0) throw e;
  }
  return { binds: binds.length, bindFails: fail };
}

// ── Agora Console REST（AppSync HTTP → api.agora.io；密钥只在云端）────────
const Q_AGORA_PROJECTS = /* GraphQL */ `
  query GetAgoraProjects {
    getAgoraProjects
  }`;
const Q_AGORA_USAGE = /* GraphQL */ `
  query GetAgoraUsage($projectId: String!, $fromDate: String!, $toDate: String!, $business: String) {
    getAgoraUsage(projectId: $projectId, fromDate: $fromDate, toDate: $toDate, business: $business)
  }`;

function parseAwsJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (_) { return null; }
  }
  return null;
}

/** 列出 Agora 账号下全部项目（不含 certificate） */
export async function getAgoraProjects() {
  const data = await gql(Q_AGORA_PROJECTS, {});
  const raw = parseAwsJson(data && data.getAgoraProjects);
  const projects = (raw && raw.projects) || [];
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    appId: p.vendor_key || p.appId || '',
    status: Number(p.status),
    created: p.created,
  }));
}

/**
 * 拉取项目用量（秒）。fromDate/toDate: UTC YYYY-MM-DD
 * business 默认 default（音视频）
 */
export async function getAgoraUsage({ projectId, fromDate, toDate, business = 'default' }) {
  if (!projectId) throw new Error('缺少 projectId');
  const data = await gql(Q_AGORA_USAGE, {
    projectId, fromDate, toDate, business: business || 'default',
  });
  return parseAwsJson(data && data.getAgoraUsage) || { usages: [] };
}

/** 标准分钟换算（音频×1 / HD×4 / HDP×4 / FHD×9 / 2K×16 / 2K+×36） */
export function agoraStandardMinutesFromUsage(usageObj) {
  const u = usageObj || {};
  const audio = Number(u.durationAudioAll || 0);
  const hd = Number(u.durationVideoHd || 0);
  const hdp = Number(u.durationVideoHdp || 0);
  const fhd = Number(u.durationVideo1080P || 0);
  const v2k = Number(u.durationVideo2K || 0);
  const v4k = Number(u.durationVideo4K || 0);
  const sec = { audio, hd, hdp, fullHd: fhd, video2k: v2k, video2kPlus: v4k };
  const minutes = audio / 60
    + (hd / 60) * 4
    + (hdp / 60) * 4
    + (fhd / 60) * 9
    + (v2k / 60) * 16
    + (v4k / 60) * 36;
  return { seconds: sec, standardMinutes: minutes };
}

export function agoraMonthUtcRange(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const fromDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const toDate = now.toISOString().slice(0, 10);
  return { fromDate, toDate };
}

// ── AWS Cost Explorer（AppSync HTTP → ce.us-east-1；金额为付款账号级）────────
const Q_AWS_COST = /* GraphQL */ `
  query GetAwsCostSummary($start: String!, $end: String!, $granularity: String) {
    getAwsCostSummary(start: $start, end: $end, granularity: $granularity)
  }`;

/**
 * Cost Explorer GetCostAndUsage 原始结果。
 * start/end: UTC YYYY-MM-DD，end 为开区间（不含当日）。
 * granularity: DAILY | MONTHLY
 *
 * 注意：不能走通用 gql()——CE 失败时 AppSync 常返回 data.getAwsCostSummary=null + errors，
 * 通用路径只 warn「partial errors」不抛错，页面会误显示 $0。
 */
// 浏览器侧短缓存；权威缓存在 S3 public/admin/aws-cost-cache.json
const AWS_CE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function awsCeCacheKey(start, end, granularity) {
  return 'aws_ce_v1_' + start + '_' + end + '_' + (granularity || 'DAILY');
}

function readAwsCeCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !o.at || (Date.now() - o.at) > AWS_CE_CACHE_TTL_MS) return null;
    return o.body;
  } catch (_) { return null; }
}

function writeAwsCeCache(key, body) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), body }));
  } catch (_) {}
}

async function fetchAwsCostSummaryOnce({ start, end, granularity }) {
  const res = await fetch(APPSYNC.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': APPSYNC.apiKey },
    body: JSON.stringify({
      query: Q_AWS_COST,
      variables: { start, end, granularity: granularity || 'DAILY' },
    }),
  });
  const json = await res.json();
  if (json.errors && json.errors.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  const parsed = parseAwsJson(json.data && json.data.getAwsCostSummary);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('getAwsCostSummary empty response');
  }
  return parsed;
}

/**
 * 直连 AppSync→Cost Explorer（易限流）。管理页默认应先读 S3 缓存，仅 force 刷新时调用。
 * 最多 2 次尝试，避免把账号 CE 配额打爆后页面一直显示 $0。
 */
export async function getAwsCostSummary({ start, end, granularity = 'DAILY', bypassCache = false }) {
  if (!start || !end) throw new Error('缺少 start/end');
  const g = granularity || 'DAILY';
  const key = awsCeCacheKey(start, end, g);
  if (!bypassCache) {
    const hit = readAwsCeCache(key);
    if (hit) return hit;
  }
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      const body = await fetchAwsCostSummaryOnce({ start, end, granularity: g });
      writeAwsCeCache(key, body);
      return body;
    } catch (e) {
      lastErr = e;
      const msg = (e && e.message) || String(e);
      if (!/Rate limit|LimitExceeded|Throttl/i.test(msg) || i === 1) throw e;
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
  throw lastErr;
}

/** S3 费用缓存对象 key（各区域桶各一份，内容账号级相同） */
export const AWS_COST_S3_CACHE_KEY = 'public/admin/aws-cost-cache.json';

export function isAwsCostRateLimitedError(err) {
  const msg = (err && err.message) || String(err || '');
  return /Rate limit|LimitExceeded|Throttl/i.test(msg);
}

/** 本月 UTC：[月初, 明天) —— CE end 不含当天，用明天可盖住今天已出账数据 */
export function awsCostMonthUtcRange(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const end = tomorrow.toISOString().slice(0, 10);
  return { start, end };
}

/** 近 N 个自然月月初 → 明天（开区间） */
export function awsCostLastMonthsUtcRange(months = 3, now = new Date()) {
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

/**
 * 把 CE ResultsByTime 收成 { totalUsd, byService:[{name,usd}], daily:[{date,total,byService}] }
 */
export function summarizeAwsCost(raw) {
  const rows = (raw && raw.ResultsByTime) || [];
  const byServiceMap = {};
  const daily = [];
  let totalUsd = 0;
  for (const row of rows) {
    const date = (row.TimePeriod && row.TimePeriod.Start) || '';
    const dayMap = {};
    let dayTotal = 0;
    for (const g of (row.Groups || [])) {
      const name = (g.Keys && g.Keys[0]) || 'Unknown';
      const amt = Number((g.Metrics && g.Metrics.UnblendedCost && g.Metrics.UnblendedCost.Amount) || 0);
      if (!isFinite(amt) || amt === 0) continue;
      byServiceMap[name] = (byServiceMap[name] || 0) + amt;
      dayMap[name] = (dayMap[name] || 0) + amt;
      dayTotal += amt;
      totalUsd += amt;
    }
    // 无 Groups 时看 Total
    if (!(row.Groups || []).length && row.Total && row.Total.UnblendedCost) {
      const amt = Number(row.Total.UnblendedCost.Amount || 0);
      if (isFinite(amt) && amt !== 0) {
        dayTotal += amt;
        totalUsd += amt;
        byServiceMap['(unallocated)'] = (byServiceMap['(unallocated)'] || 0) + amt;
      }
    }
    daily.push({ date, total: dayTotal, byService: dayMap });
  }
  const byService = Object.keys(byServiceMap)
    .map((name) => ({ name, usd: byServiceMap[name] }))
    .sort((a, b) => b.usd - a.usd);
  return { totalUsd, byService, daily };
}


// ── 出厂授权 LicenseBatch / DeviceLicense / activateDevice ─────────────────
const Q_LIST_LICENSE_BATCHES = /* GraphQL */ `
  query ListLicenseBatches($filter: ModelLicenseBatchFilterInput, $limit: Int, $nextToken: String) {
    listLicenseBatches(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id batchCode customerName productSku maxDevices usedCount status
        expiresAt note createdAt updatedAt
      }
      nextToken
    }
  }`;

export async function listAllLicenseBatches(filter) {
  const rows = await pageAll(Q_LIST_LICENSE_BATCHES, { filter: filter || null }, (d) => d.listLicenseBatches);
  return (rows || []).filter((b) => b && b.id).sort((a, b) => {
    const ta = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    const tb = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    return tb - ta;
  });
}

const M_CREATE_LICENSE_BATCH = /* GraphQL */ `
  mutation CreateLicenseBatch($input: CreateLicenseBatchInput!) {
    createLicenseBatch(input: $input) {
      id batchCode customerName productSku maxDevices usedCount status
      expiresAt note createdAt updatedAt
    }
  }`;

export async function createLicenseBatch(input) {
  const data = await gql(M_CREATE_LICENSE_BATCH, { input });
  return data.createLicenseBatch;
}

const M_UPDATE_LICENSE_BATCH = /* GraphQL */ `
  mutation UpdateLicenseBatch($input: UpdateLicenseBatchInput!) {
    updateLicenseBatch(input: $input) {
      id batchCode customerName productSku maxDevices usedCount status
      expiresAt note createdAt updatedAt
    }
  }`;

export async function updateLicenseBatch(input) {
  const data = await gql(M_UPDATE_LICENSE_BATCH, { input });
  return data.updateLicenseBatch;
}

const Q_LIST_DEVICE_LICENSES = /* GraphQL */ `
  query ListDeviceLicenses($filter: ModelDeviceLicenseFilterInput, $limit: Int, $nextToken: String) {
    listDeviceLicenses(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id deviceUid batchId batchCode status activatedAt expiresAt createdAt updatedAt
      }
      nextToken
    }
  }`;

export async function listDeviceLicensesByBatch(batchId) {
  const rows = await pageAll(
    Q_LIST_DEVICE_LICENSES,
    { filter: { batchId: { eq: batchId } } },
    (d) => d.listDeviceLicenses,
  );
  return (rows || []).filter(Boolean).sort((a, b) => {
    const ta = Date.parse(a.activatedAt || a.createdAt || '') || 0;
    const tb = Date.parse(b.activatedAt || b.createdAt || '') || 0;
    return tb - ta;
  });
}

const M_ACTIVATE_DEVICE = /* GraphQL */ `
  mutation ActivateDevice($deviceUid: String!, $code: String!) {
    activateDevice(deviceUid: $deviceUid, code: $code) {
      ok message deviceUid batchId batchCode activatedAt expiresAt status
    }
  }`;

export async function activateDeviceLicense(deviceUid, code) {
  const data = await gql(M_ACTIVATE_DEVICE, { deviceUid, code });
  return data.activateDevice;
}
