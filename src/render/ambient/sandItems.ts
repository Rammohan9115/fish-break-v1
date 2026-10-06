// Life for the small things on the sand: shell/pearl drops bounce when they land, glint every few
// seconds, and arc up into the HUD counter when collected (the counter bumps when they arrive).
import { DROP_DRIFT_AMP, DROP_DRIFT_WOBBLES, DROP_FALL_HEIGHT, DROP_FLY_MS, DROP_GLINT_GAP, DROP_LAND_MS, DROP_SINK_MS, DROP_SINK_SPEED, DROP_SLIDE_RATE, SAND_Y } from '../../game/constants';
import type { Tank } from '../../game/types';
import type { IconId } from '../artConfig';
import { drawStar } from '../drawFish';

type Ctx = CanvasRenderingContext2D;
type Drop = Tank['shells'][number];

/** Height above the sand (positive = up) `ms` after a drop appears: a fall and two shrinking bounces. Pure. */
export function dropBounce(ms: number): number {
  if (ms < 0 || ms >= DROP_LAND_MS) return 0;
  const t = ms / DROP_LAND_MS;
  const arc = (a: number, b: number, height: number) => {
    const u = (t - a) / (b - a);
    return height * 4 * u * (1 - u);
  };
  if (t < 0.3) return DROP_FALL_HEIGHT * (1 - (t / 0.3) ** 2);
  if (t < 0.64) return arc(0.3, 0.64, DROP_FALL_HEIGHT * 0.32);
  if (t < 0.86) return arc(0.64, 0.86, DROP_FALL_HEIGHT * 0.1);
  return 0;
}

/** How a new drop sinks: the offset it starts at (relative to where it comes to rest), how long, and its sideways wobble. */
export interface Fall {
  /** Start x offset from the resting x; start height above the resting spot (positive = up). */
  dx: number;
  dy: number;
  ms: number;
  drift: number;
}

/** Above the sand a drop with no known fish appears this high (tank units). */
const DEFAULT_FALL_FROM = 160;
const REDUCED_FALL_MS = 350;
const REDUCED_FALL_FROM = 30;

/**
 * Plans a fall from `origin` (the fish that dropped it) to a resting spot. Slower for planes with a lower `fallSpeed`
 * (back drops); under reduced motion a short plain drop with no drift. Pure.
 */
export function planFall(land: { x: number; y: number }, origin: { x: number; y: number } | null, fallSpeed: number, reduced: boolean): Fall {
  if (reduced) return { dx: 0, dy: REDUCED_FALL_FROM, ms: REDUCED_FALL_MS, drift: 0 };
  const from = origin ?? { x: land.x, y: land.y - DEFAULT_FALL_FROM };
  const dx = from.x - land.x;
  const dy = Math.max(0, land.y - from.y);
  const ms = Math.min(DROP_SINK_MS[1], Math.max(DROP_SINK_MS[0], Math.hypot(dx, dy) / DROP_SINK_SPEED)) / Math.max(0.1, fallSpeed);
  return { dx, dy, ms, drift: DROP_DRIFT_AMP };
}

/**
 * Where a drop is `ms` after appearing, relative to its resting spot: sinking with a gentle side-to-side drift, then the
 * existing landing bounce. `falling` is true until it touches down. Pure.
 */
export function dropPose(ms: number, fall: Fall, seed = 0): { dx: number; lift: number; falling: boolean } {
  if (ms >= fall.ms) return { dx: 0, lift: dropBounce(ms - fall.ms + 0.3 * DROP_LAND_MS), falling: false };
  const u = Math.max(0, ms) / fall.ms;
  const glide = u * u * (3 - 2 * u);
  const wobble = Math.sin(u * Math.PI * 2 * DROP_DRIFT_WOBBLES + seed * Math.PI * 2) * fall.drift * (1 - u);
  return { dx: fall.dx * (1 - glide) + wobble, lift: fall.dy * (1 - u), falling: true };
}

/** One exponential step of `x` toward `target` over `dtSec` (a drop easing sideways out from behind decor). Pure. */
export function easeX(x: number, target: number, dtSec: number): number {
  if (Math.abs(target - x) < 0.05) return target;
  return x + (target - x) * (1 - Math.exp(-DROP_SLIDE_RATE * Math.max(0, dtSec)));
}

/** A position along a soft arc from `a` to `b` (apex lifted by `lift`), at u 0..1. Pure. */
export function arcPoint(a: { x: number; y: number }, b: { x: number; y: number }, lift: number, u: number): { x: number; y: number } {
  const cx = (a.x + b.x) / 2;
  const cy = Math.min(a.y, b.y) - lift;
  const m = 1 - u;
  return { x: m * m * a.x + 2 * m * u * cx + u * u * b.x, y: m * m * a.y + 2 * m * u * cy + u * u * b.y };
}

export function hash01(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

interface Flight {
  icon: IconId;
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  /** Icon size in tank units at takeoff. */
  size: number;
}

/** Draws an icon sprite centered at (x, y), `w` tank units wide; false if it isn't loaded. */
export type IconPainter = (icon: IconId, x: number, y: number, w: number) => boolean;

export class SandItems {
  /** When each drop was first seen (ms); drops present on the first frame never bounce. */
  private readonly seen = new Map<string, number>();
  private firstFrame: number | null = null;
  private flights: Flight[] = [];
  /** Where the fish that dropped each new drop was (live drops only), and each drop's planned fall once drawn. */
  private readonly origins = new Map<string, { x: number; y: number }>();
  private readonly falls = new Map<string, Fall>();
  /** The x each drop is shown at (eased toward where it is visible, see game/dropVisibility). */
  private readonly shown = new Map<string, number>();

  /** Notes new drops. Call once per frame with the active tank's drops. */
  update(drops: Drop[], now: number): void {
    const settled = this.firstFrame === null;
    this.firstFrame ??= now;
    const live = new Set<string>();
    for (const d of drops) {
      live.add(d.id);
      if (!this.seen.has(d.id)) this.seen.set(d.id, settled ? -Infinity : now);
    }
    for (const id of this.seen.keys()) {
      if (live.has(id)) continue;
      this.seen.delete(id);
      this.origins.delete(id);
      this.falls.delete(id);
      this.shown.delete(id);
    }
  }

  /** The fish that dropped `dropId` was here: the drop sinks from this spot. */
  noteOrigin(dropId: string, x: number, y: number): void {
    this.origins.set(dropId, { x, y });
  }

  /** The x to draw a drop at: eased toward `target` (its visible spot); the first time it simply appears there. */
  showX(dropId: string, target: number, dtSec: number): number {
    const x = this.shown.get(dropId);
    const next = x === undefined ? target : easeX(x, target, dtSec);
    this.shown.set(dropId, next);
    return next;
  }

  /** Where a drop is now relative to its rest spot (see dropPose); plans the fall the first time it is asked. */
  pose(dropId: string, now: number, land: { x: number; y: number }, fallSpeed: number, reduced: boolean): { dx: number; lift: number; falling: boolean } {
    const ms = now - (this.seen.get(dropId) ?? -Infinity);
    if (ms === Infinity) return { dx: 0, lift: 0, falling: false };
    let fall = this.falls.get(dropId);
    if (!fall) {
      fall = planFall(land, this.origins.get(dropId) ?? null, fallSpeed, reduced);
      this.falls.set(dropId, fall);
    }
    return dropPose(ms, fall, hash01(dropId));
  }

  /** A little star glint on a resting drop every few seconds (staggered per drop). */
  drawGlint(ctx: Ctx, drop: Drop, timeSec: number, px: number, width = drop.pearl ? 20 : 24, at: { x: number; baseY: number } = { x: drop.x, baseY: SAND_Y }): void {
    const h = hash01(drop.id);
    const period = DROP_GLINT_GAP[0] + h * (DROP_GLINT_GAP[1] - DROP_GLINT_GAP[0]);
    const phase = ((timeSec + h * 17) % period) / period;
    const window = 0.5 / period;
    if (phase > window) return;
    // Offsets and size follow the drawn width (they were tuned for the 24 / 20 unit icons).
    const k = width / (drop.pearl ? 20 : 24);
    const r = (drop.pearl ? 3.6 : 4.2) * k * Math.sin((phase / window) * Math.PI);
    drawStar(ctx, at.x + (drop.pearl ? 5 : 7) * k, at.baseY - (drop.pearl ? 13 : 12) * k, r, '#ffffff', null, 0.5 * px);
  }

  /** Starts an icon flying from the sand up to a HUD counter (tank coordinates). */
  fly(icon: IconId, from: { x: number; y: number }, to: { x: number; y: number }, now: number, size = 22): void {
    this.flights.push({ icon, from, to, start: now, size });
  }

  /** Draws flying icons; calls `onArrive` for each one that reached its counter this frame. */
  drawFlights(ctx: Ctx, now: number, paint: IconPainter, onArrive: (icon: IconId) => void): void {
    const remaining: Flight[] = [];
    for (const f of this.flights) {
      const u = (now - f.start) / DROP_FLY_MS;
      if (u >= 1) {
        onArrive(f.icon);
        continue;
      }
      remaining.push(f);
      const e = 1 - (1 - u) ** 2;
      const p = arcPoint(f.from, f.to, 90, e);
      ctx.save();
      ctx.globalAlpha = u > 0.85 ? (1 - u) / 0.15 : 1;
      paint(f.icon, p.x, p.y, f.size * (1 - 0.35 * e));
      ctx.restore();
    }
    this.flights = remaining;
  }
}
