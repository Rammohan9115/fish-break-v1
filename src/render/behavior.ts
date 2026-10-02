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
  FLIP_RATE,
  FOOD_SPEED_MULTIPLIER,
  FULL_HUNGER,
  HUNGRY_INDICATOR_HUNGER,
  INDICATOR_DURATION_MS,
  INDICATOR_GAP_MAX_MS,
  INDICATOR_GAP_MIN_MS,
  MAX_PITCH,
  MIN_CRUISE_FRACTION,
  SAD_HAPPINESS,
  SAD_SPEED_MULTIPLIER,
  SAND_Y,
  SCHOOL_COHESION,
  SCHOOL_RADIUS,
  SCHOOL_SEPARATION,
  SCHOOL_SEPARATION_DIST,
  SWIM_SAND_CLEARANCE,
  SWIM_SIDE_MARGIN,
  SWIM_TOP,
  TANK_WIDTH,
  TURN_RATE,
  WANDER_MAX_MS,
  WANDER_MIN_MS,
} from '../game/constants';
import { getSpecies } from '../game/species';
import type { Fish, Rng, SpeciesId } from '../game/types';
import { mouthOffset } from './drawFish';

export type IndicatorKind = 'sad' | 'hungry';

export interface FishActor {
  id: string;
  speciesId: SpeciesId;
  x: number;
  y: number;
  /** Direction of travel, radians. */
  heading: number;
  speed: number;
  /** Eased -1..1 for the flip animation. */
  facing: number;
  targetX: number;
  targetY: number;
  nextWanderAt: number;
  /** Wobble phase (radians). */
  phase: number;
  blinkAt: number;
  blinkUntil: number;
  dartUntil: number;
  nextDartAt: number;
  indicator: { kind: IndicatorKind; start: number; until: number } | null;
  nextIndicatorAt: number;
  inflateUntil: number;
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

export function swimBounds(speciesId: SpeciesId): Bounds {
  const base = { minX: SWIM_SIDE_MARGIN, maxX: TANK_WIDTH - SWIM_SIDE_MARGIN };
  if (getSpecies(speciesId).traits.includes('walksOnSand')) {
    return { ...base, minY: SAND_Y - AXOLOTL_SAND_CLEARANCE - AXOLOTL_BAND, maxY: SAND_Y - AXOLOTL_SAND_CLEARANCE };
  }
  return { ...base, minY: SWIM_TOP, maxY: SAND_Y - SWIM_SAND_CLEARANCE };
}

function pickWanderTarget(actor: FishActor, rng: Rng, now: number): void {
  const b = swimBounds(actor.speciesId);
  actor.targetX = rand(rng, b.minX, b.maxX);
  actor.targetY = rand(rng, b.minY, b.maxY);
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
  };
  pickWanderTarget(actor, rng, now);
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

  // Target: nearest food if hungry enough, otherwise wander
  const food = fish.hunger < FULL_HUNGER ? nearestFood(actor, input.food) : null;
  let tx: number;
  let ty: number;
  if (food) {
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

  const maxSpeed = maxSpeedFor(fish, actor, now, food !== null);
  const arriveFactor = food ? 1 : Math.max(MIN_CRUISE_FRACTION, Math.min(1, dist / ARRIVE_SLOWDOWN_DIST));
  const targetSpeed = maxSpeed * arriveFactor;
  const accel = maxSpeed * ACCEL_FRACTION * dt;
  actor.speed = clamp(targetSpeed, actor.speed - accel, actor.speed + accel);

  actor.x = clamp(actor.x + Math.cos(actor.heading) * actor.speed * dt, bounds.minX, bounds.maxX);
  actor.y = clamp(actor.y + Math.sin(actor.heading) * actor.speed * dt, bounds.minY, bounds.maxY);

  // Face the direction of travel, flipping smoothly.
  const vx = Math.cos(actor.heading) * actor.speed;
  if (Math.abs(vx) > 1) {
    const want = vx > 0 ? 1 : -1;
    actor.facing = clamp(actor.facing + clamp(want - actor.facing, -FLIP_RATE * dt, FLIP_RATE * dt), -1, 1);
  }

  // Wobble faster when swimming faster.
  actor.phase += dt * (3 + actor.speed / 12);

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
    if (reached) return food.id;
  }
  return null;
}
