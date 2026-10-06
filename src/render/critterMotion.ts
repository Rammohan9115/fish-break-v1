// Per-species "critter" behavior for the starter species: a small state machine per actor (pure; no DOM).
// behavior.ts asks it how fast to move this frame; the renderer reads its pose and drains its effects.
import {
  CORY_BURST_MS,
  CORY_REST_MS,
  CORY_SNUFFLE_MS,
  CORY_SNUFFLE_PITCH,
  CORY_SNUFFLE_SPEED,
  CORY_WINK_GAP_MS,
  CORY_WINK_MS,
  CRAB_BOB,
  CRAB_PAUSE_MS,
  CRAB_ROCK,
  CRAB_STEP_HZ,
  CRAB_WALK_MS,
  HATCHET_FIRST_HOP,
  HATCHET_HOP_GAP,
  HATCHET_HOP_HEIGHT,
  HATCHET_HOP_MS,
  KUHLI_BURROW_CHANCE,
  KUHLI_BURROW_STAY_MS,
  KUHLI_MOVE_MS,
  KUHLI_REST_MS,
  KUHLI_RISE_MS,
  KUHLI_SINK_MS,
  SAND_PLANE_GAP,
  SHRIMP_FLICK_COOLDOWN_MS,
  SHRIMP_FLICK_MS,
  SHRIMP_PICK_MS,
  SHRIMP_REST_MS,
  SHRIMP_WALK_MS,
} from '../game/constants';
import { DEPTH_PLANE_LIST } from '../game/decor';
import { DEPTH_PLANES } from '../game/constants';
import { getSpecies } from '../game/species';
import type { DepthPlane, Rng, SpeciesId } from '../game/types';

export type CritterMode = 'move' | 'rest' | 'snuffle' | 'pick' | 'pause' | 'flick' | 'sink' | 'buried' | 'rise';

/** A one-shot effect for the renderer to spawn (positions are filled in by the renderer from the actor). */
export type CritterFxKind = 'sandPuff' | 'splash' | 'ripple' | 'heartPuff';

/** A low decor piece a crab or shrimp can climb onto: its id, center x, the standing line's y, half-width and depth z. */
export interface Perch {
  id: string;
  x: number;
  y: number;
  halfW: number;
  z: number;
}

export interface CritterState {
  /** Smoothed depth z a sand dweller stands at (it eases toward its plane, or toward the decor it climbed). */
  z: number;
  /** The decor piece being sat on (null on the sand), when to climb down, and when it may climb again. */
  perchId: string | null;
  /** Depth of the perch piece while climbing. */
  targetZ?: number;
  /** The perch's walkable top, resolved this frame by behavior.ts (x range center/half-width, and the fish's center y). */
  perch?: { x: number; halfW: number; cy: number } | null;
  perchUntil: number;
  /** The stay timer starts once the climber is actually on top. */
  perchArrived?: boolean;
  nextPerchAt: number;
  mode: CritterMode;
  modeUntil: number;
  plane: DepthPlane;
  nextPlaneAt: number;
  /** 0 (out) … 1 (fully sunk into the sand); smoothed. Kuhli only. */
  burrow: number;
  nextWinkAt: number;
  winkUntil: number;
  nextHopAt: number;
  hopAt: number;
  /** False while a hatchetfish is in the air (the landing splash is still to come). */
  landed: boolean;
  /** Shrimp flick: which way (±1) it darts, when it may flick again. */
  flickDir: number;
  nextFlickAt: number;
  nextPuffAt: number;
  fx: CritterFxKind[];
}

const rand = (rng: Rng, [min, max]: readonly [number, number]) => min + rng() * (max - min);

/** True for species that get a critter state. */
export function isCritter(speciesId: SpeciesId): boolean {
  const traits = getSpecies(speciesId).traits;
  return traits.includes('surface') || traits.includes('sandDweller');
}

export function createCritter(speciesId: SpeciesId, now: number, rng: Rng): CritterState {
  const plane = DEPTH_PLANE_LIST[Math.floor(rng() * DEPTH_PLANE_LIST.length)]!;
  const c: CritterState = {
    z: DEPTH_PLANES[plane].z,
    perchId: null,
    perchUntil: 0,
    nextPerchAt: now + 6_000 + rng() * 14_000,
    mode: 'move',
    modeUntil: now + 500 + rng() * 1500,
    plane,
    nextPlaneAt: now + rand(rng, SAND_PLANE_GAP),
    burrow: 0,
    nextWinkAt: now + rand(rng, CORY_WINK_GAP_MS),
    winkUntil: 0,
    nextHopAt: now + rand(rng, HATCHET_FIRST_HOP),
    hopAt: -Infinity,
    landed: true,
    flickDir: -1,
    nextFlickAt: 0,
    nextPuffAt: 0,
    fx: [],
  };
  void speciesId;
  return c;
}

export interface CritterStep {
  /** Multiplies the species' max speed this frame (0 = stand still). */
  speedMul: number;
  /** Nose-down pitch override (radians, + = nose down in the fish's facing), or null for the normal tilt. */
  pitch: number | null;
}

const STILL: CritterStep = { speedMul: 0, pitch: null };

function setMode(c: CritterState, mode: CritterMode, now: number, ms: number): void {
  c.mode = mode;
  c.modeUntil = now + ms;
}

/** Starts a shrimp's backward tail-flick (a tap, or a fish swimming close). `facing` is ±1. Returns false if it's too soon. */
export function triggerFlick(c: CritterState, now: number, facing: number): boolean {
  if (now < c.nextFlickAt || c.mode === 'flick') return false;
  c.flickDir = -(facing >= 0 ? 1 : -1);
  c.nextFlickAt = now + SHRIMP_FLICK_COOLDOWN_MS;
  setMode(c, 'flick', now, SHRIMP_FLICK_MS);
  return true;
}

/**
 * Advances the critter's state machine. `dt` is seconds; `reduced` simplifies (no hops, no burrow effects,
 * no flicks). Returns the speed multiplier and pitch for this frame.
 */
export function stepCritter(c: CritterState, speciesId: SpeciesId, now: number, dt: number, rng: Rng, reduced: boolean): CritterStep {
  const traits = getSpecies(speciesId).traits;

  // Sand dwellers wander between depth planes now and then.
  if (traits.includes('sandDweller') && now >= c.nextPlaneAt) {
    c.plane = DEPTH_PLANE_LIST[Math.floor(rng() * DEPTH_PLANE_LIST.length)]!;
    c.nextPlaneAt = now + rand(rng, SAND_PLANE_GAP);
  }

  // Ease the stand depth toward the plane (or the climbed piece's depth, set by behavior.ts via `targetZ`).
  c.z += ((c.perchId ? (c.targetZ ?? c.z) : DEPTH_PLANES[c.plane].z) - c.z) * Math.min(1, dt * 2.2);

  switch (speciesId) {
    case 'cory':
      return stepCory(c, now, rng);
    case 'kuhli_loach':
      return stepKuhli(c, now, dt, rng, reduced);
    case 'crab':
      return stepCrab(c, now, rng);
    case 'cherry_shrimp':
      return stepShrimp(c, now, rng, reduced);
    case 'hatchetfish':
      stepHatchet(c, now, rng, reduced);
      return { speedMul: 1, pitch: null };
    default:
      return { speedMul: 1, pitch: null };
  }
}

function stepCory(c: CritterState, now: number, rng: Rng): CritterStep {
  if (now >= c.nextWinkAt) {
    c.winkUntil = now + CORY_WINK_MS;
    c.nextWinkAt = now + rand(rng, CORY_WINK_GAP_MS);
  }
  if (now >= c.modeUntil) {
    if (c.mode === 'move') {
      if (rng() < 0.5) setMode(c, 'snuffle', now, rand(rng, CORY_SNUFFLE_MS));
      else setMode(c, 'rest', now, rand(rng, CORY_REST_MS));
    } else {
      setMode(c, 'move', now, rand(rng, CORY_BURST_MS));
    }
  }
  if (c.mode === 'snuffle') {
    if (now >= c.nextPuffAt) {
      c.fx.push('sandPuff');
      c.nextPuffAt = now + 550;
    }
    return { speedMul: CORY_SNUFFLE_SPEED, pitch: CORY_SNUFFLE_PITCH };
  }
  return c.mode === 'rest' ? STILL : { speedMul: 1, pitch: null };
}

/** Burrow amount eases toward its target (1 while sinking/buried, 0 otherwise). */
function stepKuhli(c: CritterState, now: number, dt: number, rng: Rng, reduced: boolean): CritterStep {
  if (now >= c.modeUntil) {
    switch (c.mode) {
      case 'move':
        if (rng() < KUHLI_BURROW_CHANCE) {
          setMode(c, 'sink', now, KUHLI_SINK_MS);
          if (!reduced) c.fx.push('sandPuff');
        } else {
          setMode(c, 'rest', now, rand(rng, KUHLI_REST_MS));
        }
        break;
      case 'sink':
        setMode(c, 'buried', now, rand(rng, KUHLI_BURROW_STAY_MS));
        break;
      case 'buried':
        setMode(c, 'rise', now, KUHLI_RISE_MS);
        if (!reduced) c.fx.push('sandPuff');
        break;
      default:
        setMode(c, 'move', now, rand(rng, KUHLI_MOVE_MS));
    }
  }
  const target = c.mode === 'sink' || c.mode === 'buried' ? 1 : 0;
  const rate = target === 1 ? 1000 / KUHLI_SINK_MS : 1000 / KUHLI_RISE_MS;
  c.burrow += Math.sign(target - c.burrow) * Math.min(Math.abs(target - c.burrow), rate * dt);
  if (c.mode === 'move') return { speedMul: 1, pitch: null };
  return { speedMul: c.mode === 'rest' ? 0.12 : 0, pitch: null };
}

function stepCrab(c: CritterState, now: number, rng: Rng): CritterStep {
  if (now >= c.modeUntil) {
    if (c.mode === 'move') setMode(c, 'pause', now, rand(rng, CRAB_PAUSE_MS));
    else setMode(c, 'move', now, rand(rng, CRAB_WALK_MS));
  }
  return c.mode === 'pause' ? STILL : { speedMul: 1, pitch: null };
}

function stepShrimp(c: CritterState, now: number, rng: Rng, reduced: boolean): CritterStep {
  if (c.mode === 'flick' && reduced) setMode(c, 'rest', now, 600);
  if (now >= c.modeUntil) {
    const r = rng();
    if (c.mode === 'move') setMode(c, r < 0.55 ? 'pick' : 'rest', now, rand(rng, r < 0.55 ? SHRIMP_PICK_MS : SHRIMP_REST_MS));
    else setMode(c, 'move', now, rand(rng, SHRIMP_WALK_MS));
  }
  if (c.mode === 'pick') return { speedMul: 0.15, pitch: null };
  if (c.mode === 'rest') return STILL;
  // 'flick' moves the actor itself (behavior.ts), so no steering speed.
  return c.mode === 'flick' ? STILL : { speedMul: 1, pitch: null };
}

function stepHatchet(c: CritterState, now: number, rng: Rng, reduced: boolean): void {
  if (reduced) return;
  if (c.landed && now >= c.nextHopAt) {
    c.hopAt = now;
    c.landed = false;
    c.nextHopAt = now + rand(rng, HATCHET_HOP_GAP);
    c.fx.push('splash', 'ripple');
  } else if (!c.landed && now - c.hopAt >= HATCHET_HOP_MS) {
    c.landed = true;
    c.fx.push('splash', 'ripple');
  }
}

/** Hop progress 0..1 while airborne, else 0. */
export function hopProgress(c: CritterState, now: number): number {
  const t = (now - c.hopAt) / HATCHET_HOP_MS;
  return t > 0 && t < 1 ? t : 0;
}

/** How far above its swim line a hatchetfish is while hopping (tank units; 0 when not hopping). */
export function hopHeight(c: CritterState, now: number): number {
  const t = hopProgress(c, now);
  return t > 0 ? Math.sin(Math.PI * t) * HATCHET_HOP_HEIGHT : 0;
}

export interface CritterPose {
  dy: number;
  rot: number;
  /** Kuhli: 0..1 sunk into the sand (the renderer clips the body at the sand line). */
  burrow: number;
  /** The single eye is shut (cory wink). */
  winking: boolean;
}

/** The whole-body pose offset for this critter right now (`facing` ±1, `step` 0..∞ drives the waddle). */
export function critterPose(c: CritterState, speciesId: SpeciesId, now: number, facing: number, timeSec: number, moving: number, reduced: boolean, baby = false): CritterPose {
  const pose: CritterPose = { dy: 0, rot: 0, burrow: 0, winking: now < c.winkUntil };
  const dir = facing >= 0 ? 1 : -1;
  // Baby sand dwellers hop along: a bouncy little step.
  if (baby && !reduced && getSpecies(speciesId).traits.includes('sandDweller')) pose.dy -= Math.abs(Math.sin(timeSec * 8 + (facing > 0 ? 0 : 1))) * 3 * moving;
  switch (speciesId) {
    case 'crab': {
      // Quick small steps: ±4° rock and a tiny bob per step, only while walking.
      const step = Math.sin(timeSec * CRAB_STEP_HZ * Math.PI * 2);
      const amt = reduced ? 0.4 : 1;
      pose.rot = CRAB_ROCK * step * moving * amt;
      pose.dy -= CRAB_BOB * 40 * Math.abs(step) * moving * amt;
      break;
    }
    case 'kuhli_loach':
      pose.burrow = c.burrow;
      pose.rot = -c.burrow * 0.7 * dir;
      break;
    case 'hatchetfish': {
      const t = hopProgress(c, now);
      if (t > 0) {
        pose.dy = -hopHeight(c, now);
        pose.rot = (t - 0.5) * -1.1 * dir;
      }
      break;
    }
    case 'cherry_shrimp':
      if (c.mode === 'pick') pose.rot = 0.35 * dir * (0.6 + 0.4 * Math.sin(timeSec * 9));
      else if (c.mode === 'flick') pose.rot = -0.5 * dir;
      break;
    default:
      break;
  }
  return pose;
}

/** Drains and returns the queued effects. */
export function drainFx(c: CritterState): CritterFxKind[] {
  if (c.fx.length === 0) return c.fx;
  const out = c.fx;
  c.fx = [];
  return out;
}
