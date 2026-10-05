// Shop purchases, selling, feeding XP, and the daily gift. Pure: (state, ...) → result.
import { decorAvailable, maxDecor, newPlaced } from './decor';
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
  LAYOUT_PRESET_SLOTS,
  STYLE_OPTIONS,
  BREEDING,
  TANK_BASE_CAPACITY,
  PREMIUM_FOOD_PACK,
  TANK_NAME_MAX_LENGTH,
  TANK_PURCHASES,
  TANK_WIDTH,
  THEMES,
  UNLOCK_LEVEL,
  XP,
} from './constants';
import { isCourting } from './breeding';
import { grantXp } from './levels';
import { createFish, createTank, tankOccupancy } from './sim';
import { SPECIES } from './species';
import type { DecorId, Fish, GameState, PlacedDecor, Price, Rng, SpeciesId, StyleCategory, Tank, ThemeId } from './types';

export type PurchaseError =
  | 'locked'
  | 'cost'
  | 'full'
  | 'theme'
  | 'max'
  | 'owned'
  | 'notFound'
  | 'notSellable'
  | 'claimed'
  | 'courting'
  | 'event';

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
  if (isCourting(state, fishId)) return fail('courting');
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

/** Why `decorId` can't be bought right now (at wall time `now`), or null. No level gates. */
export function checkBuyDecor(state: GameState, decorId: DecorId, now: number): PurchaseError | null {
  const decor = DECOR[decorId];
  const tank = activeTank(state);
  if (!tank) return 'notFound';
  if (!decorAvailable(decorId, new Date(now))) return 'event';
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

/** Buys decor: it's placed in the active tank if there's room, otherwise it goes to the decor box. */
export function buyDecor(state: GameState, decorId: DecorId, now: number, rng: Rng): Result & { boxed?: boolean } {
  const error = checkBuyDecor(state, decorId, now);
  if (error) return fail(error);
  const tank = activeTank(state)!;
  const paid = pay(state, DECOR[decorId].cost);
  if (tank.decor.length >= maxDecor(tank)) return { ...ok(addToBox(paid, decorId, 1)), boxed: true };
  const placed = newPlaced(newId('decor', now, rng), decorId, pickDecorX(tank, rng));
  return ok(mapTank(paid, tank.id, (t) => ({ ...t, decor: [...t.decor, placed] })));
}

/** "Try it" → Buy & Place: buys decor and places it at `x` with the previewed look (needs room). */
export function buyAndPlaceDecor(state: GameState, decorId: DecorId, x: number, look: Pick<PlacedDecor, 'flipped' | 'size' | 'depth'>, now: number, rng: Rng): Result {
  const error = checkBuyDecor(state, decorId, now);
  if (error) return fail(error);
  const tank = activeTank(state)!;
  if (tank.decor.length >= maxDecor(tank)) return fail('full');
  const placed = { ...newPlaced(newId('decor', now, rng), decorId, clampDecorX(x)), ...look };
  return ok(mapTank(pay(state, DECOR[decorId].cost), tank.id, (t) => ({ ...t, decor: [...t.decor, placed] })));
}

function addToBox(state: GameState, decorId: DecorId, n: number): GameState {
  const count = (state.decorInventory[decorId] ?? 0) + n;
  const decorInventory = { ...state.decorInventory };
  if (count > 0) decorInventory[decorId] = count;
  else delete decorInventory[decorId];
  return { ...state, decorInventory };
}

/** Places one item from the decor box into a tank at `x`. */
export function placeFromBox(state: GameState, tankId: string, decorId: DecorId, x: number, now: number, rng: Rng): Result {
  const tank = state.tanks.find((t) => t.id === tankId);
  if (!tank) return fail('notFound');
  if ((state.decorInventory[decorId] ?? 0) <= 0) return fail('notFound');
  if (tank.decor.length >= maxDecor(tank)) return fail('full');
  const placed = newPlaced(newId('decor', now, rng), decorId, clampDecorX(x));
  return ok(mapTank(addToBox(state, decorId, -1), tankId, (t) => ({ ...t, decor: [...t.decor, placed] })));
}

/** Puts a placed item back in the decor box. */
export function storeDecor(state: GameState, tankId: string, placedId: string): Result {
  const tank = state.tanks.find((t) => t.id === tankId);
  const placed = tank?.decor.find((d) => d.id === placedId);
  if (!tank || !placed) return fail('notFound');
  const next = mapTank(state, tankId, (t) => ({ ...t, decor: t.decor.filter((d) => d.id !== placedId) }));
  return ok(addToBox(next, placed.decorId, 1));
}

/** Changes a placed item's look: flip, size, or (sand items) back/front. */
export function updateDecor(state: GameState, tankId: string, placedId: string, change: Partial<Pick<PlacedDecor, 'flipped' | 'size' | 'depth'>>): Result {
  const tank = state.tanks.find((t) => t.id === tankId);
  if (!tank?.decor.some((d) => d.id === placedId)) return fail('notFound');
  return ok(mapTank(state, tankId, (t) => ({ ...t, decor: t.decor.map((d) => (d.id === placedId ? { ...d, ...change } : d)) })));
}

/** Sells one item from the decor box for 50%. */
export function sellBoxedDecor(state: GameState, decorId: DecorId): Result {
  if ((state.decorInventory[decorId] ?? 0) <= 0) return fail('notFound');
  return ok(earn(addToBox(state, decorId, -1), decorRefund(decorId)));
}

// ---------------------------------------------------------------------------
// Layout presets
// ---------------------------------------------------------------------------

/** Saves the tank's current decor layout into a slot (0..2). */
export function savePreset(state: GameState, tankId: string, slot: number, name: string): Result {
  const tank = state.tanks.find((t) => t.id === tankId);
  if (!tank || slot < 0 || slot >= LAYOUT_PRESET_SLOTS) return fail('notFound');
  const items = tank.decor.map(({ decorId, x, flipped, size, depth }) => ({ decorId, x, flipped, size, depth }));
  const layoutPresets = Array.from({ length: LAYOUT_PRESET_SLOTS }, (_, i) => (i === slot ? { name: name.trim() || `Layout ${slot + 1}`, items } : (tank.layoutPresets[i] ?? null)));
  return ok(mapTank(state, tankId, (t) => ({ ...t, layoutPresets })));
}

/**
 * Applies a saved layout: everything placed goes back to the decor box, then the layout's items are placed
 * from the box in order. Items no longer owned (or beyond the decor limit) are skipped and counted.
 */
export function applyPreset(state: GameState, tankId: string, slot: number, now: number, rng: Rng): Result & { skipped?: number } {
  const tank = state.tanks.find((t) => t.id === tankId);
  const preset = tank?.layoutPresets[slot];
  if (!tank || !preset) return fail('notFound');
  let next = state;
  for (const d of tank.decor) next = addToBox(next, d.decorId, 1);
  const decor: PlacedDecor[] = [];
  let skipped = 0;
  for (const item of preset.items) {
    if ((next.decorInventory[item.decorId] ?? 0) <= 0 || decor.length >= maxDecor(tank)) {
      skipped++;
      continue;
    }
    next = addToBox(next, item.decorId, -1);
    decor.push({ ...item, id: newId('decor', now + decor.length, rng) });
  }
  return { ...ok(mapTank(next, tankId, (t) => ({ ...t, decor }))), skipped };
}

// ---------------------------------------------------------------------------
// Tank styles
// ---------------------------------------------------------------------------

export function styleOption(optionId: string) {
  return STYLE_OPTIONS.find((o) => o.id === optionId) ?? null;
}

/** Free options and bought ones can be used on any tank. */
export function ownsStyle(state: GameState, optionId: string): boolean {
  const opt = styleOption(optionId);
  return opt !== null && (opt.price === null || state.ownedStyles.includes(optionId));
}

export function checkBuyStyle(state: GameState, optionId: string): PurchaseError | null {
  const opt = styleOption(optionId);
  if (!opt) return 'notFound';
  if (ownsStyle(state, optionId)) return 'owned';
  if (opt.price && !canAfford(state, opt.price)) return 'cost';
  return null;
}

/** Buys a style option and applies it to the tank. */
export function buyStyle(state: GameState, tankId: string, optionId: string): Result {
  const error = checkBuyStyle(state, optionId);
  if (error) return fail(error);
  const opt = styleOption(optionId)!;
  const bought = { ...pay(state, opt.price!), ownedStyles: [...state.ownedStyles, optionId] };
  return applyStyle(bought, tankId, optionId);
}

/** Uses an owned (or free) style option on a tank. */
export function applyStyle(state: GameState, tankId: string, optionId: string): Result {
  const opt = styleOption(optionId);
  if (!opt || !state.tanks.some((t) => t.id === tankId)) return fail('notFound');
  if (!ownsStyle(state, optionId)) return fail('locked');
  const category: StyleCategory = opt.category;
  return ok(mapTank(state, tankId, (t) => ({ ...t, style: { ...t.style, [category]: optionId } })));
}

/** Custom lighting color and the nameplate switch (both free). */
export function setTankStyleExtras(state: GameState, tankId: string, change: { lightingColor?: string; nameplate?: boolean }): Result {
  if (!state.tanks.some((t) => t.id === tankId)) return fail('notFound');
  return ok(mapTank(state, tankId, (t) => ({ ...t, style: { ...t.style, ...change } })));
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
  return tank.upgrades;
}

/** Starting capacity of the tank bought `index`-th (0 = the first tank). */
export function baseCapacity(index: number): number {
  return TANK_BASE_CAPACITY[Math.min(index, TANK_BASE_CAPACITY.length - 1)]!;
}

/** Cost of upgrade number `n` (0-based): 150 × 1.6ⁿ, rounded. */
export function upgradeCostAt(n: number): number {
  return Math.round(CAPACITY_UPGRADE.baseCost * CAPACITY_UPGRADE.costMultiplier ** n);
}

/** Cost of the next capacity upgrade for a tank, or null when maxed (5 per tank). */
export function capacityUpgradeCost(tank: Tank): Price | null {
  const bought = capacityUpgradesBought(tank);
  if (bought >= CAPACITY_UPGRADE.maxPurchases) return null;
  return { currency: 'shells', amount: upgradeCostAt(bought) };
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
  return ok(mapTank(paid, tank.id, (t) => ({ ...t, capacity: t.capacity + CAPACITY_UPGRADE.slots, upgrades: t.upgrades + 1 })));
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
  const tank = createTank(newId('tank', now, rng), `Tank ${state.tanks.length + 1}`, baseCapacity(state.tanks.length));
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
  if (isCourting(state, fishId)) return 'courting';
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

// ---------------------------------------------------------------------------
// Nursery (babies that hatched into a full tank nap here)
// ---------------------------------------------------------------------------

/** Why a Nursery baby can't move into `tankId` (null = it can): the tank needs room and the right theme. */
export function checkMoveFromNursery(state: GameState, babyId: string, tankId: string): PurchaseError | null {
  const baby = state.nursery.find((f) => f.id === babyId);
  const tank = state.tanks.find((t) => t.id === tankId);
  if (!baby || !tank) return 'notFound';
  const need = SPECIES[baby.speciesId].themeOnly;
  if (need && tank.theme !== need) return 'theme';
  if (tankOccupancy(state, tankId) >= tank.capacity) return 'full';
  return null;
}

/** Wakes a Nursery baby into a tank; it starts growing (and getting hungry) from now. */
export function moveFromNursery(state: GameState, babyId: string, tankId: string, now: number): Result {
  const error = checkMoveFromNursery(state, babyId, tankId);
  if (error) return fail(error);
  const baby = state.nursery.find((f) => f.id === babyId)!;
  return ok({
    ...state,
    nursery: state.nursery.filter((f) => f.id !== babyId),
    fish: [...state.fish, { ...baby, tankId, lastDropAt: now }],
  });
}

/** Shells for rehoming a Nursery baby: 20% of the adult price (the only time a baby can be sold). */
export function rehomeValue(baby: Fish): number {
  return Math.round(SPECIES[baby.speciesId].sellPrice * BREEDING.rehomeFraction);
}

export function rehomeNurseryBaby(state: GameState, babyId: string): Result {
  const baby = state.nursery.find((f) => f.id === babyId);
  if (!baby) return fail('notFound');
  return ok({ ...state, shells: state.shells + rehomeValue(baby), nursery: state.nursery.filter((f) => f.id !== babyId) });
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

// ---------------------------------------------------------------------------
// Collecting drops (the sand shells and pearls)
// ---------------------------------------------------------------------------

/** Picks up a drop from the sand: its value goes to shells or pearls. Null if there is no such drop. XP is the caller's. */
export function collectDrop(state: GameState, dropId: string): GameState | null {
  const tank = state.tanks.find((t) => t.shells.some((d) => d.id === dropId));
  const drop = tank?.shells.find((d) => d.id === dropId);
  if (!tank || !drop) return null;
  return {
    ...state,
    shells: drop.pearl ? state.shells : state.shells + drop.value,
    pearls: drop.pearl ? state.pearls + drop.value : state.pearls,
    tanks: state.tanks.map((t) => (t.id === tank.id ? { ...t, shells: t.shells.filter((d) => d.id !== dropId) } : t)),
  };
}
