// 云端回放 —— 移植 cloud_storage_playback_controller.dart。
// KVS Archived Media:GetDataEndpoint → GetHLSStreamingSessionURL(streamName=deviceId)→ hls.js。
// 依赖 Identity Pool 临时凭证(SigV4)。前置:IAM 角色需含 kinesisvideo:GetHLSStreamingSessionURL / GetDataEndpoint。
import { COGNITO, DEPS } from '../config.js';
import { awsCredentials } from './auth.js';

// 取某设备的点播 HLS 会话 URL(streamName = 设备 id)
export async function getHlsUrl(deviceId, { startIso, endIso } = {}) {
  const credentials = await awsCredentials();
  const kv = await import(DEPS.kinesisVideo);
  const am = await import(DEPS.kinesisVideoArchivedMedia);

  const kvClient = new kv.KinesisVideoClient({ region: COGNITO.region, credentials });
  const ep = await kvClient.send(new kv.GetDataEndpointCommand({
    StreamName: deviceId,
    APIName: 'GET_HLS_STREAMING_SESSION_URL',
  }));

  const amClient = new am.KinesisVideoArchivedMediaClient({
    region: COGNITO.region, credentials, endpoint: ep.DataEndpoint,
  });
  const input = {
    StreamName: deviceId,
    PlaybackMode: 'ON_DEMAND',
    HLSFragmentSelector: startIso && endIso ? {
      FragmentSelectorType: 'SERVER_TIMESTAMP',
      TimestampRange: { StartTimestamp: new Date(startIso), EndTimestamp: new Date(endIso) },
    } : undefined,
    Expires: 3600,
  };
  const out = await amClient.send(new am.GetHLSStreamingSessionURLCommand(input));
  return out.HLSStreamingSessionURL;
}

// 把 m3u8 挂到 <video>。用全局 hls.js(index.html 里 <script> 引入),Safari 原生兜底。
let _hls = null;
export function playHls(videoEl, url) {
  destroyHls();
  const Hls = window.Hls;
  if (Hls && Hls.isSupported()) {
    _hls = new Hls({ enableWorker: true, lowLatencyMode: false });
    _hls.loadSource(url);
    _hls.attachMedia(videoEl);
    _hls.on(Hls.Events.MANIFEST_PARSED, () => videoEl.play().catch(() => {}));
    return;
  }
  // 原生 HLS(Safari)
  videoEl.src = url;
  videoEl.addEventListener('loadedmetadata', () => videoEl.play().catch(() => {}), { once: true });
}

export function destroyHls() {
  if (_hls) { try { _hls.destroy(); } catch (_) {} _hls = null; }
}
