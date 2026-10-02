// Cartoon fish drawn with Canvas paths. Every species faces +x in its own design space;
// drawFish() handles position, flip, tilt and stage scale.
import { FISH_ART_SCALE, MIN_FLIP_SCALE, OUTLINE_PX, SAD_DROOP, STAGE_SCALE } from '../game/constants';
import { SHINY_OUTLINE, SHINY_SPARKLE } from '../game/species';
import type { FishVariant, SpeciesId, Stage } from '../game/types';

export interface FishDrawParams {
  speciesId: SpeciesId;
  variant: FishVariant;
  shiny: boolean;
  stage: Stage;
  /** -1 (facing left) .. 1 (facing right); passes through 0 while flipping. */
  facing: number;
  /** Nose-up/down angle in radians (positive = nose down). */
  pitch: number;
  /** Wobble phase in radians; advances faster when swimming fast. */
  phase: number;
  blinking: boolean;
  sad: boolean;
  /** Puffer inflation 0..1. */
  inflate: number;
  /** Night theme glow color, or null. */
  glow: string | null;
  /** Tank units per CSS pixel (so outlines stay ~2px on screen). */
  px: number;
  /** Device pixels per CSS pixel (shadowBlur ignores transforms). */
  dpr: number;
  /** 1 normally, smaller with reduced motion. */
  wobbleAmp: number;
  /** Seconds, for twinkles. */
  time: number;
}

/** Per-species metadata in design units (before stage scale and FISH_ART_SCALE). */
export const FISH_ART: Record<SpeciesId, { mouthX: number; halfHeight: number }> = {
  danio: { mouthX: 19, halfHeight: 10 },
  guppy: { mouthX: 17, halfHeight: 12 },
  goldfish: { mouthX: 21, halfHeight: 18 },
  tetra: { mouthX: 17, halfHeight: 9 },
  betta: { mouthX: 21, halfHeight: 22 },
  angelfish: { mouthX: 19, halfHeight: 34 },
  clownfish: { mouthX: 22, halfHeight: 13 },
  puffer: { mouthX: 19, halfHeight: 19 },
  axolotl: { mouthX: 31, halfHeight: 16 },
  koi: { mouthX: 33, halfHeight: 13 },
};

export function fishScale(stage: Stage): number {
  return STAGE_SCALE[stage] * FISH_ART_SCALE;
}

/** Distance from the fish center to its mouth, in tank units. */
export function mouthOffset(speciesId: SpeciesId, stage: Stage): number {
  return FISH_ART[speciesId].mouthX * fishScale(stage);
}

export function fishHalfHeight(speciesId: SpeciesId, stage: Stage): number {
  return FISH_ART[speciesId].halfHeight * fishScale(stage);
}

// ---------------------------------------------------------------------------
// Shared painting helpers
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

interface Paint {
  ctx: Ctx;
  pal: FishVariant;
  outline: string;
  lw: number;
  glow: string | null;
  glowBlur: number;
  /** Eye size boost for babies (cuter). */
  eyeBoost: number;
  wob: number;
  p: FishDrawParams;
}

const PUPIL = '#2b2b3d';
const BLUSH = 'rgba(255, 130, 160, 0.35)';
const TAU = Math.PI * 2;

function fillStroke(c: Paint, fill: string | CanvasGradient, lwScale = 1): void {
  const { ctx } = c;
  ctx.fillStyle = fill;
  ctx.fill();
  if (c.glow) {
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = c.glowBlur;
  }
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = c.lw * lwScale;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function vGrad(c: Paint, top: number, bottom: number, from: string, mid: string, to: string): CanvasGradient {
  const g = c.ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, from);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, to);
  return g;
}

function hGrad(c: Paint, x0: number, x1: number, from: string, to: string): CanvasGradient {
  const g = c.ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

function bodyGrad(c: Paint, halfH: number): CanvasGradient {
  return vGrad(c, -halfH, halfH, c.pal.body, c.pal.body, c.pal.belly);
}

function ellipsePath(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

/** Runs `draw` clipped to the current path, then restores. */
function clipped(ctx: Ctx, draw: () => void): void {
  ctx.save();
  ctx.clip();
  draw();
  ctx.restore();
}

function eye(c: Paint, x: number, y: number, radius: number, pupilScale = 0.62): void {
  const { ctx } = c;
  const r = radius * c.eyeBoost;
  if (c.p.blinking) {
    ctx.beginPath();
    ctx.arc(x, y - r * 0.35, r * 0.85, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.strokeStyle = PUPIL;
    ctx.lineWidth = c.lw * 1.2;
    ctx.lineCap = 'round';
    ctx.stroke();
    return;
  }
  ellipsePath(ctx, x, y, r, r);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = c.lw * 0.8;
  ctx.stroke();
  ellipsePath(ctx, x + r * 0.18, y + r * 0.08, r * pupilScale, r * pupilScale);
  ctx.fillStyle = PUPIL;
  ctx.fill();
  ellipsePath(ctx, x + r * 0.02, y - r * 0.26, r * 0.26, r * 0.26);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ellipsePath(ctx, x + r * 0.42, y + r * 0.28, r * 0.11, r * 0.11);
  ctx.fill();
  if (c.p.sad) {
    // Droopy eyelid
    ctx.save();
    ellipsePath(ctx, x, y, r, r);
    ctx.clip();
    ctx.fillStyle = c.pal.body;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.2, y - r * 1.2);
    ctx.lineTo(x + r * 1.2, y - r * 1.2);
    ctx.lineTo(x + r * 1.2, y - r * 0.15);
    ctx.lineTo(x - r * 1.2, y - r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = c.lw * 0.8;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.2, y - r * 0.45);
    ctx.lineTo(x + r * 1.2, y - r * 0.15);
    ctx.stroke();
    ctx.restore();
  }
}

function mouth(c: Paint, x: number, y: number, w: number): void {
  const { ctx } = c;
  ctx.beginPath();
  if (c.p.sad) ctx.arc(x - w * 0.3, y + w * 0.9, w, 1.25 * Math.PI, 1.75 * Math.PI);
  else ctx.arc(x - w * 0.3, y - w * 0.5, w, 0.2 * Math.PI, 0.75 * Math.PI);
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = c.lw * 0.9;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function cheek(c: Paint, x: number, y: number, r: number): void {
  ellipsePath(c.ctx, x, y, r * 1.2, r * 0.75);
  c.ctx.fillStyle = BLUSH;
  c.ctx.fill();
}

/** Simple forked tail at `x`, wobbling. */
function forkTail(c: Paint, x: number, len: number, spread: number, fill: string | CanvasGradient): void {
  const { ctx } = c;
  ctx.save();
  ctx.translate(x, 0);
  ctx.rotate(c.wob);
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.quadraticCurveTo(-len * 0.5, -spread * 0.35, -len, -spread);
  ctx.quadraticCurveTo(-len * 0.6, 0, -len, spread);
  ctx.quadraticCurveTo(-len * 0.5, spread * 0.35, 2, 0);
  ctx.closePath();
  fillStroke(c, fill);
  ctx.restore();
}

/** Rounded fan tail. */
function fanTail(c: Paint, x: number, len: number, spread: number, fill: string | CanvasGradient): void {
  const { ctx } = c;
  ctx.save();
  ctx.translate(x, 0);
  ctx.rotate(c.wob);
  ctx.beginPath();
  ctx.moveTo(2, -spread * 0.2);
  ctx.quadraticCurveTo(-len * 0.35, -spread, -len, -spread);
  ctx.quadraticCurveTo(-len * 1.18, 0, -len, spread);
  ctx.quadraticCurveTo(-len * 0.35, spread, 2, spread * 0.2);
  ctx.closePath();
  fillStroke(c, fill);
  ctx.restore();
}

/** Small paddle fin (pectoral) that flaps with the wobble. */
function paddleFin(c: Paint, x: number, y: number, rx: number, ry: number): void {
  ellipsePath(c.ctx, x, y, rx, ry, 0.5 + Math.sin(c.p.phase * 1.3) * 0.3);
  fillStroke(c, c.pal.fin, 0.8);
}

/** Wavy flowing fin edge from (x0,y0) out to a trailing tip, back to (x1,y1). */
function flowingFin(c: Paint, x0: number, y0: number, x1: number, y1: number, tipX: number, tipY: number, fill: string | CanvasGradient): void {
  const { ctx } = c;
  const ripple = Math.sin(c.p.phase) * 3 * c.p.wobbleAmp;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + tipX) / 2, y0 + (tipY - y0) * 0.9 + ripple, tipX + ripple * 0.5, tipY + ripple);
  ctx.quadraticCurveTo((x1 + tipX) / 2 - ripple, (y1 + tipY) / 2 - ripple * 0.5, x1, y1);
  ctx.closePath();
  fillStroke(c, fill);
}

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

function drawDanio(c: Paint): void {
  const { ctx, pal } = c;
  forkTail(c, -17, 14, 9, pal.fin);
  // dorsal
  ctx.beginPath();
  ctx.moveTo(-1, -7.5);
  ctx.quadraticCurveTo(-5, -14, -10, -6.5);
  ctx.closePath();
  fillStroke(c, pal.fin, 0.8);
  // body
  ellipsePath(ctx, 0, 0, 20, 8.5);
  ctx.fillStyle = bodyGrad(c, 8.5);
  ctx.fill();
  clipped(ctx, () => {
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha = 0.55;
    for (const y of [-2.8, 0.6, 3.8]) ctx.fillRect(-22, y, 34, 1.5);
    ctx.globalAlpha = 1;
  });
  ellipsePath(ctx, 0, 0, 20, 8.5);
  fillStroke(c, 'rgba(0,0,0,0)');
  paddleFin(c, 3, 4, 4, 2);
  eye(c, 11, -2, 4.2);
  mouth(c, 18, 2.2, 2);
  cheek(c, 12.5, 3.5, 1.8);
}

function drawGuppy(c: Paint): void {
  const { ctx, pal } = c;
  // big flowing fan tail
  ctx.save();
  ctx.translate(-7, 0);
  ctx.rotate(c.wob * 1.2);
  const ripple = Math.sin(c.p.phase * 1.5) * 2.5 * c.p.wobbleAmp;
  ctx.beginPath();
  ctx.moveTo(2, -3);
  ctx.bezierCurveTo(-8, -16, -22, -18 + ripple, -26, -12);
  ctx.quadraticCurveTo(-30 + ripple, 0, -26, 12);
  ctx.bezierCurveTo(-22, 18 - ripple, -8, 16, 2, 3);
  ctx.closePath();
  fillStroke(c, hGrad(c, 0, -28, pal.fin, pal.accent));
  // tail dots
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const [dx, dy] of [[-14, -6], [-19, 2], [-12, 5], [-22, -3]] as const) {
    ellipsePath(ctx, dx, dy, 1.4, 1.4);
    ctx.fill();
  }
  ctx.restore();
  // dorsal
  ctx.beginPath();
  ctx.moveTo(2, -8);
  ctx.quadraticCurveTo(-3, -15, -8, -6);
  ctx.closePath();
  fillStroke(c, pal.fin, 0.8);
  ellipsePath(ctx, 4, 0, 13, 9);
  fillStroke(c, bodyGrad(c, 9));
  paddleFin(c, 5, 4, 3.5, 2);
  eye(c, 10, -2, 4.6);
  mouth(c, 16, 2.5, 1.8);
  cheek(c, 11, 4, 1.8);
}

function drawGoldfish(c: Paint): void {
  const { ctx, pal } = c;
  // double tail: two lobes
  ctx.save();
  ctx.translate(-14, 0);
  ctx.rotate(c.wob);
  const r = Math.sin(c.p.phase * 1.2) * 2.5 * c.p.wobbleAmp;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.bezierCurveTo(-6, dir * 6, -16, dir * (18 + r), -24, dir * (14 + r));
    ctx.quadraticCurveTo(-18, dir * 4, -10, 0);
    ctx.closePath();
    fillStroke(c, hGrad(c, 0, -24, pal.fin, pal.accent));
  }
  ctx.restore();
  // dorsal
  ctx.beginPath();
  ctx.moveTo(8, -14);
  ctx.quadraticCurveTo(-2, -26 + Math.sin(c.p.phase) * 1.5, -10, -12);
  ctx.closePath();
  fillStroke(c, pal.fin, 0.8);
  // chubby body
  ellipsePath(ctx, 2, 0, 19, 16);
  ctx.fillStyle = bodyGrad(c, 16);
  ctx.fill();
  clipped(ctx, () => {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = pal.accent;
    ellipsePath(ctx, -6, -6, 6, 4.5);
    ctx.fill();
    ellipsePath(ctx, 6, 8, 4, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
    // scale shimmer
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = c.lw * 0.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-4 + i * 6, -2, 4, -0.6 * Math.PI, 0.6 * Math.PI);
      ctx.stroke();
    }
  });
  ellipsePath(ctx, 2, 0, 19, 16);
  fillStroke(c, 'rgba(0,0,0,0)');
  paddleFin(c, 6, 9, 4.5, 2.6);
  eye(c, 12, -4, 5.6);
  mouth(c, 20, 3, 2.4);
  cheek(c, 13, 4.5, 2.4);
}

function drawTetra(c: Paint): void {
  const { ctx, pal } = c;
  forkTail(c, -15, 12, 8, pal.fin);
  ctx.beginPath();
  ctx.moveTo(-2, -7);
  ctx.quadraticCurveTo(-5, -12, -9, -5.5);
  ctx.closePath();
  fillStroke(c, pal.fin, 0.8);
  ellipsePath(ctx, 0, 0, 17, 7.5);
  ctx.fillStyle = bodyGrad(c, 7.5);
  ctx.fill();
  clipped(ctx, () => {
    // red-ish lower rear
    ctx.fillStyle = pal.fin;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-18, 1, 20, 8);
    ctx.globalAlpha = 1;
    // glowing neon stripe
    ctx.shadowColor = pal.accent;
    ctx.shadowBlur = 6 * c.p.dpr;
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(10, -2.6);
    ctx.quadraticCurveTo(-4, -3.4, -18, -1.2);
    ctx.lineTo(-18, 1);
    ctx.quadraticCurveTo(-4, -0.4, 10, -0.2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  });
  ellipsePath(ctx, 0, 0, 17, 7.5);
  fillStroke(c, 'rgba(0,0,0,0)');
  paddleFin(c, 3, 3.5, 3.2, 1.7);
  eye(c, 10, -1.5, 4);
  mouth(c, 15.5, 2.2, 1.6);
}

function drawBetta(c: Paint): void {
  const { ctx, pal } = c;
  const finGrad = hGrad(c, 0, -46, pal.fin, pal.accent);
  // huge veil tail with a rippling edge
  ctx.save();
  ctx.translate(-6, 0);
  ctx.rotate(c.wob * 0.8);
  ctx.beginPath();
  ctx.moveTo(2, -6);
  const steps = 7;
  const ph = c.p.phase;
  ctx.bezierCurveTo(-10, -24, -28, -28, -38, -22);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = -22 + t * 44;
    const x = -38 - Math.sin(t * Math.PI) * 8 - Math.sin(ph * 1.4 + t * 6) * 2.5 * c.p.wobbleAmp;
    ctx.lineTo(x, y);
  }
  ctx.bezierCurveTo(-28, 28, -10, 24, 2, 6);
  ctx.closePath();
  fillStroke(c, finGrad);
  // fin rays
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = c.lw * 0.5;
  for (const a of [-0.5, -0.2, 0.1, 0.4]) {
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-38 * Math.cos(a), 38 * Math.sin(a));
    ctx.stroke();
  }
  ctx.restore();
  // long dorsal and anal fins trailing back
  flowingFin(c, 14, -6, -4, -7, -14, -26, finGrad);
  flowingFin(c, 12, 6, -4, 7, -14, 24, finGrad);
  ellipsePath(ctx, 6, 0, 15, 8.5);
  fillStroke(c, bodyGrad(c, 8.5));
  paddleFin(c, 8, 4, 3.6, 2);
  eye(c, 14, -2, 4.4);
  mouth(c, 20, 2, 1.8);
  cheek(c, 15, 3.5, 1.8);
}

function drawAngelfish(c: Paint): void {
  const { ctx, pal } = c;
  const sway = Math.sin(c.p.phase) * 2 * c.p.wobbleAmp;
  // tall dorsal and anal fins sweeping back
  ctx.beginPath();
  ctx.moveTo(4, -15);
  ctx.quadraticCurveTo(-6, -36, -18 + sway, -40);
  ctx.quadraticCurveTo(-12, -20, -8, -6);
  ctx.closePath();
  fillStroke(c, pal.fin);
  ctx.beginPath();
  ctx.moveTo(4, 15);
  ctx.quadraticCurveTo(-6, 36, -18 - sway, 40);
  ctx.quadraticCurveTo(-12, 20, -8, 6);
  ctx.closePath();
  fillStroke(c, pal.fin);
  // pelvic threads
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = c.lw * 0.9;
  ctx.beginPath();
  ctx.moveTo(6, 12);
  ctx.quadraticCurveTo(4, 24, 1 - sway, 32);
  ctx.stroke();
  fanTail(c, -9, 12, 8, pal.fin);
  // diamond body
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(19, 1);
    ctx.bezierCurveTo(14, -10, 6, -18, 0, -18);
    ctx.bezierCurveTo(-7, -18, -11, -6, -11, 0);
    ctx.bezierCurveTo(-11, 6, -7, 18, 0, 18);
    ctx.bezierCurveTo(6, 18, 14, 10, 19, 1);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = bodyGrad(c, 18);
  ctx.fill();
  clipped(ctx, () => {
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha = 0.5;
    for (const x of [8, -1, -9]) ctx.fillRect(x - 1.5, -20, 3, 40);
    ctx.globalAlpha = 1;
  });
  body();
  fillStroke(c, 'rgba(0,0,0,0)');
  paddleFin(c, 6, 3, 3.5, 2);
  eye(c, 9, -3, 4.6);
  mouth(c, 17, 2, 1.7);
  cheek(c, 10, 3, 1.8);
}

function drawClownfish(c: Paint): void {
  const { ctx, pal } = c;
  fanTail(c, -18, 11, 10, pal.fin);
  // rounded dorsal (two humps)
  ctx.beginPath();
  ctx.moveTo(10, -9);
  ctx.quadraticCurveTo(6, -17, 0, -10);
  ctx.quadraticCurveTo(-6, -17, -14, -7);
  ctx.closePath();
  fillStroke(c, pal.fin, 0.8);
  ellipsePath(ctx, 1, 9, 6, 4, -0.3);
  fillStroke(c, pal.fin, 0.8);
  ellipsePath(ctx, 0, 0, 21, 11);
  ctx.fillStyle = bodyGrad(c, 11);
  ctx.fill();
  clipped(ctx, () => {
    for (const [x, w] of [[11, 3.4], [-2, 3.8], [-15, 2.8]] as const) {
      ellipsePath(ctx, x, 0, w + 1.1, 14);
      ctx.fillStyle = c.outline;
      ctx.fill();
      ellipsePath(ctx, x, 0, w, 14);
      ctx.fillStyle = pal.accent;
      ctx.fill();
    }
  });
  ellipsePath(ctx, 0, 0, 21, 11);
  fillStroke(c, 'rgba(0,0,0,0)');
  paddleFin(c, 5, 5, 4, 2.2);
  eye(c, 15, -2.5, 4.6);
  mouth(c, 20.5, 3, 1.8);
}

function drawPuffer(c: Paint): void {
  const { ctx, pal } = c;
  const inflate = c.p.inflate;
  const r = 17 + inflate * 7;
  // tiny tail
  ctx.save();
  ctx.translate(-r + 1, 0);
  ctx.rotate(c.wob * 1.4);
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.quadraticCurveTo(-5, -7, -8, -5);
  ctx.quadraticCurveTo(-6, 0, -8, 5);
  ctx.quadraticCurveTo(-5, 7, 1, 0);
  fillStroke(c, pal.fin, 0.8);
  ctx.restore();
  // spikes when inflated
  if (inflate > 0.05) {
    ctx.fillStyle = pal.belly;
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = c.lw * 0.7;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const len = 4.5 * inflate;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r);
      ctx.lineTo(Math.cos(a) * (r + len), Math.sin(a) * (r + len));
      ctx.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r);
      ctx.fill();
      ctx.stroke();
    }
  }
  ellipsePath(ctx, 0, 0, r, r * 0.95);
  ctx.fillStyle = vGrad(c, -r, r, pal.body, pal.body, pal.belly);
  ctx.fill();
  clipped(ctx, () => {
    ctx.fillStyle = pal.belly;
    ellipsePath(ctx, 2, r * 0.75, r * 1.05, r * 0.6);
    ctx.fill();
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha = 0.45;
    for (const [x, y] of [[-8, -9], [-1, -13], [-11, -2], [4, -8], [-5, -4]] as const) {
      ellipsePath(ctx, x * (r / 17), y * (r / 17), 1.6, 1.6);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  ellipsePath(ctx, 0, 0, r, r * 0.95);
  fillStroke(c, 'rgba(0,0,0,0)');
  // fluttering side fin
  ellipsePath(ctx, 2, 4, 3.5, 2 + Math.abs(Math.sin(c.p.phase * 3)) * 1.5, 0.6);
  fillStroke(c, pal.fin, 0.7);
  eye(c, r * 0.45, -r * 0.35, 6, 0.6);
  // little "o" mouth when puffed, smile otherwise
  if (inflate > 0.3) {
    ellipsePath(ctx, r - 1.5, r * 0.15, 1.6, 2);
    fillStroke(c, '#ff9eb0', 0.7);
  } else {
    mouth(c, r - 0.5, 3, 2.2);
  }
  cheek(c, r * 0.5, r * 0.15, 2.4);
}

function drawAxolotl(c: Paint): void {
  const { ctx, pal } = c;
  const walk = c.p.phase;
  // long flat tail fin
  ctx.save();
  ctx.translate(-14, 2);
  ctx.rotate(c.wob * 0.6);
  ctx.beginPath();
  ctx.moveTo(2, -6);
  ctx.bezierCurveTo(-10, -11, -24, -6, -34, 0 + Math.sin(walk) * 2 * c.p.wobbleAmp);
  ctx.bezierCurveTo(-24, 6, -10, 9, 2, 6);
  ctx.closePath();
  fillStroke(c, hGrad(c, 0, -34, pal.body, pal.fin));
  ctx.restore();
  // back legs (far side first, slightly darker)
  const leg = (x: number, phaseOffset: number, far: boolean) => {
    const swing = Math.sin(walk + phaseOffset) * 0.5 * c.p.wobbleAmp;
    ctx.save();
    ctx.translate(x, 7);
    ctx.rotate(swing);
    ellipsePath(ctx, 0, 4, 2.4, 5);
    fillStroke(c, far ? pal.fin : pal.body, 0.8);
    // toes
    ctx.fillStyle = far ? pal.fin : pal.body;
    ellipsePath(ctx, 1.5, 8.5, 2.6, 1.4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
  leg(-6, Math.PI, true);
  leg(14, 0, true);
  // body
  ellipsePath(ctx, 0, 3, 18, 8);
  fillStroke(c, bodyGrad(c, 10));
  leg(-9, 0, false);
  leg(11, Math.PI, false);
  // gills: three feathery stalks fanning out behind the head (the head covers their bases)
  const gill = (angle: number, len: number) => {
    ctx.save();
    ctx.translate(14, -5);
    ctx.rotate(angle + Math.sin(walk * 0.8 + angle) * 0.08 * c.p.wobbleAmp);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = c.lw * 1.8;
    ctx.stroke();
    ctx.fillStyle = pal.accent;
    for (let i = 0; i < 3; i++) {
      const fx = len * (0.5 + i * 0.2);
      for (const side of [-1, 1]) {
        ellipsePath(ctx, fx + 1, side * 1.8, 2.2, 1.1, side * 0.7);
        ctx.fill();
      }
    }
    ctx.restore();
  };
  gill(-1.6, 15);
  gill(-2.25, 17);
  gill(-2.85, 15);
  // big round head
  ellipsePath(ctx, 20, 0, 13, 11);
  fillStroke(c, bodyGrad(c, 11));
  eye(c, 25, -3, 2.4, 0.9);
  // wide smile
  ctx.beginPath();
  ctx.arc(26, 1, 6, 0.15 * Math.PI, c.p.sad ? 0.25 * Math.PI : 0.62 * Math.PI);
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = c.lw;
  ctx.stroke();
  cheek(c, 22, 5, 2.4);
}

function drawKoi(c: Paint): void {
  const { ctx, pal } = c;
  // flowing two-lobed tail
  ctx.save();
  ctx.translate(-27, 0);
  ctx.rotate(c.wob);
  const r = Math.sin(c.p.phase * 1.2) * 3 * c.p.wobbleAmp;
  ctx.beginPath();
  ctx.moveTo(3, 0);
  ctx.bezierCurveTo(-6, -4, -14, -16 - r, -22, -14 - r);
  ctx.quadraticCurveTo(-16, 0, -22, 14 + r);
  ctx.bezierCurveTo(-14, 16 + r, -6, 4, 3, 0);
  ctx.closePath();
  fillStroke(c, hGrad(c, 0, -22, pal.fin, pal.belly));
  ctx.restore();
  // long dorsal ridge
  ctx.beginPath();
  ctx.moveTo(12, -10);
  ctx.quadraticCurveTo(0, -18 + Math.sin(c.p.phase) * 1.5, -16, -8);
  ctx.closePath();
  fillStroke(c, pal.fin, 0.8);
  ellipsePath(ctx, 2, 0, 31, 11);
  ctx.fillStyle = bodyGrad(c, 11);
  ctx.fill();
  clipped(ctx, () => {
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(16, -6, 9, 6, 0.2, 0, TAU);
    ctx.ellipse(-4, -4, 8, 7, -0.3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-16, 3, 6, 4, 0.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
  ellipsePath(ctx, 2, 0, 31, 11);
  fillStroke(c, 'rgba(0,0,0,0)');
  paddleFin(c, 14, 7, 5.5, 2.6);
  // whiskers
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = c.lw * 0.8;
  for (const dy of [0, 2]) {
    ctx.beginPath();
    ctx.moveTo(31, 3 + dy);
    ctx.quadraticCurveTo(35, 5 + dy, 34 + Math.sin(c.p.phase + dy) * 1, 9 + dy);
    ctx.stroke();
  }
  eye(c, 23, -3, 4.2);
  mouth(c, 31, 2, 1.8);
  cheek(c, 24, 3, 2);
}

const SPECIES_DRAW: Record<SpeciesId, (c: Paint) => void> = {
  danio: drawDanio,
  guppy: drawGuppy,
  goldfish: drawGoldfish,
  tetra: drawTetra,
  betta: drawBetta,
  angelfish: drawAngelfish,
  clownfish: drawClownfish,
  puffer: drawPuffer,
  axolotl: drawAxolotl,
  koi: drawKoi,
};

function drawShinyGlints(c: Paint): void {
  const { ctx } = c;
  const art = FISH_ART[c.p.speciesId];
  const spots: [number, number, number][] = [
    [art.mouthX * 0.2, -art.halfHeight * 0.45, 0],
    [-art.mouthX * 0.35, art.halfHeight * 0.1, 2.1],
    [art.mouthX * 0.55, art.halfHeight * 0.35, 4.2],
  ];
  for (const [x, y, offset] of spots) {
    const tw = (Math.sin(c.p.time * 3 + offset) + 1) / 2;
    if (tw < 0.25) continue;
    drawStar(ctx, x, y, 2.6 * tw, SHINY_SPARKLE, SHINY_OUTLINE, c.lw * 0.5);
  }
}

/** 4-point twinkle star. */
export function drawStar(ctx: Ctx, x: number, y: number, r: number, fill: string, stroke: string | null, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Draws a fish centered at (x, y) in tank units. */
export function drawFish(ctx: Ctx, x: number, y: number, p: FishDrawParams): void {
  const scale = fishScale(p.stage);
  const dir = p.facing >= 0 ? 1 : -1;
  const tilt = (p.pitch + (p.sad ? SAD_DROOP : 0)) * dir;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // Squash through the flip but never to zero width, so a turning fish never vanishes.
  const flipX = dir * Math.max(MIN_FLIP_SCALE, Math.abs(p.facing));
  ctx.scale(flipX * scale, scale);

  const paint: Paint = {
    ctx,
    pal: p.variant,
    outline: p.shiny ? SHINY_OUTLINE : p.variant.outline,
    lw: (OUTLINE_PX * p.px) / scale,
    glow: p.glow,
    glowBlur: 8 * p.dpr,
    eyeBoost: p.stage === 'baby' ? 1.3 : p.stage === 'juvenile' ? 1.12 : 1,
    wob: Math.sin(p.phase) * 0.32 * p.wobbleAmp,
    p,
  };
  SPECIES_DRAW[p.speciesId](paint);
  if (p.shiny) drawShinyGlints(paint);
  ctx.restore();
}
