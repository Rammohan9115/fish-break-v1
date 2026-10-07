import { describe, expect, it } from 'vitest';
import { CORY_EAT_COOLDOWN_MS } from '../constants';
import { applyGameEvent } from '../events';
import { coryEatCooldownMs, createInitialState } from '../sim';
import { constRng, makeFish, T0 } from '../testUtils';
import type { GameState } from '../types';
import { isLonely, nearestFriend, pickTip, TIPS } from './elder';
import { activeCase, forceAdvance, perksOf, takeRescue, taskValue } from './engine';
import { getRescue, RESCUES } from './registry';

const def = getRescue('professor_whiskers')!;
const started = (): GameState => {
  const r = takeRescue(createInitialState(T0, constRng(0.5)), 'professor_whiskers', T0, constRng(0.5));
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const withCorys = (g: GameState, n: number): GameState => ({ ...g, fish: [...g.fish, ...Array.from({ length: n }, () => makeFish({ speciesId: 'cory', tankId: g.activeTankId }))] });
const value = (g: GameState, i: number) => {
  const a = activeCase(g)!;
  return taskValue(g, a.def, a.c, i);
};

describe('Professor Whiskers', () => {
  it('appears on the Rescue Board automatically', () => {
    expect(RESCUES.map((r) => r.id)).toContain('professor_whiskers');
    expect(def.speciesId).toBe('cory');
  });

  it('the cory-count condition excludes himself', () => {
    const g = started();
    expect(g.fish.filter((f) => f.speciesId === 'cory')).toHaveLength(1);
    expect(value(g, 0)).toBe(0);
    expect(value(withCorys(g, 1), 0)).toBe(1);
  });

  it('stage 3 needs 2 other corys', () => {
    let g = started();
    for (let i = 0; i < 2; i++) g = forceAdvance(g, `d${i}`, T0).state;
    expect(value(g, 0)).toBe(0);
    expect(value(withCorys(g, 1), 0)).toBe(1);
    expect(value(withCorys(g, 2), 0)).toBe(2);
  });

  it('is lonely until a cory is near, then finds the nearest friend', () => {
    const prof = { x: 100, y: 100 };
    expect(isLonely(prof, [])).toBe(true);
    expect(isLonely(prof, [{ x: 900, y: 100 }])).toBe(true);
    const near = { x: 200, y: 110 };
    expect(isLonely(prof, [{ x: 900, y: 100 }, near])).toBe(false);
    expect(nearestFriend(prof, [{ x: 250, y: 100 }, near])).toBe(near);
  });

  it('unlocks one letter per stage (4 in total) plus the completion letter', () => {
    expect(def.stages.every((s) => s.letter)).toBe(true);
    let g = started();
    const before = g.mail.length;
    g = forceAdvance(g, 'd0', T0).state;
    expect(g.mail.length).toBe(before + 1);
    expect(g.mail[0]!.title).toBe(def.stages[0]!.letter!.title);
    for (let i = 1; i < 4; i++) g = forceAdvance(g, `d${i}`, T0).state;
    expect(g.mail.length).toBe(before + 5);
    expect(g.mail[0]!.title).toBe(def.completion.title);
  });

  it('the group photo adds a journal card with the number of friends', () => {
    let g = withCorys(started(), 2);
    for (let i = 0; i < 3; i++) g = forceAdvance(g, `d${i}`, T0).state;
    const journalBefore = g.journal.length;
    g = applyGameEvent(g, { type: 'interact', actionId: 'group_photo' }, T0, constRng(0.5)).state;
    g = forceAdvance(g, 'd9', T0).state;
    expect(g.journal.length).toBe(journalBefore + 2);
    expect(g.journal.some((j) => j.text.includes('📸') && j.text.includes('2 cory friends'))).toBe(true);
  });

  it('rewards glasses, tips and the group bonus with no color variant; the group bonus makes corys eat 25% faster', () => {
    expect(def.rewards.variant).toBeUndefined();
    let g = started();
    const before = g.fish.find((f) => f.rescue)!.variant;
    expect(perksOf(g.fish.find((f) => f.rescue)!)).toEqual({});
    expect(coryEatCooldownMs(g.fish.filter((f) => f.speciesId === 'cory'))).toBe(CORY_EAT_COOLDOWN_MS);
    for (let i = 0; i < 4; i++) g = forceAdvance(g, `d${i}`, T0).state;
    const prof = g.fish.find((f) => f.rescue?.caseId === 'professor_whiskers')!;
    expect(prof.variant).toBe(before);
    expect(perksOf(prof)).toEqual({ glasses: true, groupEatBonus: 0.25, tips: true });
    const corys = [prof, makeFish({ speciesId: 'cory' })];
    expect(coryEatCooldownMs(corys)).toBeCloseTo(CORY_EAT_COOLDOWN_MS / 1.25);
    expect(coryEatCooldownMs([corys[1]!])).toBe(CORY_EAT_COOLDOWN_MS);
  });

  it('has 20 distinct short tips', () => {
    expect(TIPS).toHaveLength(20);
    expect(new Set(TIPS).size).toBe(20);
    expect(TIPS.every((t) => t.length < 80)).toBe(true);
    expect(pickTip(0)).toBe(TIPS[0]);
    expect(pickTip(0.999)).toBe(TIPS[19]);
  });
});
