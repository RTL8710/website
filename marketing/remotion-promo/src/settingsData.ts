import {Feature} from './FeatureExplainer';

// 产品向设置页(无截图,走图标卡)。已剔除会泄露技术选型/纯开发诊断的页:cloud_data(AppSync)/log/ids。
// 云录像设置已脱敏:不出现 AWS / KVS / Region / Stream Name。
export const SETTINGS_FEATURES: Feature[] = [
  {
    id: 'audio', name: '音频设置', sub: '麦克风 · 录音 · 扬声器音量', shot: 'audio.png',
    overview: ['麦克风输入开关', '音频录制开关', '扬声器音量 0–100% 滑块', '综述卡:音量百分比 + 麦克风/录音状态快览'],
    details: [
      {k: 'Microphone', v: '设备麦克风输入开关(默认关)'},
      {k: 'Audio Recording', v: '是否录制设备端音频(默认关)'},
      {k: 'Volume 开关', v: '扬声器播放是否启用(默认关)'},
      {k: 'Volume 滑块', v: '音量 0–100%,默认 80%'},
    ],
    tips: ['拖音量滑块跟手,松手才下发省请求', 'HTTP / 云端自适配下发', '进页面缓存秒显,再拉最新覆盖'],
  },
  {
    id: 'notify', name: '通知 / 告警设置', sub: '运动告警推送 · 内容详细度', shot: '',
    overview: ['通知总开关:运动检测告警推送', '告警内容模式 3 档', '运动告警 / 通知方式子菜单', '改后即时缓存并下发'],
    details: [
      {k: 'Notification Enable', v: '是否推送运动检测告警(默认关)'},
      {k: 'Alarm Mode', v: '最省流 / 完整 / 含缩略图 三档'},
      {k: 'Motion Alerts', v: '进子页配置详细告警规则'},
      {k: 'Switching Notification', v: '进子页配置通知方式'},
    ],
    tips: ['设置后,下次告警事件按新方式推送', '含缩略图模式最直观但更耗流量', '改动立即写缓存'],
  },
  {
    id: 'devinfo', name: '设备信息', sub: '改名 · 版本/型号/UUID · 恢复出厂', shot: 'devinfo.png',
    overview: ['设备改名(同步云端与列表)', '版本 / 型号 / UUID / 时间 只读展示', '恢复出厂(危险操作)', '下拉刷新同步云端'],
    details: [
      {k: 'Device Name', v: '改昵称,同步云端与设备列表'},
      {k: 'Device Version', v: '当前固件版本(只读)'},
      {k: 'Device Type', v: '设备型号(只读)'},
      {k: 'Device UUID', v: '全局唯一标识,可复制'},
      {k: 'Date Time', v: '设备当前时间(只读)'},
      {k: 'Factory Recovery', v: '⚠️ 恢复出厂,清空所有设置'},
    ],
    tips: ['改名去重:无变化不回写云端', '⚠️ 恢复出厂不可逆,慎点', '改名顺序:设备→云端→缓存→列表'],
  },
  {
    id: 'ptz', name: '云台 / 电机控制', sub: '电机开关 · 速度 · 实时方向盘', shot: '',
    overview: ['电机启用开关', '速度 4 档:低 / 中 / 默认 / 高', '实时方向盘 8 向手势控制', '松手即停,改方向即时下发'],
    details: [
      {k: 'Motor Enable', v: '云台电机开关(默认关)'},
      {k: 'Motor Speed', v: '10 / 40 / 80 / 100,默认 80'},
      {k: '方向盘', v: '8 向 + 对角,拖动转向、松手停'},
      {k: '灵敏度', v: '100ms 限流,防快速抖动'},
    ],
    tips: ['改方向即时下发,无延迟', '仅设备支持云台时可用', 'HTTP / 云端自适配下发'],
  },
  {
    id: 'rtsp', name: '实时直播 RTSP', sub: 'RTSP 服务 · 码流 · 认证 · 端口', shot: 'rtsp.png',
    overview: ['RTSP 服务总开关', '主 / 子码流选择', '认证 / 免认证', '监听端口(默认 554)', '乐观更新,点完即时生效'],
    details: [
      {k: 'RTSP Enable', v: '启动 RTSP 服务(默认关)'},
      {k: 'Stream Type', v: '主码流(高清)/ 子码流(低带宽)'},
      {k: 'Auth', v: '需密码 / 免认证'},
      {k: 'RTSP Port', v: '服务监听端口,默认 554'},
    ],
    tips: ['第三方播放器可 rtsp://设备IP:端口/live 接入', '关 RTSP 时下方子项隐藏', '改认证后新客户端需输密码'],
  },
  {
    id: 'network', name: '网络 / WiFi 设置', sub: 'IP 状态 · WiFi 接入', shot: 'network.png',
    overview: ['网络状态概览:IP / 网关 / 掩码 / DNS', 'WiFi 接入:SSID + 密码', '连接状态指示', '更新后设备切换网络'],
    details: [
      {k: 'IP / 网关 / DNS', v: '当前网络信息(只读,可复制)'},
      {k: 'WiFi SSID', v: 'WiFi 网络名称'},
      {k: 'WiFi Password', v: 'WiFi 接入密码'},
      {k: 'Connect Status', v: '连接状态(连接 / 断开)'},
    ],
    tips: ['改 WiFi 后设备需 1–5s 连新网,期间可能短暂断连', '含配网二维码逻辑', 'HTTP / 云端自适配下发'],
  },
  {
    id: 'ntp', name: '时间 / NTP 设置', sub: '自动对时 · 时区 · 服务器', shot: 'ntp.png',
    overview: ['NTP 自动对时开关', '时区选择 UTC-12 ~ UTC+12', 'NTP 服务器选择(预置 8 个)', '同步间隔(秒)', '综述显当前时间 + 同步状态'],
    details: [
      {k: 'NTP Mode', v: '自动对时开关(默认开)'},
      {k: 'TimeZone', v: 'UTC-12 ~ +12,影响显示时间'},
      {k: 'NTP Server', v: '预置 8 个公共服务器'},
      {k: 'Sync Interval', v: '对时周期(秒),如 3600'},
      {k: 'Sync Status', v: '是否同步成功(只读)'},
    ],
    tips: ['关 NTP 用设备本地时间,可能漂移', '仅开 NTP 时显示时区/服务器/间隔', 'HTTP / 云端自适配下发'],
  },
  {
    id: 'storage', name: '存储 / SD 卡设置', sub: '容量 · 自动删除 · EMR 配额', shot: 'storage.png',
    overview: ['容量概览:可用 / 已用 / 使用率', '自动删除阈值', '格式化(危险)', 'EMR 紧急录像配额比例', 'EMR 删除允许开关'],
    details: [
      {k: '容量概览', v: '可用/已用 MB + 使用率条(>90% 变红)'},
      {k: 'Storage Del(M)', v: '剩余低于此值自动删旧录像'},
      {k: '格式化', v: '⚠️ 清空存储'},
      {k: 'EMR Quota', v: '紧急录像占比 0~1,默认 0.5'},
      {k: 'EMR Delete', v: '常规录像满时是否允许删 EMR'},
    ],
    tips: ['使用率 ≥90% 进度条变红提醒', '滑块松手才下发', '⚠️ 格式化不可逆,慎点'],
  },
  {
    id: 'battery', name: '电池设置', sub: '电量 · 电压 · 工作模式', shot: 'battery.png',
    overview: ['电量百分比', '电池电压', '电池状态', '电池工作模式设置', '低电量进度条变红'],
    details: [
      {k: 'Voltage %', v: '当前电量百分比(只读)'},
      {k: 'Voltage', v: '电池实际电压(只读)'},
      {k: 'Battery State', v: '是否接入正常(只读)'},
      {k: 'Work Mode', v: '普通 / 低功耗 / 高性能'},
    ],
    tips: ['电量 ≤20% 进度条变红', '电量/电压只读,仅工作模式可改', '改模式点保存才下发'],
  },
  {
    id: 'peripheral', name: '外设 / 指示灯', sub: '指示灯 · 补光灯 · 亮度 · 模式', shot: '',
    overview: ['蓝 / 绿指示灯开关', '聚光灯 / 补光灯开关', '聚光灯亮度 0–100%', '指示灯模式:正常 / 升级 / 故障', '改动即时下发'],
    details: [
      {k: 'Blue / Green Light', v: '蓝 / 绿 LED 指示灯开关'},
      {k: 'Spot Light', v: '聚光灯 / 补光灯开关'},
      {k: 'Brightness', v: '聚光灯亮度 0–100%,默认 50'},
      {k: 'Light Mode', v: '正常 / 升级中 / 故障 状态指示'},
    ],
    tips: ['聚光灯增功耗,建议夜间/低光才开', '蓝绿灯功耗极低', '亮度滑块松手才下发'],
  },
  {
    id: 'cloudrecset', name: '云录像设置', sub: '云录像开关 · 码流 · 保留 · 触发', shot: 'cloudrecset.png',
    overview: ['云录像总开关', '主 / 子码流上传', '云端保留时长', 'EMR 事件触发上传', '预录触发上传'],
    details: [
      {k: 'Cloud Record', v: '云录像开关(默认关)'},
      {k: 'Stream Type', v: '上传主码流(高清)/ 子码流(低带宽)'},
      {k: 'Retention', v: '云端保留时长,超期自动删'},
      {k: 'Trigger on EMR', v: '异常时自动上传紧急片段'},
      {k: 'Trigger on Pre-Record', v: '事件前后文片段一起传'},
    ],
    tips: ['保留越长存储成本越高', 'EMR + 预录都开可能重复保存', '改动后下次事件按新规则上传'],
  },
];
