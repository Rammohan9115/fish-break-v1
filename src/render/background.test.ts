import { describe, expect, it } from 'vitest';
import { SAND_Y } from '../game/constants';
import { backgroundPlacement } from './background';

const WIDE = { x0: -60, x1: 1060, y0: 0, y1: 625 };
const TALL = { x0: 0, x1: 1000, y0: -700, y1: 900 };

describe('backgroundPlacement', () => {
  for (const [name, ext] of [['wide', WIDE], ['tall', TALL]] as const) {
    it(`covers the whole ${name} view with the sand line on SAND_Y`, () => {
      for (const sand of [0.7, 0.84, 0.95]) {
        const p = backgroundPlacement(16 / 9, ext, sand, 1, 0);
        expect(p.x).toBeLessThanOrEqual(ext.x0 + 1e-6);
        expect(p.x + p.w).toBeGreaterThanOrEqual(ext.x1 - 1e-6);
        expect(p.y).toBeLessThanOrEqual(ext.y0 + 1e-6);
        expect(p.y + p.h).toBeGreaterThanOrEqual(ext.y1 - 1e-6);
        expect(p.y + p.h * sand).toBeCloseTo(SAND_Y);
      }
    });
  }

  it('keeps covering at full parallax shift and keeps the sand line in place', () => {
    for (const shift of [-1, 1]) {
      const p = backgroundPlacement(16 / 9, WIDE, 0.84, 1.04, shift);
      expect(p.x).toBeLessThanOrEqual(WIDE.x0);
      expect(p.x + p.w).toBeGreaterThanOrEqual(WIDE.x1);
      expect(p.y + p.h * 0.84).toBeCloseTo(SAND_Y);
    }
  });

  it('slides opposite ways for opposite shifts', () => {
    const left = backgroundPlacement(16 / 9, WIDE, 0.84, 1.04, -1);
    const right = backgroundPlacement(16 / 9, WIDE, 0.84, 1.04, 1);
    expect(right.x).toBeGreaterThan(left.x);
  });
});
