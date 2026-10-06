// How big a shell/pearl drop is drawn and how generous its tap area is, for the current camera scale.
// Pure (no canvas), so it is unit-tested for every screen size.
import { DROP_HIT_EXTRA_PX, DROP_HIT_MIN_PX, DROP_HIT_PAD, DROP_SCALE_MAX, DROP_SCALE_MIN, DROP_TARGET_PX, SAND_Y } from '../game/constants';
import { ICON_ART } from './artConfig';

export type DropKind = 'shell' | 'pearl';

/** Height / width of the shell and pearl art (used until the sprite is measured). */
export const DEFAULT_DROP_ASPECT = 0.72;

/** A plane's effect on a drop: its y offset from the sand line and its scale (see `planeConfig`). */
export interface PlaneGeo {
  dy: number;
  scale: number;
}
const FLAT: PlaneGeo = { dy: 0, scale: 1 };

export interface HitDrop {
  id: string;
  /** Where it is drawn (x), and its plane. */
  x: number;
  pearl: boolean;
  plane?: PlaneGeo;
  /** Extra height above its resting spot while it is still sinking (hit where it is drawn). */
  lift?: number;
}

/** Drawn width in tank units: about DROP_TARGET_PX on screen, clamped to MIN…MAX × the base width. */
export function dropDrawWidth(kind: DropKind, scale: number, plane: PlaneGeo = FLAT): number {
  const base = ICON_ART[kind].width;
  const wanted = DROP_TARGET_PX[kind] / Math.max(0.05, scale);
  return Math.min(base * DROP_SCALE_MAX, Math.max(base * DROP_SCALE_MIN, wanted)) * plane.scale;
}

/**
 * Radius (tank units) of the tap area: a bit bigger than the sprite, at least DROP_HIT_MIN_PX across on screen, plus
 * DROP_HIT_EXTRA_PX of slack all round (so a shell peeking out from behind decor is easy to hit).
 */
export function dropHitRadius(kind: DropKind, scale: number, plane: PlaneGeo = FLAT): number {
  const s = Math.max(0.05, scale);
  return Math.max((dropDrawWidth(kind, scale, plane) / 2) * DROP_HIT_PAD, DROP_HIT_MIN_PX / 2 / s) + DROP_HIT_EXTRA_PX / s;
}

/** Where a drop's visual centre is (tank y): half its drawn height above the sand line. */
export function dropCenterY(kind: DropKind, scale: number, aspect = DEFAULT_DROP_ASPECT, plane: PlaneGeo = FLAT): number {
  return SAND_Y + plane.dy - (dropDrawWidth(kind, scale, plane) * aspect) / 2;
}

/**
 * The drop under a tank-space point, or null. Every drop's tap area (always checked before decor) is centred on its sprite; when several overlap the
 * one whose centre is nearest wins (not simply the newest).
 */
export function dropHitTest(drops: readonly HitDrop[], x: number, y: number, scale: number, aspectOf: (kind: DropKind) => number = () => DEFAULT_DROP_ASPECT): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const d of drops) {
    const kind: DropKind = d.pearl ? 'pearl' : 'shell';
    const plane = d.plane ?? FLAT;
    const dist = Math.hypot(x - d.x, y - (dropCenterY(kind, scale, aspectOf(kind), plane) - (d.lift ?? 0)));
    if (dist <= dropHitRadius(kind, scale, plane) && dist < bestDist) {
      best = d.id;
      bestDist = dist;
    }
  }
  return best;
}
