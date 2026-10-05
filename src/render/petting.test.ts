import { describe, expect, it } from 'vitest';
import { PET_METER_MS, PET_STROKE_BOOST, PET_STROKE_MIN_TRAVEL } from '../game/constants';
import { PetMeter, StrokeDetector, trickPose, trickVisual } from './petting';

describe('PetMeter', () => {
  it('fills in 3 seconds of holding, then starts the next session', () => {
    const m = new PetMeter();
    expect(m.advance(PET_METER_MS - 1, false)).toBe(false);
    expect(m.advance(1, false)).toBe(true);
    expect(m.progress).toBe(0);
  });

  it('fills 50% faster while stroking', () => {
    const m = new PetMeter();
    expect(m.advance(PET_METER_MS / PET_STROKE_BOOST - 1, true)).toBe(false);
    expect(m.advance(2, true)).toBe(true);
  });
});

describe('StrokeDetector', () => {
  it('back-and-forth movement counts as stroking; a slow drag one way does not', () => {
    const s = new StrokeDetector();
    const leg = PET_STROKE_MIN_TRAVEL + 2;
    let x = 100;
    for (let i = 0; i < 6; i++) s.move((x += leg), i * 30);
    expect(s.stroking(200)).toBe(false);
    s.move((x -= leg), 220);
    s.move((x += leg), 260);
    expect(s.stroking(270)).toBe(true);
    // It wears off once the reversals are old.
    expect(s.stroking(5000)).toBe(false);
  });

  it('ignores jitter smaller than a stroke', () => {
    const s = new StrokeDetector();
    for (let i = 0; i < 20; i++) s.move(100 + (i % 2), i * 10);
    expect(s.stroking(200)).toBe(false);
  });
});

describe('trickPose', () => {
  it('is at rest before and after the trick', () => {
    for (const t of [0, 1]) expect(trickPose('spin', t, 1, false)).toMatchObject({ rot: 0, dx: 0, dy: 0, scale: 1 });
  });

  it('spin turns a full circle', () => {
    expect(Math.abs(trickPose('spin', 0.999, 1, false).rot)).toBeCloseTo(Math.PI * 2, 1);
  });

  it('reduced motion makes every trick a gentle scale pulse', () => {
    const p = trickPose('backflip', 0.5, 1, true);
    expect(p.rot).toBe(0);
    expect(p.dy).toBe(0);
    expect(p.scale).toBeCloseTo(1.12);
  });

  it('the koi leaps up by the given height', () => {
    expect(trickPose('leap', 0.5, 1, false, 300).dy).toBeCloseTo(-300);
  });

  it('picks the species signature', () => {
    expect(trickVisual('signature', 'goldfish')).toBe('heartBubble');
    expect(trickVisual('signature', 'tetra')).toBe('zoom');
    expect(trickVisual('signature', 'danio')).toBe('zoom');
    expect(trickVisual('spin', 'koi')).toBe('spin');
  });
});
