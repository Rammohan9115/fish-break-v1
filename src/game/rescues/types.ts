// Rescue Stories: a rescue is DATA (rescues/<id>.ts). The engine in engine.ts runs any of them.
import type { CareItemId, DecorId, SpeciesId } from '../types';

export type TimeOfDay = 'day' | 'night';

/** Reusable care tasks. `label` is the checklist line, `hint` the "How?" text. */
export type CareTask = { label: string; hint: string; highlight?: HighlightTarget } & (
  | { type: 'placeDecor'; decorIds: DecorId[]; count?: number }
  | { type: 'useItem'; itemId: CareItemId; count: number }
  | { type: 'keepCleanliness'; min: number; minutes: number }
  | { type: 'pet'; count: number; maxSecondsPerPet?: number }
  | { type: 'feedAtTime'; timeOfDay: TimeOfDay }
  | { type: 'breakModeMinutes'; minutes: number }
  | { type: 'changeSubstrate'; substrateIds: string[] }
  | { type: 'ownSpecies'; speciesId: SpeciesId; count: number }
  | { type: 'interact'; actionId: string; count: number; /** A button in the Care tab that performs it. */ button?: string }
  | { type: 'decorPresent'; decorId: DecorId }
  /** Live play with no pellet dissolving on the sand; any dissolve restarts the count (cory-eaten pellets are fine). */
  | { type: 'noDissolve'; minutes: number }
);

/** What the "How?" hint lights up. */
export type HighlightTarget = 'shop' | 'decorate' | 'care' | 'pet' | 'clean' | 'break' | 'feed';

/** Where an overlay sits on the sprite, as fractions of its trimmed box (x from the left, y from the top). */
export interface Anchor {
  x: number;
  y: number;
}

/** How the animal looks during a stage (all drawn in code over the normal sprite). */
export interface StageVisual {
  bandage?: Anchor;
  cracks?: boolean;
  /** 0 = full color … 1 = grey. */
  desaturate?: number;
  /** Smaller, slower, hides near decor. */
  shy?: boolean;
  /** Hidden behind decor (only eye stalks peek). */
  hidden?: boolean;
  /** Kuhli: how far sunk into the sand, 0 = out … 1 = buried (eyes only ≈ 0.9). */
  burrow?: number;
  /** 0..1 trust (filled in at runtime for rescues with `trustMeter`): higher = peeks longer and slides out more often. */
  trust?: number;
  /** Hatchetfish: the band he may swim in, as fractions of the water (0 = surface … 1 = sand). Absent = the full surface zone. */
  zone?: { top: number; bottom: number };
  /** Hatchetfish hopping: none (stays down), practice (tiny hops), or full. */
  hops?: 'none' | 'practice' | 'full';
  /** The guided first leap is on: he jumps every few seconds and a glowing ring marks where to tap (set at runtime while the task is wanted). */
  leap?: boolean;
  /** Professor Whiskers: the older look (grey whisker highlights, tiny round glasses) and the lonely posture until friends arrive. */
  elder?: boolean;
}

export interface RescueStage {
  /** Short story line shown in the Care tab. */
  story: string;
  tasks: CareTask[];
  visual: StageVisual;
  /** Letter delivered when this stage is completed (optional). */
  letter?: { title: string; body: string };
  /** A journal entry added when this stage is completed (`{n}` = the other corys in the tank). */
  journal?: string;
}

export interface RescuePerks {
  /** Multiplies the crab's shell-dig chance (1.3 = +30%). */
  digBonus?: number;
  /** Tricks usable from bond level 0. */
  tricks?: string[];
  /** Swims to the glass to greet you on every return, like a Friendly (bond 2) fish, from day one. */
  greets?: boolean;
  /** Multiplies how often a hatchetfish hops (2 = twice as often). */
  hopRate?: number;
  /** The tiny round glasses overlay stays (drawn in code). */
  glasses?: boolean;
  /** Every cory in the tank eats landed pellets this much faster while he is present (0.25 = 25%). */
  groupEatBonus?: number;
  /** Tapping him shows a speech bubble with a gameplay tip. */
  tips?: boolean;
}

export interface RescueDef {
  id: string;
  speciesId: SpeciesId;
  /** The animal's name once rescued. */
  name: string;
  title: string;
  summary: string;
  estDays: number;
  /** Shows a trust meter in the Care tab and lets completed tasks change how boldly the animal behaves. */
  trustMeter?: boolean;
  /** Her color comes back smoothly with every bit of care: `desaturate` runs from this value down to 0 as the tasks fill in. */
  colorRecovery?: { from: number };
  intro: { title: string; body: string };
  /** What care involves, no spoilers (case file). */
  careNote: string;
  stages: RescueStage[];
  completion: { title: string; body: string };
  rewards: {
    /** Rescue-only color variant; absent = keeps his own colors (the reward is an accessory or perk). */
    variant?: string;
    items: Partial<Record<CareItemId, number>>;
    journal: string;
    perks: RescuePerks;
    /** Baby animals of the same species that hatch (as eggs) over the next hour once rescued. */
    colony?: number;
  };
}
