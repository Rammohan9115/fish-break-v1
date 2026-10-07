import { describe, expect, it } from 'vitest';
import { createCritter, hopHeight, stepCritter } from '../../render/critterMotion';
import { ENCOURAGE_ACTION, ENCOURAGE_WINDOW_MS, FIRST_LEAP_ACTION } from '../constants';
import { applyGameEvent } from '../events';
import { createInitialState } from '../sim';
import { randomVariantKey } from '../species';
import { constRng, T0 } from '../testUtils';
import type { GameState } from '../types';
import { addEncourageTap, clampToZone, isAboveTap, isLeapTap, leapRingAt } from './courage';
import { activeCase, forceAdvance, perksOf, takeRescue, taskValue, wantsAction } from './engine';
import { getRescue, RESCUES } from './registry';

const def = getRescue('skipper')!;
function started(): GameState {
  const r = takeRescue(createInitialState(T0, constRng(0.5)), 'skipper', T0, constRng(0.5));
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}
const ev = (g: GameState, e: Parameters<typeof applyGameEvent>[1]) => applyGameEvent(g, e, T0, constRng(0.5)).state;
const toStage = (g: GameState, n: number) => {
  for (let i = 0; i < n; i++) g = forceAdvance(g, `d${i}`, T0).state;
  return g;
};

describe('Skipper', () => {
  it('appears on the Rescue Board automatically', () => {
    expect(RESCUES.map((r) => r.id)).toContain('skipper');
    expect(def.speciesId).toBe('hatchetfish');
  });

  it('three taps inside 5 s make one encouragement; slow taps do not', () => {
    let r = addEncourageTap([], 0);
    r = addEncourageTap(r.taps, 1000);
    expect(r.fired).toBe(false);
    r = addEncourageTap(r.taps, 2000);
    expect(r).toEqual({ taps: [], fired: true });
    let s = addEncourageTap([], 0);
    s = addEncourageTap(s.taps, 3000);
    s = addEncourageTap(s.taps, ENCOURAGE_WINDOW_MS + 1000);
    expect(s.fired).toBe(false);
    expect(s.taps).toHaveLength(2);
  });

  it('only taps above him (not on him or below) count', () => {
    const fish = { x: 300, y: 200 };
    expect(isAboveTap(fish, { x: 310, y: 120 })).toBe(true);
    expect(isAboveTap(fish, { x: 300, y: 200 })).toBe(false);
    expect(isAboveTap(fish, { x: 300, y: 260 })).toBe(false);
    expect(isAboveTap(fish, { x: 500, y: 120 })).toBe(false);
  });

  it('counts encouragements only in the stages that ask for them', () => {
    let g = started();
    g = ev(g, { type: 'interact', actionId: ENCOURAGE_ACTION });
    expect(g.rescue.cases.skipper!.progress.every((n) => !n)).toBe(true);
    expect(wantsAction(g, ENCOURAGE_ACTION)).toBe(false);
    g = toStage(g, 1);
    expect(wantsAction(g, ENCOURAGE_ACTION)).toBe(true);
    for (let i = 0; i < 3; i++) g = ev(g, { type: 'interact', actionId: ENCOURAGE_ACTION });
    expect(g.rescue.cases.skipper!.stage).toBe(2);
    g = toStage(g, 0);
    expect(wantsAction(forceAdvance(g, 'x', T0).state, FIRST_LEAP_ACTION)).toBe(true);
  });

  it('stage 3 needs 4 encouragements and a clean tank', () => {
    let g = toStage(started(), 2);
    for (let i = 0; i < 4; i++) g = ev(g, { type: 'interact', actionId: ENCOURAGE_ACTION });
    const a = activeCase(g)!;
    expect(taskValue(g, a.def, a.c, 0)).toBe(4);
    expect(a.c.stage).toBe(2);
  });

  it('zone limits rise stage by stage and the last stage is free', () => {
    const zones = def.stages.map((s) => s.visual.zone);
    expect(zones[3]).toBeUndefined();
    const lows = zones.slice(0, 3).map((z) => z!.bottom);
    expect(lows[0]!).toBeGreaterThan(lows[1]!);
    expect(lows[1]!).toBeGreaterThan(lows[2]!);
    for (const [i, s] of def.stages.slice(0, 3).entries()) {
      for (const y of [0, 100, 300, 600]) {
        const c = clampToZone(y, s.visual, 40, 440);
        expect(c).toBeGreaterThanOrEqual(40 + 400 * zones[i]!.top - 1e-9);
        expect(c).toBeLessThanOrEqual(40 + 400 * zones[i]!.bottom + 1e-9);
      }
    }
    expect(clampToZone(500, def.stages[3]!.visual, 40, 440)).toBe(500);
  });

  it('hops: none while low, tiny practice hops, full hops at the end', () => {
    expect(def.stages.map((s) => s.visual.hops)).toEqual(['none', 'none', 'practice', 'full']);
    const c = createCritter('hatchetfish', 0, constRng(0.5));
    c.hopOn = false;
    c.nextHopAt = 0;
    stepCritter(c, 'hatchetfish', 5000, 0.016, constRng(0.5), false);
    expect(c.landed).toBe(true);
    c.hopOn = true;
    c.hopScale = 0.35;
    c.nextHopAt = 0;
    stepCritter(c, 'hatchetfish', 6000, 0.016, constRng(0.5), false);
    expect(c.landed).toBe(false);
    const small = hopHeight(c, 6450);
    c.hopScale = 1;
    expect(hopHeight(c, 6450)).toBeCloseTo(small / 0.35);
  });

  it('the leap ring sits above the water and takes taps near it', () => {
    const ring = leapRingAt({ x: 300, y: 120 }, 60);
    expect(ring.y).toBeLessThan(60);
    expect(isLeapTap(ring, { x: ring.x + 10, y: ring.y })).toBe(true);
    expect(isLeapTap(ring, { x: ring.x + 200, y: ring.y })).toBe(false);
    expect(def.stages[3]!.visual.leap).toBe(true);
  });

  it('rewards Sky Silver (never random), the signature trick now, and 2x hops', () => {
    for (let i = 0; i < 30; i++) expect(randomVariantKey('hatchetfish', () => i / 30)).not.toBe('sky_silver');
    const g = toStage(started(), 4);
    const f = g.fish.find((x) => x.rescue?.caseId === 'skipper')!;
    expect(f.variant).toBe('sky_silver');
    expect(perksOf(f)).toEqual({ tricks: ['signature'], hopRate: 2 });
  });
});
