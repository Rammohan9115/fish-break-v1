// Decor behaviors: the sprites are single images, so they come alive through warping (plants sway in
// strips), split parts (a waving flag, a hinged chest lid), code-drawn overlays (lights, a visiting
// fish, sheens, glints) and particles (bubbles). Each decor id lists its behaviors in artConfig, so new
// decor reuses them without new code. Everything is slow and springy; nothing snaps.
import {
  CHEST_OPEN_GAP,
  CHEST_OPEN_HOLD_MS,
  DECOR_BREATHE,
  DECOR_BREATHE_FREQ,
  DOOR_FISH_GAP,
  DOOR_FISH_MS,
  LID_CLOSE_DAMPING,
  LID_CLOSE_STIFFNESS,
  LID_DAMPING,
  LID_STIFFNESS,
  PLANT_CURRENT_LEAN,
  PLANT_DAMPING,
  PLANT_FISH_PUSH,
  PLANT_STIFFNESS,
  ROCK_BUBBLE_GAP,
  SAND_Y,
  SHEEN_GAP,
  SHEEN_MS,
  WRECK_ROCK_DEG,
  WRECK_ROCK_SPEED,
  WRECK_TRAIL_GAP,
} from '../../game/constants';
import type { Tank, ThemeId } from '../../game/types';
import { DECOR_ART, lidConfig, type DecorBehavior, type UV } from '../artConfig';
import { makeCanvas } from '../assets';
import { drawStar } from '../drawFish';
import {
  DECOR_GLOW_ALPHA,
  DECOR_LIFT,
  DECOR_LIFT_SCALE,
  decorGlow,
  decorImage,
  decorShadow,
  decorSpriteSize,
  silhouette,
  snapTo,
  type DecorImage,
  type PixelGrid,
} from '../drawSprites';
import type { Particles } from '../particles';
import type { CurrentState } from './currents';
import type { QualityPreset } from './quality';

type Ctx = CanvasRenderingContext2D;
type Placed = Tank['decor'][number];
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** A damped spring: position, velocity. */
interface Spring {
  x: number;
  v: number;
}

/** Steps a spring toward `target` (semi-implicit Euler, stable for frame-sized dt). Pure; unit-tested. */
export function stepSpring(s: Spring, target: number, stiffness: number, damping: number, dt: number): void {
  s.v += ((target - s.x) * stiffness - s.v * damping) * dt;
  s.x += s.v * dt;
}

/** Sideways offset (tank units) of a swaying plant at height `f` (0 base … 1 tip). Pure; unit-tested. */
export function swayOffset(f: number, timeSec: number, phase: number, speed: number, amp: number, bend: number): number {
  const idle = Math.sin(timeSec * speed + phase + f * 1.1) * 0.55 + Math.sin(timeSec * speed * 0.43 + phase * 2.1) * 0.25;
  return amp * (idle + bend) * Math.pow(Math.max(0, f), 1.6);
}

/** Lean a plant gets from fish swimming through it: away from each fish, stronger the closer it passes. Pure. */
export function fishPush(plantX: number, base: number, width: number, height: number, fish: { x: number; y: number }[]): number {
  let push = 0;
  const reach = width * 0.7;
  for (const f of fish) {
    if (f.y < base - height || f.y > base + 6) continue;
    const dx = plantX - f.x;
    if (Math.abs(dx) >= reach) continue;
    // Fish near the tip move it more than fish near the base.
    const along = 1 - (base - f.y) / height;
    push += Math.sign(dx || 1) * (1 - Math.abs(dx) / reach) * (0.4 + 0.6 * (1 - along));
  }
  return Math.max(-1.5, Math.min(1.5, push * PLANT_FISH_PUSH));
}

interface Glint {
  at: number;
  uv: UV;
}

interface DoorFish {
  start: number;
  dir: 1 | -1;
  color: string;
}

interface DecorState {
  phase: number;
  breatheFreq: number;
  bend: Spring;
  /** Extra spring for taps (springy wiggle). */
  wiggle: Spring;
  nextBubbleAt: number;
  streamUntil: number;
  streamNext: number;
  nextSheenAt: number;
  sheenStart: number;
  lid: Spring & { target: number; nextOpenAt: number; closeAt: number; burst: boolean };
  nextDoorFishAt: number;
  doorFish: DoorFish | null;
  glints: Glint[];
  trailNext: number;
  trailIndex: number;
}

export interface BehaviorEnv {
  current: CurrentState;
  /** Fish positions in this tank (plants lean away from them). */
  fish: { x: number; y: number }[];
  particles: Particles;
  reduced: boolean;
}

export interface DecorPose {
  theme: ThemeId;
  grid: PixelGrid;
  /** 0..1, eased while dragging. */
  lift: number;
  /** From dropSquash (0 at rest). */
  squash: number;
  /** Edit-mode outline strength (0 = none). */
  glow: number;
  /** Contact shadow slide from the light direction (tank units). */
  shadowShift: number;
  timeSec: number;
  preset: QualityPreset;
}

const DOOR_FISH_COLORS = ['#ff9f43', '#feca57', '#ff6b9d', '#54a0ff', '#5fd68a'];

const between = (rng: () => number, [a, b]: readonly [number, number]) => a + rng() * (b - a);

/** Cached cut-out parts of a decor copy: the base without its moving part, and the part itself. */
interface Parts {
  base: HTMLCanvasElement;
  part: HTMLCanvasElement;
  /** The part's rect inside the copy (device px). */
  sx: number;
  sy: number;
}
const partsCache = new Map<string, Parts>();

function cutParts(img: DecorImage, key: string, rect: { x0: number; y0: number; x1: number; y1: number }): Parts {
  const hit = partsCache.get(key);
  if (hit) return hit;
  const { canvas } = img;
  const sx = Math.round(rect.x0 * canvas.width);
  const sy = Math.round(rect.y0 * canvas.height);
  const sw = Math.max(1, Math.round((rect.x1 - rect.x0) * canvas.width));
  const sh = Math.max(1, Math.round((rect.y1 - rect.y0) * canvas.height));
  const base = makeCanvas(canvas.width, canvas.height);
  const part = makeCanvas(sw, sh);
  base.getContext('2d')?.drawImage(canvas, 0, 0);
  base.getContext('2d')?.clearRect(sx, sy, sw, sh);
  part.getContext('2d')?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const parts = { base, part, sx, sy };
  if (partsCache.size > 24) partsCache.clear();
  partsCache.set(key, parts);
  return parts;
}

export class DecorBehaviors {
  private readonly states = new Map<string, DecorState>();
  /** Seconds since start (schedules run on this clock). */
  private time = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  private state(d: Placed): DecorState {
    let s = this.states.get(d.id);
    if (!s) {
      const r = this.rng;
      const closeDeg = lidConfig(d.decorId)?.closeDeg ?? 0;
      s = {
        phase: r() * TAU,
        breatheFreq: between(r, DECOR_BREATHE_FREQ),
        bend: { x: 0, v: 0 },
        wiggle: { x: 0, v: 0 },
        nextBubbleAt: this.time + between(r, ROCK_BUBBLE_GAP) * 0.5,
        streamUntil: 0,
        streamNext: 0,
        nextSheenAt: this.time + between(r, SHEEN_GAP) * 0.6,
        sheenStart: -Infinity,
        lid: { x: closeDeg, v: 0, target: closeDeg, nextOpenAt: this.time + 6 + r() * 20, closeAt: Infinity, burst: false },
        nextDoorFishAt: this.time + between(r, DOOR_FISH_GAP) * 0.5,
        doorFish: null,
        glints: [],
        trailNext: this.time + r(),
        trailIndex: 0,
      };
      this.states.set(d.id, s);
    }
    return s;
  }

  /** Tap reactions (springy wiggle) — the kick is in units of the sway amplitude. */
  wiggle(placedId: string, kick: number): void {
    const s = this.states.get(placedId);
    if (s) s.wiggle.v += kick;
  }

  /** Pops a chest open now (if it has a lid). */
  openNow(placedId: string): void {
    const s = this.states.get(placedId);
    if (s) s.lid.nextOpenAt = this.time;
  }

  update(dt: number, decor: Placed[], env: BehaviorEnv): void {
    this.time += dt;
    const live = new Set(decor.map((d) => d.id));
    for (const id of this.states.keys()) if (!live.has(id)) this.states.delete(id);
    for (const d of decor) this.updateOne(d, dt, env);
  }

  private has(d: Placed, b: DecorBehavior): boolean {
    return DECOR_ART[d.decorId].behaviors.includes(b);
  }

  private updateOne(d: Placed, dt: number, env: BehaviorEnv): void {
    const s = this.state(d);
    const art = DECOR_ART[d.decorId];
    const t = this.time;
    const size = decorSpriteSize(d.decorId);
    if (!size) return;
    const { w, h } = size;
    const top = SAND_Y + h * art.sink - h;
    const at = (uv: UV) => ({ x: d.x - w / 2 + uv[0] * w, y: top + uv[1] * h });

    if (this.has(d, 'sway')) {
      const target = env.current.total * PLANT_CURRENT_LEAN + fishPush(d.x, SAND_Y, w, h, env.fish);
      stepSpring(s.bend, target, PLANT_STIFFNESS, PLANT_DAMPING, dt);
    }
    stepSpring(s.wiggle, 0, PLANT_STIFFNESS * 1.6, PLANT_DAMPING * 0.8, dt);

    if (this.has(d, 'bubbleStream') && art.anchors?.crevice) {
      if (t >= s.nextBubbleAt) {
        s.streamUntil = t + 2.4;
        s.streamNext = t;
        s.nextBubbleAt = t + between(this.rng, ROCK_BUBBLE_GAP);
      }
      if (t < s.streamUntil && t >= s.streamNext) {
        const p = at(art.anchors.crevice);
        env.particles.spawnBubble(p.x + (this.rng() - 0.5) * 3, p.y, 1.1 + this.rng() * 1.2);
        s.streamNext = t + 0.22 + this.rng() * 0.2;
      }
    }

    if (this.has(d, 'sheen') && t >= s.nextSheenAt) {
      s.sheenStart = t;
      s.nextSheenAt = t + between(this.rng, SHEEN_GAP);
    }

    if (this.has(d, 'lidOpen')) {
      const lid = lidConfig(d.decorId);
      if (lid) {
        const L = s.lid;
        if (t >= L.nextOpenAt) {
          L.target = 0;
          L.closeAt = t + CHEST_OPEN_HOLD_MS / 1000;
          L.burst = false;
          L.nextOpenAt = t + between(this.rng, CHEST_OPEN_GAP);
        }
        if (t >= L.closeAt) {
          L.target = lid.closeDeg;
          L.closeAt = Infinity;
        }
        const opening = L.target === 0;
        stepSpring(L, L.target, opening ? LID_STIFFNESS : LID_CLOSE_STIFFNESS, opening ? LID_DAMPING : LID_CLOSE_DAMPING, dt);
        // Never swing wider than the sprite was drawn (that would open a gap at the lid line).
        if (L.x < -1) {
          L.x = -1;
          L.v = Math.max(0, L.v);
        }
        if (opening && !L.burst && L.x < lid.closeDeg * 0.35) {
          L.burst = true;
          const glints = art.anchors?.glint ?? [];
          if (this.has(d, 'bubbleBurst') && glints[0]) {
            const p = at(glints[0]);
            const n = env.reduced ? 3 : 9;
            for (let i = 0; i < n; i++) env.particles.spawnBubble(p.x + (this.rng() - 0.5) * w * 0.4, p.y - this.rng() * 6, 1.6 + this.rng() * 2.6);
          }
          if (this.has(d, 'glint')) for (const [i, uv] of glints.entries()) s.glints.push({ at: t + i * 0.25, uv });
        }
      }
    }
    s.glints = s.glints.filter((g) => t - g.at < 0.9);

    if (this.has(d, 'doorwayFish') && art.anchors?.door) {
      if (!s.doorFish && t >= s.nextDoorFishAt) {
        s.doorFish = { start: t, dir: this.rng() < 0.5 ? -1 : 1, color: DOOR_FISH_COLORS[Math.floor(this.rng() * DOOR_FISH_COLORS.length)]! };
      }
      if (s.doorFish && (t - s.doorFish.start) * 1000 > DOOR_FISH_MS) {
        s.doorFish = null;
        s.nextDoorFishAt = t + between(this.rng, DOOR_FISH_GAP);
      }
    }

    if (this.has(d, 'bubbleTrail') && art.anchors?.trail?.length && t >= s.trailNext) {
      const pts = art.anchors.trail;
      const p = at(pts[s.trailIndex++ % pts.length]!);
      env.particles.spawnBubble(p.x, p.y, 0.9 + this.rng() * 0.8);
      s.trailNext = t + between(this.rng, WRECK_TRAIL_GAP) * (env.reduced ? 3 : 1);
    }
  }

  /** Draws one decor item with its behaviors. False if its sprite is missing (draw the code art). */
  draw(ctx: Ctx, d: Placed, pose: DecorPose): boolean {
    const img = decorImage(d.decorId, pose.theme, pose.grid.k);
    if (!img) return false;
    const s = this.state(d);
    const art = DECOR_ART[d.decorId];
    const t = this.time;
    const { k } = pose.grid;
    const { dw, dh } = img;

    decorShadow(ctx, d.decorId, d.x, pose.lift, pose.shadowShift);

    const breathe = this.has(d, 'breathe') ? 1 + DECOR_BREATHE * Math.sin(t * s.breatheFreq + s.phase) : 1;
    const rock = this.has(d, 'rocking') ? Math.sin(t * WRECK_ROCK_SPEED + s.phase) * WRECK_ROCK_DEG * DEG : 0;
    const lifted = pose.lift > 0.001 || pose.squash !== 0;
    const lift = 1 + pose.lift * DECOR_LIFT_SCALE;
    // At rest the base point lands on a whole device pixel; anything moving stays subpixel-smooth.
    const baseX = lifted ? d.x : snapTo(d.x, pose.grid.camX, k);
    const baseY = lifted ? SAND_Y + img.sinkY - pose.lift * DECOR_LIFT : snapTo(SAND_Y + img.sinkY, pose.grid.camY, k);

    ctx.save();
    ctx.translate(baseX, baseY);
    if (rock) ctx.rotate(rock);
    ctx.scale(lift * breathe * (1 + pose.squash), lift * breathe * (1 - pose.squash));

    const sway = this.has(d, 'sway') ? art.sway : undefined;
    const offset = sway
      ? (f: number) => swayOffset(f, t, s.phase, sway.speed, sway.amp, s.bend.x + s.wiggle.x)
      : null;

    if (pose.glow > 0) {
      const glow = decorGlow(img, pose.grid.dpr);
      const padW = (glow.pad * dw) / img.canvas.width;
      const padH = (glow.pad * dh) / img.canvas.height;
      ctx.save();
      ctx.globalAlpha = DECOR_GLOW_ALPHA * pose.glow;
      if (offset) drawStrips(ctx, glow.canvas, -dw / 2 - padW, -dh - padH, dw + padW * 2, dh + padH * 2, pose.preset.plantStrips, offset);
      else ctx.drawImage(glow.canvas, -dw / 2 - padW, -dh - padH, dw + padW * 2, dh + padH * 2);
      ctx.restore();
    }

    const flag = this.has(d, 'flag') ? art.anchors?.flag : undefined;
    const lid = this.has(d, 'lidOpen') ? lidConfig(d.decorId) : null;
    if (offset) {
      drawStrips(ctx, img.canvas, -dw / 2, -dh, dw, dh, pose.preset.plantStrips, offset);
    } else if (flag) {
      const parts = cutParts(img, `${img.key}:flag`, flag);
      ctx.drawImage(parts.base, -dw / 2, -dh, dw, dh);
      this.drawFlag(ctx, parts, img, pose.timeSec);
    } else if (lid) {
      const parts = cutParts(img, `${img.key}:lid:${lid.line}`, { x0: 0, y0: 0, x1: 1, y1: lid.line });
      ctx.drawImage(parts.base, -dw / 2, -dh, dw, dh);
      const hx = -dw / 2 + lid.hinge[0] * dw;
      const hy = -dh + lid.hinge[1] * dh;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(s.lid.x * DEG);
      ctx.drawImage(parts.part, -dw / 2 - hx, -dh - hy, dw, (parts.part.height * dh) / img.canvas.height);
      ctx.restore();
    } else {
      ctx.drawImage(img.canvas, -dw / 2, -dh, dw, dh);
    }

    // Sheen: a soft light band sweeping across (moss shimmer).
    const sheenT = ((t - s.sheenStart) * 1000) / SHEEN_MS;
    if (pose.preset.sheen && sheenT >= 0 && sheenT < 1) {
      const band = dw * 0.28;
      const cx = -dw / 2 - band + sheenT * (dw + band * 2);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - band / 2, -dh);
      ctx.lineTo(cx + band / 2, -dh);
      ctx.lineTo(cx + band / 2 - dh * 0.35, 0);
      ctx.lineTo(cx - band / 2 - dh * 0.35, 0);
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = 0.22 * Math.sin(sheenT * Math.PI);
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(silhouette(img, '#eaffd6'), -dw / 2, -dh, dw, dh);
      ctx.restore();
    }

    // Gold glints after the chest opens.
    for (const g of s.glints) {
      const gt = (t - g.at) / 0.9;
      if (gt < 0) continue;
      const r = 5.5 * Math.sin(gt * Math.PI);
      drawStar(ctx, -dw / 2 + g.uv[0] * dw, -dh + g.uv[1] * dh, r, '#fffbe0', '#ffcf3a', 0.6 / k);
    }
    ctx.restore();

    if (s.doorFish && art.anchors?.door) this.drawDoorFish(ctx, s.doorFish, d.x - dw / 2 + art.anchors.door[0] * dw, SAND_Y + img.sinkY - dh + art.anchors.door[1] * dh);
    return true;
  }

  /** The cut-out flag, waving in vertical strips from its hoist (left edge) to its fly (right edge). */
  private drawFlag(ctx: Ctx, parts: Parts, img: DecorImage, timeSec: number): void {
    const { dw, dh, canvas } = img;
    const n = 10;
    const pw = parts.part.width;
    const ph = parts.part.height;
    const x0 = -dw / 2 + (parts.sx / canvas.width) * dw;
    const y0 = -dh + (parts.sy / canvas.height) * dh;
    const sx = dw / canvas.width;
    const sy = dh / canvas.height;
    for (let i = 0; i < n; i++) {
      const a = Math.floor((i * pw) / n);
      const b = Math.floor(((i + 1) * pw) / n);
      const u = (a + b) / 2 / pw;
      const lift = Math.sin(timeSec * 3.2 - u * 5) * ph * sy * 0.14 * u;
      ctx.drawImage(parts.part, a, 0, b - a + 1, ph, x0 + a * sx, y0 + lift, (b - a + 1) * sx, ph * sy);
    }
  }

  /** A tiny visitor swimming out of the doorway: it grows out of the dark, swims off and fades. */
  private drawDoorFish(ctx: Ctx, f: DoorFish, doorX: number, doorY: number): void {
    const t = ((this.time - f.start) * 1000) / DOOR_FISH_MS;
    if (t < 0 || t > 1) return;
    const grow = Math.min(1, t / 0.15);
    const alpha = Math.min(grow, t > 0.75 ? (1 - t) / 0.25 : 1);
    const x = doorX + f.dir * 75 * Math.pow(Math.max(0, t - 0.05), 0.9);
    const y = doorY - 28 * t + Math.sin(t * 18) * 1.5;
    const s = 0.55 + 0.45 * grow;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(f.dir * s, s);
    ctx.rotate(-0.25 + Math.sin(t * 22) * 0.08);
    const outline = '#5a3a2a';
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = outline;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-11, -4.5 + Math.sin(t * 40) * 1.2);
    ctx.lineTo(-11, 4.5 + Math.sin(t * 40) * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.8, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-1, -2.2, 3, 1.2, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(3.2, -0.8, 1.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1d2533';
    ctx.beginPath();
    ctx.arc(3.6, -0.7, 1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Warm lights (castle windows, wreck lanterns), drawn after the scene tint so they glow at night. */
  drawLights(ctx: Ctx, d: Placed, theme: ThemeId, k: number, lights: number, timeSec: number): void {
    if (lights < 0.02) return;
    const img = decorImage(d.decorId, theme, k);
    if (!img) return;
    const art = DECOR_ART[d.decorId];
    const pts: { uv: UV; r: number }[] = [];
    if (this.has(d, 'windowGlow')) for (const uv of art.anchors?.windows ?? []) pts.push({ uv, r: 0.1 });
    if (this.has(d, 'lanternGlow')) for (const uv of art.anchors?.lanterns ?? []) pts.push({ uv, r: 0.07 });
    if (pts.length === 0) return;
    const s = this.state(d);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [i, p] of pts.entries()) {
      const x = d.x - img.dw / 2 + p.uv[0] * img.dw;
      const y = SAND_Y + img.sinkY - img.dh + p.uv[1] * img.dh;
      const flicker = 0.88 + 0.12 * Math.sin(timeSec * 2.3 + s.phase + i * 1.7) * Math.sin(timeSec * 0.9 + i);
      const r = p.r * img.dw;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255, 220, 130, ${0.95 * lights * flicker})`);
      g.addColorStop(0.35, `rgba(255, 170, 70, ${0.42 * lights * flicker})`);
      g.addColorStop(1, 'rgba(255, 150, 60, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}

/**
 * Draws `img` into the rect in horizontal strips, each shifted sideways by `offset(f)` where f is
 * the strip's height above the base (0 bottom … 1 top). Strips overlap by a pixel so no seams show.
 */
function drawStrips(ctx: Ctx, img: HTMLCanvasElement, x: number, y: number, w: number, h: number, n: number, offset: (f: number) => number): void {
  const H = img.height;
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * H) / n);
    const b = Math.min(H, Math.floor(((i + 1) * H) / n) + 1);
    const f = 1 - (a + b) / 2 / H;
    ctx.drawImage(img, 0, a, img.width, b - a, x + offset(f), y + (a / H) * h, w, ((b - a) / H) * h);
  }
}
