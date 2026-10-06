import { describe, expect, it } from 'vitest';
import { DROP_HIT_MIN_PX, DROP_SCALE_MAX, DROP_SCALE_MIN, DROP_TARGET_PX, SAND_Y } from '../game/constants';
import { ICON_ART } from './artConfig';
import { dropCenterY, dropDrawWidth, dropHitRadius, dropHitTest } from './dropSize';

// Camera scales (CSS px per tank unit) the renderer uses on common screens.
const PHONE = 0.819; // 390×844 portrait
const LANDSCAPE = 0.624; // 844×390
const DESKTOP = 1.229; // 1366×768

describe('dropDrawWidth', () => {
  it('looks about 40 px wide on a phone (≈ 2× the old size) and a modest bump on desktop', () => {
    expect(dropDrawWidth('shell', PHONE) * PHONE).toBeCloseTo(DROP_TARGET_PX.shell, 0);
    expect(dropDrawWidth('shell', PHONE) / ICON_ART.shell.width).toBeGreaterThan(1.9);
    expect(dropDrawWidth('shell', DESKTOP) / ICON_ART.shell.width).toBeLessThan(1.5);
    expect(dropDrawWidth('shell', DESKTOP) * DESKTOP).toBeGreaterThanOrEqual(DROP_TARGET_PX.shell * 0.95);
  });

  it('never goes below or above the clamp, whatever the scale', () => {
    for (const scale of [0.05, 0.3, PHONE, DESKTOP, 3, 10]) {
      for (const kind of ['shell', 'pearl'] as const) {
        const w = dropDrawWidth(kind, scale);
        expect(w).toBeGreaterThanOrEqual(ICON_ART[kind].width * DROP_SCALE_MIN - 1e-9);
        expect(w).toBeLessThanOrEqual(ICON_ART[kind].width * DROP_SCALE_MAX + 1e-9);
      }
    }
  });

  it('a landscape phone gets the biggest boost, capped at 3×', () => {
    expect(dropDrawWidth('shell', LANDSCAPE)).toBeGreaterThan(dropDrawWidth('shell', PHONE));
    expect(dropDrawWidth('shell', 0.2)).toBe(ICON_ART.shell.width * DROP_SCALE_MAX);
  });
});

describe('dropHitRadius', () => {
  it('is at least 44 px across on screen at every scale, for shells and pearls', () => {
    for (const scale of [0.3, LANDSCAPE, PHONE, DESKTOP, 2]) {
      for (const kind of ['shell', 'pearl'] as const) expect(dropHitRadius(kind, scale) * 2 * scale).toBeGreaterThanOrEqual(DROP_HIT_MIN_PX - 1e-9);
    }
  });
});

describe('dropHitTest', () => {
  const drops = [{ id: 'a', x: 500, pearl: false }];
  const aspect = () => 0.72;

  it('hits the middle and the TOP edge of the shell (the old centre sat below the sprite and missed the top)', () => {
    const cy = dropCenterY('shell', PHONE);
    const topY = SAND_Y - dropDrawWidth('shell', PHONE) * 0.72; // the very top of the drawn sprite
    expect(dropHitTest(drops, 500, cy, PHONE, aspect)).toBe('a');
    expect(dropHitTest(drops, 500, topY + 1, PHONE, aspect)).toBe('a');
  });

  it('misses a tap well away from it', () => {
    expect(dropHitTest(drops, 500 + 120, SAND_Y, PHONE, aspect)).toBeNull();
    expect(dropHitTest(drops, 500, SAND_Y - 200, PHONE, aspect)).toBeNull();
  });

  it('a 44 px finger area works: ~20 px off to the side still collects on a phone', () => {
    expect(dropHitTest(drops, 500 + 20 / PHONE, dropCenterY('shell', PHONE), PHONE, aspect)).toBe('a');
  });

  it('with overlapping drops, the nearest centre wins (not the newest)', () => {
    const pile = [
      { id: 'old', x: 500, pearl: false },
      { id: 'new', x: 520, pearl: false },
    ];
    const cy = dropCenterY('shell', PHONE);
    expect(dropHitTest(pile, 502, cy, PHONE, aspect)).toBe('old');
    expect(dropHitTest(pile, 518, cy, PHONE, aspect)).toBe('new');
  });

  it('pearls are tappable too', () => {
    const pearl = [{ id: 'p', x: 300, pearl: true }];
    expect(dropHitTest(pearl, 300, dropCenterY('pearl', DESKTOP), DESKTOP, aspect)).toBe('p');
  });

  it('no drops, no hit', () => {
    expect(dropHitTest([], 100, SAND_Y, PHONE, aspect)).toBeNull();
  });
});

describe('drops on depth planes', () => {
  const back = { dy: -24, scale: 0.8 };
  const front = { dy: 18, scale: 1.15 };

  it('draws back smaller and front larger than mid', () => {
    expect(dropDrawWidth('shell', PHONE, back)).toBeCloseTo(dropDrawWidth('shell', PHONE) * 0.8, 6);
    expect(dropDrawWidth('shell', PHONE, front)).toBeCloseTo(dropDrawWidth('shell', PHONE) * 1.15, 6);
  });

  it('centres a drop on its own plane (back higher up the sand, front lower)', () => {
    expect(dropCenterY('shell', PHONE, 0.72, back)).toBeLessThan(dropCenterY('shell', PHONE));
    expect(dropCenterY('shell', PHONE, 0.72, front)).toBeGreaterThan(dropCenterY('shell', PHONE));
  });

  it('every tap area is at least 44 px across plus 10 px of slack on each side', () => {
    for (const plane of [back, front]) {
      expect(dropHitRadius('pearl', PHONE, plane) * 2 * PHONE).toBeGreaterThanOrEqual(DROP_HIT_MIN_PX + 20 - 1e-9);
    }
  });

  it('hits a drop on its plane, not on the mid line', () => {
    const drops = [{ id: 'b', x: 500, pearl: false, plane: back }];
    expect(dropHitTest(drops, 500, dropCenterY('shell', PHONE, 0.72, back), PHONE)).toBe('b');
    expect(dropHitTest(drops, 500, SAND_Y + 60, PHONE)).toBeNull();
  });

  it('a sinking drop is hit where it is drawn', () => {
    const drops = [{ id: 'f', x: 500, pearl: false, lift: 80 }];
    expect(dropHitTest(drops, 500, dropCenterY('shell', PHONE) - 80, PHONE)).toBe('f');
  });

  it('the +10 px slack catches a tap just outside the sprite', () => {
    const edge = dropDrawWidth('shell', DESKTOP) / 2 * 1.15;
    const drops = [{ id: 'a', x: 500, pearl: false }];
    expect(dropHitTest(drops, 500 + edge + 8 / DESKTOP, dropCenterY('shell', DESKTOP), DESKTOP)).toBe('a');
  });
});
