// Petting & bond: pure rules. Bond only ever goes up; rewards are capped per rolling hour, the fun isn't.
import { BOND, HAPPINESS_MAX, HOUR_MS } from './constants';
import { grantXp } from './levels';
import type { BondLevel, Fish, GameState, SpeciesId } from './types';

export const MAX_BOND_LEVEL: BondLevel = 5;

export type TrickId = 'spin' | 'hoop' | 'follow' | 'signature';

export interface TrickDef {
  id: TrickId;
  label: string;
  icon: string;
  level: BondLevel;
}

export const TRICKS: readonly TrickDef[] = [
  { id: 'spin', label: 'Spin', icon: '🌀', level: 2 },
  { id: 'hoop', label: 'Bubble Hoop', icon: '🫧', level: 3 },
  { id: 'follow', label: 'Follow me', icon: '👆', level: 4 },
  { id: 'signature', label: 'Signature', icon: '🌟', level: 5 },
];

/** Each species' Soulmate trick. */
export const SIGNATURE_TRICKS: Record<SpeciesId, { label: string; icon: string }> = {
  goldfish: { label: 'Heart Bubble', icon: '💗' },
  guppy: { label: 'Rainbow Twirl', icon: '🌈' },
  danio: { label: 'Zoom Dash', icon: '💨' },
  tetra: { label: 'Zoom Dash', icon: '💨' },
  betta: { label: 'Fin Fan', icon: '🪭' },
  angelfish: { label: 'Loop-de-loop', icon: '➰' },
  clownfish: { label: 'Wiggle Dance', icon: '💃' },
  puffer: { label: 'Puff & Pop', icon: '🎈' },
  axolotl: { label: 'Backflip', icon: '🤸' },
  koi: { label: 'Leap', icon: '🌊' },
  jellyfish: { label: 'Rainbow Glow', icon: '✨' },
};

/** Display label + icon for a trick on this species. */
export function trickLabel(trick: TrickId, speciesId: SpeciesId): { label: string; icon: string } {
  if (trick === 'signature') return SIGNATURE_TRICKS[speciesId];
  const def = TRICKS.find((t) => t.id === trick)!;
  return { label: def.label, icon: def.icon };
}

export function bondLevelFor(points: number): BondLevel {
  let level: BondLevel = 0;
  for (let i = 0; i < BOND.levels.length; i++) if (points >= BOND.levels[i]!) level = i as BondLevel;
  return level;
}

export function bondName(level: BondLevel): string {
  return BOND.names[level];
}

/** Tricks this fish knows (in unlock order). */
export function unlockedTricks(fish: Pick<Fish, 'bondLevel'>): TrickId[] {
  return TRICKS.filter((t) => fish.bondLevel >= t.level).map((t) => t.id);
}

/** The tricks a double-tap plays (follow is a toggle, not a one-shot trick). */
export function playableTricks(fish: Pick<Fish, 'bondLevel'>): TrickId[] {
  return unlockedTricks(fish).filter((t) => t !== 'follow');
}

/** What each bond level unlocks, in words. */
export function levelUnlockText(level: BondLevel, speciesId: SpeciesId): string {
  switch (level) {
    case 1:
      return 'Says hi when you come near';
    case 2:
      return 'Trick: Spin';
    case 3:
      return 'Trick: Bubble Hoop';
    case 4:
      return 'Follow mode · +10% shells';
    case 5:
      return `Trick: ${SIGNATURE_TRICKS[speciesId].label}`;
    default:
      return '';
  }
}

/** Progress toward the next level: null at Soulmate. */
export function nextBondLevel(fish: Pick<Fish, 'bondPoints' | 'bondLevel' | 'speciesId'>): {
  level: BondLevel;
  name: string;
  toGo: number;
  fraction: number;
  unlock: string;
} | null {
  if (fish.bondLevel >= MAX_BOND_LEVEL) return null;
  const level = (fish.bondLevel + 1) as BondLevel;
  const from = BOND.levels[fish.bondLevel]!;
  const to = BOND.levels[level]!;
  return {
    level,
    name: bondName(level),
    toGo: Math.max(0, Math.ceil((to - fish.bondPoints) * 10) / 10),
    fraction: Math.min(1, Math.max(0, (fish.bondPoints - from) / (to - from))),
    unlock: levelUnlockText(level, fish.speciesId),
  };
}

const recent = (log: readonly number[], now: number): number[] => log.filter((t) => now - t < HOUR_MS && t <= now);

/** Rewarded pet sessions still available this rolling hour. */
export function sessionsLeft(fish: Pick<Fish, 'petLog'>, now: number): number {
  return Math.max(0, BOND.sessionsPerHour - recent(fish.petLog, now).length);
}

/** When the oldest counted session leaves the rolling hour (a session frees up), or null if not capped. */
export function nextSessionAt(fish: Pick<Fish, 'petLog'>, now: number): number | null {
  const log = recent(fish.petLog, now);
  if (log.length < BOND.sessionsPerHour) return null;
  return Math.min(...log) + HOUR_MS;
}

/** Adds bond (never subtracts) and keeps bondLevel in sync. */
function addBond(fish: Fish, amount: number): Fish {
  const bondPoints = Math.max(fish.bondPoints, fish.bondPoints + Math.max(0, amount));
  return { ...fish, bondPoints, bondLevel: Math.max(fish.bondLevel, bondLevelFor(bondPoints)) as BondLevel };
}

export interface BondLevelUp {
  fishId: string;
  from: BondLevel;
  to: BondLevel;
}

export interface PetResult {
  state: GameState;
  /** False when the hourly cap was reached: happiness only, the fish is "content". */
  rewarded: boolean;
  levelUp: BondLevelUp | null;
  levelsGained: number[];
}

/** One completed pet session (the meter filled). */
export function completePetSession(state: GameState, fishId: string, now: number): PetResult {
  const fish = state.fish.find((f) => f.id === fishId);
  if (!fish) return { state, rewarded: false, levelUp: null, levelsGained: [] };
  const rewarded = sessionsLeft(fish, now) > 0;
  let next: Fish = {
    ...fish,
    happiness: Math.min(HAPPINESS_MAX, fish.happiness + (rewarded ? BOND.petHappiness : BOND.contentHappiness)),
    lastPettedAt: now,
    petLog: rewarded ? [...recent(fish.petLog, now), now] : recent(fish.petLog, now),
  };
  if (rewarded) next = addBond(next, BOND.petSession);
  const levelUp = next.bondLevel > fish.bondLevel ? { fishId, from: fish.bondLevel, to: next.bondLevel } : null;
  let out: GameState = { ...state, fish: state.fish.map((f) => (f.id === fishId ? next : f)) };
  let levelsGained: number[] = [];
  if (rewarded) ({ state: out, levelsGained } = grantXp(out, BOND.petXp));
  return { state: out, rewarded, levelUp, levelsGained };
}

/** A fish ate a pellet the player dropped near it: a little bond, capped per rolling hour. */
export function grantFeedBond(state: GameState, fishId: string, now: number): { state: GameState; levelUp: BondLevelUp | null } {
  const fish = state.fish.find((f) => f.id === fishId);
  if (!fish) return { state, levelUp: null };
  const log = recent(fish.feedBondLog, now);
  if (log.length * BOND.feedBond >= BOND.feedBondPerHour - 1e-9) return { state, levelUp: null };
  const next = { ...addBond(fish, BOND.feedBond), feedBondLog: [...log, now] };
  const levelUp = next.bondLevel > fish.bondLevel ? { fishId, from: fish.bondLevel, to: next.bondLevel } : null;
  return { state: { ...state, fish: state.fish.map((f) => (f.id === fishId ? next : f)) }, levelUp };
}

/** Bond a baby starts with: Curious when both parents are Buddy or closer. */
export function startBondFor(a: Pick<Fish, 'bondLevel'>, b: Pick<Fish, 'bondLevel'>): number {
  return a.bondLevel >= BOND.parentMinLevel && b.bondLevel >= BOND.parentMinLevel ? BOND.levels[BOND.babyStartLevel]! : 0;
}

/** Shell drop value with the Best Friend+ bonus (pearls are unaffected). */
export function bondDropValue(fish: Pick<Fish, 'bondLevel'>, value: number): number {
  return fish.bondLevel >= BOND.dropBonusLevel ? Math.ceil(value * (1 + BOND.dropBonus)) : value;
}

/** Dev: set a fish's bond to exactly a level's threshold. */
export function setBondLevel(fish: Fish, level: BondLevel): Fish {
  return { ...fish, bondPoints: BOND.levels[level]!, bondLevel: level };
}

/** Bond fields for a new fish. */
export function newBond(points = 0): Pick<Fish, 'bondPoints' | 'bondLevel' | 'petLog' | 'lastPettedAt' | 'feedBondLog'> {
  return { bondPoints: points, bondLevel: bondLevelFor(points), petLog: [], lastPettedAt: null, feedBondLog: [] };
}
