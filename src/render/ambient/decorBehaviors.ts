// Decor behaviors: the sprites are single images, so they come alive through warping (plants sway in
// strips), split parts (a waving flag, a hinged chest lid), code-drawn overlays (lights, a visiting
// fish, sheens, glints) and particles (bubbles). Each decor id lists its behaviors in artConfig, so new
// decor reuses them without new code. Everything is slow and springy; nothing snaps.
import {
  BUBBLE_RING_GAP,
  DECOR_Z,
  CURTAIN_RATE,
  DECOR_BOB_AMP,
  DECOR_BOB_SPEED,
  DECOR_DRIFT_RANGE,
  DECOR_DRIFT_SPEED,
  DECOR_MID_FRACTION,
  DECOR_ROLL_RANGE,
  DECOR_SPIN_SPEED,
  DECOR_SURFACE_Y,
  ERUPTION_BUBBLES,
  ERUPTION_GAP,
  FLOATING_SHADOW,
  GIFT_FLAG_DOWN_DEG,
  PROPELLER_SPEED,
  SPARKLE_GAP,
  DECOR,
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
import type { DecorId, SpeciesId, Tank, ThemeId } from '../../game/types';
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
  depthOf,
  silhouette,
  sizeScale,
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
  ringNext: number;
  eruptNext: number;
  sparkleNext: number;
  curtainAcc: number;
  /** Moss ball roll (tank units), springing with the current. */
  roll: Spring;
  /** Mailbox flag angle (degrees). */
  flag: Spring;
}

/** How a decor item is offset this frame (bob, drift, roll, spin), around its resting spot. */
interface Motion {
  dx: number;
  dy: number;
  /** Rotation around the sprite's center (radians). */
  rot: number;
  /** Horizontal scale (spinning toys, drifting subs facing their way). */
  sx: number;
}

/** A point fish like to visit: swim through (arch, bubble curtain) or hover at (anemone; `species` favor it). */
export interface DecorAttractor {
  x: number;
  y: number;
  kind: 'through' | 'hover';
  species?: SpeciesId;
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
  /** Fade (the Try-it ghost); 1 when omitted. */
  alpha?: number;
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
  /** Top of the visible water (tank units): surface decor floats just below it. Set by the renderer each frame. */
  surfaceTop = 0;
  /** The daily gift is waiting (the mailbox raises its flag). Set by the renderer each frame. */
  giftReady = false;
  private readonly motionOut: Motion = { dx: 0, dy: 0, rot: 0, sx: 1 };

  /** Where a decor item's base rests (before sink): the sand line, just under the water line, or mid-water. */
  restY(decorId: DecorId, h: number, z: number = DECOR_Z.default): number {
    const placement = DECOR[decorId].placement;
    if (placement === 'surface') return this.surfaceTop + DECOR_SURFACE_Y + h / 2;
    if (placement === 'mid') return SAND_Y * DECOR_MID_FRACTION + h / 2;
    return SAND_Y + depthOf({ decorId, z }).dy; // sand pieces stand further back / forward by their depth
  }

  /** This frame's bob / drift / roll / spin offsets for an item (shared object; read immediately). */
  motion(d: Placed, w: number): Motion {
    const m = this.motionOut;
    const s = this.states.get(d.id);
    m.dx = 0;
    m.dy = 0;
    m.rot = 0;
    m.sx = 1;
    if (!s) return m;
    const t = this.time;
    if (this.has(d, 'bob')) m.dy = Math.sin(t * DECOR_BOB_SPEED + s.phase) * DECOR_BOB_AMP;
    if (this.has(d, 'drift')) {
      const a = t * DECOR_DRIFT_SPEED + s.phase;
      m.dx += Math.sin(a) * DECOR_DRIFT_RANGE;
      // Face the way it's drifting (the sprite faces right), turning smoothly at each end.
      const c = Math.max(-1, Math.min(1, Math.cos(a) * 4));
      m.sx = Math.sign(c || 1) * Math.max(0.2, Math.abs(c));
    }
    if (this.has(d, 'roll')) {
      m.dx += s.roll.x;
      m.rot = s.roll.x / (w / 2);
    }
    if (this.has(d, 'spin')) {
      const c = Math.cos(t * DECOR_SPIN_SPEED + s.phase);
      m.sx *= Math.sign(c || 1) * Math.max(0.15, Math.abs(c));
    }
    return m;
  }

  /**
   * Where a point of the sprite (uv) is in the tank right now: placement, bob/drift offsets, size and flip
   * included. `w`/`h` are the drawn size at M; `sink` is how far the base sits below its resting line.
   */
  pointAt(d: Placed, w: number, h: number, sink: number, uv: UV, m: Motion): { x: number; y: number } {
    const k = sizeScale(d);
    const fx = d.flipped ? -1 : 1;
    return {
      x: d.x + m.dx + fx * k * (-w / 2 + uv[0] * w),
      y: this.restY(d.decorId, h, d.z) + sink + m.dy + k * (-h + uv[1] * h),
    };
  }

  /** Points fish like to visit (arch gap, bubble curtain, anemone), in tank units. */
  attractors(decor: Placed[], out: DecorAttractor[]): DecorAttractor[] {
    out.length = 0;
    for (const d of decor) {
      const a = DECOR_ART[d.decorId].anchors?.attract;
      const size = a ? decorSpriteSize(d.decorId) : null;
      if (!a || !size) continue;
      // Fish can't swim down to far/near pieces' bases: only pieces close to the sand line attract them.
      if (DECOR[d.decorId].placement === 'sand' && (d.z ?? DECOR_Z.default) > DECOR_Z.attractMax) continue;
      const p = this.pointAt(d, size.w, size.h, size.h * DECOR_ART[d.decorId].sink, a.uv, this.motion(d, size.w));
      out.push({ x: p.x, y: p.y, kind: a.kind, species: a.species });
    }
    return out;
  }

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
        ringNext: this.time + between(r, BUBBLE_RING_GAP) * 0.3,
        eruptNext: this.time + between(r, ERUPTION_GAP) * 0.4,
        sparkleNext: this.time + between(r, SPARKLE_GAP) * 0.5,
        curtainAcc: 0,
        roll: { x: 0, v: 0 },
        flag: { x: this.giftReady ? 0 : GIFT_FLAG_DOWN_DEG, v: 0 },
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
    if (this.has(d, 'roll')) stepSpring(s.roll, env.current.total * DECOR_ROLL_RANGE, PLANT_STIFFNESS * 0.5, PLANT_DAMPING, dt);
    if (this.has(d, 'giftFlag')) stepSpring(s.flag, this.giftReady ? 0 : GIFT_FLAG_DOWN_DEG, PLANT_STIFFNESS, PLANT_DAMPING * 0.7, dt);
    const m = this.motion(d, w);
    const mx = m.dx;
    const my = m.dy;
    const at = (uv: UV) => this.pointAt(d, w, h, h * art.sink, uv, { dx: mx, dy: my, rot: 0, sx: 1 });

    if (this.has(d, 'bubbleRing') && art.anchors?.mouth && t >= s.ringNext) {
      const p = at(art.anchors.mouth);
      env.particles.spawnRing(p.x, p.y, 13, 3.2);
      s.ringNext = t + between(this.rng, BUBBLE_RING_GAP);
    }
    if (this.has(d, 'eruption') && art.anchors?.trail?.[0] && t >= s.eruptNext) {
      const p = at(art.anchors.trail[0]);
      const n = env.reduced ? 5 : ERUPTION_BUBBLES;
      for (let i = 0; i < n; i++) env.particles.spawnBubble(p.x + (this.rng() - 0.5) * w * 0.25, p.y - this.rng() * 14, 2 + this.rng() * 4);
      s.eruptNext = t + between(this.rng, ERUPTION_GAP);
    }
    if (this.has(d, 'sparkle') && t >= s.sparkleNext) {
      for (const [i, uv] of (art.anchors?.glint ?? []).entries()) s.glints.push({ at: t + i * 0.3, uv });
      s.sparkleNext = t + between(this.rng, SPARKLE_GAP);
    }
    if (this.has(d, 'curtain') && art.anchors?.curtain) {
      const c = art.anchors.curtain;
      s.curtainAcc += dt * CURTAIN_RATE * ((c.u1 - c.u0) * w / 100) * (env.reduced ? 0.35 : 1);
      while (s.curtainAcc >= 1) {
        s.curtainAcc -= 1;
        const p = at([c.u0 + this.rng() * (c.u1 - c.u0), c.v]);
        env.particles.spawnBubble(p.x, p.y, 1 + this.rng() * 2.2);
      }
    }

    if (this.has(d, 'sway')) {
      const target = env.current.total * PLANT_CURRENT_LEAN + fishPush(d.x, SAND_Y + depthOf(d).dy, w * sizeScale(d), h * sizeScale(d), env.fish);
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
    const img = decorImage(d.decorId, pose.theme, pose.grid.k * depthOf(d).scale, d.z);
    if (!img) return false;
    const s = this.state(d);
    const art = DECOR_ART[d.decorId];
    const t = this.time;
    const { k } = pose.grid;
    const { dw, dh } = img;

    const m = this.motion(d, dw);
    const floating = DECOR[d.decorId].placement !== 'sand';
    const geo = depthOf(d);
    const sizeK = sizeScale(d);
    // Far pieces cast a fainter shadow; it sits on the piece's own base line.
    const farFade = floating ? 1 : 0.55 + 0.9 * Math.min(0.5, d.z ?? DECOR_Z.default);
    decorShadow(ctx, d.decorId, d.x + m.dx, pose.lift, pose.shadowShift, (floating ? FLOATING_SHADOW : 1) * (pose.alpha ?? 1) * farFade, sizeK, SAND_Y + geo.dy + 1);

    const breathe = this.has(d, 'breathe') ? 1 + DECOR_BREATHE * Math.sin(t * s.breatheFreq + s.phase) : 1;
    const rock = this.has(d, 'rocking') ? Math.sin(t * WRECK_ROCK_SPEED + s.phase) * WRECK_ROCK_DEG * DEG : 0;
    const lifted = pose.lift > 0.001 || pose.squash !== 0;
    const lift = 1 + pose.lift * DECOR_LIFT_SCALE;
    // At rest the base point lands on a whole device pixel; anything moving stays subpixel-smooth.
    const moving = lifted || m.dx !== 0 || m.dy !== 0;
    const rest = this.restY(d.decorId, dh, d.z) + img.sinkY;
    const baseX = moving ? d.x + m.dx : snapTo(d.x, pose.grid.camX, k);
    const baseY = moving ? rest + m.dy - pose.lift * DECOR_LIFT : snapTo(rest, pose.grid.camY, k);

    ctx.save();
    ctx.translate(baseX, baseY);
    if (rock) ctx.rotate(rock);
    if (m.rot) {
      ctx.translate(0, -dh / 2);
      ctx.rotate(m.rot);
      ctx.translate(0, dh / 2);
    }
    if (m.sx !== 1) ctx.scale(m.sx, 1);
    if (sizeK !== 1 || d.flipped) ctx.scale(d.flipped ? -sizeK : sizeK, sizeK);
    if (pose.alpha !== undefined && pose.alpha < 1) ctx.globalAlpha *= pose.alpha;
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
    const giftFlag = this.has(d, 'giftFlag') ? art.anchors?.flag : undefined;
    const propeller = this.has(d, 'propeller') ? art.anchors?.propeller : undefined;
    const lid = this.has(d, 'lidOpen') ? lidConfig(d.decorId) : null;
    if (offset) {
      drawStrips(ctx, img.canvas, -dw / 2, -dh, dw, dh, pose.preset.plantStrips, offset);
    } else if (giftFlag) {
      // The mailbox flag pivots at the bottom of its pole: up when a gift is waiting, lying down otherwise.
      const parts = cutParts(img, `${img.key}:giftflag`, giftFlag);
      ctx.drawImage(parts.base, -dw / 2, -dh, dw, dh);
      const pivot = art.anchors?.flagPivot ?? [giftFlag.x0, giftFlag.y1];
      const px = -dw / 2 + pivot[0] * dw;
      const py = -dh + pivot[1] * dh;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(s.flag.x * DEG);
      ctx.drawImage(parts.part, -dw / 2 + giftFlag.x0 * dw - px, -dh + giftFlag.y0 * dh - py, (giftFlag.x1 - giftFlag.x0) * dw, (giftFlag.y1 - giftFlag.y0) * dh);
      ctx.restore();
    } else if (propeller) {
      // The propeller spins around the shaft: its blades squash and stretch vertically.
      const parts = cutParts(img, `${img.key}:prop`, propeller);
      ctx.drawImage(parts.base, -dw / 2, -dh, dw, dh);
      const pw = (propeller.x1 - propeller.x0) * dw;
      const ph = (propeller.y1 - propeller.y0) * dh;
      const cy = -dh + (propeller.y0 + propeller.y1) / 2 * dh;
      const spin = Math.max(0.15, Math.abs(Math.cos(this.time * PROPELLER_SPEED + s.phase)));
      ctx.drawImage(parts.part, -dw / 2 + propeller.x0 * dw, cy - (ph * spin) / 2, pw, ph * spin);
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

    if (s.doorFish && art.anchors?.door) {
      const door = this.pointAt(d, dw, dh, img.sinkY, art.anchors.door, m);
      this.drawDoorFish(ctx, s.doorFish, door.x, door.y);
    }
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
    const img = decorImage(d.decorId, theme, k * depthOf(d).scale, d.z);
    if (!img) return;
    const pts = lightPoints(d.decorId, (b) => this.has(d, b));
    if (pts.length === 0) return;
    const s = this.state(d);
    const m = this.motion(d, img.dw);
    const sizeK = sizeScale(d);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [i, p] of pts.entries()) {
      const { x, y } = this.pointAt(d, img.dw, img.dh, img.sinkY, p.uv, m);
      const flicker = 0.88 + 0.12 * Math.sin(timeSec * 2.3 + s.phase + i * 1.7) * Math.sin(timeSec * 0.9 + i);
      const r = p.r * img.dw * sizeK;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${p.core}, ${0.95 * p.strength * lights * flicker})`);
      g.addColorStop(0.35, `rgba(${p.color}, ${0.42 * p.strength * lights * flicker})`);
      g.addColorStop(1, `rgba(${p.color}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}

/** Warm window and lantern light, unless a glow overrides the color. */
const WARM_CORE = '255, 220, 130';
const WARM = '255, 170, 70';

interface LightPoint {
  uv: UV;
  r: number;
  core: string;
  color: string;
  strength: number;
}

const lightCache = new Map<string, LightPoint[]>();

/** The night lights of a decor item: windows, lanterns and colored glows (cached per item). */
function lightPoints(decorId: DecorId, has: (b: DecorBehavior) => boolean): LightPoint[] {
  const hit = lightCache.get(decorId);
  if (hit) return hit;
  const a = DECOR_ART[decorId].anchors;
  const pts: LightPoint[] = [];
  if (has('windowGlow')) for (const uv of a?.windows ?? []) pts.push({ uv, r: 0.1, core: WARM_CORE, color: WARM, strength: 1 });
  if (has('lanternGlow')) for (const uv of a?.lanterns ?? []) pts.push({ uv, r: 0.07, core: WARM_CORE, color: WARM, strength: 1 });
  // Colored glows (flowers, the pumpkin face, a lantern's halo): a warm white core fading into their color.
  for (const g of a?.glows ?? []) pts.push({ uv: g.uv, r: g.r, core: '255, 240, 200', color: g.color, strength: 1 });
  lightCache.set(decorId, pts);
  return pts;
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
