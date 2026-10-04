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
  GLOOM_SMOOTHING,
  SAD_SPEED_MULTIPLIER,
  SAND_Y,
  SCHOOL_COHESION,
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
} from '../game/constants';
import { getSpecies } from '../game/species';
import type { Fish, Rng, SpeciesId } from '../game/types';
import { mouthOffset } from './drawFish';
import { speedFraction, turnFacing, turnSpeedFactor, waveFrequency } from './fishMotion';

export type IndicatorKind = 'sad' | 'hungry';

export interface FishActor {
  id: string;
  speciesId: SpeciesId;
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

export function swimBounds(speciesId: SpeciesId): Bounds {
  const base = { minX: swimExtent.minX, maxX: swimExtent.maxX };
  if (getSpecies(speciesId).traits.includes('walksOnSand')) {
    return { ...base, minY: SAND_Y - AXOLOTL_SAND_CLEARANCE - AXOLOTL_BAND, maxY: SAND_Y - AXOLOTL_SAND_CLEARANCE };
  }
  return { ...base, minY: swimExtent.minY, maxY: SAND_Y - SWIM_SAND_CLEARANCE };
}

function pickWanderTarget(actor: FishActor, rng: Rng, now: number): void {
  const b = swimBounds(actor.speciesId);
  actor.targetX = rand(rng, b.minX, b.maxX);
  // Sad fish mope lower in the water.
  actor.targetY = rand(rng, b.minY + (b.maxY - b.minY) * SAD_SINK * actor.gloom, b.maxY);
  actor.nextWanderAt = now + rand(rng, WANDER_MIN_MS, WANDER_MAX_MS);
}

export function createActor(fish: Fish, rng: Rng, now: number, at?: { x: number; y: number }): FishActor {
  const b = swimBounds(fish.speciesId);
  const facing = rng() < 0.5 ? -1 : 1;
  const actor: FishActor = {
    id: fish.id,
    speciesId: fish.speciesId,
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
  };
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

/**
 * Advances one actor by `dt` seconds. Mutates the actor (renderer-only state).
 * Returns the id of a pellet the fish's mouth reached, or null.
 */
export function updateActor(actor: FishActor, input: BehaviorInput): string | null {
  const { fish, now, dt, rng } = input;
  const species = getSpecies(fish.speciesId);
  const swim = swimBounds(fish.speciesId);
  actor.gloom += ((isSad(fish) ? 1 : 0) - actor.gloom) * Math.min(1, dt * GLOOM_SMOOTHING);

  // Blink
  if (now >= actor.blinkAt) {
    actor.blinkUntil = now + BLINK_DURATION_MS;
    actor.blinkAt = now + rand(rng, BLINK_MIN_MS, BLINK_MAX_MS);
  }

  // Darting species occasionally burst forward
  const darts = species.traits.includes('darts');
  if (darts && now >= actor.nextDartAt) {
    actor.dartUntil = now + DART_DURATION_MS;
    actor.nextDartAt = now + rand(rng, DART_GAP_MIN_MS, DART_GAP_MAX_MS);
  }

  // Target: the courtship loop, else nearest food if hungry enough, otherwise wander
  const courting = input.courtship;
  const food = !courting && fish.hunger < FULL_HUNGER ? nearestFood(actor, input.food) : null;
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
  } else {
    const arrived = Math.hypot(actor.targetX - actor.x, actor.targetY - actor.y) < ARRIVE_DIST;
    if (arrived || now >= actor.nextWanderAt) pickWanderTarget(actor, rng, now);
    tx = actor.targetX;
    ty = actor.targetY;
  }

  // While chasing food, the fish may dip to the sand or the surface to reach it.
  const bounds = food ? { ...swim, minY: Math.min(swim.minY, food.y), maxY: Math.max(swim.maxY, food.y) } : swim;

  // Steering: seek + edge avoidance + schooling, then turn toward it at a limited rate.
  const dx = tx - actor.x;
  const dy = ty - actor.y;
  const dist = Math.hypot(dx, dy) || 1;
  let sx = dx / dist;
  let sy = dy / dist;
  const avoid = edgeAvoidance(actor.x, actor.y, bounds);
  sx += avoid.x * EDGE_AVOID_WEIGHT;
  sy += avoid.y * EDGE_AVOID_WEIGHT;
  if (species.traits.includes('schools') && !food) {
    const school = schoolingForce(actor, input.schoolmates);
    sx += school.x;
    sy += school.y;
  }

  const desiredHeading = Math.atan2(sy, sx);
  const turnRate = TURN_RATE * (darts ? DART_TURN_MULTIPLIER : 1);
  const delta = wrapAngle(desiredHeading - actor.heading);
  actor.heading = wrapAngle(actor.heading + clamp(delta, -turnRate * dt, turnRate * dt));

  // Courting is a slow, dreamy glide once on the loop; catching up to it is a normal swim.
  const maxSpeed = maxSpeedFor(fish, actor, now, food !== null) * (courting ? COURTSHIP_SPEED : 1);
  // Courting fish ease onto the moving loop point instead of overshooting it.
  const arriveFactor = food ? 1 : Math.max(courting ? 0.15 : MIN_CRUISE_FRACTION, Math.min(1, dist / ARRIVE_SLOWDOWN_DIST));
  const targetSpeed = maxSpeed * arriveFactor;
  const accel = maxSpeed * ACCEL_FRACTION * dt;
  const prevSpeed = actor.speed;
  actor.speed = clamp(targetSpeed, actor.speed - accel, actor.speed + accel);

  // Stretch along the swim direction while speeding up.
  const accelFrac = dt > 0 && accel > 0 ? clamp((actor.speed - prevSpeed) / accel, 0, 1) : 0;
  actor.stretch += (accelFrac - actor.stretch) * Math.min(1, dt * STRETCH_SMOOTHING);

  // Face the direction of travel: a quick eased turn-around (scaleX 1 → 0 → -1), slowing down through it.
  const vx = Math.cos(actor.heading) * actor.speed;
  const side = actor.facing >= 0 ? 1 : -1;
  if (actor.turnStart === null && Math.abs(vx) > TURN_MIN_VX && Math.sign(vx) !== side) {
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

  actor.x = clamp(actor.x + Math.cos(actor.heading) * moveSpeed * dt, bounds.minX, bounds.maxX);
  actor.y = clamp(actor.y + Math.sin(actor.heading) * moveSpeed * dt, bounds.minY, bounds.maxY);

  // Tilt toward the velocity, smoothed.
  actor.tilt += (pitchOf(actor) - actor.tilt) * Math.min(1, dt * TILT_SMOOTHING);

  // The body wave runs faster when swimming faster (per-species rhythm, quicker for babies).
  actor.phase += dt * waveFrequency(species.motion, speedFraction(actor.speed, species.speed), fish.stage === 'baby');

  // Sad / hungry indicators
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
