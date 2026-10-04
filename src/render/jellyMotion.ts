// Jellyfish animation and geometry math: the bell pulse (squash & stretch with overshoot), tentacle
// sway/ripple/lean per horizontal strip, the rise/drift tentacle shape, and the pellet-catching area.
// Pure functions (no DOM), shared by behavior.ts and drawJelly.ts and unit-tested. Hot-path helpers
// write into caller-owned objects so drawing allocates nothing per frame.
import {
  FISH_ART_SCALE,
  JELLY_CATCH_WIDTH,
  JELLY_CONTRACT_MS,
  JELLY_CONTRACT_SX,
  JELLY_CONTRACT_SY,
  JELLY_DRIFT_RELAX_Y,
  JELLY_DRIFT_SPREAD_X,
  JELLY_EXPAND_MS,
  JELLY_RIPPLE_AMP,
  JELLY_RIPPLE_FREQ,
  JELLY_RIPPLE_MS,
  JELLY_RIPPLE_TRAVEL_MS,
  JELLY_RISE_NARROW_X,
  JELLY_RISE_STRETCH_Y,
  JELLY_SWAY_AMP,
  JELLY_SWAY_FALLOFF,
  JELLY_SWAY_STRIP_PHASE,
  STAGE_SCALE,
} from '../game/constants';
import { getSpecies } from '../game/species';
import type { SpeciesId, Stage } from '../game/types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Jelly size in design units (before stage scale and FISH_ART_SCALE): sprite width and its height/width
 * per sprite. The renderer draws with the loaded sprite's real aspect; these drive hit tests and the sim-free behavior code.
 */
export const JELLY_DESIGN_W = 48;
export const JELLY_ASPECT = { adult: 1.39, baby: 1.06 } as const;

/** Drawn width and height of a jelly at this stage, in tank units. */
export function jellySize(stage: Stage): { w: number; h: number } {
  const w = JELLY_DESIGN_W * STAGE_SCALE[stage] * FISH_ART_SCALE;
  return { w, h: w * (stage === 'baby' ? JELLY_ASPECT.baby : JELLY_ASPECT.adult) };
}

/** Bell splits set live from the dev panel (they win over species.ts until reload). */
const splitOverrides = new Map<string, number>();
const DEFAULT_SPLIT = 0.45;

/** Where the bell ends and the tentacles start, as a fraction of the sprite height from the top. */
export function bellSplitY(speciesId: SpeciesId, stage: Stage): number {
  const art = stage === 'baby' ? 'baby' : 'adult';
  return splitOverrides.get(`${speciesId}:${art}`) ?? getSpecies(speciesId).bellSplitY?.[art] ?? DEFAULT_SPLIT;
}

export function setBellSplitY(speciesId: SpeciesId, art: 'adult' | 'baby', split: number): void {
  splitOverrides.set(`${speciesId}:${art}`, clamp(split, 0.1, 0.9));
}

export interface BellPulse {
  /** Bell scale across (x) and along (y). */
  sx: number;
  sy: number;
  /** 0..1: how contracted the bell is (drives the night glow). */
  squeeze: number;
}

/** Overshoot shape of the expansion: 1 → 0, dipping slightly below 0 (the bell over-expands) before settling. */
function expandCurve(u: number): number {
  return (1 - u) ** 2 * Math.cos(1.5 * Math.PI * u);
}

/**
 * Bell squash & stretch `ms` after a pulse started. The bell contracts (narrower, taller) over
 * JELLY_CONTRACT_MS × tempo, then expands back with a slight overshoot over JELLY_EXPAND_MS × tempo.
 * `strength` scales the squeeze (babies and reduced motion pulse smaller). Writes into `out`.
 */
export function bellPulse(ms: number, strength: number, tempo: number, out: BellPulse): BellPulse {
  const contract = JELLY_CONTRACT_MS * tempo;
  const expand = JELLY_EXPAND_MS * tempo;
  let k = 0;
  if (ms >= 0 && ms < contract) {
    const t = ms / contract;
    k = 1 - (1 - t) * (1 - t);
  } else if (ms >= contract && ms < contract + expand) {
    k = expandCurve((ms - contract) / expand);
  }
  out.sx = 1 - (1 - JELLY_CONTRACT_SX) * strength * k;
  out.sy = 1 + (JELLY_CONTRACT_SY - 1) * strength * k;
  out.squeeze = clamp(k, 0, 1) * Math.min(1, strength * 1.5);
  return out;
}

/** True while the bell is contracting (the pulse pushes the jelly then). */
export function isContracting(ms: number, tempo: number): boolean {
  return ms >= 0 && ms < JELLY_CONTRACT_MS * tempo;
}

/** Tentacle sway strength: 0 where the tentacles meet the bell, 1 at the tips. `u` = 0 at the split, 1 at the tips. */
export function tentacleEnvelope(u: number): number {
  return clamp(u, 0, 1) ** JELLY_SWAY_FALLOFF;
}

/** One after-pulse ripple at local time `t` ms (0 outside its life): a quick wiggle that dies out. */
export function rippleWave(t: number): number {
  if (t < 0 || t >= JELLY_RIPPLE_MS) return 0;
  return Math.sin((t / 1000) * JELLY_RIPPLE_FREQ) * (1 - t / JELLY_RIPPLE_MS);
}

export interface TentacleState {
  /** Sway phase (radians). */
  phase: number;
  /** Sway amplitude multiplier (1 normally; less with reduced motion, more for babies). */
  sway: number;
  /** ms since the last pulse started (the ripple runs down the tentacles after it). */
  sincePulse: number;
  /** Ripple strength (the pulse's strength). */
  ripple: number;
  /** Lean at the tips (fraction of the sprite width, + = toward +x): the current, and trailing the motion. */
  lean: number;
}

/**
 * Horizontal offset of tentacle strip `i` (0 = just under the bell) whose middle is at `u` (0 at the
 * split, 1 at the tips), as a fraction of the sprite width. The tops stay attached; the tips sway most,
 * the ripple reaches them last (phase delay per strip), and the lean grows toward the tips.
 */
export function tentacleOffset(i: number, u: number, s: TentacleState): number {
  const env = tentacleEnvelope(u);
  const sway = JELLY_SWAY_AMP * s.sway * Math.sin(s.phase - i * JELLY_SWAY_STRIP_PHASE);
  const ripple = JELLY_RIPPLE_AMP * s.ripple * rippleWave(s.sincePulse - u * JELLY_RIPPLE_TRAVEL_MS);
  return env * (sway + ripple) + s.lean * clamp(u, 0, 1) ** 1.5;
}

export interface TentacleShape {
  /** Vertical scale of the whole tentacle block. */
  sy: number;
  /** Horizontal scale at the tips (the tops match the bell's width). */
  tipSx: number;
}

/** Rising (`rise` → 1): tentacles stretch longer and narrow. Drifting down (→ −1): they relax and spread. Writes into `out`. */
export function tentacleShape(rise: number, out: TentacleShape): TentacleShape {
  const up = clamp(rise, 0, 1);
  const down = clamp(-rise, 0, 1);
  out.sy = 1 + JELLY_RISE_STRETCH_Y * up - JELLY_DRIFT_RELAX_Y * down;
  out.tipSx = 1 - JELLY_RISE_NARROW_X * up + JELLY_DRIFT_SPREAD_X * down;
  return out;
}

/** Strip width scale at `u`: the bell's width at the top (so the tentacles stay attached), the tip shape below. */
export function tentacleWidth(u: number, bellSx: number, tipSx: number): number {
  const t = clamp(u, 0, 1);
  return bellSx + (tipSx - bellSx) * t;
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * The tentacle (pellet-catching) area of a jelly centered at (x, y): everything below the bell split,
 * JELLY_CATCH_WIDTH of the sprite wide. `split` is the bell split as a fraction of the sprite height.
 */
export function tentacleBox(x: number, y: number, w: number, h: number, split: number, out: Box): Box {
  out.x0 = x - (w * JELLY_CATCH_WIDTH) / 2;
  out.x1 = x + (w * JELLY_CATCH_WIDTH) / 2;
  out.y0 = y - h / 2 + split * h;
  out.y1 = y + h / 2;
  return out;
}

export function inBox(px: number, py: number, b: Box, margin = 0): boolean {
  return px >= b.x0 - margin && px <= b.x1 + margin && py >= b.y0 - margin && py <= b.y1 + margin;
}
