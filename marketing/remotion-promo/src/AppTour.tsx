import React from 'react';
import {AbsoluteFill, useVideoConfig, useCurrentFrame, interpolate, spring, staticFile} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {Audio} from 'remotion';
import {loadFont} from '@remotion/google-fonts/NotoSansSC';
import {MediaImage, Center, CYAN} from './Promo';

const {fontFamily} = loadFont();
const BG = '#0a0e17';
const T = 12;

const FEATURES: {src: string; title: React.ReactNode; sub: string}[] = [
  {src: 'devlist.png', title: <>设备列表</>, sub: '多设备统一管理 · 一眼掌握全部'},
  {src: 'live.png', title: <><span style={{color: CYAN}}>WebRTC</span> 实时直播</>, sub: '多路同屏 · 远程随时随地看'},
  {src: 'detect.png', title: <>设备端 <span style={{color: CYAN}}>AI 检测</span></>, sub: 'YOLO 实时画框 · 全在本地算力'},
  {src: 'chat.png', title: <>视觉大模型<span style={{color: CYAN}}>对话</span></>, sub: '看懂画面 · 读出画面里的字'},
  {src: 'playback.png', title: <>本地<span style={{color: CYAN}}>回放</span></>, sub: '多路同步 · 24h 时间轴'},
  {src: 'cloud.png', title: <>云端<span style={{color: CYAN}}>回放</span></>, sub: '事件录像上云 · 可检索'},
  {src: 'record.png', title: <>录像模式全</>, sub: '循环 / 缩时 / 预录 / 事件 · 不丢录像'},
  {src: 'ota.png', title: <><span style={{color: CYAN}}>OTA</span> 在线升级</>, sub: '出货后远程统一升级 · 不召回'},
  {src: 'region.png', title: <>全球部署</>, sub: '美洲 / 亚洲 / 欧洲 · 就近接入'},
];

const D_TITLE = 66;
const D_FEAT = 78;
const D_OUTRO = 96;
export const APP_TOTAL = D_TITLE + FEATURES.length * D_FEAT + D_OUTRO - (FEATURES.length + 1) * T;

const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useVideoConfig().height > useVideoConfig().width;
  const s = spring({frame, fps, durationInFrames: 18, config: {damping: 200}});
  return (
    <Center>
      <div style={{fontSize: 40, letterSpacing: 6, color: CYAN, fontWeight: 700, opacity: interpolate(frame, [6, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>APP · 功能总览</div>
      <div style={{fontSize: v ? 96 : 88, fontWeight: 900, color: '#fff', marginTop: 18, lineHeight: 1.16,
        transform: `scale(${interpolate(s, [0, 1], [0.82, 1])})`, opacity: s}}>
        一部手机,<br /><span style={{color: CYAN}}>看穿你的设备</span>
      </div>
      <div style={{fontSize: 40, color: '#9aa9bf', marginTop: 30, opacity: interpolate(frame, [26, 42], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>实时 · AI · 回放 · 运维,一套搞定</div>
    </Center>
  );
};

const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useVideoConfig().height > useVideoConfig().width;
  const s = spring({frame, fps, durationInFrames: 18, config: {damping: 200}});
  return (
    <Center>
      <div style={{fontSize: v ? 80 : 74, fontWeight: 900, color: '#fff', lineHeight: 1.2,
        transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s}}>
        整套 App,<span style={{color: CYAN}}>白标成你的品牌</span>
      </div>
      <div style={{fontSize: 46, color: '#fff', marginTop: 40, opacity: interpolate(frame, [22, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>微信 <b style={{color: CYAN}}>13826173658</b></div>
      <div style={{fontSize: 36, color: '#9aa9bf', marginTop: 10, opacity: interpolate(frame, [30, 48], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>深圳 · 17 年安防 · 设备端 AI 视觉全栈</div>
    </Center>
  );
};

const T_ = () => (<TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />);

export const AppTour: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: BG, fontFamily}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={D_TITLE}><TitleScene /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        {FEATURES.map((f, i) => (
          <React.Fragment key={f.src}>
            <TransitionSeries.Sequence durationInFrames={D_FEAT}>
              <MediaImage src={f.src} title={f.title} sub={f.sub} />
            </TransitionSeries.Sequence>
            <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
          </React.Fragment>
        ))}
        <TransitionSeries.Sequence durationInFrames={D_OUTRO}><OutroScene /></TransitionSeries.Sequence>
      </TransitionSeries>
      <Audio src={staticFile('bgm.mp3')} volume={(f) => interpolate(f, [0, 18, APP_TOTAL - 45, APP_TOTAL], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
    </AbsoluteFill>
  );
};
