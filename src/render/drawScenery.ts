// Theme-specific scenery in the painterly style: coral reef growth (coral), lily pads seen from
// below and reeds (pond), bioluminescent plankton and glow anemones (night). Not interactive.
import { SAND_Y, TANK_WIDTH } from '../game/constants';
import type { ThemeId } from '../game/types';
import { sandLineY } from './drawTank';
import { blobPath, celShade, COOL_SHADOW, hashSeq, mix, RIM_LIGHT, rgba, WARM_LIGHT } from './paint';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Tapered branching coral: each branch is a dark stroke with a lit stroke offset up-left. */
function branchCoral(ctx: Ctx, x: number, h: number, base: string, lw: number, seed: number): void {
  const rand = hashSeq(seed);
  const y = sandLineY(x) + 6;
  const dark = mix(base, COOL_SHADOW, 0.45);
  const light = mix(base, WARM_LIGHT, 0.45);
  const segments: [number, number, number, number, number][] = [];
  const grow = (bx: number, by: number, len: number, angle: number, width: number, depth: number) => {
    const ex = bx + Math.sin(angle) * len;
    const ey = by - Math.cos(angle) * len;
    segments.push([bx, by, ex, ey, width]);
    if (depth > 0) {
      grow(ex, ey, len * 0.72, angle - 0.35 - rand() * 0.3, width * 0.72, depth - 1);
      grow(ex, ey, len * 0.7, angle + 0.3 + rand() * 0.3, width * 0.72, depth - 1);
    }
  };
  grow(x, y, h * 0.38, (rand() - 0.5) * 0.2, 7, 3);
  ctx.lineCap = 'round';
  for (const [color, dx, dy, k] of [[dark, 0, 0, 1.25], [base, 0, 0, 1], [light, -0.35, -0.35, 0.45]] as const) {
    for (const [bx, by, ex, ey, w] of segments) {
      ctx.beginPath();
      ctx.moveTo(bx + dx * w, by + dy * w);
      ctx.lineTo(ex + dx * w, ey + dy * w);
      ctx.strokeStyle = color;
      ctx.lineWidth = w * k + (color === dark ? lw : 0);
      ctx.stroke();
    }
  }
  // Polyp dots on the tips.
  ctx.fillStyle = rgba(RIM_LIGHT, 0.5);
  for (const [, , ex, ey, w] of segments) {
    if (w < 3) {
      ctx.beginPath();
      ctx.arc(ex, ey, w * 0.45, 0, TAU);
      ctx.fill();
    }
  }
}

/** Sea fan: a lattice fan with a gentle sway, lit at the top. */
function seaFan(ctx: Ctx, x: number, r: number, base: string, lw: number, t: number): void {
  const y = sandLineY(x) + 6;
  const sway = Math.sin(t * 0.7 + x) * 0.05;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  const fan = new Path2D();
  fan.moveTo(0, 0);
  fan.arc(0, 0, r, Math.PI * 1.1, Math.PI * 1.9);
  fan.closePath();
  const g = ctx.createLinearGradient(0, -r, 0, 0);
  g.addColorStop(0, rgba(mix(base, WARM_LIGHT, 0.35), 0.85));
  g.addColorStop(1, rgba(mix(base, COOL_SHADOW, 0.35), 0.85));
  ctx.fillStyle = g;
  ctx.fill(fan);
  ctx.save();
  ctx.clip(fan);
  ctx.strokeStyle = rgba(mix(base, COOL_SHADOW, 0.5), 0.45);
  ctx.lineWidth = lw * 0.6;
  ctx.beginPath();
  for (let i = 1; i < 9; i++) {
    const a = Math.PI * (1.1 + i * 0.09);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let rr = r * 0.3; rr < r; rr += r * 0.14) {
    ctx.moveTo(Math.cos(Math.PI * 1.1) * rr, Math.sin(Math.PI * 1.1) * rr);
    ctx.arc(0, 0, rr, Math.PI * 1.1, Math.PI * 1.9);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = rgba(mix(base, COOL_SHADOW, 0.6), 0.6);
  ctx.lineWidth = lw;
  ctx.stroke(fan);
  ctx.restore();
}

/** Brain coral mound: cel-shaded dome with meandering grooves. */
function brainCoral(ctx: Ctx, x: number, r: number, base: string, lw: number, seed: number): void {
  const y = sandLineY(x) + 8;
  const rand = hashSeq(seed);
  const dome = new Path2D();
  dome.ellipse(x, y, r * 1.3, r, 0, Math.PI, 0);
  dome.closePath();
  celShade(ctx, dome, [x - r * 1.3, y - r, r * 2.6, r], { base }, lw);
  ctx.save();
  ctx.clip(dome);
  ctx.strokeStyle = rgba(mix(base, COOL_SHADOW, 0.5), 0.45);
  ctx.lineWidth = lw * 0.7;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    let px = x - r * 1.2 + rand() * r * 0.4;
    let py = y - rand() * r * 0.9;
    ctx.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      px += 4 + rand() * 5;
      py += (rand() - 0.5) * 6;
      ctx.quadraticCurveTo(px - 2, py + (rand() - 0.5) * 6, px, py);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawCoralScenery(ctx: Ctx, t: number, px: number): void {
  const lw = 1.4 * px;
  seaFan(ctx, 110, 74, '#9a7ac4', lw, t);
  branchCoral(ctx, 250, 130, '#e2836f', lw, 3);
  brainCoral(ctx, 470, 20, '#d9b36a', lw, 4);
  branchCoral(ctx, 640, 100, '#e0a45a', lw, 7);
  seaFan(ctx, 860, 62, '#d4789a', lw, t);
  brainCoral(ctx, 935, 16, '#6ab0a0', lw, 9);
  // Tube coral cluster.
  for (const [dx, h] of [[0, 26], [7, 34], [14, 22], [-6, 18]] as const) {
    const tx = 560 + dx;
    const ty = sandLineY(tx) + 6;
    const tube = new Path2D();
    tube.roundRect(tx - 3, ty - h, 6, h, 3);
    celShade(ctx, tube, [tx - 3, ty - h, 6, h], { base: '#f2c033' }, lw);
    ctx.beginPath();
    ctx.ellipse(tx, ty - h, 2.6, 1.2, 0, 0, TAU);
    ctx.fillStyle = '#7a4a2a';
    ctx.fill();
  }
}

function drawPondScenery(ctx: Ctx, t: number, px: number): void {
  const lw = 1.4 * px;
  // Reeds at the edges: tapered ribbons, lit on one side.
  for (const [x, h] of [[24, 230], [44, 180], [62, 150], [968, 250], [950, 175], [930, 205]] as const) {
    const sway = Math.sin(t * 0.6 + x) * 7;
    const y = sandLineY(x) + 8;
    const reed = new Path2D();
    reed.moveTo(x - 3.5, y);
    reed.quadraticCurveTo(x - 2 + sway * 0.4, y - h * 0.55, x + sway, y - h);
    reed.quadraticCurveTo(x + 2 + sway * 0.4, y - h * 0.5, x + 3.5, y);
    reed.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y - h);
    g.addColorStop(0, '#3a5a2a');
    g.addColorStop(1, '#a8c46a');
    ctx.fillStyle = g;
    ctx.fill(reed);
    ctx.strokeStyle = rgba('#24391a', 0.55);
    ctx.lineWidth = lw * 0.6;
    ctx.stroke(reed);
  }
  // Lily pads seen from below: dark silhouettes against the bright surface, light glowing at the rims.
  for (const [x, r, stemLen] of [[210, 40, 160], [520, 30, 120], [760, 44, 190]] as const) {
    const bob = Math.sin(t * 0.9 + x) * 1.2;
    const y = 6 + bob;
    // Stem trailing down.
    const sway = Math.sin(t * 0.5 + x) * 8;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 3);
    ctx.quadraticCurveTo(x + 10 + sway, y + stemLen * 0.5, x + sway * 1.5, y + stemLen);
    ctx.strokeStyle = rgba('#3f5a2a', 0.55);
    ctx.lineWidth = lw * 1.6;
    ctx.stroke();
    const pad = new Path2D();
    pad.ellipse(x, y, r, r * 0.22, 0, 0.18, TAU - 0.08);
    pad.lineTo(x, y);
    pad.closePath();
    ctx.fillStyle = rgba('#2a4022', 0.82);
    ctx.fill(pad);
    ctx.strokeStyle = rgba(RIM_LIGHT, 0.55);
    ctx.lineWidth = lw * 1.2;
    ctx.stroke(pad);
    // Veins.
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = 0.3 + (i / 7) * (TAU - 0.4);
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.2);
    }
    ctx.strokeStyle = rgba('#54703a', 0.5);
    ctx.lineWidth = lw * 0.5;
    ctx.stroke();
  }
  // A sunken branch.
  const by = sandLineY(400) + 4;
  const branch = new Path2D();
  branch.moveTo(330, by + 2);
  branch.quadraticCurveTo(380, by - 14, 470, by - 6);
  branch.lineTo(472, by - 1);
  branch.quadraticCurveTo(384, by - 7, 334, by + 6);
  branch.closePath();
  celShade(ctx, branch, [330, by - 14, 142, 20], { base: '#8a6a42' }, lw);
}

function drawNightScenery(ctx: Ctx, t: number, px: number): void {
  // Glow anemones on the sand.
  for (const [x, r, hue] of [[150, 14, '#7ff0e0'], [610, 11, '#c4a0ff'], [880, 16, '#8fd8ff']] as const) {
    const y = sandLineY(x) + 6;
    const pulse = 0.6 + 0.4 * Math.sin(t * 1.4 + x);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(x, y - r, 0, x, y - r, r * 3);
    glow.addColorStop(0, rgba(hue, 0.35 * pulse));
    glow.addColorStop(1, rgba(hue, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 3, y - r * 4, r * 6, r * 4);
    ctx.restore();
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.28 + Math.sin(t * 1.1 + i + x) * 0.08;
      ctx.beginPath();
      ctx.moveTo(x, y - 2);
      ctx.quadraticCurveTo(x + Math.cos(a) * r * 0.6, y - 2 + Math.sin(a) * r * 0.5, x + Math.cos(a) * r, y - 2 + Math.sin(a) * r);
      ctx.strokeStyle = rgba(mix(hue, '#ffffff', 0.3), 0.85);
      ctx.lineWidth = 2.2 * px;
      ctx.stroke();
    }
    const stalk = blobPath(x, y - 1, 6, 3.5, hashSeq(Math.floor(x)), 7, 0.2);
    ctx.fillStyle = mix(hue, COOL_SHADOW, 0.6);
    ctx.fill(stalk);
  }
  // Drifting bioluminescent plankton.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 30; i++) {
    const x = ((i * 397) % TANK_WIDTH) + Math.sin(t * 0.3 + i) * 12;
    const y = 40 + ((i * 211) % (SAND_Y - 80)) + Math.cos(t * 0.25 + i * 1.7) * 10;
    const glow = 0.35 + 0.35 * Math.sin(t * 1.5 + i * 2.1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
    g.addColorStop(0, `rgba(160, 240, 255, ${glow})`);
    g.addColorStop(1, 'rgba(160, 240, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Scenery behind decor and fish. `reducedMotion` freezes the drifting bits. */
export function drawThemeScenery(ctx: Ctx, theme: ThemeId, timeSec: number, px: number, reducedMotion: boolean): void {
  const t = reducedMotion ? 0 : timeSec;
  if (theme === 'coral') drawCoralScenery(ctx, t, px);
  else if (theme === 'pond') drawPondScenery(ctx, t, px);
  else if (theme === 'night') drawNightScenery(ctx, t, px);
}
