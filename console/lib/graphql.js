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
    out = out.concat(conn.items || []);
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
  const devices = rows.map((r) => r.device).filter(Boolean).map(normalizeDevice);
  // 在线优先排序(移植 device_list_controller)
  devices.sort((a, b) => (b.online - a.online));
  return devices;
}

// deviceGeneralInformation 是 AWSJSON blob,解析出 name/model/firmware/uuid/datetime
function normalizeDevice(d) {
  let info = {};
  const rawInfo = d && d.deviceGeneralInformation;
  try {
    if (typeof rawInfo === 'string' && rawInfo.trim()) info = JSON.parse(rawInfo);
    else if (rawInfo && typeof rawInfo === 'object') info = rawInfo;
  } catch (_) {}
  // 设备侧写入 "true"/"false" 字符串；兼容 online/1/boolean
  const rawStatus = d && d.deviceConnectStatus;
  const s = String(rawStatus == null ? '' : rawStatus).trim().toLowerCase();
  const online = (s === 'online' || s === 'true' || s === '1' || rawStatus === true) ? 1 : 0;
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
  return pageAll(Q_LIST_USERS_FULL, { filter: filter || null }, (d) => d.listUsers);
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
  // 最近更新在上；同秒则在线优先，再按名称
  return rows.map(normalizeDevice).sort((a, b) => {
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
