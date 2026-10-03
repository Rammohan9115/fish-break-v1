import { describe, expect, it } from 'vitest';
import { alphaBounds, removeBakedBackground } from './sprites';

type Px = [number, number, number, number];

function image(rows: Px[][]): { data: Uint8ClampedArray; w: number; h: number } {
  const h = rows.length;
  const w = rows[0]!.length;
  return { data: new Uint8ClampedArray(rows.flat(2)), w, h };
}

const alphaAt = (img: { data: Uint8ClampedArray; w: number }, x: number, y: number) => img.data[(y * img.w + x) * 4 + 3];

const L: Px = [240, 240, 240, 255]; // checker light
const G: Px = [200, 201, 200, 255]; // checker grey
const O: Px = [40, 20, 30, 255]; // dark outline
const W: Px = [255, 255, 255, 255]; // white inside the fish
const T: Px = [0, 0, 0, 0]; // real transparency

describe('removeBakedBackground', () => {
  it('clears a light checkerboard reachable from the edges but keeps white enclosed by the outline', () => {
    const img = image([
      [L, G, L, G, L],
      [G, O, O, O, G],
      [L, O, W, O, L],
      [G, O, O, O, G],
      [L, G, L, G, L],
    ]);
    expect(removeBakedBackground(img.data, img.w, img.h)).toBe(true);
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 4, 2)).toBe(0);
    expect(alphaAt(img, 1, 1)).toBe(255);
    expect(alphaAt(img, 2, 2)).toBe(255);
  });

  it('leaves images with real transparency alone', () => {
    const img = image([
      [T, L],
      [L, L],
    ]);
    expect(removeBakedBackground(img.data, img.w, img.h)).toBe(false);
    expect(alphaAt(img, 1, 1)).toBe(255);
  });

  it('does not eat saturated colors touching the edge', () => {
    const red: Px = [230, 40, 40, 255];
    const img = image([
      [L, L, L],
      [L, red, red],
      [L, L, L],
    ]);
    removeBakedBackground(img.data, img.w, img.h);
    expect(alphaAt(img, 2, 1)).toBe(255);
    expect(alphaAt(img, 0, 1)).toBe(0);
  });
});

describe('alphaBounds', () => {
  it('finds the box around visible pixels', () => {
    const img = image([
      [T, T, T, T],
      [T, O, T, T],
      [T, T, O, T],
    ]);
    expect(alphaBounds(img.data, img.w, img.h)).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });

  it('returns null for a fully transparent image', () => {
    const img = image([[T, T]]);
    expect(alphaBounds(img.data, img.w, img.h)).toBeNull();
  });
});
