import { describe, expect, it } from 'vitest';
import { DROP_FALL_HEIGHT, DROP_LAND_MS, SAND_Y, WARP_SAND_SHARE } from '../../game/constants';
import { warpOffset } from './backgroundFx';
import { fishPush, stepSpring, swayOffset } from './decorBehaviors';
import { arcPoint, dropBounce } from './sandItems';

describe('springs', () => {
  it('overshoots its target once kicked, then settles there', () => {
    const s = { x: 0, v: 0 };
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      stepSpring(s, 1, 9, 3.2, 1 / 60);
      peak = Math.max(peak, s.x);
    }
    expect(peak).toBeGreaterThan(1);
    expect(s.x).toBeCloseTo(1, 2);
  });
});

describe('plant sway', () => {
  it('keeps the base still and moves the tip the most', () => {
    for (const t of [0, 1.3, 7.7]) {
      expect(swayOffset(0, t, 0.4, 1, 6, 0.5)).toBe(0);
      expect(Math.abs(swayOffset(1, t, 0.4, 1, 6, 0.5))).toBeGreaterThanOrEqual(Math.abs(swayOffset(0.5, t, 0.4, 1, 6, 0.5)) - 1e-9);
    }
  });

  it('leans with the bend (current, fish) on top of the idle sway', () => {
    expect(swayOffset(1, 0, 0, 1, 6, 1) - swayOffset(1, 0, 0, 1, 6, 0)).toBeCloseTo(6);
  });

  it('is pushed away from a fish swimming through it, and ignores fish far away', () => {
    expect(fishPush(500, SAND_Y, 80, 100, [{ x: 480, y: SAND_Y - 50 }])).toBeGreaterThan(0);
    expect(fishPush(500, SAND_Y, 80, 100, [{ x: 520, y: SAND_Y - 50 }])).toBeLessThan(0);
    expect(fishPush(500, SAND_Y, 80, 100, [{ x: 700, y: SAND_Y - 50 }])).toBe(0);
    expect(fishPush(500, SAND_Y, 80, 100, [{ x: 495, y: SAND_Y - 300 }])).toBe(0);
  });
});

describe('drops', () => {
  it('fall from above, bounce lower each time, and rest on the sand', () => {
    expect(dropBounce(0)).toBeCloseTo(DROP_FALL_HEIGHT);
    expect(dropBounce(DROP_LAND_MS * 0.3)).toBeCloseTo(0);
    const second = Math.max(...Array.from({ length: 50 }, (_, i) => dropBounce(DROP_LAND_MS * (0.3 + (i / 50) * 0.34))));
    const third = Math.max(...Array.from({ length: 50 }, (_, i) => dropBounce(DROP_LAND_MS * (0.64 + (i / 50) * 0.22))));
    expect(second).toBeLessThan(DROP_FALL_HEIGHT);
    expect(third).toBeLessThan(second);
    expect(dropBounce(DROP_LAND_MS)).toBe(0);
    expect(dropBounce(-Infinity)).toBe(0);
  });

  it('fly along an arc that starts and ends at the right points and rises in between', () => {
    const a = { x: 100, y: 560 };
    const b = { x: 20, y: 20 };
    expect(arcPoint(a, b, 90, 0)).toEqual(a);
    expect(arcPoint(a, b, 90, 1)).toEqual(b);
    expect(arcPoint(a, b, 90, 0.5).y).toBeLessThan((a.y + b.y) / 2);
  });
});

describe('water warp', () => {
  it('stays within its amplitude and is calmer below the sand line', () => {
    let maxWater = 0;
    let maxSand = 0;
    for (let t = 0; t < 20; t += 0.1) {
      maxWater = Math.max(maxWater, Math.abs(warpOffset(300, t, 2)));
      maxSand = Math.max(maxSand, Math.abs(warpOffset(SAND_Y + 20, t, 2)));
    }
    expect(maxWater).toBeLessThanOrEqual(2);
    expect(maxSand).toBeLessThanOrEqual(2 * WARP_SAND_SHARE + 1e-9);
  });
});
