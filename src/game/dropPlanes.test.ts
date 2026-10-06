import { describe, expect, it } from 'vitest';
import { DECOR_Z, DEPTH_PLANES, DROP_PLANE_WEIGHTS, SAND_Y } from './constants';
import { DEPTH_PLANE_LIST, depthGeometry, dropDrawZ, pickPlane, planeConfig, planeOfZ } from './decor';
import { coveredShare, visibleX } from './dropVisibility';
import { tick } from './sim';
import { MINUTE_MS } from './constants';
import { makeFish, makeState, seededRng, T0 } from './testUtils';
import type { DepthPlane } from './types';

describe('pickPlane (seeded RNG)', () => {
  it('maps a draw to back 30% / mid 40% / front 30%', () => {
    expect(pickPlane(() => 0)).toBe('back');
    expect(pickPlane(() => 0.299)).toBe('back');
    expect(pickPlane(() => 0.3)).toBe('mid');
    expect(pickPlane(() => 0.699)).toBe('mid');
    expect(pickPlane(() => 0.7)).toBe('front');
    expect(pickPlane(() => 0.999)).toBe('front');
  });

  it('is deterministic for a seed and lands near the weights over many drops', () => {
    const run = (seed: number) => {
      const rng = seededRng(seed);
      return Array.from({ length: 10000 }, () => pickPlane(rng));
    };
    expect(run(7)).toEqual(run(7));
    const counts: Record<DepthPlane, number> = { back: 0, mid: 0, front: 0 };
    for (const p of run(7)) counts[p]++;
    for (const p of DEPTH_PLANE_LIST) expect(counts[p] / 10000).toBeCloseTo(DROP_PLANE_WEIGHTS[p], 1);
  });

  it('the weights sum to 1', () => {
    expect(DEPTH_PLANE_LIST.reduce((n, p) => n + DROP_PLANE_WEIGHTS[p], 0)).toBeCloseTo(1, 10);
  });

  it('the simulation gives every new drop a plane', () => {
    const fish = makeFish({ stage: 'adult', growth: 1200, hunger: 80, happiness: 85, lastDropAt: T0 - 8 * MINUTE_MS + 1000 });
    const { state } = tick(makeState({ fish: [fish] }), 1000, seededRng(3));
    const drops = state.tanks[0]!.shells;
    expect(drops).toHaveLength(1);
    expect(DEPTH_PLANE_LIST).toContain(drops[0]!.plane);
  });
});

describe('shared plane config', () => {
  it('planes are the decor Far / Mid / Near depths, so decor and drops line up', () => {
    expect(DEPTH_PLANES.back.z).toBe(DECOR_Z.far);
    expect(DEPTH_PLANES.mid.z).toBe(DECOR_Z.mid);
    expect(DEPTH_PLANES.front.z).toBe(DECOR_Z.near);
    for (const p of DEPTH_PLANE_LIST) expect(planeConfig('classic', p).dy).toBe(depthGeometry(DEPTH_PLANES[p].z).dy);
  });

  it('back is higher up the sand and smaller, front is lower and bigger, mid is the old look', () => {
    const [back, mid, front] = DEPTH_PLANE_LIST.map((p) => planeConfig('classic', p));
    expect(back!.dy).toBeLessThan(0);
    expect(mid!.dy).toBe(0);
    expect(front!.dy).toBeGreaterThan(0);
    expect(back!.scale).toBeCloseTo(0.8, 1);
    expect(mid!.scale).toBe(1);
    expect(front!.scale).toBeCloseTo(1.15, 1);
    expect(back!.shadow).toBeLessThan(mid!.shadow);
    expect(front!.shadow).toBeGreaterThan(mid!.shadow);
    expect(back!.fallSpeed).toBeLessThan(front!.fallSpeed);
    expect(SAND_Y + front!.dy).toBeGreaterThan(SAND_Y + back!.dy);
  });

  it('back fades more than front, and murkier themes fade it more', () => {
    expect(planeConfig('classic', 'back').tint).toBeGreaterThan(planeConfig('classic', 'front').tint);
    expect(planeConfig('pond', 'back').tint).toBeGreaterThan(planeConfig('coral', 'back').tint);
    expect(planeConfig('classic', 'mid').dropHaze).toBe(0);
    expect(planeConfig('classic', 'front').dropHaze).toBe(0);
  });

  it('planeOfZ snaps a depth to the closest plane; a drop draws in front of decor on its own plane', () => {
    expect(planeOfZ(0.1)).toBe('back');
    expect(planeOfZ(0.5)).toBe('mid');
    expect(planeOfZ(0.9)).toBe('front');
    for (const p of DEPTH_PLANE_LIST) expect(dropDrawZ(p)).toBeGreaterThan(DEPTH_PLANES[p].z);
    expect(dropDrawZ('back')).toBeLessThan(DEPTH_PLANES.mid.z);
  });
});

describe('visibleX: sliding a drop out from behind decor', () => {
  const half = 20;

  it('leaves a drop alone when nothing, or little, covers it', () => {
    expect(visibleX(300, half, [], 40, 960)).toBe(300);
    expect(visibleX(300, half, [{ x0: 310, x1: 330 }], 40, 960)).toBe(300); // 15% hidden
  });

  it('slides a mostly hidden drop to the nearest visible spot, on the same plane (x only)', () => {
    const decor = [{ x0: 250, x1: 350 }];
    const x = visibleX(300, half, decor, 40, 960);
    expect(x).not.toBe(300);
    expect(coveredShare(x, half, decor)).toBeLessThanOrEqual(0.45);
    // Nearest: the edge is 50 away on either side, so it should not travel much further than that.
    expect(Math.abs(x - 300)).toBeLessThanOrEqual(50 + half * 2);
  });

  it('prefers the closer side', () => {
    const decor = [{ x0: 200, x1: 340 }];
    expect(visibleX(330, half, decor, 40, 960)).toBeGreaterThan(330); // the right edge is nearer
    expect(visibleX(210, half, decor, 40, 960)).toBeLessThan(210);
  });

  it('slides past the end of a wide piece, or a row of pieces', () => {
    const row = [{ x0: 200, x1: 300 }, { x0: 296, x1: 400 }];
    const x = visibleX(300, half, row, 40, 960);
    expect(coveredShare(x, half, row)).toBeLessThanOrEqual(0.45);
  });

  it('respects the tank edges (never slides out of bounds)', () => {
    const decor = [{ x0: 20, x1: 120 }];
    const x = visibleX(60, half, decor, 40, 960);
    expect(x).toBeGreaterThanOrEqual(40);
    expect(x).toBeGreaterThan(60); // the left is out of bounds, so it goes right
  });

  it('stays put when there is nowhere clear to go (it is never hidden or lost)', () => {
    expect(visibleX(500, half, [{ x0: 0, x1: 1000 }], 40, 960)).toBe(500);
  });

  it('coveredShare counts overlapping pieces once', () => {
    expect(coveredShare(100, 20, [{ x0: 80, x1: 100 }, { x0: 90, x1: 110 }])).toBeCloseTo(0.75, 5);
    expect(coveredShare(100, 20, [])).toBe(0);
  });
});
