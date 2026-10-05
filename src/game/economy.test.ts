import { describe, expect, it } from 'vitest';
import { BREEDING, DECOR_LIMIT, FEED_XP_MAX_PER_HOUR, HOUR_MS, TANK_BASE_CAPACITY, XP } from './constants';
import {
  collectDrop,
  updateDecor,
  placeFromBox,
  restoreSoldDecor,
  restoreSoldFish,
  applyTheme,
  buyCapacityUpgrade,
  moveFromNursery,
  rehomeNurseryBaby,
  rehomeValue,
  buyDecor,
  buyFish,
  buyPremiumFood,
  buyTank,
  breakXpAvailable,
  buyTheme,
  canAfford,
  completeBreak,
  capacityUpgradeCost,
  checkBuyFish,
  claimDailyGift,
  clampDecorX,
  decorRefund,
  feedingXp,
  localDateKey,
  moveDecor,
  moveFish,
  pickDecorSpot,
  renameTank,
  sellDecor,
  sellFish,
  sellValue,
  type Result,
} from './economy';
import { happinessTarget } from './sim';
import { SPECIES } from './species';
import { constRng, makeFish, makeState, makeTank, seededRng, T0 } from './testUtils';
import type { Fish, GameState } from './types';

const rich = (o: Partial<GameState> = {}) => makeState({ overrides: { shells: 100_000, pearls: 1_000, level: 30, ...o } });
const okState = (r: Result): GameState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.state;
};
const reason = (r: Result) => (r.ok ? 'ok' : r.reason);

describe('currency', () => {
  it('checks shells and pearls separately', () => {
    const s = makeState({ overrides: { shells: 10, pearls: 2 } });
    expect(canAfford(s, { currency: 'shells', amount: 10 })).toBe(true);
    expect(canAfford(s, { currency: 'shells', amount: 11 })).toBe(false);
    expect(canAfford(s, { currency: 'pearls', amount: 2 })).toBe(true);
    expect(canAfford(s, { currency: 'pearls', amount: 3 })).toBe(false);
  });
});

describe('buying fish', () => {
  it('adds a baby to the active tank, charges the price, and grants 5 XP', () => {
    const state = makeState({ overrides: { shells: 30 } });
    const next = okState(buyFish(state, 'danio', T0, seededRng(1)));
    expect(next.shells).toBe(30 - SPECIES.danio.cost.amount);
    expect(next.fish).toHaveLength(1);
    expect(next.fish[0]).toMatchObject({ speciesId: 'danio', stage: 'baby', growth: 0, tankId: state.activeTankId, bornAt: T0 });
    expect(next.xp).toBe(XP.fishBought);
  });

  it('charges pearls for pearl species', () => {
    const next = okState(buyFish(rich({ pearls: 7 }), 'puffer', T0, seededRng(1)));
    expect(next.pearls).toBe(2);
  });

  it('unlocks the jellyfish at level 10 for 400 shells', () => {
    const state = makeState({ overrides: { shells: 400, level: 9 } });
    expect(checkBuyFish(state, 'jellyfish')).toBe('locked');
    const next = okState(buyFish({ ...state, level: 10 }, 'jellyfish', T0, seededRng(1)));
    expect(next.shells).toBe(0);
    expect(next.fish[0]).toMatchObject({ speciesId: 'jellyfish', stage: 'baby' });
    expect(SPECIES.jellyfish.variants.map((v) => v.key)).toContain(next.fish[0]!.variant);
  });

  it('is locked below the unlock level', () => {
    const state = makeState({ overrides: { shells: 1000, level: 2 } });
    expect(checkBuyFish(state, 'goldfish')).toBe('locked');
    expect(checkBuyFish({ ...state, level: 3 }, 'goldfish')).toBeNull();
  });

  it('needs enough currency', () => {
    expect(reason(buyFish(makeState({ overrides: { shells: 9 } }), 'danio', T0, seededRng(1)))).toBe('cost');
  });

  it('checks capacity; eggs don’t take up room', () => {
    const full = rich();
    full.fish = Array.from({ length: TANK_BASE_CAPACITY[0] - 1 }, () => makeFish());
    full.eggs = [{ id: 'e', speciesId: 'danio', variant: 'zebra', shiny: false, tankId: 'tank-1', hatchAt: T0 + HOUR_MS }];
    expect(checkBuyFish(full, 'danio')).toBeNull();
    full.fish.push(makeFish());
    expect(checkBuyFish(full, 'danio')).toBe('full');
  });

  it('theme-only species need the matching tank theme', () => {
    expect(checkBuyFish(rich(), 'clownfish')).toBe('theme');
    expect(checkBuyFish(rich(), 'koi')).toBe('theme');
    const coral = { ...rich(), tanks: [makeTank({ theme: 'coral' })] };
    expect(checkBuyFish(coral, 'clownfish')).toBeNull();
  });

  it('can level up from the purchase XP', () => {
    const r = buyFish(makeState({ overrides: { shells: 100, xp: 38 } }), 'danio', T0, seededRng(1));
    expect(r.ok && r.levelsGained).toEqual([2]);
    expect(okState(r).shells).toBe(100 - 10 + 20);
  });
});

describe('selling fish', () => {
  it('adults sell for full price, juveniles for 40%, babies not at all', () => {
    expect(sellValue(makeFish({ speciesId: 'goldfish', stage: 'adult' }))).toBe(80);
    expect(sellValue(makeFish({ speciesId: 'goldfish', stage: 'juvenile' }))).toBe(32);
    expect(sellValue(makeFish({ speciesId: 'danio', stage: 'juvenile' }))).toBe(10);
    expect(sellValue(makeFish({ stage: 'baby' }))).toBeNull();
  });

  it('removes the fish and adds shells', () => {
    const fish = makeFish({ speciesId: 'betta', stage: 'adult' });
    const state = makeState({ fish: [fish], overrides: { shells: 5 } });
    const next = okState(sellFish(state, fish.id));
    expect(next.fish).toHaveLength(0);
    expect(next.shells).toBe(5 + 150);
  });

  it('refuses babies and unknown fish', () => {
    const baby = makeFish();
    const state = makeState({ fish: [baby] });
    expect(reason(sellFish(state, baby.id))).toBe('notSellable');
    expect(reason(sellFish(state, 'nope'))).toBe('notFound');
  });
});

describe('premium food', () => {
  it('unlocks at L2 and sells 3 for 10 shells', () => {
    expect(reason(buyPremiumFood(makeState({ overrides: { shells: 50, level: 1 } })))).toBe('locked');
    const next = okState(buyPremiumFood(makeState({ overrides: { shells: 50, level: 2 } })));
    expect(next.shells).toBe(40);
    expect(next.inventory.premiumFood).toBe(3);
    expect(reason(buyPremiumFood(makeState({ overrides: { shells: 9, level: 2 } })))).toBe('cost');
  });
});

describe('feeding XP cap', () => {
  it('grants 1 XP per pellet up to 30 per hour, then resets', () => {
    let state = makeState({ overrides: { feedXp: { windowStart: T0, earned: 0 } } });
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const r = feedingXp(state, T0 + i * 1000);
      total += r.xp;
      state = { ...state, feedXp: r.feedXp };
    }
    expect(total).toBe(FEED_XP_MAX_PER_HOUR);
    const later = feedingXp(state, T0 + HOUR_MS);
    expect(later.xp).toBe(1);
    expect(later.feedXp).toEqual({ windowStart: T0 + HOUR_MS, earned: 1 });
  });
});

describe('decor', () => {
  it('is never level-gated: a level-1 player can buy any decor they can afford', () => {
    for (const id of ['rock', 'castle', 'shipwreck', 'stone_head', 'tiny_cottage'] as const) {
      expect(reason(buyDecor(rich({ level: 1 }), id, T0, seededRng(1)))).toBe('ok');
    }
  });

  it('places the item on the active tank and charges for it', () => {
    const next = okState(buyDecor(makeState({ overrides: { shells: 100, level: 3 } }), 'plant_tall', T0, seededRng(1)));
    expect(next.shells).toBe(65);
    expect(next.tanks[0]!.decor).toHaveLength(1);
    expect(next.tanks[0]!.decor[0]!.decorId).toBe('plant_tall');
  });

  it('places up to 15 per tank, then new purchases go to the decor box', () => {
    let state = rich();
    for (let i = 0; i < DECOR_LIMIT.base; i++) state = okState(buyDecor(state, 'rock', T0 + i, seededRng(i)));
    expect(state.tanks[0]!.decor).toHaveLength(15);
    const extra = buyDecor(state, 'rock', T0, seededRng(99));
    expect(extra.ok && extra.boxed).toBe(true);
    expect(okState(extra).decorInventory).toEqual({ rock: 1 });
  });

  it('spreads new decor away from existing items', () => {
    const tank = makeTank({ decor: [{ id: 'a', decorId: 'rock', x: 500, flipped: false, size: 'M' as const, z: 0.5 }] });
    const spot = pickDecorSpot(tank, seededRng(3));
    expect(Math.hypot(spot.x - 500, (spot.z - 0.5) * 300)).toBeGreaterThan(150);
    expect(spot.z).toBeGreaterThanOrEqual(0);
    expect(spot.z).toBeLessThanOrEqual(1);
  });

  it('a new piece lands behind or in front of a crowded line, not on it', () => {
    const line = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, decorId: 'rock' as const, x: 120 + i * 150, flipped: false, size: 'M' as const, z: 0.5 }));
    const tank = makeTank({ decor: line });
    const spot = pickDecorSpot(tank, seededRng(11));
    const nearest = Math.min(...line.map((d) => Math.hypot(d.x - spot.x, (d.z - spot.z) * 300)));
    expect(nearest).toBeGreaterThan(60);
  });

  it('sells back for 50% in the original currency', () => {
    expect(decorRefund('plant_tall')).toEqual({ currency: 'shells', amount: 17 });
    expect(decorRefund('shipwreck')).toEqual({ currency: 'pearls', amount: 3 });
    const state = rich({ shells: 0 });
    state.tanks = [makeTank({ decor: [{ id: 'd1', decorId: 'castle', x: 300, flipped: false, size: 'M' as const, z: 0.5 }] })];
    const next = okState(sellDecor(state, 'tank-1', 'd1'));
    expect(next.shells).toBe(75);
    expect(next.tanks[0]!.decor).toHaveLength(0);
  });
});

describe('tank capacity upgrade', () => {
  it('unlocks at L4: +3 slots, 150 shells growing ×1.6, max 5 per tank', () => {
    expect(reason(buyCapacityUpgrade(rich({ level: 3 })))).toBe('locked');
    let state = rich({ level: 4, shells: 10_000 });
    expect(state.tanks[0]!.capacity).toBe(10);
    const costs: number[] = [];
    for (let i = 0; i < 5; i++) {
      costs.push(capacityUpgradeCost(state.tanks[0]!)!.amount);
      state = okState(buyCapacityUpgrade(state));
    }
    expect(costs).toEqual([150, 240, 384, 614, 983]);
    expect(state.tanks[0]).toMatchObject({ capacity: 25, upgrades: 5 });
    expect(state.shells).toBe(10_000 - 2371);
    expect(capacityUpgradeCost(state.tanks[0]!)).toBeNull();
    expect(reason(buyCapacityUpgrade(state))).toBe('max');
  });
});

describe('extra tanks', () => {
  it('second tank at L8 for 500, third at L14 for 2000, then none', () => {
    expect(reason(buyTank(rich({ level: 7 }), T0, seededRng(1)))).toBe('locked');
    let state = rich({ level: 8, shells: 3000 });
    state = okState(buyTank(state, T0, seededRng(1)));
    expect(state.tanks).toHaveLength(2);
    expect(state.shells).toBe(2500);
    expect(state.activeTankId).toBe(state.tanks[1]!.id);
    expect(state.tanks[1]).toMatchObject({ capacity: 12, upgrades: 0, theme: 'classic', cleanliness: 100 });
    expect(reason(buyTank(state, T0, seededRng(2)))).toBe('locked');
    state = okState(buyTank({ ...state, level: 14 }, T0 + 1, seededRng(2)));
    expect(state.tanks).toHaveLength(3);
    expect(state.tanks[2]).toMatchObject({ capacity: 15, upgrades: 0 });
    expect(state.shells).toBe(500);
    expect(reason(buyTank(state, T0, seededRng(3)))).toBe('max');
  });
});

describe('themes', () => {
  it('Night L10 (8 pearls), Coral L12 (12), Pond L20 (20)', () => {
    expect(reason(buyTheme(rich({ level: 9 }), 'night'))).toBe('locked');
    const night = okState(buyTheme(rich({ level: 10, pearls: 8 }), 'night'));
    expect(night.pearls).toBe(0);
    expect(night.ownedThemes).toContain('night');
    expect(reason(buyTheme(night, 'night'))).toBe('owned');
    expect(reason(buyTheme(rich({ level: 11 }), 'coral'))).toBe('locked');
    expect(reason(buyTheme(rich({ level: 19 }), 'pond'))).toBe('locked');
    expect(reason(buyTheme(rich({ level: 20, pearls: 19 }), 'pond'))).toBe('cost');
    expect(reason(buyTheme(rich(), 'classic'))).toBe('owned');
  });

  it('applies owned themes to a tank, but not away from a theme-only fish', () => {
    let state = rich({ ownedThemes: ['classic', 'coral', 'night'] });
    expect(reason(applyTheme(state, 'tank-1', 'pond'))).toBe('locked');
    state = okState(applyTheme(state, 'tank-1', 'coral'));
    expect(state.tanks[0]!.theme).toBe('coral');
    state = { ...state, fish: [makeFish({ speciesId: 'clownfish' })] };
    expect(reason(applyTheme(state, 'tank-1', 'night'))).toBe('theme');
  });
});

describe('daily gift', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('gives 20 shells + 3 premium food + 5 XP once per day', () => {
    const state = makeState({ overrides: { shells: 0 } });
    const r = claimDailyGift(state, '2026-10-02', constRng(0.5));
    const next = okState(r);
    expect(next).toMatchObject({ shells: 20, pearls: 0, xp: XP.dailyGift, lastDailyGift: '2026-10-02' });
    expect(next.inventory.premiumFood).toBe(3);
    expect(r.gift).toEqual({ shells: 20, premiumFood: 3, pearls: 0 });
    expect(reason(claimDailyGift(next, '2026-10-02', constRng(0.5)))).toBe('claimed');
    expect(reason(claimDailyGift(next, '2026-10-03', constRng(0.5)))).toBe('ok');
  });

  it('has a 15% chance of a bonus pearl', () => {
    expect(okState(claimDailyGift(makeState(), 'd', constRng(0.149))).pearls).toBe(1);
    expect(okState(claimDailyGift(makeState(), 'd', constRng(0.15))).pearls).toBe(0);
  });
});

describe('decor placement', () => {
  it('slides decor along the sand, clamped away from the glass', () => {
    const state = rich();
    state.tanks = [makeTank({ decor: [{ id: 'd1', decorId: 'rock', x: 300, flipped: false, size: 'M' as const, z: 0.5 }] })];
    expect(okState(moveDecor(state, 'tank-1', 'd1', 640)).tanks[0]!.decor[0]!.x).toBe(640);
    expect(okState(moveDecor(state, 'tank-1', 'd1', -100)).tanks[0]!.decor[0]!.x).toBe(clampDecorX(-100));
    expect(clampDecorX(-100)).toBeGreaterThan(0);
    expect(clampDecorX(5000)).toBeLessThan(1000);
    expect(reason(moveDecor(state, 'tank-1', 'nope', 10))).toBe('notFound');
  });

  it('bought decor raises the tank happiness target by +3 each', () => {
    const before = rich();
    let after = okState(buyDecor(before, 'rock', T0, seededRng(1)));
    after = okState(buyDecor(after, 'plant_small', T0 + 1, seededRng(2)));
    const target = (s: GameState) => happinessTarget(50, s.tanks[0]!, 1);
    expect(target(after) - target(before)).toBe(6);
  });
});

describe('moving fish between tanks', () => {
  const twoTanks = (o: { capacity2?: number; theme2?: 'classic' | 'coral' | 'pond' } = {}) => {
    const s = rich();
    s.tanks = [makeTank({ id: 'tank-1' }), makeTank({ id: 'tank-2', capacity: o.capacity2 ?? 6, theme: o.theme2 ?? 'classic' })];
    return s;
  };

  it('moves a fish to another tank with room', () => {
    const fish = makeFish();
    const s = { ...twoTanks(), fish: [fish] };
    expect(okState(moveFish(s, fish.id, 'tank-2')).fish[0]!.tankId).toBe('tank-2');
  });

  it('refuses a full target tank (only hatched fish count)', () => {
    const fish = makeFish();
    const egg = { id: 'e', speciesId: 'danio' as const, variant: 'zebra', shiny: false, tankId: 'tank-2', hatchAt: T0 + HOUR_MS };
    expect(reason(moveFish({ ...twoTanks({ capacity2: 1 }), fish: [fish], eggs: [egg] }, fish.id, 'tank-2'))).toBe('ok');
    const resident = makeFish({ tankId: 'tank-2' });
    expect(reason(moveFish({ ...twoTanks({ capacity2: 1 }), fish: [fish, resident] }, fish.id, 'tank-2'))).toBe('full');
  });

  it('a courting fish can’t be moved or sold', () => {
    const a = makeFish({ stage: 'adult', growth: 1200 });
    const b = makeFish({ stage: 'adult', growth: 1200 });
    const s = { ...twoTanks(), fish: [a, b], courtships: [{ id: 'c', tankId: 'tank-1', fishIds: [a.id, b.id] as [string, string], startedAt: T0, endsAt: T0 + BREEDING.courtshipMs, x: 400 }] };
    expect(reason(moveFish(s, a.id, 'tank-2'))).toBe('courting');
    expect(reason(sellFish(s, b.id))).toBe('courting');
  });

  it('keeps clownfish in coral tanks and koi in pond tanks', () => {
    const clown = makeFish({ speciesId: 'clownfish' });
    const koi = makeFish({ speciesId: 'koi' });
    expect(reason(moveFish({ ...twoTanks(), fish: [clown] }, clown.id, 'tank-2'))).toBe('theme');
    expect(reason(moveFish({ ...twoTanks({ theme2: 'coral' }), fish: [clown] }, clown.id, 'tank-2'))).toBe('ok');
    expect(reason(moveFish({ ...twoTanks({ theme2: 'coral' }), fish: [koi] }, koi.id, 'tank-2'))).toBe('theme');
    expect(reason(moveFish({ ...twoTanks({ theme2: 'pond' }), fish: [koi] }, koi.id, 'tank-2'))).toBe('ok');
  });

  it('rejects moving to the same tank or an unknown one', () => {
    const fish = makeFish();
    const s = { ...twoTanks(), fish: [fish] };
    expect(reason(moveFish(s, fish.id, 'tank-1'))).toBe('notFound');
    expect(reason(moveFish(s, fish.id, 'tank-9'))).toBe('notFound');
  });
});

describe('renaming tanks', () => {
  it('trims, caps length, and ignores blanks', () => {
    expect(okState(renameTank(rich(), 'tank-1', '  Bubble Palace  ')).tanks[0]!.name).toBe('Bubble Palace');
    expect(okState(renameTank(rich(), 'tank-1', 'x'.repeat(40))).tanks[0]!.name).toHaveLength(20);
    expect(reason(renameTank(rich(), 'tank-1', '   '))).toBe('notFound');
  });
});

describe('break mode XP', () => {
  it('grants +10 XP for a completed break, at most once per hour', () => {
    const s0 = makeState();
    const first = completeBreak(s0, T0);
    expect(first.xp).toBe(XP.breakComplete);
    const s1 = okState(first);
    expect(s1.xp).toBe(XP.breakComplete);
    expect(s1.lastBreakXpAt).toBe(T0);
    const again = completeBreak(s1, T0 + HOUR_MS - 1);
    expect(again.xp).toBe(0);
    expect(okState(again).xp).toBe(XP.breakComplete);
    expect(completeBreak(s1, T0 + HOUR_MS).xp).toBe(XP.breakComplete);
    expect(breakXpAvailable(s1, T0 + 10)).toBe(false);
  });
});

describe('nursery', () => {
  const baby = (o: Partial<Fish> = {}) => makeFish({ speciesId: 'goldfish', tankId: '', ...o });
  const withNursery = (babies: Fish[], o: { fishInTank?: number; theme?: 'classic' | 'coral' } = {}) => {
    const s = rich();
    s.tanks = [makeTank({ id: 'tank-1', capacity: 3, theme: o.theme ?? 'classic' })];
    s.fish = Array.from({ length: o.fishInTank ?? 0 }, () => makeFish());
    s.nursery = babies;
    return s;
  };

  it('moves a napping baby into a tank with room, where it starts growing', () => {
    const b = baby();
    const s = okState(moveFromNursery(withNursery([b]), b.id, 'tank-1', T0 + 5));
    expect(s.nursery).toHaveLength(0);
    expect(s.fish.find((f) => f.id === b.id)).toMatchObject({ tankId: 'tank-1', stage: 'baby', lastDropAt: T0 + 5 });
  });

  it('won’t move into a full tank or the wrong theme', () => {
    const b = baby();
    expect(reason(moveFromNursery(withNursery([b], { fishInTank: 3 }), b.id, 'tank-1', T0))).toBe('full');
    const clown = baby({ speciesId: 'clownfish' });
    expect(reason(moveFromNursery(withNursery([clown]), clown.id, 'tank-1', T0))).toBe('theme');
    expect(reason(moveFromNursery(withNursery([clown], { theme: 'coral' }), clown.id, 'tank-1', T0))).toBe('ok');
  });

  it('rehoming pays 20% of the adult price', () => {
    const b = baby();
    expect(rehomeValue(b)).toBe(16); // goldfish sells for 80
    const s = okState(rehomeNurseryBaby(withNursery([b]), b.id));
    expect(s.nursery).toHaveLength(0);
    expect(s.shells).toBe(rich().shells + 16);
  });
});

describe('moving decor in depth', () => {
  const piece = { id: 'd1', decorId: 'rock' as const, x: 300, flipped: false, size: 'M' as const, z: 0.5 };
  const base = () => makeState({ tank: { decor: [piece] } });

  it('moveDecor sets x and, when given, depth (both clamped)', () => {
    const r = moveDecor(base(), 'tank-1', 'd1', 5000, 3);
    if (!r.ok) throw new Error('should move');
    expect(r.state.tanks[0]!.decor[0]).toMatchObject({ x: 930, z: 1 });
  });

  it('moveDecor without a depth leaves it alone', () => {
    const r = moveDecor(makeState({ tank: { decor: [{ ...piece, z: 0.2 }] } }), 'tank-1', 'd1', 400);
    if (!r.ok) throw new Error('should move');
    expect(r.state.tanks[0]!.decor[0]).toMatchObject({ x: 400, z: 0.2 });
  });

  it('updateDecor clamps depth', () => {
    const r = updateDecor(base(), 'tank-1', 'd1', { z: -2 });
    if (!r.ok) throw new Error('should update');
    expect(r.state.tanks[0]!.decor[0]!.z).toBe(0);
  });

  it('placeFromBox places at the sand line unless a depth is given', () => {
    const state = { ...makeState(), decorInventory: { rock: 2 } };
    const a = placeFromBox(state, 'tank-1', 'rock', 400, T0, seededRng(1));
    const b = placeFromBox(state, 'tank-1', 'rock', 400, T0, seededRng(1), 0.9);
    if (!a.ok || !b.ok) throw new Error('should place');
    expect(a.state.tanks[0]!.decor[0]!.z).toBe(0.5);
    expect(b.state.tanks[0]!.decor[0]!.z).toBe(0.9);
  });
});

describe('collectDrop', () => {
  const drops = [
    { id: 's1', x: 100, value: 4, pearl: false },
    { id: 'p1', x: 200, value: 1, pearl: true },
  ];

  it('a shell drop adds its value to shells and leaves the sand', () => {
    const state = makeState({ tank: { shells: drops }, overrides: { shells: 10, pearls: 2 } });
    const next = collectDrop(state, 's1')!;
    expect(next.shells).toBe(14);
    expect(next.pearls).toBe(2);
    expect(next.tanks[0]!.shells.map((d) => d.id)).toEqual(['p1']);
  });

  it('a pearl drop adds to pearls instead', () => {
    const state = makeState({ tank: { shells: drops }, overrides: { shells: 10, pearls: 2 } });
    const next = collectDrop(state, 'p1')!;
    expect(next.pearls).toBe(3);
    expect(next.shells).toBe(10);
  });

  it('an unknown drop is a no-op (null) and the state is not mutated', () => {
    const state = makeState({ tank: { shells: drops } });
    const snapshot = structuredClone(state);
    expect(collectDrop(state, 'nope')).toBeNull();
    collectDrop(state, 's1');
    expect(state).toEqual(snapshot);
  });
});

describe('undoing a sale', () => {
  it('a sold fish comes back for the same money, with its bond and name intact', () => {
    const fish = { ...makeFish({ name: 'Mochi', stage: 'adult', growth: 99999 }), bondPoints: 50, bondLevel: 2 as const };
    const state = makeState({ fish: [fish], overrides: { shells: 100 } });
    const sold = sellFish(state, fish.id);
    if (!sold.ok) throw new Error('should sell');
    const value = sold.state.shells - 100;
    const back = restoreSoldFish(sold.state, fish, value)!;
    expect(back.shells).toBe(100);
    expect(back.fish.find((f) => f.id === fish.id)).toMatchObject({ name: 'Mochi', bondPoints: 50, bondLevel: 2 });
  });

  it('cannot undo once the money is spent or the tank has filled up', () => {
    const fish = makeFish({ stage: 'adult', growth: 99999 });
    const state = makeState({ fish: [fish], overrides: { shells: 100 } });
    const sold = sellFish(state, fish.id);
    if (!sold.ok) throw new Error('should sell');
    const value = sold.state.shells - 100;
    expect(restoreSoldFish({ ...sold.state, shells: 0 }, fish, value)).toBeNull();
    const full = { ...sold.state, tanks: sold.state.tanks.map((t) => ({ ...t, capacity: 0 })) };
    expect(restoreSoldFish(full, fish, value)).toBeNull();
  });

  it('a sold decor piece goes back exactly where it was, for its refund', () => {
    const placed = { id: 'd1', decorId: 'rock' as const, x: 321, flipped: true, size: 'L' as const, z: 0.85 };
    const state = makeState({ tank: { decor: [placed] }, overrides: { shells: 50 } });
    const sold = sellDecor(state, 'tank-1', 'd1');
    if (!sold.ok) throw new Error('should sell');
    const refund = decorRefund('rock');
    const back = restoreSoldDecor(sold.state, 'tank-1', placed, refund)!;
    expect(back.shells).toBe(50);
    expect(back.tanks[0]!.decor).toEqual([placed]);
    expect(restoreSoldDecor({ ...sold.state, shells: 0 }, 'tank-1', placed, refund)).toBeNull();
  });
});
