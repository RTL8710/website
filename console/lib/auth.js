// 登录 & 凭证 —— 移植 login_controller.dart 的 SRP 流程。
// SRP 用 amazon-cognito-identity-js;临时 AWS 凭证(给 KVS 用)用 Cognito Identity Pool。
import { COGNITO, DEPS } from '../config.js';
import { resolveUserRow } from './graphql.js';

let _cognito = null;   // amazon-cognito-identity-js 模块
let _pool = null;
let _idToken = null;   // 当前会话 idToken
let _credsProvider = null;

async function cognito() {
  if (!_cognito) _cognito = await import(DEPS.cognitoIdentityJs);
  return _cognito;
}
async function pool() {
  const C = await cognito();
  if (!_pool) _pool = new C.CognitoUserPool({ UserPoolId: COGNITO.userPoolId, ClientId: COGNITO.userPoolClientId });
  return _pool;
}

// 登录(USER_SRP_AUTH)。成功后解析出 User 行(含 User.id)。
export async function signIn(email, password) {
  const C = await cognito();
  const p = await pool();
  const user = new C.CognitoUser({ Username: email, Pool: p });
  const details = new C.AuthenticationDetails({ Username: email, Password: password });
  const session = await new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: resolve,
      onFailure: reject,
      newPasswordRequired: () => reject(new Error('需要设置新密码,请在 App 内先完成。')),
    });
  });
  _idToken = session.getIdToken().getJwtToken();
  _credsProvider = null;
  const sub = session.getIdToken().payload.sub;
  const userRow = await resolveUserRow(sub);
  if (!userRow) throw new Error('登录成功,但未找到该账号的用户档案(User 表无记录)。');
  return { sub, email, idToken: _idToken, userRow };
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
  _credsProvider = null;
  const sub = session.getIdToken().payload.sub;
  const userRow = await resolveUserRow(sub).catch(() => null);
  return { sub, email: session.getIdToken().payload.email || '', idToken: _idToken, userRow };
}

export async function signOut() {
  const p = await pool();
  const user = p.getCurrentUser();
  if (user) user.signOut();
  _idToken = null; _credsProvider = null;
}

// 临时 AWS 凭证(SigV4 用于 KVS)。缓存 provider,SDK 会自动刷新。
export async function awsCredentials() {
  if (!_idToken) throw new Error('未登录,无法获取 AWS 凭证。');
  if (!_credsProvider) {
    const { fromCognitoIdentityPool } = await import(DEPS.credentialProviders);
    _credsProvider = fromCognitoIdentityPool({
      identityPoolId: COGNITO.identityPoolId,
      clientConfig: { region: COGNITO.region },
      logins: { [`cognito-idp.${COGNITO.region}.amazonaws.com/${COGNITO.userPoolId}`]: _idToken },
    });
  }
  return _credsProvider;
}

export function currentIdToken() { return _idToken; }
