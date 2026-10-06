// Decor rules: collections, set bonuses, variety happiness and the October event. Pure.
import {
  COLLECTION_LIST,
  DECOR_LIMIT,
  DECOR,
  DECOR_Z,
  DEPTH_PLANES,
  DROP_PLANE_WEIGHTS,
  THEME_PLANE_TINT,
  SAND_Y,
  HAPPINESS_DECOR_MAX,
  HAPPINESS_PER_DUPLICATE_DECOR,
  HAPPINESS_PER_SET,
  HAPPINESS_PER_UNIQUE_DECOR,
  OCTOBER_MONTH,
  SET_BONUS_ITEMS,
} from './constants';
import type { CollectionDef, CollectionId, DecorDef, DecorId, DepthPlane, GameState, PlacedDecor, Tank, ThemeId } from './types';

/** The items of a collection, in catalog order. */
export function collectionItems(id: CollectionId): DecorDef[] {
  return Object.values(DECOR).filter((d) => d.collection === id);
}

/** Whether an event collection is in season on `date` (local time). Non-event collections always are. */
export function collectionInSeason(c: CollectionDef, date: Date): boolean {
  return c.event === null || (c.event === 'october' && date.getMonth() === OCTOBER_MONTH);
}

/** Can this item be bought on `date`? Event items only in season; everything else always. */
export function decorAvailable(decorId: DecorId, date: Date): boolean {
  const c = DECOR[decorId].collection;
  if (c === null) return true;
  const def = COLLECTION_LIST.find((x) => x.id === c)!;
  return collectionInSeason(def, date);
}

/** Collections with SET_BONUS_ITEMS or more different items placed in the tank (duplicates don't count). */
export function activeSets(tank: Pick<Tank, 'decor'>): CollectionId[] {
  const kinds = new Set(tank.decor.map((d) => d.decorId));
  const out: CollectionId[] = [];
  for (const c of COLLECTION_LIST) {
    let n = 0;
    for (const id of kinds) if (DECOR[id].collection === c.id) n++;
    if (n >= setBonusNeeds(c.id)) out.push(c.id);
  }
  return out;
}

/** Different items needed for a collection's set bonus: 3, or the whole collection if it's smaller (Halloween has 2). */
export function setBonusNeeds(id: CollectionId): number {
  return Math.min(SET_BONUS_ITEMS, collectionItems(id).length);
}

/** Happiness from decor: +3 per different item, +1 per duplicate (max +20), plus +5 per active set. */
export function decorHappiness(tank: Pick<Tank, 'decor'>): number {
  const unique = new Set(tank.decor.map((d) => d.decorId)).size;
  const duplicates = tank.decor.length - unique;
  const variety = Math.min(HAPPINESS_DECOR_MAX, unique * HAPPINESS_PER_UNIQUE_DECOR + duplicates * HAPPINESS_PER_DUPLICATE_DECOR);
  return variety + activeSets(tank).length * HAPPINESS_PER_SET;
}

/** What one more copy of `decorId` would add to the tank's decor happiness (for the shop / decor card). */
export function decorHappinessGain(tank: Pick<Tank, 'decor'>, decorId: DecorId): number {
  return decorHappiness({ decor: [...tank.decor, newPlaced('_', decorId, 0)] }) - decorHappiness(tank);
}

/** Different items of a collection the player owns (placed in any tank or in the decor box), out of its total. */
export function collectionProgress(game: Pick<GameState, 'tanks' | 'decorInventory'>, id: CollectionId): { owned: number; total: number } {
  const all = [...game.tanks.flatMap((t) => t.decor.map((d) => d.decorId)), ...(Object.keys(game.decorInventory) as DecorId[])];
  const owned = new Set(all.filter((d) => DECOR[d].collection === id));
  return { owned: owned.size, total: collectionItems(id).length };
}

/** Different items of `collection` in this tank (toward its set bonus). */
export function setProgress(tank: Pick<Tank, 'decor'>, id: CollectionId): number {
  return new Set(tank.decor.map((d) => d.decorId).filter((d) => DECOR[d].collection === id)).size;
}

/** How many decor items a tank can hold: 15, plus 3 per capacity upgrade. */
export function maxDecor(tank: Pick<Tank, 'upgrades'>): number {
  return DECOR_LIMIT.base + DECOR_LIMIT.perUpgrade * tank.upgrades;
}

/** A newly placed item with the default look (medium, not flipped, behind the fish). */
export function newPlaced(id: string, decorId: DecorId, x: number): PlacedDecor {
  return { id, decorId, x, flipped: false, size: 'M', z: DECOR_Z.default };
}

/** Total items in the decor box. */
export function boxCount(game: Pick<GameState, 'decorInventory'>): number {
  return Object.values(game.decorInventory).reduce((n, c) => n + (c ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Depth (perspective)
// ---------------------------------------------------------------------------

export interface DepthGeometry {
  /** Base-line offset from the sand line (tank units; negative = further up/back). */
  dy: number;
  /** Perspective scale (multiplies the S/M/L size). */
  scale: number;
  /** Water tint strength over the sprite (0 crisp … ~0.34 hazy). */
  tint: number;
  /** Desaturation (0 … 0.25), far pieces only. */
  desat: number;
  /** Drawn over the fish (true) or behind them. */
  frontOfFish: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clampZ = (z: number): number => Math.min(1, Math.max(0, Number.isFinite(z) ? z : DECOR_Z.default));

/** Where a piece at depth `z` stands and how it looks. At z = 0.5 it is exactly the old flat line. */
export function depthGeometry(zIn: number): DepthGeometry {
  const z = clampZ(zIn);
  const far = z <= 0.5;
  const t = far ? z / 0.5 : (z - 0.5) / 0.5; // 0…1 within each half
  return {
    dy: far ? lerp(DECOR_Z.farDy, 0, t) : lerp(0, DECOR_Z.nearDy, t),
    scale: far ? lerp(DECOR_Z.farScale, 1, t) : lerp(1, DECOR_Z.nearScale, t),
    tint: far ? lerp(DECOR_Z.tintFar, DECOR_Z.tintMid, t) : lerp(DECOR_Z.tintMid, DECOR_Z.tintNear, t),
    desat: far ? lerp(DECOR_Z.desatFar, 0, t) : 0,
    frontOfFish: z >= DECOR_Z.frontOfFish,
  };
}

/** The depth whose base line is at tank y `baseY` (the inverse of `depthGeometry(z).dy`), clamped to 0…1. */
export function zFromBaseY(baseY: number): number {
  const dy = baseY - SAND_Y;
  const z = dy <= 0 ? 0.5 * ((dy - DECOR_Z.farDy) / -DECOR_Z.farDy) : 0.5 + 0.5 * (dy / DECOR_Z.nearDy);
  return clampZ(z);
}

/** Dragging magnet: close to the original sand line snaps onto it. */
export function snapZ(z: number): number {
  return Math.abs(z - DECOR_Z.mid) <= DECOR_Z.snap ? DECOR_Z.mid : clampZ(z);
}

/** Depth rounded to the haze cache buckets (so a baked sprite is reused across tiny differences). */
export function hazeBucket(z: number): number {
  return Math.round(clampZ(z) * DECOR_Z.hazeSteps);
}

/** Sand pieces drawn behind the fish / over the fish, each sorted far → near (painter's order). */
export function decorDrawOrder<T extends Pick<PlacedDecor, 'z'>>(items: T[], inFront: boolean): T[] {
  return items.filter((d) => depthGeometry(d.z).frontOfFish === inFront).sort((a, b) => clampZ(a.z) - clampZ(b.z));
}

// ---------------------------------------------------------------------------
// Depth planes (shared by decor and shell/pearl drops)
// ---------------------------------------------------------------------------

export const DEPTH_PLANE_LIST: readonly DepthPlane[] = ['back', 'mid', 'front'];

export interface PlaneConfig extends DepthGeometry {
  plane: DepthPlane;
  /** The depth `z` decor on this plane has. */
  z: number;
  /** Contact-shadow size multiplier. */
  shadow: number;
  /** Fall-speed multiplier for drops (back drops sink a bit slower). */
  fallSpeed: number;
  /** 0…1: how much of the plane's tint / desaturation a drop takes (decor always takes all of it). */
  dropHaze: number;
}

/** One plane's look for a theme: y offset from the sand line, scale, water tint / desaturation, shadow size. */
export function planeConfig(theme: ThemeId, plane: DepthPlane): PlaneConfig {
  const def = DEPTH_PLANES[plane];
  const geo = depthGeometry(def.z);
  const tint = Math.min(0.6, geo.tint * (THEME_PLANE_TINT[theme] ?? 1));
  return { ...geo, tint, plane, z: def.z, shadow: def.shadow, fallSpeed: def.fallSpeed, dropHaze: def.dropHaze };
}

/** The plane a decor depth `z` is closest to. */
export function planeOfZ(z: number): DepthPlane {
  const c = clampZ(z);
  return DEPTH_PLANE_LIST.reduce((best, p) => (Math.abs(DEPTH_PLANES[p].z - c) < Math.abs(DEPTH_PLANES[best].z - c) ? p : best), 'mid' as DepthPlane);
}

/** Picks a landing plane by weight (back 30 %, mid 40 %, front 30 %) from one `rng()` draw in [0, 1). */
export function pickPlane(rng: () => number): DepthPlane {
  const r = rng();
  let acc = 0;
  for (const p of DEPTH_PLANE_LIST) {
    acc += DROP_PLANE_WEIGHTS[p];
    if (r < acc) return p;
  }
  return 'mid';
}

/** Draw order of a drop among decor: by its plane's depth, in front of decor at the same depth. */
export function dropDrawZ(plane: DepthPlane): number {
  return DEPTH_PLANES[plane].z + 1e-3;
}

/** A save from before depth planes: drops without a valid plane land on "mid" (the old sand line). */
export function validPlane(v: unknown): DepthPlane {
  return v === 'back' || v === 'mid' || v === 'front' ? v : 'mid';
}
