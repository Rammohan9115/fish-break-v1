// Keeps shell/pearl drops visible: when decor on a nearer plane would hide most of a drop, it slides sideways along
// its own plane to the closest spot that isn't. Pure (the renderer supplies the decor's screen-space extents).
import { DROP_HIDDEN_MAX, DROP_SLIDE_MAX } from './constants';

/** The x extent of one decor piece that is drawn in front of a drop and overlaps it vertically. */
export interface Occluder {
  x0: number;
  x1: number;
}

/** Share (0…1) of the interval [x - half, x + half] covered by the occluders (their union). */
export function coveredShare(x: number, half: number, occluders: readonly Occluder[]): number {
  const lo = x - half;
  const hi = x + half;
  const spans = occluders
    .map((o) => [Math.max(lo, o.x0), Math.min(hi, o.x1)] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let end = -Infinity;
  for (const [a, b] of spans) {
    const start = Math.max(a, end);
    if (b > start) covered += b - start;
    end = Math.max(end, b);
  }
  return covered / (2 * half);
}

/**
 * The x a drop should be shown at: its own `x` if enough of it is visible, else the nearest spot (within `maxSlide`
 * and the [min, max] bounds) that is. If nowhere is clear it stays put (it is never hidden or moved off the plane).
 */
export function visibleX(x: number, half: number, occluders: readonly Occluder[], min: number, max: number, hiddenMax = DROP_HIDDEN_MAX, maxSlide = DROP_SLIDE_MAX): number {
  if (occluders.length === 0 || coveredShare(x, half, occluders) <= hiddenMax) return x;
  const step = Math.max(2, half / 4);
  for (let d = step; d <= maxSlide; d += step) {
    // Try the nearer-to-the-original side first only by distance; ties prefer the left.
    for (const cand of [x - d, x + d]) {
      if (cand < min || cand > max) continue;
      if (coveredShare(cand, half, occluders) <= hiddenMax) return cand;
    }
  }
  return x;
}
