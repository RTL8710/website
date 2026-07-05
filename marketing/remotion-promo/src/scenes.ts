/* scenes.ts — 11 个场景底图的「代码化」绘制。
   Remotion CLI 渲染时由 <canvas> 即时生成,无需任何 scene-*.jpg。
   画布固定 1600×900;drawScene(ctx, key, w, h) 按 key 分发。 */

type Ctx = CanvasRenderingContext2D;

const CY = 'rgba(34,211,238,';

function radial(ctx: Ctx, W: number, H: number, x: number, y: number, r: number, col: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function vign(ctx: Ctx, W: number, H: number, s: number) {
  const g = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.3, W / 2, H * 0.5, H * 0.98);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(2,4,8,${s})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function bird(ctx: Ctx, x: number, y: number, s: number) {
  ctx.beginPath(); ctx.moveTo(x - s, y);
  ctx.quadraticCurveTo(x - s * 0.42, y - s * 0.66, x, y - s * 0.12);
  ctx.quadraticCurveTo(x + s * 0.42, y - s * 0.66, x + s, y); ctx.stroke();
}
// deterministic pseudo-random so every render frame is identical
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function warehouse(ctx: Ctx, W: number, H: number) {
  const rnd = makeRng(11);
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0e2338'); g.addColorStop(1, '#050a11'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(120,160,200,0.14)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, H * 0.14); ctx.lineTo(W, H * 0.14); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const lx = W * (0.2 + i * 0.2); ctx.fillStyle = 'rgba(200,225,255,0.9)'; ctx.fillRect(lx - 60, H * 0.16, 120, 10);
    const cone = ctx.createLinearGradient(lx, H * 0.17, lx, H * 0.8); cone.addColorStop(0, 'rgba(180,210,245,0.16)'); cone.addColorStop(1, 'rgba(180,210,245,0)');
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(lx - 60, H * 0.17); ctx.lineTo(lx + 60, H * 0.17); ctx.lineTo(lx + 220, H * 0.85); ctx.lineTo(lx - 220, H * 0.85); ctx.closePath(); ctx.fill();
  }
  let fg = ctx.createLinearGradient(0, H * 0.6, 0, H); fg.addColorStop(0, '#0b131c'); fg.addColorStop(1, '#04070c'); ctx.fillStyle = fg; ctx.fillRect(0, H * 0.6, W, H * 0.4);
  ctx.strokeStyle = 'rgba(120,150,190,0.12)'; ctx.lineWidth = 2; const vx = W * 0.5;
  for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(vx + i * 300, H); ctx.lineTo(vx + i * 60, H * 0.6); ctx.stroke(); }
  function rack(x0: number, y0: number, rw: number, rh: number, depthCol: string) {
    ctx.fillStyle = depthCol; ctx.fillRect(x0, y0, 10, rh); ctx.fillRect(x0 + rw, y0, 10, rh);
    const shelves = 3;
    for (let s = 0; s <= shelves; s++) {
      const sy = y0 + (rh / shelves) * s; ctx.fillStyle = depthCol; ctx.fillRect(x0, sy, rw + 10, 8);
      if (s < shelves) { let bx = x0 + 18; while (bx < x0 + rw - 40) { const bw = 40 + rnd() * 46, bh = (rh / shelves) - 26; ctx.fillStyle = 'rgba(150,120,80,' + (0.5 + rnd() * 0.35) + ')'; ctx.fillRect(bx, sy + 10, bw, bh); ctx.fillStyle = depthCol; ctx.fillRect(bx, sy + 10, bw, 3); bx += bw + 10; } }
    }
  }
  rack(60, H * 0.30, 300, H * 0.52, 'rgba(8,16,24,0.96)');
  rack(W - 380, H * 0.30, 300, H * 0.52, 'rgba(8,16,24,0.96)');
  rack(W * 0.4, H * 0.42, 200, H * 0.32, 'rgba(10,20,30,0.9)');
  vign(ctx, W, H, 0.72);
}

function store(ctx: Ctx, W: number, H: number) {
  const rnd = makeRng(22);
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#241b2e'); g.addColorStop(1, '#08070d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) { const lx = 120 + i * 250; ctx.fillStyle = 'rgba(255,238,205,0.85)'; ctx.fillRect(lx, H * 0.05, 150, 14); radial(ctx, W, H, lx + 75, H * 0.06, W * 0.14, 'rgba(255,210,150,0.14)'); }
  ctx.fillStyle = 'rgba(34,211,238,0.85)'; ctx.fillRect(W * 0.44, H * 0.16, 150, 60); ctx.fillStyle = '#05121a'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SALE', W * 0.44 + 75, H * 0.16 + 42);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W * 0.47, H * 0.05); ctx.lineTo(W * 0.47, H * 0.16); ctx.moveTo(W * 0.52, H * 0.05); ctx.lineTo(W * 0.52, H * 0.16); ctx.stroke();
  let fg = ctx.createLinearGradient(0, H * 0.66, 0, H); fg.addColorStop(0, '#14101a'); fg.addColorStop(1, '#070509'); ctx.fillStyle = fg; ctx.fillRect(0, H * 0.66, W, H * 0.34);
  ctx.strokeStyle = 'rgba(255,220,180,0.08)'; ctx.lineWidth = 2; const vx = W * 0.5;
  for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(vx + i * 280, H); ctx.lineTo(vx + i * 50, H * 0.66); ctx.stroke(); }
  function gondola(x0: number, y0: number, gw: number, gh: number) {
    ctx.fillStyle = 'rgba(12,10,18,0.95)'; ctx.fillRect(x0, y0, gw, gh);
    const shelves = 4;
    for (let s = 1; s <= shelves; s++) {
      const sy = y0 + (gh / shelves) * s; ctx.fillStyle = 'rgba(30,26,40,0.9)'; ctx.fillRect(x0, sy - 6, gw, 6);
      let bx = x0 + 8; while (bx < x0 + gw - 16) { const bw = 18 + rnd() * 20; const hue = ['#cc9988', '#99aabb', '#cba55f', '#7f93b8', '#b7808f'][Math.floor(rnd() * 5)]; ctx.fillStyle = hue; ctx.globalAlpha = 0.55; ctx.fillRect(bx, sy - 6 - (gh / shelves) + 12, bw, (gh / shelves) - 16); ctx.globalAlpha = 1; bx += bw + 6; }
    }
  }
  gondola(70, H * 0.4, 300, H * 0.42); gondola(W - 370, H * 0.4, 300, H * 0.42); gondola(W * 0.42, H * 0.5, 210, H * 0.28);
  vign(ctx, W, H, 0.72);
}

function door(ctx: Ctx, W: number, H: number) {
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b2732'); g.addColorStop(1, '#0a1016'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 2; for (let y = 40; y < H; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  let sky = ctx.createLinearGradient(0, 0, 0, H * 0.16); sky.addColorStop(0, '#060d18'); sky.addColorStop(1, 'rgba(6,13,24,0)'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.16);
  const dx = W * 0.54, dy = H * 0.18, dw = W * 0.26, dh = H * 0.74;
  ctx.fillStyle = '#0c141c'; ctx.fillRect(dx - 18, dy - 18, dw + 36, dh + 18);
  const ajar = W * 0.09;
  const spill = ctx.createLinearGradient(dx, dy, dx + ajar, dy); spill.addColorStop(0, 'rgba(255,214,150,0.9)'); spill.addColorStop(1, 'rgba(255,190,120,0.5)');
  ctx.save(); ctx.shadowColor = 'rgba(255,205,140,0.6)'; ctx.shadowBlur = 70; ctx.fillStyle = spill; ctx.fillRect(dx, dy, ajar, dh); ctx.restore();
  const fl = ctx.createLinearGradient(0, dy + dh, 0, H); fl.addColorStop(0, 'rgba(255,205,140,0.30)'); fl.addColorStop(1, 'rgba(255,205,140,0)'); ctx.fillStyle = fl; ctx.beginPath(); ctx.moveTo(dx - 10, dy + dh); ctx.lineTo(dx + ajar + 40, dy + dh); ctx.lineTo(dx + ajar + 240, H); ctx.lineTo(dx - 260, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0a0f15'; ctx.fillRect(dx + ajar, dy, dw - ajar, dh);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 3;
  for (let p = 0; p < 2; p++) for (let q = 0; q < 2; q++) { ctx.strokeRect(dx + ajar + 24 + q * ((dw - ajar) / 2 - 10), dy + 30 + p * (dh / 2), (dw - ajar) / 2 - 40, dh / 2 - 60); }
  ctx.fillStyle = 'rgba(220,200,150,0.7)'; ctx.beginPath(); ctx.arc(dx + ajar + 26, dy + dh * 0.52, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#0c1218'; ctx.fillRect(dx - 40, dy + dh, dw + 70, 26);
  ctx.fillStyle = 'rgba(90,80,60,0.5)'; ctx.fillRect(dx + dw * 0.1, dy + dh + 30, dw * 0.7, 40);
  ctx.fillStyle = '#8a6a3f'; ctx.fillRect(dx + dw * 0.2, dy + dh - 70, 90, 70); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(dx + dw * 0.2, dy + dh - 70, 90, 10); ctx.strokeStyle = 'rgba(230,220,200,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(dx + dw * 0.2 + 45, dy + dh - 70); ctx.lineTo(dx + dw * 0.2 + 45, dy + dh); ctx.stroke();
  const lx = dx - 120, ly = H * 0.3; radial(ctx, W, H, lx, ly, 220, 'rgba(255,205,140,0.35)'); ctx.fillStyle = 'rgba(255,225,170,0.95)'; ctx.fillRect(lx - 14, ly - 20, 28, 40); ctx.fillStyle = '#0c141c'; ctx.fillRect(lx - 18, ly - 26, 36, 8);
  vign(ctx, W, H, 0.74);
}

function robot(ctx: Ctx, W: number, H: number) {
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a1c1f'); g.addColorStop(1, '#04090b'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  radial(ctx, W, H, W * 0.5, H * 0.1, W * 0.7, 'rgba(34,211,238,0.14)');
  ctx.fillStyle = 'rgba(8,20,22,0.95)';
  rr(ctx, 0, H * 0.28, W * 0.16, H * 0.42, 10); ctx.fill(); rr(ctx, W * 0.17, H * 0.34, W * 0.12, H * 0.36, 10); ctx.fill(); rr(ctx, W * 0.84, H * 0.26, W * 0.16, H * 0.44, 10); ctx.fill();
  ctx.fillStyle = 'rgba(34,211,238,0.4)'; ctx.fillRect(W * 0.02, H * 0.32, W * 0.12, 5); ctx.fillRect(W * 0.86, H * 0.3, W * 0.12, 5);
  const horizon = H * 0.6; let fg = ctx.createLinearGradient(0, horizon, 0, H); fg.addColorStop(0, '#07161a'); fg.addColorStop(1, '#03080a'); ctx.fillStyle = fg; ctx.fillRect(0, horizon, W, H - horizon);
  ctx.strokeStyle = 'rgba(34,211,238,0.22)'; ctx.lineWidth = 2; const vx = W * 0.5;
  for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(vx + i * 200, H); ctx.lineTo(vx + i * 22, horizon); ctx.stroke(); }
  for (let j = 1; j <= 6; j++) { const y = horizon + (H - horizon) * (j * j) / 40; ctx.globalAlpha = Math.max(0.05, 0.26 - j * 0.03); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.fillStyle = 'rgba(10,24,26,0.95)'; rr(ctx, W * 0.3, H * 0.5, W * 0.4, 26, 6); ctx.fill();
  ctx.fillStyle = 'rgba(150,120,80,0.8)'; for (let k = 0; k < 4; k++) { ctx.fillRect(W * 0.33 + k * 90, H * 0.5 - 34, 54, 40); }
  ctx.save(); ctx.beginPath(); ctx.rect(W * 0.2, H * 0.82, W * 0.6, 20); ctx.clip(); for (let x = W * 0.2 - 40; x < W * 0.8; x += 40) { ctx.fillStyle = ((x / 40) | 0) % 2 ? 'rgba(230,190,60,0.5)' : 'rgba(20,20,20,0.4)'; ctx.beginPath(); ctx.moveTo(x, H * 0.82); ctx.lineTo(x + 30, H * 0.82); ctx.lineTo(x + 10, H * 0.85); ctx.lineTo(x - 20, H * 0.85); ctx.fill(); } ctx.restore();
  const ax = W * 0.34, ay = H * 0.74;
  ctx.fillStyle = '#0d2a2e'; rr(ctx, ax - 90, ay - 90, 180, 110, 18); ctx.fill();
  ctx.fillStyle = '#08181b'; ctx.beginPath(); ctx.arc(ax - 55, ay + 22, 26, 0, 7); ctx.arc(ax + 55, ay + 22, 26, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(34,211,238,0.9)'; rr(ctx, ax - 60, ay - 60, 120, 22, 6); ctx.fill();
  ctx.fillStyle = '#0d2a2e'; ctx.fillRect(ax - 8, ay - 150, 16, 60);
  ctx.fillStyle = '#12363b'; ctx.beginPath(); ctx.arc(ax, ay - 155, 20, 0, 7); ctx.fill();
  const beam = ctx.createLinearGradient(ax, ay - 155, ax + 260, ay - 120); beam.addColorStop(0, 'rgba(34,211,238,0.35)'); beam.addColorStop(1, 'rgba(34,211,238,0)'); ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(ax, ay - 155); ctx.lineTo(ax + 300, ay - 200); ctx.lineTo(ax + 300, ay - 90); ctx.closePath(); ctx.fill();
  const bx = W * 0.74, by = H * 0.7; ctx.strokeStyle = '#123a3f'; ctx.lineWidth = 26; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx, by + 120); ctx.lineTo(bx, by); ctx.lineTo(bx - 140, by - 70); ctx.stroke();
  ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(bx - 140, by - 70); ctx.lineTo(bx - 230, by - 20); ctx.stroke();
  ctx.fillStyle = 'rgba(34,211,238,0.8)'; ctx.beginPath(); ctx.arc(bx, by, 10, 0, 7); ctx.arc(bx - 140, by - 70, 9, 0, 7); ctx.fill();
  vign(ctx, W, H, 0.72);
}

function car(ctx: Ctx, W: number, H: number) {
  let sky = ctx.createLinearGradient(0, 0, 0, H * 0.62); sky.addColorStop(0, '#0a1524'); sky.addColorStop(1, '#152a3a'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.62);
  radial(ctx, W, H, W * 0.5, H * 0.5, W * 0.4, 'rgba(120,150,190,0.25)');
  const horizon = H * 0.5, vx = W * 0.5;
  ctx.fillStyle = '#0b1017'; ctx.beginPath(); ctx.moveTo(vx - 26, horizon); ctx.lineTo(vx + 26, horizon); ctx.lineTo(W * 0.86, H * 0.66); ctx.lineTo(W * 0.14, H * 0.66); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(150,190,220,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(vx - 24, horizon); ctx.lineTo(W * 0.16, H * 0.66); ctx.moveTo(vx + 24, horizon); ctx.lineTo(W * 0.84, H * 0.66); ctx.stroke();
  ctx.fillStyle = 'rgba(255,235,180,0.6)'; for (let j = 0; j < 5; j++) { const p = j / 5, y = horizon + (H * 0.16) * (p * p * 1.4); const w = 3 + p * 14, h = 4 + p * 20; ctx.fillRect(vx - w / 2, y, w, h); }
  ctx.fillStyle = 'rgba(255,60,50,0.9)'; ctx.fillRect(vx - 30, horizon - 6, 10, 6); ctx.fillRect(vx + 20, horizon - 6, 10, 6);
  radial(ctx, W, H, vx, horizon - 4, 40, 'rgba(255,60,50,0.25)');
  radial(ctx, W, H, vx, H * 0.64, W * 0.36, 'rgba(200,220,255,0.14)');
  ctx.fillStyle = '#05080c'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.14, 0); ctx.lineTo(0, H * 0.7); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W * 0.86, 0); ctx.lineTo(W, H * 0.7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#05080c'; ctx.fillRect(0, 0, W, H * 0.06);
  ctx.fillStyle = '#0a0f15'; rr(ctx, vx - 70, H * 0.05, 140, 40, 16); ctx.fill(); ctx.fillStyle = 'rgba(90,120,150,0.3)'; rr(ctx, vx - 62, H * 0.06, 124, 26, 10); ctx.fill();
  ctx.fillStyle = '#04070b'; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, H * 0.66); ctx.quadraticCurveTo(W * 0.5, H * 0.56, W, H * 0.66); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  radial(ctx, W, H, W * 0.32, H * 0.82, W * 0.14, 'rgba(34,211,238,0.16)');
  ctx.strokeStyle = 'rgba(34,211,238,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W * 0.3, H * 0.86, 40, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke(); ctx.beginPath(); ctx.arc(W * 0.4, H * 0.87, 32, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
  ctx.strokeStyle = '#0c1219'; ctx.lineWidth = 34; ctx.beginPath(); ctx.arc(vx, H * 1.06, 190, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(vx, H * 0.98); ctx.lineTo(vx, H * 0.9); ctx.moveTo(vx - 90, H * 0.96); ctx.lineTo(vx, H * 0.94); ctx.moveTo(vx + 90, H * 0.96); ctx.lineTo(vx, H * 0.94); ctx.stroke();
  vign(ctx, W, H, 0.6);
}

function wildlife(ctx: Ctx, W: number, H: number) {
  const rnd = makeRng(66);
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0c1f2e'); g.addColorStop(0.45, '#12304a'); g.addColorStop(0.7, '#2b5a4a'); g.addColorStop(1, '#1a3a2c'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  radial(ctx, W, H, W * 0.5, H * 0.5, W * 0.5, 'rgba(255,214,150,0.5)'); radial(ctx, W, H, W * 0.5, H * 0.52, W * 0.28, 'rgba(255,238,205,0.6)');
  radial(ctx, W, H, W * 0.2, H * 0.2, 140, 'rgba(220,235,255,0.25)'); ctx.fillStyle = 'rgba(230,240,255,0.85)'; ctx.beginPath(); ctx.arc(W * 0.2, H * 0.2, 34, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(10,14,16,0.92)'; ctx.lineCap = 'round';
  const flock: [number, number, number][] = [[0.30, 0.34, 52], [0.38, 0.29, 42], [0.45, 0.35, 38], [0.34, 0.42, 40], [0.42, 0.45, 32], [0.55, 0.30, 44], [0.62, 0.37, 36], [0.68, 0.31, 40], [0.25, 0.30, 34], [0.58, 0.45, 30]];
  for (const [fx, fy, s] of flock) { ctx.lineWidth = Math.max(4, s * 0.13); bird(ctx, W * fx, H * fy, s); }
  const horizon = H * 0.7;
  function treeRange(baseY: number, h: number, col: string) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, baseY); let x = 0; while (x <= W) { const tw = 30 + rnd() * 40, th = h * (0.6 + rnd() * 0.7); ctx.lineTo(x, baseY); ctx.lineTo(x + tw / 2, baseY - th); ctx.lineTo(x + tw, baseY); x += tw; } ctx.lineTo(W, baseY); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill(); }
  treeRange(horizon + 6, 120, 'rgba(30,60,64,0.7)'); treeRange(horizon + 30, 170, 'rgba(18,42,44,0.9)');
  let gg = ctx.createLinearGradient(0, horizon, 0, H); gg.addColorStop(0, '#12281f'); gg.addColorStop(1, '#060f0b'); ctx.fillStyle = gg; ctx.fillRect(0, horizon + 28, W, H - horizon);
  let mist = ctx.createLinearGradient(0, horizon, 0, horizon + 140); mist.addColorStop(0, 'rgba(200,220,210,0.22)'); mist.addColorStop(1, 'rgba(200,220,210,0)'); ctx.fillStyle = mist; ctx.fillRect(0, horizon - 10, W, 150);
  function pine(x: number, baseY: number, ph: number, pw: number, col: string) { ctx.fillStyle = col; ctx.fillRect(x - pw * 0.04, baseY - ph * 0.16, pw * 0.08, ph * 0.16); const tiers = 4; for (let i = 0; i < tiers; i++) { const ty = baseY - ph * 0.14 - (ph * 0.8) * (i / tiers); const tw = pw * (1 - i / (tiers + 0.5)); const th = ph * 0.28; ctx.beginPath(); ctx.moveTo(x - tw / 2, ty); ctx.lineTo(x, ty - th); ctx.lineTo(x + tw / 2, ty); ctx.closePath(); ctx.fill(); } }
  pine(W * 0.1, H + 10, H * 0.62, 220, '#04120c'); pine(W * 0.92, H + 10, H * 0.7, 250, '#04120c');
  radial(ctx, W, H, W * 0.2, H * 0.44, 120, 'rgba(255,225,175,0.28)');
  ctx.strokeStyle = '#0a1710'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, H * 0.5); ctx.lineTo(W * 0.24, H * 0.44); ctx.stroke();
  (function () { const bx = W * 0.2, by = H * 0.42; ctx.fillStyle = '#0a1710'; ctx.beginPath(); ctx.ellipse(bx, by, 28, 17, -0.25, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(bx - 22, by - 16, 13, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(bx - 33, by - 18); ctx.lineTo(bx - 48, by - 16); ctx.lineTo(bx - 33, by - 11); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(bx + 22, by + 4); ctx.lineTo(bx + 58, by + 16); ctx.lineTo(bx + 22, by + 12); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#0a1710'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx - 4, by + 14); ctx.lineTo(bx - 4, by + 22); ctx.moveTo(bx + 6, by + 14); ctx.lineTo(bx + 6, by + 22); ctx.stroke(); })();
  function deer(cx: number, groundY: number, s: number, col: string) { ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = s * 0.09; ctx.lineCap = 'round'; ctx.beginPath(); ctx.ellipse(cx, groundY - s * 0.72, s * 0.62, s * 0.32, 0, 0, 7); ctx.fill(); function leg(lx: number, bend: number) { ctx.beginPath(); ctx.moveTo(lx, groundY - s * 0.78); ctx.lineTo(lx + bend * 0.1, groundY - s * 0.38); ctx.lineTo(lx + bend * 0.16, groundY); ctx.stroke(); } leg(cx - s * 0.42, -1); leg(cx - s * 0.28, -1); leg(cx + s * 0.3, 1); leg(cx + s * 0.44, 1); ctx.beginPath(); ctx.moveTo(cx + s * 0.5, groundY - s * 0.9); ctx.lineTo(cx + s * 0.78, groundY - s * 1.45); ctx.lineWidth = s * 0.26; ctx.stroke(); ctx.beginPath(); ctx.ellipse(cx + s * 0.86, groundY - s * 1.55, s * 0.2, s * 0.13, -0.5, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + s * 1.02, groundY - s * 1.48, s * 0.12, s * 0.07, -0.3, 0, 7); ctx.fill(); ctx.lineWidth = s * 0.05; function ant(dir: number) { const bx2 = cx + s * 0.86, by2 = groundY - s * 1.68; ctx.beginPath(); ctx.moveTo(bx2, by2); ctx.lineTo(bx2 + dir * s * 0.12, by2 - s * 0.4); ctx.moveTo(bx2 + dir * s * 0.06, by2 - s * 0.2); ctx.lineTo(bx2 + dir * s * 0.26, by2 - s * 0.26); ctx.moveTo(bx2 + dir * s * 0.1, by2 - s * 0.34); ctx.lineTo(bx2 + dir * s * 0.28, by2 - s * 0.44); ctx.stroke(); } ant(1); ant(-0.3); }
  radial(ctx, W, H, W * 0.42, horizon + 70, 190, 'rgba(255,215,160,0.30)'); deer(W * 0.4, horizon + 96, 120, '#05140d');
  vign(ctx, W, H, 0.66);
}

function pet(ctx: Ctx, W: number, H: number) {
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a201a'); g.addColorStop(1, '#0d0a09'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const wx = W * 0.64, wy = H * 0.12, ww = W * 0.24, wh = H * 0.42;
  let ng = ctx.createLinearGradient(wx, wy, wx, wy + wh); ng.addColorStop(0, '#0a1420'); ng.addColorStop(1, '#12263a'); ctx.fillStyle = ng; ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = 'rgba(220,235,255,0.85)'; ctx.beginPath(); ctx.arc(wx + ww * 0.72, wy + wh * 0.3, 24, 0, 7); ctx.fill(); radial(ctx, W, H, wx + ww * 0.72, wy + wh * 0.3, 170, 'rgba(150,190,230,0.14)');
  ctx.fillStyle = '#0c0a0a'; ctx.fillRect(wx - 14, wy - 14, ww + 28, 14); ctx.fillRect(wx - 14, wy, 14, wh); ctx.fillRect(wx + ww, wy, 14, wh); ctx.fillRect(wx - 14, wy + wh, ww + 28, 16); ctx.fillRect(wx + ww / 2 - 5, wy, 10, wh); ctx.fillRect(wx, wy + wh / 2 - 5, ww, 10);
  radial(ctx, W, H, W * 0.14, H * 0.2, W * 0.42, 'rgba(255,205,140,0.24)');
  ctx.strokeStyle = 'rgba(255,220,180,0.25)'; ctx.lineWidth = 6; ctx.strokeRect(W * 0.14, H * 0.2, 120, 90);
  let fl = ctx.createLinearGradient(0, H * 0.66, 0, H); fl.addColorStop(0, '#2c1e17'); fl.addColorStop(1, '#0e0a08'); ctx.fillStyle = fl; ctx.fillRect(0, H * 0.66, W, H * 0.34);
  ctx.fillStyle = 'rgba(150,110,80,0.42)'; ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.87, W * 0.38, H * 0.1, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#1a110d'; rr(ctx, -90, H * 0.58, W * 0.24, H * 0.32, 30); ctx.fill(); rr(ctx, -90, H * 0.5, W * 0.09, H * 0.26, 26); ctx.fill();
  // feeder (right) — 定时投喂器
  const fx = W * 0.8, fy = H * 0.58; ctx.fillStyle = '#13202a'; rr(ctx, fx, fy, 90, H * 0.32, 14); ctx.fill(); ctx.fillStyle = '#0c1820'; ctx.beginPath(); ctx.moveTo(fx - 14, fy + H * 0.32); ctx.lineTo(fx + 104, fy + H * 0.32); ctx.lineTo(fx + 74, fy + H * 0.32 + 34); ctx.lineTo(fx + 16, fy + H * 0.32 + 34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = CY + '0.8)'; ctx.fillRect(fx + 20, fy + 18, 50, 8); ctx.fillStyle = 'rgba(180,150,90,0.85)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(fx + 45 + (i - 2) * 6, fy + H * 0.32 + 30, 3, 0, 7); ctx.fill(); }
  // waterer (left of feeder) — 活水循环
  const wtx = W * 0.72, wty = H * 0.72; ctx.fillStyle = '#122430'; rr(ctx, wtx, wty, 70, 60, 12); ctx.fill(); ctx.strokeStyle = CY + '0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(wtx + 35, wty + 12, 16, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.fillStyle = 'rgba(120,190,220,0.5)'; rr(ctx, wtx + 8, wty + 34, 54, 16, 6); ctx.fill();
  // bowls
  const py = H * 0.9; ctx.fillStyle = '#241a15'; ctx.beginPath(); ctx.ellipse(W * 0.5, py, 44, 15, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(W * 0.57, py + 7, 48, 16, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(190,158,96,0.8)'; ctx.beginPath(); ctx.ellipse(W * 0.5, py - 3, 34, 9, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(W * 0.57, py + 4, 38, 10, 0, 0, 7); ctx.fill();
  // dog
  radial(ctx, W, H, W * 0.32, H * 0.82, 180, 'rgba(255,200,140,0.20)');
  (function () { const dx = W * 0.32, gy = H * 0.92, s = 1.35; ctx.fillStyle = '#120b08'; ctx.beginPath(); ctx.ellipse(dx, gy - 40 * s, 42 * s, 38 * s, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(dx + 18 * s, gy); ctx.quadraticCurveTo(dx + 50 * s, gy - 30 * s, dx + 42 * s, gy - 76 * s); ctx.quadraticCurveTo(dx + 28 * s, gy - 94 * s, dx + 14 * s, gy - 68 * s); ctx.lineTo(dx + 8 * s, gy); ctx.closePath(); ctx.fill(); ctx.fillRect(dx + 22 * s, gy - 40 * s, 13 * s, 40 * s); ctx.fillRect(dx + 38 * s, gy - 40 * s, 13 * s, 40 * s); ctx.beginPath(); ctx.arc(dx + 40 * s, gy - 94 * s, 23 * s, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(dx + 59 * s, gy - 90 * s, 15 * s, 10 * s, 0.1, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(dx + 30 * s, gy - 106 * s); ctx.quadraticCurveTo(dx + 14 * s, gy - 94 * s, dx + 20 * s, gy - 62 * s); ctx.quadraticCurveTo(dx + 34 * s, gy - 82 * s, dx + 38 * s, gy - 102 * s); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#120b08'; ctx.lineWidth = 14 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(dx - 28 * s, gy - 28 * s); ctx.quadraticCurveTo(dx - 60 * s, gy - 38 * s, dx - 54 * s, gy - 74 * s); ctx.stroke(); ctx.strokeStyle = 'rgba(255,210,150,0.35)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(dx + 40 * s, gy - 94 * s, 23 * s, Math.PI * 0.6, Math.PI * 1.5); ctx.stroke(); })();
  // cat
  radial(ctx, W, H, W * 0.64, H * 0.86, 140, 'rgba(255,200,140,0.16)');
  (function () { const px = W * 0.64, py2 = H * 0.92; ctx.fillStyle = '#0e0908'; ctx.beginPath(); ctx.moveTo(px - 38, py2 + 4); ctx.quadraticCurveTo(px - 44, py2 - 58, px - 13, py2 - 66); ctx.quadraticCurveTo(px + 16, py2 - 60, px + 14, py2 + 4); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(px - 11, py2 - 78, 21, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(px - 28, py2 - 88); ctx.lineTo(px - 33, py2 - 113); ctx.lineTo(px - 14, py2 - 95); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(px + 5, py2 - 88); ctx.lineTo(px + 10, py2 - 113); ctx.lineTo(px - 6, py2 - 95); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#0e0908'; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px + 10, py2); ctx.quadraticCurveTo(px + 58, py2 - 6, px + 52, py2 - 54); ctx.stroke(); ctx.strokeStyle = 'rgba(255,210,150,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px - 11, py2 - 78, 21, Math.PI * 0.7, Math.PI * 1.6); ctx.stroke(); })();
  vign(ctx, W, H, 0.62);
}

function security(ctx: Ctx, W: number, H: number) {
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a141f'); g.addColorStop(1, '#04080d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const cols = 4, rows = 3, gx = W * 0.08, gy = H * 0.06, gw = W * 0.84, gh = H * 0.52, gap = 10;
  const tw = (gw - gap * (cols - 1)) / cols, th = (gh - gap * (rows - 1)) / rows;
  const hues = ['#12303a', '#1a2438', '#12362c', '#241c34', '#0e2a3a', '#22303f', '#1c2a1e', '#2a2230', '#122c3a', '#1e2a3c', '#143028', '#26202f'];
  const intruder = 6; // 高亮入侵那一路
  let idx = 0;
  for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
    const x = gx + cc * (tw + gap), y = gy + r * (th + gap);
    const tg = ctx.createLinearGradient(x, y, x, y + th); tg.addColorStop(0, hues[idx % hues.length]); tg.addColorStop(1, '#05090f'); ctx.fillStyle = tg; ctx.fillRect(x, y, tw, th);
    radial(ctx, W, H, x + tw * 0.5, y + th * 0.4, tw * 0.5, 'rgba(90,130,160,0.10)');
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; for (let sy = y + 4; sy < y + th; sy += 6) ctx.fillRect(x, sy, tw, 1);
    if (idx === intruder) {
      // 翻墙入侵者剪影 + 红检测框
      ctx.fillStyle = 'rgba(120,150,170,0.5)'; ctx.fillRect(x + tw * 0.2, y + th * 0.5, tw * 0.6, 6); // 墙
      ctx.fillStyle = '#05090f'; const ix = x + tw * 0.5, iy = y + th * 0.5; ctx.beginPath(); ctx.arc(ix, iy - 30, 8, 0, 7); ctx.fill(); rr(ctx, ix - 8, iy - 22, 16, 24, 5); ctx.fill(); ctx.fillRect(ix - 10, iy + 2, 6, 16); ctx.fillRect(ix + 4, iy + 2, 6, 16);
      ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 3; ctx.strokeRect(x + tw * 0.36, y + th * 0.28, tw * 0.3, th * 0.55);
      ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x + tw * 0.36, y + th * 0.28 - 20, 96, 18); ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('入侵 0.91', x + tw * 0.36 + 6, y + th * 0.28 - 6);
      ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 3; ctx.strokeRect(x, y, tw, th);
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(x, y, tw, th);
    }
    ctx.fillStyle = 'rgba(34,211,238,0.6)'; ctx.fillRect(x + 8, y + th - 16, tw * 0.4, 4);
    if ((idx * 7) % 5 === 0 || idx === intruder) { ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(x + tw - 16, y + 14, 5, 0, 7); ctx.fill(); }
    idx++;
  }
  radial(ctx, W, H, W * 0.5, H * 0.32, W * 0.6, 'rgba(34,211,238,0.10)');
  ctx.fillStyle = '#070d14'; rr(ctx, W * 0.12, H * 0.74, W * 0.76, H * 0.3, 20); ctx.fill();
  ctx.fillStyle = '#0c1a24'; rr(ctx, W * 0.28, H * 0.62, W * 0.16, H * 0.14, 8); ctx.fill(); rr(ctx, W * 0.56, H * 0.62, W * 0.16, H * 0.14, 8); ctx.fill();
  ctx.fillStyle = 'rgba(34,211,238,0.5)'; ctx.fillRect(W * 0.29, H * 0.64, W * 0.14, 4); ctx.fillRect(W * 0.57, H * 0.64, W * 0.14, 4);
  ctx.fillStyle = '#04080c'; rr(ctx, W * 0.46, H * 0.78, W * 0.08, H * 0.22, 16); ctx.fill(); ctx.beginPath(); ctx.arc(W * 0.5, H * 0.74, 26, 0, 7); ctx.fill();
  // 底部证据锁存条
  ctx.fillStyle = 'rgba(255,77,77,0.16)'; rr(ctx, W * 0.26, H * 0.9, W * 0.48, 52, 12); ctx.fill(); ctx.strokeStyle = 'rgba(255,120,120,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffd9d9'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⬤ REC  入侵录像已锁存 · 本地+云端双备份 · 不可篡改', W * 0.5, H * 0.9 + 33);
  vign(ctx, W, H, 0.6);
}

function livestream(ctx: Ctx, W: number, H: number) {
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#251a2e'); g.addColorStop(1, '#0a0710'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const bo: [string, number, number, number][] = [['rgba(255,90,140,0.22)', W * 0.2, H * 0.3, 160], ['rgba(90,160,255,0.20)', W * 0.8, H * 0.25, 180], ['rgba(34,211,238,0.18)', W * 0.7, H * 0.6, 140], ['rgba(255,190,90,0.18)', W * 0.12, H * 0.62, 150], ['rgba(180,120,255,0.18)', W * 0.5, H * 0.18, 120]];
  for (const [col, x, y, r] of bo) radial(ctx, W, H, x, y, r, col);
  ctx.fillStyle = 'rgba(8,6,12,0.6)'; ctx.fillRect(0, H * 0.72, W, H * 0.28);
  const rx = W * 0.32, ry = H * 0.4; radial(ctx, W, H, rx, ry, 260, 'rgba(255,240,220,0.30)');
  ctx.strokeStyle = 'rgba(255,250,235,0.95)'; ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(rx, ry, 90, 0, 7); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,235,0.4)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(rx, ry, 90, 0, 7); ctx.stroke();
  ctx.fillStyle = '#0c0a12'; ctx.fillRect(rx - 6, ry + 90, 12, H * 0.5);
  const sx = W * 0.62, sy = H * 0.86; ctx.fillStyle = '#0a0810';
  ctx.beginPath(); ctx.moveTo(sx - 110, sy); ctx.quadraticCurveTo(sx - 90, sy - 190, sx, sy - 200); ctx.quadraticCurveTo(sx + 90, sy - 190, sx + 110, sy); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(sx, sy - 235, 52, 0, 7); ctx.fill();
  ctx.fillStyle = '#0d0a14'; rr(ctx, sx - 170, sy - 40, 340, 60, 10); ctx.fill();
  const cx2 = W * 0.86, cy2 = H * 0.46; ctx.fillStyle = '#0c1420'; rr(ctx, cx2 - 46, cy2 - 30, 92, 60, 8); ctx.fill();
  ctx.fillStyle = '#050a10'; ctx.beginPath(); ctx.arc(cx2 - 10, cy2, 20, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(34,211,238,0.7)'; ctx.beginPath(); ctx.arc(cx2 - 10, cy2, 9, 0, 7); ctx.fill();
  ctx.strokeStyle = '#0c1420'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(cx2, cy2 + 30); ctx.lineTo(cx2 - 30, H * 0.86); ctx.moveTo(cx2, cy2 + 30); ctx.lineTo(cx2 + 30, H * 0.86); ctx.stroke();
  ctx.fillStyle = '#ff3b5c'; rr(ctx, W * 0.08, H * 0.08, 150, 54, 12); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W * 0.08 + 30, H * 0.08 + 27, 9, 0, 7); ctx.fill(); ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('LIVE', W * 0.08 + 48, H * 0.08 + 37);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, W * 0.1, H * 0.3, 190, 44, 14); ctx.fill(); rr(ctx, W * 0.13, H * 0.4, 150, 40, 14); ctx.fill();
  ctx.fillStyle = 'rgba(255,90,140,0.8)'; function heart(x: number, y: number, s: number) { ctx.beginPath(); ctx.moveTo(x, y + s * 0.3); ctx.bezierCurveTo(x, y, x - s, y, x - s, y + s * 0.35); ctx.bezierCurveTo(x - s, y + s * 0.7, x, y + s * 0.9, x, y + s * 1.1); ctx.bezierCurveTo(x, y + s * 0.9, x + s, y + s * 0.7, x + s, y + s * 0.35); ctx.bezierCurveTo(x + s, y, x, y, x, y + s * 0.3); ctx.fill(); }
  heart(W * 0.42, H * 0.66, 16); heart(W * 0.46, H * 0.56, 12); heart(W * 0.4, H * 0.5, 10);
  vign(ctx, W, H, 0.6);
}

function action(ctx: Ctx, W: number, H: number) {
  const rnd = makeRng(99);
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a2a44'); g.addColorStop(0.45, '#4a5a86'); g.addColorStop(0.7, '#e88a5a'); g.addColorStop(0.85, '#f4b46a'); g.addColorStop(1, '#3a2a30'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  radial(ctx, W, H, W * 0.5, H * 0.66, W * 0.34, 'rgba(255,230,180,0.6)'); ctx.fillStyle = 'rgba(255,245,220,0.95)'; ctx.beginPath(); ctx.arc(W * 0.5, H * 0.66, 60, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,210,180,0.18)'; for (let i = 0; i < 4; i++) { const y = H * (0.28 + i * 0.08); rr(ctx, W * (0.1 + i * 0.12), y, W * 0.4, 14, 8); ctx.fill(); }
  function ridge(baseY: number, amp: number, col: string) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, baseY); let x = 0; let y = baseY; while (x <= W) { x += 60 + rnd() * 80; y = baseY + (rnd() - 0.5) * amp; ctx.lineTo(x, y); } ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); }
  ridge(H * 0.6, 60, 'rgba(90,90,130,0.55)'); ridge(H * 0.72, 90, 'rgba(40,44,74,0.85)'); ridge(H * 0.82, 70, '#14162c');
  ctx.fillStyle = '#0a0b18'; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W * 0.3, H * 0.86); ctx.lineTo(W * 0.52, H * 0.8); ctx.lineTo(W * 0.78, H * 0.9); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  const hx = W * 0.52, hy = H * 0.8; ctx.fillStyle = '#050510'; ctx.strokeStyle = '#050510';
  ctx.beginPath(); ctx.arc(hx, hy - 96, 15, 0, 7); ctx.fill();
  ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx, hy - 80); ctx.lineTo(hx, hy - 34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx, hy - 70); ctx.lineTo(hx - 34, hy - 104); ctx.moveTo(hx, hy - 70); ctx.lineTo(hx + 34, hy - 104); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx, hy - 34); ctx.lineTo(hx - 18, hy); ctx.moveTo(hx, hy - 34); ctx.lineTo(hx + 18, hy); ctx.stroke();
  ctx.strokeStyle = 'rgba(20,20,30,0.7)'; ctx.lineWidth = 3; bird(ctx, W * 0.28, H * 0.2, 24); bird(ctx, W * 0.34, H * 0.16, 18); bird(ctx, W * 0.24, H * 0.26, 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 40; rr(ctx, 20, 20, W - 40, H - 40, 60); ctx.stroke();
  vign(ctx, W, H, 0.5);
}

function glasses(ctx: Ctx, W: number, H: number) {
  function radl(x: number, y: number, r: number, col: string) { radial(ctx, W, H, x, y, r, col); }
  let sky = ctx.createLinearGradient(0, 0, 0, H * 0.6); sky.addColorStop(0, '#2a4260'); sky.addColorStop(1, '#cfa77a'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.6);
  radl(W * 0.72, H * 0.28, W * 0.4, 'rgba(255,228,185,0.4)');
  ctx.fillStyle = '#3c4a3f'; ctx.fillRect(0, H * 0.58, W, H * 0.42);
  ctx.fillStyle = '#2c3630'; ctx.beginPath(); ctx.moveTo(W * 0.32, H * 0.58); ctx.lineTo(W * 0.68, H * 0.58); ctx.lineTo(W * 0.9, H); ctx.lineTo(W * 0.1, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#28323e'; ctx.fillRect(W * 0.04, H * 0.26, W * 0.22, H * 0.34);
  for (let r = 0; r < 5; r++) for (let cc = 0; cc < 4; cc++) { ctx.fillStyle = 'rgba(255,220,160,0.22)'; ctx.fillRect(W * 0.06 + cc * W * 0.05, H * 0.29 + r * H * 0.055, W * 0.032, H * 0.03); }
  ctx.fillStyle = '#222c36'; ctx.fillRect(W * 0.74, H * 0.22, W * 0.22, H * 0.38);
  for (let r = 0; r < 6; r++) for (let cc = 0; cc < 4; cc++) { ctx.fillStyle = 'rgba(180,220,255,0.16)'; ctx.fillRect(W * 0.76 + cc * W * 0.05, H * 0.25 + r * H * 0.05, W * 0.032, H * 0.028); }
  ctx.fillStyle = '#3a2a24'; ctx.fillRect(W * 0.28, H * 0.42, W * 0.14, H * 0.18); ctx.fillStyle = 'rgba(255,190,120,0.5)'; ctx.fillRect(W * 0.29, H * 0.44, W * 0.12, H * 0.05);
  ctx.fillStyle = '#0b0a10'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CAFÉ', W * 0.35, H * 0.475);
  // nav chevrons
  for (let i = 0; i < 3; i++) { const sc = 1 - i * 0.24, y = H * 0.82 - i * 70, w = 150 * sc, h = 54 * sc, x = W * 0.5; ctx.fillStyle = CY + (0.9 - i * 0.22) + ')'; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x, y - h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + 18 * sc); ctx.lineTo(x, y - h + 22 * sc); ctx.lineTo(x - w / 2, y + 18 * sc); ctx.closePath(); ctx.fill(); }
  // nav card
  ctx.fillStyle = 'rgba(6,14,20,0.72)'; rr(ctx, 40, 40, 300, 92, 16); ctx.fill();
  ctx.fillStyle = CY + '1)'; ctx.beginPath(); ctx.moveTo(72, 70); ctx.lineTo(96, 86); ctx.lineTo(72, 102); ctx.lineTo(80, 86); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eafcff'; ctx.textAlign = 'left'; ctx.font = 'bold 30px sans-serif'; ctx.fillText('前方 120m 右转', 120, 80); ctx.fillStyle = 'rgba(160,220,235,0.9)'; ctx.font = '500 22px sans-serif'; ctx.fillText('导航 · 到公司还有 8 分钟', 120, 112);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W * 0.5, H * 0.44, 15, 0, 7); ctx.stroke();
  // payment success
  ctx.fillStyle = 'rgba(8,20,16,0.82)'; rr(ctx, W * 0.6, H * 0.3, 300, 120, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(80,230,160,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W * 0.6 + 52, H * 0.3 + 60, 30, 0, 7); ctx.stroke();
  ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(W * 0.6 + 40, H * 0.3 + 60); ctx.lineTo(W * 0.6 + 50, H * 0.3 + 72); ctx.lineTo(W * 0.6 + 66, H * 0.3 + 48); ctx.stroke();
  ctx.fillStyle = '#eafcff'; ctx.font = 'bold 30px sans-serif'; ctx.fillText('支付成功', W * 0.6 + 98, H * 0.3 + 52); ctx.fillStyle = 'rgba(120,230,180,0.95)'; ctx.font = 'bold 34px sans-serif'; ctx.fillText('¥ 18.00', W * 0.6 + 98, H * 0.3 + 90);
  // AI dialog
  ctx.fillStyle = 'rgba(34,211,238,0.16)'; rr(ctx, W * 0.08, H * 0.56, 360, 84, 18); ctx.fill(); ctx.strokeStyle = CY + '0.5)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = CY + '1)'; ctx.beginPath(); ctx.arc(W * 0.08 + 34, H * 0.56 + 42, 16, 0, 7); ctx.fill(); ctx.fillStyle = '#05121a'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('AI', W * 0.08 + 34, H * 0.56 + 48);
  ctx.fillStyle = '#eafcff'; ctx.textAlign = 'left'; ctx.font = '500 23px sans-serif'; ctx.fillText('“这家咖啡评分 4.8,', W * 0.08 + 64, H * 0.56 + 38); ctx.fillText('  招牌是燕麦拿铁。”', W * 0.08 + 64, H * 0.56 + 66);
  // memory capsule timeline
  ctx.fillStyle = 'rgba(6,14,20,0.66)'; rr(ctx, W * 0.24, H * 0.9, W * 0.52, 72, 16); ctx.fill();
  ctx.fillStyle = 'rgba(180,220,235,0.9)'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('◷ 记忆胶囊', W * 0.255, H * 0.9 + 30);
  const caps: [number, string][] = [[0.4, '09:12'], [0.5, '早餐'], [0.6, '通勤'], [0.7, '此刻']];
  ctx.strokeStyle = 'rgba(120,180,210,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W * 0.4, H * 0.9 + 50); ctx.lineTo(W * 0.73, H * 0.9 + 50); ctx.stroke();
  caps.forEach((cp, i) => { const x = W * cp[0]; const on = i === caps.length - 1; ctx.fillStyle = on ? CY + '1)' : 'rgba(120,180,210,0.7)'; ctx.beginPath(); ctx.arc(x, H * 0.9 + 50, on ? 9 : 6, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(200,225,235,0.85)'; ctx.font = '500 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(cp[1], x, H * 0.9 + 34); });
  ctx.fillStyle = 'rgba(6,14,20,0.5)'; rr(ctx, W - 230, 40, 190, 48, 12); ctx.fill(); ctx.fillStyle = '#eafcff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('09:41', W - 214, 71);
  ctx.strokeStyle = 'rgba(234,252,255,0.8)'; ctx.lineWidth = 3; ctx.strokeRect(W - 96, 52, 44, 24); ctx.fillStyle = 'rgba(234,252,255,0.8)'; ctx.fillRect(W - 52, 57, 5, 14); ctx.fillRect(W - 92, 56, 30, 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 44; rr(ctx, 22, 22, W - 44, H - 44, 80); ctx.stroke();
  const vg = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.36, W / 2, H * 0.5, H * 0.98); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,4,8,0.42)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

const REGISTRY: Record<string, (ctx: Ctx, W: number, H: number) => void> = {
  warehouse, store, door, robot, car, wildlife, pet, security, livestream, action, glasses,
};

export function drawScene(ctx: Ctx, key: string, W = 1600, H = 900) {
  const fn = REGISTRY[key];
  if (!fn) { ctx.fillStyle = '#0a0e17'; ctx.fillRect(0, 0, W, H); return; }
  ctx.save();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  fn(ctx, W, H);
  ctx.restore();
}
