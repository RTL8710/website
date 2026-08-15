// 设备管理控制台 — 非敏感配置(这些 ID 在 Flutter App 内已公开,可提交)
// 多区域:东南亚(ap/Tokyo)/ 美洲(us/Ohio)/ 欧洲(eu/Paris),对齐手机 App region_config.dart。
// 登录页选区域 → 用对应区域的 Cognito/AppSync/S3/IoT/KVS 配置。凭证/KVS/IoT 全走裸 fetch + CryptoJS SigV4。
// 注:仅 Tokyo 有验证过的 web client(coot74);Ohio/Paris 用 App 的 native client 试浏览器 SRP
//     (Cognito app client 无 client secret 时浏览器 SRP 可用;若某区域登录失败需在 AWS 侧建 web client)。

export const REGIONS = {
  ap: {
    code: 'ap', label: '东南亚', region: 'ap-northeast-1',
    userPoolId: 'ap-northeast-1_yy1j7zYoi', userPoolClientId: 'coot74gda6j2e1q36su73m9rs',
    identityPoolId: 'ap-northeast-1:4f20eecf-8245-44f1-af1d-ce335a359b6a',
    appsync: 'https://hpuaoablfjgfhjrbpdy3a3u7la.appsync-api.ap-northeast-1.amazonaws.com/graphql',
    apiKey: 'da2-rmzpjwx7lva7zbfviuy2nwzbcy',
    s3Bucket: 'anhaivisionwebsite-storage-77a56c21232245-tokyo',
    iotEndpoint: 'atwwuuu2m6zxs-ats.iot.ap-northeast-1.amazonaws.com',
    kvsRegion: 'ap-northeast-1',
  },
  us: {
    code: 'us', label: '美洲', region: 'us-east-2',
    userPoolId: 'us-east-2_xw0KXNJSX', userPoolClientId: '15d89djqur9500jdjt9m7ju2j8',
    identityPoolId: 'us-east-2:254334b9-c534-4974-8126-8a52115acfa0',
    appsync: 'https://hyyc4pqt5zhftaxg7su3mirkxm.appsync-api.us-east-2.amazonaws.com/graphql',
    apiKey: 'da2-f6g7opuzyfazlihpyv6nzejn2e',
    s3Bucket: 'anhaivisionwebsite-storage-77a56c21111855-ohio',
    iotEndpoint: 'atwwuuu2m6zxs-ats.iot.us-east-2.amazonaws.com',
    kvsRegion: 'us-east-2',
  },
  eu: {
    code: 'eu', label: '欧洲', region: 'eu-west-3',
    userPoolId: 'eu-west-3_EBHsEh1as', userPoolClientId: 'htggrh7j4nt248btni5bf2ghr',
    identityPoolId: 'eu-west-3:a6c7537e-e3c4-4fc9-948a-cae2560df971',
    appsync: 'https://ehyxqkbrzzan7o2fz5mhhstzqq.appsync-api.eu-west-3.amazonaws.com/graphql',
    apiKey: 'da2-cep3asdgp5gopnr4qizhnxon4i',
    s3Bucket: 'anhaivisionwebsite-storage-77a56c2193636-paris',
    iotEndpoint: 'atwwuuu2m6zxs-ats.iot.eu-west-3.amazonaws.com',
    kvsRegion: 'eu-west-3',
  },
};
// 登录页区域选择显示顺序(对齐 App 的 [美洲, 东南亚, 欧洲])
export const REGION_ORDER = ['us', 'ap', 'eu'];

let _region = 'ap';
try { const r = localStorage.getItem('dv_region'); if (r && REGIONS[r]) _region = r; } catch (e) {}
export function getRegion() { return _region; }
export function activeRegion() { return REGIONS[_region]; }
export function setRegion(r) { if (REGIONS[r]) { _region = r; try { localStorage.setItem('dv_region', r); } catch (e) {} _refresh(); } }

// live binding:切区域后 setRegion→_refresh 更新这些导出,import 方(每次读 .xxx)自动拿到新区域配置
export let REGION = REGIONS[_region].region;
export let COGNITO = _mkCognito(_region);
export let APPSYNC = _mkAppsync(_region);
export let S3_BUCKET = REGIONS[_region].s3Bucket;
export let IOT_ENDPOINT = REGIONS[_region].iotEndpoint;
function _mkCognito(r) { const c = REGIONS[r]; return { region: c.region, userPoolId: c.userPoolId, userPoolClientId: c.userPoolClientId, identityPoolId: c.identityPoolId }; }
function _mkAppsync(r) { const c = REGIONS[r]; return { endpoint: c.appsync, region: c.region, apiKey: c.apiKey }; }
function _refresh() { REGION = REGIONS[_region].region; COGNITO = _mkCognito(_region); APPSYNC = _mkAppsync(_region); S3_BUCKET = REGIONS[_region].s3Bucket; IOT_ENDPOINT = REGIONS[_region].iotEndpoint; }

// KVS 区域解析(移植 kvsApi.dart:cn→cn-north-1, us→us-east-2, eu→eu-west-3, 默认→ap-northeast-1)
export function resolveKvsRegion(regionCode) {
  switch (regionCode) {
    case 'cn': return 'cn-north-1';
    case 'us': return 'us-east-2';
    case 'eu': return 'eu-west-3';
    default: return 'ap-northeast-1';
  }
}

// 登录用 amazon-cognito-identity-js(esm.sh)。不用 @aws-sdk(其 esm.sh 版会拉 node fs 在浏览器崩)。
export const DEPS = {
  cognitoIdentityJs: 'https://esm.sh/amazon-cognito-identity-js@6.3.12',
};

// 云端管理后台白名单（匹配 Cognito 用户名 / awsUserName / email，大小写不敏感）
// 铁律:admin 与终端用户账号解耦——勿把 App 个人账号(如 lvjinhui)放进名单。
// 入口仅独立页 /console/admin/(本页自带登录);设备控制台 app.js 无「管理后台」按钮。
// 当前白名单仅 lvjinhui;User 表只需有档案行,
// 不需要绑定 DeviceUser(管理后台走 listAll* 全库,与「我的设备」无关)。
// 非名单账号直链 admin/ 也会被拦(本页提示无权限)。
export const ADMIN_ALLOWLIST = [
  'lvjinhui',
];
export function isAdminAccount(session) {
  if (!session) return false;
  const cands = [
    session.account,
    session.email,
    session.userRow && session.userRow.awsUserName,
    session.userRow && session.userRow.email,
  ].filter(Boolean).map((x) => String(x).trim().toLowerCase());
  const allow = ADMIN_ALLOWLIST.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  if (!allow.length) return false;
  return cands.some((c) => allow.includes(c) || allow.includes(c.split('@')[0]));
}
