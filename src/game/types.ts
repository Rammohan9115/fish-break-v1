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
  | 'clownfish'
  | 'puffer'
  | 'axolotl'
  | 'koi';

export type DecorId = 'plant_small' | 'plant_tall' | 'rock' | 'castle' | 'chest' | 'shipwreck';

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
}

export type SpeciesTrait = 'darts' | 'flowyTail' | 'chubby' | 'glowStripe' | 'schools' | 'bigFins' | 'tall' | 'inflates' | 'walksOnSand' | 'smiles';

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
}

export interface DecorDef {
  id: DecorId;
  name: string;
  unlockLevel: number;
  cost: Price;
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
}

export interface Egg {
  id: string;
  speciesId: SpeciesId;
  variant: string;
  shiny: boolean;
  tankId: string;
  hatchAt: number;
}

export interface AlgaeSpot {
  id: string;
  x: number;
  y: number;
  size: number;
}

export interface PlacedDecor {
  id: string;
  decorId: DecorId;
  x: number;
}

export interface Pellet {
  id: string;
  x: number;
  y: number;
  vy: number;
  premium: boolean;
  landedAt: number | null;
}

export interface ShellDrop {
  id: string;
  x: number;
  value: number;
  pearl: boolean;
}

export interface Tank {
  id: string;
  name: string;
  theme: ThemeId;
  capacity: number;
  cleanliness: number;
  algaeSpots: AlgaeSpot[];
  decor: PlacedDecor[];
  pellets: Pellet[];
  /** Uncollected drops on the sand; click to collect. */
  shells: ShellDrop[];
}

export interface Settings {
  muted: boolean;
  reducedMotion: boolean;
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
}
