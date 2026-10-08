// Skipper's "courage": taps just above him build up to an encouragement; stages limit how high he swims.
import { ENCOURAGE_ABOVE, ENCOURAGE_BESIDE_X, ENCOURAGE_BESIDE_Y, ENCOURAGE_REACH_X, ENCOURAGE_TAPS, ENCOURAGE_WINDOW_MS, LEAP_RING_RADIUS } from '../constants';
import type { StageVisual } from './types';

type Pt = { x: number; y: number };

/** A tap lands in the water just above him, or just beside him (not on him). */
export function isAboveTap(fish: Pt, tap: Pt): boolean {
  const above = fish.y - tap.y;
  const dx = Math.abs(tap.x - fish.x);
  const overHead = above >= ENCOURAGE_ABOVE[0] && above <= ENCOURAGE_ABOVE[1] && dx <= ENCOURAGE_REACH_X;
  const beside = dx >= ENCOURAGE_BESIDE_X[0] && dx <= ENCOURAGE_BESIDE_X[1] && Math.abs(above) <= ENCOURAGE_BESIDE_Y;
  return overHead || beside;
}

/** Adds a tap; `fired` when 3 taps fall inside the window (the list then resets). */
export function addEncourageTap(taps: readonly number[], now: number): { taps: number[]; fired: boolean } {
  const recent = [...taps.filter((t) => now - t <= ENCOURAGE_WINDOW_MS), now];
  return recent.length >= ENCOURAGE_TAPS ? { taps: [], fired: true } : { taps: recent, fired: false };
}

/** Where the leap ring glows: above the water line over him. */
export const leapRingAt = (fish: Pt, surfaceY: number): Pt => ({ x: fish.x, y: surfaceY - 26 });
export const isLeapTap = (ring: Pt, tap: Pt): boolean => Math.hypot(tap.x - ring.x, tap.y - ring.y) <= LEAP_RING_RADIUS;

/** Clamps a swim height into the stage's zone. `top`/`bottom` are the full swim extent (tank units). */
export function clampToZone(y: number, visual: Pick<StageVisual, 'zone'> | undefined, top: number, bottom: number): number {
  if (!visual?.zone) return y;
  const h = bottom - top;
  return Math.max(top + h * visual.zone.top, Math.min(top + h * visual.zone.bottom, y));
}
