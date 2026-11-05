// 云端片段回放 —— KVS Archived Media MPEG-DASH（与设备页云回放同协议）。
// 控制面走裸 SigV4（与 kvs-hls.js 一致），播放器用 dash.js 懒加载，避免 admin 首屏塞 aws-sdk。
import { COGNITO } from '../config.js';
import { resolvedCreds } from './auth.js';
import { sigv4PostJson } from './sigv4.js';

const DASH_SRC = new URL('../device/dash.all.min.js', import.meta.url).href;

let _dashLoad = null;
let _dashPlayer = null;

function loadScriptOnce(src) {
  if (!_dashLoad) {
    _dashLoad = new Promise((resolve, reject) => {
      if (typeof window.dashjs !== 'undefined') { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('lazy load failed: ' + src));
      document.head.appendChild(s);
    });
  }
  return _dashLoad;
}

/** deviceId + channel → KVS stream name（对齐设备页 cloudRecordStreamName） */
export function cloudRecordStreamName(deviceId, channel) {
  const id = String(deviceId || '');
  const cam = (channel == null || channel === '') ? 0 : (parseInt(channel, 10) || 0);
  if (cam <= 0) return id;
  if (cam === 1) return id + '-cam2';
  return id + '-cam' + (cam + 1);
}

export async function getDashUrl(streamName, { startMs, endMs, region } = {}) {
  const creds = await resolvedCreds();
  const r = region || COGNITO.region;
  const service = 'kinesisvideo';
  if (!streamName) throw new Error('Stream name unavailable');
  if (!r) throw new Error('Region unavailable');
  if (!(startMs > 0) || !(endMs > startMs)) throw new Error('Invalid time range');

  const ep = await sigv4PostJson(creds, {
    host: `kinesisvideo.${r}.amazonaws.com`,
    path: '/getDataEndpoint',
    service,
    region: r,
    body: { StreamName: streamName, APIName: 'GET_DASH_STREAMING_SESSION_URL' },
  });
  const dataEndpoint = ep.DataEndpoint;
  if (!dataEndpoint) throw new Error('No KVS data endpoint');
  const dataHost = new URL(dataEndpoint).host;

  const out = await sigv4PostJson(creds, {
    host: dataHost,
    endpoint: dataEndpoint,
    path: '/getDASHStreamingSessionURL',
    service,
    region: r,
    body: {
      StreamName: streamName,
      PlaybackMode: 'ON_DEMAND',
      Expires: 3600,
      DisplayFragmentTimestamp: 'ALWAYS',
      DASHFragmentSelector: {
        FragmentSelectorType: 'SERVER_TIMESTAMP',
        TimestampRange: {
          StartTimestamp: startMs / 1000,
          EndTimestamp: endMs / 1000,
        },
      },
    },
  });
  const url = out.DASHStreamingSessionURL;
  if (!url) throw new Error('No DASH session URL');
  return url;
}

export async function playDash(videoEl, url) {
  if (!videoEl) throw new Error('Missing video element');
  await loadScriptOnce(DASH_SRC);
  destroyDash();
  if (!window.dashjs || !window.dashjs.MediaPlayer) {
    throw new Error('dash.js unavailable');
  }
  _dashPlayer = window.dashjs.MediaPlayer().create();
  _dashPlayer.initialize(videoEl, url, true);
  return _dashPlayer;
}

export function destroyDash() {
  if (_dashPlayer) {
    try { _dashPlayer.reset(); } catch (_) {}
    try { _dashPlayer.destroy(); } catch (_) {}
    _dashPlayer = null;
  }
}

/** 一站：取 URL + 挂到 video。返回 { url, streamName } */
export async function playCloudClip(videoEl, {
  deviceId, channel, startMs, endMs, region, streamName,
} = {}) {
  const name = streamName || cloudRecordStreamName(deviceId, channel);
  const url = await getDashUrl(name, { startMs, endMs, region });
  await playDash(videoEl, url);
  return { url, streamName: name };
}
