import React from 'react';
import {
  AbsoluteFill,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
  spring,
  Img,
  Audio,
  staticFile,
  Sequence,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {loadFont} from '@remotion/google-fonts/NotoSansSC';
import {Center, CYAN} from './Promo';

const {fontFamily} = loadFont();
const BG = '#0a0e17';
const INK = '#eaf6fb';
const MUT = '#9aa9bf';
const T = 14; // crossfade length

const useV = () => {
  const {width, height} = useVideoConfig();
  return height > width;
};

// ─── phone mockup around a portrait screenshot (926×1624) ──────────────────────
const Phone: React.FC<{shot: string; h?: number}> = ({shot, h = 760}) => {
  const w = (h * 926) / 1624;
  const bez = 12;
  return (
    <div
      style={{
        position: 'relative',
        width: w + bez * 2,
        height: h + bez * 2,
        borderRadius: 46,
        background: 'linear-gradient(150deg, #23303f, #0d141d)',
        padding: bez,
        boxSizing: 'border-box',
        boxShadow: `0 40px 90px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05), 0 0 70px ${CYAN}22`,
      }}
    >
      <div style={{position: 'relative', width: '100%', height: '100%', borderRadius: 36, overflow: 'hidden', background: '#000'}}>
        <Img src={staticFile(shot)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block'}} />
      </div>
      <div style={{position: 'absolute', top: bez + 10, left: '50%', transform: 'translateX(-50%)', width: 54, height: 7, borderRadius: 4, background: 'rgba(0,0,0,0.55)'}} />
    </div>
  );
};

// ─── ambient backdrop ──────────────────────────────────────────────────────────
const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const gx = 50 + Math.sin(frame / 55) * 12;
  return (
    <AbsoluteFill style={{backgroundColor: BG}}>
      <AbsoluteFill style={{backgroundImage: `radial-gradient(60% 55% at ${gx}% 18%, ${CYAN}1f, transparent 60%)`}} />
      <AbsoluteFill style={{opacity: 0.05, backgroundImage: `linear-gradient(${CYAN} 1px, transparent 1px), linear-gradient(90deg, ${CYAN} 1px, transparent 1px)`, backgroundSize: '64px 64px'}} />
    </AbsoluteFill>
  );
};

// ─── hook ──────────────────────────────────────────────────────────────────────
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useV();
  const l1 = spring({frame, fps, durationInFrames: 16, config: {damping: 200}});
  const l2 = spring({frame: frame - 10, fps, durationInFrames: 16, config: {damping: 200}});
  const fz = v ? 108 : 120;
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
      <div style={{fontSize: fz, fontWeight: 900, color: '#fff', transform: `scale(${interpolate(l1, [0, 1], [0.72, 1])})`, opacity: l1}}>拔掉网线。</div>
      <div style={{fontSize: fz, fontWeight: 900, color: CYAN, marginTop: 6, transform: `scale(${interpolate(l2, [0, 1], [0.72, 1])})`, opacity: l2, textShadow: `0 0 60px ${CYAN}55`}}>它还在认人。</div>
      <div style={{fontSize: 38, color: MUT, marginTop: 40, opacity: interpolate(frame, [30, 46], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>AI 跑在设备本地算力上 · 断网可用</div>
      <div style={{fontSize: 26, color: INK, marginTop: 46, opacity: interpolate(frame, [46, 62], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), letterSpacing: '0.08em', padding: '12px 30px', border: `1px solid ${CYAN}44`, borderRadius: 999}}>设备端 AI 摄像头 · 功能亮点</div>
    </AbsoluteFill>
  );
};

// ─── one feature ───────────────────────────────────────────────────────────────
type Feat = {num: string; shot: string; name: string; sub: string; bullets: string[]; side: 'left' | 'right'};

const FeaturePane: React.FC<{f: Feat}> = ({f}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, durationInFrames: 20, config: {damping: 200}});
  const dir = f.side === 'left' ? -1 : 1;
  const phoneX = interpolate(enter, [0, 1], [dir * 120, 0]);
  const phoneRot = interpolate(enter, [0, 1], [dir * 6, f.side === 'left' ? -3 : 3]);

  const phoneCol = (
    <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', flex: '0 0 auto', width: 560}}>
      <div style={{transform: `translateX(${phoneX}px) rotate(${phoneRot}deg)`, opacity: enter}}>
        <Phone shot={f.shot} />
      </div>
    </div>
  );

  const textCol = (
    <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: f.side === 'left' ? '0 90px 0 40px' : '0 40px 0 90px'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 22, marginBottom: 22, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`}}>
        <div style={{fontSize: 30, fontWeight: 800, color: BG, background: CYAN, width: 62, height: 62, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 30px ${CYAN}55`}}>{f.num}</div>
        <div style={{width: 70, height: 3, background: CYAN, opacity: 0.5}} />
      </div>
      <div style={{fontSize: 78, fontWeight: 900, color: '#fff', lineHeight: 1.06, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)`}}>{f.name}</div>
      <div style={{fontSize: 34, fontWeight: 500, color: CYAN, marginTop: 16, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`}}>{f.sub}</div>
      <div style={{marginTop: 42, display: 'flex', flexDirection: 'column', gap: 22}}>
        {f.bullets.map((b, i) => {
          const bs = spring({frame: frame - 16 - i * 7, fps, durationInFrames: 14, config: {damping: 200}});
          return (
            <div key={i} style={{display: 'flex', alignItems: 'flex-start', gap: 18, opacity: bs, transform: `translateX(${interpolate(bs, [0, 1], [26, 0])}px)`}}>
              <span style={{fontSize: 34, fontWeight: 800, color: CYAN, lineHeight: 1.25}}>›</span>
              <span style={{fontSize: 33, fontWeight: 500, color: INK, lineHeight: 1.28}}>{b}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <AbsoluteFill style={{display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '0 110px'}}>
      {f.side === 'left' ? <>{phoneCol}{textCol}</> : <>{textCol}{phoneCol}</>}
    </AbsoluteFill>
  );
};

// ─── more grid ───────────────────────────────────────────────────────────────
const MoreGrid: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const head = spring({frame, fps, durationInFrames: 16, config: {damping: 200}});
  const shots = [
    {src: 'record.png', label: '录像设置'},
    {src: 'settings.png', label: '视频参数'},
    {src: 'cloud.png', label: '云端回放'},
    {src: 'ota.png', label: 'OTA 升级'},
    {src: 'devlist.png', label: '多设备管理'},
  ];
  return (
    <AbsoluteFill style={{flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{fontSize: 66, fontWeight: 900, color: '#fff', opacity: head, transform: `translateY(${interpolate(head, [0, 1], [20, 0])}px)`, marginBottom: 8}}>
        还有<span style={{color: CYAN}}>更多能力</span>,一套搞定
      </div>
      <div style={{fontSize: 30, color: MUT, opacity: head, marginBottom: 46}}>录像 · 画质 · 云存 · 固件 · 多设备</div>
      <div style={{display: 'flex', gap: 30}}>
        {shots.map((s, i) => {
          const bs = spring({frame: frame - 10 - i * 5, fps, durationInFrames: 18, config: {damping: 200}});
          return (
            <div key={i} style={{opacity: bs, transform: `translateY(${interpolate(bs, [0, 1], [40, 0])}px) scale(${interpolate(bs, [0, 1], [0.9, 1])})`}}>
              <Phone shot={s.src} h={430} />
              <div style={{fontSize: 26, fontWeight: 600, color: INK, textAlign: 'center', marginTop: 18}}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── stats ─────────────────────────────────────────────────────────────────────
const Stats: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const big = Math.round(interpolate(frame, [9, 42], [0, 15], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const head = spring({frame, fps, durationInFrames: 14, config: {damping: 200}});
  const rows = [
    {n: '~' + big, u: '万台/月', l: '真机量产出货', d: 6},
    {n: '2', u: '个月', l: '单项目跑通上线', d: 16},
    {n: '17', u: '年', l: '安防摄像头深度', d: 26},
  ];
  return (
    <AbsoluteFill style={{flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{fontSize: 40, fontWeight: 700, color: CYAN, opacity: head, letterSpacing: '0.02em', marginBottom: 30}}>真机量产 · 不是 PPT</div>
      {rows.map((r, i) => {
        const s = spring({frame: frame - r.d, fps, durationInFrames: 16, config: {damping: 200}});
        return (
          <div key={i} style={{display: 'flex', alignItems: 'baseline', gap: 16, margin: '10px 0', opacity: s, transform: `translateY(${interpolate(s, [0, 1], [24, 0])}px)`}}>
            <span style={{fontSize: 118, fontWeight: 900, color: '#fff', minWidth: 220, textAlign: 'right'}}>{r.n}</span>
            <span style={{fontSize: 46, fontWeight: 800, color: CYAN}}>{r.u}</span>
            <span style={{fontSize: 34, color: MUT, marginLeft: 14}}>{r.l}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ─── cta ───────────────────────────────────────────────────────────────────────
const Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useV();
  const s = spring({frame, fps, durationInFrames: 18, config: {damping: 200}});
  return (
    <Center>
      <div style={{fontSize: v ? 84 : 92, fontWeight: 900, color: '#fff', lineHeight: 1.16, transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s}}>
        你的设备,也能装上<br /><span style={{color: CYAN, textShadow: `0 0 60px ${CYAN}55`}}>这套 AI</span>。
      </div>
      <div style={{fontSize: 46, color: '#fff', marginTop: 46, opacity: interpolate(frame, [22, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>微信 <b style={{color: CYAN}}>13826173658</b></div>
      <div style={{fontSize: 32, color: MUT, marginTop: 12, opacity: interpolate(frame, [30, 48], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>深圳 · 17 年安防 · 只解别人做不出的硬题</div>
    </Center>
  );
};

// ─── durations (frames @30fps) ───────────────────────────────────────────────
const D = {hook: 126, feat: 156, more: 138, stats: 126, cta: 138};
const FEATS: Feat[] = [
  {num: '01', side: 'left', shot: 'chat.png', name: '设备对话', sub: '设备端视觉大模型 · 看懂画面会聊天',
    bullets: ['拍照 / 文本提问,设备端实时回答', '看懂整个场景,还能读出画面里的字', '本地优先:秒显历史,断网看缓存']},
  {num: '02', side: 'right', shot: 'live.png', name: '实时视频', sub: 'WebRTC 多路实时直播',
    bullets: ['CAM1 + CAM2 同屏,画中画可拖切', '截图 / 录制 / 双向对讲', 'EMR 紧急录像一键触发,支持云台']},
  {num: '03', side: 'left', shot: 'detect.png', name: 'AI 检测', sub: '端侧 YOLO · 断网照用',
    bullets: ['检测全在设备本地算力上推理', '类别 / 置信度 / 帧间隔可调', '画面绘框 + Foxglove / ROS 推送']},
  {num: '04', side: 'right', shot: 'playback.png', name: '录像回放', sub: '本地 / 云端 · 多路同步',
    bullets: ['24h 时间轴标尺,分钟级可视定位', '最多 8 路同步回放,共用时间轴', '云端 HLS 归档,跨设备聚合筛选']},
];

export const FH_TOTAL =
  D.hook + FEATS.length * D.feat + D.more + D.stats + D.cta - (1 + FEATS.length + 2) * T;

export const FeatureHighlights: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: BG, fontFamily}}>
      <Backdrop />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={D.hook}><Hook /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        {FEATS.map((f, i) => (
          <React.Fragment key={f.num}>
            <TransitionSeries.Sequence durationInFrames={D.feat}><FeaturePane f={f} /></TransitionSeries.Sequence>
            <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
          </React.Fragment>
        ))}
        <TransitionSeries.Sequence durationInFrames={D.more}><MoreGrid /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={D.stats}><Stats /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={D.cta}><Cta /></TransitionSeries.Sequence>
      </TransitionSeries>
      <Audio src={staticFile('bgm.mp3')} volume={(fr) => interpolate(fr, [0, 18, FH_TOTAL - 60, FH_TOTAL], [0, 0.65, 0.65, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
    </AbsoluteFill>
  );
};
