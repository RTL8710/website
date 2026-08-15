// 管理后台 i18n + 主题（与设备控制台共用 localStorage dv_lang / dv_theme）
import { REGIONS } from '../config.js';
import { h } from '../lib/ui.js';

export const THEMES = [
  { v: 'dark', sw1: '#0B1220', sw2: '#22D3EE' },
  { v: 'light', sw1: '#EEF2F7', sw2: '#0ea5e9' },
  { v: 'cyber', sw1: '#0A0612', sw2: '#E94FE0' },
  { v: 'amber', sw1: '#0D0D0F', sw2: '#FFB020' },
  { v: 'matrix', sw1: '#06100A', sw2: '#22E584' },
  { v: 'oled', sw1: '#000000', sw2: '#4EA8FF' },
  { v: 'ocean', sw1: '#04141F', sw2: '#2DD4BF' },
];
const THEME_I18N = {
  dark: { zh: '深靖蓝·青', en: 'Deep Blue', ja: 'ダークブルー', de: 'Dunkelblau', fr: 'Bleu profond', es: 'Azul profundo' },
  light: { zh: '极简浅色', en: 'Light', ja: 'ライト', de: 'Hell', fr: 'Clair', es: 'Claro' },
  cyber: { zh: '赛博霓虹紫', en: 'Cyber Neon', ja: 'サイバー', de: 'Cyber-Neon', fr: 'Cyber néon', es: 'Ciber neón' },
  amber: { zh: '工业琥珀橙', en: 'Amber', ja: 'アンバー', de: 'Bernstein', fr: 'Ambre', es: 'Ámbar' },
  matrix: { zh: '终端极客绿', en: 'Matrix', ja: 'マトリックス', de: 'Matrix', fr: 'Matrix', es: 'Matrix' },
  oled: { zh: '纯黑 OLED', en: 'OLED Black', ja: 'OLED', de: 'OLED', fr: 'OLED', es: 'OLED' },
  ocean: { zh: '大海', en: 'Ocean', ja: 'オーシャン', de: 'Ozean', fr: 'Océan', es: 'Océano' },
};
const REGION_I18N = {
  ap: { zh: '东南亚', en: 'Asia Pacific', ja: 'アジア太平洋', de: 'Asien-Pazifik', fr: 'Asie-Pacifique', es: 'Asia-Pacífico' },
  us: { zh: '美洲', en: 'Americas', ja: 'アメリカ', de: 'Amerika', fr: 'Amériques', es: 'América' },
  eu: { zh: '欧洲', en: 'Europe', ja: 'ヨーロッパ', de: 'Europa', fr: 'Europe', es: 'Europa' },
};
export const LANGS = [
  { v: 'en', label: 'English', flag: '🇺🇸', short: 'EN' },
  { v: 'zh', label: '中文', flag: '🇨🇳', short: '中文' },
  { v: 'ja', label: '日本語', flag: '🇯🇵', short: '日本語' },
  { v: 'de', label: 'Deutsch', flag: '🇩🇪', short: 'DE' },
  { v: 'fr', label: 'Français', flag: '🇫🇷', short: 'FR' },
  { v: 'es', label: 'Español', flag: '🇪🇸', short: 'ES' },
];
const I18N = {
  en: {"brand":"Admin Console","brandShort":"Admin","consoleLink":"Console","logout":"Sign out","tabOverview":"Overview","tabUsers":"Users","tabDevices":"Devices","tabRecords":"Cloud Records","tabOta":"OTA","sideHint":"Short path: Devices → Upgrade to latest\nor upload on OTA then push","loginTitle":"Admin Console","loginSub":"Standalone entry · allowlisted ops accounts only.","loginBtn":"Sign in to Admin","loginLoading":"Signing in…","labelUser":"Username","labelPass":"Password","labelRegion":"Region","phUser":"Ops account","phPass":"Password","errEmpty":"Please enter username and password","noPermTitle":"No admin access","noPermBody":"Current account is not on the ops allowlist. Use /console/admin/ with an allowlisted account.","reLogin":"Sign out and retry","backConsole":"Device console","goConsole":"Go to device console","restoring":"Restoring session…","overview":"Overview","overviewSub":"Amplify full DB · remote OTA same as App","users":"Users","usersSub":"Full User table · edit / delete (unbind; Cognito kept)","devices":"Devices","devicesSub":"Edit info · delete clears binds then Device · Upgrade to latest picks newest package","records":"Cloud Records","ota":"OTA","otaSub":"Upload + remote upgrade · App CLOUD_ONLY protocol","refresh":"Refresh","searchUsers":"Username / email / ID…","searchDevices":"Name / UUID / model / owner…","searchPkgs":"Search version / notes…","edit":"Edit","delete":"Delete","save":"Save","saving":"Saving…","cancel":"Cancel","enter":"Open","upgradeLatest":"Upgrade to latest","online":"Online","offline":"Offline","all":"All","copied":"Copied","copyFail":"Copy failed","dataRefreshed":"Data refreshed","colUser":"Username","colEmail":"Email","colPhone":"Phone","colRegion":"Region","colUpdated":"Updated","colActions":"Actions","colStatus":"Status","colName":"Name","colModel":"Model","colVersion":"Version","colOwner":"Owner","colBinds":"Binds","editUser":"Edit user","editDevice":"Edit device","confirmDelUser":"Delete user?","confirmDelDevice":"Delete device?","confirmUpgrade":"Confirm remote upgrade","confirmOk":"Confirm","confirmUpgradeOk":"Confirm upgrade","confirmDelOk":"Delete","usersCount":"users","devicesCount":"devices","onlineCount":"online","pkgsCount":"packages","recordsCount":"records","commonOps":"Common actions","upgradeDevices":"Upgrade devices","uploadPkg":"Upload package","stepUpload":"Upload package to cloud","stepPush":"Pick device & package, push once","btnUpload":"Upload & register","uploading":"Uploading","btnRemote":"One-click remote upgrade","upgrading":"Upgrading","dispatching":"Dispatching…","file":"File","deviceType":"Model","partition":"Partition","version":"Version","describe":"Notes","device":"Device","package":"Package","partOverride":"Partition override","followPkg":"Follow package","upgradeStatus":"Upgrade status","waitingDevice":"Waiting for device…","pickDevicePkg":"Select device and package","latestMark":"★ Latest · ","pickPkg":"Select package (latest by default)…","pickDevice":"Select device","authBad":"Incorrect username or password","authUnconfirmed":"Account not verified","authNet":"Network error, retry","authFail":"Sign-in failed"},
  zh: {"brand":"云端管理后台","brandShort":"Admin","consoleLink":"控制台","logout":"退出","tabOverview":"总览","tabUsers":"用户","tabDevices":"设备","tabRecords":"云录像","tabOta":"OTA","sideHint":"最短路径：设备 → 升级到最新\n或 OTA 页上传后一键下发","loginTitle":"云端管理后台","loginSub":"独立入口 · 仅运维白名单账号。设备控制台无此入口。","loginBtn":"登录管理后台","loginLoading":"登录中…","labelUser":"用户名","labelPass":"密码","labelRegion":"区域","phUser":"运维账号","phPass":"密码","errEmpty":"请输入用户名和密码","noPermTitle":"无管理后台权限","noPermBody":"当前账号不是运维白名单。请用白名单账号在 /console/admin/ 登录。","reLogin":"退出并重新登录","backConsole":"返回设备控制台","goConsole":"前往设备控制台","restoring":"恢复会话…","overview":"总览","overviewSub":"Amplify 全库数据 · 远程 OTA 与 App 同协议","users":"用户","usersSub":"User 表全量 · 可编辑资料 / 删除（清绑定，不删 Cognito）","devices":"设备","devicesSub":"可编辑设备信息 · 删除会清全部绑定再删 Device · 「升级到最新」自动选最新包","records":"云录像","ota":"OTA","otaSub":"上传与远程升级合在一页 · 协议对齐 App CLOUD_ONLY","refresh":"刷新","searchUsers":"用户名 / 邮箱 / ID…","searchDevices":"名称 / UUID / 型号 / 所有者…","searchPkgs":"搜包版本 / 说明…","edit":"编辑","delete":"删除","save":"保存","saving":"保存中…","cancel":"取消","enter":"进入","upgradeLatest":"升级到最新","online":"在线","offline":"离线","all":"全部","copied":"已复制","copyFail":"复制失败","dataRefreshed":"数据已刷新","colUser":"用户名","colEmail":"邮箱","colPhone":"手机","colRegion":"区域","colUpdated":"更新","colActions":"操作","colStatus":"状态","colName":"名称","colModel":"型号","colVersion":"版本","colOwner":"所有者","colBinds":"绑定","editUser":"编辑用户","editDevice":"编辑设备","confirmDelUser":"确认删除用户","confirmDelDevice":"确认删除设备","confirmUpgrade":"确认远程升级","confirmOk":"确认","confirmUpgradeOk":"确认升级","confirmDelOk":"确认删除","usersCount":"用户","devicesCount":"设备","onlineCount":"在线","pkgsCount":"升级包","recordsCount":"云录像","commonOps":"常用操作","upgradeDevices":"升级设备","uploadPkg":"上传升级包","stepUpload":"上传升级包到云端","stepPush":"选择设备与包，一键下发","btnUpload":"上传并登记","uploading":"上传中","btnRemote":"一键远程升级","upgrading":"升级中","dispatching":"下发中…","file":"文件","deviceType":"机型","partition":"分区","version":"版本","describe":"说明","device":"设备","package":"升级包","partOverride":"分区覆盖","followPkg":"跟随升级包","upgradeStatus":"升级状态","waitingDevice":"等待设备上报…","pickDevicePkg":"请先选择设备和升级包","latestMark":"★最新 · ","pickPkg":"选择升级包（默认最新）…","pickDevice":"选择设备","authBad":"用户名或密码不正确","authUnconfirmed":"账号未验证","authNet":"网络错误,请重试","authFail":"登录失败"},
  ja: {"brand":"管理コンソール","brandShort":"Admin","consoleLink":"コンソール","logout":"ログアウト","tabOverview":"概要","tabUsers":"ユーザー","tabDevices":"デバイス","tabRecords":"クラウド録画","tabOta":"OTA","sideHint":"Short path: Devices → Upgrade to latest\nor upload on OTA then push","loginTitle":"Admin Console","loginSub":"Standalone entry · allowlisted ops accounts only.","loginBtn":"管理画面にログイン","loginLoading":"ログイン中…","labelUser":"ユーザー名","labelPass":"パスワード","labelRegion":"地域","phUser":"Ops account","phPass":"Password","errEmpty":"Please enter username and password","noPermTitle":"No admin access","noPermBody":"Current account is not on the ops allowlist. Use /console/admin/ with an allowlisted account.","reLogin":"Sign out and retry","backConsole":"Device console","goConsole":"Go to device console","restoring":"Restoring session…","overview":"Overview","overviewSub":"Amplify full DB · remote OTA same as App","users":"Users","usersSub":"Full User table · edit / delete (unbind; Cognito kept)","devices":"Devices","devicesSub":"Edit info · delete clears binds then Device · Upgrade to latest picks newest package","records":"Cloud Records","ota":"OTA","otaSub":"Upload + remote upgrade · App CLOUD_ONLY protocol","refresh":"更新","searchUsers":"Username / email / ID…","searchDevices":"Name / UUID / model / owner…","searchPkgs":"Search version / notes…","edit":"編集","delete":"削除","save":"保存","saving":"Saving…","cancel":"キャンセル","enter":"開く","upgradeLatest":"最新へ更新","online":"オンライン","offline":"オフライン","all":"すべて","copied":"Copied","copyFail":"Copy failed","dataRefreshed":"Data refreshed","colUser":"Username","colEmail":"Email","colPhone":"Phone","colRegion":"Region","colUpdated":"Updated","colActions":"Actions","colStatus":"Status","colName":"Name","colModel":"Model","colVersion":"Version","colOwner":"Owner","colBinds":"Binds","editUser":"Edit user","editDevice":"Edit device","confirmDelUser":"Delete user?","confirmDelDevice":"Delete device?","confirmUpgrade":"Confirm remote upgrade","confirmOk":"Confirm","confirmUpgradeOk":"Confirm upgrade","confirmDelOk":"Delete","usersCount":"users","devicesCount":"devices","onlineCount":"online","pkgsCount":"packages","recordsCount":"records","commonOps":"Common actions","upgradeDevices":"Upgrade devices","uploadPkg":"Upload package","stepUpload":"Upload package to cloud","stepPush":"Pick device & package, push once","btnUpload":"Upload & register","uploading":"Uploading","btnRemote":"One-click remote upgrade","upgrading":"Upgrading","dispatching":"Dispatching…","file":"File","deviceType":"Model","partition":"Partition","version":"Version","describe":"Notes","device":"Device","package":"Package","partOverride":"Partition override","followPkg":"Follow package","upgradeStatus":"Upgrade status","waitingDevice":"Waiting for device…","pickDevicePkg":"Select device and package","latestMark":"★ Latest · ","pickPkg":"Select package (latest by default)…","pickDevice":"Select device","authBad":"Incorrect username or password","authUnconfirmed":"Account not verified","authNet":"Network error, retry","authFail":"Sign-in failed"},
  de: {"brand":"Admin-Konsole","brandShort":"Admin","consoleLink":"Konsole","logout":"Abmelden","tabOverview":"Übersicht","tabUsers":"Benutzer","tabDevices":"Geräte","tabRecords":"Cloud-Aufnahmen","tabOta":"OTA","sideHint":"Short path: Devices → Upgrade to latest\nor upload on OTA then push","loginTitle":"Admin Console","loginSub":"Standalone entry · allowlisted ops accounts only.","loginBtn":"Admin anmelden","loginLoading":"Signing in…","labelUser":"Username","labelPass":"Password","labelRegion":"Region","phUser":"Ops account","phPass":"Password","errEmpty":"Please enter username and password","noPermTitle":"No admin access","noPermBody":"Current account is not on the ops allowlist. Use /console/admin/ with an allowlisted account.","reLogin":"Sign out and retry","backConsole":"Device console","goConsole":"Go to device console","restoring":"Restoring session…","overview":"Overview","overviewSub":"Amplify full DB · remote OTA same as App","users":"Users","usersSub":"Full User table · edit / delete (unbind; Cognito kept)","devices":"Devices","devicesSub":"Edit info · delete clears binds then Device · Upgrade to latest picks newest package","records":"Cloud Records","ota":"OTA","otaSub":"Upload + remote upgrade · App CLOUD_ONLY protocol","refresh":"Aktualisieren","searchUsers":"Username / email / ID…","searchDevices":"Name / UUID / model / owner…","searchPkgs":"Search version / notes…","edit":"Bearbeiten","delete":"Löschen","save":"Speichern","saving":"Saving…","cancel":"Abbrechen","enter":"Open","upgradeLatest":"Auf neueste","online":"Online","offline":"Offline","all":"All","copied":"Copied","copyFail":"Copy failed","dataRefreshed":"Data refreshed","colUser":"Username","colEmail":"Email","colPhone":"Phone","colRegion":"Region","colUpdated":"Updated","colActions":"Actions","colStatus":"Status","colName":"Name","colModel":"Model","colVersion":"Version","colOwner":"Owner","colBinds":"Binds","editUser":"Edit user","editDevice":"Edit device","confirmDelUser":"Delete user?","confirmDelDevice":"Delete device?","confirmUpgrade":"Confirm remote upgrade","confirmOk":"Confirm","confirmUpgradeOk":"Confirm upgrade","confirmDelOk":"Delete","usersCount":"users","devicesCount":"devices","onlineCount":"online","pkgsCount":"packages","recordsCount":"records","commonOps":"Common actions","upgradeDevices":"Upgrade devices","uploadPkg":"Upload package","stepUpload":"Upload package to cloud","stepPush":"Pick device & package, push once","btnUpload":"Upload & register","uploading":"Uploading","btnRemote":"One-click remote upgrade","upgrading":"Upgrading","dispatching":"Dispatching…","file":"File","deviceType":"Model","partition":"Partition","version":"Version","describe":"Notes","device":"Device","package":"Package","partOverride":"Partition override","followPkg":"Follow package","upgradeStatus":"Upgrade status","waitingDevice":"Waiting for device…","pickDevicePkg":"Select device and package","latestMark":"★ Latest · ","pickPkg":"Select package (latest by default)…","pickDevice":"Select device","authBad":"Incorrect username or password","authUnconfirmed":"Account not verified","authNet":"Network error, retry","authFail":"Sign-in failed"},
  fr: {"brand":"Console Admin","brandShort":"Admin","consoleLink":"Console","logout":"Déconnexion","tabOverview":"Aperçu","tabUsers":"Utilisateurs","tabDevices":"Appareils","tabRecords":"Enregistrements cloud","tabOta":"OTA","sideHint":"Short path: Devices → Upgrade to latest\nor upload on OTA then push","loginTitle":"Admin Console","loginSub":"Standalone entry · allowlisted ops accounts only.","loginBtn":"Connexion admin","loginLoading":"Signing in…","labelUser":"Username","labelPass":"Password","labelRegion":"Region","phUser":"Ops account","phPass":"Password","errEmpty":"Please enter username and password","noPermTitle":"No admin access","noPermBody":"Current account is not on the ops allowlist. Use /console/admin/ with an allowlisted account.","reLogin":"Sign out and retry","backConsole":"Device console","goConsole":"Go to device console","restoring":"Restoring session…","overview":"Overview","overviewSub":"Amplify full DB · remote OTA same as App","users":"Users","usersSub":"Full User table · edit / delete (unbind; Cognito kept)","devices":"Devices","devicesSub":"Edit info · delete clears binds then Device · Upgrade to latest picks newest package","records":"Cloud Records","ota":"OTA","otaSub":"Upload + remote upgrade · App CLOUD_ONLY protocol","refresh":"Actualiser","searchUsers":"Username / email / ID…","searchDevices":"Name / UUID / model / owner…","searchPkgs":"Search version / notes…","edit":"Modifier","delete":"Supprimer","save":"Enregistrer","saving":"Saving…","cancel":"Annuler","enter":"Open","upgradeLatest":"Dernière version","online":"En ligne","offline":"Hors ligne","all":"All","copied":"Copied","copyFail":"Copy failed","dataRefreshed":"Data refreshed","colUser":"Username","colEmail":"Email","colPhone":"Phone","colRegion":"Region","colUpdated":"Updated","colActions":"Actions","colStatus":"Status","colName":"Name","colModel":"Model","colVersion":"Version","colOwner":"Owner","colBinds":"Binds","editUser":"Edit user","editDevice":"Edit device","confirmDelUser":"Delete user?","confirmDelDevice":"Delete device?","confirmUpgrade":"Confirm remote upgrade","confirmOk":"Confirm","confirmUpgradeOk":"Confirm upgrade","confirmDelOk":"Delete","usersCount":"users","devicesCount":"devices","onlineCount":"online","pkgsCount":"packages","recordsCount":"records","commonOps":"Common actions","upgradeDevices":"Upgrade devices","uploadPkg":"Upload package","stepUpload":"Upload package to cloud","stepPush":"Pick device & package, push once","btnUpload":"Upload & register","uploading":"Uploading","btnRemote":"One-click remote upgrade","upgrading":"Upgrading","dispatching":"Dispatching…","file":"File","deviceType":"Model","partition":"Partition","version":"Version","describe":"Notes","device":"Device","package":"Package","partOverride":"Partition override","followPkg":"Follow package","upgradeStatus":"Upgrade status","waitingDevice":"Waiting for device…","pickDevicePkg":"Select device and package","latestMark":"★ Latest · ","pickPkg":"Select package (latest by default)…","pickDevice":"Select device","authBad":"Incorrect username or password","authUnconfirmed":"Account not verified","authNet":"Network error, retry","authFail":"Sign-in failed"},
  es: {"brand":"Consola Admin","brandShort":"Admin","consoleLink":"Consola","logout":"Salir","tabOverview":"Resumen","tabUsers":"Usuarios","tabDevices":"Dispositivos","tabRecords":"Grabaciones cloud","tabOta":"OTA","sideHint":"Short path: Devices → Upgrade to latest\nor upload on OTA then push","loginTitle":"Admin Console","loginSub":"Standalone entry · allowlisted ops accounts only.","loginBtn":"Entrar al admin","loginLoading":"Signing in…","labelUser":"Username","labelPass":"Password","labelRegion":"Region","phUser":"Ops account","phPass":"Password","errEmpty":"Please enter username and password","noPermTitle":"No admin access","noPermBody":"Current account is not on the ops allowlist. Use /console/admin/ with an allowlisted account.","reLogin":"Sign out and retry","backConsole":"Device console","goConsole":"Go to device console","restoring":"Restoring session…","overview":"Overview","overviewSub":"Amplify full DB · remote OTA same as App","users":"Users","usersSub":"Full User table · edit / delete (unbind; Cognito kept)","devices":"Devices","devicesSub":"Edit info · delete clears binds then Device · Upgrade to latest picks newest package","records":"Cloud Records","ota":"OTA","otaSub":"Upload + remote upgrade · App CLOUD_ONLY protocol","refresh":"Actualizar","searchUsers":"Username / email / ID…","searchDevices":"Name / UUID / model / owner…","searchPkgs":"Search version / notes…","edit":"Editar","delete":"Borrar","save":"Guardar","saving":"Saving…","cancel":"Cancelar","enter":"Open","upgradeLatest":"Última versión","online":"En línea","offline":"Fuera de línea","all":"All","copied":"Copied","copyFail":"Copy failed","dataRefreshed":"Data refreshed","colUser":"Username","colEmail":"Email","colPhone":"Phone","colRegion":"Region","colUpdated":"Updated","colActions":"Actions","colStatus":"Status","colName":"Name","colModel":"Model","colVersion":"Version","colOwner":"Owner","colBinds":"Binds","editUser":"Edit user","editDevice":"Edit device","confirmDelUser":"Delete user?","confirmDelDevice":"Delete device?","confirmUpgrade":"Confirm remote upgrade","confirmOk":"Confirm","confirmUpgradeOk":"Confirm upgrade","confirmDelOk":"Delete","usersCount":"users","devicesCount":"devices","onlineCount":"online","pkgsCount":"packages","recordsCount":"records","commonOps":"Common actions","upgradeDevices":"Upgrade devices","uploadPkg":"Upload package","stepUpload":"Upload package to cloud","stepPush":"Pick device & package, push once","btnUpload":"Upload & register","uploading":"Uploading","btnRemote":"One-click remote upgrade","upgrading":"Upgrading","dispatching":"Dispatching…","file":"File","deviceType":"Model","partition":"Partition","version":"Version","describe":"Notes","device":"Device","package":"Package","partOverride":"Partition override","followPkg":"Follow package","upgradeStatus":"Upgrade status","waitingDevice":"Waiting for device…","pickDevicePkg":"Select device and package","latestMark":"★ Latest · ","pickPkg":"Select package (latest by default)…","pickDevice":"Select device","authBad":"Incorrect username or password","authUnconfirmed":"Account not verified","authNet":"Network error, retry","authFail":"Sign-in failed"}
};

let currentLang = localStorage.getItem('dv_lang') || ((navigator.language || 'en').slice(0, 2));
if (!I18N[currentLang]) currentLang = 'en';
let currentTheme = localStorage.getItem('dv_theme') || 'dark';
let onLangChange = () => {};

export function t(k) {
  return (I18N[currentLang] && I18N[currentLang][k]) || I18N.en[k] || k;
}
export function getLang() { return currentLang; }
export function getTheme() { return currentTheme; }
export function themeLabel(v) {
  const o = THEME_I18N[v] || {};
  return o[currentLang] || o.en || v;
}
export function regionLabel(rc) {
  const o = REGION_I18N[rc] || {};
  return o[currentLang] || o.en || (REGIONS[rc] && REGIONS[rc].label) || rc;
}
export function applyTheme(name) {
  if (!THEMES.some((x) => x.v === name)) name = 'dark';
  currentTheme = name;
  document.documentElement.setAttribute('data-theme', name);
  try { localStorage.setItem('dv_theme', name); } catch (e) {}
  const lbl = document.querySelector('#swTheme .sw-btn span');
  if (lbl) lbl.textContent = themeLabel(name);
  document.querySelectorAll('#swTheme .sw-opt').forEach((o) => o.classList.toggle('active', o.dataset.v === name));
}
export function applyLang(lang) {
  if (!I18N[lang]) lang = 'en';
  currentLang = lang;
  try { localStorage.setItem('dv_lang', lang); } catch (e) {}
  document.documentElement.lang = lang;
  onLangChange();
}
export function setLangChangeHandler(fn) { onLangChange = typeof fn === 'function' ? fn : () => {}; }

function toggleSw(id) {
  document.querySelectorAll('.sw-wrap.open').forEach((w) => { if (w.id !== id) w.classList.remove('open'); });
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}
function closeSw() { document.querySelectorAll('.sw-wrap.open').forEach((w) => w.classList.remove('open')); }
if (!window.__adminSwClickBound) {
  window.__adminSwClickBound = true;
  document.addEventListener('click', closeSw);
}
function faIcon(cls) { return h('i', { class: 'fa-solid ' + cls }); }

export function switcherBar(inline) {
  const wc = 'sw-wrap' + (inline ? ' sw-inline' : '');
  const themeBtn = h('div', { class: wc, id: 'swTheme' },
    h('button', { class: 'sw-btn', type: 'button', onclick: (e) => { e.stopPropagation(); toggleSw('swTheme'); } },
      faIcon('fa-palette'), h('span', {}, themeLabel(currentTheme)), faIcon('fa-chevron-down')),
    h('div', { class: 'sw-dropdown' }, ...THEMES.map((th) => h('div', {
      class: 'sw-opt' + (currentTheme === th.v ? ' active' : ''), 'data-v': th.v,
      onclick: (e) => { e.stopPropagation(); applyTheme(th.v); closeSw(); },
    }, h('span', { class: 'sw-swatch', style: { '--sw1': th.sw1, '--sw2': th.sw2 } }), themeLabel(th.v)))),
  );
  const langBtn = h('div', { class: wc, id: 'swLang' },
    h('button', { class: 'sw-btn', type: 'button', onclick: (e) => { e.stopPropagation(); toggleSw('swLang'); } },
      faIcon('fa-globe'), h('span', {}, (LANGS.find((x) => x.v === currentLang) || {}).short || ''), faIcon('fa-chevron-down')),
    h('div', { class: 'sw-dropdown' }, ...LANGS.map((lg) => h('div', {
      class: 'sw-opt' + (currentLang === lg.v ? ' active' : ''),
      onclick: (e) => { e.stopPropagation(); applyLang(lg.v); },
    }, h('span', { class: 'sw-flag' }, lg.flag), lg.label))),
  );
  return [themeBtn, langBtn];
}

export function tabDefs() {
  return [
    { id: 'overview', icon: 'fa-gauge-high', labelKey: 'tabOverview' },
    { id: 'users', icon: 'fa-users', labelKey: 'tabUsers' },
    { id: 'devices', icon: 'fa-robot', labelKey: 'tabDevices' },
    { id: 'records', icon: 'fa-cloud', labelKey: 'tabRecords' },
    { id: 'ota', icon: 'fa-rocket', labelKey: 'tabOta' },
  ];
}
