import React from 'react';
import {AbsoluteFill, useVideoConfig, useCurrentFrame, interpolate, spring, Img, Audio, staticFile} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {loadFont} from '@remotion/google-fonts/NotoSansSC';
import {Center, CYAN} from './Promo';

const {fontFamily} = loadFont();
const BG = '#0a0e17';
const T = 12;

export type KV = {k: string; v: string};
export type Feature = {
  id: string; name: string; sub: string; shot: string;
  overview: string[]; details: KV[]; tips: string[];
};

const useV = () => {
  const {width, height} = useVideoConfig();
  return height > width;
};

export const featureDuration = (f: Feature): number => {
  const title = 78;
  const ov = 54 + f.overview.length * 28;
  const de = 54 + f.details.length * 30;
  const ti = 54 + f.tips.length * 26;
  const cta = 84;
  return title + ov + de + ti + cta - 4 * T;
};

const IconCard: React.FC<{name: string}> = ({name}) => (
  <div style={{width: 600, height: 600, borderRadius: 40, background: 'linear-gradient(150deg, rgba(34,211,238,.18), rgba(14,165,183,.04)), #0e1726', border: '1px solid rgba(34,211,238,.3)', boxShadow: '0 30px 80px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 50}}>
    <div style={{width: 150, height: 150, borderRadius: 36, background: 'rgba(34,211,238,.14)', border: '2px solid rgba(34,211,238,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 44}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
        {[40, 6, 22].map((x, i) => (
          <div key={i} style={{width: 86, height: 9, borderRadius: 5, background: 'rgba(34,211,238,.85)', position: 'relative'}}>
            <div style={{position: 'absolute', top: -7, left: x, width: 23, height: 23, borderRadius: 12, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.4)'}} />
          </div>
        ))}
      </div>
    </div>
    <div style={{fontSize: 60, fontWeight: 900, color: '#fff', textAlign: 'center', lineHeight: 1.2}}>{name}</div>
    <div style={{fontSize: 32, color: '#8fa4bb', marginTop: 16, letterSpacing: 2}}>设置 · Settings</div>
  </div>
);

const SectionShell: React.FC<{tag: string; shot: string; name: string; children: React.ReactNode}> = ({tag, shot, name, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useV();
  const ct = spring({frame, fps, durationInFrames: 16, config: {damping: 200}});
  const sc = interpolate(frame, [0, 120], [1.02, 1.09]);
  const hasShot = !!shot;
  return (
    <AbsoluteFill style={{backgroundColor: BG}}>
      {hasShot
        ? <Img src={staticFile(shot)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(50px) brightness(0.32)', transform: 'scale(1.3)'}} />
        : <AbsoluteFill style={{background: 'radial-gradient(70% 60% at 50% 20%, rgba(34,211,238,.12), transparent 60%), linear-gradient(180deg,#0b1322,#0a0e17)'}} />}
      <div style={v
        ? {position: 'absolute', top: 150, left: 0, right: 0, height: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}
        : {position: 'absolute', left: 70, top: 150, width: 740, bottom: 90, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        {hasShot
          ? <Img src={staticFile(shot)} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 22, boxShadow: '0 26px 70px rgba(0,0,0,.6)', transform: `scale(${sc})`}} />
          : <div style={{transform: `scale(${interpolate(ct, [0, 1], [0.9, 1])})`, opacity: ct}}><IconCard name={name} /></div>}
      </div>
      <div style={{position: 'absolute', top: v ? 56 : 50, left: v ? 0 : 70, right: v ? 0 : undefined, textAlign: 'center', opacity: ct, transform: `translateY(${interpolate(ct, [0, 1], [-20, 0])}px)`}}>
        <span style={{fontSize: v ? 40 : 38, fontWeight: 800, color: '#06121a', background: CYAN, borderRadius: 999, padding: '10px 32px', boxShadow: '0 8px 26px rgba(34,211,238,.35)'}}>{tag}</span>
      </div>
      <div style={v
        ? {position: 'absolute', left: 0, right: 0, bottom: 0, height: 1010, background: 'linear-gradient(0deg, rgba(7,10,17,.97) 22%, rgba(7,10,17,.6) 62%, transparent)'}
        : {position: 'absolute', right: 0, top: 0, bottom: 0, width: 1010, background: 'linear-gradient(270deg, rgba(7,10,17,.97) 40%, rgba(7,10,17,.5) 80%, transparent)'}} />
      <div style={v
        ? {position: 'absolute', left: 70, right: 70, bottom: 140, display: 'flex', flexDirection: 'column', gap: 18}
        : {position: 'absolute', right: 80, top: 160, width: 880, display: 'flex', flexDirection: 'column', gap: 16}}>
        {children}
      </div>
    </AbsoluteFill>
  );
};

const Bullet: React.FC<{i: number; children: React.ReactNode}> = ({i, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - 16 - i * 6, fps, durationInFrames: 13, config: {damping: 200}});
  return (
    <div style={{display: 'flex', alignItems: 'flex-start', gap: 16, opacity: s, transform: `translateY(${interpolate(s, [0, 1], [22, 0])}px)`}}>
      <span style={{color: CYAN, fontSize: 40, lineHeight: 1, marginTop: 2}}>›</span>
      <span style={{fontSize: 38, color: '#eaf2fb', lineHeight: 1.32}}>{children}</span>
    </div>
  );
};

const KvRow: React.FC<{i: number; k: string; v: string}> = ({i, k, v}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - 16 - i * 6, fps, durationInFrames: 13, config: {damping: 200}});
  return (
    <div style={{opacity: s, transform: `translateY(${interpolate(s, [0, 1], [22, 0])}px)`}}>
      <span style={{fontSize: 38, fontWeight: 800, color: CYAN}}>{k}</span>
      <span style={{fontSize: 36, color: '#aebfd2'}}>　{v}</span>
    </div>
  );
};

const TitleScene: React.FC<{f: Feature}> = ({f}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = useV();
  const s = spring({frame, fps, durationInFrames: 18, config: {damping: 200}});
  return (
    <Center>
      <div style={{fontSize: 38, letterSpacing: 5, color: CYAN, fontWeight: 700, opacity: interpolate(frame, [6, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>功能介绍</div>
      <div style={{fontSize: v ? 104 : 96, fontWeight: 900, color: '#fff', marginTop: 16, lineHeight: 1.14, transform: `scale(${interpolate(s, [0, 1], [0.82, 1])})`, opacity: s}}>{f.name}</div>
      <div style={{fontSize: 42, color: '#9aa9bf', marginTop: 26, opacity: interpolate(frame, [24, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>{f.sub}</div>
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
      <div style={{fontSize: v ? 72 : 68, fontWeight: 900, color: '#fff', lineHeight: 1.2, transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s}}>设备端 AI 视觉全栈<br /><span style={{color: CYAN}}>整套可白标</span></div>
      <div style={{fontSize: 44, color: '#fff', marginTop: 38, opacity: interpolate(frame, [22, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>微信 <b style={{color: CYAN}}>13826173658</b> · 深圳</div>
    </Center>
  );
};

export const FeatureExplainer: React.FC<{f: Feature}> = ({f}) => {
  const total = featureDuration(f);
  return (
    <AbsoluteFill style={{backgroundColor: BG, fontFamily}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={78}><TitleScene f={f} /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={54 + f.overview.length * 28}>
          <SectionShell tag="①  全部功能" shot={f.shot} name={f.name}>{f.overview.map((o, i) => <Bullet key={i} i={i}>{o}</Bullet>)}</SectionShell>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={54 + f.details.length * 30}>
          <SectionShell tag="②  页面细节" shot={f.shot} name={f.name}>{f.details.map((d, i) => <KvRow key={i} i={i} k={d.k} v={d.v} />)}</SectionShell>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={54 + f.tips.length * 26}>
          <SectionShell tag="③  注意事项 & 小技巧" shot={f.shot} name={f.name}>{f.tips.map((tp, i) => <Bullet key={i} i={i}>{tp}</Bullet>)}</SectionShell>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: T})} />
        <TransitionSeries.Sequence durationInFrames={84}><CtaScene /></TransitionSeries.Sequence>
      </TransitionSeries>
      <Audio src={staticFile('bgm.mp3')} volume={(fr) => interpolate(fr, [0, 18, total - 45, total], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
    </AbsoluteFill>
  );
};
