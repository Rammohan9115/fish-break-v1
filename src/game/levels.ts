// Level curve, XP application, and the unlock table.
import {
  CAPACITY_UPGRADE,
  DECOR_LIST,
  LEVEL_UP_SHELLS_PER_LEVEL,
  PREMIUM_FOOD_PACK,
  TANK_PURCHASES,
  THEMES,
  UNLOCK_LEVEL,
  XP_CURVE_BASE,
  XP_CURVE_EXPONENT,
} from './constants';
import { SPECIES_LIST } from './species';
import type { GameState } from './types';

/** XP required to advance from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(XP_CURVE_BASE * Math.pow(level, XP_CURVE_EXPONENT));
}

/** Shells granted on reaching `level`. */
export function levelUpReward(level: number): number {
  return level * LEVEL_UP_SHELLS_PER_LEVEL;
}

export interface XpResult {
  level: number;
  xp: number;
  /** Each level reached, in order (empty if none). */
  levelsGained: number[];
  /** Total shells granted for the level-ups. */
  shellsAwarded: number;
}

/** Adds XP to a (level, xp-progress) pair, rolling over as many levels as needed. */
export function applyXp(level: number, xp: number, amount: number): XpResult {
  let nextLevel = level;
  let progress = xp + Math.max(0, amount);
  const levelsGained: number[] = [];
  let shellsAwarded = 0;
  while (progress >= xpToNext(nextLevel)) {
    progress -= xpToNext(nextLevel);
    nextLevel += 1;
    levelsGained.push(nextLevel);
    shellsAwarded += levelUpReward(nextLevel);
  }
  return { level: nextLevel, xp: progress, levelsGained, shellsAwarded };
}

/** Adds XP to a game state, applying level-ups and their shell rewards. */
export function grantXp(state: GameState, amount: number): { state: GameState; levelsGained: number[] } {
  if (amount <= 0) return { state, levelsGained: [] };
  const result = applyXp(state.level, state.xp, amount);
  return {
    state: { ...state, level: result.level, xp: result.xp, shells: state.shells + result.shellsAwarded },
    levelsGained: result.levelsGained,
  };
}

export type UnlockKind = 'species' | 'decor' | 'feature' | 'theme' | 'tank';

export interface Unlock {
  level: number;
  kind: UnlockKind;
  id: string;
  label: string;
}

function buildUnlocks(): Unlock[] {
  const unlocks: Unlock[] = [
    ...SPECIES_LIST.map((s) => ({ level: s.unlockLevel, kind: 'species' as const, id: s.id, label: s.name })),
    ...DECOR_LIST.map((d) => ({ level: d.unlockLevel, kind: 'decor' as const, id: d.id, label: d.name })),
    {
      level: UNLOCK_LEVEL.premiumFood,
      kind: 'feature',
      id: 'premiumFood',
      label: `Premium food (${PREMIUM_FOOD_PACK.price.amount} shells for ${PREMIUM_FOOD_PACK.count})`,
    },
    { level: UNLOCK_LEVEL.decorShop, kind: 'feature', id: 'decorShop', label: 'Decor shop' },
    { level: UNLOCK_LEVEL.breeding, kind: 'feature', id: 'breeding', label: 'Breeding' },
    {
      level: UNLOCK_LEVEL.capacityUpgrade,
      kind: 'feature',
      id: 'capacityUpgrade',
      label: `Tank capacity upgrade (+${CAPACITY_UPGRADE.slots} slots)`,
    },
    ...TANK_PURCHASES.map((t, i) => ({
      level: t.unlockLevel,
      kind: 'tank' as const,
      id: `tank${i + 2}`,
      label: i === 0 ? 'Second tank' : 'Third tank',
    })),
    ...Object.values(THEMES)
      .filter((t) => t.price !== null)
      .map((t) => ({ level: t.unlockLevel, kind: 'theme' as const, id: t.id, label: `${t.name} theme` })),
  ];
  return unlocks.sort((a, b) => a.level - b.level);
}

/** Every unlock in the game, sorted by level. */
export const UNLOCKS: Unlock[] = buildUnlocks();

/** Unlocks that become available exactly at `level` (for the level-up modal). */
export function unlocksAtLevel(level: number): Unlock[] {
  return UNLOCKS.filter((u) => u.level === level);
}

export function isUnlocked(playerLevel: number, requiredLevel: number): boolean {
  return playerLevel >= requiredLevel;
}

/** The next level above `level` that unlocks something, and what (features first). Null when everything is unlocked. */
export function nextUnlock(level: number): { level: number; unlocks: Unlock[] } | null {
  const upcoming = UNLOCKS.find((u) => u.level > level);
  if (!upcoming) return null;
  const at = unlocksAtLevel(upcoming.level);
  const order: Record<UnlockKind, number> = { feature: 0, species: 1, tank: 2, theme: 3, decor: 4 };
  return { level: upcoming.level, unlocks: [...at].sort((a, b) => order[a.kind] - order[b.kind]) };
}
