import { describe, expect, it } from 'vitest';
import { DECOR_DROP_MS, DECOR_DROP_SQUASH } from '../game/constants';
import { dropSquash } from './drawSprites';

describe('dropSquash', () => {
  it('starts squashed, overshoots (stretches) on the way back, and settles to zero', () => {
    expect(dropSquash(0)).toBeCloseTo(DECOR_DROP_SQUASH);
    const samples = Array.from({ length: 70 }, (_, i) => dropSquash((i / 70) * DECOR_DROP_MS));
    expect(Math.min(...samples)).toBeLessThan(0);
    expect(dropSquash(DECOR_DROP_MS)).toBe(0);
    expect(dropSquash(-5)).toBe(0);
  });

  it('never grows past the first squash', () => {
    for (let t = 0; t < DECOR_DROP_MS; t += 7) expect(Math.abs(dropSquash(t))).toBeLessThanOrEqual(DECOR_DROP_SQUASH + 1e-9);
  });
});
