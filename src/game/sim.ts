// Pure simulation. No DOM, no React. Deterministic given (state, dtMs, rng).
import { bondDropValue, newBond } from './bond';
import { decorHappiness } from './decor';
import {
  ALGAE_FLOOR_CLEANLINESS,
  ALGAE_WIPE_CLEANLINESS,
  AUTO_COLLECT_FRACTION_OFFLINE,
  AUTO_COLLECT_FRACTION_ONLINE,
  NURSERY_MAX,
  DEFAULT_TANK_STYLE,
  LAYOUT_PRESET_SLOTS,
  ADULT_AT_FRACTION,
  ALGAE_MAX_SIZE,
  ALGAE_MIN_SIZE,
  ALGAE_THRESHOLDS,
  BREEDING,
  BREEDING_QUEST_REWARD,
  CLEANLINESS_DECAY_PER_FISH_PER_MIN,
  CLEANLINESS_DECAY_PER_MIN,
  CLEANLINESS_MAX,
  CLEANLINESS_MIN,
  DROP_PEARL_CHANCE,
  DROP_SPACING_TRIES,
  FULL_HUNGER,
  GROWTH_HAPPINESS_BASE,
  GROWTH_HAPPINESS_DIVISOR,
  GROWTH_STOP_HUNGER,
  HAPPINESS_BASE_TARGET,
  HAPPINESS_CLEAN_BONUS,
  HAPPINESS_CLEAN_THRESHOLD,
  HAPPINESS_CROWDED_FRACTION,
  HAPPINESS_CROWDED_PENALTY,
  HAPPINESS_DIRTY_PENALTY,
  HAPPINESS_DIRTY_THRESHOLD,
  HAPPINESS_DRIFT_PER_MIN,
  HAPPINESS_FED_BONUS,
  HAPPINESS_FED_THRESHOLD,
  HAPPINESS_MAX,
  HAPPINESS_MIN,
  HAPPINESS_STARVING_PENALTY,
  HAPPINESS_STARVING_THRESHOLD,
  HUNGER_MAX,
  HUNGER_MIN,
  JUVENILE_AT_FRACTION,
  MAX_ALGAE_SPOTS,
  MAX_DROPS_PER_TANK,
  MINUTE_MS,
  NEW_FISH_HAPPINESS,
  NEW_FISH_HUNGER,
  OFFLINE_CAP_MS,
  OFFLINE_STEP_MS,
  PEARL_DROP_VALUE,
  PELLET_DISSOLVE_CLEANLINESS_PENALTY,
  PELLET_DISSOLVE_SECONDS,
  PELLET_HUNGER,
  PREMIUM_BOOST_MULTIPLIER,
  PREMIUM_BOOST_SECONDS,
  PREMIUM_PELLET_HUNGER,
  SAND_Y,
  SAVE_VERSION,
  SECOND_MS,
  SPONGE_RADIUS,
  STARTING,
  TANK_EDGE_MARGIN,
  TANK_WIDTH,
  XP,
} from './constants';
import { completeCourtships } from './breeding';
import { applyXp, levelUpReward } from './levels';
import { randomName } from './names';
import { getSpecies, randomVariantKey } from './species';
import type { AlgaeSpot, Egg, Fish, GameState, Rng, SpeciesId, Stage, Tank } from './types';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type SimEvent =
  | { type: 'drop'; tankId: string; fishId: string; dropId: string; value: number; pearl: boolean }
  | { type: 'autoCollect'; tankId: string; value: number; pearl: boolean }
  /** An egg is ready but the tank and the Nursery are full: it waits (emitted once per egg). */
  | { type: 'eggWaiting'; eggId: string; tankId: string }
  | { type: 'stageUp'; fishId: string; from: Stage; to: Stage }
  | { type: 'hatched'; fishId: string; tankId: string; shiny: boolean; eggId: string; destination: 'tank' | 'nursery' }
  | { type: 'eggLaid'; tankId: string; eggId: string; parentIds: [string, string]; shiny: boolean }
  | { type: 'questComplete'; shells: number; pearls: number }
  | { type: 'algaeSpawned'; tankId: string }
  | { type: 'pelletDissolved'; tankId: string }
  | { type: 'levelUp'; level: number; shells: number };

export interface TickResult {
  state: GameState;
  events: SimEvent[];
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

/** Generates ids unique within a tick (seq) and across ticks (time + rng). */
function idFactory(now: number, rng: Rng): (prefix: string) => string {
  let seq = 0;
  return (prefix) => {
    seq += 1;
    const salt = Math.floor(rng() * 36 ** 4).toString(36);
    return `${prefix}-${now.toString(36)}-${seq}-${salt}`;
  };
}

// ---------------------------------------------------------------------------
// Pure rule helpers (exported for tests and UI)
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function growthTotalSeconds(speciesId: SpeciesId): number {
  return getSpecies(speciesId).growMinutes * 60;
}

export function stageForGrowth(speciesId: SpeciesId, growth: number): Exclude<Stage, 'egg'> {
  const total = growthTotalSeconds(speciesId);
  if (growth >= total * ADULT_AT_FRACTION) return 'adult';
  if (growth >= total * JUVENILE_AT_FRACTION) return 'juvenile';
  return 'baby';
}

/** Hatched fish in a tank. Eggs (and Nursery babies) don't take up room. */
export function tankOccupancy(state: GameState, tankId: string): number {
  return state.fish.filter((f) => f.tankId === tankId).length;
}

export function happinessTarget(hunger: number, tank: Tank, occupancy: number): number {
  let target = HAPPINESS_BASE_TARGET;
  if (hunger >= HAPPINESS_FED_THRESHOLD) target += HAPPINESS_FED_BONUS;
  if (hunger < HAPPINESS_STARVING_THRESHOLD) target -= HAPPINESS_STARVING_PENALTY;
  if (tank.cleanliness >= HAPPINESS_CLEAN_THRESHOLD) target += HAPPINESS_CLEAN_BONUS;
  if (tank.cleanliness < HAPPINESS_DIRTY_THRESHOLD) target -= HAPPINESS_DIRTY_PENALTY;
  target += decorHappiness(tank);
  if (occupancy > tank.capacity * HAPPINESS_CROWDED_FRACTION) target -= HAPPINESS_CROWDED_PENALTY;
  return clamp(target, HAPPINESS_MIN, HAPPINESS_MAX);
}

/** Moves `current` toward `target` by at most HAPPINESS_DRIFT_PER_MIN per minute, without overshooting. */
export function driftHappiness(current: number, target: number, dtMs: number): number {
  const step = HAPPINESS_DRIFT_PER_MIN * (dtMs / MINUTE_MS);
  if (current < target) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

/** 0.5x at happiness 0 up to 1.5x at happiness 100. */
export function growthMultiplier(happiness: number): number {
  return GROWTH_HAPPINESS_BASE + happiness / GROWTH_HAPPINESS_DIVISOR;
}

export function cleanlinessDecayPerMin(fishCount: number): number {
  return CLEANLINESS_DECAY_PER_MIN + CLEANLINESS_DECAY_PER_FISH_PER_MIN * fishCount;
}

/** Number of algae thresholds crossed going from `before` down to `after`. */
export function thresholdsCrossed(before: number, after: number): number {
  return ALGAE_THRESHOLDS.filter((t) => before >= t && after < t).length;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

interface TickCtx {
  state: GameState;
  rng: Rng;
  now: number;
  dtMs: number;
  events: SimEvent[];
  newId: (prefix: string) => string;
  xpGained: number;
  /** Overflow drops are auto-collected at this fraction of their value (online 0.5, offline 0). */
  autoCollect: number;
}

export interface TickOptions {
  /** Offline catch-up: overflow drops are lost instead of half-collected. */
  offline?: boolean;
}

function spawnAlgae(ctx: TickCtx, tank: Tank, size: number): void {
  if (tank.algaeSpots.length >= MAX_ALGAE_SPOTS) return;
  const { rng } = ctx;
  tank.algaeSpots.push({
    id: ctx.newId('algae'),
    x: TANK_EDGE_MARGIN + rng() * (TANK_WIDTH - 2 * TANK_EDGE_MARGIN),
    y: TANK_EDGE_MARGIN + rng() * (SAND_Y - size - 2 * TANK_EDGE_MARGIN),
    size,
  });
  ctx.events.push({ type: 'algaeSpawned', tankId: tank.id });
}

function randomAlgaeSize(rng: Rng): number {
  return ALGAE_MIN_SIZE + rng() * (ALGAE_MAX_SIZE - ALGAE_MIN_SIZE);
}

/** Pellets sink, land on the sand, and dissolve after sitting there. */
function updatePellets(ctx: TickCtx, tank: Tank): void {
  const dtSec = ctx.dtMs / SECOND_MS;
  const dissolveMs = PELLET_DISSOLVE_SECONDS * SECOND_MS;
  const remaining = [];
  for (const pellet of tank.pellets) {
    if (pellet.landedAt === null) {
      pellet.y += pellet.vy * dtSec;
      if (pellet.y >= SAND_Y) {
        // Interpolate the landing moment within this tick.
        const overshootSec = pellet.vy > 0 ? (pellet.y - SAND_Y) / pellet.vy : 0;
        pellet.y = SAND_Y;
        pellet.vy = 0;
        pellet.landedAt = ctx.now - overshootSec * SECOND_MS;
      }
    }
    if (pellet.landedAt !== null && ctx.now - pellet.landedAt >= dissolveMs) {
      tank.cleanliness = Math.max(CLEANLINESS_MIN, tank.cleanliness - PELLET_DISSOLVE_CLEANLINESS_PENALTY);
      ctx.events.push({ type: 'pelletDissolved', tankId: tank.id });
      spawnAlgae(ctx, tank, ALGAE_MIN_SIZE);
      continue;
    }
    remaining.push(pellet);
  }
  tank.pellets = remaining;
}

function updateCleanliness(ctx: TickCtx, tank: Tank, cleanlinessBefore: number): void {
  const fishCount = ctx.state.fish.filter((f) => f.tankId === tank.id).length;
  const decay = cleanlinessDecayPerMin(fishCount) * (ctx.dtMs / MINUTE_MS);
  tank.cleanliness = clamp(tank.cleanliness - decay, CLEANLINESS_MIN, CLEANLINESS_MAX);
  const crossed = thresholdsCrossed(cleanlinessBefore, tank.cleanliness);
  for (let i = 0; i < crossed; i++) spawnAlgae(ctx, tank, randomAlgaeSize(ctx.rng));
  // A dirty tank always has algae to wipe (otherwise it could sit at 0% with nothing to clean):
  // top up toward algaeNeeded(), at most one spot per sim minute.
  if (tank.algaeSpots.length < algaeNeeded(tank.cleanliness) && ctx.rng() < Math.min(1, ctx.dtMs / MINUTE_MS)) {
    spawnAlgae(ctx, tank, randomAlgaeSize(ctx.rng));
  }
}

/** Algae spots a tank should have so wiping them all brings it back to ALGAE_FLOOR_CLEANLINESS. */
export function algaeNeeded(cleanliness: number): number {
  if (cleanliness >= ALGAE_FLOOR_CLEANLINESS) return 0;
  return Math.min(MAX_ALGAE_SPOTS, Math.ceil((ALGAE_FLOOR_CLEANLINESS - cleanliness) / ALGAE_WIPE_CLEANLINESS));
}

function addDrop(ctx: TickCtx, tank: Tank, fish: Fish): void {
  const species = getSpecies(fish.speciesId);
  const pearl = ctx.rng() < DROP_PEARL_CHANCE;
  const value = pearl ? PEARL_DROP_VALUE : bondDropValue(fish, species.dropValue);
  const dropId = ctx.newId('drop');
  // Pick the roomiest of a few random spots so shells land apart from each other.
  let x = TANK_EDGE_MARGIN + ctx.rng() * (TANK_WIDTH - 2 * TANK_EDGE_MARGIN);
  let gap = Math.min(Infinity, ...tank.shells.map((d) => Math.abs(d.x - x)));
  for (let i = 1; i < DROP_SPACING_TRIES; i++) {
    const candidate = TANK_EDGE_MARGIN + ctx.rng() * (TANK_WIDTH - 2 * TANK_EDGE_MARGIN);
    const g = Math.min(Infinity, ...tank.shells.map((d) => Math.abs(d.x - candidate)));
    if (g > gap) {
      x = candidate;
      gap = g;
    }
  }
  tank.shells.push({ id: dropId, x, value, pearl });
  ctx.events.push({ type: 'drop', tankId: tank.id, fishId: fish.id, dropId, value, pearl });

  // Over the cap: the oldest drop leaves the sand, auto-collected at a fraction of its value (none offline).
  while (tank.shells.length > MAX_DROPS_PER_TANK) {
    const oldest = tank.shells.shift()!;
    const paid = Math.floor(oldest.value * ctx.autoCollect);
    if (oldest.pearl) ctx.state.pearls += paid;
    else ctx.state.shells += paid;
    ctx.events.push({ type: 'autoCollect', tankId: tank.id, value: paid, pearl: oldest.pearl });
  }
}

function updateFish(ctx: TickCtx, fish: Fish, tank: Tank, occupancy: number): void {
  const species = getSpecies(fish.speciesId);
  const dtMin = ctx.dtMs / MINUTE_MS;
  const tickStart = ctx.now - ctx.dtMs;

  // Hunger
  fish.hunger = clamp(fish.hunger - species.hungerRate * dtMin, HUNGER_MIN, HUNGER_MAX);

  // Happiness drifts toward its target
  fish.happiness = clamp(
    driftHappiness(fish.happiness, happinessTarget(fish.hunger, tank, occupancy), ctx.dtMs),
    HAPPINESS_MIN,
    HAPPINESS_MAX,
  );

  // Growth (stops completely when starving)
  const total = growthTotalSeconds(fish.speciesId);
  if (fish.hunger >= GROWTH_STOP_HUNGER && fish.growth < total) {
    const dtSec = ctx.dtMs / SECOND_MS;
    const boostedMs = fish.boostUntil === null ? 0 : clamp(fish.boostUntil - tickStart, 0, ctx.dtMs);
    const effectiveSec = dtSec + (boostedMs / SECOND_MS) * (PREMIUM_BOOST_MULTIPLIER - 1);
    fish.growth = Math.min(total, fish.growth + effectiveSec * growthMultiplier(fish.happiness));
  }
  if (fish.boostUntil !== null && fish.boostUntil <= ctx.now) fish.boostUntil = null;

  // Stage transitions
  const nextStage = stageForGrowth(fish.speciesId, fish.growth);
  if (nextStage !== fish.stage) {
    ctx.events.push({ type: 'stageUp', fishId: fish.id, from: fish.stage, to: nextStage });
    if (nextStage === 'adult') {
      ctx.xpGained += XP.fishAdult;
      fish.lastDropAt = ctx.now; // drop timer starts at adulthood
    }
    fish.stage = nextStage;
    return;
  }

  // Shell drops (adults only)
  if (fish.stage === 'adult') {
    const dropMs = species.dropMinutes * MINUTE_MS;
    while (ctx.now - fish.lastDropAt >= dropMs) {
      fish.lastDropAt += dropMs;
      addDrop(ctx, tank, fish);
    }
  }
}

function hatchEggs(ctx: TickCtx): void {
  const { state } = ctx;
  const remaining: Egg[] = [];
  for (const egg of state.eggs) {
    if (egg.hatchAt > ctx.now) {
      remaining.push(egg);
      continue;
    }
    const tank = state.tanks.find((t) => t.id === egg.tankId);
    // A full tank never blocks a hatch: the baby naps in the Nursery until there's room. Only when the
    // Nursery is full too does the egg wait (unhatched, never lost).
    const roomy = tank !== undefined && tankOccupancy(state, tank.id) < tank.capacity;
    if (!roomy && state.nursery.length >= NURSERY_MAX) {
      if (!egg.waiting) {
        egg.waiting = true;
        ctx.events.push({ type: 'eggWaiting', eggId: egg.id, tankId: egg.tankId });
      }
      remaining.push(egg);
      continue;
    }
    const fish = createFish(egg.speciesId, roomy ? egg.tankId : '', egg.hatchAt, ctx.rng, {
      id: ctx.newId('fish'),
      variant: egg.variant,
      shiny: egg.shiny,
      bondPoints: egg.startBond,
      takenNames: [...state.fish, ...state.nursery].map((f) => f.name),
    });
    if (roomy) state.fish.push(fish);
    else state.nursery.push(fish);
    state.stats.hatched += 1;
    ctx.xpGained += XP.eggHatched;
    if (egg.shiny) state.pearls += BREEDING.shinyHatchPearls;
    ctx.events.push({ type: 'hatched', fishId: fish.id, tankId: egg.tankId, shiny: egg.shiny, eggId: egg.id, destination: roomy ? 'tank' : 'nursery' });
    // "Your first baby" quest: paid once, on the first hatch while it's running.
    if (state.breedingQuest.status === 'active') {
      state.breedingQuest = { ...state.breedingQuest, status: 'done' };
      state.shells += BREEDING_QUEST_REWARD.shells;
      state.pearls += BREEDING_QUEST_REWARD.pearls;
      ctx.events.push({ type: 'questComplete', shells: BREEDING_QUEST_REWARD.shells, pearls: BREEDING_QUEST_REWARD.pearls });
    }
  }
  state.eggs = remaining;
}

function applyXpGain(ctx: TickCtx): void {
  if (ctx.xpGained <= 0) return;
  const { state } = ctx;
  const result = applyXp(state.level, state.xp, ctx.xpGained);
  state.level = result.level;
  state.xp = result.xp;
  state.shells += result.shellsAwarded;
  for (const level of result.levelsGained) {
    ctx.events.push({ type: 'levelUp', level, shells: levelUpReward(level) });
  }
}

/**
 * Advances the simulation by `dtMs`. Returns a new state (the input is not mutated)
 * plus the events that happened, for toasts, sounds, and summaries.
 */
export function tick(state: GameState, dtMs: number, rng: Rng, opts: TickOptions = {}): TickResult {
  const next = structuredClone(state);
  const now = state.lastTickAt + dtMs;
  const autoCollect = opts.offline ? AUTO_COLLECT_FRACTION_OFFLINE : AUTO_COLLECT_FRACTION_ONLINE;
  const ctx: TickCtx = { state: next, rng, now, dtMs, events: [], newId: idFactory(now, rng), xpGained: 0, autoCollect };

  hatchEggs(ctx);

  for (const tank of next.tanks) {
    const cleanlinessBefore = tank.cleanliness;
    updatePellets(ctx, tank);
    updateCleanliness(ctx, tank, cleanlinessBefore);
    const occupancy = tankOccupancy(next, tank.id);
    for (const fish of next.fish) {
      if (fish.tankId === tank.id) updateFish(ctx, fish, tank, occupancy);
    }
  }

  // Courtships that ended lay their (guaranteed) egg, live or offline. Hatching runs first in the
  // next tick, so an egg laid and due within one long offline step still hatches on time.
  const bred = completeCourtships(next, now, rng, ctx.newId);
  if (bred.laid.length > 0) {
    next.fish = bred.state.fish;
    next.eggs = bred.state.eggs;
    next.courtships = bred.state.courtships;
    for (const { egg, parentIds } of bred.laid) {
      ctx.events.push({ type: 'eggLaid', tankId: egg.tankId, eggId: egg.id, parentIds, shiny: egg.shiny });
    }
  } else if (bred.state.courtships !== next.courtships) {
    next.courtships = bred.state.courtships;
  }

  applyXpGain(ctx);
  next.lastTickAt = now;
  return { state: next, events: ctx.events };
}

// ---------------------------------------------------------------------------
// Feeding
// ---------------------------------------------------------------------------

/**
 * A fish eats a pellet: +15 hunger (premium +25, which also starts a 2x growth boost).
 * Full fish (hunger >= 95) ignore food, in which case the state is returned unchanged.
 * Feeding XP (with its hourly cap) is handled by the store.
 */
export function eatPellet(state: GameState, fishId: string, pelletId: string, now: number): GameState {
  const fish = state.fish.find((f) => f.id === fishId);
  if (!fish || fish.hunger >= FULL_HUNGER) return state;
  const tank = state.tanks.find((t) => t.id === fish.tankId);
  const pellet = tank?.pellets.find((p) => p.id === pelletId);
  if (!tank || !pellet) return state;

  const gain = pellet.premium ? PREMIUM_PELLET_HUNGER : PELLET_HUNGER;
  const fedFish: Fish = {
    ...fish,
    hunger: Math.min(HUNGER_MAX, fish.hunger + gain),
    boostUntil: pellet.premium ? now + PREMIUM_BOOST_SECONDS * SECOND_MS : fish.boostUntil,
  };
  return {
    ...state,
    fish: state.fish.map((f) => (f.id === fishId ? fedFish : f)),
    tanks: state.tanks.map((t) => (t.id === tank.id ? { ...t, pellets: t.pellets.filter((p) => p.id !== pelletId) } : t)),
    stats: { ...state.stats, fed: state.stats.fed + 1 },
  };
}

// ---------------------------------------------------------------------------
// Offline catch-up
// ---------------------------------------------------------------------------

export interface OfflineSummary {
  /** Simulated time (after the 8h cap). */
  elapsedMs: number;
  shellsDropped: number;
  shellValue: number;
  pearlsDropped: number;
  eggsHatched: number;
  eggsLaid: number;
  /** Babies that hatched into a full tank and went to the Nursery. */
  toNursery: number;
  /** The first-baby quest finished (and paid out) while away. */
  questComplete: boolean;
  fishGrown: number;
  levelsGained: number[];
}

export interface OfflineResult {
  state: GameState;
  summary: OfflineSummary;
  events: SimEvent[];
}

/** Simulates time since `state.lastTickAt` (capped at 8h) in 60-second steps. */
export function simulateOffline(state: GameState, now: number, rng: Rng = Math.random): OfflineResult {
  const elapsedMs = clamp(now - state.lastTickAt, 0, OFFLINE_CAP_MS);
  const events: SimEvent[] = [];
  let current = state;
  let remaining = elapsedMs;
  while (remaining > 0) {
    const step = Math.min(OFFLINE_STEP_MS, remaining);
    const result = tick(current, step, rng, { offline: true });
    current = result.state;
    events.push(...result.events);
    remaining -= step;
  }
  // Time beyond the cap is skipped, not simulated.
  current = { ...current, lastTickAt: now };

  // Honest about what was kept: only drops still waiting on the sand count (overflow was lost while away).
  const onSand = new Set(current.tanks.flatMap((t) => t.shells.map((d) => d.id)));
  const drops = events.filter((e): e is Extract<SimEvent, { type: 'drop' }> => e.type === 'drop' && onSand.has(e.dropId));
  const shellDrops = drops.filter((d) => !d.pearl);
  const summary: OfflineSummary = {
    elapsedMs,
    shellsDropped: shellDrops.length,
    shellValue: shellDrops.reduce((sum, d) => sum + d.value, 0),
    pearlsDropped: drops.filter((d) => d.pearl).length,
    eggsHatched: events.filter((e) => e.type === 'hatched').length,
    eggsLaid: events.filter((e) => e.type === 'eggLaid').length,
    toNursery: events.filter((e) => e.type === 'hatched' && e.destination === 'nursery').length,
    questComplete: events.some((e) => e.type === 'questComplete'),
    fishGrown: events.filter((e) => e.type === 'stageUp').length,
    levelsGained: events.flatMap((e) => (e.type === 'levelUp' ? [e.level] : [])),
  };
  return { state: current, summary, events };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateFishOptions {
  id: string;
  variant?: string;
  shiny?: boolean;
  takenNames?: readonly string[];
  /** Starting bond (babies of close parents start Curious). */
  bondPoints?: number;
}

/** A new baby fish with default hunger/happiness. */
export function createFish(speciesId: SpeciesId, tankId: string, now: number, rng: Rng, opts: CreateFishOptions): Fish {
  return {
    id: opts.id,
    speciesId,
    name: randomName(rng, opts.takenNames),
    variant: opts.variant ?? randomVariantKey(speciesId, rng),
    shiny: opts.shiny ?? false,
    stage: 'baby',
    growth: 0,
    hunger: NEW_FISH_HUNGER,
    happiness: NEW_FISH_HAPPINESS,
    bornAt: now,
    lastBredAt: null,
    lastDropAt: now,
    boostUntil: null,
    tankId,
    ...newBond(opts.bondPoints ?? 0),
  };
}

export function createTank(id: string, name: string, capacity: number = STARTING.tankCapacity): Tank {
  return {
    id,
    name,
    theme: STARTING.tankTheme,
    capacity,
    upgrades: 0,
    cleanliness: STARTING.tankCleanliness,
    algaeSpots: [],
    decor: [],
    pellets: [],
    shells: [],
    style: { ...DEFAULT_TANK_STYLE },
    layoutPresets: Array.from({ length: LAYOUT_PRESET_SLOTS }, () => null),
  };
}

export function createInitialState(now: number = Date.now(), rng: Rng = Math.random): GameState {
  const tank = createTank('tank-1', STARTING.tankName);
  const fish: Fish[] = [];
  for (let i = 0; i < STARTING.fishCount; i++) {
    fish.push(
      createFish(STARTING.fishSpecies, tank.id, now, rng, {
        id: `fish-${i + 1}`,
        takenNames: fish.map((f) => f.name),
      }),
    );
  }
  return {
    version: SAVE_VERSION,
    shells: STARTING.shells,
    pearls: STARTING.pearls,
    xp: STARTING.xp,
    level: STARTING.level,
    tanks: [tank],
    activeTankId: tank.id,
    fish,
    eggs: [],
    courtships: [],
    nursery: [],
    breedingQuest: { guideSeen: false, status: 'off' },
    inventory: { premiumFood: STARTING.premiumFood },
    lastTickAt: now,
    lastDailyGift: null,
    settings: { ...STARTING.settings },
    stats: { fed: 0, hatched: 0, cleaned: 0 },
    feedXp: { windowStart: 0, earned: 0 },
    ownedThemes: ['classic'],
    lastBreakXpAt: null,
    decorInventory: {},
    ownedStyles: [],
  };
}

// ---------------------------------------------------------------------------
// Growth info (for the FishCard)
// ---------------------------------------------------------------------------

export interface StageProgress {
  /** Progress toward the next stage, 0..1 (1 for adults). */
  fraction: number;
  nextStage: 'juvenile' | 'adult' | null;
  /** Estimated real seconds to the next stage at the current rate, or null if not growing / adult. */
  secondsRemaining: number | null;
  /** False when hunger < 20 (growth paused). */
  growing: boolean;
}

export function stageProgress(fish: Fish, now: number): StageProgress {
  const total = growthTotalSeconds(fish.speciesId);
  const growing = fish.hunger >= GROWTH_STOP_HUNGER;
  const juvenileAt = total * JUVENILE_AT_FRACTION;
  const adultAt = total * ADULT_AT_FRACTION;
  if (fish.growth >= adultAt) return { fraction: 1, nextStage: null, secondsRemaining: null, growing };
  const [from, to, nextStage] = fish.growth < juvenileAt ? [0, juvenileAt, 'juvenile' as const] : [juvenileAt, adultAt, 'adult' as const];
  const fraction = clamp((fish.growth - from) / (to - from), 0, 1);
  const boosted = fish.boostUntil !== null && fish.boostUntil > now;
  const rate = growthMultiplier(fish.happiness) * (boosted ? PREMIUM_BOOST_MULTIPLIER : 1);
  const secondsRemaining = growing ? (to - fish.growth) / rate : null;
  return { fraction, nextStage, secondsRemaining, growing };
}

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

/**
 * Algae spots touched by a sponge dragged from `from` to `to` (tank units).
 * Uses distance from each spot's center to the drag segment, so fast drags don't skip spots.
 */
export function algaeTouchedBySponge(
  spots: readonly AlgaeSpot[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number = SPONGE_RADIUS,
): string[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len2 = dx * dx + dy * dy;
  return spots
    .filter((spot) => {
      const cx = spot.x + spot.size / 2;
      const cy = spot.y + spot.size / 2;
      const t = len2 === 0 ? 0 : clamp(((cx - from.x) * dx + (cy - from.y) * dy) / len2, 0, 1);
      const px = from.x + t * dx;
      const py = from.y + t * dy;
      return Math.hypot(cx - px, cy - py) <= spot.size / 2 + radius;
    })
    .map((spot) => spot.id);
}

/** Wipes one algae spot: it disappears, the tank gets ALGAE_WIPE_CLEANLINESS cleaner, and the cleaned counter ticks. Null if no such spot. XP is the caller's. */
export function wipeAlgae(state: GameState, spotId: string): GameState | null {
  const tank = state.tanks.find((t) => t.algaeSpots.some((a) => a.id === spotId));
  if (!tank) return null;
  return {
    ...state,
    stats: { ...state.stats, cleaned: state.stats.cleaned + 1 },
    tanks: state.tanks.map((t) =>
      t.id === tank.id
        ? { ...t, cleanliness: Math.min(CLEANLINESS_MAX, t.cleanliness + ALGAE_WIPE_CLEANLINESS), algaeSpots: t.algaeSpots.filter((a) => a.id !== spotId) }
        : t,
    ),
  };
}
