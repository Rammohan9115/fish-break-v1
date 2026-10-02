import { describe, expect, it } from 'vitest';
import { applyXp, grantXp, levelUpReward, unlocksAtLevel, UNLOCKS, xpToNext } from './levels';
import { makeState } from './testUtils';

describe('xpToNext', () => {
  it('follows round(40 * level^1.5)', () => {
    expect(xpToNext(1)).toBe(40);
    expect(xpToNext(2)).toBe(113);
    expect(xpToNext(3)).toBe(208);
    expect(xpToNext(10)).toBe(1265);
  });
});

describe('applyXp', () => {
  it('accumulates without leveling below the threshold', () => {
    expect(applyXp(1, 0, 39)).toEqual({ level: 1, xp: 39, levelsGained: [], shellsAwarded: 0 });
  });

  it('levels up and carries over remaining xp', () => {
    expect(applyXp(1, 30, 15)).toEqual({ level: 2, xp: 5, levelsGained: [2], shellsAwarded: 20 });
  });

  it('can roll over multiple levels at once', () => {
    const result = applyXp(1, 0, 40 + 113 + 1);
    expect(result.level).toBe(3);
    expect(result.xp).toBe(1);
    expect(result.levelsGained).toEqual([2, 3]);
    expect(result.shellsAwarded).toBe(levelUpReward(2) + levelUpReward(3));
  });
});

describe('unlocks', () => {
  it('level-up reward is level * 10 shells', () => {
    expect(levelUpReward(5)).toBe(50);
  });

  it('lists the spec unlocks at the right levels', () => {
    const ids = (level: number) => unlocksAtLevel(level).map((u) => u.id).sort();
    expect(ids(1)).toEqual(['danio', 'guppy']);
    expect(ids(2)).toEqual(['premiumFood']);
    expect(ids(3)).toEqual(['decorShop', 'goldfish', 'plant_small', 'plant_tall', 'rock'].sort());
    expect(ids(5)).toEqual(['betta', 'breeding']);
    expect(ids(6)).toEqual(['castle', 'tetra']);
    expect(ids(7)).toEqual(['capacityUpgrade']);
    expect(ids(8)).toEqual(['angelfish', 'tank2']);
    expect(ids(9)).toEqual(['chest']);
    expect(ids(10)).toEqual(['night']);
    expect(ids(12)).toEqual(['clownfish', 'coral']);
    expect(ids(13)).toEqual(['shipwreck']);
    expect(ids(14)).toEqual(['tank3']);
    expect(ids(15)).toEqual(['puffer']);
    expect(ids(18)).toEqual(['axolotl']);
    expect(ids(20)).toEqual(['koi', 'pond']);
  });

  it('is sorted by level', () => {
    const levels = UNLOCKS.map((u) => u.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
});

describe('grantXp', () => {
  it('adds XP, rolls over levels, and pays level * 10 shells each', () => {
    const state = makeState({ overrides: { shells: 0, xp: 0, level: 1 } });
    const once = grantXp(state, 41);
    expect(once.state).toMatchObject({ level: 2, xp: 1, shells: 20 });
    expect(once.levelsGained).toEqual([2]);
    const many = grantXp(state, 40 + 113 + 208);
    expect(many.state).toMatchObject({ level: 4, xp: 0, shells: 20 + 30 + 40 });
    expect(many.levelsGained).toEqual([2, 3, 4]);
  });

  it('ignores zero or negative amounts', () => {
    const state = makeState();
    expect(grantXp(state, 0).state).toBe(state);
    expect(grantXp(state, -5).state).toBe(state);
  });
});
