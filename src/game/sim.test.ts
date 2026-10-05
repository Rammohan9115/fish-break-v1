import { describe, expect, it } from 'vitest';
import {
  ALGAE_FLOOR_CLEANLINESS,
  ALGAE_MIN_SIZE,
  ALGAE_WIPE_CLEANLINESS,
  AUTO_COLLECT_FRACTION_ONLINE,
  HOUR_MS,
  MAX_ALGAE_SPOTS,
  MAX_DROPS_PER_TANK,
  MINUTE_MS,
  NURSERY_MAX,
  OFFLINE_CAP_MS,
  SAND_Y,
  SAVE_VERSION,
  SECOND_MS,
  TANK_WIDTH,
  XP,
} from './constants';
import {
  wipeAlgae,
  algaeNeeded,
  algaeTouchedBySponge,
  cleanlinessDecayPerMin,
  createInitialState,
  driftHappiness,
  eatPellet,
  growthMultiplier,
  happinessTarget,
  simulateOffline,
  stageForGrowth,
  stageProgress,
  thresholdsCrossed,
  tick,
} from './sim';
import { SPECIES } from './species';
import { constRng, makeFish, makeState, makeTank, seededRng, T0 } from './testUtils';
import type { Egg, GameState, Pellet } from './types';

const rng = () => seededRng(42);
const fishOf = (state: GameState, i = 0) => state.fish[i]!;
const tankOf = (state: GameState, i = 0) => state.tanks[i]!;

function pellet(overrides: Partial<Pellet> = {}): Pellet {
  return { id: 'p1', x: 500, y: 100, vy: 40, premium: false, landedAt: null, ...overrides };
}

function egg(overrides: Partial<Egg> = {}): Egg {
  return { id: 'egg1', speciesId: 'guppy', variant: 'lilac', shiny: false, tankId: 'tank-1', hatchAt: T0 + 500, ...overrides };
}

// ---------------------------------------------------------------------------

describe('tick basics', () => {
  it('does not mutate the input state', () => {
    const state = makeState({ fish: [makeFish()], tank: { pellets: [pellet()] } });
    const snapshot = structuredClone(state);
    tick(state, 60 * SECOND_MS, rng());
    expect(state).toEqual(snapshot);
  });

  it('is deterministic for the same rng seed', () => {
    const state = makeState({ fish: [makeFish({ stage: 'adult', growth: 1200, lastDropAt: T0 - 10 * MINUTE_MS })], tank: { cleanliness: 81 } });
    expect(tick(state, 60 * SECOND_MS, seededRng(7))).toEqual(tick(state, 60 * SECOND_MS, seededRng(7)));
  });

  it('advances lastTickAt by dtMs', () => {
    const { state } = tick(makeState(), 1000, rng());
    expect(state.lastTickAt).toBe(T0 + 1000);
  });
});

describe('hunger', () => {
  it('decreases by species.hungerRate per minute', () => {
    const state = makeState({ fish: [makeFish({ hunger: 80 }), makeFish({ speciesId: 'goldfish', hunger: 80 })] });
    const next = tick(state, MINUTE_MS, rng()).state;
    expect(fishOf(next, 0).hunger).toBeCloseTo(80 - SPECIES.danio.hungerRate);
    expect(fishOf(next, 1).hunger).toBeCloseTo(80 - SPECIES.goldfish.hungerRate);
  });

  it('scales with dt (1-second tick)', () => {
    const next = tick(makeState({ fish: [makeFish({ hunger: 50 })] }), SECOND_MS, rng()).state;
    expect(fishOf(next).hunger).toBeCloseTo(50 - 2 / 60);
  });

  it('floors at 0', () => {
    const next = tick(makeState({ fish: [makeFish({ hunger: 1 })] }), MINUTE_MS, rng()).state;
    expect(fishOf(next).hunger).toBe(0);
  });
});

describe('happiness target', () => {
  const tank = (o: Parameters<typeof makeTank>[0] = {}) => makeTank({ cleanliness: 45, ...o });

  it('starts from base 50', () => {
    expect(happinessTarget(30, tank(), 1)).toBe(50);
  });

  it('+20 when hunger >= 40, -20 when hunger < 20', () => {
    expect(happinessTarget(40, tank(), 1)).toBe(70);
    expect(happinessTarget(39.9, tank(), 1)).toBe(50);
    expect(happinessTarget(20, tank(), 1)).toBe(50);
    expect(happinessTarget(19.9, tank(), 1)).toBe(30);
  });

  it('+15 when cleanliness >= 60, -15 when cleanliness < 30', () => {
    expect(happinessTarget(30, tank({ cleanliness: 60 }), 1)).toBe(65);
    expect(happinessTarget(30, tank({ cleanliness: 59.9 }), 1)).toBe(50);
    expect(happinessTarget(30, tank({ cleanliness: 30 }), 1)).toBe(50);
    expect(happinessTarget(30, tank({ cleanliness: 29.9 }), 1)).toBe(35);
  });

  it('decor rewards variety: +3 per different item, +1 per duplicate, capped at +20', () => {
    const rocks = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, decorId: 'rock' as const, x: 0, flipped: false, size: 'M' as const, z: 0.5 }));
    const mixed = (['rock', 'castle', 'chest', 'plant_small', 'plant_tall', 'shipwreck', 'bench', 'diver'] as const).map((decorId, i) => ({ id: `m${i}`, decorId, x: 0, flipped: false, size: 'M' as const, z: 0.5 }));
    expect(happinessTarget(30, tank({ decor: rocks(2) }), 1)).toBe(54); // 3 + 1
    expect(happinessTarget(30, tank({ decor: rocks(5) }), 1)).toBe(57); // 3 + 4
    expect(happinessTarget(30, tank({ decor: mixed }), 1)).toBe(70); // 8 × 3 = 24 → capped at 20
  });

  it('-10 when the tank is over 90% capacity', () => {
    expect(happinessTarget(30, tank({ capacity: 10 }), 9)).toBe(50);
    expect(happinessTarget(30, tank({ capacity: 10 }), 10)).toBe(40);
    expect(happinessTarget(30, tank({ capacity: 6 }), 6)).toBe(40);
    expect(happinessTarget(30, tank({ capacity: 6 }), 5)).toBe(50);
  });

  it('only hatched fish count toward crowding, not eggs', () => {
    const fish = Array.from({ length: 5 }, () => makeFish({ hunger: 30, happiness: 50 }));
    const base = makeState({ fish, tank: { cleanliness: 45, capacity: 6 } });
    const withEgg = { ...base, eggs: [egg({ hatchAt: T0 + 10 * HOUR_MS })] };
    expect(fishOf(tick(withEgg, MINUTE_MS, rng()).state).happiness).toBeCloseTo(50);
    const crowded = { ...base, fish: [...fish, makeFish({ hunger: 30, happiness: 50 })] };
    expect(fishOf(tick(crowded, MINUTE_MS, rng()).state).happiness).toBeCloseTo(48);
  });

  it('stays within 0..100', () => {
    const best = makeTank({ cleanliness: 100, decor: (['moss_ball', 'driftwood', 'flower_plant', 'column', 'bench', 'diver', 'rock'] as const).map((decorId, i) => ({ id: `d${i}`, decorId, x: 0, flipped: false, size: 'M' as const, z: 0.5 })) });
    expect(happinessTarget(100, best, 1)).toBe(100);
    const worst = makeTank({ cleanliness: 0, capacity: 1 });
    expect(happinessTarget(0, worst, 5)).toBeGreaterThanOrEqual(0);
  });
});

describe('happiness drift', () => {
  it('moves 2 points per minute toward the target without overshoot', () => {
    expect(driftHappiness(50, 85, MINUTE_MS)).toBe(52);
    expect(driftHappiness(50, 30, MINUTE_MS)).toBe(48);
    expect(driftHappiness(84, 85, MINUTE_MS)).toBe(85);
    expect(driftHappiness(31, 30, MINUTE_MS)).toBe(30);
    expect(driftHappiness(50, 85, 30 * SECOND_MS)).toBe(51);
  });

  it('applies during tick using the tank conditions', () => {
    // hunger 80, cleanliness 100, 1 fish in a 6-tank → target 85
    const next = tick(makeState({ fish: [makeFish({ hunger: 80, happiness: 50 })] }), MINUTE_MS, rng()).state;
    expect(fishOf(next).happiness).toBeCloseTo(52);
  });
});

describe('growth', () => {
  it('happiness multiplier ranges 0.5x..1.5x', () => {
    expect(growthMultiplier(0)).toBe(0.5);
    expect(growthMultiplier(50)).toBe(1);
    expect(growthMultiplier(100)).toBe(1.5);
  });

  it('accumulates growth-seconds times the multiplier', () => {
    // Happiness already at its target (85) so it stays put.
    const next = tick(makeState({ fish: [makeFish({ hunger: 80, happiness: 85 })] }), 10 * SECOND_MS, rng()).state;
    expect(fishOf(next).growth).toBeCloseTo(10 * 1.35);
  });

  it('stops completely when hunger < 20', () => {
    const next = tick(makeState({ fish: [makeFish({ hunger: 19, happiness: 85, growth: 100 })] }), MINUTE_MS, rng()).state;
    expect(fishOf(next).growth).toBe(100);
  });

  it('continues at exactly hunger 20 and above', () => {
    const next = tick(makeState({ fish: [makeFish({ hunger: 21, happiness: 50, growth: 100 })] }), SECOND_MS, rng()).state;
    expect(fishOf(next).growth).toBeGreaterThan(100);
  });

  it('premium boost doubles growth while active', () => {
    const fish = makeFish({ hunger: 80, happiness: 85, boostUntil: T0 + 3 * MINUTE_MS });
    const next = tick(makeState({ fish: [fish] }), 10 * SECOND_MS, rng()).state;
    expect(fishOf(next).growth).toBeCloseTo(10 * 1.35 * 2);
    expect(fishOf(next).boostUntil).toBe(T0 + 3 * MINUTE_MS);
  });

  it('premium boost applies only to the boosted part of a tick, then clears', () => {
    const fish = makeFish({ hunger: 80, happiness: 85, boostUntil: T0 + 30 * SECOND_MS });
    const next = tick(makeState({ fish: [fish] }), MINUTE_MS, rng()).state;
    // 30s boosted (x2) + 30s normal = 90 effective seconds
    expect(fishOf(next).growth).toBeCloseTo(90 * growthMultiplier(fishOf(next).happiness));
    expect(fishOf(next).boostUntil).toBeNull();
  });

  it('caps at growMinutes * 60', () => {
    const total = SPECIES.danio.growMinutes * 60;
    const fish = makeFish({ hunger: 100, happiness: 100, growth: total - 1, stage: 'adult' });
    const next = tick(makeState({ fish: [fish] }), MINUTE_MS, rng()).state;
    expect(fishOf(next).growth).toBe(total);
  });
});

describe('stage transitions', () => {
  it('juvenile at 40% and adult at 100% of growMinutes', () => {
    const total = SPECIES.danio.growMinutes * 60; // 1200
    expect(stageForGrowth('danio', 0)).toBe('baby');
    expect(stageForGrowth('danio', total * 0.4 - 0.01)).toBe('baby');
    expect(stageForGrowth('danio', total * 0.4)).toBe('juvenile');
    expect(stageForGrowth('danio', total - 0.01)).toBe('juvenile');
    expect(stageForGrowth('danio', total)).toBe('adult');
  });

  it('baby → juvenile emits a stageUp event', () => {
    const fish = makeFish({ hunger: 80, happiness: 85, growth: 479 });
    const { state, events } = tick(makeState({ fish: [fish] }), SECOND_MS, rng());
    expect(fishOf(state).stage).toBe('juvenile');
    expect(events).toContainEqual({ type: 'stageUp', fishId: fish.id, from: 'baby', to: 'juvenile' });
  });

  it('juvenile → adult grants XP and starts the drop timer', () => {
    const fish = makeFish({ hunger: 80, happiness: 85, growth: 1199, stage: 'juvenile', lastDropAt: T0 - HOUR_MS });
    const { state, events } = tick(makeState({ fish: [fish] }), SECOND_MS, rng());
    expect(fishOf(state).stage).toBe('adult');
    expect(fishOf(state).lastDropAt).toBe(T0 + SECOND_MS);
    expect(state.xp).toBe(XP.fishAdult);
    expect(events.some((e) => e.type === 'drop')).toBe(false);
  });

  it('a big step can jump baby → adult directly', () => {
    const fish = makeFish({ hunger: 100, happiness: 100, growth: 0 });
    const { state, events } = tick(makeState({ fish: [fish] }), 20 * MINUTE_MS, rng());
    expect(fishOf(state).stage).toBe('adult');
    expect(events).toContainEqual({ type: 'stageUp', fishId: fish.id, from: 'baby', to: 'adult' });
  });
});

describe('cleanliness', () => {
  it('decays 0.5/min plus 0.1/min per fish', () => {
    expect(cleanlinessDecayPerMin(0)).toBe(0.5);
    expect(cleanlinessDecayPerMin(3)).toBeCloseTo(0.8);
    const next = tick(makeState({ fish: [makeFish(), makeFish()] }), MINUTE_MS, rng()).state;
    expect(tankOf(next).cleanliness).toBeCloseTo(100 - 0.7);
  });

  it('counts only fish in that tank', () => {
    const state = makeState({ fish: [makeFish({ tankId: 'tank-2' })] });
    state.tanks.push(makeTank({ id: 'tank-2' }));
    const next = tick(state, MINUTE_MS, rng()).state;
    expect(tankOf(next, 0).cleanliness).toBeCloseTo(99.5);
    expect(tankOf(next, 1).cleanliness).toBeCloseTo(99.4);
  });

  it('floors at 0', () => {
    const next = tick(makeState({ tank: { cleanliness: 0.1 } }), MINUTE_MS, rng()).state;
    expect(tankOf(next).cleanliness).toBe(0);
  });
});

describe('algae spawning', () => {
  it('counts thresholds crossed downward', () => {
    expect(thresholdsCrossed(81, 79)).toBe(1);
    expect(thresholdsCrossed(80, 79.9)).toBe(1);
    expect(thresholdsCrossed(79, 61)).toBe(0);
    expect(thresholdsCrossed(85, 35)).toBe(3);
    expect(thresholdsCrossed(50, 70)).toBe(0);
  });

  it('spawns a spot when cleanliness drops below 80', () => {
    const { state, events } = tick(makeState({ tank: { cleanliness: 80.2 } }), MINUTE_MS, rng());
    expect(tankOf(state).algaeSpots).toHaveLength(1);
    expect(events).toContainEqual({ type: 'algaeSpawned', tankId: 'tank-1' });
  });

  it('does not spawn without crossing a threshold', () => {
    const { state } = tick(makeState({ tank: { cleanliness: 79 } }), MINUTE_MS, rng());
    expect(tankOf(state).algaeSpots).toHaveLength(0);
  });

  it('spawns one spot per threshold crossed', () => {
    const { state } = tick(makeState({ tank: { cleanliness: 81 } }), 60 * MINUTE_MS, rng());
    expect(tankOf(state).cleanliness).toBeCloseTo(51);
    expect(tankOf(state).algaeSpots).toHaveLength(2);
  });

  it('respawns when re-crossing after cleaning', () => {
    let state = tick(makeState({ tank: { cleanliness: 80.2 } }), MINUTE_MS, rng()).state;
    state = { ...state, tanks: [{ ...tankOf(state), cleanliness: 80.2 }] };
    state = tick(state, MINUTE_MS, rng()).state;
    expect(tankOf(state).algaeSpots).toHaveLength(2);
  });

  it('caps at 12 spots', () => {
    const spots = Array.from({ length: MAX_ALGAE_SPOTS }, (_, i) => ({ id: `a${i}`, x: 100, y: 100, size: 20 }));
    const { state } = tick(makeState({ tank: { cleanliness: 80.2, algaeSpots: spots } }), MINUTE_MS, rng());
    expect(tankOf(state).algaeSpots).toHaveLength(MAX_ALGAE_SPOTS);
  });

  it('algaeNeeded: none at the floor, enough spots below it to wipe back up to the floor', () => {
    expect(algaeNeeded(ALGAE_FLOOR_CLEANLINESS)).toBe(0);
    expect(algaeNeeded(100)).toBe(0);
    expect(algaeNeeded(ALGAE_FLOOR_CLEANLINESS - 1)).toBe(1);
    expect(algaeNeeded(ALGAE_FLOOR_CLEANLINESS - ALGAE_WIPE_CLEANLINESS)).toBe(1);
    expect(algaeNeeded(0)).toBe(Math.min(MAX_ALGAE_SPOTS, Math.ceil(ALGAE_FLOOR_CLEANLINESS / ALGAE_WIPE_CLEANLINESS)));
  });

  it('a dirty tank with no spots grows one per minute until it can be wiped back up', () => {
    let state = makeState({ tank: { cleanliness: 30, algaeSpots: [] } });
    state = tick(state, MINUTE_MS, rng()).state;
    expect(tankOf(state).algaeSpots).toHaveLength(1);
    state = tick(state, MINUTE_MS, rng()).state;
    expect(tankOf(state).algaeSpots).toHaveLength(2);
  });

  it('no dead end: after wiping every spot, cleanliness is back to at least the floor', () => {
    let state = makeState({ fish: [makeFish(), makeFish()], tank: { cleanliness: 35, algaeSpots: [] } });
    for (let i = 0; i < 120; i++) state = tick(state, MINUTE_MS, rng()).state; // two hours of neglect
    const tank = tankOf(state);
    expect(tank.cleanliness).toBe(0);
    expect(tank.algaeSpots.length).toBeGreaterThanOrEqual(algaeNeeded(0));
    const wiped = Math.min(100, tank.cleanliness + tank.algaeSpots.length * ALGAE_WIPE_CLEANLINESS);
    expect(wiped).toBeGreaterThanOrEqual(ALGAE_FLOOR_CLEANLINESS);
  });

  it('places spots inside the water area', () => {
    const { state } = tick(makeState({ tank: { cleanliness: 85 } }), 120 * MINUTE_MS, rng());
    for (const spot of tankOf(state).algaeSpots) {
      expect(spot.x).toBeGreaterThanOrEqual(0);
      expect(spot.x).toBeLessThanOrEqual(TANK_WIDTH);
      expect(spot.y).toBeGreaterThanOrEqual(0);
      expect(spot.y + spot.size).toBeLessThanOrEqual(SAND_Y);
    }
  });
});

describe('pellets', () => {
  it('sink by vy per second', () => {
    const { state } = tick(makeState({ tank: { pellets: [pellet({ y: 100, vy: 40 })] } }), SECOND_MS, rng());
    expect(tankOf(state).pellets[0]!.y).toBeCloseTo(140);
    expect(tankOf(state).pellets[0]!.landedAt).toBeNull();
  });

  it('land on the sand and record when', () => {
    const { state } = tick(makeState({ tank: { pellets: [pellet({ y: SAND_Y - 20, vy: 40 })] } }), SECOND_MS, rng());
    const p = tankOf(state).pellets[0]!;
    expect(p.y).toBe(SAND_Y);
    expect(p.vy).toBe(0);
    expect(p.landedAt).toBe(T0 + 500);
  });

  it('do not dissolve before 60s on the sand', () => {
    const p = pellet({ y: SAND_Y, vy: 0, landedAt: T0 - 58 * SECOND_MS });
    const { state } = tick(makeState({ tank: { pellets: [p] } }), SECOND_MS, rng());
    expect(tankOf(state).pellets).toHaveLength(1);
  });

  it('dissolve after 60s: -3 cleanliness and a small algae spot', () => {
    const p = pellet({ y: SAND_Y, vy: 0, landedAt: T0 - 59 * SECOND_MS });
    const { state, events } = tick(makeState({ tank: { cleanliness: 100, pellets: [p] } }), SECOND_MS, rng());
    const tank = tankOf(state);
    expect(tank.pellets).toHaveLength(0);
    expect(tank.cleanliness).toBeCloseTo(100 - 3 - 0.5 / 60);
    expect(tank.algaeSpots).toHaveLength(1);
    expect(tank.algaeSpots[0]!.size).toBe(ALGAE_MIN_SIZE);
    expect(events).toContainEqual({ type: 'pelletDissolved', tankId: 'tank-1' });
  });

  it('a dissolve that crosses a threshold also triggers the threshold spawn', () => {
    const p = pellet({ y: SAND_Y, vy: 0, landedAt: T0 - MINUTE_MS });
    const { state } = tick(makeState({ tank: { cleanliness: 81, pellets: [p] } }), SECOND_MS, rng());
    expect(tankOf(state).algaeSpots).toHaveLength(2);
  });

  it('fall, land, and dissolve within offline catch-up', () => {
    const state = makeState({ tank: { pellets: [pellet({ y: 0, vy: 40 })] } });
    const { state: after } = simulateOffline(state, T0 + 5 * MINUTE_MS, rng());
    expect(tankOf(after).pellets).toHaveLength(0);
  });
});

describe('shell drops', () => {
  const adult = (o: Parameters<typeof makeFish>[0] = {}) =>
    makeFish({ stage: 'adult', growth: 1200, hunger: 80, happiness: 85, lastDropAt: T0 - 8 * MINUTE_MS + SECOND_MS, ...o });

  it('adults drop species.dropValue every dropMinutes', () => {
    const fish = adult();
    const { state, events } = tick(makeState({ fish: [fish] }), SECOND_MS, constRng(0.5));
    const drops = tankOf(state).shells;
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ value: SPECIES.danio.dropValue, pearl: false });
    expect(fishOf(state).lastDropAt).toBe(T0 + SECOND_MS);
    expect(events).toContainEqual(expect.objectContaining({ type: 'drop', tankId: 'tank-1', fishId: fish.id, value: 2, pearl: false }));
  });

  it('does not drop before dropMinutes has passed', () => {
    const { state } = tick(makeState({ fish: [adult({ lastDropAt: T0 - 7 * MINUTE_MS })] }), SECOND_MS, rng());
    expect(tankOf(state).shells).toHaveLength(0);
  });

  it('new drops pick spots apart from the existing ones', () => {
    // Fill the sand with drops clustered on the left; a new one should not land on top of them.
    const existing = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, x: 100 + i * 12, value: 1, pearl: false }));
    const state = makeState({ fish: [adult()], tank: { shells: existing } });
    const next = tick(state, SECOND_MS, seededRng(7)).state;
    const added = tankOf(next).shells.find((d) => !existing.some((e) => e.id === d.id))!;
    const nearest = Math.min(...existing.map((d) => Math.abs(d.x - added.x)));
    expect(nearest).toBeGreaterThan(40);
  });

  it('non-adults never drop', () => {
    const fish = adult({ stage: 'juvenile', growth: 600 });
    const { state } = tick(makeState({ fish: [fish] }), HOUR_MS / 4, rng());
    expect(tankOf(state).shells).toHaveLength(0);
  });

  it('drops a pearl 2% of the time', () => {
    const pearl = tick(makeState({ fish: [adult()] }), SECOND_MS, constRng(0.019)).state;
    expect(tankOf(pearl).shells[0]).toMatchObject({ pearl: true, value: 1 });
    const shell = tick(makeState({ fish: [adult()] }), SECOND_MS, constRng(0.02)).state;
    expect(tankOf(shell).shells[0]).toMatchObject({ pearl: false });
  });

  it('drops multiple times if several intervals elapsed in one step', () => {
    const { state } = tick(makeState({ fish: [adult({ lastDropAt: T0 })] }), 24 * MINUTE_MS, constRng(0.5));
    expect(tankOf(state).shells).toHaveLength(3);
  });

  it('online, the oldest drop over the cap is auto-collected at half value', () => {
    const existing = Array.from({ length: MAX_DROPS_PER_TANK }, (_, i) => ({ id: `s${i}`, x: 100, value: i === 0 ? 8 : 1, pearl: false }));
    const state = makeState({ fish: [adult()], tank: { shells: existing } });
    const { state: next, events } = tick(state, SECOND_MS, constRng(0.5));
    const paid = Math.floor(8 * AUTO_COLLECT_FRACTION_ONLINE);
    expect(tankOf(next).shells).toHaveLength(MAX_DROPS_PER_TANK);
    expect(tankOf(next).shells.some((s) => s.id === 's0')).toBe(false);
    expect(next.shells).toBe(state.shells + paid);
    expect(events).toContainEqual({ type: 'autoCollect', tankId: 'tank-1', value: paid, pearl: false });
  });

  it('offline, overflow drops are lost instead of auto-collected', () => {
    const existing = Array.from({ length: MAX_DROPS_PER_TANK }, (_, i) => ({ id: `s${i}`, x: 100, value: i === 0 ? 8 : 1, pearl: false }));
    const state = makeState({ fish: [adult()], tank: { shells: existing } });
    const { state: next } = tick(state, SECOND_MS, constRng(0.5), { offline: true });
    expect(tankOf(next).shells).toHaveLength(MAX_DROPS_PER_TANK);
    expect(next.shells).toBe(state.shells);
    expect(next.pearls).toBe(state.pearls);
  });

  it('auto-collected pearls go to the pearl balance', () => {
    const existing = Array.from({ length: MAX_DROPS_PER_TANK }, (_, i) => ({ id: `s${i}`, x: 100, value: i === 0 ? 4 : 1, pearl: i === 0 }));
    const state = makeState({ fish: [adult()], tank: { shells: existing } });
    const next = tick(state, SECOND_MS, constRng(0.5)).state;
    expect(next.pearls).toBe(state.pearls + Math.floor(4 * AUTO_COLLECT_FRACTION_ONLINE));
    expect(next.shells).toBe(state.shells);
  });
});

describe('egg hatching', () => {
  it('hatches eggs whose time has come into baby fish', () => {
    const state = { ...makeState(), eggs: [egg(), egg({ id: 'egg2', hatchAt: T0 + HOUR_MS })] };
    const { state: next, events } = tick(state, SECOND_MS, rng());
    expect(next.eggs.map((e) => e.id)).toEqual(['egg2']);
    expect(next.fish).toHaveLength(1);
    expect(fishOf(next)).toMatchObject({ speciesId: 'guppy', variant: 'lilac', shiny: false, stage: 'baby', bornAt: T0 + 500, tankId: 'tank-1' });
    expect(next.stats.hatched).toBe(1);
    expect(next.xp).toBe(XP.eggHatched);
    expect(events.some((e) => e.type === 'hatched')).toBe(true);
  });

  it('a full tank never blocks a hatch: the baby goes to the Nursery', () => {
    const residents = Array.from({ length: 2 }, () => makeFish());
    const state = { ...makeState({ fish: residents, tank: { capacity: 2 } }), eggs: [egg()] };
    const { state: next, events } = tick(state, SECOND_MS, rng());
    expect(next.eggs).toHaveLength(0);
    expect(next.fish).toHaveLength(2);
    expect(next.nursery).toHaveLength(1);
    expect(next.nursery[0]).toMatchObject({ speciesId: 'guppy', stage: 'baby', tankId: '' });
    expect(next.stats.hatched).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'hatched', destination: 'nursery' }));
  });

  it('when the tank and the Nursery are full the egg waits, unhatched, and says so once', () => {
    const residents = Array.from({ length: 2 }, () => makeFish());
    const napping = Array.from({ length: NURSERY_MAX }, () => makeFish({ tankId: '' }));
    const state = { ...makeState({ fish: residents, tank: { capacity: 2 } }), nursery: napping, eggs: [egg()] };
    const first = tick(state, SECOND_MS, rng());
    expect(first.state.eggs).toHaveLength(1);
    expect(first.state.eggs[0]!.waiting).toBe(true);
    expect(first.state.nursery).toHaveLength(NURSERY_MAX);
    expect(first.state.stats.hatched).toBe(state.stats.hatched);
    expect(first.events.filter((e) => e.type === 'eggWaiting')).toHaveLength(1);
    const second = tick(first.state, SECOND_MS, rng());
    expect(second.events.some((e) => e.type === 'eggWaiting')).toBe(false);
    expect(second.state.eggs).toHaveLength(1);
  });

  it('a waiting egg hatches as soon as a Nursery slot frees up', () => {
    const residents = Array.from({ length: 2 }, () => makeFish());
    const napping = Array.from({ length: NURSERY_MAX }, () => makeFish({ tankId: '' }));
    let state = { ...makeState({ fish: residents, tank: { capacity: 2 } }), nursery: napping, eggs: [egg()] };
    state = tick(state, SECOND_MS, rng()).state;
    state = { ...state, nursery: state.nursery.slice(1) };
    const next = tick(state, SECOND_MS, rng()).state;
    expect(next.eggs).toHaveLength(0);
    expect(next.nursery).toHaveLength(NURSERY_MAX);
  });

  it('Nursery babies nap: no growth, no hunger', () => {
    const napper = makeFish({ tankId: '', hunger: 60, growth: 10 });
    const state = { ...makeState(), nursery: [napper] };
    const next = simulateOffline(state, T0 + HOUR_MS, rng()).state;
    expect(next.nursery[0]).toMatchObject({ hunger: 60, growth: 10, stage: 'baby' });
  });

  it('shiny hatch gives +2 pearls', () => {
    const state = { ...makeState(), eggs: [egg({ shiny: true })] };
    const next = tick(state, SECOND_MS, rng()).state;
    expect(fishOf(next).shiny).toBe(true);
    expect(next.pearls).toBe(state.pearls + 2);
  });
});

describe('xp and leveling from the sim', () => {
  it('levels up and awards level * 10 shells', () => {
    const fish = makeFish({ hunger: 80, happiness: 85, growth: 1199, stage: 'juvenile' });
    const state = makeState({ fish: [fish], overrides: { xp: 25 } });
    const { state: next, events } = tick(state, SECOND_MS, rng());
    expect(next.level).toBe(2);
    expect(next.xp).toBe(25 + XP.fishAdult - 30);
    expect(next.shells).toBe(state.shells + 20);
    expect(events).toContainEqual({ type: 'levelUp', level: 2, shells: 20 });
  });
});

describe('eatPellet', () => {
  const setup = (hunger: number, premium = false) => {
    const fish = makeFish({ hunger });
    return { fish, state: makeState({ fish: [fish], tank: { pellets: [pellet({ premium })] } }) };
  };

  it('+15 hunger and removes the pellet', () => {
    const { fish, state } = setup(50);
    const next = eatPellet(state, fish.id, 'p1', T0);
    expect(fishOf(next).hunger).toBe(65);
    expect(tankOf(next).pellets).toHaveLength(0);
    expect(next.stats.fed).toBe(1);
  });

  it('premium gives +25 and a 3-minute growth boost', () => {
    const { fish, state } = setup(50, true);
    const next = eatPellet(state, fish.id, 'p1', T0);
    expect(fishOf(next).hunger).toBe(75);
    expect(fishOf(next).boostUntil).toBe(T0 + 3 * MINUTE_MS);
  });

  it('caps hunger at 100', () => {
    const { fish, state } = setup(90, true);
    expect(fishOf(eatPellet(state, fish.id, 'p1', T0)).hunger).toBe(100);
  });

  it('full fish (>= 95) ignore food', () => {
    const { fish, state } = setup(95);
    expect(eatPellet(state, fish.id, 'p1', T0)).toBe(state);
  });

  it('ignores unknown fish or pellets', () => {
    const { fish, state } = setup(50);
    expect(eatPellet(state, 'nope', 'p1', T0)).toBe(state);
    expect(eatPellet(state, fish.id, 'nope', T0)).toBe(state);
  });
});

describe('simulateOffline', () => {
  it('caps elapsed time at 8 hours and sets lastTickAt to now', () => {
    const state = makeState({ fish: [makeFish({ hunger: 100 })] });
    const now = T0 + 10 * HOUR_MS;
    const { state: next, summary } = simulateOffline(state, now, rng());
    expect(summary.elapsedMs).toBe(OFFLINE_CAP_MS);
    expect(next.lastTickAt).toBe(now);
    // Hunger only reflects 8h (it floors at 0 either way, so check cleanliness instead).
    expect(tankOf(next).cleanliness).toBeCloseTo(Math.max(0, 100 - 0.6 * 480));
  });

  it('runs in 60-second steps (same result as manual 60s ticks)', () => {
    const state = makeState({ fish: [makeFish({ stage: 'adult', growth: 1200, lastDropAt: T0 })], tank: { cleanliness: 82 } });
    const offline = simulateOffline(state, T0 + 10 * MINUTE_MS, seededRng(3)).state;
    let manual = state;
    const r = seededRng(3);
    for (let i = 0; i < 10; i++) manual = tick(manual, MINUTE_MS, r).state;
    expect(offline).toEqual(manual);
  });

  it('handles a partial final step', () => {
    const state = makeState({ fish: [makeFish({ hunger: 80 })] });
    const next = simulateOffline(state, T0 + 90 * SECOND_MS, rng()).state;
    expect(fishOf(next).hunger).toBeCloseTo(77);
  });

  it('does nothing if no time passed (or the clock went backwards)', () => {
    const state = makeState({ fish: [makeFish({ hunger: 80 })] });
    const { state: next, summary } = simulateOffline(state, T0 - 5000, rng());
    expect(summary.elapsedMs).toBe(0);
    expect(fishOf(next).hunger).toBe(80);
  });

  it('nothing dies: fish just wait hungry', () => {
    const fish = [makeFish({ hunger: 10 }), makeFish({ hunger: 50, stage: 'adult', growth: 1200 })];
    const next = simulateOffline(makeState({ fish }), T0 + 8 * HOUR_MS, rng()).state;
    expect(next.fish).toHaveLength(2);
    for (const f of next.fish) {
      expect(f.hunger).toBe(0);
      expect(f.happiness).toBeGreaterThanOrEqual(0);
    }
  });

  it('summarizes drops, hatches, and growth', () => {
    const adult = makeFish({ stage: 'adult', growth: 1200, hunger: 100, lastDropAt: T0 });
    const baby = makeFish({ hunger: 100, happiness: 100, growth: 0 });
    const state = { ...makeState({ fish: [adult, baby] }), eggs: [egg({ speciesId: 'danio', variant: 'mint' })] };
    const { state: next, summary } = simulateOffline(state, T0 + 8 * HOUR_MS, rng());

    // Far more drops fell than fit on the sand, but the overflow was lost: the summary only counts what's still there.
    expect(summary.shellsDropped + summary.pearlsDropped).toBe(tankOf(next).shells.length);
    expect(summary.shellsDropped + summary.pearlsDropped).toBeGreaterThan(0);
    expect(summary.shellValue).toBe(summary.shellsDropped * SPECIES.danio.dropValue);
    expect(summary.eggsHatched).toBe(1);
    expect(summary.fishGrown).toBeGreaterThanOrEqual(2); // baby → juvenile → adult
    expect(tankOf(next).shells.length).toBeLessThanOrEqual(MAX_DROPS_PER_TANK);
    // Overflow drops are lost while away: nothing landed in the wallet.
    expect(next.shells).toBe(state.shells);
  });
});

describe('createInitialState', () => {
  const state = createInitialState(T0, seededRng(5));

  it('matches the spec starting state', () => {
    expect(state).toMatchObject({ version: SAVE_VERSION, shells: 30, pearls: 0, level: 1, xp: 0, lastTickAt: T0, lastDailyGift: null, eggs: [] });
    expect(state.settings.muted).toBe(true);
    expect(state.stats).toEqual({ fed: 0, hatched: 0, cleaned: 0 });
  });

  it('has one classic tank with capacity 10 and cleanliness 100', () => {
    expect(state.tanks).toHaveLength(1);
    expect(tankOf(state)).toMatchObject({ theme: 'classic', capacity: 10, upgrades: 0, cleanliness: 100, algaeSpots: [], decor: [], pellets: [], shells: [] });
    expect(state.activeTankId).toBe(tankOf(state).id);
  });

  it('has two baby danios with valid variants and distinct names', () => {
    expect(state.fish).toHaveLength(2);
    const variantKeys = SPECIES.danio.variants.map((v) => v.key);
    for (const f of state.fish) {
      expect(f).toMatchObject({ speciesId: 'danio', stage: 'baby', growth: 0, tankId: tankOf(state).id, shiny: false });
      expect(variantKeys).toContain(f.variant);
    }
    expect(fishOf(state, 0).name).not.toBe(fishOf(state, 1).name);
    expect(fishOf(state, 0).id).not.toBe(fishOf(state, 1).id);
  });
});

describe('stageProgress', () => {
  it('reports progress toward juvenile for babies', () => {
    const p = stageProgress(makeFish({ growth: 240, hunger: 80, happiness: 50 }), T0);
    expect(p.nextStage).toBe('juvenile');
    expect(p.fraction).toBeCloseTo(0.5);
    expect(p.secondsRemaining).toBeCloseTo(240);
    expect(p.growing).toBe(true);
  });

  it('reports progress toward adult for juveniles, faster when boosted', () => {
    const fish = makeFish({ stage: 'juvenile', growth: 840, hunger: 80, happiness: 50 });
    const p = stageProgress(fish, T0);
    expect(p.nextStage).toBe('adult');
    expect(p.fraction).toBeCloseTo(0.5);
    expect(p.secondsRemaining).toBeCloseTo(360);
    expect(stageProgress({ ...fish, boostUntil: T0 + 1000 }, T0).secondsRemaining).toBeCloseTo(180);
  });

  it('is paused when starving and complete for adults', () => {
    expect(stageProgress(makeFish({ growth: 100, hunger: 10 }), T0)).toMatchObject({ growing: false, secondsRemaining: null });
    expect(stageProgress(makeFish({ stage: 'adult', growth: 1200 }), T0)).toMatchObject({ fraction: 1, nextStage: null });
  });
});

describe('algaeTouchedBySponge', () => {
  const spots = [
    { id: 'a', x: 90, y: 90, size: 20 }, // center 100,100
    { id: 'b', x: 290, y: 90, size: 20 }, // center 300,100
    { id: 'c', x: 190, y: 290, size: 20 }, // center 200,300
  ];

  it('hits spots near a single point', () => {
    expect(algaeTouchedBySponge(spots, { x: 100, y: 125 }, { x: 100, y: 125 }, 18)).toEqual(['a']);
    expect(algaeTouchedBySponge(spots, { x: 100, y: 140 }, { x: 100, y: 140 }, 18)).toEqual([]);
  });

  it('hits every spot along a fast drag segment', () => {
    expect(algaeTouchedBySponge(spots, { x: 50, y: 100 }, { x: 350, y: 100 }, 18)).toEqual(['a', 'b']);
  });

  it('does not hit spots beyond the segment ends', () => {
    expect(algaeTouchedBySponge(spots, { x: 150, y: 100 }, { x: 250, y: 100 }, 18)).toEqual([]);
  });
});

describe('wipeAlgae', () => {
  const spots = [
    { id: 'a1', x: 100, y: 100, size: 20 },
    { id: 'a2', x: 200, y: 100, size: 20 },
  ];

  it('removes the spot, adds ALGAE_WIPE_CLEANLINESS and counts it as cleaned', () => {
    const state = makeState({ tank: { cleanliness: 40, algaeSpots: spots } });
    const next = wipeAlgae(state, 'a1')!;
    expect(tankOf(next).algaeSpots.map((a) => a.id)).toEqual(['a2']);
    expect(tankOf(next).cleanliness).toBe(40 + ALGAE_WIPE_CLEANLINESS);
    expect(next.stats.cleaned).toBe(state.stats.cleaned + 1);
  });

  it('never goes above 100', () => {
    const state = makeState({ tank: { cleanliness: 98, algaeSpots: spots } });
    expect(tankOf(wipeAlgae(state, 'a1')!).cleanliness).toBe(100);
  });

  it('an unknown spot is null and the input is untouched', () => {
    const state = makeState({ tank: { algaeSpots: spots } });
    const snapshot = structuredClone(state);
    expect(wipeAlgae(state, 'nope')).toBeNull();
    wipeAlgae(state, 'a1');
    expect(state).toEqual(snapshot);
  });
});
