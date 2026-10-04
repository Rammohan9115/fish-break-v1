import { describe, expect, it } from 'vitest';
import { EAT_RADIUS_PX, MAX_PITCH, SAND_Y, SWIM_SIDE_MARGIN, TANK_WIDTH, TURN_MS } from '../game/constants';
import { SPECIES } from '../game/species';
import { makeFish, seededRng } from '../game/testUtils';
import type { Fish } from '../game/types';
import { createActor, edgeAvoidance, heartPoint, maxSpeedFor, swimBounds, updateActor, type FishActor, type FoodTarget } from './behavior';

const DT = 1 / 60;

/** Runs `seconds` of simulated frames for one actor. Returns pellet ids eaten. */
function run(actor: FishActor, fish: Fish, seconds: number, opts: { food?: FoodTarget[]; mates?: FishActor[]; seed?: number } = {}) {
  const rng = seededRng(opts.seed ?? 1);
  const eaten: string[] = [];
  let food = opts.food ?? [];
  let now = 0;
  for (let i = 0; i < seconds / DT; i++) {
    now += DT * 1000;
    const id = updateActor(actor, { fish, now, dt: DT, rng, food, schoolmates: opts.mates ?? [] });
    if (id) {
      eaten.push(id);
      food = food.filter((f) => f.id !== id);
    }
  }
  return eaten;
}

describe('fish behavior', () => {
  it('stays inside its swim bounds while wandering', () => {
    const fish = makeFish({ speciesId: 'danio', stage: 'adult' });
    const actor = createActor(fish, seededRng(2), 0);
    const b = swimBounds('danio');
    const rng = seededRng(3);
    let now = 0;
    for (let i = 0; i < 60 * 60; i++) {
      now += DT * 1000;
      updateActor(actor, { fish, now, dt: DT, rng, food: [], schoolmates: [] });
      expect(actor.x).toBeGreaterThanOrEqual(b.minX);
      expect(actor.x).toBeLessThanOrEqual(b.maxX);
      expect(actor.y).toBeGreaterThanOrEqual(b.minY);
      expect(actor.y).toBeLessThanOrEqual(b.maxY);
    }
  });

  it('actually moves around (not stuck)', () => {
    const fish = makeFish({ stage: 'adult' });
    const actor = createActor(fish, seededRng(4), 0, { x: 500, y: 300 });
    run(actor, fish, 10);
    expect(Math.hypot(actor.x - 500, actor.y - 300)).toBeGreaterThan(20);
  });

  it('faces its direction of travel', () => {
    const fish = makeFish({ stage: 'adult', hunger: 50 });
    const actor = createActor(fish, seededRng(5), 0, { x: 200, y: 300 });
    actor.facing = -1;
    actor.heading = Math.PI;
    run(actor, fish, 3, { food: [{ id: 'far-right', x: 900, y: 300 }] });
    expect(actor.facing).toBe(1);
  });

  it('turns around in TURN_MS, through zero width, slowing down', () => {
    const fish = makeFish({ stage: 'adult', hunger: 50 });
    const actor = createActor(fish, seededRng(5), 0, { x: 500, y: 300 });
    actor.facing = 1;
    actor.turnFrom = 1;
    actor.heading = Math.PI;
    actor.speed = SPECIES[fish.speciesId].speed;
    const rng = seededRng(2);
    const food = [{ id: 'left', x: 100, y: 300 }];
    let now = 0;
    let minWidth = 1;
    let minStep = Infinity;
    const step = () => {
      now += DT * 1000;
      const x0 = actor.x;
      updateActor(actor, { fish, now, dt: DT, rng, food, schoolmates: [] });
      minWidth = Math.min(minWidth, Math.abs(actor.facing));
      minStep = Math.min(minStep, Math.abs(actor.x - x0));
    };
    step();
    expect(actor.turnStart).not.toBeNull();
    const fullStep = actor.speed * DT;
    while (now < TURN_MS + 2 * DT * 1000) step();
    expect(actor.facing).toBe(-1);
    expect(actor.turnStart).toBeNull();
    expect(minWidth).toBeLessThan(0.1);
    expect(minStep).toBeLessThan(fullStep * 0.6);
  });

  it('tilts toward its velocity, smoothly and within ±20°', () => {
    const fish = makeFish({ stage: 'adult', hunger: 50 });
    const actor = createActor(fish, seededRng(8), 0, { x: 500, y: 150 });
    actor.heading = 0;
    const rng = seededRng(3);
    const food = [{ id: 'below', x: 560, y: 520 }];
    updateActor(actor, { fish, now: 16, dt: DT, rng, food, schoolmates: [] });
    expect(Math.abs(actor.tilt)).toBeLessThan(0.1);
    let maxTilt = 0;
    for (let i = 2; i < 60; i++) {
      updateActor(actor, { fish, now: i * 16, dt: DT, rng, food, schoolmates: [] });
      maxTilt = Math.max(maxTilt, actor.tilt);
      expect(Math.abs(actor.tilt)).toBeLessThanOrEqual(MAX_PITCH + 1e-9);
    }
    expect(maxTilt).toBeGreaterThan(0.2);
  });

  it('stretches while speeding up and records bites', () => {
    const fish = makeFish({ stage: 'adult', hunger: 50 });
    const actor = createActor(fish, seededRng(9), 0, { x: 300, y: 300 });
    actor.heading = 0;
    actor.speed = 0;
    run(actor, fish, 0.3, { food: [{ id: 'far', x: 900, y: 300 }] });
    expect(actor.stretch).toBeGreaterThan(0.3);
    const eater = createActor(fish, seededRng(10), 0, { x: 300, y: 300 });
    expect(run(eater, fish, 15, { food: [{ id: 'p1', x: 600, y: 350 }] })).toEqual(['p1']);
    expect(eater.eatAt).toBeGreaterThan(0);
  });

  it('never exceeds its max speed', () => {
    const fish = makeFish({ speciesId: 'goldfish', stage: 'adult', hunger: 100, happiness: 80 });
    const actor = createActor(fish, seededRng(6), 0);
    const rng = seededRng(7);
    let now = 0;
    for (let i = 0; i < 600; i++) {
      now += DT * 1000;
      updateActor(actor, { fish, now, dt: DT, rng, food: [], schoolmates: [] });
      expect(actor.speed).toBeLessThanOrEqual(SPECIES.goldfish.speed + 1e-9);
    }
  });

  it('limits the turn rate (no instant reversals)', () => {
    const fish = makeFish({ stage: 'adult', hunger: 50 });
    const actor = createActor(fish, seededRng(8), 0, { x: 500, y: 300 });
    actor.heading = 0;
    updateActor(actor, { fish, now: 16, dt: DT, rng: seededRng(9), food: [{ id: 'p', x: 100, y: 300 }], schoolmates: [] });
    expect(Math.abs(actor.heading)).toBeLessThan(0.2);
  });

  it('seeks and eats nearby food when hungry', () => {
    const fish = makeFish({ stage: 'adult', hunger: 50 });
    const actor = createActor(fish, seededRng(10), 0, { x: 300, y: 300 });
    const eaten = run(actor, fish, 15, { food: [{ id: 'p1', x: 600, y: 350 }] });
    expect(eaten).toEqual(['p1']);
  });

  it('can reach food resting on the sand', () => {
    const fish = makeFish({ stage: 'adult', hunger: 50 });
    const actor = createActor(fish, seededRng(11), 0, { x: 300, y: 200 });
    const eaten = run(actor, fish, 20, { food: [{ id: 'sand', x: 500, y: SAND_Y - 5 }] });
    expect(eaten).toEqual(['sand']);
  });

  it('full fish (hunger >= 95) ignore food', () => {
    const fish = makeFish({ stage: 'adult', hunger: 96 });
    const actor = createActor(fish, seededRng(12), 0, { x: 300, y: 300 });
    const eaten = run(actor, fish, 10, { food: [{ id: 'p1', x: 305, y: 300 }] });
    expect(eaten).toEqual([]);
  });

  it('eats within the 8px radius of the mouth', () => {
    const fish = makeFish({ stage: 'adult', hunger: 50 });
    const actor = createActor(fish, seededRng(13), 0, { x: 300, y: 300 });
    expect(EAT_RADIUS_PX).toBe(8);
    const id = updateActor(actor, { fish, now: 16, dt: DT, rng: seededRng(1), food: [{ id: 'here', x: 300, y: 300 }], schoolmates: [] });
    expect(id).toBe('here');
  });

  it('axolotls stay near the bottom', () => {
    const fish = makeFish({ speciesId: 'axolotl', stage: 'adult' });
    const actor = createActor(fish, seededRng(14), 0);
    const b = swimBounds('axolotl');
    expect(b.minY).toBeGreaterThan(SAND_Y - 100);
    run(actor, fish, 30);
    expect(actor.y).toBeGreaterThanOrEqual(b.minY);
    expect(actor.y).toBeLessThan(SAND_Y);
  });

  it('tetras drift toward their school', () => {
    const fish = makeFish({ speciesId: 'tetra', stage: 'adult' });
    const actor = createActor(fish, seededRng(15), 0, { x: 400, y: 300 });
    const mates = [0, 1, 2].map((i) => {
      const m = createActor(makeFish({ speciesId: 'tetra' }), seededRng(20 + i), 0, { x: 520 + i * 10, y: 300 });
      return m;
    });
    // Average over several seeds: schooling should bias toward the group.
    let closer = 0;
    for (let seed = 0; seed < 10; seed++) {
      const a = { ...actor };
      run(a, fish, 2, { mates: [a, ...mates.map((m) => ({ ...m }))], seed });
      if (Math.abs(a.x - 530) < Math.abs(400 - 530)) closer += 1;
    }
    expect(closer).toBeGreaterThanOrEqual(7);
  });

  it('pushes inward near edges', () => {
    const b = swimBounds('danio');
    expect(edgeAvoidance(b.minX + 1, 300, b).x).toBeGreaterThan(0.9);
    expect(edgeAvoidance(b.maxX - 1, 300, b).x).toBeLessThan(-0.9);
    expect(edgeAvoidance(TANK_WIDTH / 2, 300, b)).toEqual({ x: 0, y: 0 });
    expect(b.minX).toBe(SWIM_SIDE_MARGIN);
  });

  it('sad fish swim slower; babies are slower; food makes them faster', () => {
    const happy = makeFish({ stage: 'adult', happiness: 80 });
    const sad = makeFish({ stage: 'adult', happiness: 10 });
    const baby = makeFish({ stage: 'baby', happiness: 80 });
    const actor = createActor(happy, seededRng(16), 0);
    actor.dartUntil = -1;
    expect(maxSpeedFor(sad, actor, 0, false)).toBeLessThan(maxSpeedFor(happy, actor, 0, false));
    expect(maxSpeedFor(baby, actor, 0, false)).toBeLessThan(maxSpeedFor(happy, actor, 0, false));
    expect(maxSpeedFor(happy, actor, 0, true)).toBeGreaterThan(maxSpeedFor(happy, actor, 0, false));
  });

  it('shows sad and hungry indicators only when warranted', () => {
    const content = makeFish({ stage: 'adult', hunger: 80, happiness: 80 });
    const a1 = createActor(content, seededRng(17), 0);
    run(a1, content, 30);
    expect(a1.indicator).toBeNull();

    const hungry = makeFish({ stage: 'adult', hunger: 5, happiness: 50 });
    const a2 = createActor(hungry, seededRng(18), 0);
    const seen = new Set<string>();
    const rng = seededRng(19);
    let now = 0;
    for (let i = 0; i < 60 * 30; i++) {
      now += DT * 1000;
      updateActor(a2, { fish: hungry, now, dt: DT, rng, food: [], schoolmates: [] });
      if (a2.indicator) seen.add(a2.indicator.kind);
    }
    expect([...seen]).toEqual(['hungry']);
  });

  it('blinks periodically', () => {
    const fish = makeFish({ stage: 'adult' });
    const actor = createActor(fish, seededRng(20), 0);
    run(actor, fish, 8);
    expect(actor.blinkUntil).toBeGreaterThan(0);
  });
});

describe('sad look', () => {
  it('gloom eases in while a fish is sad and back out when it cheers up', () => {
    const rng = seededRng(3);
    const happy = makeFish({ stage: 'adult', happiness: 80, hunger: 80 });
    const actor = createActor(happy, rng, 0);
    expect(actor.gloom).toBe(0);
    const sad = { ...happy, happiness: 10 };
    let now = 0;
    for (let i = 0; i < 30; i++) updateActor(actor, { fish: sad, now: (now += 16.7), dt: 1 / 60, rng, food: [], schoolmates: [] });
    expect(actor.gloom).toBeGreaterThan(0);
    expect(actor.gloom).toBeLessThan(0.6);
    for (let i = 0; i < 600; i++) updateActor(actor, { fish: sad, now: (now += 16.7), dt: 1 / 60, rng, food: [], schoolmates: [] });
    expect(actor.gloom).toBeGreaterThan(0.95);
    for (let i = 0; i < 600; i++) updateActor(actor, { fish: happy, now: (now += 16.7), dt: 1 / 60, rng, food: [], schoolmates: [] });
    expect(actor.gloom).toBeLessThan(0.05);
  });

  it('sad fish pick wander targets in the lower part of the water', () => {
    const rng = seededRng(9);
    const sad = makeFish({ stage: 'adult', happiness: 5, hunger: 80 });
    const b = swimBounds(sad.speciesId);
    const floor = b.minY + (b.maxY - b.minY) * 0.4;
    let now = 0;
    const actor = createActor(sad, rng, now);
    for (let i = 0; i < 40; i++) {
      actor.nextWanderAt = 0;
      updateActor(actor, { fish: sad, now: (now += 16.7), dt: 1 / 60, rng, food: [], schoolmates: [] });
      expect(actor.targetY).toBeGreaterThanOrEqual(floor);
    }
  });
});

describe('courtship heart loop', () => {
  it('fits its box, is left/right symmetric, and passes through the bottom point', () => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let u = 0; u < Math.PI * 2; u += 0.01) {
      const p = heartPoint(u, 120, 100);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      const mirror = heartPoint(-u, 120, 100);
      expect(mirror.x).toBeCloseTo(-p.x);
      expect(mirror.y).toBeCloseTo(p.y);
    }
    expect(maxX).toBeCloseTo(60, 0);
    expect(minX).toBeCloseTo(-60, 0);
    expect(maxY - minY).toBeLessThanOrEqual(101);
    // u = π is the heart's point (bottom, center).
    expect(heartPoint(Math.PI, 120, 100).x).toBeCloseTo(0);
    expect(heartPoint(Math.PI, 120, 100).y).toBeCloseTo(maxY);
  });

  it('a courting fish heads for its loop point even when food is around', () => {
    const rng = seededRng(5);
    const fish = makeFish({ stage: 'adult', growth: 1200, hunger: 10, happiness: 90 });
    const actor = createActor(fish, rng, 0, { x: 300, y: 300 });
    actor.heading = 0;
    const food: FoodTarget[] = [{ id: 'p', x: 100, y: 300 }];
    let now = 0;
    for (let i = 0; i < 120; i++) updateActor(actor, { fish, now: (now += 16.7), dt: 1 / 60, rng, food, schoolmates: [], courtship: { x: 500, y: 300 } });
    expect(actor.x).toBeGreaterThan(300);
  });
});
