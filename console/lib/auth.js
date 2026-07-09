// 登录 & 凭证 —— 移植 login_controller.dart 的 SRP 流程。
// SRP 用 amazon-cognito-identity-js;临时 AWS 凭证(给 KVS 用)用 Cognito Identity Pool。
import { COGNITO, DEPS } from '../config.js';
import { resolveUserRow } from './graphql.js';

let _cognito = null;   // amazon-cognito-identity-js 模块
let _pool = null;
let _idToken = null;   // 当前会话 idToken
let _identityId = null;
let _creds = null;     // { accessKeyId, secretAccessKey, sessionToken, expiration(ms) }

async function cognito() {
  if (!_cognito) _cognito = await import(DEPS.cognitoIdentityJs);
  return _cognito;
}
async function pool() {
  const C = await cognito();
  if (!_pool) _pool = new C.CognitoUserPool({ UserPoolId: COGNITO.userPoolId, ClientId: COGNITO.userPoolClientId });
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
  const userRow = await resolveUserRow(sub).catch(() => null);
  return { sub, email: session.getIdToken().payload.email || '', idToken: _idToken, userRow };
}

export async function signOut() {
  const p = await pool();
  const user = p.getCurrentUser();
  if (user) user.signOut();
  _idToken = null; _creds = null; _identityId = null;
}

export function currentIdToken() { return _idToken; }

// Cognito Identity 服务裸调用(AWS JSON 1.1,登录 token 授权,无需签名)
async function cognitoIdentityCall(target, body) {
  const r = await fetch(`https://cognito-identity.${COGNITO.region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityService.${target}` },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.__type || j.message) throw new Error(j.message || j.__type);
  return j;
}

// 临时 AWS 凭证 { accessKeyId, secretAccessKey, sessionToken }(供 IoT/KVS SigV4)。
// 裸 GetId + GetCredentialsForIdentity —— 不用 @aws-sdk(其 esm.sh 版会拉 node fs 在浏览器崩)。缓存到过期前。
export async function resolvedCreds() {
  if (!_idToken) throw new Error('未登录,无法获取 AWS 凭证。');
  if (_creds && _creds.expiration && Date.now() < _creds.expiration - 60000) return _creds;
  const logins = { [`cognito-idp.${COGNITO.region}.amazonaws.com/${COGNITO.userPoolId}`]: _idToken };
  if (!_identityId) {
    const id = await cognitoIdentityCall('GetId', { IdentityPoolId: COGNITO.identityPoolId, Logins: logins });
    _identityId = id.IdentityId;
  }
  const cr = await cognitoIdentityCall('GetCredentialsForIdentity', { IdentityId: _identityId, Logins: logins });
  const c = cr.Credentials;
  _creds = {
    accessKeyId: c.AccessKeyId,
    secretAccessKey: c.SecretKey,
    sessionToken: c.SessionToken || '',
    expiration: c.Expiration ? c.Expiration * 1000 : (Date.now() + 3000000),
  };
  return _creds;
}
