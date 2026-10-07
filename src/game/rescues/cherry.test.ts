import { describe, expect, it } from 'vitest';
import { applyGameEvent } from '../events';
import { createInitialState, tick } from '../sim';
import { randomVariantKey } from '../species';
import { constRng, makeFish, T0 } from '../testUtils';
import type { GameState } from '../types';
import { activeCase, forceAdvance, stageVisual, takeRescue, taskValue } from './engine';
import { getRescue, RESCUES } from './registry';

const def = getRescue('cherry')!;

function started(): GameState {
  const r = takeRescue(createInitialState(T0, constRng(0.5)), 'cherry', T0, constRng(0.5));
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}
const ev = (g: GameState, e: Parameters<typeof applyGameEvent>[1]) => applyGameEvent(g, e, T0, constRng(0.5)).state;
const progress = (g: GameState, i: number) => {
  const a = activeCase(g)!;
  return taskValue(g, a.def, a.c, i);
};
const toStage = (g: GameState, n: number) => {
  for (let i = 0; i < n; i++) g = forceAdvance(g, `d${i}`, T0).state;
  return g;
};
const grey = (g: GameState) => stageVisual(g, g.rescue.cases.cherry!.fishId!)!.desaturate!;

describe('Cherry', () => {
  it('appears on the Rescue Board automatically', () => {
    expect(RESCUES.map((r) => r.id)).toContain('cherry');
    expect(def.speciesId).toBe('cherry_shrimp');
  });

  it('color returns smoothly with partial progress, not just per stage', () => {
    let g = started();
    const g0 = grey(g);
    expect(g0).toBeCloseTo(0.95);
    g = ev(g, { type: 'play', seconds: 60 });
    const g1 = grey(g);
    expect(g1).toBeLessThan(g0);
    g = ev(g, { type: 'play', seconds: 60 });
    expect(grey(g)).toBeLessThan(g1);
    g = toStage(g, 3);
    expect(grey(g)).toBeLessThan(0.35);
  });

  it('no-overfeeding counts quiet play and restarts when a pellet dissolves', () => {
    let g = toStage(started(), 1);
    g = ev(g, { type: 'play', seconds: 200 });
    expect(progress(g, 0)).toBe(200);
    g = ev(g, { type: 'pelletDissolved' });
    expect(progress(g, 0)).toBe(0);
    g = ev(g, { type: 'play', seconds: 5000 });
    expect(progress(g, 0)).toBe(300);
  });

  it('a real dissolved pellet breaks the streak but a cory eating it does not', () => {
    const land = (g: GameState, withCory: boolean) => {
      const fish = [...g.fish, ...(withCory ? [makeFish({ speciesId: 'cory', tankId: g.activeTankId })] : [])];
      const tank = { ...g.tanks[0]!, pellets: [{ id: 'p', x: 300, y: 5000, vy: 0, premium: false, landedAt: T0 }] };
      return { ...g, fish, tanks: [tank, ...g.tanks.slice(1)] };
    };
    const run = (g: GameState) => {
      const types: string[] = [];
      for (let i = 0; i < 80; i++) {
        const r = tick(g, 1000, constRng(0.5));
        types.push(...r.events.map((e) => e.type));
        g = r.state;
      }
      return types;
    };
    expect(run(land(started(), false))).toContain('pelletDissolved');
    expect(run(land(started(), true))).not.toContain('pelletDissolved');
  });

  it('colony: 3 baby cherry shrimp eggs hatch over the next hour on completion', () => {
    let g = started();
    expect(g.eggs).toHaveLength(0);
    g = toStage(g, 4);
    const eggs = g.eggs.filter((e) => e.id.startsWith('colony-cherry'));
    expect(eggs).toHaveLength(3);
    expect(eggs.every((e) => e.speciesId === 'cherry_shrimp' && !e.shiny)).toBe(true);
    expect(Math.max(...eggs.map((e) => e.hatchAt)) - T0).toBe(60 * 60_000);
    // They hatch via the normal sim (half-slot rule, Nursery when full).
    let h = g;
    for (let i = 0; i < 61 * 60; i++) h = tick(h, 1000, constRng(0.5)).state;
    expect(h.fish.filter((f) => f.speciesId === 'cherry_shrimp' && !f.rescue).length + h.nursery.length).toBe(3);
  });

  it('rewards the Ruby variant (never random)', () => {
    for (let i = 0; i < 30; i++) expect(randomVariantKey('cherry_shrimp', () => i / 30)).not.toBe('ruby');
    const g = toStage(started(), 4);
    expect(g.fish.find((f) => f.rescue?.caseId === 'cherry')!.variant).toBe('ruby');
  });
});
