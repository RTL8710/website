import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  Audio,
  staticFile,
  delayRender,
  continueRender,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {loadFont} from '@remotion/google-fonts/NotoSansSC';
import {CYAN} from './Promo';
import {drawScene} from './scenes';

const {fontFamily} = loadFont();
const BG = '#0a0e17';
const INK = '#eaf6fb';
const MUT = '#9aa9bf';
const T = 16; // crossfade frames

// ─── phone mockup ──────────────────────────────────────────────────────────────
const Phone: React.FC<{shot: string; h?: number}> = ({shot, h = 720}) => {
  const w = (h * 926) / 1624;
  const bez = 12;
  return (
    <div style={{position: 'relative', width: w + bez * 2, height: h + bez * 2, borderRadius: 44, background: 'linear-gradient(150deg, #23303f, #0d141d)', padding: bez, boxSizing: 'border-box', boxShadow: `0 40px 90px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05), 0 0 70px ${CYAN}22`}}>
      <div style={{position: 'relative', width: '100%', height: '100%', borderRadius: 34, overflow: 'hidden', background: '#000'}}>
        <Img src={staticFile(shot)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block'}} />
      </div>
      <div style={{position: 'absolute', top: bez + 10, left: '50%', transform: 'translateX(-50%)', width: 52, height: 7, borderRadius: 4, background: 'rgba(0,0,0,0.55)'}} />
    </div>
  );
};

// 场景底图:CLI 渲染时由代码即时绘制,无需任何 scene-*.jpg
const SceneCanvas: React.FC<{sceneKey: string; style?: React.CSSProperties}> = ({sceneKey, style}) => {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [handle] = React.useState(() => delayRender(`scene-${sceneKey}`));
  React.useEffect(() => {
    const cv = ref.current;
    if (cv) { const ctx = cv.getContext('2d'); if (ctx) drawScene(ctx, sceneKey, cv.width, cv.height); }
    continueRender(handle);
  }, [sceneKey, handle]);
  return <canvas ref={ref} width={1600} height={900} style={style} />;
};

type Scene = {
  bg: string; phone: string; side: 'left' | 'right'; env: string; hud: string; act: string;
  num: string; place: string; kicker: string; title: string; sub: string; chips: string[];
};

const A1 = '第一幕 · 智能主场', A2 = '第二幕 · 端侧 AI', A3 = '第三幕 · 安防与更多设备';

const SCENES: Scene[] = [
  // 第一幕 · 智能主场
  {side: 'right', bg: 'scene-glasses.jpg', phone: 'chat.png', env: 'radial-gradient(90% 90% at 32% 20%, #10202e 0%, #060a10 70%)', act: A1,
    hud: 'AI 眼镜 · 第一视角', num: '01', place: '智能眼镜 · 第一视角', kicker: '抬眼之间,一切就绪', title: '抬眼,\n世界会说话。',
    sub: 'AR 导航指路、看一眼即付、AI 即问即答,还能把这一天存成记忆胶囊', chips: ['AR 导航 · 路面箭头指路', '看一眼即付 · 免掉手机', 'AI 对话 · 眼前即问即答', '记忆胶囊 · 自动记录这一天']},
  {side: 'left', bg: 'scene-store.jpg', phone: 'chat.png', env: 'radial-gradient(90% 90% at 70% 20%, #201a30 0%, #070a12 70%)', act: A1,
    hud: '出差途中  远程查看', num: '02', place: '设备对话 · 会看会说', kicker: '不用调监控,问一句就行', title: '“现在店里\n什么情况?”',
    sub: '设备端视觉大模型看懂画面,还能读出画面里的字', chips: ['设备对话 · VLM 秒答', '看懂场景 + 识别文字', '本地优先:秒显历史']},
  {side: 'right', bg: 'scene-robot.jpg', phone: 'detect.png', env: 'radial-gradient(90% 90% at 30% 20%, #0c1e1e 0%, #060b0e 70%)', act: A1,
    hud: 'ROS · Foxglove 推流中', num: '03', place: '机器人 · 无人车 · 产线', kicker: '检测结果,直接喂给决策', title: '看到,\n即刻上报。',
    sub: '画面绘框 + Foxglove / ROS 实时推送,已在真机量产落地', chips: ['检测结果推 ROS / 可视化', '类别 / 阈值 / 帧间隔可调', '~15 万台/月 · 可量产']},
  // 第二幕 · 端侧 AI
  {side: 'left', bg: 'scene-warehouse.jpg', phone: 'detect.png', env: 'radial-gradient(90% 90% at 68% 18%, #10233a 0%, #060a12 70%)', act: A2,
    hud: '2026-07-04  00:47:12', num: '04', place: '端侧算力 · 断网可用', kicker: '网线被拔的那一刻', title: '断网了。\n它还在认人。',
    sub: '检测全在设备本地算力上推理,不靠云、不靠网', chips: ['端侧 YOLO · 断网照跑', '识别到「人」· 置信 0.82', '一键 EMR 紧急录像已触发']},
  {side: 'right', bg: 'scene-wildlife.jpg', phone: 'chat.png', env: 'radial-gradient(90% 90% at 32% 18%, #16281f 0%, #050c0a 70%)', act: A2,
    hud: '庭院 CAM · 移动侦测', num: '05', place: '户外 · 庭院 · 野外观测', kicker: '它来的时候,你不在也没关系', title: '鸟来了,\n自动记一笔。',
    sub: '检测到动物即触发录像,还能问 AI「这是什么」', chips: ['端侧检测 · 动物出现即录', '设备对话 · 问画面里是什么', '本地存储 + 云端归档']},
  // 第三幕 · 安防与更多设备
  {side: 'left', bg: 'scene-security.jpg', phone: 'cloud.png', env: 'radial-gradient(90% 90% at 70% 18%, #0a141f 0%, #04080d 70%)', act: A3,
    hud: '值守中心 · 12 路在线 · 1 路告警', num: '06', place: '安防监控 · 入侵取证', kicker: '有人翻墙的那一秒', title: '入侵即录,\n证据锁死。',
    sub: '检测到入侵自动锁存录像,本地 + 云端双备份,证据不可篡改', chips: ['端侧检测入侵 · 自动触发录像', '本地 + 云端双备份 · 不可篡改', '一屏值守 · 多路红标定位']},
  {side: 'right', bg: 'scene-door.jpg', phone: 'live.png', env: 'radial-gradient(90% 90% at 30% 22%, #10222b 0%, #060a10 70%)', act: A3,
    hud: '门口 CAM1 · 实时', num: '07', place: '家庭安防 · 直播对讲', kicker: '看得见,还能对话', title: '“放门口\n就可以了。”',
    sub: 'WebRTC 多路直播 + 双向对讲,事后还能秒级回查', chips: ['多路实时直播 + 画中画', '双向对讲 · 一句话搞定', '时间轴回放 · 分钟级定位']},
  {side: 'left', bg: 'scene-car.jpg', phone: 'playback.png', env: 'radial-gradient(90% 90% at 70% 20%, #0a1622 0%, #04080e 70%)', act: A3,
    hud: 'CAM · 循环录像中  60 km/h', num: '08', place: '行车记录仪 · 车规级', kicker: '一路上的每一帧', title: '碰一下,\n自动锁存。',
    sub: '循环录像不丢现片,碰撞 / 急刹事件自动锁存留证', chips: ['循环录像 · 覆盖旧片留现片', '碰撞 / 急刹 · EMR 事件锁存', '时间轴回放 · 秒级定位那一下']},
  {side: 'right', bg: 'scene-livestream.jpg', phone: 'live.png', env: 'radial-gradient(90% 90% at 30% 20%, #251a2e 0%, #0a0710 70%)', act: A3,
    hud: '● LIVE · 1.2k 在线', num: '09', place: '直播相机 · 内容创作', kicker: '一开播,就是高清', title: '开播,\n就很清楚。',
    sub: 'WebRTC 低延迟直播,主子码流自适应,弱网也稳', chips: ['低延迟直播 · 多路可切', '主 / 子码流自适应', 'HD / SD 一键切换']},
  {side: 'left', bg: 'scene-action.jpg', phone: 'playback.png', env: 'radial-gradient(90% 90% at 70% 30%, #2a2440 0%, #0a0810 70%)', act: A3,
    hud: '运动相机 · 60fps 防抖', num: '10', place: '户外运动 · 记录精彩', kicker: '每个精彩,都不错过', title: '此刻,\n值得留下。',
    sub: '高帧率录制 + AI 自动标记精彩片段,预录不丢瞬间', chips: ['高帧率录制 · 电子防抖', 'AI 自动标记精彩', '预录缓冲 · 不丢开头']},
  {side: 'right', bg: 'scene-pet.jpg', phone: 'live.png', env: 'radial-gradient(90% 90% at 30% 20%, #241b17 0%, #0b0808 70%)', act: A3,
    hud: '客厅 CAM · 双向对讲', num: '11', place: '家庭 · 室内 · 宠物看护', kicker: '上班时,吃喝不用操心', title: '“乖,\n开饭啦。”',
    sub: '喂食器定时投喂、喂水器活水循环,直播看着它吃、对讲喊两句', chips: ['喂食器定时投喂 · 喂水器活水循环', '多路直播 + 双向对讲', '检测到宠物 · 异常提醒']},
];

// ─── one scenario ───────────────────────────────────────────────────────────────
const ScenePane: React.FC<{s: Scene; dur: number}> = ({s, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inn = spring({frame, fps, durationInFrames: 20, config: {damping: 200}});
  const kb = interpolate(frame, [0, dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const scale = 1.08 + kb * 0.1;
  const pan = (s.side === 'right' ? -1 : 1) * kb * 26;
  const dir = s.side === 'right' ? 1 : -1;
  const phoneX = interpolate(inn, [0, 1], [dir * 120, 0]);
  const phoneRot = interpolate(inn, [0, 1], [dir * 7, s.side === 'right' ? 4 : -4]);

  const scrim = s.side === 'right'
    ? 'linear-gradient(90deg, rgba(6,9,15,0.94) 0%, rgba(6,9,15,0.72) 34%, rgba(6,9,15,0.15) 62%, rgba(6,9,15,0.55) 100%)'
    : 'linear-gradient(90deg, rgba(6,9,15,0.55) 0%, rgba(6,9,15,0.15) 38%, rgba(6,9,15,0.72) 66%, rgba(6,9,15,0.94) 100%)';

  const textPane = (
    <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: s.side === 'right' ? '0 60px 0 120px' : '0 120px 0 60px', alignItems: 'flex-start', zIndex: 3}}>
      <div style={{display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '7px 16px', borderRadius: 999, background: 'rgba(34,211,238,0.12)', border: `1px solid ${CYAN}55`, opacity: inn}}>
        <span style={{width: 7, height: 7, borderRadius: '50%', background: CYAN}} />
        <span style={{fontSize: 19, fontWeight: 700, color: CYAN, letterSpacing: '0.04em'}}>{s.act}</span>
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26, opacity: inn, transform: `translateY(${interpolate(inn, [0, 1], [18, 0])}px)`}}>
        <div style={{fontSize: 26, fontWeight: 800, color: BG, background: CYAN, width: 54, height: 54, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 26px ${CYAN}55`}}>{s.num}</div>
        <div style={{fontSize: 24, fontWeight: 600, color: CYAN, letterSpacing: '0.02em'}}>{s.place}</div>
      </div>
      <div style={{fontSize: 27, fontWeight: 500, color: MUT, marginBottom: 14, opacity: inn}}>{s.kicker}</div>
      <div style={{fontSize: 92, fontWeight: 900, color: '#fff', lineHeight: 1.08, whiteSpace: 'pre-line', opacity: inn, transform: `translateY(${interpolate(inn, [0, 1], [26, 0])}px)`, textShadow: '0 6px 40px rgba(0,0,0,0.5)'}}>{s.title}</div>
      <div style={{fontSize: 30, fontWeight: 500, color: INK, marginTop: 22, maxWidth: 640, lineHeight: 1.4, opacity: inn}}>{s.sub}</div>
      <div style={{marginTop: 38, display: 'flex', flexDirection: 'column', gap: 16}}>
        {s.chips.map((c, i) => {
          const bs = spring({frame: frame - 18 - i * 7, fps, durationInFrames: 14, config: {damping: 200}});
          return (
            <div key={i} style={{display: 'inline-flex', alignItems: 'center', gap: 14, alignSelf: 'flex-start', padding: '13px 24px', borderRadius: 999, background: 'rgba(34,211,238,0.10)', border: `1px solid ${CYAN}44`, opacity: bs, transform: `translateX(${interpolate(bs, [0, 1], [24, 0])}px)`}}>
              <span style={{width: 9, height: 9, borderRadius: '50%', background: CYAN, boxShadow: `0 0 12px ${CYAN}`}} />
              <span style={{fontSize: 26, fontWeight: 600, color: INK, whiteSpace: 'nowrap'}}>{c}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const phonePane = (
    <div style={{flex: '0 0 auto', width: 560, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3}}>
      <div style={{transform: `translateX(${phoneX}px) rotate(${phoneRot}deg)`, opacity: inn}}><Phone shot={s.phone} /></div>
    </div>
  );

  return (
    <AbsoluteFill style={{background: s.env}}>
      <AbsoluteFill style={{overflow: 'hidden'}}>
        <SceneCanvas sceneKey={s.bg.replace('scene-', '').replace('.jpg', '')} style={{position: 'absolute', inset: -40, width: 'calc(100% + 80px)', height: 'calc(100% + 80px)', transform: `scale(${scale}) translateX(${pan}px)`}} />
      </AbsoluteFill>
      <AbsoluteFill style={{background: scrim, zIndex: 2}} />
      <div style={{position: 'absolute', top: 40, left: 60, right: 60, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 3, opacity: inn * 0.9}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, fontWeight: 600, color: '#fff', letterSpacing: '0.04em'}}>
          <span style={{width: 12, height: 12, borderRadius: '50%', background: '#ff4d4d', boxShadow: '0 0 12px #ff4d4d'}} />REC
        </div>
        <div style={{fontSize: 22, fontWeight: 500, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.04em'}}>{s.hud}</div>
      </div>
      <AbsoluteFill style={{display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '0 90px', zIndex: 3}}>
        {s.side === 'right' ? <>{textPane}{phonePane}</> : <>{phonePane}{textPane}</>}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── hook / close ───────────────────────────────────────────────────────────────
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const l1 = spring({frame, fps, durationInFrames: 16, config: {damping: 200}});
  const l2 = spring({frame: frame - 10, fps, durationInFrames: 16, config: {damping: 200}});
  return (
    <AbsoluteFill style={{background: BG, justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
      <div style={{fontSize: 34, fontWeight: 600, color: CYAN, letterSpacing: '0.14em', marginBottom: 26, opacity: interpolate(frame, [30, 46], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>11 个真实现场</div>
      <div style={{fontSize: 116, fontWeight: 900, color: '#fff', transform: `scale(${interpolate(l1, [0, 1], [0.72, 1])})`, opacity: l1}}>看得见,</div>
      <div style={{fontSize: 116, fontWeight: 900, color: CYAN, marginTop: 4, transform: `scale(${interpolate(l2, [0, 1], [0.72, 1])})`, opacity: l2, textShadow: `0 0 60px ${CYAN}55`}}>更看得懂。</div>
      <div style={{fontSize: 32, color: MUT, marginTop: 40, opacity: interpolate(frame, [46, 62], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>设备端 AI 摄像头 · 断网可用 · 真机量产</div>
      <div style={{display: 'flex', gap: 20, marginTop: 34, opacity: interpolate(frame, [52, 68], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        {['智能主场', '端侧 AI', '安防·更多设备'].map((a, i) => (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, fontWeight: 600, color: '#cfe6ef'}}>
            <span style={{fontSize: 18, fontWeight: 800, color: BG, background: CYAN, width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{['壹', '贰', '叁'][i]}</span>
            {a}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, durationInFrames: 18, config: {damping: 200}});
  return (
    <AbsoluteFill style={{background: BG, justifyContent: 'center', alignItems: 'center', textAlign: 'center', flexDirection: 'column', padding: '0 80px'}}>
      <div style={{fontSize: 88, fontWeight: 900, color: '#fff', lineHeight: 1.18, transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s}}>
        一套 AI,<br />装进你的<span style={{color: CYAN, textShadow: `0 0 60px ${CYAN}55`}}>设备</span>。
      </div>
      <div style={{fontSize: 44, color: '#fff', marginTop: 46, opacity: interpolate(frame, [22, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>微信 <b style={{color: CYAN}}>13826173658</b></div>
      <div style={{fontSize: 30, color: MUT, marginTop: 12, opacity: interpolate(frame, [30, 48], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>深圳 · 17 年安防 · 只解别人做不出的硬题</div>
    </AbsoluteFill>
  );
};

// ─── durations ──────────────────────────────────────────────────────────────────
const D = {hook: 120, scene: 210, close: 138};
export const SS_TOTAL = D.hook + SCENES.length * D.scene + D.close - (1 + SCENES.length + 1) * T;

export const ScenarioStories: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: BG, fontFamily}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={D.hook}><Hook /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        {SCENES.map((s, i) => (
          <React.Fragment key={i}>
            <TransitionSeries.Sequence durationInFrames={D.scene}><ScenePane s={s} dur={D.scene} /></TransitionSeries.Sequence>
            <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
          </React.Fragment>
        ))}
        <TransitionSeries.Sequence durationInFrames={D.close}><Close /></TransitionSeries.Sequence>
      </TransitionSeries>
      <Audio src={staticFile('bgm.mp3')} volume={(f) => interpolate(f, [0, 18, SS_TOTAL - 60, SS_TOTAL], [0, 0.6, 0.6, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
    </AbsoluteFill>
  );
};
