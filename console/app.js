// 控制台入口:路由 + 登录门禁 + 视图
import { COGNITO, IOT_ENDPOINT, S3_BUCKET, APPSYNC, REGIONS, REGION_ORDER, getRegion, setRegion } from './config.js';
import { signIn, restoreSession, signOut, resolvedCreds, warmupAuth } from './lib/auth.js';
import { fetchMyDevices, fetchCloudRecords } from './lib/graphql.js';
import { getHlsUrl, playHls, destroyHls } from './lib/kvs-hls.js';
import { sendCommand as iotSend, disconnect as iotDisconnect } from './lib/iot-rpc.js';
import { presignS3Get } from './lib/sigv4.js';
import { signS3MediaUrl } from './lib/s3-media.js';
import { h, mount, icon, deviceCard, statusChip, loading, emptyState } from './lib/ui.js';

const app = document.getElementById('app');
const state = { session: null, devices: null, current: null };

// ── i18n + 主题(与设备端共用 localStorage dv_lang/dv_theme,进设备页同步)──────────
const I18N = {
  en: { brandName:'Device Console', brandSub:'Device Management', heroTitle:'Robot Device Cloud Console', heroTagline:'Real-time monitoring, playback and full device control in one place.', featLive:'Live A/V monitoring', featPlayback:'Recording playback', featSettings:'A/V · Network · IoT settings', featCloud:'Cloud management', heroFoot:'Secure device access · LAN & WAN', title:'Welcome back', subtitle:'Sign in with your device account (username) to manage your devices', labelUser:'Username', labelPass:'Password', phUser:'Enter username', phPass:'Enter password', btnLogin:'Sign In', btnLoading:'Signing in…', errEmpty:'Please enter username and password', region:'Region', consoleTitle:'Device Console', myDevices:'My Devices', online:'Online', offline:'Offline', loadingDevices:'Loading devices…', noDevices:'No devices', enteringDevice:'Getting credentials, entering device…' },
  zh: { brandName:'设备管理控制台', brandSub:'Device Management', heroTitle:'机器人设备云控制台', heroTagline:'实时监控、录像回放与设备全参数控制,一站式云端管理。', featLive:'实时音视频监控', featPlayback:'录像回放', featSettings:'音视频 · 网络 · IoT 设置', featCloud:'云端管理', heroFoot:'安全设备接入 · 局域网 & 广域网', title:'欢迎回来', subtitle:'用你的设备账号(用户名)登录,管理名下设备', labelUser:'用户名', labelPass:'密码', phUser:'请输入用户名', phPass:'请输入密码', btnLogin:'登录', btnLoading:'登录中…', errEmpty:'请输入用户名和密码', region:'区域', consoleTitle:'设备管理控制台', myDevices:'我的设备', online:'在线', offline:'离线', loadingDevices:'加载设备…', noDevices:'暂无设备', enteringDevice:'正在获取安全凭证,进入设备…' },
  ja: { brandName:'デバイス管理', brandSub:'Device Management', heroTitle:'ロボット制御コンソール', heroTagline:'リアルタイム監視・録画再生・デバイス制御をひとつに。', featLive:'リアルタイム映像監視', featPlayback:'録画再生', featSettings:'AV · ネットワーク · IoT 設定', featCloud:'クラウド管理', heroFoot:'安全なデバイスアクセス · LAN & WAN', title:'おかえりなさい', subtitle:'ユーザー名でサインインしてデバイスを管理', labelUser:'ユーザー名', labelPass:'パスワード', phUser:'ユーザー名を入力', phPass:'パスワードを入力', btnLogin:'サインイン', btnLoading:'サインイン中…', errEmpty:'ユーザー名とパスワードを入力してください', region:'地域', consoleTitle:'デバイス管理', myDevices:'マイデバイス', online:'オンライン', offline:'オフライン', loadingDevices:'読み込み中…', noDevices:'デバイスなし', enteringDevice:'認証情報を取得中…' },
  de: { brandName:'Geräte-Konsole', brandSub:'Device Management', heroTitle:'Roboter-Cloud-Konsole', heroTagline:'Live-Überwachung, Wiedergabe und volle Gerätesteuerung an einem Ort.', featLive:'Live-AV-Überwachung', featPlayback:'Aufnahme-Wiedergabe', featSettings:'AV · Netzwerk · IoT', featCloud:'Cloud-Verwaltung', heroFoot:'Sicherer Gerätezugriff · LAN & WAN', title:'Willkommen zurück', subtitle:'Mit Ihrem Gerätekonto (Benutzername) anmelden', labelUser:'Benutzername', labelPass:'Passwort', phUser:'Benutzername eingeben', phPass:'Passwort eingeben', btnLogin:'Anmelden', btnLoading:'Anmelden…', errEmpty:'Bitte Benutzername und Passwort eingeben', region:'Region', consoleTitle:'Geräte-Konsole', myDevices:'Meine Geräte', online:'Online', offline:'Offline', loadingDevices:'Geräte laden…', noDevices:'Keine Geräte', enteringDevice:'Anmeldedaten werden geladen…' },
  fr: { brandName:'Console Appareils', brandSub:'Device Management', heroTitle:'Console cloud du robot', heroTagline:'Surveillance en direct, lecture et contrôle complet en un seul endroit.', featLive:'Surveillance AV en direct', featPlayback:'Lecture des enregistrements', featSettings:'AV · Réseau · IoT', featCloud:'Gestion cloud', heroFoot:'Accès sécurisé · LAN & WAN', title:'Bon retour', subtitle:"Connectez-vous avec votre compte appareil (nom d'utilisateur)", labelUser:"Nom d'utilisateur", labelPass:'Mot de passe', phUser:"Entrez le nom d'utilisateur", phPass:'Entrez le mot de passe', btnLogin:'Se connecter', btnLoading:'Connexion…', errEmpty:'Veuillez saisir identifiant et mot de passe', region:'Région', consoleTitle:'Console Appareils', myDevices:'Mes appareils', online:'En ligne', offline:'Hors ligne', loadingDevices:'Chargement…', noDevices:'Aucun appareil', enteringDevice:'Récupération des identifiants…' },
  es: { brandName:'Consola Dispositivos', brandSub:'Device Management', heroTitle:'Consola en la nube del robot', heroTagline:'Monitoreo en vivo, reproducción y control total del dispositivo.', featLive:'Monitoreo AV en vivo', featPlayback:'Reproducción de grabaciones', featSettings:'AV · Red · IoT', featCloud:'Gestión en la nube', heroFoot:'Acceso seguro · LAN & WAN', title:'Bienvenido de nuevo', subtitle:'Inicia sesión con tu cuenta de dispositivo (usuario)', labelUser:'Usuario', labelPass:'Contraseña', phUser:'Ingresa el usuario', phPass:'Ingresa la contraseña', btnLogin:'Iniciar sesión', btnLoading:'Iniciando…', errEmpty:'Ingresa usuario y contraseña', region:'Región', consoleTitle:'Consola Dispositivos', myDevices:'Mis dispositivos', online:'En línea', offline:'Sin conexión', loadingDevices:'Cargando…', noDevices:'Sin dispositivos', enteringDevice:'Obteniendo credenciales…' },
};
const THEMES = [
  { v: 'dark', label: '深靖蓝·青', sw1: '#0B1220', sw2: '#22D3EE' },
  { v: 'light', label: '极简浅色', sw1: '#EEF2F7', sw2: '#0ea5e9' },
  { v: 'cyber', label: '赛博霓虹紫', sw1: '#0A0612', sw2: '#E94FE0' },
  { v: 'amber', label: '工业琥珀橙', sw1: '#0D0D0F', sw2: '#FFB020' },
  { v: 'matrix', label: '终端极客绿', sw1: '#06100A', sw2: '#22E584' },
  { v: 'oled', label: '纯黑 OLED', sw1: '#000000', sw2: '#4EA8FF' },
  { v: 'ocean', label: '大海', sw1: '#04141F', sw2: '#2DD4BF' },
];
const THEME_I18N = {
  dark:   { zh: '深靖蓝·青', en: 'Deep Blue', ja: 'ダークブルー', de: 'Dunkelblau', fr: 'Bleu profond', es: 'Azul profundo' },
  light:  { zh: '极简浅色', en: 'Light', ja: 'ライト', de: 'Hell', fr: 'Clair', es: 'Claro' },
  cyber:  { zh: '赛博霓虹紫', en: 'Cyber Neon', ja: 'サイバー', de: 'Cyber-Neon', fr: 'Cyber néon', es: 'Ciber neón' },
  amber:  { zh: '工业琥珀橙', en: 'Amber', ja: 'アンバー', de: 'Bernstein', fr: 'Ambre', es: 'Ámbar' },
  matrix: { zh: '终端极客绿', en: 'Matrix', ja: 'マトリックス', de: 'Matrix', fr: 'Matrix', es: 'Matrix' },
  oled:   { zh: '纯黑 OLED', en: 'OLED Black', ja: 'OLED', de: 'OLED', fr: 'OLED', es: 'OLED' },
  ocean:  { zh: '大海', en: 'Ocean', ja: 'オーシャン', de: 'Ozean', fr: 'Océan', es: 'Océano' },
};
function themeLabel(v) { const o = THEME_I18N[v] || {}; return o[currentLang] || o.en || v; }
const REGION_I18N = {
  ap: { zh: '东南亚', en: 'Asia Pacific', ja: 'アジア太平洋', de: 'Asien-Pazifik', fr: 'Asie-Pacifique', es: 'Asia-Pacífico' },
  us: { zh: '美洲', en: 'Americas', ja: 'アメリカ', de: 'Amerika', fr: 'Amériques', es: 'América' },
  eu: { zh: '欧洲', en: 'Europe', ja: 'ヨーロッパ', de: 'Europa', fr: 'Europe', es: 'Europa' },
};
function regionLabel(rc) { const o = REGION_I18N[rc] || {}; return o[currentLang] || o.en || (REGIONS[rc] && REGIONS[rc].label) || rc; }
const LANGS = [
  { v: 'en', label: 'English', flag: '🇺🇸', short: 'EN' },
  { v: 'zh', label: '中文', flag: '🇨🇳', short: '中文' },
  { v: 'ja', label: '日本語', flag: '🇯🇵', short: '日本語' },
  { v: 'de', label: 'Deutsch', flag: '🇩🇪', short: 'DE' },
  { v: 'fr', label: 'Français', flag: '🇫🇷', short: 'FR' },
  { v: 'es', label: 'Español', flag: '🇪🇸', short: 'ES' },
];
let currentLang = localStorage.getItem('dv_lang') || ((navigator.language || 'en').slice(0, 2));
if (!I18N[currentLang]) currentLang = 'en';
let currentTheme = localStorage.getItem('dv_theme') || 'dark';
function t(k) { return (I18N[currentLang] && I18N[currentLang][k]) || I18N.en[k] || k; }
function applyTheme(name) {
  if (!THEMES.some((x) => x.v === name)) name = 'dark';
  currentTheme = name;
  document.documentElement.setAttribute('data-theme', name);
  try { localStorage.setItem('dv_theme', name); } catch (e) {}
  // 更新主题按钮 label + 选中态(不重渲染,避免丢登录框输入)
  const lbl = document.querySelector('#swTheme .sw-btn span'); if (lbl) lbl.textContent = themeLabel(name);
  document.querySelectorAll('#swTheme .sw-opt').forEach((o) => o.classList.toggle('active', o.dataset.v === name));
}
function applyLang(lang) {
  if (!I18N[lang]) lang = 'en';
  currentLang = lang;
  try { localStorage.setItem('dv_lang', lang); } catch (e) {}
  document.documentElement.lang = lang;
  route(); // 重渲染当前视图,文案更新
}
// 右上角 主题/语言 切换器(登录页 + 设备列表共用)
function switcherBar(inline) {
  const wc = 'sw-wrap' + (inline ? ' sw-inline' : '');
  const themeBtn = h('div', { class: wc, id: 'swTheme' },
    h('button', { class: 'sw-btn', type: 'button', onclick: (e) => { e.stopPropagation(); toggleSw('swTheme'); } },
      fa('fas fa-palette'), h('span', {}, themeLabel(currentTheme)), fa('fas fa-chevron-down')),
    h('div', { class: 'sw-dropdown' }, ...THEMES.map((th) => h('div', {
      class: 'sw-opt' + (currentTheme === th.v ? ' active' : ''), 'data-v': th.v,
      onclick: (e) => { e.stopPropagation(); applyTheme(th.v); closeSw(); },
    }, h('span', { class: 'sw-swatch', style: { '--sw1': th.sw1, '--sw2': th.sw2 } }), themeLabel(th.v)))),
  );
  const langBtn = h('div', { class: wc, id: 'swLang' },
    h('button', { class: 'sw-btn', type: 'button', onclick: (e) => { e.stopPropagation(); toggleSw('swLang'); } },
      fa('fas fa-globe'), h('span', {}, (LANGS.find((x) => x.v === currentLang) || {}).short || ''), fa('fas fa-chevron-down')),
    h('div', { class: 'sw-dropdown' }, ...LANGS.map((lg) => h('div', {
      class: 'sw-opt' + (currentLang === lg.v ? ' active' : ''),
      onclick: (e) => { e.stopPropagation(); applyLang(lg.v); },
    }, h('span', { class: 'sw-flag' }, lg.flag), lg.label))),
  );
  return [themeBtn, langBtn];
}
function toggleSw(id) { document.querySelectorAll('.sw-wrap.open').forEach((w) => { if (w.id !== id) w.classList.remove('open'); }); const el = document.getElementById(id); if (el) el.classList.toggle('open'); }
function closeSw() { document.querySelectorAll('.sw-wrap.open').forEach((w) => w.classList.remove('open')); }
document.addEventListener('click', closeSw);

// ── 工具 ─────────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
function dayRange(dateStr) { // 'YYYY-MM-DD' → [ISO start, ISO end]
  const s = new Date(dateStr + 'T00:00:00');
  const e = new Date(dateStr + 'T23:59:59');
  return [s.toISOString(), e.toISOString()];
}
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtTime(iso) { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function go(hash) { location.hash = hash; }

// ── 顶栏 ─────────────────────────────────────────────────────────────────────
function topbar() {
  return h('div', { class: 'topbar' },
    h('div', { class: 'in' },
      h('a', { class: 'brand', href: '#/devices' }, h('span', { class: 'b' }), t('consoleTitle')),
      h('span', { class: 'spacer' }),
      // 顺序与设备页顶栏一致:用户(带图标) → 语言 → 主题 → 退出(设备页最后是返回)
      state.session ? h('span', { class: 'muted', style: { fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' } },
        fa('fas fa-user-circle'), h('span', {}, state.session.account || (state.session.userRow && state.session.userRow.awsUserName) || state.session.email || ''),
        // 当前区域(东南亚/美洲/欧洲)显示在用户名旁,accent 小胶囊
        h('span', { class: 'chip', style: { fontSize: '10.5px', padding: '2px 8px', background: 'var(--acc-soft)', color: 'var(--accent)', border: '1px solid var(--acc-soft-bd)' } }, regionLabel(getRegion()))) : null,
      ...switcherBar(true).reverse(),
      state.session ? h('button', { class: 'gbtn icon', title: '退出', onclick: doSignOut }, icon('logout')) : null,
    ),
  );
}
function shell(...body) { return mount(app, topbar(), h('div', { class: 'wrap' }, ...body)); }

// ── 登录(双栏 hero+form,移植设备端 login.html 视觉,登录逻辑走 Cognito signIn)──────
function fa(cls) { return h('i', { class: cls }); }
function viewLogin() {
  const username = h('input', { class: 'form-input', type: 'text', id: 'username', placeholder: t('phUser'),
    autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const pass = h('input', { class: 'form-input', type: 'password', id: 'password', placeholder: t('phPass'),
    autocomplete: 'current-password', required: true });
  const pwIcon = fa('fas fa-eye');
  const togglePw = h('button', { type: 'button', class: 'toggle-pw', title: '显示/隐藏密码',
    onclick: () => { const show = pass.type === 'password'; pass.type = show ? 'text' : 'password'; pwIcon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye'; } }, pwIcon);
  const errMsg = h('span', {}, '');
  const err = h('div', { class: 'login-error' }, fa('fas fa-circle-exclamation'), errMsg);
  const btn = h('button', { type: 'submit', class: 'btn-login' }, t('btnLogin'));
  async function submit(ev) {
    ev && ev.preventDefault();
    err.classList.remove('show');
    if (!username.value || !pass.value) { errMsg.textContent = t('errEmpty'); err.classList.add('show'); return; }
    btn.disabled = true; btn.textContent = t('btnLoading');
    try {
      state.session = await signIn(username.value.trim(), pass.value);
      state.devices = null;
      go('#/devices');
    } catch (e) {
      errMsg.textContent = mapAuthError(e); err.classList.add('show');
      btn.disabled = false; btn.textContent = t('btnLogin');
    }
  }
  const badge = () => h('div', { class: 'brand-badge' }, fa('fas fa-robot'));
  const feat = (ic, tx) => h('div', { class: 'feature-item' }, h('div', { class: 'feature-ic' }, fa('fas ' + ic)), h('div', { class: 'feature-tx' }, tx));
  const field = (labelText, forId, iconCls, input, extra) => h('div', { class: 'form-group' },
    h('label', { class: 'form-label', for: forId }, labelText),
    h('div', { class: 'input-wrap' }, fa('fas ' + iconCls + ' input-icon'), input, extra || null),
  );
  const brandBlock = (small) => h('div', {}, h('div', { class: 'brand-name', style: small ? { fontSize: '17px' } : {} }, t('brandName')), h('div', { class: 'brand-sub' }, t('brandSub')));
  const shellEl = h('div', { class: 'login-shell' },
    h('aside', { class: 'login-hero' },
      h('div', { class: 'hero-top brand-row' }, badge(), brandBlock(false)),
      h('div', { class: 'hero-mid' },
        h('h1', { class: 'hero-title' }, t('heroTitle')),
        h('p', { class: 'hero-tagline' }, t('heroTagline')),
        h('div', { class: 'feature-list' },
          feat('fa-video', t('featLive')),
          feat('fa-clock-rotate-left', t('featPlayback')),
          feat('fa-sliders', t('featSettings')),
          feat('fa-cloud', t('featCloud')),
        ),
      ),
      h('div', { class: 'hero-bottom' }, t('heroFoot')),
    ),
    h('main', { class: 'login-main' },
      h('form', { class: 'login-card', onsubmit: submit },
        h('div', { class: 'card-brand' }, badge(), brandBlock(true)),
        h('div', { class: 'login-title' }, t('title')),
        h('div', { class: 'login-subtitle' }, t('subtitle')),
        err,
        h('div', { class: 'form-group' },
          h('label', { class: 'form-label' }, t('region')),
          h('div', { class: 'region-tabs' }, ...REGION_ORDER.map((rc) => h('button', {
            type: 'button', class: 'region-tab' + (getRegion() === rc ? ' active' : ''),
            // 切区域:更新 config(pool/appsync/s3/iot 全换)+ 重渲染登录页(高亮更新,后续登录走该区域)
            onclick: () => { setRegion(rc); viewLogin(); },
          }, regionLabel(rc)))),
        ),
        field(t('labelUser'), 'username', 'fa-user', username),
        field(t('labelPass'), 'password', 'fa-lock', pass, togglePw),
        btn,
      ),
    ),
  );
  mount(app, ...switcherBar(), shellEl);
  username.focus();
}
function mapAuthError(e) {
  const m = (e && e.message) || '';
  if (/UserNotFound|does not exist|Incorrect username or password|NotAuthorized/i.test(m)) return '用户名或密码不正确';
  if (/UserNotConfirmed/i.test(m)) return '账号未验证,请先在 App 内完成验证';
  if (/Network|Failed to fetch/i.test(m)) return '网络错误,请重试';
  return m || '登录失败';
}
async function doSignOut() { iotDisconnect(); await signOut(); state.session = null; state.devices = null; go('#/login'); }

// ── 进入设备控制页(复用固件 web UI,注入 Cognito 临时凭证走 AWS IoT + KVS)────────
// IOT_ENDPOINT / COGNITO.region 从 config.js(按当前区域,live binding)
async function enterDevice(dev) {
  const uuid = dev.uuid || dev.id;
  if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) { alert('设备 UUID 无效,无法进入控制页'); return; }
  shell(loading(t('enteringDevice')));
  try {
    const c = await resolvedCreds();
    // 契约:device-transport.js iotCreds() + index.html resolveKvsCredentials() 都读 sessionStorage['iot_creds']
    // 设备控制页云端 OTA：S3 预签名 + AppSync 查 DeviceUpgrade（对齐 App CLOUD_ONLY）
    sessionStorage.setItem('iot_creds', JSON.stringify({
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
      sessionToken: c.sessionToken,
      region: COGNITO.region,
      endpoint: IOT_ENDPOINT,
      s3Bucket: S3_BUCKET,
      appsyncEndpoint: APPSYNC.endpoint,
      appsyncApiKey: APPSYNC.apiKey,
    }));
    sessionStorage.setItem('dv_auth', '1'); // 跳过设备本地登录
    sessionStorage.setItem('dv_user', (state.session.userRow && state.session.userRow.awsUserName) || state.session.email || 'user');
    localStorage.setItem('previewTransport', 'kvs'); // 实时预览走 KVS(不用声网)
    localStorage.setItem('dv_lang', currentLang);   // 语言同步到设备页
    localStorage.setItem('dv_theme', currentTheme); // 主题同步到设备页
    location.href = 'device/index.html?deviceId=' + encodeURIComponent(uuid);
  } catch (e) {
    shell(errorBox('进入设备失败', e));
  }
}

// 设备封面:优先 devicePicture(整机 S3 封面),为空则回退到最新一条云录像的 thumbnailUrl。
// 一律用【预签名 URL 直接给 <img>】——图片加载不受 S3 CORS 限制(不能 fetch→base64,那会被 CORS 拦,
// 是仪表盘封面踩过的坑)。预签名 1h 有效,每次进列表本地 SigV4 重签(快),浏览器再缓存图片本身。
async function resolveDeviceCover(d, creds) {
  // 优先原始 devicePicture(缓存可能已是签名 URL，用 _pictureRaw / raw 回退)
  let raw = d._pictureRaw || (d.raw && d.raw.devicePicture) || '';
  if (!raw && d.picture && !/X-Amz-/i.test(d.picture)) raw = d.picture;
  if (!raw) {
    try {
      const end = new Date(Date.now() + 864e5).toISOString();
      const start = new Date(Date.now() - 7 * 864e5).toISOString();
      const recs = await fetchCloudRecords(d.uuid || d.id, start, end);
      const withThumb = recs.find((r) => r.thumbnailUrl);
      if (withThumb) raw = withThumb.thumbnailUrl;
    } catch (e) { /* 兜底失败保持无封面 */ }
  }
  if (!raw) return '';
  d._pictureRaw = raw;
  return signS3MediaUrl(creds, raw, 3600);
}

// ── 设备列表 ─────────────────────────────────────────────────────────────────
const DEVCACHE_KEY = () => 'dv_devices_' + ((state.session && state.session.userRow && state.session.userRow.id) || '');
function renderDeviceGrid(list) {
  const head = h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '24px 0 4px' } },
    h('h1', { class: 'title' }, t('myDevices')),
    h('span', { class: 'chip count' }, `${list.length}`),
    h('span', { class: 'spacer', style: { flex: 1 } }),
  );
  shell(head, list.length
    ? h('div', { class: 'grid' }, ...list.map((d) => deviceCard(d, enterDevice)))
    : emptyState(t('noDevices')));
}
async function viewDevices() {
  // 1) 本地缓存优先:上次的设备列表立即渲染(秒显,不再干等 GraphQL)
  if (!state.devices) {
    try { const c = JSON.parse(localStorage.getItem(DEVCACHE_KEY()) || 'null'); if (c && c.length) { state.devices = c; c.forEach((d) => { d._picSigned = false; d._pictureRaw = d.picture || ''; }); } } catch (e) {}
  }
  if (state.devices && state.devices.length) renderDeviceGrid(state.devices);
  else shell(loading(t('loadingDevices')));
  try {
    // 2) 后台拉最新列表(只等这一个 GraphQL),到了就渲染;不再等凭证/封面
    const list = await fetchMyDevices(state.session.userRow.id);
    state.devices = list;
    try { localStorage.setItem(DEVCACHE_KEY(), JSON.stringify(list.map((d) => ({ id: d.id, uuid: d.uuid, name: d.name, model: d.model, firmware: d.firmware, online: d.online, connectStatus: d.connectStatus, picture: d._pictureRaw || (d.raw && d.raw.devicePicture) || '', ownerUserId: d.ownerUserId })))); } catch (e) {}
    if (location.hash === '#/devices') renderDeviceGrid(list);
    // 3) 封面后台解析(凭证 + 预签名),到了重渲染;完全不阻塞列表显示
    if (list.some((d) => !d._picSigned)) {
      resolvedCreds().then(async (creds) => {
        if (!creds) return;
        let changed = false;
        await Promise.all(list.map(async (d) => {
          if (d._picSigned) return;
          try { const p = await resolveDeviceCover(d, creds); if (p) { d.picture = p; changed = true; } } catch (e) {}
          d._picSigned = true;
        }));
        if (changed && location.hash === '#/devices') { renderDeviceGrid(list); try { localStorage.setItem(DEVCACHE_KEY(), JSON.stringify(list.map((d) => ({ id: d.id, uuid: d.uuid, name: d.name, model: d.model, firmware: d.firmware, online: d.online, connectStatus: d.connectStatus, picture: d._pictureRaw || (d.raw && d.raw.devicePicture) || '', ownerUserId: d.ownerUserId })))); } catch (e) {} }
      }).catch(() => {});
    }
  } catch (e) {
    if (!state.devices || !state.devices.length) shell(errorBox('设备加载失败', e));
  }
}

// ── 设备详情(MVP:云端回放;实时/参数/OTA 占位)────────────────────────────────
function viewDevice(id) {
  const dev = (state.devices || []).find((d) => d.id === id);
  if (!dev) { go('#/devices'); return; }
  state.current = dev;

  const tabs = ['云端回放', '实时预览', '参数设置', 'OTA 升级'];
  let active = 0;
  const panel = h('div', { style: { marginTop: '16px' } });
  const tabBar = h('div', { class: 'glass', style: { display: 'flex', gap: '4px', padding: '5px', borderRadius: '14px', width: 'fit-content' } });
  function renderTabs() {
    mount(tabBar, ...tabs.map((t, i) => h('button', {
      class: 'gbtn', style: i === active
        ? { background: 'linear-gradient(180deg,#7fe6d9,var(--accent))', color: '#04211d', border: 'none' }
        : { background: 'transparent', border: 'none' },
      onclick: () => { active = i; renderTabs(); renderPanel(); },
    }, t)));
  }
  function renderPanel() {
    destroyHls();
    if (active === 0) mount(panel, cloudPlayback(dev));
    else if (active === 2) mount(panel, paramsPanel(dev));
    else mount(panel, comingSoon(tabs[active]));
  }
  const header = h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '24px 0 6px' } },
    h('button', { class: 'gbtn icon', title: '返回', onclick: () => { iotDisconnect(); go('#/devices'); } },
      h('span', { style: { transform: 'rotate(180deg)', display: 'inline-flex' } }, icon('chevron'))),
    h('h1', { class: 'title' }, dev.name),
    statusChip(dev.online === 1),
    dev.model ? h('span', { class: 'meta' }, dev.model) : null,
    dev.firmware ? h('span', { class: 'meta' }, 'v' + dev.firmware) : null,
  );
  shell(header, tabBar, panel);
  renderTabs(); renderPanel();
}

function comingSoon(name) {
  const box = h('div', { class: 'glass empty', style: { marginTop: '0' } });
  box.appendChild(icon('gear', 46));
  box.appendChild(h('div', { class: 'faint' }, `${name} · 即将上线`));
  box.appendChild(h('div', { class: 'faint', style: { fontSize: '12px' } }, '需 AWS 侧开通 KVS / IoT 权限后启用'));
  return box;
}

// 参数设置(IoT)：先用 getDeviceGeneralInfo 做一次往返,验证 AWS IoT 通道打通
function paramsPanel(dev) {
  if (!dev.uuid) {
    const b = h('div', { class: 'glass empty' });
    b.appendChild(icon('gear', 44));
    b.appendChild(h('div', { class: 'faint' }, '该设备缺少 UUID(deviceGeneralInformation.deviceUuid),无法通过 IoT 通信'));
    return b;
  }
  const status = h('span', { class: 'muted', style: { fontSize: '13px' } }, '未连接');
  const out = h('pre', { class: 'glass', style: { marginTop: '14px', padding: '14px 16px', fontSize: '12px', lineHeight: '1.6', color: 'var(--text-md)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '420px', overflow: 'auto', fontFamily: 'var(--font-display)' } }, '点「读取设备信息」发起一次 AWS IoT 往返(getDeviceGeneralInformationCommand)。');
  const btn = h('button', { class: 'gbtn primary' }, '读取设备信息');
  async function run() {
    btn.disabled = true; status.textContent = '连接 IoT…';
    mount(out, loading('等待设备应答(经 AWS IoT MQTT-over-WSS)…'));
    try {
      const t0 = performance.now();
      const resp = await iotSend(dev.uuid, 'getDeviceGeneralInformationCommand', {});
      const ms = Math.round(performance.now() - t0);
      status.textContent = `已连接 · 往返 ${ms}ms`;
      out.textContent = JSON.stringify(resp, null, 2);
    } catch (e) {
      status.textContent = '失败';
      mount(out, errorBox('IoT 往返失败', e));
    } finally { btn.disabled = false; }
  }
  btn.addEventListener('click', run);
  const bar = h('div', { class: 'glass', style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' } },
    icon('gear'), h('span', { style: { fontWeight: 700, fontSize: '14px' } }, '设备参数 · AWS IoT'),
    h('span', { class: 'meta' }, 'UUID ' + dev.uuid), h('span', { style: { flex: 1 } }), status, btn);
  return h('div', {}, bar, out);
}

// 云端回放:日期 → 录像列表(时间轴)→ 点选播放 HLS
function cloudPlayback(dev) {
  const video = h('video', { controls: true, playsinline: true });
  const player = h('div', { class: 'player' },
    h('div', { class: 'ph' }, icon('touch', 46), h('div', {}, '选择下方录像片段播放')));
  const listBox = h('div', { class: 'glass', style: { marginTop: '14px', padding: '10px 14px', maxHeight: '440px', overflow: 'auto' } });
  const dateInput = h('input', { type: 'date', value: todayStr(),
    style: { height: '38px', padding: '0 10px', borderRadius: '10px', background: 'rgba(5,7,14,.5)', border: '1px solid var(--border)', color: 'var(--text-hi)', fontFamily: 'inherit' } });
  const countChip = h('span', { class: 'chip count' }, '0');
  const bar = h('div', { class: 'glass', style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px' } },
    icon('cloud'), h('span', { class: 'muted', style: { fontSize: '13px' } }, '云端录像'),
    dateInput, countChip, h('span', { class: 'spacer', style: { flex: 1 } }));

  async function load() {
    mount(listBox, loading('查询云端录像…'));
    try {
      const [s, e] = dayRange(dateInput.value);
      const recs = await fetchCloudRecords(dev.id, s, e);
      countChip.textContent = String(recs.length);
      if (!recs.length) { mount(listBox, emptyState('这一天没有云端录像')); return; }
      const rows = recs.map((r) => recRow(dev, r));
      mount(listBox, h('div', { class: 'rec-list' }, ...rows));
    } catch (err) {
      mount(listBox, errorBox('录像查询失败', err));
    }
  }
  function recRow(dev, rec) {
    const chips = [];
    if (rec.resolution) chips.push(h('span', { class: 'meta' }, rec.resolution));
    if (rec.channel != null) chips.push(h('span', { class: 'meta' }, 'CH' + rec.channel));
    if (rec.duration) chips.push(h('span', { class: 'meta' }, rec.duration + 's'));
    const thumb = h('div', {
      style: { width: '64px', height: '40px', borderRadius: '8px', overflow: 'hidden', background: 'rgba(0,0,0,.25)', flexShrink: '0', marginRight: '10px' },
    });
    if (rec.thumbnailUrl) {
      resolvedCreds().then((c) => {
        const url = signS3MediaUrl(c, rec.thumbnailUrl, 3600);
        if (!url) return;
        const img = h('img', { src: url, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' },
          onerror: function () { this.style.display = 'none'; } });
        thumb.replaceChildren(img);
      }).catch(() => {});
    }
    const end = h('div', { class: 'end', style: { display: 'flex', alignItems: 'center' } },
      thumb,
      h('div', {},
        h('div', { style: { fontWeight: 700, fontSize: '13px' } }, fmtTime(rec.dateTime)),
        h('div', { style: { marginTop: '4px' } }, ...chips)));
    const row = h('div', { class: 'rec' }, h('div', { class: 'time' }, fmtTime(rec.dateTime)),
      h('div', { class: 'rail' }, h('div', { class: 'node' })), end);
    end.addEventListener('click', async () => {
      document.querySelectorAll('.rec.on').forEach((x) => x.classList.remove('on'));
      row.classList.add('on');
      mount(player, video); // 用 <video> 替换占位
      try {
        const startIso = rec.dateTime;
        const endIso = new Date(new Date(rec.dateTime).getTime() + (parseInt(rec.duration || '60', 10) * 1000)).toISOString();
        const url = await getHlsUrl(dev.id, { startIso, endIso });
        playHls(video, url);
      } catch (err) {
        mount(player, errorBox('无法获取回放地址', err));
      }
    });
    return row;
  }
  dateInput.addEventListener('change', load);
  load();
  return h('div', {}, player, bar, listBox);
}

function errorBox(title, e) {
  const msg = (e && e.message) || String(e);
  const hint = /403|not authorized|AccessDenied|credential/i.test(msg)
    ? ' — 可能是 AWS 侧未给 Identity Pool 授权(KVS/IoT),见部署说明' : '';
  return h('div', { class: 'err show', style: { display: 'block' } },
    h('div', { style: { fontWeight: 700, marginBottom: '4px' } }, title),
    h('div', { style: { fontSize: '12px', opacity: .85 } }, msg + hint));
}

// ── 路由 ─────────────────────────────────────────────────────────────────────
function route() {
  const hash = location.hash || '#/devices';
  if (!state.session && hash !== '#/login') { go('#/login'); return; }
  if (hash === '#/login') { if (state.session) { go('#/devices'); return; } return viewLogin(); }
  const m = hash.match(/^#\/device\/(.+)$/);
  if (m) return viewDevice(decodeURIComponent(m[1]));
  return viewDevices();
}
window.addEventListener('hashchange', route);

// ── 启动:首屏立即渲染登录页(不再黑屏空等 restoreSession + esm.sh 导入),会话在后台恢复 ──
(async function boot() {
  window.__t = t;                      // 供 ui.js statusChip 等取本地化文案
  warmupAuth();                        // 后台预热 cognito-identity-js(登录/恢复会话提速,不阻塞)
  applyTheme(currentTheme);            // 应用主题(与设备端共用 dv_theme)
  document.documentElement.lang = currentLang;
  // 从设备页返回时 hash 已是 #/devices:此刻会话还没恢复,若直接 route() 会被当未登录闪到 login。
  // → 明确带目标 hash 时先显 loading、等会话恢复再 route();仅首次(无 hash)立即出登录页。
  const wantHash = location.hash && location.hash !== '#/login';
  if (wantHash) { mount(app, h('div', { class: 'center' }, loading(t('loadingDevices')))); }
  else { if (!location.hash) location.hash = '#/login'; route(); }
  try {
    const s = await restoreSession();   // 后台恢复 Cognito 会话
    if (s && s.userRow) state.session = s;
  } catch (_) {}
  route();   // 会话恢复后正式渲染(有 session→目标页,无→login),不再中途闪 login
})();
