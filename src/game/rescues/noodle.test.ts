import { describe, expect, it } from 'vitest';
import { burrowAmount } from '../../render/rescueFx';
import { SIT_ACTION } from '../constants';
import { applyGameEvent } from '../events';
import { createInitialState } from '../sim';
import { randomVariantKey } from '../species';
import { constRng, T0 } from '../testUtils';
import type { GameState } from '../types';
import { activeCase, forceAdvance, perksOf, rescueTrust, stageVisual, taskValue, takeRescue } from './engine';
import { getRescue, RESCUES } from './registry';
import { localDateKey } from '../economy';

const today = localDateKey(new Date(T0));
const def = getRescue('noodle')!;

function started(): GameState {
  const r = takeRescue(createInitialState(T0, constRng(0.5)), 'noodle', T0, constRng(0.5));
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}
const ev = (g: GameState, e: Parameters<typeof applyGameEvent>[1]) => applyGameEvent(g, e, T0, constRng(0.5)).state;
const progress = (g: GameState, i: number) => {
  const a = activeCase(g)!;
  return taskValue(g, a.def, a.c, i);
};

describe('Noodle', () => {
  it('appears on the Rescue Board automatically', () => {
    expect(RESCUES.map((r) => r.id)).toContain('noodle');
    expect(def.speciesId).toBe('kuhli_loach');
  });

  it('trust rises with every completed task and is 1 when rescued', () => {
    let g = started();
    expect(rescueTrust(g, def, g.rescue.cases.noodle!)).toBe(0);
    g = ev(g, { type: 'feed', hour: 22 });
    const t1 = rescueTrust(g, def, g.rescue.cases.noodle!);
    expect(t1).toBeCloseTo(1 / 8);
    g = forceAdvance(g, today, T0).state;
    expect(rescueTrust(g, def, g.rescue.cases.noodle!)).toBeCloseTo(2 / 8);
    expect(stageVisual(g, g.rescue.cases.noodle!.fishId!)?.trust).toBeCloseTo(2 / 8);
    for (let i = 0; i < 3; i++) g = forceAdvance(g, `d${i}`, T0).state;
    expect(g.rescue.cases.noodle!.status).toBe('done');
    expect(rescueTrust(g, def, g.rescue.cases.noodle!)).toBe(1);
  });

  it('counts night feeding only after dark', () => {
    let g = started();
    g = ev(g, { type: 'feed', hour: 13 });
    expect(progress(g, 1)).toBe(0);
    g = ev(g, { type: 'feed', hour: 20 });
    expect(progress(g, 1)).toBe(1);
    expect(started().rescue.cases.noodle!.stage).toBe(0);
    const early = ev(started(), { type: 'feed', hour: 5 });
    expect(progress(early, 1)).toBe(1);
  });

  it('counts the sit-with-him hold in stage 3 only', () => {
    let g = started();
    g = ev(g, { type: 'interact', actionId: SIT_ACTION });
    expect(g.rescue.cases.noodle!.progress.every((n) => !n)).toBe(true);
    for (let i = 0; i < 2; i++) g = forceAdvance(g, `d${i}`, T0).state;
    g = ev(g, { type: 'interact', actionId: SIT_ACTION });
    expect(progress(g, 0)).toBe(1);
  });

  it('keeps him burrowed more at stage 1 than 2, and trust lengthens the peeks', () => {
    const eyes = def.stages[0]!.visual;
    const neck = def.stages[1]!.visual;
    expect(eyes.burrow!).toBeGreaterThan(neck.burrow!);
    expect(def.stages[3]!.visual.burrow).toBeUndefined();
    const sample = (trust: number) => {
      let peeking = 0;
      for (let t = 0; t < 200; t += 0.1) if (burrowAmount({ ...neck, trust }, t) < neck.burrow! - 0.15) peeking++;
      return peeking;
    };
    expect(sample(1)).toBeGreaterThan(sample(0));
    for (let t = 0; t < 60; t += 0.5) {
      const b = burrowAmount({ ...eyes, trust: 0.5 }, t);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('rewards the Shadow Stripe variant (never random) and the greeting perk', () => {
    for (let i = 0; i < 20; i++) expect(randomVariantKey('kuhli_loach', () => i / 20)).not.toBe('shadow_stripe');
    let g = started();
    expect(perksOf(g.fish.find((f) => f.rescue)!)).toEqual({});
    for (let i = 0; i < 4; i++) g = forceAdvance(g, `d${i}`, T0).state;
    const f = g.fish.find((x) => x.rescue?.caseId === 'noodle')!;
    expect(f.variant).toBe('shadow_stripe');
    expect(perksOf(f).greets).toBe(true);
  });
});
