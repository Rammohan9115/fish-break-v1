// Background life: the picture seen through moving water (strip warp), soft swaying god rays,
// rippling caustics on the sand, a shimmering surface band with ripple rings where food drops in,
// drifting specks in three depth layers, and now and then a distant school crossing the back.
// Everything is slow and low-contrast; budgets come from the quality preset.
import {
  CAUSTIC_ABOVE_SAND,
  CAUSTIC_ALPHA,
  CAUSTIC_SPEED,
  CURRENT_DRIFT,
  RAY_ALPHA,
  RAY_SPEED,
  RAY_SWAY,
  RIPPLE_LIFE_S,
  RIPPLE_RADIUS,
  SAND_Y,
  SCHOOL_ALPHA,
  SCHOOL_FIRST_S,
  SCHOOL_MAX_S,
  SCHOOL_MIN_S,
  SCHOOL_SIZE,
  SCHOOL_SPEED,
  SURFACE_BAND,
  SURFACE_GLINTS,
  WARP_AMP_PX,
  WARP_SAND_SHARE,
  WARP_SPEED,
  WARP_WAVELENGTH,
} from '../../game/constants';
import type { Placement } from '../background';
import type { Extent, ThemePalette } from '../drawTank';
import { makeCanvas } from '../assets';
import { rgba, toRgb } from '../paint';
import type { CurrentState } from './currents';
import type { DayLight } from './dayCycle';
import { smoothstep } from './noise';
import type { QualityPreset } from './quality';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export interface FxFrame {
  ctx: Ctx;
  /** What's on screen, and everything that can be (panning range). */
  view: Extent;
  ext: Extent;
  /** Device pixels per tank unit, and the camera's top edge (for pixel-aligned strips). */
  k: number;
  camY: number;
  dt: number;
  timeSec: number;
  preset: QualityPreset;
  reduced: boolean;
  current: CurrentState;
  day: DayLight;
  pal: ThemePalette;
}

// ---------------------------------------------------------------------------
// Water warp
// ---------------------------------------------------------------------------

/** Horizontal sway (tank units) of the background row at world y. Calmer below the sand line. Pure. */
export function warpOffset(y: number, timeSec: number, amp: number): number {
  const a = (y / WARP_WAVELENGTH) * TAU + timeSec * WARP_SPEED * TAU;
  const wave = Math.sin(a) * 0.7 + Math.sin(a * 0.53 + 1.7 + timeSec * 0.3) * 0.3;
  return wave * amp * (y > SAND_Y ? WARP_SAND_SHARE : 1);
}

/**
 * Draws the picture in horizontal strips, each nudged sideways by `warpOffset`, as if seen through
 * gently moving water. Strip edges sit on whole device rows so no seams show.
 */
export function drawWarpedImage(
  ctx: Ctx,
  img: CanvasImageSource,
  iw: number,
  ih: number,
  p: Placement,
  view: Extent,
  grid: { k: number; camY: number; dpr: number },
  timeSec: number,
  strips: number,
): void {
  const { k, camY, dpr } = grid;
  if (strips <= 0) {
    ctx.drawImage(img, p.x, p.y, p.w, p.h);
    return;
  }
  // CSS px → tank units: k is device px per unit, so one CSS px is dpr / k units.
  const ampWorld = (WARP_AMP_PX * dpr) / k;
  const devTop = Math.floor((Math.max(view.y0, p.y) - camY) * k);
  const devBottom = Math.ceil((Math.min(view.y1, p.y + p.h) - camY) * k);
  const rows = Math.max(1, devBottom - devTop);
  for (let i = 0; i < strips; i++) {
    const ya = camY + (devTop + Math.round((i * rows) / strips)) / k;
    const yb = camY + (devTop + Math.round(((i + 1) * rows) / strips)) / k;
    if (yb <= ya) continue;
    const sy = ((ya - p.y) / p.h) * ih;
    const sh = ((yb - ya) / p.h) * ih;
    const dx = warpOffset((ya + yb) / 2, timeSec, ampWorld);
    ctx.drawImage(img, 0, sy, iw, sh, p.x + dx, ya, p.w, yb - ya);
  }
}

// ---------------------------------------------------------------------------
// Textures (built once)
// ---------------------------------------------------------------------------

const rayTextures = new Map<string, HTMLCanvasElement>();

/** A soft light shaft: narrow at the surface, wider and fading toward the bottom, soft edges. */
function rayTexture(color: string): HTMLCanvasElement {
  const hit = rayTextures.get(color);
  if (hit) return hit;
  const W = 64;
  const H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(W, H);
    const [r, g, b] = toRgb(color);
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      const half = (0.35 + 0.65 * v) * (W / 2);
      const fade = Math.pow(1 - v, 1.3) * smoothstep(v / 0.08);
      for (let x = 0; x < W; x++) {
        const d = Math.abs(x + 0.5 - W / 2) / half;
        const edge = d >= 1 ? 0 : 1 - smoothstep(d);
        const o = (y * W + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = Math.round(255 * edge * fade);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  rayTextures.set(color, c);
  return c;
}

let dotSoft: HTMLCanvasElement | null = null;
let dotCrisp: HTMLCanvasElement | null = null;

/** Round white specks: a blurry one (far layer, glows) and a crisper one (near layers). */
function dotTexture(soft: boolean): HTMLCanvasElement {
  const cached = soft ? dotSoft : dotCrisp;
  if (cached) return cached;
  const S = 32;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(soft ? 0.15 : 0.45, `rgba(255,255,255,${soft ? 0.7 : 0.95})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  if (soft) dotSoft = c;
  else dotCrisp = c;
  return c;
}

let schoolFish: HTMLCanvasElement | null = null;

/** A tiny, blurred fish silhouette facing +x (stamped several times for a soft edge). */
function schoolFishTexture(): HTMLCanvasElement {
  if (schoolFish) return schoolFish;
  const W = 48;
  const H = 26;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  if (ctx) {
    const shape = new Path2D();
    shape.ellipse(26, 13, 13, 7, 0, 0, TAU);
    shape.moveTo(15, 13);
    shape.lineTo(5, 6);
    shape.lineTo(7, 13);
    shape.lineTo(5, 20);
    shape.closePath();
    ctx.fillStyle = '#ffffff';
    for (const [dx, dy, a] of [[0, 0, 0.6], [1.5, 0, 0.25], [-1.5, 0, 0.25], [0, 1.5, 0.25], [0, -1.5, 0.25]] as const) {
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.fill(shape);
      ctx.restore();
    }
  }
  schoolFish = c;
  return c;
}

/** A texture tinted to `color` (source-in fill), cached per color. */
const tinted = new Map<string, HTMLCanvasElement>();
function tint(src: HTMLCanvasElement, key: string, color: string): HTMLCanvasElement {
  const k = `${key}:${color}`;
  const hit = tinted.get(k);
  if (hit) return hit;
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  tinted.set(k, c);
  return c;
}

// ---------------------------------------------------------------------------
// The effects
// ---------------------------------------------------------------------------

interface Speck {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  twinkle: boolean;
}

interface Ripple {
  x: number;
  age: number;
}

interface SchoolMember {
  dx: number;
  dy: number;
  phase: number;
  size: number;
}

interface School {
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  members: SchoolMember[];
}

const LAYER_SIZE: [number, number][] = [
  [0.7, 1.2],
  [1, 1.8],
  [1.5, 2.6],
];
const LAYER_ALPHA = [0.22, 0.38, 0.5];
const LAYER_SPEED = [0.45, 0.75, 1];

export class BackgroundFx {
  private readonly specks: Speck[][] = [[], [], []];
  private ripples: Ripple[] = [];
  private school: School | null = null;
  private nextSchoolAt: number;
  private time = 0;
  /** Integrated current, so the surface glints drift with it. */
  private surfaceShift = 0;
  private caustic: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; data: ImageData; frame: number } | null = null;

  constructor(private readonly rng: () => number = Math.random) {
    this.nextSchoolAt = SCHOOL_FIRST_S + rng() * 30;
  }

  /** A ripple ring on the surface above x (food dropped in). */
  ripple(x: number): void {
    this.ripples.push({ x, age: 0 });
  }

  /** Dev: send a distant school across now. */
  forceSchool(f: Pick<FxFrame, 'ext' | 'view'>): void {
    this.spawnSchool(f.ext, f.view);
  }

  update(f: FxFrame): void {
    const { dt, current, ext, view, preset } = f;
    this.time += dt;
    this.surfaceShift += current.total * 7 * dt;
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < RIPPLE_LIFE_S);

    for (let layer = 0; layer < 3; layer++) {
      const list = this.specks[layer]!;
      const want = preset.particles[layer]!;
      while (list.length < want) list.push(this.newSpeck(layer, ext, view, true));
      list.length = want;
      const drift = CURRENT_DRIFT[layer]! * current.total;
      const speed = LAYER_SPEED[layer]!;
      for (const s of list) {
        s.phase += dt * 0.6;
        s.x += (s.vx * speed + drift + Math.sin(s.phase) * 1.2 * speed) * dt;
        s.y += (s.vy * speed + Math.cos(s.phase * 0.7) * 0.8 * speed) * dt;
        if (s.y < view.y0 + 4) s.y = SAND_Y - 10;
        if (s.y > SAND_Y - 4) s.y = view.y0 + 10;
        if (s.x < ext.x0 - 8) s.x = ext.x1 + 6;
        if (s.x > ext.x1 + 8) s.x = ext.x0 - 6;
      }
    }

    if (preset.silhouettes) {
      if (!this.school && this.time >= this.nextSchoolAt) this.spawnSchool(ext, view);
    }
    if (this.school) {
      const s = this.school;
      s.x += s.dir * s.speed * dt;
      const tail = s.x - s.dir * 90;
      if ((s.dir > 0 && tail > ext.x1 + 40) || (s.dir < 0 && tail < ext.x0 - 40)) {
        this.school = null;
        this.nextSchoolAt = this.time + SCHOOL_MIN_S + this.rng() * (SCHOOL_MAX_S - SCHOOL_MIN_S);
      }
    }
  }

  private newSpeck(layer: number, ext: Extent, view: Extent, anywhere: boolean): Speck {
    const [r0, r1] = LAYER_SIZE[layer]!;
    return {
      x: ext.x0 + this.rng() * (ext.x1 - ext.x0),
      y: anywhere ? view.y0 + 10 + this.rng() * (SAND_Y - view.y0 - 20) : SAND_Y - 10,
      r: r0 + this.rng() * (r1 - r0),
      vx: (this.rng() - 0.5) * 3,
      vy: -(0.6 + this.rng() * 1.8),
      phase: this.rng() * TAU,
      twinkle: this.rng() < 0.3,
    };
  }

  private spawnSchool(ext: Extent, view: Extent): void {
    const dir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
    const n = SCHOOL_SIZE[0] + Math.floor(this.rng() * (SCHOOL_SIZE[1] - SCHOOL_SIZE[0] + 1));
    const top = Math.max(view.y0, 0);
    const members: SchoolMember[] = [];
    for (let i = 0; i < n; i++) {
      members.push({ dx: (this.rng() - 0.5) * 140, dy: (this.rng() - 0.5) * 50, phase: this.rng() * TAU, size: 7 + this.rng() * 5 });
    }
    this.school = {
      x: dir > 0 ? ext.x0 - 90 : ext.x1 + 90,
      y: top + (SAND_Y - top) * (0.22 + this.rng() * 0.3),
      dir,
      speed: SCHOOL_SPEED * (0.8 + this.rng() * 0.4),
      members,
    };
  }

  /** Distant school: blurred, low-contrast, behind everything but the background. */
  drawSchool(f: FxFrame): void {
    const s = this.school;
    if (!s) return;
    const { ctx, timeSec, day } = f;
    const tex = tint(schoolFishTexture(), 'school', f.pal.far);
    ctx.save();
    ctx.globalAlpha = SCHOOL_ALPHA * (1 - day.particleGlow * 0.4);
    for (const m of s.members) {
      const x = s.x + m.dx;
      const y = s.y + m.dy + Math.sin(timeSec * 1.4 + m.phase) * 3;
      const w = m.size * 2;
      const h = (w * tex.height) / tex.width;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s.dir, 1);
      ctx.rotate(Math.sin(timeSec * 1.4 + m.phase + 1.2) * 0.06);
      ctx.drawImage(tex, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.restore();
  }

  /** 4–6 soft god rays from the surface, slowly swaying, fading in and out, breathing in width. */
  drawRays(f: FxFrame): void {
    const { ctx, view, timeSec, day, pal, preset, reduced } = f;
    if (reduced) return;
    const n = Math.round(preset.rays * day.rayCount);
    if (n <= 0) return;
    const tex = rayTexture(pal.light);
    const vw = view.x1 - view.x0;
    const length = (SAND_Y + 40 - view.y0) * day.rayLength;
    const strength = RAY_ALPHA * (pal.rayStrength / 0.26) * day.rays;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < n; i++) {
      const t = timeSec * RAY_SPEED;
      const x = view.x0 + (vw * (i + 0.5)) / n + Math.sin(t * 0.7 + i * 2.1) * vw * 0.04;
      const angle = -0.12 + day.sunX * 0.14 + Math.sin(t + i * 1.3) * RAY_SWAY;
      const width = vw * 0.075 * (1 + 0.35 * Math.sin(t * 1.3 + i * 2.7));
      const fade = 0.3 + 0.7 * smoothstep(0.5 + 0.5 * Math.sin(t * 0.9 + i * 1.9));
      ctx.globalAlpha = strength * fade;
      ctx.save();
      ctx.translate(x, view.y0 - 10);
      ctx.rotate(angle);
      ctx.drawImage(tex, -width / 2, 0, width, length);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Rippling light network on the sand: a small procedural buffer, stretched softly over the floor. */
  drawCaustics(f: FxFrame): void {
    const { ctx, view, timeSec, preset, pal, day } = f;
    const W = preset.causticW;
    const H = Math.max(16, Math.round(W / 5));
    if (!this.caustic || this.caustic.canvas.width !== W) {
      const canvas = makeCanvas(W, H);
      const cctx = canvas.getContext('2d');
      if (!cctx) return;
      this.caustic = { canvas, ctx: cctx, data: cctx.createImageData(W, H), frame: 0 };
    }
    const c = this.caustic;
    const top = SAND_Y - CAUSTIC_ABOVE_SAND;
    const bottom = view.y1;
    if (bottom <= top) return;
    if (c.frame++ % preset.causticEveryFrames === 0) {
      const [r, g, b] = toRgb(pal.light);
      const t = (f.reduced ? 0 : timeSec) * CAUSTIC_SPEED;
      const drift = this.surfaceShift * 0.02;
      const vw = view.x1 - view.x0;
      const d = c.data.data;
      // Terms that depend only on the column or only on the row are computed once per line.
      const colX = new Float32Array(W);
      const colA = new Float32Array(W);
      const colB = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        const X = (view.x0 + (x / (W - 1)) * vw) / 55 + drift;
        colX[x] = X;
        colA[x] = Math.sin(X * 0.8 - t * 0.5) * 1.4;
        colB[x] = Math.sin(X * 0.5 + t * 0.9);
      }
      for (let y = 0; y < H; y++) {
        const v = y / (H - 1);
        // Denser toward the back (top), like a floor seen in perspective.
        const persp = 1 + (1 - v) * 1.4;
        const fade = smoothstep(v / 0.45) * 200;
        const Y = ((v * (bottom - top)) / 22) * persp;
        const rowA = Math.sin(Y * 1.3 + t * 0.8) * 1.2;
        const rowB = Y * 1.7 - t * 0.7;
        for (let x = 0; x < W; x++) {
          const X = colX[x]! * persp;
          const a = 1 - Math.abs(Math.sin(X + t + rowA));
          const b2 = 1 - Math.abs(Math.sin(rowB + colA[x]!));
          const c3 = 1 - Math.abs(Math.sin((X + Y) * 0.7 + t * 0.55 + colB[x]!));
          const a3 = a * a * a;
          const b3 = b2 * b2 * b2;
          const c33 = c3 * c3 * c3;
          const o = (y * W + x) * 4;
          d[o] = r;
          d[o + 1] = g;
          d[o + 2] = b;
          d[o + 3] = Math.min(255, (a3 * a3 + b3 * b3 + c33 * c33) * fade);
        }
      }
      c.ctx.putImageData(c.data, 0, 0);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = CAUSTIC_ALPHA * (pal.causticStrength / 0.5) * Math.max(0.35, day.rays);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c.canvas, view.x0, top, view.x1 - view.x0, bottom - top);
    ctx.restore();
  }

  /** Shimmering band at the water's surface, with drifting highlights and ripple rings. */
  drawSurface(f: FxFrame, px: number): void {
    const { ctx, view, timeSec, ext } = f;
    const y0 = view.y0;
    const band = ctx.createLinearGradient(0, y0, 0, y0 + SURFACE_BAND);
    band.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    band.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.save();
    ctx.fillStyle = band;
    ctx.fillRect(view.x0, y0, view.x1 - view.x0, SURFACE_BAND);
    ctx.globalCompositeOperation = 'screen';
    const span = ext.x1 - ext.x0 + 80;
    for (let i = 0; i < SURFACE_GLINTS; i++) {
      const speed = 5 + (i % 3) * 3;
      const raw = i * 97.3 + (f.reduced ? 0 : timeSec * speed) + this.surfaceShift;
      const x = ext.x0 - 40 + (((raw % span) + span) % span);
      const y = y0 + 4 + (i % 4) * 4.5;
      const len = 16 + ((i * 37) % 26);
      const a = 0.15 + 0.4 * Math.max(0, Math.sin(timeSec * 1.1 + i * 2.3));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.ellipse(x, y, len / 2, 1.5, 0, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const r of this.ripples) {
      const t = r.age / RIPPLE_LIFE_S;
      for (const [delay, scale] of [[0, 1], [0.18, 0.62]] as const) {
        const tt = (t - delay) / (1 - delay);
        if (tt <= 0) continue;
        const rad = RIPPLE_RADIUS * scale * (1 - (1 - tt) ** 2.2);
        ctx.beginPath();
        ctx.ellipse(r.x, y0 + SURFACE_BAND * 0.55, rad, rad * 0.26, 0, 0, TAU);
        ctx.strokeStyle = rgba('#ffffff', 0.75 * (1 - tt));
        ctx.lineWidth = 1.6 * px;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** One depth layer of drifting specks (0 far … 2 near). At night they glow. */
  drawSpecks(f: FxFrame, layer: 0 | 1 | 2): void {
    const { ctx, timeSec, day, pal } = f;
    const list = this.specks[layer]!;
    if (list.length === 0) return;
    const soft = layer === 0;
    const tex = dotTexture(soft);
    const glowTex = tint(dotTexture(true), 'glow', '#a6f4ff');
    const base = LAYER_ALPHA[layer]!;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const mote = tint(tex, soft ? 'soft' : 'crisp', pal.mote);
    for (const s of list) {
      const tw = s.twinkle ? 0.45 + 0.55 * Math.max(0, Math.sin(timeSec * 1.7 + s.phase * 3)) : 0.8 + 0.2 * Math.sin(timeSec + s.phase);
      const size = s.r * (soft ? 3.2 : 2.4);
      ctx.globalAlpha = base * tw;
      ctx.drawImage(mote, s.x - size / 2, s.y - size / 2, size, size);
      if (day.particleGlow > 0.02) {
        const g = size * 2.6;
        ctx.globalAlpha = 0.28 * day.particleGlow * tw;
        ctx.drawImage(glowTex, s.x - g / 2, s.y - g / 2, g, g);
      }
    }
    ctx.restore();
  }
}
