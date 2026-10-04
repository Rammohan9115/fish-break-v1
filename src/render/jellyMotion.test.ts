import { describe, expect, it } from 'vitest';
import { JELLY_CONTRACT_MS, JELLY_CONTRACT_SX, JELLY_CONTRACT_SY, JELLY_EXPAND_MS, SAND_Y } from '../game/constants';
import { makeFish, seededRng } from '../game/testUtils';
import type { Fish } from '../game/types';
import { createActor, jellyAvoidance, jellyFloorY, jellyHappy, jellyTentacles, swimBounds, updateActor, type FishActor, type FoodTarget } from './behavior';
import {
  bellPulse,
  bellSplitY,
  inBox,
  jellySize,
  tentacleBox,
  tentacleEnvelope,
  tentacleOffset,
  tentacleShape,
  tentacleWidth,
  type Box,
  type BellPulse,
} from './jellyMotion';
import { hueRotatePixels } from './sprites';

const out = (): BellPulse => ({ sx: 1, sy: 1, squeeze: 0 });
const box = (): Box => ({ x0: 0, x1: 0, y0: 0, y1: 0 });
const DT = 1 / 60;

describe('bell pulse', () => {
  it('rests at scale 1 before and long after a pulse', () => {
    expect(bellPulse(-1, 1, 1, out())).toMatchObject({ sx: 1, sy: 1 });
    expect(bellPulse(Infinity, 1, 1, out())).toMatchObject({ sx: 1, sy: 1 });
  });

  it('contracts to 0.85 × 1.1 at the end of the contraction', () => {
    const p = bellPulse(JELLY_CONTRACT_MS - 0.001, 1, 1, out());
    expect(p.sx).toBeCloseTo(JELLY_CONTRACT_SX, 3);
    expect(p.sy).toBeCloseTo(JELLY_CONTRACT_SY, 3);
    expect(p.squeeze).toBeCloseTo(1, 3);
  });

  it('expands back with a slight overshoot, then settles', () => {
    let maxSx = 0;
    for (let ms = JELLY_CONTRACT_MS; ms < JELLY_CONTRACT_MS + JELLY_EXPAND_MS; ms += 5) maxSx = Math.max(maxSx, bellPulse(ms, 1, 1, out()).sx);
    expect(maxSx).toBeGreaterThan(1);
    expect(maxSx).toBeLessThan(1.03);
    expect(bellPulse(JELLY_CONTRACT_MS + JELLY_EXPAND_MS, 1, 1, out()).sx).toBe(1);
  });

  it('pulses smaller with less strength and faster with a shorter tempo', () => {
    const full = bellPulse(JELLY_CONTRACT_MS * 0.99, 1, 1, out()).sx;
    const small = bellPulse(JELLY_CONTRACT_MS * 0.99, 0.5, 1, out()).sx;
    expect(1 - small).toBeCloseTo((1 - full) / 2, 3);
    // Half tempo: fully contracted at half the time, and done after half the cycle.
    expect(bellPulse(JELLY_CONTRACT_MS * 0.5 - 0.001, 1, 0.5, out()).sx).toBeCloseTo(JELLY_CONTRACT_SX, 3);
    expect(bellPulse((JELLY_CONTRACT_MS + JELLY_EXPAND_MS) * 0.5, 1, 0.5, out()).sx).toBe(1);
  });
});

describe('tentacles', () => {
  const state = { phase: 1.3, sway: 1, sincePulse: 200, ripple: 1, lean: 0 };

  it('stay attached at the bell and sway most at the tips', () => {
    expect(tentacleEnvelope(0)).toBe(0);
    expect(tentacleEnvelope(1)).toBe(1);
    expect(tentacleOffset(0, 0, state)).toBe(0);
    let tip = 0;
    let top = 0;
    for (let p = 0; p < 6.3; p += 0.1) {
      top = Math.max(top, Math.abs(tentacleOffset(1, 0.1, { ...state, phase: p })));
      tip = Math.max(tip, Math.abs(tentacleOffset(17, 0.97, { ...state, phase: p })));
    }
    expect(tip).toBeGreaterThan(top * 4);
  });

  it('lean with the current, strongest at the tips', () => {
    const still = { ...state, sway: 0, ripple: 0, lean: 0.1 };
    expect(tentacleOffset(0, 0, still)).toBe(0);
    expect(tentacleOffset(9, 0.5, still)).toBeGreaterThan(0);
    expect(tentacleOffset(17, 1, still)).toBeCloseTo(0.1);
  });

  it('stretch and narrow when rising, relax and spread when drifting down', () => {
    const up = tentacleShape(1, { sy: 0, tipSx: 0 });
    expect(up.sy).toBeCloseTo(1.08);
    expect(up.tipSx).toBeLessThan(1);
    const down = tentacleShape(-1, { sy: 0, tipSx: 0 });
    expect(down.sy).toBeLessThan(1);
    expect(down.tipSx).toBeGreaterThan(1);
  });

  it('match the bell width at the top so they stay attached through the squash', () => {
    expect(tentacleWidth(0, 0.85, 1.08)).toBe(0.85);
    expect(tentacleWidth(1, 0.85, 1.08)).toBe(1.08);
  });
});

describe('tentacle hitbox', () => {
  it('covers the area below the bell split, not the bell', () => {
    const b = tentacleBox(500, 300, 60, 80, 0.4, box());
    expect(b.y0).toBeCloseTo(300 - 40 + 32);
    expect(b.y1).toBe(340);
    expect(inBox(500, 320, b)).toBe(true);
    expect(inBox(500, 270, b)).toBe(false); // in the bell
    expect(inBox(560, 320, b)).toBe(false); // beside it
  });
});

function runJelly(actor: FishActor, fish: Fish, seconds: number, food: FoodTarget[] = [], extra: { current?: number } = {}) {
  const rng = seededRng(5);
  const eaten: string[] = [];
  let left = food;
  let now = 0;
  for (let i = 0; i < seconds / DT; i++) {
    now += DT * 1000;
    const id = updateActor(actor, { fish, now, dt: DT, rng, food: left, schoolmates: [], current: extra.current });
    if (id) {
      eaten.push(id);
      left = left.filter((f) => f.id !== id);
    }
  }
  return { eaten, now };
}

describe('jelly behavior', () => {
  const jelly = (o: Partial<Fish> = {}) => makeFish({ speciesId: 'jellyfish', stage: 'adult', hunger: 50, happiness: 80, ...o });

  it('never flips, stays in the upper part of the tank and never touches the sand', () => {
    const fish = jelly();
    const actor = createActor(fish, seededRng(3), 0);
    const b = swimBounds('jellyfish');
    expect(b.maxY).toBeLessThan(SAND_Y * 0.7);
    const rng = seededRng(4);
    let now = 0;
    let maxY = -Infinity;
    for (let i = 0; i < 120 / DT; i++) {
      now += DT * 1000;
      updateActor(actor, { fish, now, dt: DT, rng, food: [], schoolmates: [] });
      expect(actor.facing).toBe(1);
      expect(Math.abs(actor.tilt)).toBeLessThanOrEqual(0.087 + 0.04 + 1e-9);
      expect(actor.y + jellySize('adult').h / 2).toBeLessThan(SAND_Y);
      maxY = Math.max(maxY, actor.y);
    }
    expect(maxY).toBeLessThan(b.maxY + 40);
  });

  it('pulses every 1.5–3s and rises on each contraction', () => {
    const fish = jelly();
    const actor = createActor(fish, seededRng(3), 0);
    const pulses = new Set<number>();
    const rng = seededRng(6);
    let now = 0;
    for (let i = 0; i < 20 / DT; i++) {
      now += DT * 1000;
      updateActor(actor, { fish, now, dt: DT, rng, food: [], schoolmates: [] });
      if (Number.isFinite(actor.jelly!.pulseAt)) pulses.add(actor.jelly!.pulseAt);
    }
    // Some pulses are skipped while it's above where it wants to be.
    expect(pulses.size).toBeGreaterThanOrEqual(3);
    expect(pulses.size).toBeLessThanOrEqual(14);
  });

  it('drifts with the current', () => {
    const a = createActor(jelly(), seededRng(3), 0, { x: 500, y: 250 });
    const b = createActor(jelly(), seededRng(3), 0, { x: 500, y: 250 });
    runJelly(a, jelly(), 4, [], { current: 1 });
    runJelly(b, jelly(), 4, [], { current: -1 });
    expect(a.x).toBeGreaterThan(b.x + 20);
  });

  it('catches a pellet that touches its tentacles (not one beside it)', () => {
    const fish = jelly();
    const actor = createActor(fish, seededRng(3), 0, { x: 500, y: 250 });
    const t = jellyTentacles(actor, fish, box());
    const inside: FoodTarget = { id: 'in', x: 500, y: (t.y0 + t.y1) / 2 };
    const beside: FoodTarget = { id: 'out', x: 900, y: 250 };
    const id = updateActor(actor, { fish, now: 16, dt: DT, rng: seededRng(1), food: [beside, inside], schoolmates: [] });
    expect(id).toBe('in');
    expect(actor.jelly!.caught).not.toBeNull();
  });

  it('does not catch a pellet at its bell', () => {
    const fish = jelly();
    const actor = createActor(fish, seededRng(3), 0, { x: 500, y: 250 });
    const t = jellyTentacles(actor, fish, box());
    const atBell: FoodTarget = { id: 'bell', x: 500, y: t.y0 - 15 };
    expect(updateActor(actor, { fish, now: 16, dt: DT, rng: seededRng(1), food: [atBell], schoolmates: [] })).toBeNull();
  });

  it('ignores food when full', () => {
    const fish = jelly({ hunger: 99 });
    const actor = createActor(fish, seededRng(3), 0, { x: 500, y: 250 });
    const t = jellyTentacles(actor, fish, box());
    expect(updateActor(actor, { fish, now: 16, dt: DT, rng: seededRng(1), food: [{ id: 'p', x: 500, y: t.y1 - 4 }], schoolmates: [] })).toBeNull();
  });

  it('does three quick happy pulses when tapped', () => {
    const fish = jelly();
    const actor = createActor(fish, seededRng(3), 0, { x: 500, y: 250 });
    jellyHappy(actor.jelly!, 0);
    const starts = new Set<number>();
    const rng = seededRng(2);
    let now = 0;
    for (let i = 0; i < 1.2 / DT; i++) {
      now += DT * 1000;
      updateActor(actor, { fish, now, dt: DT, rng, food: [], schoolmates: [] });
      starts.add(actor.jelly!.pulseAt);
    }
    expect(starts.size).toBe(3);
  });

  it('pulses on every dance beat', () => {
    const fish = jelly();
    const actor = createActor(fish, seededRng(3), 0, { x: 500, y: 250 });
    const starts = new Set<number>();
    const rng = seededRng(2);
    let now = 0;
    for (let i = 0; i < 4 / DT; i++) {
      now += DT * 1000;
      updateActor(actor, { fish, now, dt: DT, rng, food: [], schoolmates: [], beat: Math.floor(now / 500), beatTempo: 0.5 });
      starts.add(actor.jelly!.pulseAt);
    }
    expect(starts.size).toBe(8);
  });

  it('keeps a hatchling off the sand', () => {
    const fish = jelly({ stage: 'baby' });
    const actor = createActor(fish, seededRng(3), 0, { x: 500, y: SAND_Y - 10 });
    expect(actor.y).toBeLessThanOrEqual(jellyFloorY('baby'));
  });

  it('uses the configured bell split for the catch area', () => {
    expect(bellSplitY('jellyfish', 'adult')).toBeCloseTo(0.42);
    expect(bellSplitY('jellyfish', 'baby')).toBeCloseTo(0.59);
  });
});

describe('fish avoid jelly tentacles', () => {
  it('pushes a fish out sideways, away from the jelly', () => {
    const zone: Box = { x0: 480, x1: 520, y0: 280, y1: 340 };
    expect(jellyAvoidance(510, 310, [zone]).x).toBeGreaterThan(0);
    expect(jellyAvoidance(490, 310, [zone]).x).toBeLessThan(0);
    expect(jellyAvoidance(700, 310, [zone])).toEqual({ x: 0, y: 0 });
  });
});

describe('hue rotation', () => {
  it('keeps 0° unchanged, skips transparent pixels, and turns red toward blue at 240°', () => {
    const px = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 0]);
    const same = new Uint8ClampedArray(px);
    hueRotatePixels(same, 0);
    expect([...same]).toEqual([...px]);
    hueRotatePixels(px, 240);
    expect(px[2]!).toBeGreaterThan(px[0]!);
    expect([...px.slice(4)]).toEqual([255, 0, 0, 0]);
  });
});
