// Rescue Stories visuals, all drawn in code over the normal sprites: bandage, cracks, eye stalks while molting,
// the sparkle-heal, and the pelican that delivers the animal. Reads the store's transient view once per frame.
import type { StageVisual } from '../game/rescues/types';
import { ASSET_BASE } from './sprites';

type Ctx = CanvasRenderingContext2D;

export interface RescueView {
  /** Visual state per recovering fish. */
  visuals: ReadonlyMap<string, StageVisual>;
  pelican: { fishId: string; at: number } | null;
  heal: { fishId: string; done: boolean; at: number } | null;
}
export const NO_RESCUE_VIEW: RescueView = { visuals: new Map(), pelican: null, heal: null };

const BURROW_PEEK_MIN = 0.12;

/**
 * How sunk into the sand a burrowed animal is right now (0 out … 1 buried). Trust shortens the hiding stretches and
 * lengthens the peeks: now and then he slides out, then rushes back.
 */
export function burrowAmount(visual: StageVisual, timeSec: number, phase = 0): number {
  const base = visual.burrow ?? 0;
  const trust = clamp01(visual.trust ?? 0);
  if (base <= 0) return 0;
  const peekDepth = Math.max(BURROW_PEEK_MIN, base * (0.15 + 0.5 * trust));
  const resting = base - 0.1 * trust;
  const period = 16 - 9 * trust;
  const stay = 1.2 + 3.3 * trust;
  const t = (timeSec + phase) % period;
  if (t > stay) return resting;
  const edge = Math.min(0.35, stay / 3);
  const k = t < edge ? smooth(t / edge) : t > stay - edge * 0.4 ? 1 - smooth((t - (stay - edge * 0.4)) / (edge * 0.4)) : 1;
  return resting + (peekDepth - resting) * k;
}

export const PELICAN_MS = 4200;
export const HEAL_MS = 1800;
/** The fish appears (fades in) once the pelican has lowered it. */
const DROP_AT = 0.55;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 0..1 while the pelican is delivering this fish, else null. */
export function flightProgress(view: RescueView, fishId: string, reduced: boolean): number | null {
  if (!view.pelican || view.pelican.fishId !== fishId || reduced) return null;
  const t = (Date.now() - view.pelican.at) / PELICAN_MS;
  return t >= 0 && t < 1 ? t : null;
}

/** Opacity of a fish being delivered (0 until lowered, then fades in). */
export const deliveryAlpha = (t: number): number => smooth(clamp01((t - DROP_AT) / 0.25));

export interface Box {
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  facing: 1 | -1;
}

export function drawBandage(ctx: Ctx, box: Box, anchor: { x: number; y: number }, px: number): void {
  const x = box.x + (anchor.x - 0.5) * 2 * box.halfW * box.facing;
  const y = box.y + (anchor.y - 0.5) * 2 * box.halfH;
  const w = box.halfH * 0.55;
  const h = box.halfH * 0.28;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.45);
  ctx.fillStyle = '#fff4dc';
  ctx.strokeStyle = '#b08850';
  ctx.lineWidth = 2.2 * px;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, h / 2.2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8c88c';
  ctx.fillRect(-w * 0.12, -h / 2 + 1.5 * px, w * 0.24, h - 3 * px);
  ctx.restore();
}

export function drawCracks(ctx: Ctx, box: Box, px: number): void {
  const { x, y, halfW, halfH } = box;
  ctx.save();
  ctx.strokeStyle = 'rgba(70,30,20,0.85)';
  ctx.lineWidth = 2 * px;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const line = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([a, b], i) => (i === 0 ? ctx.moveTo(x + a * halfW, y + b * halfH) : ctx.lineTo(x + a * halfW, y + b * halfH)));
    ctx.stroke();
  };
  line([[-0.15, -0.55], [-0.05, -0.3], [-0.22, -0.1], [-0.08, 0.15]]);
  line([[-0.05, -0.3], [0.12, -0.22], [0.2, 0.02]]);
  ctx.restore();
}

/** Two eye stalks peeking up (the molting day). */
export function drawEyeStalks(ctx: Ctx, box: Box, px: number): void {
  ctx.save();
  for (const dx of [-0.18, 0.18]) {
    const x = box.x + dx * box.halfW * 2;
    const y = box.y - box.halfH * 0.5;
    ctx.strokeStyle = '#a8301a';
    ctx.lineWidth = 3 * px;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + box.halfH * 0.25);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#6a1a0a';
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.arc(x, y, box.halfH * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(x, y, box.halfH * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function star(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.35;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Sparkle-heal: stars spiral out and fade; a bigger burst when the whole rescue is done. */
export function drawHeal(ctx: Ctx, view: RescueView, at: { x: number; y: number; r: number }, reduced: boolean): void {
  const heal = view.heal;
  if (!heal) return;
  const t = (Date.now() - heal.at) / HEAL_MS;
  if (t < 0 || t >= 1) return;
  const n = heal.done ? 14 : 8;
  ctx.save();
  ctx.fillStyle = heal.done ? '#ffe36a' : '#9cffc8';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (reduced ? 0 : t * 2);
    const d = at.r * (0.5 + t * 1.3);
    ctx.globalAlpha = (1 - t) * (reduced ? 0.6 : 1);
    star(ctx, at.x + Math.cos(a) * d, at.y + Math.sin(a) * d * 0.8 - t * 20, 5 + (i % 3) * 2);
  }
  ctx.restore();
}

let pelicanImg: HTMLImageElement | null = null;
function pelicanSprite(): HTMLImageElement | null {
  if (!pelicanImg) {
    pelicanImg = new Image();
    pelicanImg.src = `${ASSET_BASE}pelican.png`;
  }
  return pelicanImg.complete && pelicanImg.naturalWidth > 0 ? pelicanImg : null;
}

/** The pelican flies in from the right, lowers the animal at (x, y), then flies off to the left. It faces left. */
export function drawPelican(ctx: Ctx, t: number, target: { x: number; y: number }, tankW: number): void {
  const size = 150;
  const startX = tankW + size;
  const dropX = target.x;
  const flyY = 120;
  let x: number;
  let y: number;
  if (t < DROP_AT) {
    const k = smooth(t / DROP_AT);
    x = startX + (dropX - startX) * k;
    y = flyY + (target.y - 70 - flyY) * k * k;
  } else {
    const k = smooth((t - DROP_AT) / (1 - DROP_AT));
    x = dropX - (dropX + size) * k;
    y = target.y - 70 - (target.y - 70 - 40) * k;
  }
  const flap = Math.sin(t * 40) * 0.06;
  const img = pelicanSprite();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(flap);
  if (img) ctx.drawImage(img, -size / 2, -size / 2, size, size);
  else {
    ctx.font = `${size * 0.6}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🦤', 0, 0);
  }
  ctx.restore();
}

/** Tiny round glasses on the eye (the Professor's reward, which stays). `eye` is the eye as fractions of the trimmed box. */
export function drawGlasses(ctx: Ctx, box: Box, eye: { x: number; y: number }, px: number): void {
  const x = box.x + (eye.x - 0.5) * 2 * box.halfW * box.facing;
  const y = box.y + (eye.y - 0.5) * 2 * box.halfH;
  const r = box.halfH * 0.3;
  ctx.save();
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 2.4 * px;
  ctx.fillStyle = 'rgba(190,230,255,0.28)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // The arm back toward the gill, and a white glint.
  ctx.beginPath();
  ctx.moveTo(x - box.facing * r, y);
  ctx.lineTo(x - box.facing * r * 2.1, y - r * 0.15);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.6 * px;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.68, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();
}

/** A few grey whisker highlights by the mouth (the older look). */
export function drawGreyWhiskers(ctx: Ctx, box: Box, px: number): void {
  const mx = box.x + box.facing * (box.halfW / 0.9);
  const my = box.y + box.halfH * 0.3;
  ctx.save();
  ctx.strokeStyle = 'rgba(235,235,240,0.95)';
  ctx.lineWidth = 2.2 * px;
  ctx.lineCap = 'round';
  for (const [dy, len] of [[-0.12, 0.5], [0.04, 0.62], [0.2, 0.46]] as const) {
    ctx.beginPath();
    ctx.moveTo(mx - box.facing * box.halfH * 0.08, my + box.halfH * dy * 0.5);
    ctx.lineTo(mx + box.facing * box.halfH * len, my + box.halfH * dy * 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** A small rain-cloud puff above a lonely animal; `t` loops 0..1 (rises and fades). */
export function drawLonelyCloud(ctx: Ctx, x: number, y: number, t: number, px: number): void {
  ctx.save();
  ctx.globalAlpha = Math.sin(Math.PI * t) * 0.9;
  ctx.font = `${Math.round(22 * px)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('🌧️', x, y - t * 18);
  ctx.restore();
}

/** Tips shown as speech bubbles (fishId → text + expiry), set by taps on the Professor. */
export const tipBubbles = new Map<string, { text: string; until: number }>();

export function drawTipBubble(ctx: Ctx, x: number, y: number, text: string, px: number): void {
  const size = 15 * px;
  ctx.save();
  ctx.font = `700 ${size}px Nunito, system-ui, sans-serif`;
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > 190 * px && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  lines.push(cur);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18 * px;
  const h = lines.length * size * 1.25 + 14 * px;
  const bx = x - w / 2;
  const by = y - h - 16 * px;
  ctx.fillStyle = '#fffdf4';
  ctx.strokeStyle = '#6b5a3a';
  ctx.lineWidth = 2.4 * px;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 10 * px);
  ctx.moveTo(x - 7 * px, by + h);
  ctx.lineTo(x, by + h + 12 * px);
  ctx.lineTo(x + 7 * px, by + h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3a2f1a';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, x, by + 7 * px + size * (1 + i * 1.25) - 3 * px));
  ctx.restore();
}
