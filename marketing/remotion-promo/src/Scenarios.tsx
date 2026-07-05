import React from 'react';
import {AbsoluteFill, useVideoConfig, useCurrentFrame, interpolate, spring, Img, Audio, staticFile} from 'remotion';
import {Video} from '@remotion/media';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {loadFont} from '@remotion/google-fonts/NotoSansSC';
import {Center, CYAN} from './Promo';

const {fontFamily} = loadFont();
const BG = '#0a0e17';
const T = 12;
const D = {hook: 90, seg: 162, close: 114, cta: 120};

type Media = {type: 'video'; src: string; from: number; to: number} | {type: 'img'; src: string};

const useV = () => {
  const {width, height} = useVideoConfig();
  return height > width;
};

const ScenarioSeg: React.FC<{media: Media; label: string; title: React.ReactNode; sub: string; chips: string[]}> = ({media, label, title, sub, chips}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useV();
  const ct = spring({frame, fps, durationInFrames: 16, config: {damping: 200}});
  const lt = spring({frame: frame - 4, fps, durationInFrames: 18, config: {damping: 200}});
  const ltY = interpolate(lt, [0, 1], [55, 0]);
  const scale = interpolate(frame, [0, D.seg], [1.03, 1.12]);
  const bgStyle: React.CSSProperties = {position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(45px) brightness(0.4)', transform: 'scale(1.25)'};
  const fgStyle: React.CSSProperties = {maxWidth: v ? '86%' : 'auto', maxHeight: v ? '60%' : '80%', objectFit: 'contain', borderRadius: 24, boxShadow: '0 30px 80px rgba(0,0,0,.6)'};
  const vid = (style: React.CSSProperties) => media.type === 'video'
    ? <Video src={staticFile(media.src)} trimBefore={Math.round(media.from * fps)} trimAfter={Math.round(media.to * fps)} volume={0} style={style} />
    : null;
  const Bg = media.type === 'video' ? vid(bgStyle) : <Img src={staticFile(media.src)} style={bgStyle} />;
  const Fg = media.type === 'video' ? vid(fgStyle) : <Img src={staticFile(media.src)} style={{...fgStyle, transform: `scale(${scale})`}} />;
  return (
    <AbsoluteFill style={{backgroundColor: BG}}>
      {Bg}
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: v ? '130px 0 400px' : '80px 0 70px'}}>{Fg}</AbsoluteFill>
      <AbsoluteFill style={{alignItems: 'center', paddingTop: v ? 76 : 48}}>
        <div style={{opacity: ct, transform: `translateY(${interpolate(ct, [0, 1], [-22, 0])}px)`, fontSize: v ? 36 : 32, fontWeight: 800, color: '#06121a', background: CYAN, borderRadius: 999, padding: '10px 30px', boxShadow: '0 8px 26px rgba(34,211,238,.35)'}}>{label}</div>
      </AbsoluteFill>
      <AbsoluteFill style={{justifyContent: 'flex-end'}}>
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: v ? 640 : 430, background: 'linear-gradient(0deg, rgba(7,10,17,.96) 18%, rgba(7,10,17,.45) 58%, transparent)'}} />
        <div style={{position: 'relative', padding: v ? '0 70px 200px' : '0 96px 66px', textAlign: v ? 'center' : 'left', transform: `translateY(${ltY}px)`, opacity: interpolate(frame, [4, 16], [0, 1], {extrapolateRight: 'clamp'})}}>
          <div style={{fontSize: v ? 76 : 72, fontWeight: 900, color: '#fff', lineHeight: 1.16, textShadow: '0 6px 30px rgba(0,0,0,.6)'}}>{title}</div>
          <div style={{fontSize: v ? 40 : 38, color: '#cfeaf2', marginTop: 16}}>{sub}</div>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 22, justifyContent: v ? 'center' : 'flex-start'}}>
            {chips.map((c, i) => {
              const s = spring({frame: frame - 18 - i * 5, fps, durationInFrames: 12, config: {damping: 200}});
              return <span key={c} style={{opacity: s, transform: `translateY(${interpolate(s, [0, 1], [16, 0])}px)`, fontSize: 30, color: CYAN, background: 'rgba(34,211,238,.1)', border: '1px solid rgba(34,211,238,.3)', borderRadius: 10, padding: '8px 16px'}}>{c}</span>;
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SCENES: {media: Media; label: string; title: React.ReactNode; sub: string; chips: string[]}[] = [
  {media: {type: 'video', src: 'aidetect.mp4', from: 30, to: 34.4}, label: '场景 ①  行车记录仪 / 车队', title: <>记录仪算力低,<span style={{color: CYAN}}>AI 还能断网跑</span></>, sub: '端侧识别,不连云、掉电不丢录像', chips: ['低算力端侧 AI', '掉电不丢录像', '预录 / 缩时']},
  {media: {type: 'img', src: 'detect.png'}, label: '场景 ②  安防摄像头 / 园区周界', title: <>不止数人头,<span style={{color: CYAN}}>看懂现场</span></>, sub: '识别人车 · 读出招牌车牌 · 断网不泄露', chips: ['人车识别', '画面读字 OCR', '断网不泄露']},
  {media: {type: 'img', src: 'live.png'}, label: '场景 ③  人形机器人 / 巡检', title: <>边缘实时视觉,<span style={{color: CYAN}}>直连 ROS</span></>, sub: '本地实时推流 ~300ms · 融进机器人感知', chips: ['边缘实时视觉', 'Foxglove / ROS', '工业级稳定']},
  {media: {type: 'img', src: 'chat.png'}, label: '场景 ④  智能眼镜 / 第一视角', title: <>看着画面,<span style={{color: CYAN}}>直接问它</span></>, sub: '看懂场景 · 读出文字 · 断网也能跑', chips: ['视觉大模型对话', '画面读字', '断网可跑']},
];

const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useV();
  const l1 = spring({frame, fps, durationInFrames: 16, config: {damping: 200}});
  const l2 = spring({frame: frame - 13, fps, durationInFrames: 16, config: {damping: 200}});
  return (
    <Center>
      <div style={{fontSize: v ? 60 : 56, color: '#9aa9bf', fontWeight: 700, opacity: l1, transform: `translateY(${interpolate(l1, [0, 1], [24, 0])}px)`}}>从车上、墙上,到机器人、眼镜——</div>
      <div style={{fontSize: v ? 100 : 94, fontWeight: 900, color: '#fff', marginTop: 22, lineHeight: 1.16, transform: `scale(${interpolate(l2, [0, 1], [0.8, 1])})`, opacity: l2}}>这套 AI,<span style={{color: CYAN}}>都装得进去</span>。</div>
    </Center>
  );
};

const CloseScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, durationInFrames: 18, config: {damping: 200}});
  return (
    <Center>
      <div style={{fontSize: 78, fontWeight: 900, color: '#fff', lineHeight: 1.2, transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s}}>四种设备,<br /><span style={{color: CYAN}}>同一套端侧 AI 视觉栈</span></div>
      <div style={{fontSize: 44, color: '#cfeaf2', marginTop: 34, opacity: interpolate(frame, [22, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>月出货 <b style={{color: CYAN}}>~15 万台</b> · 单项目 <b style={{color: CYAN}}>2 个月</b>跑通</div>
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
      <div style={{fontSize: v ? 82 : 76, fontWeight: 900, color: '#fff', lineHeight: 1.18, transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s}}>你的设备,也能装上<br /><span style={{color: CYAN}}>这套 AI</span>。</div>
      <div style={{fontSize: 46, color: '#fff', marginTop: 42, opacity: interpolate(frame, [22, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>微信 <b style={{color: CYAN}}>13826173658</b></div>
      <div style={{fontSize: 36, color: '#9aa9bf', marginTop: 10, opacity: interpolate(frame, [30, 48], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>深圳 · 17 年安防 · 设备端 AI 视觉全栈</div>
    </Center>
  );
};

export const SCEN_TOTAL = D.hook + SCENES.length * D.seg + D.close + D.cta - (SCENES.length + 2) * T;

export const Scenarios: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: BG, fontFamily}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={D.hook}><HookScene /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        {SCENES.map((sc, i) => (
          <React.Fragment key={i}>
            <TransitionSeries.Sequence durationInFrames={D.seg}>
              <ScenarioSeg media={sc.media} label={sc.label} title={sc.title} sub={sc.sub} chips={sc.chips} />
            </TransitionSeries.Sequence>
            <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
          </React.Fragment>
        ))}
        <TransitionSeries.Sequence durationInFrames={D.close}><CloseScene /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={D.cta}><CtaScene /></TransitionSeries.Sequence>
      </TransitionSeries>
      <Audio src={staticFile('bgm.mp3')} volume={(f) => interpolate(f, [0, 18, SCEN_TOTAL - 45, SCEN_TOTAL], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
    </AbsoluteFill>
  );
};
