// Per-asset art config for the generated sprites in /public/assets: which file each theme background,
// decor item and icon uses, plus how it sits in the tank. Sizes are tank units (the world is 1000×625).
// File names are explicit (and case-sensitive on the server) so odd export names never need renaming.
import type { DecorId, ThemeId } from '../game/types';

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
  | 'bubbleTrail';

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
  lid?: LidConfig;
}

export interface DecorArt {
  file: string;
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

export const DECOR_ART: Record<DecorId, DecorArt> = {
  plant_small: { file: 'elements/plant_small.png', width: 74, layer: 'front', sink: 0.04, behaviors: ['sway', 'breathe'], sway: { amp: 3.5, speed: 1.1 } },
  plant_tall: { file: 'elements/plant_tall.png', width: 96, layer: 'front', sink: 0.04, behaviors: ['sway', 'breathe'], sway: { amp: 6.5, speed: 0.7 } },
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
