// Fish movement: steering-based wander, food seeking, edge avoidance, schooling, flipping.
// Positions live only here (never saved). No DOM access, so it is unit-testable.
import {
  ACCEL_FRACTION,
  ARRIVE_DIST,
  ARRIVE_SLOWDOWN_DIST,
  AXOLOTL_BAND,
  AXOLOTL_SAND_CLEARANCE,
  BABY_SPEED_MULTIPLIER,
  BLINK_DURATION_MS,
  BLINK_MAX_MS,
  BLINK_MIN_MS,
  DART_DURATION_MS,
  DART_GAP_MAX_MS,
  DART_GAP_MIN_MS,
  DART_SPEED_MULTIPLIER,
  DART_TURN_MULTIPLIER,
  EAT_RADIUS_PX,
  EDGE_AVOID_WEIGHT,
  EDGE_AVOID_ZONE,
  FOOD_SPEED_MULTIPLIER,
  FULL_HUNGER,
  HUNGRY_INDICATOR_HUNGER,
  INDICATOR_DURATION_MS,
  INDICATOR_GAP_MAX_MS,
  INDICATOR_GAP_MIN_MS,
  MAX_PITCH,
  MIN_CRUISE_FRACTION,
  SAD_HAPPINESS,
  SAD_SINK,
  COURTSHIP_SPEED,
  DEPTH_PLANES,
  GLOOM_SMOOTHING,
  SAD_SPEED_MULTIPLIER,
  SAND_FOOT_EMBED,
  SAND_Y,
  SCHOOL_COHESION,
  SHRIMP_FLICK_NEAR,
  SHRIMP_FLICK_SPEED,
  SURFACE_ZONE_FRACTION,
  SCHOOL_RADIUS,
  SCHOOL_SEPARATION,
  SCHOOL_SEPARATION_DIST,
  SWIM_SAND_CLEARANCE,
  SWIM_SIDE_MARGIN,
  STRETCH_SMOOTHING,
  SWIM_TOP,
  TANK_WIDTH,
  TILT_SMOOTHING,
  TURN_MIN_VX,
  TURN_MS,
  TURN_RATE,
  WANDER_MAX_MS,
  WANDER_MIN_MS,
  BABY_WAVE_SPEED,
  JELLY_AVOID_MARGIN,
  JELLY_AVOID_WEIGHT,
  JELLY_BABY_GAP,
  JELLY_BABY_PULSE,
  JELLY_CURRENT_ACCEL,
  JELLY_CURRENT_LEAN,
  JELLY_DRAG,
  JELLY_FOOD_ACCEL,
  JELLY_FOOD_RANGE,
  JELLY_HAPPY_GAP_MS,
  JELLY_HAPPY_PULSES,
  JELLY_MAX_Y_FRAC,
  JELLY_PULSE_GAP_MAX_MS,
  JELLY_PULSE_GAP_MIN_MS,
  JELLY_PULSE_SIDE,
  JELLY_PULSE_UP,
  JELLY_REDUCED_GAP,
  JELLY_REDUCED_PULSE,
  JELLY_RISE_SPEED,
  JELLY_SINK_ACCEL,
  JELLY_SINK_MAX,
  JELLY_SWAY_FREQ,
  JELLY_TENTACLE_SMOOTHING,
  JELLY_TRAIL_LEAN,
  JELLY_WOBBLE,
  JELLY_WOBBLE_FREQ,
  JELLY_CONTRACT_MS,
  JELLY_EXPAND_MS,
  PET_FOLLOW_GAP,
  PET_FOLLOW_SPEED,
} from '../game/constants';
import { depthGeometry } from '../game/decor';
import { getSpecies } from '../game/species';
import type { DepthPlane, Fish, Rng, SpeciesId } from '../game/types';
import { createCritter, isCritter, stepCritter, triggerFlick, type CritterState, type Perch } from './critterMotion';
import { fishHalfHeight, mouthOffset } from './drawFish';
import { speedFraction, turnFacing, turnSpeedFactor, waveFrequency } from './fishMotion';
import { bellSplitY, inBox, isContracting, jellySize, tentacleBox, type Box } from './jellyMotion';

export type IndicatorKind = 'sad' | 'hungry';

export interface FishActor {
  id: string;
  speciesId: SpeciesId;
  /** Life stage (sizes the sand dwellers' standing height). */
  stage: Fish['stage'];
  x: number;
  y: number;
  /** Direction of travel, radians. */
  heading: number;
  speed: number;
  /** -1..1; passes through 0 (eased) while turning around. */
  facing: number;
  /** When the current turn-around started (renderer ms), or null when not turning. */
  turnStart: number | null;
  /** Which way the fish faced when the turn started (±1). */
  turnFrom: number;
  /** Smoothed nose-up/down tilt toward the velocity (radians). */
  tilt: number;
  /** Smoothed acceleration stretch, 0..1. */
  stretch: number;
  /** Last bite and last click (renderer ms), for squash and bounce. */
  eatAt: number;
  pokeAt: number;
  /** Smoothed point the eyes look at (tank units). */
  gazeX: number;
  gazeY: number;
  targetX: number;
  targetY: number;
  nextWanderAt: number;
  /** Body-wave phase (radians); advances faster when swimming fast. */
  phase: number;
  blinkAt: number;
  blinkUntil: number;
  dartUntil: number;
  nextDartAt: number;
  indicator: { kind: IndicatorKind; start: number; until: number } | null;
  nextIndicatorAt: number;
  inflateUntil: number;
  /** 0..1, eases toward 1 while the fish is sad (drives the sad face, droop and sinking). */
  gloom: number;
  /** Jellyfish-only motion state (pulse propulsion instead of steering), else null. */
  jelly: JellyActor | null;
  /** Starter-species state machine (zone, gait modes, hops, burrowing), else null. */
  crit: CritterState | null;
}

/** A jelly moves by pulsing: velocity, pulse timing, tentacle shape, and the pellet it's eating. */
export interface JellyActor {
  vx: number;
  vy: number;
  /** When the current/last pulse started (renderer ms), its visual strength, thrust and tempo (duration multiplier). */
  pulseAt: number;
  pulseStrength: number;
  pulseThrust: number;
  pulseTempo: number;
  /** Sideways part of the pulse's push (−1..1). */
  pulseDirX: number;
  nextPulseAt: number;
  /** Quick happy pulses still queued after a tap. */
  happyLeft: number;
  /** Smoothed −1 (drifting down) .. 1 (rising): tentacle stretch. */
  rise: number;
  /** Smoothed tentacle lean at the tips (fraction of width). */
  lean: number;
  /** Tap glow flash start (renderer ms). */
  flashAt: number;
  /** A caught pellet sliding up into the bell: when, where it was caught (relative to the center), and its kind. */
  caught: { at: number; dx: number; dy: number; premium: boolean } | null;
  /** Dance Mode: the last beat this jelly pulsed on. */
  lastBeat: number;
  /** Per-jelly offset so wobbles don't sync. */
  seed: number;
}

/** A jelly's tentacle area that fish steer around (tank units). */
export type JellyZone = Box;

export function isJelly(speciesId: SpeciesId): boolean {
  return getSpecies(speciesId).traits.includes('jelly');
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface FoodTarget {
  id: string;
  x: number;
  y: number;
  premium?: boolean;
}

export interface BehaviorInput {
  fish: Fish;
  /** Renderer clock in ms. */
  now: number;
  /** Seconds since last frame. */
  dt: number;
  rng: Rng;
  food: FoodTarget[];
  /** Other actors of the same species in this tank (used for schooling). */
  schoolmates: FishActor[];
  /** Courting: swim toward this point on the pair's heart loop instead of wandering or chasing food. */
  courtship?: { x: number; y: number };
  /** The global water current (−1..1-ish, + = toward +x); jellies drift with it. */
  current?: number;
  /** Dance Mode beat index (jellies pulse on each new beat), or null/undefined when not dancing. */
  beat?: number | null;
  /** Tempo multiplier of a dance pulse (beat length / normal pulse length). */
  beatTempo?: number;
  reduced?: boolean;
  /** Jelly tentacle areas fish keep out of. */
  jellies?: JellyZone[];
  /** Being petted: hold still near the pointer, facing it (and drift after it if `follow`). */
  pet?: PetInput;
  /** Swim toward this point instead of wandering (say hi, follow mode, the greeting). Food still wins. */
  seek?: { x: number; y: number };
  /** Low decor pieces a crab or shrimp may climb onto. */
  perches?: Perch[];
  /** Positions of other (non-shrimp) fish in the tank, so a shrimp can flick away from one swimming close. */
  nearby?: { x: number; y: number }[];
}

export interface PetInput {
  x: number;
  y: number;
  /** Drift gently after the pointer (off with reduced motion). */
  follow: boolean;
  /** 0..1: stroking makes the body wiggle happily. */
  wiggle: number;
}

/**
 * A point on a heart-shaped loop (the classic parametric heart), `w` wide and `h` tall, centered on 0.
 * u is the angle around the loop (radians); y grows downward like the canvas. Pure; unit-tested.
 */
export function heartPoint(u: number, w: number, h: number): { x: number; y: number } {
  const s = Math.sin(u);
  const x = 16 * s * s * s;
  const y = 13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u);
  // Raw ranges: x ∈ [-16, 16], y ∈ [-17, 12] (up is +); center vertically and flip for canvas.
  return { x: (x / 16) * (w / 2), y: -((y + 2.5) / 14.5) * (h / 2) };
}

const rand = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Wraps an angle to -PI..PI. */
function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

/** Horizontal/top swim limits. The renderer widens these to whatever part of the tank is visible. */
let swimExtent = { minX: SWIM_SIDE_MARGIN, maxX: TANK_WIDTH - SWIM_SIDE_MARGIN, minY: SWIM_TOP };

/** Lets fish use the visible area (e.g. scenery extended on wide or tall screens). Pass tank-space edges. */
export function setSwimExtent(x0: number, x1: number, y0: number): void {
  swimExtent = { minX: x0 + SWIM_SIDE_MARGIN, maxX: x1 - SWIM_SIDE_MARGIN, minY: Math.min(SWIM_TOP, y0 + SWIM_TOP) };
}

/** Where a sand dweller's center sits when standing on a depth plane (its feet on that plane's sand line). */
export function sandCenterY(plane: DepthPlane, speciesId: SpeciesId, stage: Fish['stage']): number {
  const geo = depthGeometry(DEPTH_PLANES[plane].z);
  return SAND_Y + geo.dy - fishHalfHeight(speciesId, stage) * geo.scale * SAND_FOOT_EMBED;
}

/** The water's top share where surface dwellers (hatchetfish) swim. */
function surfaceZoneBottom(): number {
  return swimExtent.minY + (SAND_Y - swimExtent.minY) * SURFACE_ZONE_FRACTION;
}

export function swimBounds(speciesId: SpeciesId, stage: Fish['stage'] = 'adult'): Bounds {
  const base = { minX: swimExtent.minX, maxX: swimExtent.maxX };
  const traits = getSpecies(speciesId).traits;
  if (traits.includes('surface')) return { ...base, minY: swimExtent.minY, maxY: surfaceZoneBottom() };
  if (traits.includes('sandDweller')) {
    return { ...base, minY: sandCenterY('back', speciesId, stage), maxY: sandCenterY('front', speciesId, stage) };
  }
  if (isJelly(speciesId)) {
    // Upper part of the water column only: the tentacles never reach the sand.
    return { ...base, minY: swimExtent.minY + JELLY_TOP_MARGIN, maxY: SAND_Y * JELLY_MAX_Y_FRAC };
  }
  if (getSpecies(speciesId).traits.includes('walksOnSand')) {
    return { ...base, minY: SAND_Y - AXOLOTL_SAND_CLEARANCE - AXOLOTL_BAND, maxY: SAND_Y - AXOLOTL_SAND_CLEARANCE };
  }
  return { ...base, minY: swimExtent.minY, maxY: SAND_Y - SWIM_SAND_CLEARANCE };
}

/** Keeps a jelly's bell under the surface. */
const JELLY_TOP_MARGIN = 20;

/** Lowest a jelly's center may ever go (courting or hatching near the floor): the tentacle tips stay off the sand. */
export function jellyFloorY(stage: Fish['stage']): number {
  return SAND_Y - jellySize(stage).h / 2 - SWIM_SAND_CLEARANCE;
}

function pickWanderTarget(actor: FishActor, rng: Rng, now: number): void {
  const b = swimBounds(actor.speciesId, actor.stage);
  actor.targetX = rand(rng, b.minX, b.maxX);
  const perch = actor.crit?.perch;
  if (perch) {
    // Walking around on top of a decor piece.
    actor.targetX = perch.x + (rng() * 2 - 1) * perch.halfW * 0.7;
    actor.targetY = perch.cy;
  } else if (actor.crit && getSpecies(actor.speciesId).traits.includes('sandDweller')) {
    // Sand dwellers walk along the plane they picked (it changes now and then).
    actor.targetY = sandCenterY(actor.crit.plane, actor.speciesId, actor.stage);
  } else {
    // Sad fish mope lower in the water.
    actor.targetY = rand(rng, b.minY + (b.maxY - b.minY) * SAD_SINK * actor.gloom, b.maxY);
  }
  actor.nextWanderAt = now + rand(rng, WANDER_MIN_MS, WANDER_MAX_MS);
}

export function createActor(fish: Fish, rng: Rng, now: number, at?: { x: number; y: number }): FishActor {
  const b = swimBounds(fish.speciesId, fish.stage);
  const facing = rng() < 0.5 ? -1 : 1;
  const actor: FishActor = {
    id: fish.id,
    speciesId: fish.speciesId,
    stage: fish.stage,
    x: at?.x ?? rand(rng, b.minX, b.maxX),
    y: at?.y ?? rand(rng, b.minY, b.maxY),
    heading: facing > 0 ? 0 : Math.PI,
    speed: 0,
    facing,
    turnStart: null,
    turnFrom: facing,
    tilt: 0,
    stretch: 0,
    eatAt: -Infinity,
    pokeAt: -Infinity,
    gazeX: 0,
    gazeY: 0,
    targetX: 0,
    targetY: 0,
    nextWanderAt: 0,
    phase: rng() * Math.PI * 2,
    blinkAt: now + rand(rng, BLINK_MIN_MS, BLINK_MAX_MS),
    blinkUntil: 0,
    dartUntil: 0,
    nextDartAt: now + rand(rng, DART_GAP_MIN_MS, DART_GAP_MAX_MS),
    indicator: null,
    nextIndicatorAt: now + rand(rng, INDICATOR_GAP_MIN_MS / 2, INDICATOR_GAP_MAX_MS / 2),
    inflateUntil: 0,
    gloom: isSad(fish) ? 1 : 0,
    jelly: null,
    crit: isCritter(fish.speciesId) ? createCritter(fish.speciesId, now, rng) : null,
  };
  if (isJelly(fish.speciesId)) {
    actor.facing = 1;
    actor.turnFrom = 1;
    actor.heading = -Math.PI / 2;
    actor.y = Math.min(actor.y, jellyFloorY(fish.stage));
    actor.jelly = {
      vx: 0,
      vy: 0,
      pulseAt: -Infinity,
      pulseStrength: 1,
      pulseThrust: 1,
      pulseTempo: 1,
      pulseDirX: 0,
      nextPulseAt: now + rand(rng, 0, JELLY_PULSE_GAP_MAX_MS),
      happyLeft: 0,
      rise: 0,
      lean: 0,
      flashAt: -Infinity,
      caught: null,
      lastBeat: -1,
      seed: rng() * Math.PI * 2,
    };
  }
  pickWanderTarget(actor, rng, now);
  actor.gazeX = actor.x + facing * 100;
  actor.gazeY = actor.y;
  return actor;
}

/** Inward push (0..1 per axis) when within EDGE_AVOID_ZONE of the bounds. */
export function edgeAvoidance(x: number, y: number, b: Bounds): { x: number; y: number } {
  const push = (dist: number) => (dist < EDGE_AVOID_ZONE ? 1 - Math.max(0, dist) / EDGE_AVOID_ZONE : 0);
  return {
    x: push(x - b.minX) - push(b.maxX - x),
    y: push(y - b.minY) - push(b.maxY - y),
  };
}

function schoolingForce(actor: FishActor, mates: FishActor[]): { x: number; y: number } {
  let cx = 0;
  let cy = 0;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (const m of mates) {
    if (m.id === actor.id) continue;
    const dx = m.x - actor.x;
    const dy = m.y - actor.y;
    const d = Math.hypot(dx, dy);
    if (d > SCHOOL_RADIUS) continue;
    cx += m.x;
    cy += m.y;
    n += 1;
    if (d < SCHOOL_SEPARATION_DIST && d > 0) {
      sx -= (dx / d) * (1 - d / SCHOOL_SEPARATION_DIST);
      sy -= (dy / d) * (1 - d / SCHOOL_SEPARATION_DIST);
    }
  }
  if (n === 0) return { x: 0, y: 0 };
  const tx = cx / n - actor.x;
  const ty = cy / n - actor.y;
  const td = Math.hypot(tx, ty) || 1;
  return {
    x: (tx / td) * SCHOOL_COHESION + sx * SCHOOL_SEPARATION,
    y: (ty / td) * SCHOOL_COHESION + sy * SCHOOL_SEPARATION,
  };
}

export function isSad(fish: Fish): boolean {
  return fish.happiness < SAD_HAPPINESS;
}

export function isHungry(fish: Fish): boolean {
  return fish.hunger < HUNGRY_INDICATOR_HUNGER;
}

export function maxSpeedFor(fish: Fish, actor: FishActor, now: number, chasingFood: boolean): number {
  let speed = getSpecies(fish.speciesId).speed;
  if (fish.stage === 'baby') speed *= BABY_SPEED_MULTIPLIER;
  if (isSad(fish)) speed *= SAD_SPEED_MULTIPLIER;
  if (chasingFood) speed *= FOOD_SPEED_MULTIPLIER;
  else if (now < actor.dartUntil) speed *= DART_SPEED_MULTIPLIER;
  return speed;
}

/** Mouth position given the current facing. */
export function mouthPoint(actor: FishActor, fish: Fish): { x: number; y: number } {
  return { x: actor.x + (actor.facing >= 0 ? 1 : -1) * mouthOffset(fish.speciesId, fish.stage), y: actor.y };
}

function nearestFood(actor: FishActor, food: FoodTarget[]): FoodTarget | null {
  let best: FoodTarget | null = null;
  let bestD = Infinity;
  for (const f of food) {
    const d = Math.hypot(f.x - actor.x, f.y - actor.y);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/** Pitch used for drawing: nose up/down relative to travel, clamped. */
export function pitchOf(actor: FishActor): number {
  const vx = Math.cos(actor.heading);
  const vy = Math.sin(actor.heading);
  return clamp(Math.atan2(vy, Math.abs(vx)), -MAX_PITCH, MAX_PITCH);
}

function blink(actor: FishActor, now: number, rng: Rng): void {
  if (now >= actor.blinkAt) {
    actor.blinkUntil = now + BLINK_DURATION_MS;
    actor.blinkAt = now + rand(rng, BLINK_MIN_MS, BLINK_MAX_MS);
  }
}

/** Sad / hungry thought bubbles, now and then. */
function updateIndicator(actor: FishActor, fish: Fish, now: number, rng: Rng): void {
  if (actor.indicator && now >= actor.indicator.until) actor.indicator = null;
  if (!actor.indicator && now >= actor.nextIndicatorAt) {
    const sad = isSad(fish);
    const hungry = isHungry(fish);
    if (sad || hungry) {
      const kind: IndicatorKind = sad && hungry ? (rng() < 0.5 ? 'sad' : 'hungry') : sad ? 'sad' : 'hungry';
      actor.indicator = { kind, start: now, until: now + INDICATOR_DURATION_MS };
    }
    actor.nextIndicatorAt = now + rand(rng, INDICATOR_GAP_MIN_MS, INDICATOR_GAP_MAX_MS);
  }
}

/** Push (per axis) away from any jelly's tentacles the point is in or near. */
export function jellyAvoidance(x: number, y: number, zones: JellyZone[] | undefined): { x: number; y: number } {
  let ax = 0;
  let ay = 0;
  if (!zones) return { x: 0, y: 0 };
  for (const z of zones) {
    if (!inBox(x, y, z, JELLY_AVOID_MARGIN)) continue;
    const cx = (z.x0 + z.x1) / 2;
    const half = (z.x1 - z.x0) / 2 + JELLY_AVOID_MARGIN;
    const closeness = 1 - Math.min(1, Math.abs(x - cx) / half);
    ax += (x >= cx ? 1 : -1) * (0.5 + closeness);
    // Slip out over the bell end or under the tips, whichever is nearer.
    ay += y - z.y0 < z.y1 - y ? -0.4 : 0.4;
  }
  return { x: ax * JELLY_AVOID_WEIGHT, y: ay * JELLY_AVOID_WEIGHT };
}

/** How long a crab / shrimp stays up on a decor piece (ms), and how long before it climbs again. */
const PERCH_STAY: Record<string, readonly [number, number]> = { crab: [8_000, 15_000], cherry_shrimp: [6_000, 12_000] };
const PERCH_GAP = [15_000, 40_000] as const;
const PERCH_RANGE = 260;

/** Climbs onto a nearby low decor piece now and then, sits or walks on it a while, then climbs down. Sets `crit.perch`. */
function updatePerch(actor: FishActor, crit: CritterState, input: BehaviorInput): void {
  const { now, rng } = input;
  const list = input.perches ?? [];
  const had = crit.perch !== null && crit.perch !== undefined;
  const stay = PERCH_STAY[actor.speciesId] ?? [8_000, 12_000];
  if (crit.perchId) {
    const p = list.find((x) => x.id === crit.perchId);
    if (!p || now >= crit.perchUntil || input.reduced === true) {
      crit.perchId = null;
      crit.perch = null;
      crit.perchArrived = false;
      crit.nextPerchAt = now + rand(rng, PERCH_GAP[0], PERCH_GAP[1]);
      actor.nextWanderAt = 0;
      return;
    }
    crit.targetZ = p.z;
    crit.perch = { x: p.x, halfW: p.halfW, cy: p.y - fishHalfHeight(actor.speciesId, actor.stage) * depthGeometry(p.z).scale * SAND_FOOT_EMBED };
    if (!had) actor.nextWanderAt = 0;
    if (!crit.perchArrived && Math.abs(actor.y - crit.perch.cy) < 4 && Math.abs(actor.x - p.x) <= p.halfW) {
      crit.perchArrived = true;
      crit.perchUntil = now + rand(rng, stay[0], stay[1]);
    }
    return;
  }
  crit.perch = null;
  if (now < crit.nextPerchAt || input.reduced === true) return;
  let best: Perch | null = null;
  let bestD = PERCH_RANGE;
  for (const p of list) {
    const d = Math.abs(p.x - actor.x);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (best) {
    crit.perchId = best.id;
    crit.perchUntil = now + 40_000; // gives up if it never gets there; the stay starts on arrival
    crit.perchArrived = false;
    crit.targetZ = best.z;
  } else {
    crit.nextPerchAt = now + 8_000;
  }
}

/** Food a species can actually get to: sand dwellers only go for pellets near the floor, surface dwellers for those up top. */
function reachable(traits: string[], food: FoodTarget[]): FoodTarget[] {
  if (traits.includes('sandDweller')) return food.filter((f) => f.y > SAND_Y - 90);
  if (traits.includes('surface')) return food.filter((f) => f.y < surfaceZoneBottom() + 50);
  return food;
}

/**
 * Advances one actor by `dt` seconds. Mutates the actor (renderer-only state).
 * Returns the id of a pellet the fish's mouth reached (or a jelly's tentacles caught), or null.
 */
export function updateActor(actor: FishActor, input: BehaviorInput): string | null {
  if (actor.jelly) return updateJelly(actor, actor.jelly, input);
  if (input.pet) {
    updatePetted(actor, input, input.pet);
    return null;
  }
  const { fish, now, dt, rng } = input;
  const species = getSpecies(fish.speciesId);
  actor.stage = fish.stage;
  const swim = swimBounds(fish.speciesId, fish.stage);
  actor.gloom += ((isSad(fish) ? 1 : 0) - actor.gloom) * Math.min(1, dt * GLOOM_SMOOTHING);

  blink(actor, now, rng);

  // Starter species: zone gait modes (rest, snuffle, burrow, hop…). `locked` = busy, ignores food and wandering.
  const crit = actor.crit;
  const cstep = crit ? stepCritter(crit, fish.speciesId, now, dt, rng, input.reduced === true) : null;
  const locked = crit !== null && (crit.mode === 'sink' || crit.mode === 'buried' || crit.mode === 'rise' || crit.mode === 'flick');
  const sideways = species.traits.includes('sideways');
  const grounded = species.traits.includes('sandDweller');
  if (crit && species.traits.includes('climbs')) updatePerch(actor, crit, input);
  if (crit && species.id === 'cherry_shrimp' && !locked && input.nearby) {
    // A fish swimming close makes a shrimp flick away backward.
    for (const o of input.nearby) {
      if (Math.abs(o.x - actor.x) < SHRIMP_FLICK_NEAR && Math.abs(o.y - actor.y) < SHRIMP_FLICK_NEAR * 1.5 && input.reduced !== true) {
        if (triggerFlick(crit, now, actor.facing)) break;
      }
    }
  }

  // Darting species occasionally burst forward
  const darts = species.traits.includes('darts');
  if (darts && now >= actor.nextDartAt) {
    actor.dartUntil = now + DART_DURATION_MS;
    actor.nextDartAt = now + rand(rng, DART_GAP_MIN_MS, DART_GAP_MAX_MS);
  }

  // Target: the courtship loop, else nearest food if hungry enough, otherwise wander
  const courting = input.courtship;
  const food = !courting && !locked && fish.hunger < FULL_HUNGER ? nearestFood(actor, reachable(species.traits, input.food)) : null;
  let tx: number;
  let ty: number;
  if (courting) {
    tx = courting.x;
    ty = courting.y;
    actor.nextWanderAt = now + WANDER_MIN_MS;
  } else if (food) {
    // Aim so the mouth (not the center) meets the pellet.
    const side = food.x >= actor.x ? 1 : -1;
    tx = food.x - side * mouthOffset(fish.speciesId, fish.stage) * 0.8;
    ty = food.y;
  } else if (input.seek) {
    tx = input.seek.x;
    ty = input.seek.y;
    actor.nextWanderAt = now + WANDER_MIN_MS;
  } else {
    const arrived = Math.hypot(actor.targetX - actor.x, actor.targetY - actor.y) < ARRIVE_DIST;
    if (arrived || now >= actor.nextWanderAt) pickWanderTarget(actor, rng, now);
    tx = actor.targetX;
    ty = actor.targetY;
  }

  // While chasing food, the fish may dip to the sand or the surface to reach it.
  let bounds = food ? { ...swim, minY: Math.min(swim.minY, food.y), maxY: Math.max(swim.maxY, food.y) } : swim;
  if (crit?.perch) bounds = { ...bounds, minY: Math.min(bounds.minY, crit.perch.cy - EDGE_AVOID_ZONE) };

  // Steering: seek + edge avoidance + schooling, then turn toward it at a limited rate.
  const dx = tx - actor.x;
  const dy = ty - actor.y;
  const dist = Math.hypot(dx, dy) || 1;
  let sx = dx / dist;
  let sy = dy / dist;
  // Thin zones (sand band, surface strip) are narrower than the avoidance margin: only the sides push back there.
  const thin = crit !== null && (grounded || species.traits.includes('surface'));
  const avoid = edgeAvoidance(actor.x, actor.y, thin ? { ...bounds, minY: bounds.minY - EDGE_AVOID_ZONE, maxY: bounds.maxY + EDGE_AVOID_ZONE } : bounds);
  sx += avoid.x * EDGE_AVOID_WEIGHT;
  sy += avoid.y * EDGE_AVOID_WEIGHT;
  if (!courting) {
    const avoidJelly = jellyAvoidance(actor.x, actor.y, input.jellies);
    sx += avoidJelly.x;
    sy += avoidJelly.y;
  }
  if (species.traits.includes('schools') && !food) {
    const school = schoolingForce(actor, input.schoolmates);
    sx += school.x;
    sy += school.y;
  }

  const desiredHeading = Math.atan2(sy, sx);
  const turnRate = TURN_RATE * (darts ? DART_TURN_MULTIPLIER : 1);
  const delta = wrapAngle(desiredHeading - actor.heading);
  // A crab never turns around (front view): it just scuttles whichever way it needs to go.
  actor.heading = sideways ? desiredHeading : wrapAngle(actor.heading + clamp(delta, -turnRate * dt, turnRate * dt));

  // Courting is a slow, dreamy glide once on the loop; catching up to it is a normal swim.
  const critMul = locked ? 0 : food ? 1 : (cstep?.speedMul ?? 1);
  const maxSpeed = maxSpeedFor(fish, actor, now, food !== null) * (courting ? COURTSHIP_SPEED : 1) * critMul;
  // Courting fish ease onto the moving loop point instead of overshooting it.
  const arriveFactor = food ? 1 : Math.max(courting ? 0.15 : MIN_CRUISE_FRACTION, Math.min(1, dist / ARRIVE_SLOWDOWN_DIST));
  const targetSpeed = maxSpeed * arriveFactor;
  // Standing still (critMul 0) stops dead instead of coasting.
  const accel = (critMul === 0 ? maxSpeedFor(fish, actor, now, false) : maxSpeed) * ACCEL_FRACTION * dt * (critMul === 0 ? 3 : 1);
  const prevSpeed = actor.speed;
  actor.speed = clamp(targetSpeed, actor.speed - accel, actor.speed + accel);

  // Stretch along the swim direction while speeding up.
  const accelFrac = dt > 0 && accel > 0 ? clamp((actor.speed - prevSpeed) / accel, 0, 1) : 0;
  actor.stretch += (accelFrac - actor.stretch) * Math.min(1, dt * STRETCH_SMOOTHING);

  // Face the direction of travel: a quick eased turn-around (scaleX 1 → 0 → -1), slowing down through it.
  const vx = Math.cos(actor.heading) * actor.speed;
  const side = actor.facing >= 0 ? 1 : -1;
  if (sideways) {
    actor.facing = 1;
    actor.turnFrom = 1;
    actor.turnStart = null;
  } else if (actor.turnStart === null && Math.abs(vx) > TURN_MIN_VX && Math.sign(vx) !== side) {
    actor.turnStart = now;
    actor.turnFrom = side;
  }
  let moveSpeed = actor.speed;
  if (actor.turnStart !== null) {
    const progress = (now - actor.turnStart) / TURN_MS;
    if (progress >= 1) {
      actor.turnFrom = -actor.turnFrom;
      actor.facing = actor.turnFrom;
      actor.turnStart = null;
    } else {
      actor.facing = turnFacing(actor.turnFrom, progress);
      moveSpeed *= turnSpeedFactor(progress);
    }
  }

  if (crit?.mode === 'flick') {
    // Backward tail-flick: a quick dart away from where the shrimp faces.
    actor.speed = SHRIMP_FLICK_SPEED;
    actor.x = clamp(actor.x + crit.flickDir * SHRIMP_FLICK_SPEED * dt, bounds.minX, bounds.maxX);
  } else {
    actor.x = clamp(actor.x + Math.cos(actor.heading) * moveSpeed * dt, bounds.minX, bounds.maxX);
    actor.y = clamp(actor.y + Math.sin(actor.heading) * moveSpeed * dt, bounds.minY, bounds.maxY);
  }

  // Tilt toward the velocity, smoothed. Sand dwellers stay level (cory dips its nose to snuffle).
  const tiltTarget = grounded ? (cstep?.pitch ?? 0) : pitchOf(actor);
  actor.tilt += (tiltTarget - actor.tilt) * Math.min(1, dt * TILT_SMOOTHING);

  // The body wave runs faster when swimming faster (per-species rhythm, quicker for babies).
  actor.phase += dt * waveFrequency(species.motion, speedFraction(actor.speed, species.speed), fish.stage === 'baby');

  updateIndicator(actor, fish, now, rng);

  // Eating
  if (food) {
    const mouth = mouthPoint(actor, fish);
    const reached = Math.hypot(food.x - mouth.x, food.y - mouth.y) <= EAT_RADIUS_PX || Math.hypot(food.x - actor.x, food.y - actor.y) <= EAT_RADIUS_PX;
    if (reached) {
      actor.eatAt = now;
      return food.id;
    }
  }
  return null;
}

/** How quickly a petted fish settles (speed → 0) and leans toward the pointer. */
const PET_SETTLE = 6;
/** Max lean toward the pointer while petted (radians). */
const PET_LEAN = 0.3;
/** The body wave slows to this fraction (dreamy) while petted. */
const PET_WAVE = 0.45;

/**
 * Petted: stop swimming, turn to face the pointer, lean toward it with a slow dreamy body wave, and
 * (if `follow`) drift gently after it, never leaving the water. Mutates the actor.
 */
function updatePetted(actor: FishActor, input: BehaviorInput, pet: PetInput): void {
  const { fish, now, dt } = input;
  const species = getSpecies(fish.speciesId);
  const bounds = swimBounds(fish.speciesId, fish.stage);
  actor.speed += (0 - actor.speed) * Math.min(1, dt * PET_SETTLE);
  actor.nextWanderAt = now + WANDER_MIN_MS;
  actor.indicator = null;

  // Face the pointer (a normal eased turn-around when it crosses to the other side).
  const dx = pet.x - actor.x;
  const side = actor.turnStart === null ? (actor.facing >= 0 ? 1 : -1) : actor.turnFrom;
  const sideways = species.traits.includes('sideways');
  if (!sideways && actor.turnStart === null && Math.abs(dx) > PET_FOLLOW_GAP * 0.3 && Math.sign(dx) !== side) {
    actor.turnStart = now;
    actor.turnFrom = side;
  }
  if (sideways) {
    actor.facing = 1;
    actor.turnFrom = 1;
    actor.turnStart = null;
  } else if (actor.turnStart !== null) {
    const progress = (now - actor.turnStart) / TURN_MS;
    if (progress >= 1) {
      actor.turnFrom = -actor.turnFrom;
      actor.facing = actor.turnFrom;
      actor.turnStart = null;
    } else {
      actor.facing = turnFacing(actor.turnFrom, progress);
    }
  }
  actor.heading = actor.facing >= 0 ? 0 : Math.PI;

  // Drift after the pointer, keeping a little gap so the finger doesn't cover the face.
  if (pet.follow) {
    const gx = pet.x - (dx >= 0 ? 1 : -1) * PET_FOLLOW_GAP;
    const gy = pet.y;
    const ddx = gx - actor.x;
    const ddy = gy - actor.y;
    const d = Math.hypot(ddx, ddy);
    if (d > 1) {
      const step = Math.min(d, PET_FOLLOW_SPEED * dt);
      actor.x = clamp(actor.x + (ddx / d) * step, bounds.minX, bounds.maxX);
      actor.y = clamp(actor.y + (ddy / d) * step, bounds.minY, bounds.maxY);
    }
  }

  // Lean into the touch.
  const lean = clamp(Math.atan2(pet.y - actor.y, Math.abs(dx) + 20), -PET_LEAN, PET_LEAN);
  actor.tilt += (lean - actor.tilt) * Math.min(1, dt * PET_SETTLE);
  actor.stretch += (0 - actor.stretch) * Math.min(1, dt * STRETCH_SMOOTHING);
  const wave = waveFrequency(species.motion, 0.35, fish.stage === 'baby') * (PET_WAVE + pet.wiggle * 1.6);
  actor.phase += dt * wave;
}

const tmpBox: Box = { x0: 0, x1: 0, y0: 0, y1: 0 };

/** The tentacle area of a jelly actor right now (written into `out`). */
export function jellyTentacles(actor: FishActor, fish: Fish, out: Box): Box {
  const { w, h } = jellySize(fish.stage);
  return tentacleBox(actor.x, actor.y, w, h, bellSplitY(fish.speciesId, fish.stage), out);
}

/** A petted jelly pulses slowly (longer, dreamier pulses). */
const JELLY_PET_TEMPO = 1.7;

/** A tap: a few quick happy pulses and a glow flash. */
export function jellyHappy(j: JellyActor, now: number): void {
  j.happyLeft = JELLY_HAPPY_PULSES;
  j.nextPulseAt = now;
  j.flashAt = now;
}

/**
 * Jellyfish movement: no steering, flipping or tilting toward the velocity. Every 1.5–3s the bell
 * contracts and the jelly is pushed up (and a little toward where it wants to go); between pulses it
 * slows, drifts with the current and sinks gently. It keeps to the upper part of the tank, drifts
 * slowly toward nearby pellets and eats any pellet that touches its tentacles.
 */
function updateJelly(actor: FishActor, j: JellyActor, input: BehaviorInput): string | null {
  const { fish, now, dt, rng } = input;
  const species = getSpecies(fish.speciesId);
  const baby = fish.stage === 'baby';
  const sad = isSad(fish);
  const reduced = input.reduced ?? false;
  const bounds = swimBounds(fish.speciesId);
  const floor = jellyFloorY(fish.stage);
  actor.gloom += ((sad ? 1 : 0) - actor.gloom) * Math.min(1, dt * GLOOM_SMOOTHING);
  blink(actor, now, rng);

  // Where it wants to be: the courtship loop, a nearby pellet (tentacles under it), or a wander point.
  // Being petted holds it near the pointer (or where it is); saying hi or following steers it like a courtship.
  const pet = input.pet;
  const courting = input.courtship ?? (pet ? (pet.follow ? { x: pet.x, y: pet.y } : { x: actor.x, y: actor.y }) : input.seek);
  let food: FoodTarget | null = null;
  if (!courting && fish.hunger < FULL_HUNGER) {
    const near = nearestFood(actor, input.food);
    if (near && Math.hypot(near.x - actor.x, near.y - actor.y) < JELLY_FOOD_RANGE) food = near;
  }
  let tx: number;
  let ty: number;
  if (courting) {
    tx = courting.x;
    ty = Math.min(courting.y, floor);
    actor.nextWanderAt = now + WANDER_MIN_MS;
  } else if (food) {
    tx = food.x;
    ty = Math.min(food.y - jellySize(fish.stage).h * 0.2, bounds.maxY);
  } else {
    if (Math.abs(actor.targetX - actor.x) < ARRIVE_DIST * 2 || now >= actor.nextWanderAt) pickWanderTarget(actor, rng, now);
    tx = actor.targetX;
    ty = actor.targetY;
  }

  // Pulses: on the dance beat, queued happy pulses, or on its own rhythm (skipped while it is above
  // where it wants to be, so it sinks there instead).
  const gapK = (baby ? JELLY_BABY_GAP : 1) * (reduced ? JELLY_REDUCED_GAP : 1);
  const strength = (baby ? JELLY_BABY_PULSE : 1) * (reduced ? JELLY_REDUCED_PULSE : 1);
  const tempo = (baby ? 0.75 : reduced ? 1.3 : 1) * (pet ? JELLY_PET_TEMPO : 1);
  const happyTempo = JELLY_HAPPY_GAP_MS / (JELLY_CONTRACT_MS + JELLY_EXPAND_MS);
  let pulse: { strength: number; thrust: number; tempo: number } | null = null;
  if (input.beat !== undefined && input.beat !== null && j.happyLeft === 0) {
    if (input.beat !== j.lastBeat) {
      j.lastBeat = input.beat;
      // Small pushes on the beat (it would rocket up otherwise), but full-size pulses.
      pulse = { strength, thrust: actor.y > ty ? 0.35 : 0.1, tempo: input.beatTempo ?? 1 };
    }
  } else if (j.happyLeft > 0 && now >= j.nextPulseAt) {
    j.happyLeft -= 1;
    pulse = { strength: strength * 0.8, thrust: 0.25, tempo: happyTempo };
    j.nextPulseAt = now + (j.happyLeft > 0 ? JELLY_HAPPY_GAP_MS : rand(rng, JELLY_PULSE_GAP_MIN_MS, JELLY_PULSE_GAP_MAX_MS) * gapK);
  } else if (now >= j.nextPulseAt) {
    const wantsUp = courting !== undefined || actor.y > ty - 12 || actor.y > bounds.maxY;
    if (wantsUp) pulse = { strength, thrust: sad ? SAD_SPEED_MULTIPLIER : 1, tempo };
    j.nextPulseAt = now + rand(rng, JELLY_PULSE_GAP_MIN_MS, JELLY_PULSE_GAP_MAX_MS) * gapK;
  }
  // Sinking below its zone: pulse again soon.
  if (!courting && actor.y > bounds.maxY && j.happyLeft === 0) j.nextPulseAt = Math.min(j.nextPulseAt, now + 300);
  if (pulse) {
    j.pulseAt = now;
    j.pulseStrength = pulse.strength;
    j.pulseThrust = pulse.thrust * (baby ? 0.8 : 1);
    j.pulseTempo = pulse.tempo;
    j.pulseDirX = clamp((tx - actor.x) / 150, -1, 1);
  }

  // The push happens while the bell contracts.
  const since = now - j.pulseAt;
  if (isContracting(since, j.pulseTempo)) {
    const k = (dt * 1000) / (JELLY_CONTRACT_MS * j.pulseTempo);
    j.vy -= JELLY_PULSE_UP * j.pulseThrust * k;
    j.vx += JELLY_PULSE_SIDE * j.pulseDirX * j.pulseThrust * k;
  }

  // Drift: drag, gentle sinking, the current, and a slow pull toward food or the courtship loop.
  const drag = Math.exp(-JELLY_DRAG * dt);
  j.vx *= drag;
  j.vy *= drag;
  j.vy = Math.min(JELLY_SINK_MAX, j.vy + JELLY_SINK_ACCEL * dt);
  j.vx += (input.current ?? 0) * JELLY_CURRENT_ACCEL * dt;
  if (food || courting) j.vx += clamp((tx - actor.x) / 80, -1, 1) * JELLY_FOOD_ACCEL * dt;
  if (courting) j.vy += clamp((ty - actor.y) / 60, -1, 1) * JELLY_FOOD_ACCEL * dt;
  // Soft side walls and surface.
  const avoid = edgeAvoidance(actor.x, actor.y, bounds);
  j.vx += avoid.x * JELLY_FOOD_ACCEL * 2 * dt;
  if (actor.y < bounds.minY) j.vy = Math.max(j.vy, 0);

  actor.x = clamp(actor.x + j.vx * dt, bounds.minX, bounds.maxX);
  actor.y = clamp(actor.y + j.vy * dt, bounds.minY, floor);
  if (actor.y >= floor) j.vy = Math.min(j.vy, 0);
  actor.speed = Math.hypot(j.vx, j.vy);
  actor.heading = Math.atan2(j.vy, j.vx);
  actor.facing = 1;
  actor.turnStart = null;

  // A gentle wobble (±5°), leaning a touch into sideways drift; never a tilt toward the velocity.
  const wobble = JELLY_WOBBLE * (reduced ? 0.5 : 1) * Math.sin((now / 1000) * JELLY_WOBBLE_FREQ + j.seed);
  actor.tilt = wobble + clamp(j.vx * 0.003, -0.04, 0.04);

  // Tentacles: stretch while rising, relax while sinking; lean with the current and trail the motion.
  const smooth = Math.min(1, dt * JELLY_TENTACLE_SMOOTHING);
  j.rise += (clamp(-j.vy / JELLY_RISE_SPEED, -1, 1) - j.rise) * smooth;
  j.lean += ((input.current ?? 0) * JELLY_CURRENT_LEAN - j.vx * JELLY_TRAIL_LEAN - j.lean) * smooth;
  actor.phase += dt * JELLY_SWAY_FREQ * species.motion.waveSpeed * (baby ? BABY_WAVE_SPEED : 1);

  updateIndicator(actor, fish, now, rng);

  // Passive feeding: any pellet touching the tentacles is caught (it slides up and is eaten).
  if (fish.hunger < FULL_HUNGER && j.caught === null) {
    const box = jellyTentacles(actor, fish, tmpBox);
    for (const p of input.food) {
      if (!inBox(p.x, p.y, box)) continue;
      j.caught = { at: now, dx: p.x - actor.x, dy: p.y - actor.y, premium: p.premium ?? false };
      return p.id;
    }
  }
  return null;
}

/** Whether a jelly is done showing its last catch (the pellet has slid up into the bell). */
export function jellyCatchDone(j: JellyActor, now: number, slideMs: number): boolean {
  return j.caught !== null && now - j.caught.at >= slideMs;
}

