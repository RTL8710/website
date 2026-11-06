// 云录像下载 —— AppSync Query.getKvsClip → 预签名 POST GetClip → MP4。
// 与 App downloadCurrentClipToAlbum 对齐：墙钟 epoch 秒、streamName 规则、bodyString 原样 POST。
// 禁止前端长期 AK；密钥只在 Lambda。
import { APPSYNC, getRegion, REGIONS, resolveKvsRegion as resolveKvsRegionFromConfig } from '../config.js';

export const KVS_CLIP_MAX_RANGE_SEC = 210;

const Q_GET_KVS_CLIP = /* GraphQL */ `
  query GetKvsClip(
    $streamName: String
    $streamArn: String
    $startTimestamp: String!
    $endTimestamp: String!
    $fragmentSelectorType: String
    $region: String
  ) {
    getKvsClip(
      streamName: $streamName
      streamArn: $streamArn
      startTimestamp: $startTimestamp
      endTimestamp: $endTimestamp
      fragmentSelectorType: $fragmentSelectorType
      region: $region
    )
  }`;

/** 对齐设备页 / App cloudRecordStreamName */
export function cloudRecordStreamName(deviceId, channel) {
  const id = String(deviceId || '');
  const cam = (channel == null || channel === '') ? 0 : (parseInt(channel, 10) || 0);
  if (cam <= 0) return id;
  if (cam === 1) return id + '-cam2';
  return id + '-cam' + (cam + 1);
}

/** 当前控制台区域 → KVS region（对齐 App _resolveKvsRegion） */
export function resolveKvsRegion(regionCode) {
  const code = regionCode || getRegion();
  if (typeof resolveKvsRegionFromConfig === 'function') {
    return resolveKvsRegionFromConfig(code);
  }
  switch (code) {
    case 'cn': return 'cn-north-1';
    case 'us': return 'us-east-2';
    case 'eu': return 'eu-west-3';
    case 'ap':
    default: return (REGIONS[code] && REGIONS[code].kvsRegion) || 'ap-northeast-1';
  }
}

/**
 * 墙钟数字 → 本地 Date（不做 UTC 偏移），与 App DateTime(y,m,d,h,mi,s) 一致。
 * 支持 "2024-01-02T03:04:05.000Z" / "2024-01-02 03:04:05"。
 */
export function parseWallClockDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const d = new Date(iso || '');
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] != null ? +m[6] : 0, 0);
}

/** @returns {{ startSec: number, endSec: number, start: Date, end: Date } | null} */
export function clipWallClockRange(dateTime, durationSec) {
  const start = parseWallClockDate(dateTime);
  if (!start) return null;
  const dur = Math.max(1, Number(durationSec) || 1);
  const end = new Date(start.getTime() + dur * 1000);
  if (!(end.getTime() > start.getTime())) return null;
  return {
    start,
    end,
    startSec: Math.floor(start.getTime() / 1000),
    endSec: Math.floor(end.getTime() / 1000),
  };
}

function appsyncConfig(override) {
  const o = override || {};
  let fromSession = {};
  try {
    fromSession = JSON.parse(sessionStorage.getItem('iot_creds') || '{}') || {};
  } catch (_) {}
  let fromOta = {};
  try {
    if (typeof window !== 'undefined' && typeof window.__otaCredsBundle === 'function') {
      fromOta = window.__otaCredsBundle() || {};
    }
  } catch (_) {}
  return {
    endpoint: o.endpoint || fromSession.appsyncEndpoint || fromOta.appsyncEndpoint || APPSYNC.endpoint,
    apiKey: o.apiKey || fromSession.appsyncApiKey || fromOta.appsyncApiKey || APPSYNC.apiKey,
  };
}

function parseAwsJsonField(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (_) { return null; }
  }
  return null;
}

/**
 * 调 AppSync getKvsClip，返回 Lambda 的 AWSJSON 对象（含 ok/url/bodyString）。
 */
export async function getKvsClip({
  streamName, streamArn, startSec, endSec,
  fragmentSelectorType = 'SERVER_TIMESTAMP', region,
  appsync,
} = {}) {
  if (!streamName && !streamArn) {
    return { ok: false, code: 'INVALID_ARGS', message: 'streamName or streamArn required' };
  }
  if (!(startSec > 0) || !(endSec > startSec)) {
    return { ok: false, code: 'INVALID_RANGE', message: 'invalid start/end' };
  }
  const rangeSec = endSec - startSec;
  if (rangeSec > KVS_CLIP_MAX_RANGE_SEC) {
    return {
      ok: false,
      code: 'CLIP_TOO_LONG',
      message: `Clip range ${Math.round(rangeSec)}s exceeds soft limit ${KVS_CLIP_MAX_RANGE_SEC}s`,
      rangeSec,
      maxRangeSec: KVS_CLIP_MAX_RANGE_SEC,
    };
  }

  const { endpoint, apiKey } = appsyncConfig(appsync);
  if (!endpoint || !apiKey) {
    return { ok: false, code: 'GRAPHQL_ERROR', message: 'AppSync config missing' };
  }

  const variables = {
    startTimestamp: String(startSec),
    endTimestamp: String(endSec),
    fragmentSelectorType: fragmentSelectorType || 'SERVER_TIMESTAMP',
  };
  if (streamName) variables.streamName = streamName;
  if (streamArn) variables.streamArn = streamArn;
  if (region) variables.region = region;

  let json;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ query: Q_GET_KVS_CLIP, variables }),
    });
    json = await res.json();
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: (e && e.message) || String(e) };
  }

  if (json.errors && json.errors.length && !(json.data && json.data.getKvsClip != null)) {
    const msg = json.errors.map((e) => e.message).join('; ');
    return { ok: false, code: 'GRAPHQL_ERROR', message: msg };
  }

  const parsed = parseAwsJsonField(json.data && json.data.getKvsClip);
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, code: 'EMPTY_RESULT', message: 'getKvsClip null' };
  }
  return parsed;
}

/**
 * 用预签名结果拉 MP4 Blob。body 必须用 bodyString 原样（勿 JSON.stringify(body)）。
 */
export async function fetchClipMp4Blob(clip, { onProgress } = {}) {
  if (!clip || clip.ok !== true) {
    const err = new Error((clip && (clip.message || clip.code)) || 'getKvsClip failed');
    err.code = (clip && clip.code) || 'GRAPHQL_ERROR';
    throw err;
  }
  const url = String(clip.url || '');
  if (!url) {
    const err = new Error('EMPTY_URL');
    err.code = 'EMPTY_URL';
    throw err;
  }
  const method = String(clip.method || 'POST').toUpperCase();
  const headers = { 'Content-Type': 'application/json' };
  if (clip.headers && typeof clip.headers === 'object') {
    Object.keys(clip.headers).forEach((k) => {
      if (clip.headers[k] != null) headers[k] = String(clip.headers[k]);
    });
  }
  // 强制无 charset，避免 SigV4 对不上
  headers['Content-Type'] = 'application/json';

  const bodyString = (typeof clip.bodyString === 'string')
    ? clip.bodyString
    : (clip.body != null ? JSON.stringify(clip.body) : '');

  const res = await fetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : bodyString,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${res.status}: ${text.slice(0, 180)}`);
    err.code = (res.status === 400 || /fragment|Limit|too large/i.test(text))
      ? 'CLIP_TOO_LONG'
      : 'NETWORK';
    throw err;
  }

  if (!onProgress || !res.body || !res.body.getReader) {
    const buf = await res.arrayBuffer();
    if (!buf || !buf.byteLength) {
      const err = new Error('NO_DATA');
      err.code = 'NO_DATA';
      throw err;
    }
    return new Blob([buf], { type: 'video/mp4' });
  }

  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total > 0) onProgress(Math.min(1, received / total));
    else onProgress(null);
  }
  if (!received) {
    const err = new Error('NO_DATA');
    err.code = 'NO_DATA';
    throw err;
  }
  if (typeof onProgress === 'function') onProgress(1);
  return new Blob(chunks, { type: 'video/mp4' });
}

export function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || ('cloud_clip_' + Date.now() + '.mp4');
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * 一站式：选中云片段 → getKvsClip → MP4 下载。
 * record: { dateTime|RecordIndexInformationDateTime, duration|RecordIndexInformationDuration, deviceID, channel }
 */
export async function downloadCloudClip({
  record, deviceId, channel, region, appsync, onProgress, filename,
} = {}) {
  const r = record || {};
  const dt = r.dateTime || r.RecordIndexInformationDateTime || '';
  const dur = r.duration != null ? r.duration : r.RecordIndexInformationDuration;
  const range = clipWallClockRange(dt, dur);
  if (!range) {
    const err = new Error('invalid datetime/duration');
    err.code = 'INVALID_RANGE';
    throw err;
  }
  if ((range.endSec - range.startSec) > KVS_CLIP_MAX_RANGE_SEC) {
    const err = new Error('CLIP_TOO_LONG');
    err.code = 'CLIP_TOO_LONG';
    throw err;
  }

  const id = deviceId || r.deviceID || r.deviceId || '';
  const ch = channel != null ? channel : r.channel;
  const streamName = cloudRecordStreamName(id, ch);
  const kvsRegion = region || resolveKvsRegion();

  const clip = await getKvsClip({
    streamName,
    startSec: range.startSec,
    endSec: range.endSec,
    region: kvsRegion,
    appsync,
  });
  const blob = await fetchClipMp4Blob(clip, { onProgress });
  const name = filename || `cloud_${streamName}_${range.startSec}.mp4`;
  triggerBrowserDownload(blob, name);
  return { blob, streamName, range, clip };
}

/** 返回 i18n key（设备页 cp_* / admin clip*） */
export function clipErrorMessage(code, fallback) {
  switch (String(code || '').toUpperCase()) {
    case 'CLIP_TOO_LONG': return 'clip_too_long';
    case 'NO_DATA':
    case 'NO_ENDPOINT':
    case 'INVALID_RANGE':
    case 'EMPTY_URL':
    case 'EMPTY_RESULT': return 'clip_no_data';
    case 'PERMISSION':
    case 'ACCESS_DENIED': return 'clip_permission';
    case 'NETWORK':
    case 'GRAPHQL_ERROR':
    case 'SIGN_FAILED': return 'clip_network';
    default: return fallback || 'clip_failed';
  }
}

// 设备页非 module 入口用
if (typeof window !== 'undefined') {
  window.__kvsClip = {
    downloadCloudClip,
    getKvsClip,
    cloudRecordStreamName,
    resolveKvsRegion,
    clipWallClockRange,
    KVS_CLIP_MAX_RANGE_SEC,
    clipErrorMessage,
  };
}
