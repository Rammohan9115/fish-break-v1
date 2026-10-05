// How big a shell/pearl drop is drawn and how generous its tap area is, for the current camera scale.
// Pure (no canvas), so it is unit-tested for every screen size.
import { DROP_HIT_MIN_PX, DROP_HIT_PAD, DROP_SCALE_MAX, DROP_SCALE_MIN, DROP_TARGET_PX, SAND_Y } from '../game/constants';
import { ICON_ART } from './artConfig';

export type DropKind = 'shell' | 'pearl';

/** Height / width of the shell and pearl art (used until the sprite is measured). */
export const DEFAULT_DROP_ASPECT = 0.72;

export interface HitDrop {
  id: string;
  x: number;
  pearl: boolean;
}

/** Drawn width in tank units: about DROP_TARGET_PX on screen, clamped to MIN…MAX × the base width. */
export function dropDrawWidth(kind: DropKind, scale: number): number {
  const base = ICON_ART[kind].width;
  const wanted = DROP_TARGET_PX[kind] / Math.max(0.05, scale);
  return Math.min(base * DROP_SCALE_MAX, Math.max(base * DROP_SCALE_MIN, wanted));
}

/** Radius (tank units) of the tap area: a bit bigger than the sprite, and at least DROP_HIT_MIN_PX across on screen. */
export function dropHitRadius(kind: DropKind, scale: number): number {
  return Math.max((dropDrawWidth(kind, scale) / 2) * DROP_HIT_PAD, DROP_HIT_MIN_PX / 2 / Math.max(0.05, scale));
}

/** Where a drop's visual centre is (tank y): half its drawn height above the sand line. */
export function dropCenterY(kind: DropKind, scale: number, aspect = DEFAULT_DROP_ASPECT): number {
  return SAND_Y - (dropDrawWidth(kind, scale) * aspect) / 2;
}

/**
 * The drop under a tank-space point, or null. Every drop's tap area is centred on its sprite; when several overlap the
 * one whose centre is nearest wins (not simply the newest).
 */
export function dropHitTest(drops: readonly HitDrop[], x: number, y: number, scale: number, aspectOf: (kind: DropKind) => number = () => DEFAULT_DROP_ASPECT): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const d of drops) {
    const kind: DropKind = d.pearl ? 'pearl' : 'shell';
    const dist = Math.hypot(x - d.x, y - dropCenterY(kind, scale, aspectOf(kind)));
    if (dist <= dropHitRadius(kind, scale) && dist < bestDist) {
      best = d.id;
      bestDist = dist;
    }
  }
  return best;
}
