// 按当前门户区域拼 S3 URL + SigV4 预签名（对齐 App Amplify.Storage.getUrl）
// devicePicture / 云录像 thumbnailUrl / 本地录像图：库里可能是完整 URL 或相对 key；
// 一律抽出 object key，再用当前 REGIONS 的 bucket+region 重签，避免错区 403。
import { COGNITO, S3_BUCKET } from '../config.js';
import { presignS3Get } from './sigv4.js';

/** 从 raw 取出 Amplify Storage object key；非 S3 的 http(s) 返回 null */
export function s3ObjectKeyFromRaw(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      if (!/amazonaws\.com/i.test(u.host)) return null;
      let p = u.pathname || '';
      if (p.startsWith('/')) p = p.slice(1);
      if (!p) return null;
      try { return decodeURIComponent(p); } catch (_) { return p; }
    }
  } catch (_) {}
  return s.replace(/^\/+/, '');
}

/** 相对 key / S3 URL → 当前区域桶的 https 对象 URL（未签名） */
export function resolveS3HttpsUrl(raw, opts) {
  const o = opts || {};
  const bucket = o.bucket || S3_BUCKET;
  const region = o.region || (COGNITO && COGNITO.region) || 'ap-northeast-1';
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const key = s3ObjectKeyFromRaw(s);
  if (key == null) {
    // 非 S3 http(s)（如局域网）原样
    return /^https?:\/\//i.test(s) ? s : '';
  }
  let k = String(key).replace(/^\/+/, '');
  if (k && !k.startsWith('public/') && !k.startsWith('protected/') && !k.startsWith('private/')) {
    k = 'public/' + k;
  }
  const path = k.split('/').map(encodeURIComponent).join('/');
  return `https://${bucket}.s3.${region}.amazonaws.com/${path}`;
}

/** 给 <img src> / 新窗口用的可加载 URL */
export function signS3MediaUrl(creds, raw, expiresSec) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const https = resolveS3HttpsUrl(s);
  if (!https) return '';
  if (!creds || !creds.accessKeyId) return https;
  // 非 S3：不签
  if (!/amazonaws\.com/i.test(https)) return https;
  const region = (COGNITO && COGNITO.region) || creds.region || 'ap-northeast-1';
  return presignS3Get(Object.assign({}, creds, { region }), https, expiresSec || 3600);
}

// fix typo in generator - will fix below
