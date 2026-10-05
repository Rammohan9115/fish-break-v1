import { describe, expect, it } from 'vitest';
import { applyXp, grantXp, levelUpReward, nextUnlock, unlocksAtLevel, UNLOCKS, xpToNext } from './levels';
import { makeState } from './testUtils';

describe('xpToNext', () => {
  it('follows round(30 * level^1.5)', () => {
    expect(xpToNext(1)).toBe(30);
    expect(xpToNext(2)).toBe(85);
    expect(xpToNext(3)).toBe(156);
    expect(xpToNext(10)).toBe(949);
  });
});

describe('applyXp', () => {
  it('accumulates without leveling below the threshold', () => {
    expect(applyXp(1, 0, 29)).toEqual({ level: 1, xp: 29, levelsGained: [], shellsAwarded: 0 });
  });

  it('levels up and carries over remaining xp', () => {
    expect(applyXp(1, 20, 15)).toEqual({ level: 2, xp: 5, levelsGained: [2], shellsAwarded: 20 });
  });

  it('can roll over multiple levels at once', () => {
    const result = applyXp(1, 0, 30 + 85 + 1);
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
    // Decor is never level-gated, so it never appears as an unlock.
    expect(ids(3)).toEqual(['goldfish']);
    expect(ids(4)).toEqual(['capacityUpgrade']);
    expect(ids(5)).toEqual(['betta', 'breeding']);
    expect(ids(6)).toEqual(['tetra']);
    expect(ids(7)).toEqual([]);
    expect(ids(8)).toEqual(['angelfish', 'tank2']);
    expect(ids(9)).toEqual([]);
    expect(ids(10)).toEqual(['jellyfish', 'night']);
    expect(ids(12)).toEqual(['clownfish', 'coral']);
    expect(ids(13)).toEqual([]);
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
    const once = grantXp(state, 31);
    expect(once.state).toMatchObject({ level: 2, xp: 1, shells: 20 });
    expect(once.levelsGained).toEqual([2]);
    const many = grantXp(state, 30 + 85 + 156);
    expect(many.state).toMatchObject({ level: 4, xp: 0, shells: 20 + 30 + 40 });
    expect(many.levelsGained).toEqual([2, 3, 4]);
  });

  it('ignores zero or negative amounts', () => {
    const state = makeState();
    expect(grantXp(state, 0).state).toBe(state);
    expect(grantXp(state, -5).state).toBe(state);
  });
});

describe('nextUnlock', () => {
  it('finds the next level with an unlock, features first', () => {
    const next = nextUnlock(4);
    expect(next?.level).toBe(5);
    expect(next?.unlocks[0]?.id).toBe('breeding');
  });
  it('skips levels with nothing new', () => {
    const next = nextUnlock(15);
    expect(next?.level).toBeGreaterThan(15);
    expect(next?.unlocks.length).toBeGreaterThan(0);
  });
  it('returns null past the last unlock', () => {
    expect(nextUnlock(999)).toBeNull();
  });
});
