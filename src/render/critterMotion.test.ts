import { describe, expect, it } from 'vitest';
import { HATCHET_HOP_HEIGHT, HATCHET_HOP_MS, KUHLI_BURROW_STAY_MS, SAND_Y, SURFACE_ZONE_FRACTION } from '../game/constants';
import { makeFish, seededRng } from '../game/testUtils';
import type { SpeciesId } from '../game/types';
import { createActor, swimBounds, updateActor } from './behavior';
import { createCritter, critterPose, drainFx, hopHeight, stepCritter, triggerFlick } from './critterMotion';

const DT = 1 / 60;

/** Runs one actor for `seconds`, calling `each` after every frame. */
function simulate(speciesId: SpeciesId, seconds: number, each: (actor: ReturnType<typeof createActor>, now: number) => void, seed = 1) {
  const fish = makeFish({ speciesId, stage: 'adult' });
  const actor = createActor(fish, seededRng(seed), 0);
  const rng = seededRng(seed + 100);
  let now = 0;
  for (let i = 0; i < seconds / DT; i++) {
    now += DT * 1000;
    updateActor(actor, { fish, now, dt: DT, rng, food: [], schoolmates: [] });
    each(actor, now);
  }
  return actor;
}

describe('zones', () => {
  it('hatchetfish never leave the top of the water', () => {
    const b = swimBounds('hatchetfish');
    expect(b.maxY - b.minY).toBeLessThanOrEqual((SAND_Y - b.minY) * SURFACE_ZONE_FRACTION + 1);
    simulate('hatchetfish', 120, (a) => {
      expect(a.y).toBeGreaterThanOrEqual(b.minY);
      expect(a.y).toBeLessThanOrEqual(b.maxY);
    });
  });

  it.each(['cory', 'kuhli_loach', 'crab', 'cherry_shrimp'] as const)('%s stay on the sand band', (id) => {
    const b = swimBounds(id);
    // The near plane stands a little below the sand line (perspective), the far one above it.
    expect(b.maxY).toBeLessThan(SAND_Y + 30);
    expect(b.minY).toBeGreaterThan(SAND_Y - 80);
    simulate(id, 120, (a) => {
      expect(a.y).toBeGreaterThanOrEqual(b.minY - 0.001);
      expect(a.y).toBeLessThanOrEqual(b.maxY + 0.001);
    });
  });

  it('a crab never turns around (always front-facing) and still travels', () => {
    let moved = 0;
    let lastX = 0;
    simulate('crab', 60, (a) => {
      expect(a.facing).toBe(1);
      expect(a.turnStart).toBeNull();
      if (lastX) moved += Math.abs(a.x - lastX);
      lastX = a.x;
    });
    expect(moved).toBeGreaterThan(40);
  });
});

describe('critter modes', () => {
  it('cory alternate bursts, rests and snuffles, with puffs and the occasional wink', () => {
    const c = createCritter('cory', 0, seededRng(5));
    const rng = seededRng(6);
    const modes = new Set<string>();
    let winked = false;
    let puffs = 0;
    for (let t = 0; t < 120_000; t += 16) {
      stepCritter(c, 'cory', t, 0.016, rng, false);
      modes.add(c.mode);
      winked ||= critterPose(c, 'cory', t, 1, t / 1000, 0, false).winking;
      puffs += drainFx(c).filter((k) => k === 'sandPuff').length;
    }
    expect(modes).toEqual(new Set(['move', 'rest', 'snuffle']));
    expect(winked).toBe(true);
    expect(puffs).toBeGreaterThan(3);
  });

  it('kuhli loaches burrow for 20–60s, then rise with a puff', () => {
    let buriedAt = -1;
    let longest = 0;
    let maxBurrow = 0;
    const c = createCritter('kuhli_loach', 0, seededRng(3));
    const rng = seededRng(4);
    let puffs = 0;
    for (let t = 0; t < 600_000; t += 16) {
      stepCritter(c, 'kuhli_loach', t, 0.016, rng, false);
      maxBurrow = Math.max(maxBurrow, c.burrow);
      puffs += drainFx(c).length;
      if (c.mode === 'buried' && buriedAt < 0) buriedAt = t;
      if (c.mode !== 'buried' && buriedAt >= 0) {
        longest = Math.max(longest, t - buriedAt);
        buriedAt = -1;
      }
    }
    expect(maxBurrow).toBe(1);
    expect(longest).toBeGreaterThanOrEqual(KUHLI_BURROW_STAY_MS[0] - 100);
    expect(longest).toBeLessThanOrEqual(KUHLI_BURROW_STAY_MS[1] + 100);
    expect(puffs).toBeGreaterThanOrEqual(2);
  });

  it('a buried kuhli stays put', () => {
    const fish = makeFish({ speciesId: 'kuhli_loach', stage: 'adult' });
    const actor = createActor(fish, seededRng(8), 0);
    actor.crit!.mode = 'buried';
    actor.crit!.modeUntil = 1e9;
    actor.crit!.burrow = 1;
    const { x, y } = actor;
    const rng = seededRng(2);
    for (let i = 1; i < 300; i++) updateActor(actor, { fish, now: i * 16, dt: DT, rng, food: [], schoolmates: [] });
    expect(actor.x).toBeCloseTo(x, 1);
    expect(actor.y).toBeCloseTo(y, 1);
  });

  it('hatchetfish hop every 1–3 minutes, with a splash going out and coming in', () => {
    const c = createCritter('hatchetfish', 0, seededRng(7));
    const rng = seededRng(9);
    const hops: number[] = [];
    let splashes = 0;
    let peak = 0;
    for (let t = 0; t < 20 * 60_000; t += 16) {
      const before = c.hopAt;
      stepCritter(c, 'hatchetfish', t, 0.016, rng, false);
      if (c.hopAt !== before) hops.push(t);
      splashes += drainFx(c).filter((k) => k === 'splash').length;
      peak = Math.max(peak, hopHeight(c, t));
    }
    expect(hops.length).toBeGreaterThan(5);
    for (let i = 1; i < hops.length; i++) {
      expect(hops[i]! - hops[i - 1]!).toBeGreaterThanOrEqual(60_000 - 20);
      expect(hops[i]! - hops[i - 1]!).toBeLessThanOrEqual(180_000 + 20);
    }
    expect(splashes).toBeGreaterThanOrEqual(hops.length * 2 - 1);
    expect(peak).toBeGreaterThan(HATCHET_HOP_HEIGHT * 0.9);
    expect(HATCHET_HOP_MS).toBeGreaterThan(0);
  });

  it('reduced motion: no hops, no flicks', () => {
    const c = createCritter('hatchetfish', 0, seededRng(7));
    const rng = seededRng(9);
    for (let t = 0; t < 10 * 60_000; t += 50) stepCritter(c, 'hatchetfish', t, 0.05, rng, true);
    expect(c.hopAt).toBe(-Infinity);
    const s = createCritter('cherry_shrimp', 0, seededRng(1));
    triggerFlick(s, 0, 1);
    stepCritter(s, 'cherry_shrimp', 10, 0.01, seededRng(1), true);
    expect(s.mode).not.toBe('flick');
  });

  it('a shrimp flick darts backward, then cools down', () => {
    const fish = makeFish({ speciesId: 'cherry_shrimp', stage: 'adult' });
    const actor = createActor(fish, seededRng(8), 0, { x: 500, y: SAND_Y - 20 });
    actor.facing = 1;
    expect(triggerFlick(actor.crit!, 1000, 1)).toBe(true);
    expect(triggerFlick(actor.crit!, 1100, 1)).toBe(false);
    const x0 = actor.x;
    const rng = seededRng(2);
    for (let i = 0; i < 12; i++) updateActor(actor, { fish, now: 1000 + i * 16, dt: DT, rng, food: [], schoolmates: [] });
    expect(actor.x).toBeLessThan(x0 - 10);
  });

  it('a crab rocks about ±4° while walking and not while still', () => {
    const c = createCritter('crab', 0, seededRng(1));
    let maxRot = 0;
    for (let t = 0; t < 2000; t += 10) maxRot = Math.max(maxRot, Math.abs(critterPose(c, 'crab', t, 1, t / 1000, 1, false).rot));
    expect(maxRot).toBeGreaterThan(0.06);
    expect(maxRot).toBeLessThan(0.08);
    expect(critterPose(c, 'crab', 123, 1, 0.123, 0, false).rot).toBeCloseTo(0);
  });
});

describe('climbing decor', () => {
  it.each(['crab', 'cherry_shrimp'] as const)('%s climb onto a low rock, sit on top of it, then climb down', (id) => {
    const fish = makeFish({ speciesId: id, stage: 'adult' });
    const perch = { id: 'rock1', x: 500, y: SAND_Y - 40, halfW: 40, z: 0.5 };
    const actor = createActor(fish, seededRng(3), 0, { x: 480, y: SAND_Y - 10 });
    actor.crit!.nextPerchAt = 0;
    const rng = seededRng(11);
    let onTop = 0;
    let wasPerched = false;
    let released = false;
    for (let i = 1; i < 60 * 60; i++) {
      const now = i * 16;
      updateActor(actor, { fish, now, dt: 0.016, rng, food: [], schoolmates: [], perches: [perch] });
      if (actor.crit!.perchId) {
        wasPerched = true;
        if (actor.y < perch.y && Math.abs(actor.x - perch.x) <= perch.halfW + 6) onTop++;
      } else if (wasPerched) {
        released = true;
      }
    }
    expect(wasPerched).toBe(true);
    expect(onTop).toBeGreaterThan(60);
    expect(released).toBe(true);
  });

  it('no climbing with reduced motion', () => {
    const fish = makeFish({ speciesId: 'crab', stage: 'adult' });
    const perch = { id: 'rock1', x: 500, y: SAND_Y - 40, halfW: 40, z: 0.5 };
    const actor = createActor(fish, seededRng(3), 0, { x: 480, y: SAND_Y - 10 });
    actor.crit!.nextPerchAt = 0;
    const rng = seededRng(11);
    for (let i = 1; i < 60 * 30; i++) updateActor(actor, { fish, now: i * 16, dt: 0.016, rng, food: [], schoolmates: [], perches: [perch], reduced: true });
    expect(actor.crit!.perchId).toBeNull();
  });
});
