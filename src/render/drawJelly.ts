// Jellyfish drawing. The fish sprites bend in vertical strips (body wave); the jelly is the same idea
// turned on its side: the bell (above the per-sprite split line) pulses with squash & stretch and is
// never warped, so the face stays clean, while the tentacles below it are cut into thin HORIZONTAL
// strips that each slide sideways (sway, after-pulse ripple, current lean), growing from 0 at the
// split to the most at the tips. The tentacle tops follow the bell's bottom edge as it squashes.
// Everything is composed in one reused scratch canvas from a cached, pre-scaled, inner-glowing copy of
// the variant's hue-rotated sprite; no per-frame allocations.
import {
  JELLY_ALPHA,
  JELLY_FLASH_MS,
  JELLY_HALO_ALPHA,
  JELLY_HALO_SCALE,
  JELLY_INNER_GLOW,
  JELLY_NIGHT_GLOW_PX,
  JELLY_SHIMMER_ALPHA,
  JELLY_SHIMMER_SPEED,
  JELLY_TENTACLE_STRIPS,
  SPRITE_SIZE_BUCKET_PX,
} from '../game/constants';
import { bodyBob } from './fishMotion';
import { drawSpriteEyes, fishScale, FISH_ART, type FishDrawParams } from './drawFish';
import {
  bellPulse,
  bellSplitY,
  tentacleOffset,
  tentacleShape,
  tentacleWidth,
  type BellPulse,
  type TentacleShape,
  type TentacleState,
} from './jellyMotion';
import { mix, rgba } from './paint';
import { fishSprite, huedSprite, type Sprite } from './sprites';

type Ctx = CanvasRenderingContext2D;

/** Per-frame jelly animation state (from the actor; previews pass nothing and get the rest pose). */
export interface JellyDrawState {
  /** ms since the last pulse started. */
  sincePulse: number;
  pulseStrength: number;
  pulseTempo: number;
  /** −1 drifting down .. 1 rising. */
  rise: number;
  /** Tentacle lean at the tips (fraction of width). */
  lean: number;
  /** ms since the last tap (glow flash). */
  sinceFlash: number;
  /** A pellet sliding up the tentacles: progress 0..1 and where it started (tank units from the center), or null. */
  catch: { t: number; dx: number; dy: number; premium: boolean } | null;
}

const REST: JellyDrawState = { sincePulse: Infinity, pulseStrength: 0, pulseTempo: 1, rise: 0, lean: 0, sinceFlash: Infinity, catch: null };

/** A sprite pre-scaled to an on-screen width with a soft inner glow baked in, and its tentacle strip rows. */
interface JellyScaled {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  split: number;
  /** Row where the bell ends (px). */
  splitPx: number;
  /** n + 1 row boundaries of the tentacle strips, from splitPx to h. */
  rows: Int32Array;
}

const SCALED_PER_SPRITE = 6;
const scaledCache = new WeakMap<Sprite, Map<number, JellyScaled>>();

function stripRows(splitPx: number, h: number): Int32Array {
  const n = JELLY_TENTACLE_STRIPS;
  const rows = new Int32Array(n + 1);
  for (let i = 0; i <= n; i++) rows[i] = Math.round(splitPx + ((h - splitPx) * i) / n);
  return rows;
}

function jellyScaled(s: Sprite, width: number, split: number): JellyScaled | null {
  const w = Math.max(SPRITE_SIZE_BUCKET_PX, Math.ceil(width / SPRITE_SIZE_BUCKET_PX) * SPRITE_SIZE_BUCKET_PX);
  let sizes = scaledCache.get(s);
  if (!sizes) {
    sizes = new Map();
    scaledCache.set(s, sizes);
  }
  const hit = sizes.get(w);
  if (hit) {
    // The dev tool moved the split: only the strip rows change.
    if (hit.split !== split) {
      hit.split = split;
      hit.splitPx = Math.round(hit.h * split);
      hit.rows = stripRows(hit.splitPx, hit.h);
    }
    return hit;
  }
  const h = Math.max(1, Math.round((w * s.h) / s.w));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.imageSmoothingQuality = 'high';
  c.drawImage(s.canvas, 0, 0, w, h);
  // Soft inner glow: light from inside the bell, fading toward the rim and down the tentacles.
  c.globalCompositeOperation = 'source-atop';
  const g = c.createRadialGradient(w / 2, h * split * 0.55, 0, w / 2, h * split * 0.55, w * 0.55);
  g.addColorStop(0, `rgba(255, 255, 255, ${JELLY_INNER_GLOW})`);
  g.addColorStop(0.6, `rgba(255, 255, 255, ${JELLY_INNER_GLOW * 0.35})`);
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const splitPx = Math.round(h * split);
  const entry: JellyScaled = { canvas, w, h, split, splitPx, rows: stripRows(splitPx, h) };
  if (sizes.size >= SCALED_PER_SPRITE) {
    const oldest = sizes.keys().next().value;
    if (oldest !== undefined) sizes.delete(oldest);
  }
  sizes.set(w, entry);
  return entry;
}

/** Reused scratch canvas the jelly is composed in (grows, never shrinks). */
let scratch: HTMLCanvasElement | null = null;

function scratchCtx(w: number, h: number): Ctx | null {
  scratch ??= document.createElement('canvas');
  if (scratch.width < w) scratch.width = w;
  if (scratch.height < h) scratch.height = h;
  const c = scratch.getContext('2d');
  if (!c) return null;
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.clearRect(0, 0, w, h);
  return c;
}

/** A soft round light (white → clear), drawn tinted for the night halo. Cached per color. */
const haloCache = new Map<string, HTMLCanvasElement>();

function halo(color: string): HTMLCanvasElement {
  let h = haloCache.get(color);
  if (h) return h;
  h = document.createElement('canvas');
  h.width = h.height = 128;
  const c = h.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, rgba(mix(color, '#ffffff', 0.4), 1));
    g.addColorStop(0.45, rgba(color, 0.45));
    g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  haloCache.set(color, h);
  return h;
}

/** A horizontal rainbow band (two cycles) for the shiny shimmer, made once. */
let rainbow: HTMLCanvasElement | null = null;

function rainbowBand(): HTMLCanvasElement {
  if (rainbow) return rainbow;
  rainbow = document.createElement('canvas');
  rainbow.width = 256;
  rainbow.height = 4;
  const c = rainbow.getContext('2d');
  if (c) {
    const g = c.createLinearGradient(0, 0, 256, 0);
    const hues = [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720];
    hues.forEach((hue, i) => g.addColorStop(i / (hues.length - 1), `hsl(${hue % 360}, 100%, 70%)`));
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 4);
  }
  return rainbow;
}

const pulse: BellPulse = { sx: 1, sy: 1, squeeze: 0 };
const shape: TentacleShape = { sy: 1, tipSx: 1 };
const tent: TentacleState = { phase: 0, sway: 1, sincePulse: Infinity, ripple: 0, lean: 0 };

/** Glow boost 0..1 on a contraction and after a tap. */
function glowBoost(st: JellyDrawState): number {
  const flash = st.sinceFlash >= 0 && st.sinceFlash < JELLY_FLASH_MS ? 1 - st.sinceFlash / JELLY_FLASH_MS : 0;
  return Math.max(pulse.squeeze, flash);
}

/**
 * Draws a jellyfish centered at (x, y) in tank units: the hue-rotated sprite with pulse and tentacle
 * warping, or a simple drawn jelly if the sprite didn't load. No flip; `p.pitch` is the wobble angle.
 */
export function drawJelly(ctx: Ctx, x: number, y: number, p: FishDrawParams): void {
  const st = p.jelly ?? REST;
  const baby = p.stage === 'baby';
  bellPulse(st.sincePulse, st.pulseStrength, st.pulseTempo, pulse);
  // Gulps and taps squash the bell a little more.
  pulse.sx *= 1 - p.bounce * 0.6 - p.eat * 0.05;
  pulse.sy *= 1 + p.bounce * 0.6 + p.eat * 0.05;
  tentacleShape(st.rise, shape);
  const base = fishSprite(p.speciesId, p.stage);
  if (!base) {
    drawCodeJelly(ctx, x, y, p);
    return;
  }
  const s = huedSprite(base, p.variant.hue ?? 0);
  const scale = fishScale(p.stage);
  const len = FISH_ART[p.speciesId].spriteLen * scale;
  const ht = (len * s.h) / s.w;
  const split = bellSplitY(p.speciesId, p.stage);
  const sc = jellyScaled(s, (len * p.dpr) / p.px, split);
  if (!sc) return;
  const bob = bodyBob('pulse', baby, p.time, p.phase, 0);
  const boost = glowBoost(st);

  // Compose: tentacles first (their tops tuck under the bell), then the bell on top.
  const padX = Math.ceil(sc.w * 0.3);
  const padTop = Math.ceil(sc.splitPx * 0.08) + 2;
  const W = sc.w + padX * 2;
  const H = padTop + Math.ceil(sc.h * 1.12) + 4;
  const c = scratchCtx(W, H);
  if (!c) return;
  const cx = W / 2;
  const bellH = sc.splitPx;
  const bellCY = padTop + bellH / 2;
  const bellBottom = bellCY + (bellH / 2) * pulse.sy;
  tent.phase = p.phase;
  tent.sway = p.wobbleAmp * (baby ? 1.25 : 1) * (1 - 0.5 * (p.gloom ?? 0));
  tent.sincePulse = st.sincePulse;
  tent.ripple = st.pulseStrength * p.wobbleAmp;
  tent.lean = st.lean * p.wobbleAmp;
  const span = sc.h - sc.splitPx;
  const n = sc.rows.length - 1;
  for (let i = 0; i < n; i++) {
    const r0 = sc.rows[i]!;
    const r1 = sc.rows[i + 1]!;
    if (r1 <= r0) continue;
    const u = span > 0 ? ((r0 + r1) / 2 - sc.splitPx) / span : 0;
    const ws = tentacleWidth(u, pulse.sx, shape.tipSx);
    const dx = tentacleOffset(i, u, tent) * sc.w;
    const dw = sc.w * ws;
    // One extra pixel of overlap hides seams between the rescaled strips.
    c.drawImage(sc.canvas, 0, r0, sc.w, r1 - r0, cx - dw / 2 + dx, bellBottom - 1 + (r0 - sc.splitPx) * shape.sy, dw, (r1 - r0) * shape.sy + 1);
  }
  const bw = sc.w * pulse.sx;
  const bh = bellH * pulse.sy;
  c.drawImage(sc.canvas, 0, 0, sc.w, bellH, cx - bw / 2, bellCY - bh / 2, bw, bh);
  if (p.shiny) {
    // Slow rainbow iridescence washing across the body.
    const band = rainbowBand();
    const off = ((p.time * JELLY_SHIMMER_SPEED) % 1) * W;
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = JELLY_SHIMMER_ALPHA;
    c.drawImage(band, -off, 0, W * 2, H);
    c.drawImage(band, W * 2 - off, 0, W * 2, H);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  // Scratch px → tank units; the sprite's top-center (at rest) is the scratch's (cx, padTop).
  const k = len / sc.w;
  ctx.save();
  ctx.translate(x, y + bob.dy * ht * p.wobbleAmp);
  ctx.rotate(p.pitch);
  if (p.glow) {
    // Night: a faint halo on the water, brighter on each contraction.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = JELLY_HALO_ALPHA * (0.6 + 0.8 * boost);
    const hr = len * JELLY_HALO_SCALE * (1 + 0.15 * boost);
    ctx.drawImage(halo(p.glow), -hr, -ht / 2 + bellH * k * 0.5 - hr, hr * 2, hr * 2);
    ctx.restore();
  }
  ctx.globalAlpha = JELLY_ALPHA;
  if (p.glow) {
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = JELLY_NIGHT_GLOW_PX * p.dpr * (0.7 + 0.8 * boost);
  }
  const blit = () => ctx.drawImage(scratch!, 0, 0, W, H, -cx * k, -ht / 2 - padTop * k, W * k, H * k);
  blit();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  if (boost > 0.02) {
    // Bioluminescent brightening (night) / tap flash: the same image added on top, faintly.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = boost * (p.glow ? 0.35 : 0.18);
    blit();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
  if (st.catch) drawCaughtPellet(ctx, st.catch, -ht / 2 + bellH * k * 0.7, p.px);

  // Eyes ride on the bell's squash (around the bell's center).
  const bellCenter = -ht / 2 + (bellH * k) / 2;
  ctx.translate(0, bellCenter);
  ctx.scale(pulse.sx, pulse.sy);
  ctx.translate(0, -bellCenter);
  drawSpriteEyes(ctx, p, s, { left: -len / 2, len, ht, x, y, tilt: p.pitch, flipX: 1 }, p.gloom ?? 0);
  ctx.restore();
}

/** A caught pellet sliding up the tentacles into the bell, shrinking as it goes. */
function drawCaughtPellet(ctx: Ctx, c: NonNullable<JellyDrawState['catch']>, bellY: number, px: number): void {
  const t = c.t * c.t * (3 - 2 * c.t);
  const x = c.dx * (1 - t);
  const y = c.dy + (bellY - c.dy) * t;
  const r = 3.2 * (1 - t * 0.7);
  ctx.save();
  ctx.globalAlpha = 1 - t * 0.6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = c.premium ? '#ffd84a' : '#d9864a';
  ctx.fill();
  ctx.lineWidth = px;
  ctx.strokeStyle = c.premium ? '#b0861a' : '#8a4f22';
  ctx.stroke();
  ctx.restore();
}

/** Fallback art (sprite missing): a glossy dome with wavy tentacles, pulsing the same way. */
function drawCodeJelly(ctx: Ctx, x: number, y: number, p: FishDrawParams): void {
  const scale = fishScale(p.stage);
  const w = FISH_ART[p.speciesId].spriteLen * scale;
  const h = FISH_ART[p.speciesId].halfHeight * 2 * scale;
  const bellH = h * 0.42;
  const top = -h / 2;
  const body = p.variant.body;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.pitch);
  ctx.globalAlpha = JELLY_ALPHA;
  ctx.lineCap = 'round';
  ctx.strokeStyle = p.variant.fin;
  ctx.lineWidth = w * 0.07;
  const bottom = top + bellH * pulse.sy;
  for (let t = 0; t < 4; t++) {
    const tx = (t - 1.5) * w * 0.2 * pulse.sx;
    ctx.beginPath();
    ctx.moveTo(tx, bottom);
    for (let s = 1; s <= 6; s++) {
      const u = s / 6;
      ctx.lineTo(tx + Math.sin(p.phase - s * 0.6 + t) * w * 0.08 * u * p.wobbleAmp, bottom + (h - bellH) * u * shape.sy);
    }
    ctx.stroke();
  }
  const bw = (w / 2) * pulse.sx;
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, mix(body, '#ffffff', 0.35));
  g.addColorStop(1, body);
  ctx.beginPath();
  ctx.ellipse(0, bottom, bw, bellH * pulse.sy, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(p.px * 2, w * 0.03);
  ctx.strokeStyle = p.variant.outline;
  ctx.stroke();
  ctx.restore();
}
