// All balance numbers live here. Logic must not contain magic numbers.
import type { DecorDef, DecorId, Price, ThemeId } from './types';

export const SAVE_VERSION = 3;

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------
export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;

/** The sim runs on a fixed 1-second tick. */
export const SIM_TICK_MS = SECOND_MS;

// ---------------------------------------------------------------------------
// Logical tank space (sim units; the renderer scales these to pixels)
// ---------------------------------------------------------------------------
export const TANK_WIDTH = 1000;
export const TANK_HEIGHT = 625;
/** Top of the sand; pellets land here and drops sit here. */
export const SAND_Y = 560;
/** Keep spawned algae/drops this far from the glass edges. */
export const TANK_EDGE_MARGIN = 30;
/** Pellet sink speed in units per second. */
export const PELLET_SINK_SPEED = 40;
/** Pellets appear just under the water surface. */
export const PELLET_SPAWN_Y = 20;

// ---------------------------------------------------------------------------
// Hunger
// ---------------------------------------------------------------------------
export const HUNGER_MIN = 0;
export const HUNGER_MAX = 100;
export const PELLET_HUNGER = 15;
export const PREMIUM_PELLET_HUNGER = 25;
/** Fish at or above this hunger ignore food. */
export const FULL_HUNGER = 95;
/** Seconds a pellet sits on the sand before dissolving. */
export const PELLET_DISSOLVE_SECONDS = 60;
export const PELLET_DISSOLVE_CLEANLINESS_PENALTY = 3;

// ---------------------------------------------------------------------------
// Happiness
// ---------------------------------------------------------------------------
export const HAPPINESS_MIN = 0;
export const HAPPINESS_MAX = 100;
export const HAPPINESS_DRIFT_PER_MIN = 2;
export const HAPPINESS_BASE_TARGET = 50;
export const HAPPINESS_FED_THRESHOLD = 40;
export const HAPPINESS_FED_BONUS = 20;
export const HAPPINESS_STARVING_THRESHOLD = 20;
export const HAPPINESS_STARVING_PENALTY = 20;
export const HAPPINESS_CLEAN_THRESHOLD = 60;
export const HAPPINESS_CLEAN_BONUS = 15;
export const HAPPINESS_DIRTY_THRESHOLD = 30;
export const HAPPINESS_DIRTY_PENALTY = 15;
export const HAPPINESS_PER_DECOR = 3;
export const HAPPINESS_DECOR_MAX = 15;
/** Fraction of capacity above which the tank counts as crowded. */
export const HAPPINESS_CROWDED_FRACTION = 0.9;
export const HAPPINESS_CROWDED_PENALTY = 10;
/** Below this, fish look sad (slower swim, droop, rain cloud). */
export const SAD_HAPPINESS = 30;

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------
/** Growth multiplier = GROWTH_HAPPINESS_BASE + happiness / GROWTH_HAPPINESS_DIVISOR (0.5x..1.5x). */
export const GROWTH_HAPPINESS_BASE = 0.5;
export const GROWTH_HAPPINESS_DIVISOR = 100;
/** Growth stops completely below this hunger. Also the "hungry" display threshold. */
export const GROWTH_STOP_HUNGER = 20;
export const PREMIUM_BOOST_SECONDS = 3 * 60;
export const PREMIUM_BOOST_MULTIPLIER = 2;
/** Fraction of growMinutes at which each stage begins. */
export const JUVENILE_AT_FRACTION = 0.4;
export const ADULT_AT_FRACTION = 1.0;
export const STAGE_SCALE = {
  egg: 0.3,
  baby: 0.45,
  juvenile: 0.7,
  adult: 1.0,
} as const;

// ---------------------------------------------------------------------------
// Cleanliness & algae
// ---------------------------------------------------------------------------
export const CLEANLINESS_MIN = 0;
export const CLEANLINESS_MAX = 100;
export const CLEANLINESS_DECAY_PER_MIN = 0.5;
export const CLEANLINESS_DECAY_PER_FISH_PER_MIN = 0.1;
/** Crossing below each of these spawns an algae spot. */
export const ALGAE_THRESHOLDS = [80, 60, 40, 20] as const;
export const MAX_ALGAE_SPOTS = 12;
export const ALGAE_WIPE_CLEANLINESS = 6;
/** Sponge reach in Clean mode (tank units, added to the spot radius). */
export const SPONGE_RADIUS = 18;
export const ALGAE_MIN_SIZE = 14;
export const ALGAE_MAX_SIZE = 28;

// ---------------------------------------------------------------------------
// Shell drops
// ---------------------------------------------------------------------------
export const DROP_PEARL_CHANCE = 0.02;
export const PEARL_DROP_VALUE = 1;
export const MAX_DROPS_PER_TANK = 10;

// ---------------------------------------------------------------------------
// Offline catch-up
// ---------------------------------------------------------------------------
export const OFFLINE_CAP_MS = 8 * HOUR_MS;
export const OFFLINE_STEP_MS = 60 * SECOND_MS;

// ---------------------------------------------------------------------------
// Levels & XP
// ---------------------------------------------------------------------------
/** XP to next level = round(XP_CURVE_BASE * level ^ XP_CURVE_EXPONENT). */
export const XP_CURVE_BASE = 40;
export const XP_CURVE_EXPONENT = 1.5;
/** Each level-up grants level * LEVEL_UP_SHELLS_PER_LEVEL shells. */
export const LEVEL_UP_SHELLS_PER_LEVEL = 10;

export const XP = {
  pelletEaten: 1,
  algaeWiped: 2,
  shellCollected: 1,
  fishBought: 5,
  eggHatched: 10,
  fishAdult: 8,
  dailyGift: 5,
  breakComplete: 10,
} as const;
/** Max XP earnable from feeding per rolling hour. */
export const FEED_XP_MAX_PER_HOUR = 30;

// ---------------------------------------------------------------------------
// Feature unlocks
// ---------------------------------------------------------------------------
export const UNLOCK_LEVEL = {
  premiumFood: 2,
  decorShop: 3,
  breeding: 5,
  capacityUpgrade: 7,
  secondTank: 8,
  thirdTank: 14,
} as const;

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------
export const PREMIUM_FOOD_PACK = { count: 3, price: { currency: 'shells', amount: 10 } as Price };
/** Juveniles sell for this fraction of the adult price. Babies cannot be sold. */
export const JUVENILE_SELL_FRACTION = 0.4;

export const CAPACITY_UPGRADE = {
  slots: 2,
  baseCost: 200,
  maxPurchases: 3,
  costMultiplier: 2,
} as const;

export const TANK_PURCHASES: { unlockLevel: number; price: Price }[] = [
  { unlockLevel: UNLOCK_LEVEL.secondTank, price: { currency: 'shells', amount: 500 } },
  { unlockLevel: UNLOCK_LEVEL.thirdTank, price: { currency: 'shells', amount: 2000 } },
];
export const MAX_TANKS = 1 + TANK_PURCHASES.length;
export const NEW_TANK_CAPACITY = 6;
/** Decor is placed on the sand at least this far from the glass and the bubbler. */
export const DECOR_EDGE_MARGIN = 70;
export const DECOR_PLACEMENT_TRIES = 12;
/** Decor base sits this far below the sand line (tank units). */
export const DECOR_BASE_OFFSET = 10;

export interface ThemeDef {
  id: ThemeId;
  name: string;
  unlockLevel: number;
  price: Price | null;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  classic: { id: 'classic', name: 'Classic', unlockLevel: 1, price: null },
  night: { id: 'night', name: 'Night Glow', unlockLevel: 10, price: { currency: 'pearls', amount: 8 } },
  coral: { id: 'coral', name: 'Coral Reef', unlockLevel: 12, price: { currency: 'pearls', amount: 12 } },
  pond: { id: 'pond', name: 'Pond', unlockLevel: 20, price: { currency: 'pearls', amount: 20 } },
};

// ---------------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------------
export const DECOR: Record<DecorId, DecorDef> = {
  plant_small: { id: 'plant_small', name: 'Sprout', unlockLevel: 3, cost: { currency: 'shells', amount: 20 } },
  plant_tall: { id: 'plant_tall', name: 'Tall Weed', unlockLevel: 3, cost: { currency: 'shells', amount: 35 } },
  rock: { id: 'rock', name: 'Smooth Rock', unlockLevel: 3, cost: { currency: 'shells', amount: 25 } },
  castle: { id: 'castle', name: 'Tiny Castle', unlockLevel: 6, cost: { currency: 'shells', amount: 150 } },
  chest: { id: 'chest', name: 'Treasure Chest', unlockLevel: 9, cost: { currency: 'shells', amount: 250 } },
  shipwreck: { id: 'shipwreck', name: 'Shipwreck', unlockLevel: 13, cost: { currency: 'pearls', amount: 6 } },
};
export const DECOR_LIST: DecorDef[] = Object.values(DECOR);
export const MAX_DECOR_PER_TANK = 8;
export const DECOR_SELL_FRACTION = 0.5;
export const CHEST_BUBBLE_INTERVAL_MS = 30 * SECOND_MS;

// ---------------------------------------------------------------------------
// Breeding
// ---------------------------------------------------------------------------
export const BREEDING = {
  checkIntervalMs: 5 * MINUTE_MS,
  minHappiness: 80,
  minHunger: 50,
  cooldownMs: 60 * MINUTE_MS,
  chancePerPair: 0.25,
  /** Egg hatches in max(eggMinMinutes, growMinutes / eggGrowDivisor) minutes. */
  eggMinMinutes: 10,
  eggGrowDivisor: 4,
  variantParentAChance: 0.45,
  variantParentBChance: 0.45,
  // remaining 0.10 → random variant of the species
  shinyChance: 0.03,
  shinyChanceShinyParent: 0.1,
  shinyHatchPearls: 2,
} as const;

// ---------------------------------------------------------------------------
// Daily gift
// ---------------------------------------------------------------------------
/** Where the daily gift box floats in the tank (fractions of tank width/height). */
export const GIFT_BOX_POSITION = { x: 0.74, y: 0.42 } as const;
export const GIFT_REVEAL_MS = 3200;
/** How often the gift box re-checks the local date (for midnight rollover). */
export const GIFT_DAY_CHECK_MS = 60 * SECOND_MS;

export const DAILY_GIFT = {
  shells: 20,
  premiumFood: 3,
  pearlChance: 0.15,
  pearls: 1,
} as const;

// ---------------------------------------------------------------------------
// Break mode
// ---------------------------------------------------------------------------
export const BREAK_DURATIONS_MIN = [3, 5, 10] as const;
export const BREAK_DEFAULT_MIN = 5;
export const BREAK_XP_COOLDOWN_MS = HOUR_MS;
export const BREATHE_IN_MS = 4 * SECOND_MS;
export const BREATHE_OUT_MS = 6 * SECOND_MS;
/** How often the Break timer UI refreshes. */
export const BREAK_TIMER_TICK_MS = 250;

// ---------------------------------------------------------------------------
// Sound (Web Audio, synthesized)
// ---------------------------------------------------------------------------
export const SOUND_MASTER_VOLUME = 0.9;
/** Minimum gap between two plays of the same effect (avoids machine-gun squeaks). */
export const SOUND_MIN_GAP_MS = { plop: 60, coin: 40, chime: 400, squeak: 140, bubble: 0 } as const;
/** Ambience: random soft bubble blips per second, plus a quiet filtered-noise bed. */
export const AMBIENCE_BLIPS_PER_SEC = 1.6;
export const AMBIENCE_BED_VOLUME = 0.06;

// ---------------------------------------------------------------------------
// Dev tools
// ---------------------------------------------------------------------------
/** Show the dev/art-preview panel in production builds too (it's always on in `npm run dev`). Set false to ship without it. */
export const DEV_TOOLS_IN_PRODUCTION = true;

// ---------------------------------------------------------------------------
// Interaction / UI
// ---------------------------------------------------------------------------
export const FEED_COOLDOWN_MS = 150;
export const TOAST_DURATION_MS = 3 * SECOND_MS;
export const ONBOARDING_STEPS = 3;
export const FISH_NAME_MAX_LENGTH = 20;
export const TANK_NAME_MAX_LENGTH = 20;
/** Pointer travel (CSS px) below which a press counts as a click, not a drag. */
export const DRAG_THRESHOLD_PX = 5;

// ---------------------------------------------------------------------------
// Behavior (renderer)
// ---------------------------------------------------------------------------
export const WANDER_MIN_MS = 3 * SECOND_MS;
export const WANDER_MAX_MS = 8 * SECOND_MS;
export const EAT_RADIUS_PX = 8;
export const BLINK_MIN_MS = 3 * SECOND_MS;
export const BLINK_MAX_MS = 6 * SECOND_MS;
export const BLINK_DURATION_MS = 140;
/** Fish swim area: below the surface, above the sand, away from the glass. */
export const SWIM_TOP = 60;
export const SWIM_SIDE_MARGIN = 50;
export const SWIM_SAND_CLEARANCE = 30;
/** Axolotls stay in this band just above the sand. */
export const AXOLOTL_BAND = 55;
export const AXOLOTL_SAND_CLEARANCE = 10;
/** Distance from the swim bounds where edge avoidance starts pushing inward. */
export const EDGE_AVOID_ZONE = 60;
export const EDGE_AVOID_WEIGHT = 2.2;
/** Max turn rate in radians per second (darting species turn faster). */
export const TURN_RATE = 2.6;
export const DART_TURN_MULTIPLIER = 1.8;
/** Max change in speed per second, as a fraction of max speed. */
export const ACCEL_FRACTION = 1.6;
export const ARRIVE_DIST = 16;
/** Fish slow down within this distance of a wander target. */
export const ARRIVE_SLOWDOWN_DIST = 90;
export const MIN_CRUISE_FRACTION = 0.3;
export const FOOD_SPEED_MULTIPLIER = 1.35;
export const SAD_SPEED_MULTIPLIER = 0.6;
export const BABY_SPEED_MULTIPLIER = 0.85;
export const DART_SPEED_MULTIPLIER = 2.2;
export const DART_DURATION_MS = 450;
export const DART_GAP_MIN_MS = 2 * SECOND_MS;
export const DART_GAP_MAX_MS = 5 * SECOND_MS;
export const SCHOOL_RADIUS = 180;
export const SCHOOL_COHESION = 0.7;
export const SCHOOL_SEPARATION_DIST = 28;
export const SCHOOL_SEPARATION = 1.2;
/** How fast a fish flips to face its direction (facing units per second, range -1..1). */
export const FLIP_RATE = 6;
export const MAX_PITCH = 0.4;
/** Narrowest a fish gets mid-flip (fraction of full width). */
export const MIN_FLIP_SCALE = 0.25;
export const SAD_DROOP = 0.18;
/** Sad (rain cloud) / hungry (shrimp bubble) indicators. */
export const INDICATOR_DURATION_MS = 2500;
export const INDICATOR_GAP_MIN_MS = 6 * SECOND_MS;
export const INDICATOR_GAP_MAX_MS = 12 * SECOND_MS;
export const HUNGRY_INDICATOR_HUNGER = GROWTH_STOP_HUNGER;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
/** Global multiplier on fish art size (design units → tank units). */
export const FISH_ART_SCALE = 1.45;
/** Fish outline thickness in CSS pixels (CLAUDE.md Art Style: thick 3-4px, darker shade of the fill). */
export const OUTLINE_PX = 3.4;
export const BUBBLER_X = 70;
export const BUBBLES_PER_SEC = 5;
export const BUBBLES_PER_SEC_REDUCED = 1.2;
export const SHINY_SPARKLES_PER_SEC = 2.5;
export const MAX_FRAME_DT_SEC = 0.05;
/** Food on the sand is targeted this far above SAND_Y so fish can nibble it. */
export const FOOD_SAND_OFFSET = 5;
export const PUFF_DURATION_MS = 2200;
export const PUFF_ATTACK_MS = 180;
export const PUFF_RELEASE_MS = 500;
export const REDUCED_WOBBLE = 0.4;
/** On tall (portrait) screens, zoom in up to this multiple of "fit width" and let the player pan sideways. */
export const PORTRAIT_ZOOM = 2.1;
/** On tall screens, the share of extra height shown above the world (more water) vs. below (more sand). */
export const EXTRA_HEIGHT_ABOVE = 0.6;
/** localStorage flag: the one-time "drag to look around" tip has been shown. */
export const PAN_TIP_KEY = 'fishbowl-pan-tip-shown';
/** localStorage flag: the iPhone "Add to Home Screen for fullscreen" hint was dismissed. */
export const IOS_INSTALL_HINT_KEY = 'fishbowl-ios-install-hint-dismissed';
/** Click radius for collecting a shell/pearl on the sand (tank units). */
export const DROP_HIT_RADIUS = 16;
export const POP_TEXT_DURATION_MS = 900;
export const MAX_VISIBLE_TOASTS = 3;
/** Eggs rest on the sand at least this far from the glass. */
export const EGG_EDGE_MARGIN = 60;
/** After laying an egg, the pair swims together for this long. */
export const PAIR_LINGER_MS = 2500;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
export const SAVE_KEY = 'fishbowl-save';
/** localStorage: which user this device last synced with, and the cloud updated_at it last saw. */
export const CLOUD_META_KEY = 'fishbowl-cloud-meta';
/** Cloud saves are debounced: at most one write per this interval while the game changes. */
export const CLOUD_SAVE_DEBOUNCE_MS = 30 * SECOND_MS;
/** Logging out waits at most this long for the final cloud save. */
export const CLOUD_FINAL_SAVE_TIMEOUT_MS = 5 * SECOND_MS;
/** Feature flag: show "Continue with Google" on the login modal (needs the Google provider configured in Supabase). */
export const AUTH_GOOGLE_ENABLED = false;
export const ONBOARDING_KEY = 'fishbowl-onboarding';
export const CORRUPT_SAVE_PREFIX = 'fishbowl-save-corrupt-';
export const SAVE_INTERVAL_MS = 10 * SECOND_MS;
/** Only show the "While you were away" summary after at least this long. */
export const OFFLINE_SUMMARY_MIN_MS = 60 * SECOND_MS;

// ---------------------------------------------------------------------------
// Starting state
// ---------------------------------------------------------------------------
export const STARTING = {
  shells: 30,
  pearls: 0,
  level: 1,
  xp: 0,
  premiumFood: 0,
  tankName: 'My Tank',
  tankTheme: 'classic' as ThemeId,
  tankCapacity: 6,
  tankCleanliness: 100,
  fishSpecies: 'danio' as const,
  fishCount: 2,
  fishStage: 'baby' as const,
  settings: { muted: true, reducedMotion: false },
} as const;

/** Initial stats for any newly bought or hatched fish. */
export const NEW_FISH_HUNGER = 80;
export const NEW_FISH_HAPPINESS = 70;
