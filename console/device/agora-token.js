/**
 * Agora RTC Token 006（浏览器）。项目开了 App Certificate 时必须带 token 进房，
 * 否则 Web SDK 报 CANNOT_GET_GATEWAY_SERVER / no active status。
 * 算法对齐 AgoraIO/Tools AccessToken.js + RtcTokenBuilder（uid=0 表示不校验 uid）。
 */
(function (root) {
    var PRIV = { JOIN: 1, PUB_AUDIO: 2, PUB_VIDEO: 3, PUB_DATA: 4 };

    function crc32Table() {
        var t = new Uint32Array(256);
        for (var i = 0; i < 256; i++) {
            var c = i;
            for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[i] = c >>> 0;
        }
        return t;
    }
    var CRC_TABLE = crc32Table();

    function crc32Utf8(str) {
        var bytes = new TextEncoder().encode(str || '');
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i++) {
            crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function ByteBuf(cap) {
        this.buf = new Uint8Array(cap || 256);
        this.pos = 0;
    }
    ByteBuf.prototype.ensure = function (n) {
        if (this.pos + n <= this.buf.length) return;
        var next = this.buf.length;
        while (next < this.pos + n) next *= 2;
        var grow = new Uint8Array(next);
        grow.set(this.buf);
        this.buf = grow;
    };
    ByteBuf.prototype.putU16 = function (v) {
        this.ensure(2);
        this.buf[this.pos++] = v & 0xFF;
        this.buf[this.pos++] = (v >>> 8) & 0xFF;
        return this;
    };
    ByteBuf.prototype.putU32 = function (v) {
        this.ensure(4);
        v = v >>> 0;
        this.buf[this.pos++] = v & 0xFF;
        this.buf[this.pos++] = (v >>> 8) & 0xFF;
        this.buf[this.pos++] = (v >>> 16) & 0xFF;
        this.buf[this.pos++] = (v >>> 24) & 0xFF;
        return this;
    };
    ByteBuf.prototype.putBytes = function (u8) {
        this.putU16(u8.length);
        this.ensure(u8.length);
        this.buf.set(u8, this.pos);
        this.pos += u8.length;
        return this;
    };
    ByteBuf.prototype.putStr = function (s) {
        return this.putBytes(new TextEncoder().encode(s || ''));
    };
    ByteBuf.prototype.putMapU32 = function (map) {
        var keys = Object.keys(map || {}).map(Number).sort(function (a, b) { return a - b; });
        this.putU16(keys.length);
        for (var i = 0; i < keys.length; i++) {
            this.putU16(keys[i]);
            this.putU32(map[keys[i]]);
        }
        return this;
    };
    ByteBuf.prototype.pack = function () {
        return this.buf.subarray(0, this.pos);
    };

    function concatBytes(parts) {
        var n = 0;
        for (var i = 0; i < parts.length; i++) n += parts[i].length;
        var out = new Uint8Array(n);
        var o = 0;
        for (var j = 0; j < parts.length; j++) { out.set(parts[j], o); o += parts[j].length; }
        return out;
    }

    function hmacSha256Sync(keyStr, data) {
        if (!root.CryptoJS || !root.CryptoJS.HmacSHA256) {
            throw new Error('CryptoJS.HmacSHA256 required for Agora token');
        }
        var C = root.CryptoJS;
        var words = [];
        for (var i = 0; i < data.length; i++) words[i >>> 2] |= data[i] << (24 - (i % 4) * 8);
        var wa = C.lib.WordArray.create(words, data.length);
        var sig = C.HmacSHA256(wa, keyStr);
        var out = new Uint8Array(sig.sigBytes);
        for (var j = 0; j < sig.sigBytes; j++) {
            out[j] = (sig.words[j >>> 2] >>> (24 - (j % 4) * 8)) & 0xFF;
        }
        return out;
    }

    function b64(u8) {
        var s = '';
        for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        return btoa(s);
    }

    function buildRtcToken(appId, appCertificate, channelName, uid, expireTs, saltOpt) {
        appId = String(appId || '').trim();
        appCertificate = String(appCertificate || '').trim();
        channelName = String(channelName || '').trim();
        if (!/^[0-9a-fA-F]{32}$/.test(appId) || !/^[0-9a-fA-F]{32}$/.test(appCertificate) || !channelName) {
            return '';
        }
        var expire = expireTs || (Math.floor(Date.now() / 1000) + 24 * 3600);
        var uidStr = (!uid || uid === 0 || uid === '0') ? '' : String(uid);
        var salt = (saltOpt != null) ? (saltOpt >>> 0) : ((Math.floor(Math.random() * 0xFFFFFFFF) >>> 0) || 1);
        var messages = {};
        messages[PRIV.JOIN] = expire;
        messages[PRIV.PUB_AUDIO] = expire;
        messages[PRIV.PUB_VIDEO] = expire;
        messages[PRIV.PUB_DATA] = expire;
        var m = new ByteBuf();
        m.putU32(salt).putU32(expire).putMapU32(messages);
        var mBytes = m.pack();
        var toSign = concatBytes([
            new TextEncoder().encode(appId),
            new TextEncoder().encode(channelName),
            new TextEncoder().encode(uidStr),
            mBytes
        ]);
        var signature = hmacSha256Sync(appCertificate, toSign);
        var content = new ByteBuf();
        content.putBytes(signature)
            .putU32(crc32Utf8(channelName))
            .putU32(crc32Utf8(uidStr))
            .putBytes(mBytes);
        return '006' + appId + b64(content.pack());
    }

    root.AhsAgoraToken = { buildRtcToken: buildRtcToken };
})(typeof window !== 'undefined' ? window : globalThis);
