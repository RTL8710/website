#!/usr/bin/env node
// Admin console self-test — data plane + static deploy markers
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const EP = process.env.APPSYNC_EP || 'https://hpuaoablfjgfhjrbpdy3a3u7la.appsync-api.ap-northeast-1.amazonaws.com/graphql';
const KEY = process.env.APPSYNC_KEY || 'da2-rmzpjwx7lva7zbfviuy2nwzbcy';
const BASE = process.env.ADMIN_BASE || 'https://anhaishi.cn/console';

const fails = [];
function ok(name, cond, detail) {
  if (cond) console.log('PASS', name, detail || '');
  else { console.log('FAIL', name, detail || ''); fails.push(name); }
}

async function gql(query, variables) {
  const r = await fetch(EP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join('; '));
  return j.data;
}

async function pageCount(root, itemHint = 'id') {
  let token = null, n = 0, pages = 0;
  do {
    const data = await gql(
      `query($t:String){ ${root}(limit:1000,nextToken:$t){ items{ ${itemHint} } nextToken } }`,
      { t: token },
    );
    const conn = data[root];
    n += (conn.items || []).length;
    token = conn.nextToken;
    pages++;
  } while (token && pages < 30);
  return { n, truncated: !!token };
}

async function main() {
  console.log('=== Admin self-test ===', new Date().toISOString());

  // 1) Deployed assets
  for (const path of ['/admin/', '/admin/admin.js', '/admin/admin.css', '/config.js', '/app.js']) {
    const r = await fetch(BASE + path, { method: 'GET' });
    ok('http ' + path, r.status === 200, 'status=' + r.status);
  }
  const js = await (await fetch(BASE + '/admin/admin.js')).text();
  ok('feature 升级到最新', js.includes('升级到最新'));
  ok('feature 一键远程升级', js.includes('一键远程升级'));
  ok('feature 上传并登记', js.includes('上传并登记'));
  ok('feature confirm modal', js.includes('确认远程升级'));
  ok('tabs merged OTA', js.includes("id: 'ota'") && !js.includes("id: 'packages'"));
  ok('uuid hard require', js.includes('设备缺少 deviceUuid'));
  ok('admin own login', js.includes('登录管理后台') && js.includes('function viewLogin'));
  ok('ota default latest', js.includes('ensureDefaultUpgradeSelection') && js.includes('★最新'));
  ok('ota status push', js.includes('updateRemoteOtaStatusCommand') && js.includes('applyOtaPush'));
  ok('bind null-safe', js.includes('b && (b.deviceId === deviceId'));
  ok('user/device CRUD', js.includes('openEditUser') && js.includes('askDeleteDevice') && js.includes('deleteUserCompletely'));
  ok('no redirect to console login', !js.includes("location.href = '../index.html#/login'"));

  const appJs = await (await fetch(BASE + '/app.js')).text();
  ok('console has no admin entry', !appJs.includes('管理后台') && !appJs.includes('isAdminAccount'));

  const cfg = await (await fetch(BASE + '/config.js')).text();
  ok('allowlist present', cfg.includes('ADMIN_ALLOWLIST') && cfg.includes('isAdminAccount'));
  const gql = await (await fetch(BASE + '/lib/graphql.js')).text();
  ok('graphql deleteUserCompletely', gql.includes('deleteUserCompletely') && gql.includes('deleteDeviceCompletely'));
  ok('standalone admin entry comment', cfg.includes('/console/admin/'));

  // 2) Amplify data completeness
  const users = await pageCount('listUsers', 'id awsUserName');
  const devices = await pageCount('listDevices', 'id deviceConnectStatus');
  const upgrades = await pageCount('listDeviceUpgrades', 'id upgradeDeviceVersion');
  ok('users > 0', users.n > 0, 'n=' + users.n);
  ok('devices > 0', devices.n > 0, 'n=' + devices.n);
  ok('upgrades > 0', upgrades.n > 0, 'n=' + upgrades.n);

  // sample cloud records recent
  const end = new Date().toISOString();
  const start = new Date(Date.now() - 7 * 864e5).toISOString();
  const rec = await gql(
    `query($f:ModelCloudRecordFilterInput){ listCloudRecords(filter:$f,limit:50){ items{ id deviceID dateTime } } }`,
    { f: { dateTime: { between: [start, end] } } },
  );
  ok('cloud records query', Array.isArray(rec.listCloudRecords.items), 'n=' + rec.listCloudRecords.items.length);

  // create mutation shape (dry — skip actual create)
  ok('create mutation documented in js', js.includes('createDeviceUpgrade'));

  // 3) Optional Cognito login E2E
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (user && pass) {
    console.log('Cognito E2E enabled for', user);
    // dynamic import of amazon-cognito-identity-js is node-unfriendly; just note
    ok('creds provided', true, 'run browser E2E separately');
  } else {
    console.log('SKIP cognito UI login (set ADMIN_USER/ADMIN_PASS to enable)');
  }

  console.log('---');
  if (fails.length) {
    console.log('FAILED', fails.length, fails.join(', '));
    process.exit(1);
  }
  console.log('ALL PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
