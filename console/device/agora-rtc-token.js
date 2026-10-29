/**
 * Agora RTC AccessToken (006) — 浏览器签发，依赖 window.CryptoJS。
 * 对齐 Agora Tools DynamicKey/nodejs AccessToken + RtcTokenBuilder。
 */
(function (root) {
  'use strict';
  var Role = { PUBLISHER: 1, SUBSCRIBER: 2 };

  function wordArrayToUint8(wa) {
    var words = wa.words, sigBytes = wa.sigBytes, u8 = new Uint8Array(sigBytes);
    for (var i = 0; i < sigBytes; i++) u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    return u8;
  }
  function encodeHmac(keyStr, messageU8) {
    var C = root.CryptoJS;
    var keyWA = C.enc.Utf8.parse(keyStr);
    var words = [];
    for (var i = 0; i < messageU8.length; i += 4) {
      words.push(((messageU8[i] || 0) << 24) | ((messageU8[i + 1] || 0) << 16) |
        ((messageU8[i + 2] || 0) << 8) | (messageU8[i + 3] || 0));
    }
    return wordArrayToUint8(C.HmacSHA256(C.lib.WordArray.create(words, messageU8.length), keyWA));
  }

  // CRC-32 (IEEE) — 与 npm crc-32 的 str() 一致（返回有符号，再 & 0xffffffff）
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32Str(str) {
    var bytes = new TextEncoder().encode(String(str));
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return ((c ^ 0xffffffff) >>> 0);
  }

  function ByteBuf() { this.buffer = new Uint8Array(1024); this.position = 0; }
  ByteBuf.prototype._grow = function (n) {
    var need = this.position + n; if (need <= this.buffer.length) return;
    var cap = this.buffer.length; while (cap < need) cap *= 2;
    var next = new Uint8Array(cap); next.set(this.buffer.subarray(0, this.position)); this.buffer = next;
  };
  ByteBuf.prototype.pack = function () { return this.buffer.slice(0, this.position); };
  ByteBuf.prototype.putUint16 = function (v) {
    this._grow(2); this.buffer[this.position++] = v & 0xff; this.buffer[this.position++] = (v >>> 8) & 0xff; return this;
  };
  ByteBuf.prototype.putUint32 = function (v) {
    this._grow(4);
    this.buffer[this.position++] = v & 0xff; this.buffer[this.position++] = (v >>> 8) & 0xff;
    this.buffer[this.position++] = (v >>> 16) & 0xff; this.buffer[this.position++] = (v >>> 24) & 0xff; return this;
  };
  ByteBuf.prototype.putBytes = function (bytes) {
    this.putUint16(bytes.length); this._grow(bytes.length);
    this.buffer.set(bytes, this.position); this.position += bytes.length; return this;
  };
  ByteBuf.prototype.putString = function (str) { return this.putBytes(new TextEncoder().encode(String(str))); };
  ByteBuf.prototype.putTreeMapUInt32 = function (map) {
    var keys = Object.keys(map || {}).map(Number).sort(function (a, b) { return a - b; });
    this.putUint16(keys.length);
    for (var i = 0; i < keys.length; i++) { this.putUint16(keys[i]); this.putUint32(map[keys[i]] >>> 0); }
    return this;
  };

  function buildTokenWithUid(appId, appCertificate, channelName, uid, role, expireSec) {
    if (!root.CryptoJS) throw new Error('CryptoJS missing');
    expireSec = expireSec || 24 * 3600;
    var expireTs = (Math.floor(Date.now() / 1000) + expireSec) >>> 0;
    var uidStr = (uid === 0 || uid === '0') ? '' : String(uid);
    var messages = { 1: expireTs }; // kJoinChannel
    if (role === Role.PUBLISHER) {
      messages[2] = expireTs; messages[3] = expireTs; messages[4] = expireTs;
    }
    var salt = Math.floor(Math.random() * 0xffffffff) >>> 0;
    var ts = (Math.floor(Date.now() / 1000) + 24 * 3600) >>> 0;
    var m = new ByteBuf().putUint32(salt).putUint32(ts).putTreeMapUInt32(messages).pack();
    var toSign = new Uint8Array(appId.length + channelName.length + uidStr.length + m.length);
    var enc = new TextEncoder();
    var o = 0, a = enc.encode(appId), b = enc.encode(channelName), c = enc.encode(uidStr);
    toSign.set(a, o); o += a.length; toSign.set(b, o); o += b.length; toSign.set(c, o); o += c.length; toSign.set(m, o);
    var signature = encodeHmac(appCertificate, toSign);
    var content = new ByteBuf()
      .putBytes(signature)
      .putUint32(crc32Str(channelName))
      .putUint32(crc32Str(uidStr))
      .putBytes(m)
      .pack();
    var bin = '';
    for (var i = 0; i < content.length; i++) bin += String.fromCharCode(content[i]);
    return '006' + appId + btoa(bin);
  }

  root.AgoraRtcToken = { Role: Role, buildTokenWithUid: buildTokenWithUid };
})(typeof window !== 'undefined' ? window : this);
