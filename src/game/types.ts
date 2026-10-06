// Core data model for Fishbowl Break. Pure types only — no runtime code.

/** Injectable random source returning a float in [0, 1). */
export type Rng = () => number;

export type SpeciesId =
  | 'danio'
  | 'guppy'
  | 'goldfish'
  | 'tetra'
  | 'betta'
  | 'angelfish'
  | 'jellyfish'
  | 'clownfish'
  | 'puffer'
  | 'axolotl'
  | 'koi';

export type DecorId =
  | 'plant_small'
  | 'plant_tall'
  | 'rock'
  | 'castle'
  | 'chest'
  | 'shipwreck'
  // Nature
  | 'moss_ball'
  | 'driftwood'
  | 'flower_plant'
  | 'coral_branch'
  | 'anemone'
  | 'sea_fan'
  | 'lily_pad'
  // Ancient Ruins
  | 'column'
  | 'sunken_vase'
  | 'broken_arch'
  | 'stone_head'
  // Cozy Village
  | 'bench'
  | 'mailbox'
  | 'lantern'
  | 'tiny_cottage'
  // Playful
  | 'rubber_duck'
  | 'diver'
  | 'volcano_bubbler'
  | 'bubble_wall_base'
  | 'toy_submarine'
  // Halloween (October event)
  | 'pumpkin'
  | 'spooky_tree';

export type CollectionId = 'nature' | 'ruins' | 'village' | 'playful' | 'halloween';

/** Where a decor item lives: on the sand, floating at the surface, or drifting mid-water. */
export type DecorPlacement = 'sand' | 'surface' | 'mid';

export type ThemeId = 'classic' | 'night' | 'coral' | 'pond';

export type Stage = 'egg' | 'baby' | 'juvenile' | 'adult';

export type Currency = 'shells' | 'pearls';

export interface Price {
  currency: Currency;
  amount: number;
}

/** Pastel color palette for one fish variant. */
export interface FishVariant {
  key: string;
  name: string;
  body: string;
  belly: string;
  fin: string;
  accent: string;
  outline: string;
  /** Sprite species drawn from one master sprite (jellyfish): hue rotation in degrees for this variant. */
  hue?: number;
}

export type SpeciesTrait = 'darts' | 'flowyTail' | 'chubby' | 'glowStripe' | 'schools' | 'bigFins' | 'tall' | 'inflates' | 'walksOnSand' | 'smiles' | 'jelly';

/** How a sprite fish moves its body (renderer only). */
export type Gait = 'swim' | 'bob' | 'walk' | 'pulse';

/** Per-species procedural animation for the PNG sprites. Multipliers are relative to the global tuning in constants.ts. */
export interface SpriteMotion {
  /** Body-wave amplitude multiplier (tail sway). */
  waveAmp: number;
  /** Body-wave speed multiplier (strokes per second). */
  waveSpeed: number;
  /**
   * 'swim' = body wave only; 'bob' = gentle whole-body bob (puffer); 'walk' = stepping bob and rock (axolotl);
   * 'pulse' = jellyfish bell pulse + tentacle sway (render/jellyMotion.ts, waveAmp/waveSpeed scale the sway).
   */
  gait: Gait;
}

/** An eye drawn over a sprite: center as a fraction of the trimmed sprite (x from the tail, y from the top), diameter as a fraction of its height. */
export interface SpriteEye {
  x: number;
  y: number;
  size: number;
  /** A second, identical eye at this x (a front-facing face, e.g. the jellyfish). */
  twinX?: number;
}

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  unlockLevel: number;
  cost: Price;
  growMinutes: number;
  /** Hunger points lost per minute. */
  hungerRate: number;
  /** Sell price as an adult, in shells. */
  sellPrice: number;
  dropMinutes: number;
  dropValue: number;
  /** Cruise speed in px/s at adult scale (renderer only). */
  speed: number;
  /** If set, this species can only live in a tank with this theme. */
  themeOnly: ThemeId | null;
  traits: SpeciesTrait[];
  variants: FishVariant[];
  motion: SpriteMotion;
  /** Eye placement on the adult sprite (also used for juveniles) and on the baby sprite. */
  eye: { adult: SpriteEye; baby: SpriteEye };
  /** Jellyfish: where the bell ends and the tentacles start, as a fraction of the trimmed sprite height (from the top). */
  bellSplitY?: { adult: number; baby: number };
}

/** A decor item. Never level-gated: anyone can buy anything they can afford (event items only in season). */
export interface DecorDef {
  id: DecorId;
  name: string;
  cost: Price;
  /** null = the original "Classic" pieces. */
  collection: CollectionId | null;
  placement: DecorPlacement;
}

export interface CollectionDef {
  id: CollectionId;
  name: string;
  icon: string;
  /** Seasonal: only buyable during this event (owned pieces stay forever). */
  event: 'october' | null;
}

export interface Fish {
  id: string;
  speciesId: SpeciesId;
  name: string;
  variant: string;
  shiny: boolean;
  stage: Stage;
  /** Seconds of growth accumulated, 0..species.growMinutes*60. */
  growth: number;
  /** 0..100 (100 = full). */
  hunger: number;
  /** 0..100. */
  happiness: number;
  bornAt: number;
  lastBredAt: number | null;
  lastDropAt: number;
  /** Premium-food 2x growth boost active until this time (ms), or null. */
  boostUntil: number | null;
  tankId: string;
  /** Bond with the player (only ever goes up). Petting and hand-feeding raise it. */
  bondPoints: number;
  /** 0 Stranger … 5 Soulmate, derived from bondPoints (thresholds in BOND.levels). */
  bondLevel: BondLevel;
  /** Timestamps of rewarded pet sessions in the last hour (pruned; enforces the per-hour cap). */
  petLog: number[];
  lastPettedAt: number | null;
  /** Timestamps of hand-feeding bond grants in the last hour (pruned; enforces the per-hour cap). */
  feedBondLog: number[];
}

export type BondLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface Egg {
  id: string;
  speciesId: SpeciesId;
  variant: string;
  shiny: boolean;
  tankId: string;
  hatchAt: number;
  /** Where it was laid on the sand (tank units); older eggs pick a stable spot from their id. */
  x?: number;
  /** Bond points the baby starts with (decided when laid, from its parents' bond). */
  startBond?: number;
  /** Ready to hatch, but the tank and the Nursery are full: it waits (set once, for a one-time notice). */
  waiting?: boolean;
}

/** Two fish swimming their heart loop; an egg is laid (guaranteed) at `x` when it ends. */
export interface Courtship {
  id: string;
  tankId: string;
  fishIds: [string, string];
  startedAt: number;
  endsAt: number;
  x: number;
}

export interface AlgaeSpot {
  id: string;
  x: number;
  y: number;
  size: number;
}

export type DecorSize = 'S' | 'M' | 'L';
export interface PlacedDecor {
  id: string;
  decorId: DecorId;
  x: number;
  /** Mirrored horizontally. */
  flipped: boolean;
  /** S/M/L = 0.8 / 1.0 / 1.2 scale. */
  size: DecorSize;
  /** Sand items: depth from 0 (far) to 1 (near); 0.5 is the sand line. Surface and mid-water items ignore it. */
  z: number;
}

/** One item of a saved layout (no id: it's placed from the decor box when applied). */
export type PresetItem = Omit<PlacedDecor, 'id'>;

export interface LayoutPreset {
  name: string;
  items: PresetItem[];
}

export type StyleCategory = 'frame' | 'substrate' | 'lighting' | 'water' | 'bubbler';

/** A tank's look (all code-drawn). Values are option ids from STYLE_OPTIONS. */
export interface TankStyle {
  frame: string;
  substrate: string;
  lighting: string;
  /** Custom lighting color ('#rrggbb'), used when lighting is 'custom'. */
  lightingColor: string;
  water: string;
  bubbler: string;
  /** Show the tank's name on a plaque on the frame. */
  nameplate: boolean;
}

export interface StyleOption {
  /** `${category}:${key}`, e.g. 'frame:wood'. */
  id: string;
  category: StyleCategory;
  key: string;
  name: string;
  /** null = free. */
  price: Price | null;
}

export interface Pellet {
  id: string;
  x: number;
  y: number;
  vy: number;
  premium: boolean;
  landedAt: number | null;
}

/** The three depth planes on the sand (shared by decor depth presets and drops). */
export type DepthPlane = 'back' | 'mid' | 'front';

export interface ShellDrop {
  id: string;
  x: number;
  /** Which depth plane it landed on (decides its y, size and draw order). */
  plane: DepthPlane;
  value: number;
  pearl: boolean;
}

export interface Tank {
  id: string;
  name: string;
  theme: ThemeId;
  /** Base capacity (by purchase order) + CAPACITY_UPGRADE.slots per upgrade. */
  capacity: number;
  /** Capacity upgrades bought for this tank. */
  upgrades: number;
  cleanliness: number;
  algaeSpots: AlgaeSpot[];
  decor: PlacedDecor[];
  pellets: Pellet[];
  /** Uncollected drops on the sand; click to collect. */
  shells: ShellDrop[];
  style: TankStyle;
  /** Up to 3 saved decor layouts (null = empty slot). */
  layoutPresets: (LayoutPreset | null)[];
}

export interface Settings {
  muted: boolean;
  reducedMotion: boolean;
  /** UI sizing: 'compact' (default; older saves lack it) or 'comfortable' (the original larger sizes). */
  display?: 'compact' | 'comfortable';
  /** The Tools tray is slid out (older saves lack it: closed). */
  toolsOpen?: boolean;
}

export interface Stats {
  fed: number;
  hatched: number;
  cleaned: number;
}

export interface GameState {
  version: number;
  shells: number;
  pearls: number;
  /** XP progress toward the next level. */
  xp: number;
  level: number;
  tanks: Tank[];
  activeTankId: string;
  fish: Fish[];
  eggs: Egg[];
  courtships: Courtship[];
  /** Babies that hatched into a full tank. They nap here (no growth, no hunger); tankId is ''. */
  nursery: Fish[];
  /** The breeding guide (seen once) and the "Your first baby" quest. */
  breedingQuest: { guideSeen: boolean; status: 'off' | 'active' | 'done' };
  inventory: { premiumFood: number };
  lastTickAt: number;
  /** 'YYYY-MM-DD' local date. */
  lastDailyGift: string | null;
  settings: Settings;
  stats: Stats;
  /** Feeding XP earned in the current hour-long window (enforces the 30 XP/hour cap across reloads). */
  feedXp: { windowStart: number; earned: number };
  /** Themes bought (classic is always owned). Bought once, applicable to any tank. */
  ownedThemes: ThemeId[];
  /** When Break Mode last granted XP (once per hour), or null. */
  lastBreakXpAt: number | null;
  /** Decor owned but not placed in any tank (the decor box): count per item. */
  decorInventory: Partial<Record<DecorId, number>>;
  /** Tank style options bought (option ids); reusable on every tank. Free options aren't listed. */
  ownedStyles: string[];
}
