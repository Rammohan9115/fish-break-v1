// Procedural animation math for sprite fish: body wave, turning, bobbing, squash & stretch, gaze.
// Pure functions (no DOM), shared by behavior.ts and drawFish.ts and unit-tested.
import {
  ACCEL_STRETCH,
  BABY_BOB_AMP,
  BABY_BOB_FREQ,
  BABY_WAVE_AMP,
  BABY_WAVE_SPEED,
  EAT_SQUASH,
  EAT_SQUASH_MS,
  EYE_LOOK_RANGE,
  POKE_BOUNCE,
  POKE_BOUNCE_FREQ,
  POKE_BOUNCE_MS,
  PUFFER_BOB_AMP,
  PUFFER_BOB_FREQ,
  SPRITE_WAVE_AMP,
  SPRITE_WAVE_FALLOFF,
  SPRITE_WAVE_HEAD,
  SPRITE_WAVE_STRIP_PHASE,
  TURN_SPEED_FACTOR,
  WALK_BOB_AMP,
  WALK_ROCK,
  WAVE_IDLE_AMP,
  WAVE_IDLE_FREQ,
  WAVE_MAX_SPEED_FRAC,
  WAVE_SWIM_FREQ,
} from '../game/constants';
import type { SpriteMotion } from '../game/types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth ease-in-out (cubic), 0..1 → 0..1. */
export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Facing during a turn that started at `from` (±1): 1 → 0 → -1, eased. */
export function turnFacing(from: number, progress: number): number {
  return from * (1 - 2 * easeInOut(progress));
}

/** Swim speed multiplier during a turn: dips to TURN_SPEED_FACTOR mid-turn and eases back. */
export function turnSpeedFactor(progress: number): number {
  return 1 - (1 - TURN_SPEED_FACTOR) * Math.sin(Math.PI * clamp(progress, 0, 1));
}

/** Current speed relative to the species' cruise speed, capped for very fast bursts. */
export function speedFraction(speed: number, cruise: number): number {
  return cruise > 0 ? clamp(speed / cruise, 0, WAVE_MAX_SPEED_FRAC) : 0;
}

/** How fast the body wave advances (radians per second): slow when idle, quicker when swimming hard. */
export function waveFrequency(motion: SpriteMotion, speedFrac: number, baby: boolean): number {
  return lerp(WAVE_IDLE_FREQ, WAVE_SWIM_FREQ, speedFrac) * motion.waveSpeed * (baby ? BABY_WAVE_SPEED : 1);
}

/** Tail-tip wave amplitude as a fraction of sprite height. `damp` is 1 normally, less with reduced motion. */
export function waveAmplitude(motion: SpriteMotion, speedFrac: number, baby: boolean, damp: number): number {
  return SPRITE_WAVE_AMP * motion.waveAmp * lerp(WAVE_IDLE_AMP, 1, speedFrac) * (baby ? BABY_WAVE_AMP : 1) * damp;
}

/** Wave strength along the body: 0 over the rigid head, rising to 1 at the tail tip. `u` = 0 at the nose, 1 at the tail. */
export function waveEnvelope(u: number): number {
  if (u <= SPRITE_WAVE_HEAD) return 0;
  return clamp((u - SPRITE_WAVE_HEAD) / (1 - SPRITE_WAVE_HEAD), 0, 1) ** SPRITE_WAVE_FALLOFF;
}

/**
 * Vertical offset of strip `i` of `n` (strip 0 is the tail end of the art, n-1 the nose), in the
 * same units as `amp`. Each strip lags the one in front of it, so the wave travels head → tail.
 */
export function stripOffset(i: number, n: number, phase: number, amp: number): number {
  const fromNose = n - 1 - i;
  return amp * waveEnvelope((fromNose + 0.5) / n) * Math.sin(phase - fromNose * SPRITE_WAVE_STRIP_PHASE);
}

/** Whole-body bob (fraction of sprite height) and rock (radians) for the gait and stage. */
export function bodyBob(gait: SpriteMotion['gait'], baby: boolean, timeSec: number, phase: number, speedFrac: number): { dy: number; rock: number } {
  let dy = baby ? BABY_BOB_AMP * Math.sin(timeSec * BABY_BOB_FREQ) : 0;
  let rock = 0;
  if (gait === 'bob') {
    dy += PUFFER_BOB_AMP * Math.sin(timeSec * PUFFER_BOB_FREQ);
    rock = PUFFER_BOB_AMP * 0.6 * Math.sin(timeSec * PUFFER_BOB_FREQ - 0.8);
  } else if (gait === 'walk') {
    // One lift per step (two steps per wave cycle), stronger when walking faster.
    const stride = Math.min(1, speedFrac);
    dy -= WALK_BOB_AMP * stride * Math.abs(Math.sin(phase));
    rock = WALK_ROCK * stride * Math.sin(phase);
  }
  return { dy, rock };
}

/** Gulp squash 0..1 after eating (`ms` since the bite). */
export function eatSquash(ms: number): number {
  return ms >= 0 && ms < EAT_SQUASH_MS ? Math.sin((Math.PI * ms) / EAT_SQUASH_MS) : 0;
}

/** Jelly bounce after a click: signed scale offset that decays to 0 (`ms` since the click). */
export function pokeBounce(ms: number): number {
  if (ms < 0 || ms >= POKE_BOUNCE_MS) return 0;
  const t = ms / POKE_BOUNCE_MS;
  return POKE_BOUNCE * Math.sin((ms / 1000) * POKE_BOUNCE_FREQ) * (1 - t) ** 2;
}

/**
 * Body scale along the swim direction (sx) and across it (sy) from acceleration stretch (0..1),
 * eating squash (0..1) and click bounce (signed). Roughly volume-preserving.
 */
export function squashStretch(stretch: number, eat: number, bounce: number): { sx: number; sy: number } {
  const along = ACCEL_STRETCH * stretch - EAT_SQUASH * eat - bounce;
  return { sx: 1 + along, sy: 1 - along * 0.5 + bounce * 0.5 };
}

/**
 * Pupil offset (in eye radii) toward a direction given in the fish's local frame (x = forward).
 * Closer targets pull less than far ones, so a fish doesn't go cross-eyed at its own nose.
 */
export function pupilOffset(dx: number, dy: number, near: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const reach = EYE_LOOK_RANGE * Math.min(1, d / near);
  return { x: (dx / d) * reach, y: (dy / d) * reach };
}
