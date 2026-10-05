import { describe, expect, it } from 'vitest';
import { snapX } from './snap';

describe('snapX', () => {
  it('snaps to the tank center when close', () => {
    expect(snapX(503, 20, [], 500, 6)).toEqual({ x: 500, guide: 500 });
    expect(snapX(510, 20, [], 500, 6)).toEqual({ x: 510, guide: null });
  });

  it('lines up centers and edges with other items', () => {
    const others = [{ x: 200, half: 40 }];
    expect(snapX(204, 10, others, 500, 6)).toEqual({ x: 200, guide: 200 });
    // Left edge (160) to left edge: our center at 170 when half = 10.
    expect(snapX(172, 10, others, 500, 6)).toEqual({ x: 170, guide: 160 });
    expect(snapX(228, 10, others, 500, 6)).toEqual({ x: 230, guide: 240 });
  });
});
