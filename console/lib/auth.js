// 登录 & 凭证 —— 移植 login_controller.dart 的 SRP 流程。
// SRP 用 amazon-cognito-identity-js;临时 AWS 凭证(给 KVS 用)用 Cognito Identity Pool。
import { COGNITO, DEPS } from '../config.js';
import { resolveUserRow } from './graphql.js';

let _cognito = null;   // amazon-cognito-identity-js 模块
let _pool = null;
let _poolKey = null;   // 当前 _pool 对应的 userPoolId(切区域时 COGNITO 变 → 重建 pool)
let _idToken = null;   // 当前会话 idToken
let _identityId = null;
let _creds = null;     // { accessKeyId, secretAccessKey, sessionToken, expiration(ms) }

async function cognito() {
  if (!_cognito) _cognito = await import(DEPS.cognitoIdentityJs);
  return _cognito;
}
async function pool() {
  const C = await cognito();
  if (!_pool || _poolKey !== COGNITO.userPoolId) {
    _pool = new C.CognitoUserPool({ UserPoolId: COGNITO.userPoolId, ClientId: COGNITO.userPoolClientId });
    _poolKey = COGNITO.userPoolId;
  }
  return _pool;
}

// 预热:启动时后台提前 import cognito-identity-js(esm.sh 冷加载是登录/恢复会话的主要延迟)+ 建 pool,
// 让用户填账号时模块已就绪,signIn/restoreSession 不再等 CDN 冷加载。
export function warmupAuth() { pool().catch(() => {}); }

// 登录(USER_SRP_AUTH,账号为用户名)。成功后解析出 User 行(含 User.id)。
export async function signIn(username, password) {
  const C = await cognito();
  const p = await pool();
  const user = new C.CognitoUser({ Username: username, Pool: p });
  const details = new C.AuthenticationDetails({ Username: username, Password: password });
  const session = await new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: resolve,
      onFailure: reject,
      newPasswordRequired: () => reject(new Error('需要设置新密码,请在 App 内先完成。')),
    });
  });
  _idToken = session.getIdToken().getJwtToken();
  _creds = null; _identityId = null;
  const sub = session.getIdToken().payload.sub;
  const userRow = await resolveUserRow(sub);
  if (!userRow) throw new Error('登录成功,但未找到该账号的用户档案(User 表无记录)。');
  try { localStorage.setItem('dv_userrow_' + sub, JSON.stringify(userRow)); } catch (e) {}   // 缓存供 restoreSession 秒回
  return { sub, email: userRow.email || username, account: username, idToken: _idToken, userRow };
}

// 恢复已有会话(刷新页面 / 免重复登录)
export async function restoreSession() {
  const C = await cognito();
  const p = await pool();
  const user = p.getCurrentUser();
  if (!user) return null;
  const session = await new Promise((resolve) => {
    user.getSession((err, s) => resolve(err || !s || !s.isValid() ? null : s));
  });
  if (!session) return null;
  _idToken = session.getIdToken().getJwtToken();
  _creds = null; _identityId = null;
  const sub = session.getIdToken().payload.sub;
  // 有缓存立刻返回，后台再刷 User 行，避免刷新卡在 listUsers ~1.5s。
  let userRow = null;
  try { userRow = JSON.parse(localStorage.getItem('dv_userrow_' + sub) || 'null'); } catch (e) {}
  if (userRow && userRow.id) {
    resolveUserRow(sub).then((fresh) => {
      if (!fresh) return;
      if (userRow.id && fresh.id && userRow.id !== fresh.id) {
        try { localStorage.removeItem('dv_devices_' + userRow.id); } catch (e) {}
      }
      try { localStorage.setItem('dv_userrow_' + sub, JSON.stringify(fresh)); } catch (e) {}
    }).catch(() => {});
  } else {
    userRow = await resolveUserRow(sub).catch(() => null);
    if (userRow) {
      try { localStorage.setItem('dv_userrow_' + sub, JSON.stringify(userRow)); } catch (e) {}
    }
  }
  const account = session.getIdToken().payload['cognito:username'] || (userRow && userRow.awsUserName) || '';
  return { sub, account, email: session.getIdToken().payload.email || '', idToken: _idToken, userRow };
}

export function invalidateSessionMemory() {
  _idToken = null; _creds = null; _identityId = null;
  _pool = null; _poolKey = null;
}

export async function signOut() {
  try {
    const p = await pool();
    const user = p.getCurrentUser();
    if (user) user.signOut();
  } catch (_) {}
  invalidateSessionMemory();
  // 清缓存(换账号/换区域防错乱):identityId(各区域)+ 所有 userRow + 设备列表缓存
  try {
    Object.keys(localStorage).forEach((k) => { if (k.indexOf('dv_identityid') === 0 || k.indexOf('dv_userrow_') === 0 || k.indexOf('dv_devices_') === 0) localStorage.removeItem(k); });
  } catch (e) {}
}

export function currentIdToken() { return _idToken; }

// Cognito Identity 服务裸调用(AWS JSON 1.1,登录 token 授权,无需签名)
async function cognitoIdentityCall(target, body) {
  const r = await fetch(`https://cognito-identity.${COGNITO.region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityService.${target}` },
    body: JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch (_) {}
  if (!r.ok || j.__type || j.message) {
    const msg = j.message || j.__type || ('Cognito Identity HTTP ' + r.status);
    const err = new Error(msg);
    err.status = r.status;
    err.type = j.__type || '';
    throw err;
  }
  return j;
}

let _credsInflight = null;

function clearIdentityCache() {
  _identityId = null;
  try {
    const idKey = 'dv_identityid_' + COGNITO.userPoolId;
    localStorage.removeItem(idKey);
  } catch (e) {}
}

async function refreshIdTokenIfPossible() {
  try {
    const p = await pool();
    const user = p.getCurrentUser();
    if (!user) return false;
    const session = await new Promise((resolve) => {
      user.getSession((err, s) => resolve(err || !s || !s.isValid() ? null : s));
    });
    if (!session) return false;
    _idToken = session.getIdToken().getJwtToken();
    return true;
  } catch (_) { return false; }
}

async function fetchAwsCreds(forceNewIdentity) {
  if (!_idToken) throw new Error('未登录,无法获取 AWS 凭证。');
  const logins = { [`cognito-idp.${COGNITO.region}.amazonaws.com/${COGNITO.userPoolId}`]: _idToken };
  const idKey = 'dv_identityid_' + COGNITO.userPoolId;
  if (forceNewIdentity) clearIdentityCache();
  if (!_identityId) {
    try { _identityId = localStorage.getItem(idKey) || null; } catch (e) {}
  }
  if (!_identityId) {
    const id = await cognitoIdentityCall('GetId', { IdentityPoolId: COGNITO.identityPoolId, Logins: logins });
    _identityId = id.IdentityId;
    try { localStorage.setItem(idKey, _identityId); } catch (e) {}
  }
  const cr = await cognitoIdentityCall('GetCredentialsForIdentity', { IdentityId: _identityId, Logins: logins });
  const c = cr.Credentials;
  if (!c || !c.AccessKeyId) throw new Error('Cognito Identity 未返回凭证');
  _creds = {
    accessKeyId: c.AccessKeyId,
    secretAccessKey: c.SecretKey,
    sessionToken: c.SessionToken || '',
    expiration: c.Expiration ? c.Expiration * 1000 : (Date.now() + 3000000),
  };
  return _creds;
}

// 临时 AWS 凭证 { accessKeyId, secretAccessKey, sessionToken }(供 IoT/KVS SigV4)。
// 裸 GetId + GetCredentialsForIdentity —— 不用 @aws-sdk(其 esm.sh 版会拉 node fs 在浏览器崩)。
// 缓存到过期前；并发合并为单次请求；僵死 identityId / 过期 token 自动清缓存重试。
export async function resolvedCreds() {
  if (!_idToken) throw new Error('未登录,无法获取 AWS 凭证。');
  if (_creds && _creds.expiration && Date.now() < _creds.expiration - 60000) return _creds;
  if (_credsInflight) return _credsInflight;
  _credsInflight = (async () => {
    try {
      try {
        return await fetchAwsCreds(false);
      } catch (e1) {
        // 常见: localStorage 里 identityId 与当前登录账号不匹配 → 400；清掉重 GetId
        _creds = null;
        try {
          return await fetchAwsCreds(true);
        } catch (e2) {
          // idToken 过期 → 刷新 Cognito 会话后再试一次
          const refreshed = await refreshIdTokenIfPossible();
          if (!refreshed) throw e2;
          _creds = null;
          return await fetchAwsCreds(true);
        }
      }
    } finally {
      _credsInflight = null;
    }
  })();
  return _credsInflight;
}
