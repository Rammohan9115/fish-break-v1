// Shared helpers for sim tests.
import { createFish, createInitialState, createTank } from './sim';
import type { Fish, GameState, Rng, SpeciesId, Tank } from './types';

export const T0 = 1_700_000_000_000;

/** Deterministic seeded RNG (mulberry32). */
export function seededRng(seed = 1): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const constRng = (value: number): Rng => () => value;

let fishSeq = 0;
export function makeFish(overrides: Partial<Fish> & { speciesId?: SpeciesId } = {}): Fish {
  fishSeq += 1;
  const base = createFish(overrides.speciesId ?? 'danio', overrides.tankId ?? 'tank-1', T0, seededRng(fishSeq), {
    id: `test-fish-${fishSeq}`,
  });
  return { ...base, ...overrides };
}

export function makeTank(overrides: Partial<Tank> = {}): Tank {
  return { ...createTank(overrides.id ?? 'tank-1', 'Test'), ...overrides };
}

/** A state with one tank and the given fish (default: none). */
export function makeState(opts: { fish?: Fish[]; tank?: Partial<Tank>; overrides?: Partial<GameState> } = {}): GameState {
  const base = createInitialState(T0, seededRng(99));
  return {
    ...base,
    tanks: [makeTank(opts.tank)],
    fish: opts.fish ?? [],
    ...opts.overrides,
  };
}
