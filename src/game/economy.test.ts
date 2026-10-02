import { describe, expect, it } from 'vitest';
import { FEED_XP_MAX_PER_HOUR, HOUR_MS, MAX_DECOR_PER_TANK, NEW_TANK_CAPACITY, XP } from './constants';
import {
  applyTheme,
  buyCapacityUpgrade,
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
  pickDecorX,
  renameTank,
  sellDecor,
  sellFish,
  sellValue,
  type Result,
} from './economy';
import { happinessTarget } from './sim';
import { SPECIES } from './species';
import { constRng, makeFish, makeState, makeTank, seededRng, T0 } from './testUtils';
import type { GameState } from './types';

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

  it('is locked below the unlock level', () => {
    const state = makeState({ overrides: { shells: 1000, level: 2 } });
    expect(checkBuyFish(state, 'goldfish')).toBe('locked');
    expect(checkBuyFish({ ...state, level: 3 }, 'goldfish')).toBeNull();
  });

  it('needs enough currency', () => {
    expect(reason(buyFish(makeState({ overrides: { shells: 9 } }), 'danio', T0, seededRng(1)))).toBe('cost');
  });

  it('checks capacity, counting eggs', () => {
    const full = rich();
    full.fish = Array.from({ length: 5 }, () => makeFish());
    expect(checkBuyFish(full, 'danio')).toBeNull();
    full.eggs = [{ id: 'e', speciesId: 'danio', variant: 'zebra', shiny: false, tankId: 'tank-1', hatchAt: T0 + HOUR_MS }];
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
  it('unlocks at L3 (castle L6, chest L9, shipwreck L13)', () => {
    expect(reason(buyDecor(rich({ level: 2 }), 'rock', T0, seededRng(1)))).toBe('locked');
    expect(reason(buyDecor(rich({ level: 5 }), 'castle', T0, seededRng(1)))).toBe('locked');
    expect(reason(buyDecor(rich({ level: 6 }), 'castle', T0, seededRng(1)))).toBe('ok');
    expect(reason(buyDecor(rich({ level: 12 }), 'shipwreck', T0, seededRng(1)))).toBe('locked');
  });

  it('places the item on the active tank and charges for it', () => {
    const next = okState(buyDecor(makeState({ overrides: { shells: 100, level: 3 } }), 'plant_tall', T0, seededRng(1)));
    expect(next.shells).toBe(65);
    expect(next.tanks[0]!.decor).toHaveLength(1);
    expect(next.tanks[0]!.decor[0]!.decorId).toBe('plant_tall');
  });

  it('caps at 8 per tank', () => {
    let state = rich();
    for (let i = 0; i < MAX_DECOR_PER_TANK; i++) state = okState(buyDecor(state, 'rock', T0 + i, seededRng(i)));
    expect(reason(buyDecor(state, 'rock', T0, seededRng(99)))).toBe('max');
  });

  it('spreads new decor away from existing items', () => {
    const tank = makeTank({ decor: [{ id: 'a', decorId: 'rock', x: 500 }] });
    const x = pickDecorX(tank, seededRng(3));
    expect(Math.abs(x - 500)).toBeGreaterThan(150);
  });

  it('sells back for 50% in the original currency', () => {
    expect(decorRefund('plant_tall')).toEqual({ currency: 'shells', amount: 17 });
    expect(decorRefund('shipwreck')).toEqual({ currency: 'pearls', amount: 3 });
    const state = rich({ shells: 0 });
    state.tanks = [makeTank({ decor: [{ id: 'd1', decorId: 'castle', x: 300 }] })];
    const next = okState(sellDecor(state, 'tank-1', 'd1'));
    expect(next.shells).toBe(75);
    expect(next.tanks[0]!.decor).toHaveLength(0);
  });
});

describe('tank capacity upgrade', () => {
  it('unlocks at L7: +2 slots, 200 shells, doubling, max 3', () => {
    expect(reason(buyCapacityUpgrade(rich({ level: 6 })))).toBe('locked');
    let state = rich({ level: 7, shells: 10_000 });
    const costs: number[] = [];
    for (let i = 0; i < 3; i++) {
      costs.push(capacityUpgradeCost(state.tanks[0]!)!.amount);
      state = okState(buyCapacityUpgrade(state));
    }
    expect(costs).toEqual([200, 400, 800]);
    expect(state.tanks[0]!.capacity).toBe(NEW_TANK_CAPACITY + 6);
    expect(state.shells).toBe(10_000 - 1400);
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
    expect(state.tanks[1]).toMatchObject({ capacity: NEW_TANK_CAPACITY, theme: 'classic', cleanliness: 100 });
    expect(reason(buyTank(state, T0, seededRng(2)))).toBe('locked');
    state = okState(buyTank({ ...state, level: 14 }, T0 + 1, seededRng(2)));
    expect(state.tanks).toHaveLength(3);
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
    state.tanks = [makeTank({ decor: [{ id: 'd1', decorId: 'rock', x: 300 }] })];
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

  it('refuses a full target tank (eggs count)', () => {
    const fish = makeFish();
    const s = { ...twoTanks({ capacity2: 1 }), fish: [fish], eggs: [{ id: 'e', speciesId: 'danio' as const, variant: 'zebra', shiny: false, tankId: 'tank-2', hatchAt: T0 + HOUR_MS }] };
    expect(reason(moveFish(s, fish.id, 'tank-2'))).toBe('full');
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
