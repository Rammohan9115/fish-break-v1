// All balance numbers live here. Logic must not contain magic numbers.
import type { DecorDef, DecorId, Price, ThemeId } from './types';

export const SAVE_VERSION = 4;

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
  capacityUpgrade: 4,
  secondTank: 8,
  thirdTank: 14,
} as const;

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------
export const PREMIUM_FOOD_PACK = { count: 3, price: { currency: 'shells', amount: 10 } as Price };
/** Juveniles sell for this fraction of the adult price. Babies cannot be sold. */
export const JUVENILE_SELL_FRACTION = 0.4;

/** Each tank's capacity upgrade ladder: +3 slots per step, up to 5 steps, 150 shells growing ×1.6. */
export const CAPACITY_UPGRADE = {
  slots: 3,
  baseCost: 150,
  maxPurchases: 5,
  costMultiplier: 1.6,
} as const;
/** Starting capacity of the first, second and third tank (by purchase order). */
export const TANK_BASE_CAPACITY = [10, 12, 15] as const;
/** The HUD offers an "Upgrade" shortcut once a tank is this full. */
export const CAPACITY_WARN_FRACTION = 0.8;

export const TANK_PURCHASES: { unlockLevel: number; price: Price }[] = [
  { unlockLevel: UNLOCK_LEVEL.secondTank, price: { currency: 'shells', amount: 500 } },
  { unlockLevel: UNLOCK_LEVEL.thirdTank, price: { currency: 'shells', amount: 2000 } },
];
export const MAX_TANKS = 1 + TANK_PURCHASES.length;
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
/** Player-driven breeding: two ready fish → a guaranteed egg after the courtship. */
export const BREEDING = {
  minHappiness: 70,
  minHunger: 40,
  cooldownMs: 30 * MINUTE_MS,
  courtshipMs: 60 * SECOND_MS,
  /** Egg hatches in max(eggMinMinutes, growMinutes / eggGrowDivisor) minutes. */
  eggMinMinutes: 5,
  eggGrowDivisor: 6,
  variantParentAChance: 0.45,
  variantParentBChance: 0.45,
  // remaining 0.10 → random variant of the species
  shinyChance: 0.03,
  shinyChanceShinyParent: 0.1,
  shinyHatchPearls: 2,
  /** Rehoming a napping Nursery baby pays this share of the adult sell price. */
  rehomeFraction: 0.2,
} as const;
/** "Your first baby" quest reward (paid once, on the first hatch while the quest is active). */
export const BREEDING_QUEST_REWARD = { shells: 50, pearls: 1 } as const;
/** Courtship loop (renderer): heart size (tank units), how high above the sand it floats, seconds per loop. */
export const COURTSHIP_LOOP_W = 60;
export const COURTSHIP_LOOP_H = 52;
export const COURTSHIP_HEIGHT = 170;
export const COURTSHIP_LOOP_S = 9;
export const COURTSHIP_HEART_GAP_S = 0.7;
/** Courting fish swim at this share of their cruise speed. */
export const COURTSHIP_SPEED = 0.75;
/** The newborn's happy spin (ms) and the egg's faster wobble in its last stretch (ms before hatching). */
export const HATCH_SPIN_MS = 800;
export const EGG_EAGER_MS = 60 * SECOND_MS;

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
/** Hold this long on a decor item to pick it up (taps never move decor). */
export const DECOR_LONG_PRESS_MS = 450;
/** Pointer travel (CSS px) that cancels a pending long press (the finger is panning instead). */
export const LONG_PRESS_SLOP_PX = 10;

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
/** A turn-around animates scaleX 1 → 0 → -1 (eased) over this long. */
export const TURN_MS = 200;
/** Swim speed at the middle of a turn, as a fraction of normal (eases back out). */
export const TURN_SPEED_FACTOR = 0.35;
/** Horizontal speed (px/s) needed before a fish turns to face the other way (stops jitter when swimming vertically). */
export const TURN_MIN_VX = 4;
/** Max tilt toward the velocity (20°). */
export const MAX_PITCH = (20 * Math.PI) / 180;
/** How quickly the drawn tilt follows the velocity (per second, exponential smoothing). */
export const TILT_SMOOTHING = 6;
/** Narrowest a fish is drawn mid-turn (fraction of full width), so it never fully vanishes for a frame. */
export const MIN_FLIP_SCALE = 0.04;
export const SAD_DROOP = 0.18;
/** Sad look (sprites): how fast the gloom fades in/out (per second), how much it calms the body wave,
 * how far down the water sad fish drift (share of the swim band they avoid at the top), and the tear rhythm. */
export const GLOOM_SMOOTHING = 0.9;
export const SAD_WAVE_DAMP = 0.4;
export const SAD_SINK = 0.45;
export const SAD_TEAR_PERIOD_S = 4.5;
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

// Sprite art (PNG fish in /public/assets; render/sprites.ts)
/** Longest side of a prepared sprite, in pixels (source PNGs are downscaled to this once at load). */
export const SPRITE_MAX_PX = 512;
/** Pixels with alpha at or below this are trimmed away around the art. */
export const SPRITE_ALPHA_TRIM = 8;
/** A baked-in checkerboard pixel is at least this light (min channel) and at most this saturated (max − min). */
export const SPRITE_BG_MIN_LIGHT = 165;
export const SPRITE_BG_MAX_SPREAD = 28;
/** Give up on a single image after this long (the drawn art is used instead). */
export const SPRITE_LOAD_TIMEOUT_MS = 20_000;
/** Vertical strips the sprite is sliced into for the swimming body wave. */
export const SPRITE_WAVE_STRIPS = 20;
/** Body-wave amplitude at the tail tip at full cruise speed, as a fraction of sprite height (× species waveAmp). */
export const SPRITE_WAVE_AMP = 0.06;
/** Phase step between neighbouring strips (radians), so the wave travels from head to tail. */
export const SPRITE_WAVE_STRIP_PHASE = 0.5;
/** The front of the body (nose side) that stays rigid; the wave grows from here to the tail tip. */
export const SPRITE_WAVE_HEAD = 0.3;
/** Wave envelope exponent: higher = the sway concentrates more toward the tail. */
export const SPRITE_WAVE_FALLOFF = 1.4;
/** Body-wave speed in radians per second when idle and at full cruise speed (× species waveSpeed). */
export const WAVE_IDLE_FREQ = 3;
export const WAVE_SWIM_FREQ = 11;
/** Idle wave amplitude as a fraction of the full-speed amplitude. */
export const WAVE_IDLE_AMP = 0.4;
/** Speed (as a fraction of cruise speed) beyond which the wave stops growing (darts, food rushes). */
export const WAVE_MAX_SPEED_FRAC = 1.6;
/** Reduced motion keeps this much of the wave amplitude. */
export const REDUCED_WAVE = 0.3;
/** Babies: faster, wigglier wave and a constant gentle bob (fraction of sprite height, radians per second). */
export const BABY_WAVE_SPEED = 1.5;
export const BABY_WAVE_AMP = 1.35;
export const BABY_BOB_AMP = 0.05;
export const BABY_BOB_FREQ = 4.5;
/** Puffer bob (fraction of sprite height, radians per second). */
export const PUFFER_BOB_AMP = 0.06;
export const PUFFER_BOB_FREQ = 2.4;
/** Axolotl walk cycle: step bob height (fraction of sprite height) and rocking angle, both scaled by speed. */
export const WALK_BOB_AMP = 0.06;
export const WALK_ROCK = 0.06;
/** Stretch along the swim direction at full acceleration (the other axis narrows by half as much). */
export const ACCEL_STRETCH = 0.08;
/** How quickly the stretch follows acceleration (per second). */
export const STRETCH_SMOOTHING = 8;
/** Gulp when eating: squash along the swim direction, and its length. */
export const EAT_SQUASH = 0.12;
export const EAT_SQUASH_MS = 260;
/** Bounce when clicked: peak scale change, length, and wobble rate (radians per second). */
export const POKE_BOUNCE = 0.1;
export const POKE_BOUNCE_MS = 650;
export const POKE_BOUNCE_FREQ = 26;
/** Sprite eyes: pupil and highlight sizes (fraction of eye radius) and how far the pupil can travel. */
export const EYE_PUPIL = 0.56;
export const EYE_HIGHLIGHT = 0.26;
export const EYE_LOOK_RANGE = 0.32;
/** The eye looks at the cursor when it's within this distance (tank units); pellets always win. */
export const EYE_CURSOR_RANGE = 380;
/** How quickly the gaze follows its target (per second). */
export const GAZE_SMOOTHING = 7;
/** Prepared sprite copies are cached at widths rounded up to this many device pixels. */
export const SPRITE_SIZE_BUCKET_PX = 8;
/** Puffer sprite growth when fully inflated (x, y). */
export const SPRITE_PUFF_X = 0.22;
export const SPRITE_PUFF_Y = 0.38;
/** Shiny sprites: golden outline glow radius in CSS pixels. */
export const SPRITE_SHINY_GLOW_PX = 3;

// Generated sprite assets (decor, icons, eggs, theme backgrounds; render/assets.ts + render/artConfig.ts)
/** Stray blobs smaller than this fraction of the biggest blob are cut-out leftovers from a sprite sheet and get removed. */
export const ASSET_MIN_ISLAND = 0.15;
/** Defringe: alpha erosion radius and how far in (px) edge pixels are pulled toward the darkest nearby outline color. */
export const ASSET_ERODE_PX = 1;
export const ASSET_DEFRINGE_PX = 2;
/** Only edge pixels at least this light (max channel) are treated as halo. */
export const ASSET_FRINGE_MIN_LIGHT = 150;
/** Scaled sprite copies are cached at device-pixel widths rounded up to this. */
export const ASSET_SIZE_BUCKET_PX = 4;
/** Background parallax: the picture is drawn this much larger than "cover" and slides up to half the excess. */
export const PARALLAX_OVERSCAN = 1.04;
/** How quickly the parallax follows the pointer / device tilt (per second). */
export const PARALLAX_SMOOTHING = 2.2;
/** Device tilt (degrees) that maps to the full parallax shift. */
export const PARALLAX_TILT_DEG = 20;
/** Decor contact shadow: width as a fraction of the sprite width, and its opacity. */
export const DECOR_SHADOW_W = 0.42;
export const DECOR_SHADOW_ALPHA = 0.32;
/** Water tint over decor sprites (theme water color, source-atop), by depth layer. */
export const DECOR_TINT_BACK = 0.16;
export const DECOR_TINT_FRONT = 0.03;
/** Shared top light over every sprite: white at the top fading to a soft shade at the base. */
export const SPRITE_TOP_LIGHT = 0.1;
export const SPRITE_BASE_SHADE = 0.12;
/** Edit-mode glow: outline radius (CSS px) and strength. */
export const DECOR_GLOW_PX = 5;
export const DECOR_GLOW_ALPHA = 1;
/** Dragging decor lifts it this high (tank units) and this much bigger; the lift eases at this rate (per second). */
export const DECOR_LIFT = 10;
export const DECOR_LIFT_SCALE = 0.04;
export const DECOR_LIFT_SMOOTHING = 14;
/** Dropping decor: squash-bounce spring (peak squash, length, wobble rate in radians per second) and sand puff size. */
export const DECOR_DROP_SQUASH = 0.14;
export const DECOR_DROP_MS = 700;
export const DECOR_DROP_FREQ = 18;
export const DECOR_DROP_PUFFS = 9;

// Living tank (render/ambient/*): everything moves gently, nothing is ever fully still, nothing is fast.
/** Per-quality effect budgets. Reduced motion uses 'low' plus no parallax, warp or light rays. */
export const QUALITY_PRESETS = {
  high: { warpStrips: 48, rays: 6, causticW: 200, causticEveryFrames: 2, particles: [26, 22, 12], plantStrips: 22, silhouettes: true, sheen: true },
  medium: { warpStrips: 24, rays: 5, causticW: 150, causticEveryFrames: 3, particles: [14, 12, 8], plantStrips: 14, silhouettes: true, sheen: true },
  low: { warpStrips: 0, rays: 4, causticW: 112, causticEveryFrames: 4, particles: [6, 6, 4], plantStrips: 8, silhouettes: false, sheen: false },
} as const;
/** Quality auto-pick: measure frame times for this long after start, then pick by the median. */
export const QUALITY_PROBE_MS = 5000;
/** Median frame time (ms) at or under which the probe picks high / medium (else low). */
export const QUALITY_HIGH_MS = 20;
export const QUALITY_MEDIUM_MS = 30;
/** After the probe: drop one level when the average of the last QUALITY_WINDOW frames exceeds this (ms) for that level. */
export const QUALITY_DOWNGRADE_MS = { high: 24, medium: 36 } as const;
export const QUALITY_WINDOW = 120;
/** Frame gaps longer than this (ms) are tab switches or hitches, not rendering cost; they're ignored. */
export const QUALITY_IGNORE_MS = 250;

/** Water warp on the background: horizontal sway (CSS px) and how slowly it moves; it calms to this share below the sand line. */
export const WARP_AMP_PX = 1.5;
export const WARP_SPEED = 0.55;
export const WARP_WAVELENGTH = 120;
export const WARP_SAND_SHARE = 0.35;

/** Global current: slow noise-driven drift (signed, −1..1) and gusts every few minutes that settle over ~5s. */
export const CURRENT_NOISE_SPEED = 0.018;
export const GUST_MIN_S = 120;
export const GUST_MAX_S = 300;
export const GUST_FIRST_MIN_S = 45;
export const GUST_RISE_S = 1.2;
export const GUST_HOLD_S = 1.8;
export const GUST_SETTLE_S = 5;
/** How much a gust adds on top of the drift (in drift units). */
export const GUST_STRENGTH = 2.2;
/** Sideways drift (tank units per second) of particles and bubbles at current 1, by depth layer far → near. */
export const CURRENT_DRIFT = [4, 7, 11] as const;
export const BUBBLE_CURRENT_DRIFT = 9;

/** God rays: base opacity, sway (radians), and how slowly they sway, fade and breathe in width. */
export const RAY_ALPHA = 0.16;
export const RAY_SWAY = 0.07;
export const RAY_SPEED = 0.06;
/** Caustics on the sand: opacity, band height above the sand line (tank units), and animation speed. */
export const CAUSTIC_ALPHA = 0.22;
export const CAUSTIC_ABOVE_SAND = 70;
export const CAUSTIC_SPEED = 0.45;
/** Water surface: shimmer band height (tank units), highlight count, ripple ring life (s) and size. */
export const SURFACE_BAND = 26;
export const SURFACE_GLINTS = 14;
export const RIPPLE_LIFE_S = 1.6;
export const RIPPLE_RADIUS = 34;
/** Distant schools crossing the back: how often (s), how many fish, opacity, and speed (tank units/s). */
export const SCHOOL_MIN_S = 60;
export const SCHOOL_MAX_S = 180;
export const SCHOOL_FIRST_S = 25;
export const SCHOOL_SIZE = [7, 13] as const;
export const SCHOOL_ALPHA = 0.2;
export const SCHOOL_SPEED = 26;

/** Day cycle: how strongly the time-of-day tint applies (1 = full); the night theme picture is already dark. */
export const DAY_TINT_STRENGTH = 1;

/** Decor idle "breathing": scale ±this, at a random rate between these (radians per second). */
export const DECOR_BREATHE = 0.01;
export const DECOR_BREATHE_FREQ = [0.35, 0.7] as const;
/** Contact shadows slide with the light: tank units at full sun angle. */
export const SHADOW_SHIFT = 5;
/** Plant sway spring: stiffness and damping (per second²/per second); lean per unit of current; push from passing fish. */
export const PLANT_STIFFNESS = 9;
export const PLANT_DAMPING = 3.2;
export const PLANT_CURRENT_LEAN = 0.45;
export const PLANT_FISH_PUSH = 0.9;
/** Rock bubble streams and sheen: gaps between events (s). */
export const ROCK_BUBBLE_GAP = [8, 20] as const;
export const SHEEN_GAP = [12, 26] as const;
export const SHEEN_MS = 1800;
/** Castle: doorway visitor gap (s) and how long its swim lasts (ms). */
export const DOOR_FISH_GAP = [55, 140] as const;
export const DOOR_FISH_MS = 4200;
/** Chest: open every this many seconds, stay open this long (ms); lid spring stiffness/damping. */
export const CHEST_OPEN_GAP = [30, 45] as const;
export const CHEST_OPEN_HOLD_MS = 3500;
export const LID_STIFFNESS = 26;
export const LID_DAMPING = 5;
export const LID_CLOSE_STIFFNESS = 5;
export const LID_CLOSE_DAMPING = 3.4;
/** Shipwreck: rocking (degrees) and rate; bubble trail gap (s). */
export const WRECK_ROCK_DEG = 1;
export const WRECK_ROCK_SPEED = 0.45;
export const WRECK_TRAIL_GAP = [0.45, 0.9] as const;
/** Shell/pearl drops: landing bounce length (ms) and drop height (tank units); glint gaps (s); fly-to-HUD length (ms). */
export const DROP_LAND_MS = 900;
export const DROP_FALL_HEIGHT = 26;
export const DROP_GLINT_GAP = [3, 6] as const;
export const DROP_FLY_MS = 750;
/** Eggs: shell chips and sparkles in the hatch burst. */
export const EGG_BURST_CHIPS = 7;
/** Night theme: glow radius around sprites in CSS pixels. */
export const SPRITE_NIGHT_GLOW_PX = 8;
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
/** Notification budget: one toast at a time; the rest wait in a short queue (oldest dropped beyond it). */
export const MAX_VISIBLE_TOASTS = 1;
export const TOAST_QUEUE_MAX = 4;
/** Feed / Premium / Clean switch back to looking after this long without a tap in the tank. */
export const MODE_IDLE_EXIT_MS = 20 * SECOND_MS;
/** localStorage: the level whose "What's next" goal chip the player dismissed. */
export const GOAL_DISMISSED_KEY = 'fishbowl-goal-dismissed';
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
export const AUTH_GOOGLE_ENABLED = true;
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
  tankCapacity: TANK_BASE_CAPACITY[0],
  tankCleanliness: 100,
  fishSpecies: 'danio' as const,
  fishCount: 2,
  fishStage: 'baby' as const,
  settings: { muted: true, reducedMotion: false },
} as const;

/** Initial stats for any newly bought or hatched fish. */
export const NEW_FISH_HUNGER = 80;
export const NEW_FISH_HAPPINESS = 70;

// Jellyfish (render/jellyMotion.ts, behavior.ts updateJelly, drawJelly.ts)
/** Bell pulse: contraction length, then the expansion (with a slight overshoot) back to rest. */
export const JELLY_CONTRACT_MS = 250;
export const JELLY_EXPAND_MS = 750;
/** Bell scale at full contraction (narrower and taller). */
export const JELLY_CONTRACT_SX = 0.85;
export const JELLY_CONTRACT_SY = 1.1;
/** Seconds between propulsion pulses (random in this range). */
export const JELLY_PULSE_GAP_MIN_MS = 1500;
export const JELLY_PULSE_GAP_MAX_MS = 3000;
/** Speed (tank units/s) one pulse adds, upward and at most sideways, spread over the contraction. */
export const JELLY_PULSE_UP = 46;
export const JELLY_PULSE_SIDE = 22;
/** Water drag (per second) and the gentle sinking between pulses (acceleration, max speed). */
export const JELLY_DRAG = 1.1;
export const JELLY_SINK_ACCEL = 6;
export const JELLY_SINK_MAX = 9;
/** Sideways acceleration from the global current (tank units/s² at current 1). */
export const JELLY_CURRENT_ACCEL = 9;
/** The jelly's center stays in the upper part of the water column (fraction of SAND_Y). */
export const JELLY_MAX_Y_FRAC = 0.62;
/** Gentle wobble rotation (radians, ±5°) and its rate (radians/s). */
export const JELLY_WOBBLE = 0.087;
export const JELLY_WOBBLE_FREQ = 0.8;
/** Babies pulse more often, smaller, and bob; reduced motion pulses slower and smaller. */
export const JELLY_BABY_GAP = 0.65;
export const JELLY_BABY_PULSE = 0.6;
export const JELLY_REDUCED_GAP = 1.5;
export const JELLY_REDUCED_PULSE = 0.5;
/** Tentacles: horizontal strips below the bell split, sway amplitude at the tips (fraction of sprite width), sway speed (rad/s). */
export const JELLY_TENTACLE_STRIPS = 18;
export const JELLY_SWAY_AMP = 0.045;
export const JELLY_SWAY_FREQ = 1.6;
/** Phase step per strip, so the sway travels down toward the tips. */
export const JELLY_SWAY_STRIP_PHASE = 0.32;
/** Envelope exponent: the tips sway most, the tops stay attached. */
export const JELLY_SWAY_FALLOFF = 1.4;
/** After-pulse ripple: amplitude (fraction of width), how long it takes to reach the tips, how long it lasts, wiggle rate. */
export const JELLY_RIPPLE_AMP = 0.05;
export const JELLY_RIPPLE_TRAVEL_MS = 420;
export const JELLY_RIPPLE_MS = 900;
export const JELLY_RIPPLE_FREQ = 14;
/** Tentacles stretch (y) and narrow (x) when rising, relax and spread when drifting down. */
export const JELLY_RISE_STRETCH_Y = 0.08;
export const JELLY_RISE_NARROW_X = 0.1;
export const JELLY_DRIFT_SPREAD_X = 0.08;
export const JELLY_DRIFT_RELAX_Y = 0.03;
/** Vertical speed (tank units/s) that counts as fully rising/sinking, and how fast the tentacles follow (per second). */
export const JELLY_RISE_SPEED = 18;
export const JELLY_TENTACLE_SMOOTHING = 3;
/** Tentacle lean (fraction of width at the tips) per unit of current, and per tank unit/s of sideways speed (trailing). */
export const JELLY_CURRENT_LEAN = 0.08;
export const JELLY_TRAIL_LEAN = 0.004;
/** The pellet-catching area under the bell: this fraction of the sprite width, centered. */
export const JELLY_CATCH_WIDTH = 0.7;
/** A caught pellet slides up the tentacles into the bell over this long. */
export const JELLY_CATCH_SLIDE_MS = 650;
/** Pellets this close (tank units) draw the jelly toward them, slowly. */
export const JELLY_FOOD_RANGE = 260;
export const JELLY_FOOD_ACCEL = 10;
/** Tap: this many quick happy pulses, this far apart. Plus a glow flash of this length. */
export const JELLY_HAPPY_PULSES = 3;
export const JELLY_HAPPY_GAP_MS = 330;
export const JELLY_FLASH_MS = 900;
/** Look: overall opacity, baked inner glow strength, night glow blur (CSS px) and halo size (× width). */
export const JELLY_ALPHA = 0.88;
export const JELLY_INNER_GLOW = 0.28;
export const JELLY_NIGHT_GLOW_PX = 18;
export const JELLY_HALO_SCALE = 1.5;
export const JELLY_HALO_ALPHA = 0.26;
/** Shiny: rainbow shimmer strength and speed (cycles per second). */
export const JELLY_SHIMMER_ALPHA = 0.32;
export const JELLY_SHIMMER_SPEED = 0.12;
/** Faint, large, blurry shadow on the sand. */
export const JELLY_SHADOW_ALPHA = 0.07;
export const JELLY_SHADOW_SCALE = 1.6;
/** Fish keep out of the tentacles: repulsion strength and the extra margin around the catch area (tank units). */
export const JELLY_AVOID_WEIGHT = 1.4;
export const JELLY_AVOID_MARGIN = 14;
/** Dance Mode: beats per minute (jellies pulse on every beat). */
export const DANCE_BPM = 112;
