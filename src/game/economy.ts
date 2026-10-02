// Shop purchases, selling, feeding XP, and the daily gift. Pure: (state, ...) → result.
import {
  BREAK_XP_COOLDOWN_MS,
  CAPACITY_UPGRADE,
  DAILY_GIFT,
  DECOR,
  DECOR_EDGE_MARGIN,
  DECOR_PLACEMENT_TRIES,
  DECOR_SELL_FRACTION,
  FEED_XP_MAX_PER_HOUR,
  HOUR_MS,
  JUVENILE_SELL_FRACTION,
  MAX_DECOR_PER_TANK,
  NEW_TANK_CAPACITY,
  PREMIUM_FOOD_PACK,
  TANK_NAME_MAX_LENGTH,
  TANK_PURCHASES,
  TANK_WIDTH,
  THEMES,
  UNLOCK_LEVEL,
  XP,
} from './constants';
import { grantXp } from './levels';
import { createFish, createTank, tankOccupancy } from './sim';
import { SPECIES } from './species';
import type { DecorId, Fish, GameState, Price, Rng, SpeciesId, Tank, ThemeId } from './types';

export type PurchaseError =
  | 'locked'
  | 'cost'
  | 'full'
  | 'theme'
  | 'max'
  | 'owned'
  | 'notFound'
  | 'notSellable'
  | 'claimed';

export type Result = { ok: true; state: GameState; levelsGained: number[] } | { ok: false; reason: PurchaseError };

const ok = (state: GameState, levelsGained: number[] = []): Result => ({ ok: true, state, levelsGained });
const fail = (reason: PurchaseError): Result => ({ ok: false, reason });

function newId(prefix: string, now: number, rng: Rng): string {
  return `${prefix}-${now.toString(36)}-${Math.floor(rng() * 36 ** 6).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

export function canAfford(state: GameState, price: Price): boolean {
  return (price.currency === 'shells' ? state.shells : state.pearls) >= price.amount;
}

function pay(state: GameState, price: Price): GameState {
  return price.currency === 'shells' ? { ...state, shells: state.shells - price.amount } : { ...state, pearls: state.pearls - price.amount };
}

function earn(state: GameState, price: Price): GameState {
  return pay(state, { ...price, amount: -price.amount });
}

function activeTank(state: GameState): Tank | undefined {
  return state.tanks.find((t) => t.id === state.activeTankId);
}

function mapTank(state: GameState, tankId: string, fn: (t: Tank) => Tank): GameState {
  return { ...state, tanks: state.tanks.map((t) => (t.id === tankId ? fn(t) : t)) };
}

// ---------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------

/** Why a species can't be bought into the active tank right now (null = it can). */
export function checkBuyFish(state: GameState, speciesId: SpeciesId): PurchaseError | null {
  const species = SPECIES[speciesId];
  const tank = activeTank(state);
  if (!tank) return 'notFound';
  if (state.level < species.unlockLevel) return 'locked';
  if (species.themeOnly && tank.theme !== species.themeOnly) return 'theme';
  if (tankOccupancy(state, tank.id) >= tank.capacity) return 'full';
  if (!canAfford(state, species.cost)) return 'cost';
  return null;
}

/** Buys a baby of `speciesId` into the active tank (+5 XP). */
export function buyFish(state: GameState, speciesId: SpeciesId, now: number, rng: Rng): Result {
  const error = checkBuyFish(state, speciesId);
  if (error) return fail(error);
  const fish = createFish(speciesId, state.activeTankId, now, rng, {
    id: newId('fish', now, rng),
    takenNames: state.fish.map((f) => f.name),
  });
  const paid = pay(state, SPECIES[speciesId].cost);
  const { state: next, levelsGained } = grantXp({ ...paid, fish: [...paid.fish, fish] }, XP.fishBought);
  return ok(next, levelsGained);
}

/** Shells a fish sells for: full price as an adult, 40% as a juvenile, null for babies. */
export function sellValue(fish: Fish): number | null {
  const price = SPECIES[fish.speciesId].sellPrice;
  if (fish.stage === 'adult') return price;
  if (fish.stage === 'juvenile') return Math.round(price * JUVENILE_SELL_FRACTION);
  return null;
}

export function sellFish(state: GameState, fishId: string): Result {
  const fish = state.fish.find((f) => f.id === fishId);
  if (!fish) return fail('notFound');
  const value = sellValue(fish);
  if (value === null) return fail('notSellable');
  return ok({ ...state, shells: state.shells + value, fish: state.fish.filter((f) => f.id !== fishId) });
}

// ---------------------------------------------------------------------------
// Food
// ---------------------------------------------------------------------------

export function checkBuyPremiumFood(state: GameState): PurchaseError | null {
  if (state.level < UNLOCK_LEVEL.premiumFood) return 'locked';
  if (!canAfford(state, PREMIUM_FOOD_PACK.price)) return 'cost';
  return null;
}

export function buyPremiumFood(state: GameState): Result {
  const error = checkBuyPremiumFood(state);
  if (error) return fail(error);
  const paid = pay(state, PREMIUM_FOOD_PACK.price);
  return ok({ ...paid, inventory: { ...paid.inventory, premiumFood: paid.inventory.premiumFood + PREMIUM_FOOD_PACK.count } });
}

/**
 * XP for a pellet eaten, respecting the hourly cap. Returns the XP to grant and the updated window.
 * The window restarts an hour after it began.
 */
export function feedingXp(state: GameState, now: number): { xp: number; feedXp: GameState['feedXp'] } {
  const window = now - state.feedXp.windowStart >= HOUR_MS ? { windowStart: now, earned: 0 } : state.feedXp;
  const xp = Math.max(0, Math.min(XP.pelletEaten, FEED_XP_MAX_PER_HOUR - window.earned));
  return { xp, feedXp: { ...window, earned: window.earned + xp } };
}

// ---------------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------------

export function checkBuyDecor(state: GameState, decorId: DecorId): PurchaseError | null {
  const decor = DECOR[decorId];
  const tank = activeTank(state);
  if (!tank) return 'notFound';
  if (state.level < Math.max(UNLOCK_LEVEL.decorShop, decor.unlockLevel)) return 'locked';
  if (tank.decor.length >= MAX_DECOR_PER_TANK) return 'max';
  if (!canAfford(state, decor.cost)) return 'cost';
  return null;
}

/** Picks a spot on the sand that is as far as possible from existing decor. */
export function pickDecorX(tank: Tank, rng: Rng): number {
  let best = TANK_WIDTH / 2;
  let bestGap = -1;
  for (let i = 0; i < DECOR_PLACEMENT_TRIES; i++) {
    const x = DECOR_EDGE_MARGIN + rng() * (TANK_WIDTH - 2 * DECOR_EDGE_MARGIN);
    const gap = tank.decor.length === 0 ? Infinity : Math.min(...tank.decor.map((d) => Math.abs(d.x - x)));
    if (gap > bestGap) {
      best = x;
      bestGap = gap;
    }
  }
  return best;
}

export function buyDecor(state: GameState, decorId: DecorId, now: number, rng: Rng): Result {
  const error = checkBuyDecor(state, decorId);
  if (error) return fail(error);
  const tank = activeTank(state)!;
  const placed = { id: newId('decor', now, rng), decorId, x: pickDecorX(tank, rng) };
  return ok(mapTank(pay(state, DECOR[decorId].cost), tank.id, (t) => ({ ...t, decor: [...t.decor, placed] })));
}

/** Sells placed decor back for 50% (rounded down) in its original currency. */
export function decorRefund(decorId: DecorId): Price {
  const cost = DECOR[decorId].cost;
  return { currency: cost.currency, amount: Math.floor(cost.amount * DECOR_SELL_FRACTION) };
}

export function sellDecor(state: GameState, tankId: string, placedId: string): Result {
  const tank = state.tanks.find((t) => t.id === tankId);
  const placed = tank?.decor.find((d) => d.id === placedId);
  if (!tank || !placed) return fail('notFound');
  const next = mapTank(state, tankId, (t) => ({ ...t, decor: t.decor.filter((d) => d.id !== placedId) }));
  return ok(earn(next, decorRefund(placed.decorId)));
}

// ---------------------------------------------------------------------------
// Tanks & themes
// ---------------------------------------------------------------------------

export function capacityUpgradesBought(tank: Tank): number {
  return Math.max(0, Math.round((tank.capacity - NEW_TANK_CAPACITY) / CAPACITY_UPGRADE.slots));
}

/** Cost of the next capacity upgrade for a tank, or null when maxed (3 per tank). */
export function capacityUpgradeCost(tank: Tank): Price | null {
  const bought = capacityUpgradesBought(tank);
  if (bought >= CAPACITY_UPGRADE.maxPurchases) return null;
  return { currency: 'shells', amount: CAPACITY_UPGRADE.baseCost * CAPACITY_UPGRADE.costMultiplier ** bought };
}

export function checkCapacityUpgrade(state: GameState): PurchaseError | null {
  const tank = activeTank(state);
  if (!tank) return 'notFound';
  if (state.level < UNLOCK_LEVEL.capacityUpgrade) return 'locked';
  const cost = capacityUpgradeCost(tank);
  if (!cost) return 'max';
  if (!canAfford(state, cost)) return 'cost';
  return null;
}

export function buyCapacityUpgrade(state: GameState): Result {
  const error = checkCapacityUpgrade(state);
  if (error) return fail(error);
  const tank = activeTank(state)!;
  const paid = pay(state, capacityUpgradeCost(tank)!);
  return ok(mapTank(paid, tank.id, (t) => ({ ...t, capacity: t.capacity + CAPACITY_UPGRADE.slots })));
}

/** The next tank available to buy (second, then third), or null if all are owned. */
export function nextTankPurchase(state: GameState): (typeof TANK_PURCHASES)[number] | null {
  return TANK_PURCHASES[state.tanks.length - 1] ?? null;
}

export function checkBuyTank(state: GameState): PurchaseError | null {
  const next = nextTankPurchase(state);
  if (!next) return 'max';
  if (state.level < next.unlockLevel) return 'locked';
  if (!canAfford(state, next.price)) return 'cost';
  return null;
}

/** Buys the next tank and switches to it. */
export function buyTank(state: GameState, now: number, rng: Rng): Result {
  const error = checkBuyTank(state);
  if (error) return fail(error);
  const tank = createTank(newId('tank', now, rng), `Tank ${state.tanks.length + 1}`);
  const paid = pay(state, nextTankPurchase(state)!.price);
  return ok({ ...paid, tanks: [...paid.tanks, tank], activeTankId: tank.id });
}

export function checkBuyTheme(state: GameState, themeId: ThemeId): PurchaseError | null {
  const theme = THEMES[themeId];
  if (state.ownedThemes.includes(themeId) || !theme.price) return 'owned';
  if (state.level < theme.unlockLevel) return 'locked';
  if (!canAfford(state, theme.price)) return 'cost';
  return null;
}

export function buyTheme(state: GameState, themeId: ThemeId): Result {
  const error = checkBuyTheme(state, themeId);
  if (error) return fail(error);
  return ok({ ...pay(state, THEMES[themeId].price!), ownedThemes: [...state.ownedThemes, themeId] });
}

/** Applies an owned theme to a tank. Fails if a theme-only fish in the tank needs a different theme. */
export function applyTheme(state: GameState, tankId: string, themeId: ThemeId): Result {
  const tank = state.tanks.find((t) => t.id === tankId);
  if (!tank) return fail('notFound');
  if (!state.ownedThemes.includes(themeId)) return fail('locked');
  const blocked = state.fish.some((f) => {
    if (f.tankId !== tankId) return false;
    const need = SPECIES[f.speciesId].themeOnly;
    return need !== null && need !== themeId;
  });
  if (blocked) return fail('theme');
  return ok(mapTank(state, tankId, (t) => ({ ...t, theme: themeId })));
}

// ---------------------------------------------------------------------------
// Daily gift
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' in the player's local time zone. */
export function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dailyGiftAvailable(state: GameState, today: string): boolean {
  return state.lastDailyGift !== today;
}

export interface DailyGiftContents {
  shells: number;
  premiumFood: number;
  pearls: number;
}

/** Opens today's gift: 20 shells + 3 premium food, 15% chance of +1 pearl, +5 XP. No streaks. */
export function claimDailyGift(state: GameState, today: string, rng: Rng): Result & { gift?: DailyGiftContents } {
  if (!dailyGiftAvailable(state, today)) return fail('claimed');
  const pearls = rng() < DAILY_GIFT.pearlChance ? DAILY_GIFT.pearls : 0;
  const gift: DailyGiftContents = { shells: DAILY_GIFT.shells, premiumFood: DAILY_GIFT.premiumFood, pearls };
  const opened: GameState = {
    ...state,
    shells: state.shells + gift.shells,
    pearls: state.pearls + gift.pearls,
    inventory: { ...state.inventory, premiumFood: state.inventory.premiumFood + gift.premiumFood },
    lastDailyGift: today,
  };
  const { state: next, levelsGained } = grantXp(opened, XP.dailyGift);
  return { ...ok(next, levelsGained), gift };
}

// ---------------------------------------------------------------------------
// Placement & moving between tanks
// ---------------------------------------------------------------------------

/** Clamp a decor x onto the sand, away from the glass. */
export function clampDecorX(x: number): number {
  return Math.min(TANK_WIDTH - DECOR_EDGE_MARGIN, Math.max(DECOR_EDGE_MARGIN, x));
}

/** Slides placed decor horizontally along the sand. */
export function moveDecor(state: GameState, tankId: string, placedId: string, x: number): Result {
  const tank = state.tanks.find((t) => t.id === tankId);
  if (!tank?.decor.some((d) => d.id === placedId)) return fail('notFound');
  return ok(mapTank(state, tankId, (t) => ({ ...t, decor: t.decor.map((d) => (d.id === placedId ? { ...d, x: clampDecorX(x) } : d)) })));
}

/** Why a fish can't move to `tankId` (null = it can): target must exist, have room, and suit theme-only species. */
export function checkMoveFish(state: GameState, fishId: string, tankId: string): PurchaseError | null {
  const fish = state.fish.find((f) => f.id === fishId);
  const tank = state.tanks.find((t) => t.id === tankId);
  if (!fish || !tank || fish.tankId === tankId) return 'notFound';
  const need = SPECIES[fish.speciesId].themeOnly;
  if (need && tank.theme !== need) return 'theme';
  if (tankOccupancy(state, tankId) >= tank.capacity) return 'full';
  return null;
}

export function moveFish(state: GameState, fishId: string, tankId: string): Result {
  const error = checkMoveFish(state, fishId, tankId);
  if (error) return fail(error);
  return ok({ ...state, fish: state.fish.map((f) => (f.id === fishId ? { ...f, tankId } : f)) });
}

export function renameTank(state: GameState, tankId: string, name: string): Result {
  const trimmed = name.trim().slice(0, TANK_NAME_MAX_LENGTH);
  if (!trimmed || !state.tanks.some((t) => t.id === tankId)) return fail('notFound');
  return ok(mapTank(state, tankId, (t) => ({ ...t, name: trimmed })));
}

// ---------------------------------------------------------------------------
// Break Mode
// ---------------------------------------------------------------------------

/** True if finishing a break now would grant XP (at most once per hour). */
export function breakXpAvailable(state: GameState, now: number): boolean {
  return state.lastBreakXpAt === null || now - state.lastBreakXpAt >= BREAK_XP_COOLDOWN_MS;
}

/** Completing a break: +10 XP once per hour (otherwise just a nice break). */
export function completeBreak(state: GameState, now: number): Result & { xp: number } {
  if (!breakXpAvailable(state, now)) return { ...ok(state), xp: 0 };
  const { state: next, levelsGained } = grantXp({ ...state, lastBreakXpAt: now }, XP.breakComplete);
  return { ...ok(next, levelsGained), xp: XP.breakComplete };
}
