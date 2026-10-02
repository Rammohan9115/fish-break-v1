import { describe, expect, it } from 'vitest';
import {
  breedCooldownLeft,
  breedingUnlocked,
  canBreed,
  eligiblePairs,
  hasReadyPartner,
  hatchMinutes,
  isBreedingCheckDue,
  offspringShiny,
  offspringVariant,
  runBreedingCheck,
} from './breeding';
import { BREEDING, MINUTE_MS, XP } from './constants';
import { simulateOffline, tick } from './sim';
import { SPECIES } from './species';
import { constRng, makeFish, makeState, seededRng } from './testUtils';
import type { Fish, GameState } from './types';

/** A 5-minute boundary to anchor time-based tests. */
const B = 5_666_667 * BREEDING.checkIntervalMs;

const ready = (o: Partial<Fish> = {}) =>
  makeFish({ stage: 'adult', growth: 1200, hunger: 90, happiness: 90, lastBredAt: null, ...o });

let seq = 0;
const newId = (prefix: string) => `${prefix}-${++seq}`;

function breedState(fish: Fish[], o: { level?: number; capacity?: number } = {}): GameState {
  return makeState({ fish, tank: { capacity: o.capacity ?? 10 }, overrides: { level: o.level ?? 5, lastTickAt: B - 1000 } });
}

describe('unlock', () => {
  it('breeding unlocks at level 5', () => {
    expect(breedingUnlocked(breedState([], { level: 4 }))).toBe(false);
    expect(breedingUnlocked(breedState([], { level: 5 }))).toBe(true);
  });

  it('no eggs below level 5 even when everything else is perfect', () => {
    const s = breedState([ready(), ready()], { level: 4 });
    expect(runBreedingCheck(s, B, constRng(0), newId).laid).toHaveLength(0);
  });
});

describe('eligibility', () => {
  it('requires adult, happiness >= 80, hunger >= 50', () => {
    expect(canBreed(ready(), B)).toBe(true);
    expect(canBreed(ready({ stage: 'juvenile', growth: 600 }), B)).toBe(false);
    expect(canBreed(ready({ happiness: 80 }), B)).toBe(true);
    expect(canBreed(ready({ happiness: 79.9 }), B)).toBe(false);
    expect(canBreed(ready({ hunger: 50 }), B)).toBe(true);
    expect(canBreed(ready({ hunger: 49.9 }), B)).toBe(false);
  });

  it('requires 60 minutes since lastBredAt', () => {
    const justBred = ready({ lastBredAt: B - 59 * MINUTE_MS });
    expect(canBreed(justBred, B)).toBe(false);
    expect(breedCooldownLeft(justBred, B)).toBe(MINUTE_MS);
    expect(canBreed(ready({ lastBredAt: B - 60 * MINUTE_MS }), B)).toBe(true);
    expect(breedCooldownLeft(ready({ lastBredAt: null }), B)).toBe(0);
  });

  it('pairs only same-species fish in the same tank', () => {
    const a = ready();
    const b = ready();
    const guppy = ready({ speciesId: 'guppy' });
    const elsewhere = ready({ tankId: 'tank-2' });
    const s = breedState([a, b, guppy, elsewhere]);
    const pairs = eligiblePairs(s, 'tank-1', B).map(([x, y]) => [x.id, y.id]);
    expect(pairs).toEqual([[a.id, b.id]]);
    expect(hasReadyPartner(s, a, B)).toBe(true);
    expect(hasReadyPartner(s, guppy, B)).toBe(false);
  });

  it('both fish in a pair must be eligible', () => {
    const s = breedState([ready(), ready({ hunger: 10 })]);
    expect(eligiblePairs(s, 'tank-1', B)).toHaveLength(0);
  });
});

describe('5-minute checks', () => {
  it('is due only when crossing a 5-minute boundary', () => {
    expect(isBreedingCheckDue(B, 1000)).toBe(true);
    expect(isBreedingCheckDue(B + 1000, 1000)).toBe(false);
    expect(isBreedingCheckDue(B - 1, 1000)).toBe(false);
    expect(isBreedingCheckDue(B + 30_000, 60_000)).toBe(true);
  });

  it('tick lays eggs only on a check boundary', () => {
    const s = breedState([ready(), ready()]);
    const onBoundary = tick(s, 1000, constRng(0));
    expect(onBoundary.state.eggs).toHaveLength(1);
    expect(onBoundary.events.some((e) => e.type === 'eggLaid')).toBe(true);
    const offBoundary = tick({ ...s, lastTickAt: B }, 1000, constRng(0));
    expect(offBoundary.state.eggs).toHaveLength(0);
  });
});

describe('laying', () => {
  it('has a 25% chance per eligible pair', () => {
    const s = breedState([ready(), ready()]);
    expect(runBreedingCheck(s, B, constRng(0.2499), newId).laid).toHaveLength(1);
    expect(runBreedingCheck(s, B, constRng(0.25), newId).laid).toHaveLength(0);
  });

  it('lays roughly 25% of the time over many checks', () => {
    const s = breedState([ready(), ready()]);
    const rng = seededRng(11);
    let laid = 0;
    for (let i = 0; i < 4000; i++) laid += runBreedingCheck(s, B, rng, newId).laid.length;
    expect(laid / 4000).toBeGreaterThan(0.22);
    expect(laid / 4000).toBeLessThan(0.28);
  });

  it('creates an egg and starts both parents’ cooldown', () => {
    const a = ready();
    const b = ready();
    const { state, laid } = runBreedingCheck(breedState([a, b]), B, constRng(0), newId);
    expect(laid).toHaveLength(1);
    expect(laid[0]!.parentIds).toEqual([a.id, b.id]);
    expect(state.eggs[0]).toMatchObject({ speciesId: 'danio', tankId: 'tank-1', hatchAt: B + 10 * MINUTE_MS });
    expect(state.fish.every((f) => f.lastBredAt === B)).toBe(true);
  });

  it('a fish lays at most one egg per check (one egg per pair)', () => {
    const three = breedState([ready(), ready(), ready()]);
    expect(runBreedingCheck(three, B, constRng(0), newId).laid).toHaveLength(1);
    const four = breedState([ready(), ready(), ready(), ready()]);
    expect(runBreedingCheck(four, B, constRng(0), newId).laid).toHaveLength(2);
  });

  it('needs a free slot; eggs count toward capacity', () => {
    expect(runBreedingCheck(breedState([ready(), ready()], { capacity: 2 }), B, constRng(0), newId).laid).toHaveLength(0);
    expect(runBreedingCheck(breedState([ready(), ready()], { capacity: 3 }), B, constRng(0), newId).laid).toHaveLength(1);
    // 4 fish + first egg fills capacity 5, so the second pair can't lay.
    const r = runBreedingCheck(breedState([ready(), ready(), ready(), ready()], { capacity: 5 }), B, constRng(0), newId);
    expect(r.laid).toHaveLength(1);
    expect(r.state.eggs).toHaveLength(1);
  });

  it('cooldown blocks the next check, and lifts after 60 minutes', () => {
    let s = breedState([ready(), ready()]);
    s = runBreedingCheck(s, B, constRng(0), newId).state;
    expect(runBreedingCheck(s, B + 5 * MINUTE_MS, constRng(0), newId).laid).toHaveLength(0);
    expect(runBreedingCheck(s, B + 60 * MINUTE_MS, constRng(0), newId).laid).toHaveLength(1);
  });
});

describe('hatch timing', () => {
  it('hatches in max(10, growMinutes / 4) minutes', () => {
    expect(hatchMinutes('danio')).toBe(10); // 20/4 = 5 → 10
    expect(hatchMinutes('goldfish')).toBe(11.25);
    expect(hatchMinutes('axolotl')).toBe(60);
    expect(hatchMinutes('koi')).toBe(75);
    for (const s of Object.values(SPECIES)) expect(hatchMinutes(s.id)).toBeGreaterThanOrEqual(10);
  });

  it('the egg hatches into a baby with the egg’s variant via tick', () => {
    let s = breedState([ready({ variant: 'peach' }), ready({ variant: 'peach' })]);
    s = tick(s, 1000, constRng(0)).state;
    const egg = s.eggs[0]!;
    // Jump to just before / at hatch time.
    s = { ...s, lastTickAt: egg.hatchAt - 1000 };
    const r = tick(s, 1000, seededRng(5));
    expect(r.state.eggs).toHaveLength(0);
    const baby = r.state.fish.find((f) => f.stage === 'baby')!;
    expect(baby).toMatchObject({ speciesId: 'danio', variant: 'peach', bornAt: egg.hatchAt });
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'hatched', eggId: egg.id, fishId: baby.id }));
    expect(r.state.xp).toBe(s.xp + XP.eggHatched);
  });
});

describe('inheritance', () => {
  const a = ready({ variant: 'zebra' });
  const b = ready({ variant: 'peach' });

  it('45% parent A, 45% parent B, 10% random', () => {
    expect(offspringVariant(a, b, constRng(0.44))).toBe('zebra');
    expect(offspringVariant(a, b, constRng(0.45))).toBe('peach');
    expect(offspringVariant(a, b, constRng(0.899))).toBe('peach');
    const rolls = [0.95, 0.99]; // random branch, then pick the last variant
    expect(offspringVariant(a, b, () => rolls.shift()!)).toBe(SPECIES.danio.variants[2]!.key);
  });

  it('distribution is roughly 45/45/10', () => {
    const rng = seededRng(3);
    const counts: Record<string, number> = {};
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const v = offspringVariant(a, b, rng);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    // Random branch picks each of 3 variants ~3.3%, so zebra/peach ≈ 48.3%, mint ≈ 3.3%.
    expect(counts.zebra! / n).toBeCloseTo(0.483, 1);
    expect(counts.peach! / n).toBeCloseTo(0.483, 1);
    expect(counts.mint! / n).toBeCloseTo(0.033, 1);
  });

  it('shiny chance is 3%, or 10% with a shiny parent', () => {
    expect(offspringShiny(a, b, constRng(0.0299))).toBe(true);
    expect(offspringShiny(a, b, constRng(0.03))).toBe(false);
    const shinyParent = ready({ shiny: true });
    expect(offspringShiny(shinyParent, b, constRng(0.0999))).toBe(true);
    expect(offspringShiny(a, shinyParent, constRng(0.0999))).toBe(true);
    expect(offspringShiny(shinyParent, b, constRng(0.1))).toBe(false);
  });

  it('a shiny egg hatches into a shiny fish and gives +2 pearls', () => {
    const s: GameState = {
      ...breedState([]),
      eggs: [{ id: 'e1', speciesId: 'danio', variant: 'mint', shiny: true, tankId: 'tank-1', hatchAt: B }],
    };
    const r = tick(s, 1000, seededRng(1));
    expect(r.state.fish[0]!.shiny).toBe(true);
    expect(r.state.pearls).toBe(s.pearls + BREEDING.shinyHatchPearls);
  });
});

describe('offline', () => {
  it('a happy pair lays and the egg hatches during offline catch-up', () => {
    const s = breedState([ready({ hunger: 100 }), ready({ hunger: 100 })]);
    const { state, summary } = simulateOffline(s, B + 40 * MINUTE_MS, constRng(0));
    expect(summary.eggsHatched).toBeGreaterThanOrEqual(1);
    // Danios grow in 20 minutes, so the hatchling may already be grown; count fish instead.
    expect(state.fish.length).toBeGreaterThanOrEqual(3);
  });
});
