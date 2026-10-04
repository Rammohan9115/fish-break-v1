import { describe, expect, it } from 'vitest';
import {
  ACCEL_STRETCH,
  BABY_WAVE_SPEED,
  EYE_LOOK_RANGE,
  POKE_BOUNCE,
  POKE_BOUNCE_MS,
  REDUCED_WAVE,
  SPRITE_WAVE_HEAD,
  SPRITE_WAVE_STRIPS,
  TURN_SPEED_FACTOR,
  WAVE_MAX_SPEED_FRAC,
} from '../game/constants';
import { SPECIES } from '../game/species';
import {
  bodyBob,
  eatSquash,
  pokeBounce,
  pupilOffset,
  speedFraction,
  squashStretch,
  stripOffset,
  turnFacing,
  turnSpeedFactor,
  waveAmplitude,
  waveEnvelope,
  waveFrequency,
} from './fishMotion';

describe('body wave', () => {
  it('keeps the head rigid and peaks at the tail', () => {
    expect(waveEnvelope(0)).toBe(0);
    expect(waveEnvelope(SPRITE_WAVE_HEAD)).toBe(0);
    expect(waveEnvelope(1)).toBeCloseTo(1);
    expect(waveEnvelope(0.6)).toBeLessThan(waveEnvelope(0.9));
  });

  it('never moves the front 30% of strips', () => {
    const n = SPRITE_WAVE_STRIPS;
    for (let phase = 0; phase < 7; phase += 0.7) {
      for (let i = n - Math.floor(n * SPRITE_WAVE_HEAD); i < n; i++) expect(Math.abs(stripOffset(i, n, phase, 10))).toBe(0);
    }
    const tail = Array.from({ length: 20 }, (_, k) => Math.abs(stripOffset(0, n, k * 0.4, 10)));
    expect(Math.max(...tail)).toBeGreaterThan(8);
  });

  it('is faster and bigger when swimming fast', () => {
    const m = SPECIES.guppy.motion;
    expect(waveFrequency(m, 1, false)).toBeGreaterThan(waveFrequency(m, 0, false));
    expect(waveAmplitude(m, 1, false, 1)).toBeGreaterThan(waveAmplitude(m, 0, false, 1));
  });

  it('gives finned species a slower, larger wave than darters', () => {
    expect(waveFrequency(SPECIES.betta.motion, 1, false)).toBeLessThan(waveFrequency(SPECIES.danio.motion, 1, false));
    expect(waveAmplitude(SPECIES.betta.motion, 1, false, 1)).toBeGreaterThan(waveAmplitude(SPECIES.tetra.motion, 1, false, 1));
    expect(waveAmplitude(SPECIES.puffer.motion, 1, false, 1)).toBeLessThan(waveAmplitude(SPECIES.danio.motion, 1, false, 1) / 3);
  });

  it('wiggles babies faster', () => {
    const m = SPECIES.goldfish.motion;
    expect(waveFrequency(m, 0.5, true)).toBeCloseTo(waveFrequency(m, 0.5, false) * BABY_WAVE_SPEED);
    expect(waveAmplitude(m, 0.5, true, 1)).toBeGreaterThan(waveAmplitude(m, 0.5, false, 1));
  });

  it('cuts amplitude by 70% with reduced motion', () => {
    const m = SPECIES.koi.motion;
    expect(waveAmplitude(m, 1, false, REDUCED_WAVE)).toBeCloseTo(waveAmplitude(m, 1, false, 1) * 0.3);
  });

  it('caps the speed fraction', () => {
    expect(speedFraction(0, 50)).toBe(0);
    expect(speedFraction(25, 50)).toBe(0.5);
    expect(speedFraction(500, 50)).toBe(WAVE_MAX_SPEED_FRAC);
  });
});

describe('bobbing', () => {
  it('only bobs babies, puffers and walkers', () => {
    expect(bodyBob('swim', false, 1.3, 2, 1)).toEqual({ dy: 0, rock: 0 });
    expect(bodyBob('swim', true, 0.3, 2, 1).dy).not.toBe(0);
    expect(bodyBob('bob', false, 0.3, 2, 0).dy).not.toBe(0);
  });

  it('only steps while walking', () => {
    expect(bodyBob('walk', false, 1, 1, 0).dy).toBeCloseTo(0);
    expect(bodyBob('walk', false, 1, 1, 1).dy).toBeLessThan(0);
  });
});

describe('turning', () => {
  it('goes 1 → 0 → -1 with easing', () => {
    expect(turnFacing(1, 0)).toBe(1);
    expect(turnFacing(1, 0.5)).toBeCloseTo(0);
    expect(turnFacing(1, 1)).toBe(-1);
    expect(turnFacing(-1, 1)).toBe(1);
    // Eased: barely moves at the start.
    expect(turnFacing(1, 0.1)).toBeGreaterThan(0.95);
  });

  it('slows down mid-turn', () => {
    expect(turnSpeedFactor(0)).toBe(1);
    expect(turnSpeedFactor(0.5)).toBeCloseTo(TURN_SPEED_FACTOR);
    expect(turnSpeedFactor(1)).toBeCloseTo(1);
  });
});

describe('squash & stretch', () => {
  it('stretches 8% along the swim direction at full acceleration', () => {
    const { sx, sy } = squashStretch(1, 0, 0);
    expect(sx).toBeCloseTo(1 + ACCEL_STRETCH);
    expect(sy).toBeLessThan(1);
  });

  it('squashes briefly when eating', () => {
    expect(eatSquash(-1)).toBe(0);
    expect(eatSquash(100)).toBeGreaterThan(0.5);
    expect(eatSquash(10_000)).toBe(0);
    expect(squashStretch(0, 1, 0).sx).toBeLessThan(1);
  });

  it('bounces up to 10% when clicked, then settles', () => {
    let peak = 0;
    for (let ms = 0; ms < POKE_BOUNCE_MS; ms += 5) peak = Math.max(peak, Math.abs(pokeBounce(ms)));
    expect(peak).toBeGreaterThan(POKE_BOUNCE * 0.7);
    expect(peak).toBeLessThanOrEqual(POKE_BOUNCE);
    expect(pokeBounce(POKE_BOUNCE_MS)).toBe(0);
  });
});

describe('gaze', () => {
  it('points the pupil toward the target, within the eye', () => {
    const right = pupilOffset(100, 0, 10);
    expect(right.x).toBeCloseTo(EYE_LOOK_RANGE);
    expect(right.y).toBeCloseTo(0);
    const up = pupilOffset(0, -100, 10);
    expect(up.y).toBeCloseTo(-EYE_LOOK_RANGE);
    expect(pupilOffset(0, 0, 10)).toEqual({ x: 0, y: 0 });
    expect(Math.abs(pupilOffset(1, 0, 10).x)).toBeLessThan(EYE_LOOK_RANGE);
  });
});

describe('species sprite settings', () => {
  it('places every eye inside its sprite', () => {
    for (const s of Object.values(SPECIES)) {
      for (const eye of [s.eye.adult, s.eye.baby]) {
        // Side-on fish have their eye toward the nose; a front-facing face (jelly) has two, one each side.
        if (eye.twinX !== undefined) {
          expect(eye.x).toBeLessThan(0.5);
          expect(eye.twinX).toBeGreaterThan(0.5);
          expect(eye.twinX).toBeLessThan(1);
        } else expect(eye.x).toBeGreaterThan(0.5);
        expect(eye.x).toBeLessThan(1);
        expect(eye.y).toBeGreaterThan(0);
        expect(eye.y).toBeLessThan(1);
        expect(eye.size).toBeGreaterThan(0);
        expect(eye.size).toBeLessThan(0.5);
      }
    }
  });

  it('gives the puffer a bob and the axolotl a walk', () => {
    expect(SPECIES.puffer.motion.gait).toBe('bob');
    expect(SPECIES.axolotl.motion.gait).toBe('walk');
  });
});
