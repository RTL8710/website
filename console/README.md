# 设备管理控制台(console/)

复用 Flutter App(ahstools)的同一套 AWS 后端与协议,浏览器端管理设备。纯静态、无构建 —— 直接随站点部署(GitHub Pages + 自建 nginx),入口 `https://anhaishi.cn/console/`。

## 已完成:Phase 1（MVP)
- **登录**:Cognito SRP(`amazon-cognito-identity-js`),登录后解析 `User` 行(`listUsers awsUserID eq sub` → `User.id`)。
- **设备列表**:`listDeviceUsers(filter userId eq User.id)` + nextToken 翻页;玻璃卡展示在线状态、型号、固件(`deviceGeneralInformation` blob)。
- **云端回放**:按日期查 `listCloudRecords` → 时间轴列表 → 点选用 KVS `GetHLSStreamingSessionURL(streamName=deviceId)` 出 HLS,`hls.js` 播放。
- 实时预览 / 参数设置 / OTA 为占位标签,见 Phase 2–4。

## ⚠️ AWS 前置(必须先做,否则云回放报 403)
云回放要浏览器经 **Cognito Identity Pool** 拿临时凭证访问 KVS。给 Identity Pool
`ap-northeast-1:4f20eecf-8245-44f1-af1d-ce335a359b6a` 的 **authenticated 角色**加权限:
```
kinesisvideo:GetDataEndpoint
kinesisvideo:GetHLSStreamingSessionURL
```
(设备列表/录像列表走 AppSync API key,无需额外 IAM。)

Phase 2/3/4 还需:`kinesisvideo:ConnectAsViewer/GetSignalingChannelEndpoint/GetIceServerConfig/DescribeSignalingChannel`(实时)、`iot:Connect/Publish/Subscribe/Receive` + IoT 主题策略允许 Cognito 身份(参数/OTA)。

## 结构
```
console/
  index.html   config.js   app.js   styles.css(glass tokens)
  lib/ auth.js  graphql.js  kvs-hls.js  ui.js
```
依赖走 CDN(esm.sh 的 aws-sdk/cognito、jsdelivr 的 hls.js),版本在 `config.js` / `index.html` 固定。如需免 CDN,下载到 `vendor/` 改本地路径即可。

## 测试
1. 先做上面的 AWS 前置。
2. `/console/` 用真实设备账号登录 → 看到设备列表 → 进设备 → 云端回放选日期播放。
3. 云回放 403 = Identity Pool 缺 KVS 权限;设备列表空 = 该账号无绑定设备或 `User` 表无记录。

## 未做(后续)
- Phase 2 实时预览(KVS WebRTC viewer):移植 `kvsApi.dart`+`signaling.dart`。⚠️ 开工前核对信道名是 `device.id` 还是 `deviceUuid`。
- Phase 3 参数(IoT MQTT-over-WSS):移植 `aws_iot_command_service.dart` 主题/信封,传输换 WSS+SigV4。
- Phase 4 OTA + 其余设置域。
- 设备本地(SD)回放。
