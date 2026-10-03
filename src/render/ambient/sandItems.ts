// Life for the small things on the sand: shell/pearl drops bounce when they land, glint every few
// seconds, and arc up into the HUD counter when collected (the counter bumps when they arrive).
import { DROP_FALL_HEIGHT, DROP_FLY_MS, DROP_GLINT_GAP, DROP_LAND_MS, SAND_Y } from '../../game/constants';
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

/** A position along a soft arc from `a` to `b` (apex lifted by `lift`), at u 0..1. Pure. */
export function arcPoint(a: { x: number; y: number }, b: { x: number; y: number }, lift: number, u: number): { x: number; y: number } {
  const cx = (a.x + b.x) / 2;
  const cy = Math.min(a.y, b.y) - lift;
  const m = 1 - u;
  return { x: m * m * a.x + 2 * m * u * cx + u * u * b.x, y: m * m * a.y + 2 * m * u * cy + u * u * b.y };
}

function hash01(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

interface Flight {
  icon: IconId;
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
}

/** Draws an icon sprite centered at (x, y), `w` tank units wide; false if it isn't loaded. */
export type IconPainter = (icon: IconId, x: number, y: number, w: number) => boolean;

export class SandItems {
  /** When each drop was first seen (ms); drops present on the first frame never bounce. */
  private readonly seen = new Map<string, number>();
  private firstFrame: number | null = null;
  private flights: Flight[] = [];

  /** Notes new drops. Call once per frame with the active tank's drops. */
  update(drops: Drop[], now: number): void {
    const settled = this.firstFrame === null;
    this.firstFrame ??= now;
    const live = new Set<string>();
    for (const d of drops) {
      live.add(d.id);
      if (!this.seen.has(d.id)) this.seen.set(d.id, settled ? -Infinity : now);
    }
    for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id);
  }

  /** How high a drop is right now (landing bounce). */
  lift(dropId: string, now: number): number {
    return dropBounce(now - (this.seen.get(dropId) ?? -Infinity));
  }

  /** A little star glint on a resting drop every few seconds (staggered per drop). */
  drawGlint(ctx: Ctx, drop: Drop, timeSec: number, px: number): void {
    const h = hash01(drop.id);
    const period = DROP_GLINT_GAP[0] + h * (DROP_GLINT_GAP[1] - DROP_GLINT_GAP[0]);
    const phase = ((timeSec + h * 17) % period) / period;
    const window = 0.5 / period;
    if (phase > window) return;
    const r = (drop.pearl ? 3.6 : 4.2) * Math.sin((phase / window) * Math.PI);
    drawStar(ctx, drop.x + (drop.pearl ? 5 : 7), SAND_Y - (drop.pearl ? 13 : 12), r, '#ffffff', null, 0.5 * px);
  }

  /** Starts an icon flying from the sand up to a HUD counter (tank coordinates). */
  fly(icon: IconId, from: { x: number; y: number }, to: { x: number; y: number }, now: number): void {
    this.flights.push({ icon, from, to, start: now });
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
      paint(f.icon, p.x, p.y, 22 * (1 - 0.35 * e));
      ctx.restore();
    }
    this.flights = remaining;
  }
}
