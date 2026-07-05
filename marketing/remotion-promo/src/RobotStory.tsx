import React from 'react';
import {AbsoluteFill, useVideoConfig, useCurrentFrame, interpolate, spring, Audio, staticFile} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {loadFont} from '@remotion/google-fonts/NotoSansSC';

const {fontFamily} = loadFont();
const CYAN = '#22d3ee';
const RW = '#e6eef8';
const RED = '#ef4444';
const GOLD = '#f5c451';
const GREEN = '#34d399';
const PERSON = '#6b7f97';

const A1 = 240, A2 = 240, A3 = 270, T = 15;
export const STORY_DUR = A1 + A2 + A3 - 2 * T;

const useV = () => { const {width, height} = useVideoConfig(); return height > width; };

// ---- humanoid robot (viewBox 0 0 120 200) ----
const RobotMan: React.FC<{wave?: number}> = ({wave = 0}) => (
  <g fill="none" stroke={RW} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
    <line x1={60} y1={2} x2={60} y2={12} /><circle cx={60} cy={1} r={3.5} fill={CYAN} stroke="none" />
    <rect x={40} y={12} width={40} height={34} rx={12} />
    <circle cx={51} cy={29} r={4} fill={CYAN} stroke="none" /><circle cx={69} cy={29} r={4} fill={CYAN} stroke="none" />
    <line x1={60} y1={46} x2={60} y2={52} />
    <rect x={34} y={52} width={52} height={62} rx={16} />
    <rect x={45} y={64} width={30} height={26} rx={4} fill="#0e1726" stroke={CYAN} strokeWidth={2.5} />
    {[0, 1, 2, 3].map((i) => { const h = 4 + 14 * (0.5 + 0.5 * Math.sin(wave / 4 + i)); return <rect key={i} x={49 + i * 6} y={77 - h / 2} width={3.5} height={h} rx={1.5} fill={CYAN} stroke="none" />; })}
    <path d="M36 60 L24 96" /><circle cx={23} cy={99} r={4} fill={RW} stroke="none" />
    <path d="M84 60 L96 96" /><circle cx={97} cy={99} r={4} fill={RW} stroke="none" />
    <path d="M50 114 L48 178" /><path d="M70 114 L72 178" />
    <line x1={42} y1={180} x2={54} y2={180} /><line x1={66} y1={180} x2={78} y2={180} />
  </g>
);

const PersonFig: React.FC<{c?: string}> = ({c = PERSON}) => (
  <g fill={c}>
    <circle cx={40} cy={26} r={16} />
    <path d="M22 60 Q40 44 58 60 L54 130 Q40 138 26 130 Z" />
    <rect x={28} y={128} width={9} height={56} rx={4} /><rect x={43} y={128} width={9} height={56} rx={4} />
  </g>
);

const Cloud: React.FC = () => (
  <path d="M30 66 a16 16 0 0 1 3 -31 a21 21 0 0 1 40 5 a14 14 0 0 1 -3 26 z" fill="rgba(34,211,238,.08)" stroke={CYAN} strokeWidth={4} strokeLinejoin="round" />
);

const Sky: React.FC<{night?: boolean}> = ({night}) => (
  <AbsoluteFill>
    <AbsoluteFill style={{background: night
      ? 'linear-gradient(180deg,#070b18 0%,#0c1430 55%,#0a0e17 100%)'
      : 'linear-gradient(180deg,#10243a 0%,#1b3a52 40%,#2a2238 75%,#1a1422 100%)'}} />
    {/* sun/moon */}
    <div style={{position: 'absolute', top: '16%', left: '64%', width: 130, height: 130, borderRadius: '50%', background: night ? 'radial-gradient(circle,#cfe0f5,#7f93b5)' : 'radial-gradient(circle,#ffd9a0,#ff9d5c)', filter: 'blur(2px)', opacity: night ? 0.85 : 0.95, boxShadow: night ? '0 0 60px #6b7fb0' : '0 0 90px #ff9d5c'}} />
    {/* skyline silhouettes */}
    <svg style={{position: 'absolute', bottom: '28%', left: 0, width: '100%', height: 220}} viewBox="0 0 1000 220" preserveAspectRatio="none">
      <g fill={night ? '#05080f' : '#0a1018'} opacity={0.92}>
        <rect x={60} y={90} width={70} height={130} /><rect x={150} y={50} width={54} height={170} /><rect x={230} y={110} width={80} height={110} />
        <rect x={760} y={70} width={60} height={150} /><rect x={840} y={100} width={80} height={120} /><rect x={690} y={120} width={50} height={100} />
        <path d="M360 220 q30 -70 60 0 Z" /><path d="M620 220 q26 -60 52 0 Z" />
      </g>
    </svg>
    {/* ground */}
    <AbsoluteFill style={{top: '72%', background: night ? 'linear-gradient(180deg,#0a1322,#070b13)' : 'linear-gradient(180deg,#161b26,#0b0f18)'}} />
    <div style={{position: 'absolute', top: '72%', left: 0, right: 0, height: 3, background: 'rgba(34,211,238,.25)'}} />
  </AbsoluteFill>
);

const Bubble: React.FC<{x: string; y: string; show: [number, number]; c?: string; children: React.ReactNode}> = ({x, y, show, c = CYAN, children}) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [show[0], show[0] + 8, show[1] - 8, show[1]], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const s = interpolate(frame, [show[0], show[0] + 10], [0.8, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) scale(${s})`, opacity: op, background: '#0e1726', border: `2px solid ${c}`, color: '#eaf2fb', fontSize: 34, fontWeight: 700, padding: '14px 22px', borderRadius: 18, whiteSpace: 'nowrap'}}>{children}</div>;
};

const Title: React.FC<{t: string; tag: string}> = ({t, tag}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const v = useV();
  const s = spring({frame, fps, durationInFrames: 16, config: {damping: 200}});
  return <div style={{position: 'absolute', top: v ? 130 : 70, left: 0, right: 0, textAlign: 'center', transform: `translateY(${interpolate(s, [0, 1], [-26, 0])}px)`, opacity: s}}>
    <span style={{fontSize: 30, fontWeight: 800, color: '#06121a', background: CYAN, borderRadius: 999, padding: '8px 24px'}}>{tag}</span>
    <div style={{fontSize: v ? 70 : 64, fontWeight: 900, color: '#fff', marginTop: 18}}>{t}</div>
  </div>;
};
const Cap: React.FC<{children: React.ReactNode}> = ({children}) => {
  const v = useV();
  return <div style={{position: 'absolute', bottom: v ? 210 : 80, left: 0, right: 0, textAlign: 'center', fontSize: v ? 42 : 38, color: '#cfeaf2', padding: '0 80px'}}>{children}</div>;
};

// ---- ACT 1: 户外对话 + 远程对讲 ----
const Act1: React.FC = () => {
  const frame = useCurrentFrame(); const v = useV();
  const sc = v ? 2.0 : 2.4;
  return <AbsoluteFill style={{fontFamily}}><Sky />
    <Title tag="① 户外 · 对话" t="机器人当面对话,也能远程对讲" />
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div style={{position: 'relative', display: 'flex', alignItems: 'flex-end', gap: v ? 70 : 150, transform: `scale(${sc}) translateY(28px)`}}>
        <svg width={120} height={200} viewBox="0 0 120 200"><RobotMan wave={frame} /></svg>
        <svg width={80} height={188} viewBox="0 0 80 200"><PersonFig /></svg>
      </div>
      <Bubble x="38%" y={v ? '40%' : '34%'} show={[20, 110]}>你好,需要帮忙吗?</Bubble>
      <Bubble x="64%" y={v ? '46%' : '42%'} show={[120, 210]} c={PERSON}>帮我看下后门</Bubble>
      {/* remote tablet inset */}
      <div style={{position: 'absolute', top: v ? '60%' : '20%', right: v ? '8%' : '12%', opacity: interpolate(frame, [120, 145], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        <div style={{width: 200, height: 140, borderRadius: 14, border: `3px solid ${CYAN}`, background: '#0a121d', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 24px rgba(34,211,238,.4)`}}>
          <svg width={50} height={84} viewBox="0 0 120 200"><RobotMan wave={frame * 1.3} /></svg>
          <div style={{position: 'absolute', top: 8, left: 10, fontSize: 18, color: RED, fontWeight: 800}}>● LIVE</div>
        </div>
        <div style={{textAlign: 'center', fontSize: 26, color: CYAN, marginTop: 8, fontWeight: 700}}>📱 远程对讲</div>
      </div>
    </AbsoluteFill>
    <Cap>走到跟前能聊,远在天边也能通过它喊话</Cap>
  </AbsoluteFill>;
};

// ---- ACT 2: 突发事件 · 自动录像 ----
const Act2: React.FC = () => {
  const frame = useCurrentFrame(); const v = useV();
  const sc = v ? 2.0 : 2.4;
  const fall = interpolate(frame, [70, 100], [0, 78], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const boxOp = interpolate(frame, [100, 116], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const blink = Math.sin(frame / 5) > 0;
  const tc = Math.floor(frame / 30); const ss = String(tc % 60).padStart(2, '0');
  return <AbsoluteFill style={{fontFamily}}><Sky />
    <Title tag="② 突发 · 录像" t="突发事件,自动记录留证" />
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      {/* REC */}
      <div style={{position: 'absolute', top: v ? '30%' : '24%', left: 0, right: 0, textAlign: 'center', opacity: blink ? 1 : 0.4}}>
        <span style={{fontSize: 34, fontWeight: 800, color: RED}}>● REC  00:00:{ss}</span>
      </div>
      <div style={{position: 'relative', display: 'flex', alignItems: 'flex-end', gap: v ? 60 : 130, transform: `scale(${sc}) translateY(28px)`}}>
        <svg width={120} height={200} viewBox="0 0 120 200"><RobotMan wave={frame * 2} /></svg>
        <div style={{position: 'relative', transformOrigin: 'bottom center', transform: `rotate(${fall}deg)`}}>
          <svg width={80} height={188} viewBox="0 0 80 200"><PersonFig c="#7d6a6a" /></svg>
        </div>
      </div>
      {/* detection box on fallen person */}
      <div style={{position: 'absolute', left: v ? '57%' : '56%', top: v ? '54%' : '52%', width: v ? 230 : 260, height: 120, border: `4px solid ${GOLD}`, borderRadius: 6, boxShadow: `0 0 20px ${GOLD}`, opacity: boxOp}}>
        <span style={{position: 'absolute', top: -34, left: 0, fontSize: 22, fontWeight: 800, color: '#06121a', background: GOLD, padding: '2px 10px', borderRadius: 5}}>person · fall 92%</span>
      </div>
    </AbsoluteFill>
    <Cap>有人摔倒/异常,机器人立刻锁定并录下证据</Cap>
  </AbsoluteFill>;
};

// ---- ACT 3: 存储坏 · 云端留存 ----
const Act3: React.FC = () => {
  const frame = useCurrentFrame(); const v = useV();
  const sc = v ? 1.9 : 2.2;
  const tilt = interpolate(frame, [40, 80], [0, 22], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const devOp = interpolate(frame, [150, 200], [1, 0.3], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{fontFamily}}><Sky night />
    <Title tag="③ 损坏 · 留存" t="存储坏了/丢了,云端还在" />
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      {/* cloud */}
      <div style={{position: 'absolute', top: v ? '26%' : '20%'}}>
        <svg width={260} height={180} viewBox="0 0 100 70"><Cloud /></svg>
        <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 14}}>
          {[0, 1, 2].map((i) => { const on = frame > 50 + i * 22; return <div key={i} style={{width: 26, height: 18, borderRadius: 4, background: on ? GREEN : 'rgba(255,255,255,.12)', boxShadow: on ? `0 0 10px ${GREEN}` : 'none'}} />; })}
        </div>
      </div>
      {/* data streams rising */}
      <div style={{position: 'absolute', top: v ? '42%' : '40%', display: 'flex', gap: 26, opacity: interpolate(frame, [150, 195], [1, 0.15], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        {[0, 1, 2].map((i) => { const p = ((frame / 2 + i * 18) % 54) / 54; return <div key={i} style={{fontSize: 38, color: CYAN, opacity: 1 - p, transform: `translateY(${-p * 60}px)`}}>↑</div>; })}
      </div>
      {/* damaged robot */}
      <div style={{position: 'relative', transform: `scale(${sc}) translateY(40px) rotate(${tilt}deg)`, transformOrigin: 'bottom center', opacity: devOp}}>
        <svg width={120} height={200} viewBox="0 0 120 200"><RobotMan wave={0} /></svg>
        {frame > 45 && frame < 150 && [0, 1, 2, 3, 4].map((i) => {
          const t2 = (frame * 1.3 + i * 7) % 20; const px = 84 + Math.sin(i * 2) * 10; const py = 70 + t2 * 1.5;
          return <div key={i} style={{position: 'absolute', left: px, top: py, width: 5, height: 5, borderRadius: 3, background: GOLD, opacity: 1 - t2 / 20, boxShadow: `0 0 6px ${GOLD}`}} />;
        })}
      </div>
    </AbsoluteFill>
    <Cap>{frame > 200 ? '机器人没了,录像早已上云——随时调取' : '边巡边录,关键画面实时传云端'}</Cap>
  </AbsoluteFill>;
};

export const RobotStory: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#0a0e17', fontFamily}}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={A1}><Act1 /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
      <TransitionSeries.Sequence durationInFrames={A2}><Act2 /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
      <TransitionSeries.Sequence durationInFrames={A3}><Act3 /></TransitionSeries.Sequence>
    </TransitionSeries>
    <Audio src={staticFile('bgm.mp3')} volume={(f) => interpolate(f, [0, 18, STORY_DUR - 45, STORY_DUR], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
  </AbsoluteFill>
);
