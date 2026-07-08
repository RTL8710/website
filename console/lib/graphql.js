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
  if (json.errors && json.errors.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
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
      items { id awsUserID awsUserName email region }
      nextToken
    }
  }`;

export async function resolveUserRow(cognitoSub) {
  const items = await pageAll(
    Q_LIST_USERS,
    { filter: { awsUserID: { eq: cognitoSub } } },
    (d) => d.listUsers,
  );
  return items[0] || null; // { id, awsUserID, email, ... }
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
  try { info = d.deviceGeneralInformation ? JSON.parse(d.deviceGeneralInformation) : {}; } catch (_) {}
  return {
    id: d.id,
    online: d.deviceConnectStatus === 'online' ? 1 : 0,
    connectStatus: d.deviceConnectStatus || 'offline',
    picture: d.devicePicture || '',
    ownerUserId: d.ownerUserId || '',
    name: info.deviceName || info.deviceModelName || d.id,
    model: info.deviceModelName || '',
    firmware: info.deviceVersion || '',
    uuid: info.deviceUuid || '',
    deviceType: info.deviceType,
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
