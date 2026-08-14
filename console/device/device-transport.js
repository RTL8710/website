// ════════════════════════════════════════════════════════════════════════
// DeviceTransport — 控制命令传输单例（HTTP 优先，外网失败回退 Agora RTM）
//
// index.html / login.html 共用本文件（须先加载 agora-rtm.js）。
//
// 劫持以下端点的 fetch，其余 fetch 原样透传 → 现有调用零改动、对链路透明：
//   - /getDeviceCommand · /setDeviceCommand   设备参数 get/set
//   - /api/auth                                登录验证 → RTM method loginCommand
//   - /api/users                               用户列表/增删改 → getUserListCommand / userManagementCommand
//
// 路由（与设备端 AgoraRtmService + RemoteCommandHandle 对应）：
//   - 本端以唯一 webUserId 登录 RTM，订阅「频道 = 自己的 webUserId」收应答
//   - 发命令：publish 到「频道 = 设备 UUID」，消息体 {method, params, requestId}
//   - 设备订阅自身 UUID 频道收到 → 处理 → 回填 requestId → publish 回「频道 = 本端 webUserId」
//   - 本端按 requestId 匹配挂起的 Promise
// 设备从不订阅 webUserId 频道，故不会自收回包；本端按 requestId 区分并发请求。
// ════════════════════════════════════════════════════════════════════════
window.DeviceTransport = {
    appId: 'ad82add40c9e420c90a17249fed40ccf',   // 与 RTC index.html appid 同（设备 rtc_app_id 配置）；RTM/RTC 必须同一 appId
    mode: 'auto',            // 'auto' | 'http' | 'rtm'
    active: 'http',          // 当前生效链路（状态徽标用）
    rtm: null,
    rtmReady: false,
    rtmLoggingIn: false,
    rtmUserId: 'web_' + Math.random().toString(36).slice(2, 10),
    pending: {},             // requestId -> {resolve, reject, timer}
    remoteUuid: (function () { try { return localStorage.getItem('lastDeviceUuid') || ''; } catch (e) { return ''; } })(),
    httpProbeTimeoutMs: 3000,
    rtmReplyTimeoutMs: 20000,   // 云控制台:慢命令(扫SD卡的录像列表/磁盘用量)可能 >8s,放宽到 20s

    _setActive: function (a) {
        if (this.active !== a) {
            this.active = a;
            try { window.dispatchEvent(new CustomEvent('transport-change', { detail: { active: a } })); } catch (e) {}
        }
    },
    setRemoteUuid: function (v) { if (typeof v === 'string') this.remoteUuid = v.trim(); },
    rememberUuid: function (v) {
        if (v && typeof v === 'string') {
            this.remoteUuid = v.trim();
            try { localStorage.setItem('lastDeviceUuid', v.trim()); } catch (e) {}
        }
    },

    install: function () {
        if (window.__deviceFetchPatched) return;
        window.__deviceFetchPatched = true;
        var self = this;
        var origFetch = window.fetch.bind(window);
        window.__origFetch = origFetch;
        window.fetch = function (input, init) {
            var url = (typeof input === 'string') ? input : (input && input.url);
            if (url === '/getDeviceCommand' || url === '/setDeviceCommand') {
                return self.transportFetch(url, init || {}, origFetch);
            }
            if (url === '/api/auth' || url === '/api/users') {
                return self.apiFetch(url, init || {}, origFetch);
            }
            return origFetch(input, init);
        };
        console.info('[transport] fetch interceptor installed, webUserId=' + this.rtmUserId);
        // 外网门户场景:已注入 IoT 临时凭证(sessionStorage.iot_creds)→ 直接走 AWS IoT,
        // 跳过 3s LAN HTTP 探测(设备不在局域网,探测必然超时浪费)。
        try {
            if (this.iotCreds().accessKeyId) {
                this.mode = 'awsIot';
                console.info('[transport] 检测到 IoT 凭证 → 控制链路直连 AWS IoT(跳过 HTTP 探测)');
                // ★ 进入即后台预连(WSS+CONNACK+SUBACK ~数秒)。不等首个命令才握手 → 首屏参数命令直接复用已连的会话,大幅提速。
                setTimeout(function () { self.ensureIot().catch(function () {}); }, 0);
            }
        } catch (e) {}
    },

    // HTTP 探测（带超时）；调用方自带 signal 时尊重之、不叠加超时。返回原始 Response 或抛错。
    _httpTry: async function (url, init, origFetch) {
        if (init && init.signal) return await origFetch(url, init);
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, this.httpProbeTimeoutMs);
        try {
            return await origFetch(url, Object.assign({}, init, { signal: ctrl.signal }));
        } finally { clearTimeout(timer); }
    },

    // 设备参数命令：HTTP 优先，失败回退 RTM；返回「类 Response」对象（含 ok / json() / text()）
    transportFetch: async function (url, init, origFetch) {
        if (this.mode === 'rtm' || this.mode === 'awsIot') return await this.remoteResponse(init);
        try {
            var resp = await this._httpTry(url, init, origFetch);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            this.mode = 'http';
            this._setActive('http');
            return resp;
        } catch (e) {
            console.warn('[transport] HTTP 失败(' + (e && e.name) + ')，回退远程(IoT/RTM):', e);
            return await this.remoteResponse(init);
        }
    },

    rtmResponse: async function (init) {
        var method = '', params = {};
        try {
            var b = JSON.parse((init && init.body) || '{}');
            method = b.method; params = b.params || {};
        } catch (e) { throw new Error('transport: 无法解析命令请求体'); }
        var data = await this.rtmSend(method, params);
        return {
            ok: true, status: 200,
            json: async function () { return data; },
            text: async function () { return JSON.stringify(data); }
        };
    },

    // /api/auth、/api/users 路由：HTTP 端点的请求/响应字段与 RTM method 之间做映射。
    _apiRoute: function (url, init) {
        var m = (init && init.method ? init.method : 'GET').toUpperCase();
        if (url === '/api/auth') {
            return {
                method: 'loginCommand',
                params: function (body) { return { username: body.username, password: body.password }; },
                map: function (reply) { return { success: !!(reply && reply.params && reply.params.success) }; }
            };
        }
        // /api/users
        if (m === 'GET') {
            return {
                method: 'getUserListCommand',
                params: function () { return {}; },
                map: function (reply) { return { users: (reply && reply.params && reply.params.users) || [] }; }
            };
        }
        return {
            method: 'userManagementCommand',
            params: function (body) { return body; },        // {action, username, password, displayName}
            map: function (reply) { return { success: !!(reply && reply.params && reply.params.success) }; }
        };
    },

    // 远程发送（按 method/params 返回应答对象）：优先 AWS IoT，失败回退 RTM
    remoteSend: async function (method, params) {
        if (this.iotAvailable()) { try { return await this.awsIotSend(method, params); } catch (e) { console.warn('[transport] IoT send 失败，回退 RTM:', e); } }
        return await this.rtmSend(method, params);
    },

    apiFetch: async function (url, init, origFetch) {
        var route = this._apiRoute(url, init);
        if (this.mode !== 'rtm' && this.mode !== 'awsIot') {
            try {
                var resp = await this._httpTry(url, init, origFetch);
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                this.mode = 'http';
                this._setActive('http');
                return resp;
            } catch (e) {
                console.warn('[transport] API HTTP 失败(' + (e && e.name) + ')，回退远程(IoT/RTM): ' + url, e);
            }
        }
        var body = {};
        try { body = JSON.parse((init && init.body) || '{}'); } catch (e) {}
        var reply = await this.remoteSend(route.method, route.params(body, init));
        var data = route.map(reply);
        return {
            ok: true, status: 200,
            json: async function () { return data; },
            text: async function () { return JSON.stringify(data); }
        };
    },

    // agora-rtm.js(1.4MB)懒加载:仅远程命令 HTTP 失败回退时才注入,首屏零加载。once + 缓存 Promise。
    _loadRtmSdk: function () {
        if (this._rtmSdkPromise) return this._rtmSdkPromise;
        this._rtmSdkPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'agora-rtm.js'; s.async = true;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('lazy load failed: agora-rtm.js')); };
            document.head.appendChild(s);
        });
        return this._rtmSdkPromise;
    },

    ensureRtm: async function () {
        if (this.rtmReady && this.rtm) return;
        if (this.rtmLoggingIn) {
            for (var i = 0; i < 100 && !this.rtmReady; i++) await new Promise(function (r) { setTimeout(r, 100); });
            if (this.rtmReady) return;
        }
        if (typeof AgoraRTM === 'undefined' || !AgoraRTM.RTM) await this._loadRtmSdk();   // 按需注入
        if (typeof AgoraRTM === 'undefined' || !AgoraRTM.RTM) throw new Error('Agora RTM SDK 未加载');
        this.rtmLoggingIn = true;
        var self = this;
        try {
            this.rtm = new AgoraRTM.RTM(this.appId, this.rtmUserId);
            this.rtm.addEventListener('message', function (ev) { self.onMessage(ev); });
            this.rtm.addEventListener('status', function (ev) {
                if (ev && ev.state && ev.state !== 'CONNECTED') self.rtmReady = false;
            });
            await this.rtm.login();      // 免 token（设备项目处于 RTM 测试模式，login(NULL) 成功）
            await this.rtm.subscribe(this.rtmUserId, { withMessage: true, withPresence: false });
            this.rtmReady = true;
            this._setActive('rtm');
            console.info('[transport] RTM ready');
        } catch (e) {
            this.rtmReady = false;
            console.error('[transport] RTM 登录/订阅失败:', e);
            throw e;
        } finally {
            this.rtmLoggingIn = false;
        }
    },

    onMessage: function (ev) {
        try {
            var text = (typeof ev.message === 'string') ? ev.message : new TextDecoder().decode(ev.message);
            var data = JSON.parse(text);
            var pend = data.requestId && this.pending[data.requestId];
            if (pend) {
                clearTimeout(pend.timer);
                delete this.pending[data.requestId];
                pend.resolve(data);
            }
        } catch (e) { console.warn('[transport] 异常 RTM 消息:', e); }
    },

    rtmSend: async function (method, params) {
        var uuid = (this.remoteUuid || '').trim();
        if (!uuid) {
            try { window.dispatchEvent(new CustomEvent('transport-need-uuid')); } catch (e) {}
            throw new Error('缺少设备 UUID（RTM 目标频道），请在远程连接处填写');
        }
        await this.ensureRtm();
        var requestId = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : ('r' + Date.now() + Math.random().toString(36).slice(2, 8));
        var payload = JSON.stringify({ method: method, params: params, requestId: requestId });
        var self = this;
        var p = new Promise(function (resolve, reject) {
            var timer = setTimeout(function () {
                delete self.pending[requestId];
                reject(new Error('RTM 应答超时: ' + method));
            }, self.rtmReplyTimeoutMs);
            self.pending[requestId] = { resolve: resolve, reject: reject, timer: timer };
        });
        try {
            await this.rtm.publish(uuid, payload);   // 默认 channelType=MESSAGE，设备订阅 UUID 频道收到
        } catch (e) {
            if (this.pending[requestId]) { clearTimeout(this.pending[requestId].timer); delete this.pending[requestId]; }
            throw e;
        }
        return await p;
    },

    // ════════════════════════════ AWS IoT MQTT-over-WSS（远程控制） ════════════════════════════
    // 与设备端 AwsIotMqttService 对应：本端订阅 v1/devices/{webUserId}/rpc/response/+ 收应答，
    // 发命令 publish 到 v1/devices/{deviceUuid}/rpc/request/{webUserId}，{method,params,requestId} 信封，
    // 按 requestId 匹配（复用 this.pending）。凭证由宿主页注入 window.__IOT_CREDS（静态密钥 SigV4 签 WSS）。
    iotReady: false,
    iotLoggingIn: false,
    iot: null,
    iotCreds: function () {
        // 凭证来源:① 宿主页直接注入的 window.__IOT_CREDS;② 门户 enterControl 写入的
        // sessionStorage('iot_creds')（Cognito 临时凭证,同源跳转后仍在）。读到即缓存到 window.__IOT_CREDS。
        var c = window.__IOT_CREDS;
        if (!c || !c.accessKeyId) {
            try {
                var s = sessionStorage.getItem('iot_creds');
                if (s) { c = JSON.parse(s); window.__IOT_CREDS = c; }
            } catch (e) {}
        }
        c = c || {};
        return {
            accessKeyId: c.accessKeyId || '',
            secretAccessKey: c.secretAccessKey || '',
            sessionToken: c.sessionToken || '',
            region: c.region || 'ap-northeast-1',
            endpoint: c.endpoint || 'atwwuuu2m6zxs-ats.iot.ap-northeast-1.amazonaws.com'
        };
    },
    // 只看凭证——mqtt.min.js/crypto.js 是 defer 脚本,页面最初几百 ms Alpine x-init 已开跑,
    // 此时库还没执行完;若把库就绪算进可用性,早期命令会全部错落到 RTM(库也没有)而失败。
    // 库的就绪改由 ensureIot 里等待(见下)。
    iotAvailable: function () {
        var c = this.iotCreds();
        return !!(c.accessKeyId && c.secretAccessKey);
    },
    // SigV4 presign：生成连 AWS IoT 的 wss URL（service=iotdevicegateway, canonicalUri=/mqtt）
    _iotSignedUrl: function (creds) {
        var H = function (m, k) { return CryptoJS.HmacSHA256(m, k); };
        var now = new Date();
        var amz = now.toISOString().replace(/[:-]|\.\d{3}/g, '');   // YYYYMMDDTHHMMSSZ
        var date = amz.slice(0, 8);
        var service = 'iotdevicegateway', host = creds.endpoint, region = creds.region;
        var scope = date + '/' + region + '/' + service + '/aws4_request';
        // AWS IoT Core 的 WSS 签名特例:X-Amz-Security-Token 不进 canonical query 参与签名,
        // 而是在「算完签名后」再追加(与标准 presigned URL 相反)。token 若参与签名,IoT 网关
        // 会判签名无效 → 握手失败。参与签名的参数仅 4 个,且已按字母序排列。
        var qs = 'X-Amz-Algorithm=AWS4-HMAC-SHA256'
            + '&X-Amz-Credential=' + encodeURIComponent(creds.accessKeyId + '/' + scope)
            + '&X-Amz-Date=' + amz
            + '&X-Amz-SignedHeaders=host';
        var canonicalReq = 'GET\n/mqtt\n' + qs + '\nhost:' + host + '\n\nhost\n'
            + CryptoJS.SHA256('').toString(CryptoJS.enc.Hex);
        var sts = 'AWS4-HMAC-SHA256\n' + amz + '\n' + scope + '\n'
            + CryptoJS.SHA256(canonicalReq).toString(CryptoJS.enc.Hex);
        var kDate = H(date, 'AWS4' + creds.secretAccessKey);
        var kSigning = H('aws4_request', H(service, H(region, kDate)));
        var sig = H(sts, kSigning).toString(CryptoJS.enc.Hex);
        var url = 'wss://' + host + '/mqtt?' + qs + '&X-Amz-Signature=' + sig;
        if (creds.sessionToken) url += '&X-Amz-Security-Token=' + encodeURIComponent(creds.sessionToken);
        return url;
    },
    // 进行中的建连 Promise：全页 x-init 会并发 ensureIot，必须单飞，否则等待方 10s 放弃后
    // 再开第二条 WSS（连接超时 12s），造成「IoT 连接超时」刷屏、回放时间轴 0 segments。
    _iotConnectPromise: null,
    ensureIot: async function () {
        if (this.iotReady && this.iot) return;
        if (this._iotConnectPromise) return this._iotConnectPromise;
        var self = this;
        this._iotConnectPromise = (async function () {
            if (self.iotReady && self.iot) return;
            if (!self.iotAvailable()) throw new Error('AWS IoT 不可用（缺 window.__IOT_CREDS）');
            // 等 defer 的 mqtt.min.js / crypto.js 执行完(页面最初几百 ms 内 x-init 可能先到,最多等 8s)
            for (var j = 0; j < 80 && (!window.mqtt || typeof CryptoJS === 'undefined'); j++) {
                await new Promise(function (r) { setTimeout(r, 100); });
            }
            if (!window.mqtt || typeof CryptoJS === 'undefined') throw new Error('AWS IoT 不可用（mqtt.js/CryptoJS 加载失败）');
            self.iotLoggingIn = true;
            var client = null;
            try {
                var creds = self.iotCreds();
                var url = self._iotSignedUrl(creds);
                var clientId = 'web_' + self.rtmUserId + '_' + Math.random().toString(36).slice(2, 6);
                client = window.mqtt.connect(url, { clientId: clientId, keepalive: 60, reconnectPeriod: 0, protocolVersion: 4 });
                await new Promise(function (resolve, reject) {
                    var to = setTimeout(function () { reject(new Error('IoT 连接超时')); }, 20000);
                    client.on('connect', function () { clearTimeout(to); resolve(); });
                    client.on('error', function (e) { clearTimeout(to); reject(e); });
                });
                // 订阅自身 response 主题（按 webUserId）
                var respTopic = 'v1/devices/' + self.rtmUserId + '/rpc/response/+';
                await new Promise(function (resolve, reject) {
                    client.subscribe(respTopic, { qos: 1 }, function (e) { e ? reject(e) : resolve(); });
                });
                client.on('message', function (topic, payload) {
                    try {
                        var data = JSON.parse(payload.toString());
                        var pend = data.requestId && self.pending[data.requestId];
                        if (pend) { clearTimeout(pend.timer); delete self.pending[data.requestId]; pend.resolve(data); }
                        else { try { window.dispatchEvent(new CustomEvent('iot-push', { detail: data })); } catch (x) {} }
                    } catch (x) { console.warn('[transport] 异常 IoT 消息:', x); }
                });
                self.iot = client;
                self.iotReady = true;
                self._setActive('awsIot');
                console.info('[transport] AWS IoT ready, sub ' + respTopic);
            } catch (e) {
                self.iotReady = false;
                try { if (client) client.end(true); } catch (x) {}
                self.iot = null;
                // 只打一次 warn，避免全页并发命令各自 console.error 刷「IoT 异常」
                console.warn('[transport] AWS IoT 连接失败:', e && e.message ? e.message : e);
                throw e;
            } finally {
                self.iotLoggingIn = false;
            }
        })();
        try {
            return await this._iotConnectPromise;
        } finally {
            // 成功后保留 iotReady；失败则清 promise 以便稍后重试（成功也清，下次直接走 ready 短路）
            this._iotConnectPromise = null;
        }
    },
    awsIotSend: async function (method, params) {
        var uuid = (this.remoteUuid || '').trim();
        if (!uuid) { try { window.dispatchEvent(new CustomEvent('transport-need-uuid')); } catch (e) {} throw new Error('缺少设备 UUID'); }
        await this.ensureIot();
        var requestId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
            : ('r' + Date.now() + Math.random().toString(36).slice(2, 8));
        var payload = JSON.stringify({ method: method, params: params, requestId: requestId });
        var self = this, reqTopic = 'v1/devices/' + uuid + '/rpc/request/' + this.rtmUserId;
        // 列表类应答可能很大/很慢；仍可能因 MQTT 128KB 上限丢包——调用方须缩小 pageSize
        var heavy = /queryLocalRecordIndexInformationCommand|getRecordTimelineCommand|queryCloudRecord|getCloudRecordListCommand/.test(method);
        var timeoutMs = heavy ? Math.max(self.rtmReplyTimeoutMs, 45000) : self.rtmReplyTimeoutMs;
        var p = new Promise(function (resolve, reject) {
            var timer = setTimeout(function () { delete self.pending[requestId]; reject(new Error('IoT 应答超时: ' + method)); }, timeoutMs);
            self.pending[requestId] = { resolve: resolve, reject: reject, timer: timer };
        });
        this.iot.publish(reqTopic, payload, { qos: 1 });
        return await p;
    },
    awsIotResponse: async function (init) {
        var method = '', params = {};
        try { var b = JSON.parse((init && init.body) || '{}'); method = b.method; params = b.params || {}; }
        catch (e) { throw new Error('transport: 无法解析命令请求体'); }
        var data = await this.awsIotSend(method, params);
        return { ok: true, status: 200, json: async function () { return data; }, text: async function () { return JSON.stringify(data); } };
    },
    // 远程链路选择：优先 AWS IoT（有凭证时），否则回退 Agora RTM。
    // 云控制台构建不含 agora-rtm.js:一旦 RTM 懒加载失败即短路,后续 IoT 失败直接抛错,不再反复回退刷屏。
    remoteResponse: async function (init) {
        // 门户 awsIot：只走 IoT，不回退 RTM（云端构建常无 agora-rtm.js，回退只会 404 刷屏）
        if (this.mode === 'awsIot' || this.iotAvailable()) {
            try { return await this.awsIotResponse(init); }
            catch (e) {
                if (this.mode === 'awsIot') throw e;
                if (this._rtmUnavailable) throw e;
                console.warn('[transport] IoT 失败，回退 RTM:', e);
            }
        }
        try { return await this.rtmResponse(init); }
        catch (e2) {
            if (/lazy load failed/.test(String(e2 && e2.message))) this._rtmUnavailable = true;
            throw e2;
        }
    }
};
// 立即安装拦截器（不依赖 Alpine）；UUID 缓存/徽标接线在 Alpine initTransport() 中补充
window.DeviceTransport.install();
