import React from 'react';
import {AbsoluteFill, useVideoConfig, useCurrentFrame, interpolate, spring, Audio, staticFile, Sequence} from 'remotion';
import {loadFont} from '@remotion/google-fonts/NotoSansSC';
import {CYAN} from './Promo';

const {fontFamily} = loadFont();
const BG = '#0a0e17';
const RED = '#ef4444';
const GOLD = '#f5c451';
const GREEN = '#34d399';
export const ANIM_DUR = 384; // 12.8s @30

const useV = () => {
  const {width, height} = useVideoConfig();
  return height > width;
};

// ---------- device icons (viewBox 100x100) ----------
const Camera: React.FC<{c?: string}> = ({c = CYAN}) => (
  <g fill="none" stroke={c} strokeWidth={4} strokeLinejoin="round">
    <rect x={16} y={34} width={68} height={44} rx={9} />
    <rect x={34} y={24} width={20} height={12} rx={3} />
    <circle cx={50} cy={56} r={14} />
    <circle cx={50} cy={56} r={5} fill={c} />
    <circle cx={73} cy={45} r={2.5} fill={c} stroke="none" />
  </g>
);
const Robot: React.FC<{c?: string}> = ({c = CYAN}) => (
  <g fill="none" stroke={c} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
    <line x1={50} y1={14} x2={50} y2={28} />
    <circle cx={50} cy={12} r={4} fill={c} stroke="none" />
    <rect x={22} y={28} width={56} height={50} rx={14} />
    <circle cx={39} cy={50} r={6.5} fill={c} stroke="none" />
    <circle cx={61} cy={50} r={6.5} fill={c} stroke="none" />
    <rect x={40} y={62} width={20} height={5} rx={2.5} fill={c} stroke="none" />
  </g>
);
const Dashcam: React.FC<{c?: string}> = ({c = CYAN}) => (
  <g fill="none" stroke={c} strokeWidth={4} strokeLinejoin="round">
    <rect x={18} y={38} width={64} height={34} rx={8} />
    <rect x={30} y={28} width={18} height={12} rx={3} />
    <circle cx={50} cy={55} r={12} />
    <circle cx={50} cy={55} r={4} fill={c} stroke="none" />
  </g>
);
const Phone: React.FC<{c?: string; children?: React.ReactNode}> = ({c = CYAN, children}) => (
  <g fill="none" stroke={c} strokeWidth={4} strokeLinejoin="round">
    <rect x={28} y={10} width={44} height={80} rx={10} />
    <rect x={34} y={18} width={32} height={58} rx={3} fill="#0e1726" />
    <circle cx={50} cy={83} r={2.6} fill={c} stroke="none" />
    {children}
  </g>
);
const Cloud: React.FC<{c?: string; fill?: string}> = ({c = CYAN, fill = 'none'}) => (
  <path d="M32 70 a17 17 0 0 1 3 -33 a22 22 0 0 1 42 5 a15 15 0 0 1 -3 28 z" fill={fill} stroke={c} strokeWidth={4} strokeLinejoin="round" />
);
const SdCard: React.FC<{c?: string; fillPct?: number}> = ({c = CYAN, fillPct = 0}) => (
  <g fill="none" stroke={c} strokeWidth={4} strokeLinejoin="round">
    <path d="M34 16 h26 l12 12 v56 h-38 z" />
    {[40, 47, 54, 61].map((x) => <line key={x} x1={x} y1={20} x2={x} y2={28} />)}
    <rect x={38} y={84 - 52 * Math.min(1, fillPct)} width={30} height={52 * Math.min(1, fillPct)} fill={GREEN} opacity={0.35} stroke="none" />
  </g>
);

const DEV = [
  {key: 'camera', label: '摄像头', C: Camera},
  {key: 'robot', label: '人形机器人', C: Robot},
  {key: 'dashcam', label: '行车记录仪', C: Dashcam},
];

// cycling device with crossfade
const CyclingDevice: React.FC<{size: number; period: number; only?: number[]}> = ({size, period, only}) => {
  const frame = useCurrentFrame();
  const list = only ? only.map((i) => DEV[i]) : DEV;
  const idx = Math.floor(frame / period) % list.length;
  const within = frame % period;
  const fadeIn = interpolate(within, [0, 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fadeOut = interpolate(within, [period - 10, period], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const D = list[idx].C;
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: fadeIn * fadeOut}}>
      <svg width={size} height={size} viewBox="0 0 100 100"><D /></svg>
      <div style={{fontSize: 32, color: '#9fb3c8', marginTop: 10}}>场景:{list[idx].label}</div>
    </div>
  );
};

const AudioBars: React.FC<{c: string; n?: number}> = ({c, n = 7}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 7, height: 90}}>
      {Array.from({length: n}).map((_, i) => {
        const h = 18 + 60 * (0.5 + 0.5 * Math.sin((frame / 4) + i * 0.9));
        return <div key={i} style={{width: 10, height: h, borderRadius: 6, background: c, opacity: 0.9}} />;
      })}
    </div>
  );
};

const Title: React.FC<{t: string; sub: string}> = ({t, sub}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useV();
  const s = spring({frame, fps, durationInFrames: 18, config: {damping: 200}});
  return (
    <div style={{position: 'absolute', top: v ? 150 : 80, left: 0, right: 0, textAlign: 'center', transform: `translateY(${interpolate(s, [0, 1], [-30, 0])}px)`, opacity: s}}>
      <div style={{fontSize: v ? 80 : 72, fontWeight: 900, color: '#fff'}}>{t}</div>
      <div style={{fontSize: v ? 40 : 38, color: CYAN, marginTop: 14, fontWeight: 700}}>{sub}</div>
    </div>
  );
};

const Caption: React.FC<{children: React.ReactNode}> = ({children}) => {
  const v = useV();
  return <div style={{position: 'absolute', bottom: v ? 200 : 90, left: 0, right: 0, textAlign: 'center', fontSize: v ? 44 : 40, color: '#cfeaf2', padding: '0 80px'}}>{children}</div>;
};

const Stage: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>{children}</AbsoluteFill>
);

const Shell: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{backgroundColor: BG, fontFamily, backgroundImage: 'radial-gradient(60% 50% at 50% 30%, rgba(34,211,238,.12), transparent 60%)'}}>
      {children}
      <Audio src={staticFile('bgm.mp3')} volume={(f) => interpolate(f, [0, 18, ANIM_DUR - 45, ANIM_DUR], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
    </AbsoluteFill>
  );
};

// ---------- 1. 远程对讲 ----------
export const RemoteTalk: React.FC = () => {
  const frame = useCurrentFrame();
  const v = useV();
  const gap = v ? 60 : 130;
  const dots = 5;
  return (
    <Shell>
      <Title t="远程音视频对讲" sub="随时随地 · 看得见,也说得上" />
      <Stage>
        <div style={{display: 'flex', alignItems: 'center', gap, transform: `scale(${v ? 1.05 : 1.25})`}}>
          <svg width={220} height={220} viewBox="0 0 100 100"><Phone /></svg>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: v ? 260 : 360, position: 'relative'}}>
            <AudioBars c={CYAN} />
            <div style={{position: 'relative', width: '100%', height: 6, background: 'rgba(34,211,238,.2)', borderRadius: 3}}>
              {Array.from({length: dots}).map((_, i) => {
                const p = ((frame / 2 + i * (100 / dots)) % 100) / 100;
                return <div key={i} style={{position: 'absolute', left: `${p * 100}%`, top: -5, width: 16, height: 16, borderRadius: 8, background: CYAN, boxShadow: `0 0 12px ${CYAN}`}} />;
              })}
            </div>
            <div style={{fontSize: 30, fontWeight: 800, color: '#06121a', background: RED, borderRadius: 999, padding: '6px 18px'}}>● LIVE 实时</div>
          </div>
          <CyclingDevice size={230} period={128} />
        </div>
      </Stage>
      <Caption>手机一点,实时看现场画面 + 双向对讲喊话</Caption>
    </Shell>
  );
};

// ---------- 2. 本地录像 ----------
export const LocalRec: React.FC = () => {
  const frame = useCurrentFrame();
  const v = useV();
  const blink = Math.sin(frame / 5) > 0;
  const cyc = frame % 128;
  const evt = cyc > 50 && cyc < 95; // 异常事件高亮
  const clipY = interpolate(cyc, [95, 120], [0, 220], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const clipOp = interpolate(cyc, [95, 100, 116, 120], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const tc = Math.floor(frame / 30);
  const hh = String(Math.floor(tc / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(tc / 60) % 60).padStart(2, '0');
  const ss = String(tc % 60).padStart(2, '0');
  return (
    <Shell>
      <Title t="本地录像" sub="精彩瞬间记录 · 异常事件留证据" />
      <Stage>
        <div style={{display: 'flex', alignItems: 'center', gap: v ? 80 : 160, transform: `scale(${v ? 1.05 : 1.25})`}}>
          <div style={{position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            {/* REC */}
            <div style={{position: 'absolute', top: -54, display: 'flex', alignItems: 'center', gap: 10, opacity: blink ? 1 : 0.35}}>
              <div style={{width: 16, height: 16, borderRadius: 8, background: RED}} />
              <span style={{fontSize: 30, fontWeight: 800, color: RED}}>REC {hh}:{mm}:{ss}</span>
            </div>
            <div style={{position: 'relative', padding: 14, borderRadius: 18, border: `3px solid ${evt ? GOLD : 'transparent'}`, boxShadow: evt ? `0 0 30px ${GOLD}` : 'none'}}>
              <CyclingDevice size={230} period={128} />
              {evt && <div style={{position: 'absolute', top: 6, left: 6, fontSize: 24, fontWeight: 800, color: '#06121a', background: GOLD, borderRadius: 6, padding: '2px 10px'}}>⚠ 异常事件</div>}
            </div>
          </div>
          {/* clip -> SD */}
          <div style={{position: 'relative', width: 200, height: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center'}}>
            <div style={{position: 'absolute', top: clipY, opacity: clipOp, width: 120, height: 76, borderRadius: 10, background: 'linear-gradient(135deg,#173142,#0e1726)', border: `2px solid ${CYAN}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: CYAN, fontSize: 26, fontWeight: 800}}>▶ 片段</div>
            <svg width={150} height={150} viewBox="0 0 100 100"><SdCard fillPct={(frame % 384) / 384} /></svg>
          </div>
        </div>
      </Stage>
      <Caption>每个精彩/异常瞬间,都被本地存成可回看的证据</Caption>
    </Shell>
  );
};

// ---------- 3. 云存储(行车记录仪主角)----------
export const CloudRec: React.FC = () => {
  const frame = useCurrentFrame();
  const v = useV();
  const lostStart = 250;
  const lost = frame > lostStart;
  const shake = (frame > 236 && frame < 264) ? Math.sin(frame * 1.7) * 8 : 0;
  const devOp = lost ? interpolate(frame, [lostStart, lostStart + 40], [1, 0.15], {extrapolateRight: 'clamp'}) : 1;
  const xOp = lost ? interpolate(frame, [lostStart + 5, lostStart + 35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const cap = frame < 226
    ? '行车记录仪边开边录,关键画面实时传云端'
    : frame < 296
      ? '一次剐蹭 / 被拆走……记录仪没了'
      : '但录像早已上云——随时调取,留证不丢';
  return (
    <Shell>
      <Title t="云存储录像" sub="行车记录仪丢了,云端录像还在" />
      <Stage>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transform: `scale(${v ? 1.05 : 1.2})`}}>
          <div style={{position: 'relative'}}>
            <svg width={300} height={210} viewBox="0 0 100 80"><Cloud fill="rgba(34,211,238,.08)" /></svg>
            <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 18}}>
              {[0, 1, 2].map((i) => {
                const on = frame > 60 + i * 30;
                return <div key={i} style={{width: 30, height: 22, borderRadius: 5, background: on ? GREEN : 'rgba(255,255,255,.12)', boxShadow: on ? `0 0 12px ${GREEN}` : 'none'}} />;
              })}
            </div>
          </div>
          <div style={{height: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', opacity: lost ? interpolate(frame, [lostStart, lostStart + 35], [1, 0], {extrapolateRight: 'clamp'}) : 1}}>
            {[0, 1, 2].map((i) => {
              const p = ((frame / 2 + i * 22) % 66) / 66;
              return <div key={i} style={{fontSize: 40, color: CYAN, opacity: 1 - p, transform: `translateY(${-p * 40}px)`}}>↑</div>;
            })}
          </div>
          <div style={{position: 'relative', opacity: devOp, transform: `translateX(${shake}px)`}}>
            <svg width={210} height={210} viewBox="0 0 100 100"><Dashcam /></svg>
            <div style={{position: 'absolute', top: 30, left: 0, right: 0, textAlign: 'center', fontSize: 130, color: RED, fontWeight: 900, opacity: xOp, lineHeight: 1}}>✕</div>
            <div style={{textAlign: 'center', fontSize: 32, color: '#9fb3c8', marginTop: 6}}>场景:行车记录仪</div>
          </div>
        </div>
      </Stage>
      <Caption>{cap}</Caption>
    </Shell>
  );
};
