// WAN 本地录像/图片下载：Cognito SigV4 预签名（禁止裸 amazonaws 直链）。
// 依赖页面已定义：window.__presignOtaS3Get、window.isWanMediaMode、DeviceTransport。
// 调用方：device/index.html（script 引入）→ Alpine downloadFile / __installLocalRecordDownload。
(function (global) {
  'use strict';

  function isSigned(url) {
    var s = String(url || '');
    return s.indexOf('X-Amz-') >= 0 || s.indexOf('Signature=') >= 0;
  }

  /** 预签名后 fetch blob 触发下载 */
  async function downloadPresignedS3(rawKeyOrUrl, filename, expiresSec) {
    var raw = (rawKeyOrUrl || '').trim();
    if (!raw) throw new Error('NO_S3_KEY');
    var signed = raw;
    if (!isSigned(raw)) {
      if (typeof global.__presignOtaS3Get !== 'function') throw new Error('NO_PRESIGN');
      signed = global.__presignOtaS3Get(raw, expiresSec || 3600);
    }
    if (!signed || !isSigned(signed)) {
      if (/amazonaws\.com/i.test(raw) || /amazonaws\.com/i.test(String(signed || ''))) {
        throw new Error('PRESIGN_FAILED');
      }
      signed = signed || raw;
    }
    var resp = await fetch(signed);
    if (!resp.ok) throw new Error('HTTP_' + resp.status);
    var blob = await resp.blob();
    if (!blob || blob.size <= 0) throw new Error('EMPTY_DOWNLOAD');
    var name = (filename || '').trim() || raw.split('/').pop() || ('download_' + Date.now());
    var objUrl = URL.createObjectURL(blob);
    try {
      var a = document.createElement('a');
      a.href = objUrl;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(function () { try { URL.revokeObjectURL(objUrl); } catch (e) {} }, 2000);
    }
    return blob.size;
  }

  function newJobId() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var suffix = '';
    for (var i = 0; i < 10; i++) {
      suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return 'LR' + Date.now() + '_' + suffix;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function buildExportKey(deviceId, jobId) {
    var d = new Date();
    var yyyy = d.getUTCFullYear();
    var mm = pad2(d.getUTCMonth() + 1);
    var dd = pad2(d.getUTCDate());
    var id = deviceId || 'unknown';
    return 'public/localRecordExports/' + id + '/' + yyyy + '/' + mm + '/' + dd + '/' + jobId + '.mp4';
  }

  /**
   * 挂到 Alpine：替换 downloadFile。
   * alpine: { getRecords, getImages, getDeviceUuid, tIdx, showAlert, toastOk, toastErr, setBusy, isBusy, onProgress }
   */
  function installAlpineMethods(api) {
    var alpine = api || {};
    var uploadWaiters = Object.create(null);
    var listenerInstalled = false;

    function ensurePushListener() {
      if (listenerInstalled) return;
      listenerInstalled = true;
      global.addEventListener('iot-push', function (ev) {
        var d = (ev && ev.detail) || {};
        if (d.method !== 'updateLocalRecordUploadStatusCommand') return;
        var p = d.params || {};
        var st = p.localRecordUploadStatus;
        if (!st || typeof st !== 'object') st = p;
        var jobId = String(st.jobId || '');
        if (!jobId || !uploadWaiters[jobId]) return;
        var w = uploadWaiters[jobId];
        var status = String(st.status || st.phase || '');
        if (status === 'succeeded' || status === 'done') {
          delete uploadWaiters[jobId];
          w.resolve(st);
        } else if (status === 'failed') {
          delete uploadWaiters[jobId];
          w.reject(new Error(String(st.message || st.error || st.detail || 'failed')));
        }
      });
    }

    function findRecordByPath(path) {
      var p = String(path || '');
      var lists = [];
      if (alpine.getRecords) lists = lists.concat(alpine.getRecords() || []);
      if (alpine.getImages) lists = lists.concat(alpine.getImages() || []);
      for (var i = 0; i < lists.length; i++) {
        var r = lists[i];
        if (!r) continue;
        if (r.RecordIndexInformationPath === p || r.RecordIndexInformationImage === p) return r;
      }
      return null;
    }

    function deviceIdOf() {
      try {
        var g = alpine.getDeviceUuid && alpine.getDeviceUuid();
        if (g) return String(g).trim();
      } catch (e) {}
      try {
        if (global.DeviceTransport && DeviceTransport.remoteUuid) {
          return String(DeviceTransport.remoteUuid).trim();
        }
      } catch (e2) {}
      return '';
    }

    function tIdxSafe(key) {
      if (typeof alpine.tIdx === 'function') return alpine.tIdx(key);
      if (typeof global.tIdx === 'function') return global.tIdx(key);
      return key;
    }

    async function downloadImageWan(path) {
      var rec = findRecordByPath(path);
      var raw = (rec && (rec.RecordIndexInformationImageUrl || rec.thumbnailUrl)) || '';
      if (!raw && /^https?:\/\//i.test(path)) raw = path;
      if (!raw) throw new Error('NO_IMAGE_URL');
      var name = String(path || raw).split('/').pop() || 'image.jpg';
      await downloadPresignedS3(raw, name, 3600);
    }

    async function downloadLocalMp4Wan(path) {
      ensurePushListener();
      if (alpine.isBusy && alpine.isBusy()) throw new Error('BUSY');
      var rec = findRecordByPath(path) || { RecordIndexInformationPath: path };
      var deviceId = deviceIdOf();
      if (!deviceId || deviceId === 'default') throw new Error('NO_DEVICE');
      var jobId = newJobId();
      var s3Key = buildExportKey(deviceId, jobId);
      var cam = 0;
      try {
        cam = Number(rec.RecordIndexInformationCameraIndex != null
          ? rec.RecordIndexInformationCameraIndex
          : rec.cameraIndex) || 0;
      } catch (e) { cam = 0; }
      var sizeBytes = Number(rec.RecordIndexInformationVideoSize || 0);
      var sizeMb = sizeBytes > 0 ? (sizeBytes / (1024 * 1024)) : 20;
      var timeoutMin = Math.min(20, Math.max(5, 5 + Math.ceil(sizeMb / 10)));

      if (alpine.setBusy) alpine.setBusy(true);
      if (alpine.onProgress) alpine.onProgress(tIdxSafe('lr_dl_uploading'), 5);

      var waitPromise = new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          delete uploadWaiters[jobId];
          reject(new Error('TIMEOUT'));
        }, timeoutMin * 60 * 1000);
        uploadWaiters[jobId] = {
          resolve: function (st) { clearTimeout(timer); resolve(st); },
          reject: function (err) { clearTimeout(timer); reject(err); },
        };
      });

      var payload = {
        method: 'uploadLocalRecordToS3',
        params: {
          localRecordUpload: {
            jobId: jobId,
            path: path,
            cameraIndex: cam,
            deviceId: deviceId,
            s3Key: s3Key,
          },
        },
      };
      try {
        var resp = await fetch('/setDeviceCommand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        var data = null;
        try { data = await resp.json(); } catch (e) { data = null; }
        if (data && (data.status === -2 || data.status === -3)) {
          throw new Error('UNSUPPORTED');
        }
      } catch (e) {
        if (String(e.message || e) === 'UNSUPPORTED') throw e;
        console.warn('[lr-dl] upload ACK issue, wait status', e);
      }

      try {
        var st = await waitPromise;
        var key = String((st && st.s3Key) || s3Key).trim();
        if (!key) throw new Error('NO_S3_KEY');
        if (alpine.onProgress) alpine.onProgress(tIdxSafe('lr_dl_fetching'), 70);
        var fname = key.split('/').pop() || (jobId + '.mp4');
        await downloadPresignedS3(key, fname, 3600);
        if (alpine.onProgress) alpine.onProgress(tIdxSafe('lr_dl_ok'), 100);
      } finally {
        if (alpine.setBusy) alpine.setBusy(false);
      }
    }

    async function downloadFile(fileName) {
      var path = fileName;
      if (fileName && typeof fileName === 'object') {
        path = fileName.RecordIndexInformationPath || fileName.RecordIndexInformationImage || '';
      }
      path = String(path || '');
      if (!path) return;
      var wan = typeof global.isWanMediaMode === 'function' && global.isWanMediaMode();
      if (!wan) {
        global.location.href = '/download?filePath=' + path + '&dl=1';
        return;
      }
      try {
        if (/\.(mp4|mov|mkv)$/i.test(path)) {
          await downloadLocalMp4Wan(path);
          if (alpine.toastOk) alpine.toastOk(tIdxSafe('lr_dl_ok'));
        } else {
          await downloadImageWan(path);
          if (alpine.toastOk) alpine.toastOk(tIdxSafe('lr_dl_ok'));
        }
      } catch (e) {
        console.error('[lr-dl] failed', e);
        var msg = tIdxSafe('lr_dl_fail');
        var code = String((e && e.message) || e || '');
        if (code === 'NO_IMAGE_URL') msg = tIdxSafe('lr_dl_no_url');
        else if (code === 'BUSY') msg = tIdxSafe('lr_dl_busy');
        else if (code === 'UNSUPPORTED') msg = tIdxSafe('lr_dl_unsupported');
        else if (code === 'TIMEOUT') msg = tIdxSafe('lr_dl_timeout');
        else if (code) msg = msg + ' (' + code + ')';
        if (alpine.toastErr) alpine.toastErr(msg);
        else if (alpine.showAlert) alpine.showAlert('danger', tIdxSafe('lr_dl_title'), msg, 6000);
      }
    }

    return {
      downloadFile: downloadFile,
      downloadPresignedS3: downloadPresignedS3,
      ensurePushListener: ensurePushListener,
    };
  }

  global.__downloadPresignedS3 = downloadPresignedS3;
  global.__installLocalRecordDownload = installAlpineMethods;
})(typeof window !== 'undefined' ? window : globalThis);
