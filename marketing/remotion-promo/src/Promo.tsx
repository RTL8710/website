import React from 'react';
import {AbsoluteFill, useVideoConfig, useCurrentFrame, interpolate, spring, Img, Audio, staticFile} from 'remotion';
import {Video} from '@remotion/media';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {loadFont} from '@remotion/google-fonts/NotoSansSC';

const {fontFamily} = loadFont();
export const CYAN = '#22d3ee';
const BG = '#0a0e17';
const T = 12;
const D = {hook: 78, detect: 120, live: 90, chat: 90, play: 90, four: 96, stats: 96, cta: 108};
export const TOTAL =
  D.hook + D.detect + D.live + D.chat + D.play + D.four + D.stats + D.cta - 7 * T;

const useV = () => {
  const {width, height} = useVideoConfig();
  return height > width;
};

const LowerThird: React.FC<{title: React.ReactNode; sub: string}> = ({title, sub}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useV();
  const s = spring({frame, fps, durationInFrames: 18, config: {damping: 200}});
  const y = interpolate(s, [0, 1], [55, 0]);
  const op = interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end'}}>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: v ? 620 : 420,
        background: 'linear-gradient(0deg, rgba(7,10,17,.96) 18%, rgba(7,10,17,.45) 58%, transparent)'}} />
      <div style={{position: 'relative', padding: v ? '0 70px 210px' : '0 96px 72px',
        textAlign: v ? 'center' : 'left', transform: `translateY(${y}px)`, opacity: op}}>
        <div style={{fontSize: v ? 90 : 82, fontWeight: 900, color: '#fff', lineHeight: 1.12,
          textShadow: '0 6px 30px rgba(0,0,0,.6)'}}>{title}</div>
        <div style={{fontSize: v ? 42 : 38, color: '#cfeaf2', marginTop: 18}}>{sub}</div>
      </div>
    </AbsoluteFill>
  );
};

const BlurBgImg: React.FC<{src: string}> = ({src}) => (
  <Img src={staticFile(src)} style={{position: 'absolute', width: '100%', height: '100%',
    objectFit: 'cover', filter: 'blur(45px) brightness(0.4)', transform: 'scale(1.25)'}} />
);

export const MediaImage: React.FC<{src: string; title: React.ReactNode; sub: string}> = ({src, title, sub}) => {
  const frame = useCurrentFrame();
  const v = useV();
  const scale = interpolate(frame, [0, 90], [1.03, 1.12]);
  return (
    <AbsoluteFill style={{backgroundColor: BG}}>
      <BlurBgImg src={src} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: v ? '70px 0 360px' : '36px 0 60px'}}>
        <Img src={staticFile(src)} style={{maxWidth: v ? '86%' : 'auto', maxHeight: v ? '68%' : '90%',
          objectFit: 'contain', borderRadius: 26, boxShadow: '0 30px 80px rgba(0,0,0,.6)', transform: `scale(${scale})`}} />
      </AbsoluteFill>
      <LowerThird title={title} sub={sub} />
    </AbsoluteFill>
  );
};

const MediaVideo: React.FC = () => {
  const {fps} = useVideoConfig();
  const v = useV();
  const common = {src: staticFile('aidetect.mp4'), trimBefore: Math.round(19 * fps), trimAfter: Math.round(23 * fps), volume: 0} as const;
  return (
    <AbsoluteFill style={{backgroundColor: BG}}>
      <Video {...common} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(45px) brightness(0.4)', transform: 'scale(1.25)'}} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: v ? '0 0 320px' : '0'}}>
        <Video {...common} style={{width: '100%', height: v ? 'auto' : '100%', maxHeight: v ? '62%' : '100%',
          objectFit: v ? 'contain' : 'cover', borderRadius: v ? 18 : 0}} />
      </AbsoluteFill>
      <LowerThird title={<>它还在<span style={{color: CYAN}}>认人</span>。</>} sub="设备端 AI 检测 · 断网照用" />
    </AbsoluteFill>
  );
};

export const Center: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 95], [1.0, 1.05]);
  return (
    <AbsoluteFill style={{backgroundColor: BG, justifyContent: 'center', alignItems: 'center', textAlign: 'center',
      padding: '0 80px', transform: `scale(${scale})`,
      backgroundImage: 'radial-gradient(60% 50% at 50% 12%, rgba(34,211,238,.16), transparent 60%)'}}>
      {children}
    </AbsoluteFill>
  );
};

const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useV();
  const l1 = spring({frame, fps, durationInFrames: 16, config: {damping: 200}});
  const l2 = spring({frame: frame - 13, fps, durationInFrames: 16, config: {damping: 200}});
  const fz = v ? 112 : 100;
  return (
    <Center>
      <div style={{fontSize: fz, fontWeight: 900, color: '#fff', transform: `scale(${interpolate(l1, [0, 1], [0.72, 1])})`, opacity: l1}}>拔掉网线。</div>
      <div style={{fontSize: fz, fontWeight: 900, color: CYAN, marginTop: 8, transform: `scale(${interpolate(l2, [0, 1], [0.72, 1])})`, opacity: l2}}>它还在认人。</div>
      <div style={{fontSize: 40, color: '#9aa9bf', marginTop: 36, opacity: interpolate(frame, [30, 46], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>AI 跑在设备本地算力上 · 断网可用</div>
    </Center>
  );
};

const Chip: React.FC<{children: React.ReactNode; i: number}> = ({children, i}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - 8 - i * 6, fps, durationInFrames: 14, config: {damping: 200}});
  return (
    <div style={{fontSize: 50, fontWeight: 750, color: '#eaf6fb', margin: '12px 0',
      transform: `translateY(${interpolate(s, [0, 1], [34, 0])}px)`, opacity: s}}>
      <span style={{color: CYAN, marginRight: 16}}>›</span>{children}
    </div>
  );
};

const FourScene: React.FC = () => {
  const frame = useCurrentFrame();
  const items = ['行车记录仪', '安防摄像头', '人形机器人', '智能眼镜'];
  return (
    <Center>
      <div style={{fontSize: 72, fontWeight: 900, color: '#fff', marginBottom: 30}}>
        4 个客户 · 4 个领域,<span style={{color: CYAN}}>都量产了</span>
      </div>
      {items.map((t, i) => (<Chip key={t} i={i}>{t}</Chip>))}
    </Center>
  );
};

const Big: React.FC<{n: string; unit: string; label: string; delay: number}> = ({n, unit, label, delay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - delay, fps, durationInFrames: 16, config: {damping: 200}});
  return (
    <div style={{margin: '14px 0', transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`, opacity: s}}>
      <span style={{fontSize: 108, fontWeight: 900, color: '#fff'}}>{n}</span>
      <span style={{fontSize: 46, fontWeight: 800, color: CYAN, marginLeft: 8}}>{unit}</span>
      <span style={{fontSize: 38, color: '#9aa9bf', marginLeft: 18}}>{label}</span>
    </div>
  );
};

const StatsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const big = Math.round(interpolate(frame, [6, 34], [0, 15], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  return (
    <Center>
      <div style={{fontSize: 58, fontWeight: 850, color: '#cfeaf2', marginBottom: 18}}>真机量产 · 不是 PPT</div>
      <Big n={'~' + big} unit="万台/月" label="量产出货" delay={6} />
      <Big n="2" unit="个月" label="单项目跑通上线" delay={20} />
      <Big n="17" unit="年" label="安防摄像头深度" delay={32} />
    </Center>
  );
};

const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useV();
  const s = spring({frame, fps, durationInFrames: 18, config: {damping: 200}});
  return (
    <Center>
      <div style={{fontSize: v ? 84 : 78, fontWeight: 900, color: '#fff', lineHeight: 1.18,
        transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s}}>
        你的设备,也能装上<br /><span style={{color: CYAN}}>这套 AI</span>。
      </div>
      <div style={{fontSize: 48, color: '#fff', marginTop: 44, opacity: interpolate(frame, [22, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        微信 <b style={{color: CYAN}}>13826173658</b>
      </div>
      <div style={{fontSize: 38, color: '#9aa9bf', marginTop: 10, opacity: interpolate(frame, [30, 48], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        深圳 · 17 年安防 · 只解别人做不出的硬题
      </div>
    </Center>
  );
};

export const Promo: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: BG, fontFamily}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={D.hook}><HookScene /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={D.detect}><MediaVideo /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={D.live}><MediaImage src="live.png" title={<><span style={{color: CYAN}}>WebRTC</span> 远程实时直播</>} sub="多路同屏 · 随时随地看" /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={D.chat}><MediaImage src="chat.png" title={<>视觉大模型<span style={{color: CYAN}}>对话</span></>} sub="看懂画面 · 读出画面里的字" /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={D.play}><MediaImage src="playback.png" title={<>本地 / 云端<span style={{color: CYAN}}>回放</span></>} sub="多路同步 · 24h 时间轴" /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={D.four}><FourScene /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={D.stats}><StatsScene /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={D.cta}><CtaScene /></TransitionSeries.Sequence>
      </TransitionSeries>
      <Audio src={staticFile('bgm.mp3')} volume={(f) => interpolate(f, [0, 18, TOTAL - 45, TOTAL], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
    </AbsoluteFill>
  );
};
