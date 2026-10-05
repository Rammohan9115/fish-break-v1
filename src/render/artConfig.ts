// Per-asset art config for the generated sprites in /public/assets: which file each theme background,
// decor item and icon uses, plus how it sits in the tank. Sizes are tank units (the world is 1000×625).
// File names are explicit (and case-sensitive on the server) so odd export names never need renaming.
import type { DecorId, SpeciesId, ThemeId } from '../game/types';

export interface ThemeArt {
  /** Path under /assets/. */
  file: string;
  /**
   * Where the resting line for decor, shells, eggs and the axolotl sits in the picture, as a percent
   * of its height from the top. The picture is placed so this line lands exactly on SAND_Y.
   */
  sandLineY: number;
  /** Water color mixed faintly into decor so it blends into this theme's water. */
  tint: string;
  /** How strongly the time-of-day tint applies (the night picture is already dark). */
  dayTint: number;
  /** Decor lights never dim below this (the night theme keeps its windows lit). */
  minLights: number;
}

export const THEME_ART: Record<ThemeId, ThemeArt> = {
  classic: { file: 'coral/classics.PNG', sandLineY: 84, tint: '#1f8fd0', dayTint: 1, minLights: 0 },
  coral: { file: 'coral/4912EADC-0920-4FD9-AB6A-CC4A494E559B.PNG', sandLineY: 84, tint: '#14a6c8', dayTint: 1, minLights: 0 },
  night: { file: 'coral/Night.PNG', sandLineY: 84, tint: '#2a2f9a', dayTint: 0.45, minLights: 0.85 },
  pond: { file: 'coral/green.PNG', sandLineY: 84, tint: '#1f8a6a', dayTint: 1, minLights: 0 },
};

/** Dev-panel overrides of `sandLineY` (runtime only, never saved). */
const sandLineOverride = new Map<ThemeId, number>();

export function sandLineY(theme: ThemeId): number {
  return sandLineOverride.get(theme) ?? THEME_ART[theme].sandLineY;
}

export function setSandLineY(theme: ThemeId, percent: number): void {
  sandLineOverride.set(theme, percent);
}

/** 'front' decor draws over the fish; 'back' decor draws behind them. */
export type DecorLayer = 'front' | 'back';

/**
 * Reusable decor behaviors (render/ambient/decorBehaviors.ts). A new decor item only needs a list of
 * these plus its anchor points; no new code.
 * - sway: bends in horizontal strips (base fixed), springs with currents and passing fish
 * - breathe: barely-there idle scale (±1%)
 * - bubbleStream: now and then a short stream of bubbles from `anchors.crevice`
 * - sheen: a soft light band sweeps across it now and then (moss shimmer)
 * - flag: the `anchors.flag` rect is cut out and waves
 * - windowGlow / lanternGlow: warm lights at `anchors.windows` / `anchors.lanterns`, on at night
 * - doorwayFish: once in a while a tiny fish swims out of `anchors.door`
 * - lidOpen: the part above `anchors.lid.line` rotates around its hinge, opening every 30–45s
 * - bubbleBurst / glint: on opening, bubbles and a gold glint at `anchors.glint`
 * - rocking: slow ±1° rock around the base
 * - bubbleTrail: a thin steady trail of bubbles from `anchors.trail`
 * - roll: rolls a little with the current (shift + matching rotation)
 * - nightGlow: soft colored glows at `anchors.glows`, on at night
 * - sparkle: now and then gold glints at `anchors.glint` (no lid needed)
 * - bob: floats up and down (surface/mid-water decor)
 * - spin: slowly turns around (scaleX through 0), like a toy on the water
 * - bubbleRing: every ~40s a bubble ring from `anchors.mouth`
 * - giftFlag: the `anchors.flag` rect is cut out and pivots at `anchors.flagPivot`: up when the daily gift is ready, down otherwise
 * - eruption: every ~45s a big burst of bubbles from `anchors.trail[0]`
 * - curtain: a code-drawn curtain of bubbles rising from `anchors.curtain`
 * - drift: drifts slowly side to side around its x (mid-water toys)
 * - propeller: the `anchors.propeller` rect is cut out and spins (squashes in x)
 */
export type DecorBehavior =
  | 'sway'
  | 'breathe'
  | 'bubbleStream'
  | 'sheen'
  | 'flag'
  | 'windowGlow'
  | 'lanternGlow'
  | 'doorwayFish'
  | 'lidOpen'
  | 'bubbleBurst'
  | 'glint'
  | 'rocking'
  | 'bubbleTrail'
  | 'roll'
  | 'nightGlow'
  | 'sparkle'
  | 'bob'
  | 'spin'
  | 'bubbleRing'
  | 'giftFlag'
  | 'eruption'
  | 'curtain'
  | 'drift'
  | 'propeller';

/** A point on the trimmed sprite: [u from the left, v from the top], both 0..1. */
export type UV = [number, number];

export interface LidConfig {
  /** Everything above this line (v) is the lid. */
  line: number;
  hinge: UV;
  /** Resting angle (degrees, clockwise) that closes the lid from how the sprite is drawn; opening swings to 0. */
  closeDeg: number;
}

export interface DecorAnchors {
  crevice?: UV;
  door?: UV;
  windows?: UV[];
  lanterns?: UV[];
  trail?: UV[];
  glint?: UV[];
  /** Waving part (normalized rect); the flag's hoist is its left edge. */
  flag?: { x0: number; y0: number; x1: number; y1: number };
  /** giftFlag: where the flag pivots (the bottom of its pole). */
  flagPivot?: UV;
  lid?: LidConfig;
  /** nightGlow: soft glows (radius as a fraction of the drawn width). */
  glows?: { uv: UV; r: number; color: string }[];
  /** bubbleRing: where the ring is blown from. */
  mouth?: UV;
  /** curtain: the bubble curtain's span along the bar (u from/to) and the height it starts at (v). */
  curtain?: { u0: number; u1: number; v: number };
  /** propeller: the spinning part (normalized rect). */
  propeller?: { x0: number; y0: number; x1: number; y1: number };
  /** Fish visit this point now and then: 'through' (swim through a gap) or 'hover' (linger; `species` favor it). */
  attract?: { uv: UV; kind: 'through' | 'hover'; species?: SpeciesId };
}

export interface DecorArt {
  file: string;
  /** Source rect [x, y, w, h] in a sprite sheet (the file holds several items); omit for single-sprite files. */
  rect?: [number, number, number, number];
  /** Drawn width; the height follows the sprite's aspect ratio. */
  width: number;
  layer: DecorLayer;
  /** How far the sprite's bottom sinks below the sand line, as a fraction of its height (round bottoms shouldn't float). */
  sink: number;
  behaviors: DecorBehavior[];
  anchors?: DecorAnchors;
  /** Sway: how far the tip travels (tank units) and how fast (radians per second). Tall plants: slower, wider. */
  sway?: { amp: number; speed: number };
}

/** The decor sprite sheets (several items per file, cut out by `rect`). */
const SHEET = {
  nature: 'elements/nature.PNG',
  ruins: 'elements/ruins.PNG',
  village: 'elements/village.PNG',
  playful: 'elements/playful.PNG',
  halloween: 'elements/halloween.PNG',
} as const;

export const DECOR_ART: Record<DecorId, DecorArt> = {
  plant_small: { file: 'elements/plant_small.png', width: 74, layer: 'back', sink: 0.04, behaviors: ['sway', 'breathe'], sway: { amp: 3.5, speed: 1.1 } },
  plant_tall: { file: 'elements/plant_tall.png', width: 96, layer: 'back', sink: 0.04, behaviors: ['sway', 'breathe'], sway: { amp: 6.5, speed: 0.7 } },
  rock: {
    file: 'elements/rock.png',
    width: 100,
    layer: 'back',
    sink: 0.08,
    behaviors: ['bubbleStream', 'sheen', 'breathe'],
    anchors: { crevice: [0.7, 0.74] },
  },
  castle: {
    file: 'elements/sandcastle.png',
    width: 124,
    layer: 'back',
    sink: 0.03,
    behaviors: ['flag', 'windowGlow', 'doorwayFish', 'breathe'],
    anchors: {
      flag: { x0: 0.535, y0: 0, x1: 0.76, y1: 0.125 },
      door: [0.5, 0.57],
      windows: [
        [0.19, 0.72],
        [0.81, 0.72],
        [0.5, 0.55],
      ],
    },
  },
  chest: {
    file: 'elements/treasure_chest.png',
    width: 92,
    layer: 'back',
    sink: 0.04,
    behaviors: ['lidOpen', 'bubbleBurst', 'glint', 'breathe'],
    anchors: {
      lid: { line: 0.36, hinge: [0.08, 0.4], closeDeg: 12 },
      glint: [
        [0.5, 0.36],
        [0.68, 0.4],
      ],
    },
  },
  shipwreck: {
    file: 'elements/shipwreck.png',
    width: 184,
    layer: 'back',
    sink: 0.06,
    behaviors: ['rocking', 'bubbleTrail', 'lanternGlow', 'breathe'],
    anchors: {
      trail: [
        [0.66, 0.79],
        [0.77, 0.79],
      ],
      lanterns: [
        [0.66, 0.79],
        [0.77, 0.79],
        [0.92, 0.43],
      ],
    },
  },
  // ---- Nature (nature.PNG) ----
  moss_ball: { file: SHEET.nature, rect: [68, 152, 320, 328], width: 54, layer: 'back', sink: 0.07, behaviors: ['roll', 'breathe'] },
  driftwood: { file: SHEET.nature, rect: [484, 72, 556, 424], width: 124, layer: 'back', sink: 0.05, behaviors: ['breathe'] },
  flower_plant: {
    file: SHEET.nature,
    rect: [1056, 72, 440, 424],
    width: 84,
    layer: 'back',
    sink: 0.03,
    behaviors: ['sway', 'nightGlow', 'breathe'],
    sway: { amp: 3, speed: 0.9 },
    anchors: {
      glows: [
        { uv: [0.58, 0.13], r: 0.16, color: '255, 140, 190' },
        { uv: [0.27, 0.27], r: 0.14, color: '255, 140, 190' },
        { uv: [0.84, 0.33], r: 0.14, color: '255, 205, 90' },
        { uv: [0.53, 0.51], r: 0.15, color: '255, 205, 90' },
      ],
    },
  },
  coral_branch: {
    file: SHEET.nature,
    rect: [0, 544, 404, 408],
    width: 86,
    layer: 'back',
    sink: 0.05,
    behaviors: ['sparkle', 'breathe'],
    anchors: {
      glint: [
        [0.2, 0.06],
        [0.62, 0.1],
        [0.88, 0.3],
      ],
    },
  },
  anemone: {
    file: SHEET.nature,
    rect: [408, 584, 424, 360],
    width: 92,
    layer: 'back',
    sink: 0.05,
    behaviors: ['sway', 'breathe'],
    sway: { amp: 4.5, speed: 1.2 },
    anchors: { attract: { uv: [0.5, 0.1], kind: 'hover', species: 'clownfish' } },
  },
  sea_fan: { file: SHEET.nature, rect: [828, 544, 352, 400], width: 88, layer: 'back', sink: 0.04, behaviors: ['sway'], sway: { amp: 3.5, speed: 0.45 } },
  lily_pad: { file: SHEET.nature, rect: [1184, 700, 352, 248], width: 82, layer: 'back', sink: 0, behaviors: ['bob'] },
  // ---- Ancient Ruins (ruins.PNG) ----
  column: { file: SHEET.ruins, rect: [112, 68, 416, 472], width: 72, layer: 'back', sink: 0.04, behaviors: ['sheen', 'breathe'] },
  sunken_vase: {
    file: SHEET.ruins,
    rect: [80, 632, 548, 496],
    width: 96,
    layer: 'back',
    sink: 0.05,
    behaviors: ['bubbleStream', 'breathe'],
    anchors: { crevice: [0.72, 0.14] },
  },
  broken_arch: {
    file: SHEET.ruins,
    rect: [692, 60, 608, 480],
    width: 140,
    layer: 'back',
    sink: 0.04,
    behaviors: ['sheen', 'breathe'],
    anchors: { attract: { uv: [0.49, 0.62], kind: 'through' } },
  },
  stone_head: {
    file: SHEET.ruins,
    rect: [720, 632, 536, 508],
    width: 98,
    layer: 'back',
    sink: 0.04,
    behaviors: ['bubbleRing', 'breathe'],
    anchors: { mouth: [0.41, 0.52] },
  },
  // ---- Cozy Village (village.PNG) ----
  bench: { file: SHEET.village, rect: [776, 732, 520, 396], width: 92, layer: 'back', sink: 0.03, behaviors: ['breathe'] },
  mailbox: {
    file: SHEET.village,
    rect: [180, 640, 356, 496],
    width: 62,
    layer: 'back',
    sink: 0.03,
    behaviors: ['giftFlag', 'breathe'],
    anchors: { flag: { x0: 0.53, y0: 0, x1: 0.8, y1: 0.31 }, flagPivot: [0.63, 0.29] },
  },
  lantern: {
    file: SHEET.village,
    rect: [856, 72, 412, 524],
    width: 64,
    layer: 'back',
    sink: 0.03,
    behaviors: ['lanternGlow', 'breathe'],
    anchors: { lanterns: [[0.43, 0.66]], glows: [{ uv: [0.43, 0.62], r: 0.9, color: '255, 190, 100' }] },
  },
  tiny_cottage: {
    file: SHEET.village,
    rect: [96, 76, 552, 516],
    width: 132,
    layer: 'back',
    sink: 0.03,
    behaviors: ['windowGlow', 'bubbleTrail', 'doorwayFish', 'breathe'],
    anchors: {
      windows: [
        [0.25, 0.65],
        [0.8, 0.65],
      ],
      door: [0.55, 0.74],
      trail: [[0.72, 0.1]],
    },
  },
  // ---- Playful (playful.PNG) ----
  rubber_duck: { file: SHEET.playful, rect: [1112, 196, 368, 356], width: 56, layer: 'back', sink: 0, behaviors: ['bob', 'spin'] },
  diver: {
    file: SHEET.playful,
    rect: [628, 104, 368, 464],
    width: 70,
    layer: 'back',
    sink: 0.03,
    behaviors: ['bubbleTrail', 'breathe'],
    anchors: { trail: [[0.51, 0.03]] },
  },
  volcano_bubbler: {
    file: SHEET.playful,
    rect: [56, 128, 500, 420],
    width: 108,
    layer: 'back',
    sink: 0.04,
    behaviors: ['bubbleTrail', 'eruption', 'breathe'],
    anchors: { trail: [[0.49, 0.08], [0.45, 0.09], [0.53, 0.09]] },
  },
  bubble_wall_base: {
    file: SHEET.playful,
    rect: [780, 772, 668, 168],
    width: 170,
    layer: 'back',
    sink: 0.1,
    behaviors: ['curtain'],
    anchors: { curtain: { u0: 0.12, u1: 0.9, v: 0.15 }, attract: { uv: [0.5, -1.2], kind: 'through' } },
  },
  toy_submarine: {
    file: SHEET.playful,
    rect: [116, 588, 516, 372],
    width: 96,
    layer: 'back',
    sink: 0,
    behaviors: ['drift', 'bob', 'propeller'],
    anchors: { propeller: { x0: 0, y0: 0.27, x1: 0.16, y1: 0.86 } },
  },
  // ---- Halloween (halloween.PNG) ----
  pumpkin: {
    file: SHEET.halloween,
    rect: [96, 176, 736, 576],
    width: 80,
    layer: 'back',
    sink: 0.04,
    behaviors: ['nightGlow', 'breathe'],
    anchors: {
      glows: [
        { uv: [0.47, 0.73], r: 0.32, color: '255, 160, 40' },
        { uv: [0.33, 0.46], r: 0.16, color: '255, 200, 60' },
        { uv: [0.6, 0.46], r: 0.16, color: '255, 200, 60' },
      ],
    },
  },
  spooky_tree: { file: SHEET.halloween, rect: [1180, 64, 732, 696], width: 108, layer: 'back', sink: 0.03, behaviors: ['sway'], sway: { amp: 3, speed: 0.5 } },
};

/** Dev-tool overrides of a lid's line and hinge (runtime only). */
const lidOverride = new Map<DecorId, LidConfig>();

export function lidConfig(decorId: DecorId): LidConfig | null {
  return lidOverride.get(decorId) ?? DECOR_ART[decorId].anchors?.lid ?? null;
}

export function setLidConfig(decorId: DecorId, lid: LidConfig): void {
  lidOverride.set(decorId, lid);
}

export type IconId = 'shell' | 'pearl' | 'egg';

export interface IconArt {
  file: string;
  /** Drawn width when the item rests on the sand. */
  width: number;
  sink: number;
}

export const ICON_ART: Record<IconId, IconArt> = {
  shell: { file: 'elements/shell.png', width: 24, sink: 0.08 },
  pearl: { file: 'elements/pearl.png', width: 20, sink: 0.08 },
  // The four-egg cluster ("coral_bubbles") is the egg sprite.
  egg: { file: 'elements/coral_bubbles.png', width: 30, sink: 0.06 },
};
