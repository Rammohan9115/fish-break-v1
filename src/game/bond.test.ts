import { describe, expect, it } from 'vitest';
import {
  bondDropValue,
  bondLevelFor,
  completePetSession,
  grantFeedBond,
  nextBondLevel,
  nextSessionAt,
  playableTricks,
  sessionsLeft,
  setBondLevel,
  startBondFor,
  unlockedTricks,
} from './bond';
import { completeCourtships, startCourtship } from './breeding';
import { BOND, HOUR_MS, MINUTE_MS, SECOND_MS } from './constants';
import { simulateOffline, tick } from './sim';
import { SPECIES } from './species';
import { constRng, makeFish, makeState, seededRng, T0 } from './testUtils';
import type { BondLevel, Fish, GameState } from './types';

const stateWith = (fish: Fish[], o: Partial<GameState> = {}) => makeState({ fish, overrides: { lastTickAt: T0, ...o } });
const fishOf = (s: GameState, id: string) => s.fish.find((f) => f.id === id)!;

describe('bond levels', () => {
  it('uses the thresholds 0 / 10 / 30 / 60 / 100 / 160', () => {
    expect([0, 9.9, 10, 29, 30, 59, 60, 99, 100, 159, 160, 999].map(bondLevelFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('new fish start as Strangers with empty logs', () => {
    const f = makeFish();
    expect(f).toMatchObject({ bondPoints: 0, bondLevel: 0, petLog: [], feedBondLog: [], lastPettedAt: null });
  });

  it('describes the next level and what it unlocks', () => {
    const f = { ...makeFish({ speciesId: 'goldfish' }), bondPoints: 48, bondLevel: 2 as BondLevel };
    expect(nextBondLevel(f)).toMatchObject({ level: 3, name: 'Buddy', toGo: 12, unlock: 'Trick: Bubble Hoop' });
    expect(nextBondLevel(f)!.fraction).toBeCloseTo(18 / 30);
    expect(nextBondLevel(setBondLevel(f, 4))!.unlock).toBe('Trick: Heart Bubble');
    expect(nextBondLevel(setBondLevel(f, 5))).toBeNull();
  });

  it('unlocks tricks by level; follow is a toggle, not a double-tap trick', () => {
    const f = makeFish();
    expect(unlockedTricks(setBondLevel(f, 1))).toEqual([]);
    expect(unlockedTricks(setBondLevel(f, 2))).toEqual(['spin']);
    expect(unlockedTricks(setBondLevel(f, 5))).toEqual(['spin', 'hoop', 'follow', 'signature']);
    expect(playableTricks(setBondLevel(f, 5))).toEqual(['spin', 'hoop', 'signature']);
  });
});

describe('pet sessions', () => {
  it('a completed session gives +3 bond, +5 happiness and +1 XP', () => {
    const f = makeFish({ happiness: 50 });
    const r = completePetSession(stateWith([f], { xp: 0 }), f.id, T0);
    expect(r.rewarded).toBe(true);
    expect(fishOf(r.state, f.id)).toMatchObject({ bondPoints: BOND.petSession, happiness: 55, lastPettedAt: T0, petLog: [T0] });
    expect(r.state.xp).toBe(BOND.petXp);
  });

  it('happiness is capped at 100', () => {
    const f = makeFish({ happiness: 98 });
    expect(fishOf(completePetSession(stateWith([f]), f.id, T0).state, f.id).happiness).toBe(100);
  });

  it('caps rewarded sessions at 3 per rolling hour; later sessions only make the fish content', () => {
    const f = makeFish({ happiness: 40 });
    let s = stateWith([f]);
    for (let i = 0; i < 3; i++) s = completePetSession(s, f.id, T0 + i * 5 * MINUTE_MS).state;
    expect(sessionsLeft(fishOf(s, f.id), T0 + 10 * MINUTE_MS)).toBe(0);
    const capped = completePetSession(s, f.id, T0 + 20 * MINUTE_MS);
    expect(capped.rewarded).toBe(false);
    expect(fishOf(capped.state, f.id).bondPoints).toBe(9);
    expect(fishOf(capped.state, f.id).happiness).toBe(40 + 3 * BOND.petHappiness + BOND.contentHappiness);
    expect(capped.state.xp).toBe(s.xp);
    // Rolling: one hour after the first session, one frees up.
    expect(nextSessionAt(fishOf(s, f.id), T0 + 20 * MINUTE_MS)).toBe(T0 + HOUR_MS);
    expect(sessionsLeft(fishOf(s, f.id), T0 + HOUR_MS)).toBe(1);
    expect(completePetSession(s, f.id, T0 + HOUR_MS).rewarded).toBe(true);
  });

  it('reports a bond level-up', () => {
    const f = { ...makeFish(), bondPoints: 8, bondLevel: 0 as BondLevel };
    const r = completePetSession(stateWith([f]), f.id, T0);
    expect(r.levelUp).toEqual({ fishId: f.id, from: 0, to: 1 });
    expect(fishOf(r.state, f.id).bondLevel).toBe(1);
  });

  it('a missing fish is a no-op', () => {
    const s = stateWith([]);
    expect(completePetSession(s, 'nope', T0).state).toBe(s);
  });
});

describe('hand-feeding bond', () => {
  it('gives +0.2 per pellet, at most +2 per fish per rolling hour', () => {
    const f = makeFish();
    let s = stateWith([f]);
    for (let i = 0; i < 15; i++) s = grantFeedBond(s, f.id, T0 + i * SECOND_MS).state;
    expect(fishOf(s, f.id).bondPoints).toBeCloseTo(BOND.feedBondPerHour);
    s = grantFeedBond(s, f.id, T0 + HOUR_MS).state;
    expect(fishOf(s, f.id).bondPoints).toBeCloseTo(BOND.feedBondPerHour + BOND.feedBond);
  });
});

describe('perks', () => {
  it('Best Friend+ shell drops are worth 10% more (rounded up)', () => {
    const f = makeFish();
    expect(bondDropValue(setBondLevel(f, 3), 5)).toBe(5);
    expect(bondDropValue(setBondLevel(f, 4), 5)).toBe(6);
    expect(bondDropValue(setBondLevel(f, 5), 80)).toBe(88);
  });

  it('applies the bonus in the sim', () => {
    const adult = { ...setBondLevel(makeFish({ stage: 'adult', growth: 1200, hunger: 100, lastDropAt: T0 }), 4) };
    const r = tick(stateWith([adult]), SPECIES.danio.dropMinutes * MINUTE_MS, constRng(0.5));
    const drop = r.state.tanks[0]!.shells[0]!;
    expect(drop.value).toBe(Math.ceil(SPECIES.danio.dropValue * 1.1));
  });
});

describe('baby starting bond', () => {
  const ready = (level: BondLevel) => setBondLevel(makeFish({ stage: 'adult', growth: 1200, hunger: 90, happiness: 90, lastBredAt: null }), level);
  let seq = 0;
  const newId = (p: string) => `${p}-${++seq}`;

  it('is Curious when both parents are Buddy or closer, else Stranger', () => {
    expect(startBondFor(ready(3), ready(5))).toBe(BOND.levels[1]);
    expect(startBondFor(ready(3), ready(2))).toBe(0);
  });

  it('carries through the egg to the hatched baby', () => {
    const a = ready(3);
    const b = ready(4);
    const started = startCourtship(stateWith([a, b], { level: 5 }), a.id, b.id, T0, 300);
    if (!started.ok) throw new Error('should start');
    const laid = completeCourtships(started.state, T0 + 60 * SECOND_MS, constRng(0.5), newId).state;
    expect(laid.eggs[0]!.startBond).toBe(BOND.levels[1]);
    const hatched = simulateOffline(laid, T0 + HOUR_MS, seededRng(2)).state;
    const baby = hatched.fish.find((f) => f.id !== a.id && f.id !== b.id)!;
    expect(baby).toMatchObject({ bondPoints: 10, bondLevel: 1 });
  });
});

describe('bond never decreases', () => {
  it('8 hours of offline neglect leave bond and logs untouched', () => {
    const f = { ...setBondLevel(makeFish({ hunger: 10, happiness: 10 }), 4), bondPoints: 123.4 };
    const after = simulateOffline(stateWith([f]), T0 + 8 * HOUR_MS, seededRng(3)).state;
    expect(fishOf(after, f.id)).toMatchObject({ bondPoints: 123.4, bondLevel: 4 });
  });

  it('capped and rewarded sessions never lower it', () => {
    const f = makeFish();
    let s = stateWith([f]);
    let last = 0;
    for (let i = 0; i < 10; i++) {
      s = completePetSession(s, f.id, T0 + i * MINUTE_MS).state;
      const now = fishOf(s, f.id).bondPoints;
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });
});
