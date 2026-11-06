// 云录像下载（Web）—— 浏览器用 Cognito 临时凭证 SigV4 调 GetClip → 本机 MP4。
// App 仍走 AppSync getKvsClip 预签名 POST（无 CORS）；浏览器不能照搬那条路。
// 禁止前端长期 AK。
import { APPSYNC, getRegion, REGIONS, resolveKvsRegion as resolveKvsRegionFromConfig, COGNITO } from '../config.js';
import { resolvedCreds } from './auth.js';
import { sigv4PostJson, sigv4PostBinary } from './sigv4.js';

export const KVS_CLIP_MAX_RANGE_SEC = 210;

/** 对齐设备页 / App cloudRecordStreamName */
export function cloudRecordStreamName(deviceId, channel) {
  const id = String(deviceId || '');
  const cam = (channel == null || channel === '') ? 0 : (parseInt(channel, 10) || 0);
  if (cam <= 0) return id;
  if (cam === 1) return id + '-cam2';
  return id + '-cam' + (cam + 1);
}

/** 当前控制台区域 → KVS region */
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

export function parseWallClockDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const d = new Date(iso || '');
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] != null ? +m[6] : 0, 0);
}

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

/**
 * 浏览器路径：Cognito 临时凭证 → GetDataEndpoint(GET_CLIP) → GetClip 二进制。
 * 与云回放 DASH 同一套凭证，可过 CORS。
 */
export async function fetchClipMp4ViaCognito({
  streamName, startSec, endSec,
  fragmentSelectorType = 'SERVER_TIMESTAMP', region, onProgress,
} = {}) {
  if (!streamName) {
    const err = new Error('streamName required');
    err.code = 'INVALID_ARGS';
    throw err;
  }
  if (!(startSec > 0) || !(endSec > startSec)) {
    const err = new Error('invalid start/end');
    err.code = 'INVALID_RANGE';
    throw err;
  }
  if ((endSec - startSec) > KVS_CLIP_MAX_RANGE_SEC) {
    const err = new Error('CLIP_TOO_LONG');
    err.code = 'CLIP_TOO_LONG';
    throw err;
  }

  let creds = null;
  try {
    const raw = sessionStorage.getItem('iot_creds');
    const c = raw ? JSON.parse(raw) : null;
    if (c && c.accessKeyId && c.secretAccessKey) {
      creds = {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
        sessionToken: c.sessionToken || '',
        region: c.region || '',
      };
    }
  } catch (_) {}
  if (!creds || !creds.accessKeyId) {
    try { creds = await resolvedCreds(); } catch (_) { creds = null; }
  }
  if (!creds || !creds.accessKeyId) {
    const err = new Error('Not signed in / no AWS session (iot_creds)');
    err.code = 'PERMISSION';
    throw err;
  }
  const r = region || creds.region || resolveKvsRegion() || COGNITO.region || 'ap-northeast-1';
  const service = 'kinesisvideo';

  const ep = await sigv4PostJson(creds, {
    host: `kinesisvideo.${r}.amazonaws.com`,
    path: '/getDataEndpoint',
    service,
    region: r,
    body: { StreamName: streamName, APIName: 'GET_CLIP' },
  });
  const dataEndpoint = ep && ep.DataEndpoint;
  if (!dataEndpoint) {
    const err = new Error('NO_ENDPOINT');
    err.code = 'NO_ENDPOINT';
    throw err;
  }
  const dataHost = new URL(dataEndpoint).host;
  const body = {
    StreamName: streamName,
    ClipFragmentSelector: {
      FragmentSelectorType: fragmentSelectorType || 'SERVER_TIMESTAMP',
      TimestampRange: {
        StartTimestamp: startSec,
        EndTimestamp: endSec,
      },
    },
  };
  const buf = await sigv4PostBinary(creds, {
    host: dataHost,
    endpoint: dataEndpoint,
    path: '/getClip',
    service,
    region: r,
    body,
    onProgress,
  });
  return new Blob([buf], { type: 'video/mp4' });
}


/** 文件名用可读墙钟时间（录像 dateTime），勿用 epoch 秒 */
export function clipFileTimeStamp(dateTime, startSec) {
  const d = parseWallClockDate(dateTime);
  const t = (d && !Number.isNaN(d.getTime()))
    ? d
    : (startSec > 0 ? new Date(startSec * 1000) : new Date());
  if (Number.isNaN(t.getTime())) return String(Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return (
    t.getFullYear()
    + p(t.getMonth() + 1)
    + p(t.getDate())
    + '_'
    + p(t.getHours())
    + p(t.getMinutes())
    + p(t.getSeconds())
  );
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
 * 一站式：选中云片段 → GetClip → 本机下载。
 */
export async function downloadCloudClip({
  record, deviceId, channel, region, onProgress, filename,
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
  const ch = channel != null ? channel : (r.channel != null ? r.channel : r.RecordIndexInformationCameraIndex);
  const streamName = cloudRecordStreamName(id, ch);
  // region 可能已是 AWS 区名（ap-northeast-1）；否则按控制台 code 解析
  let kvsRegion = region || '';
  if (!kvsRegion || /^(ap|us|eu|cn)$/i.test(kvsRegion)) {
    kvsRegion = resolveKvsRegion(kvsRegion || undefined);
  }

  const blob = await fetchClipMp4ViaCognito({
    streamName,
    startSec: range.startSec,
    endSec: range.endSec,
    region: kvsRegion,
    onProgress,
  });
  if (!blob || !blob.size) {
    const err = new Error('NO_DATA');
    err.code = 'NO_DATA';
    throw err;
  }
  const stamp = clipFileTimeStamp(dt, range.startSec);
  const safeStream = String(streamName || 'clip').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const name = filename || (`cloud_${safeStream}_${stamp}.mp4`);
  triggerBrowserDownload(blob, name);
  return { blob, streamName, range, filename: name };
}

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

if (typeof window !== 'undefined') {
  window.__kvsClip = {
    downloadCloudClip,
    fetchClipMp4ViaCognito,
    cloudRecordStreamName,
    resolveKvsRegion,
    clipWallClockRange,
    clipFileTimeStamp,
    KVS_CLIP_MAX_RANGE_SEC,
    clipErrorMessage,
  };
}
