import { describe, expect, it } from 'vitest';
import { defringe, erodeAlpha, removeIslands } from './assets';

type Px = [number, number, number, number];

function image(rows: Px[][]): { data: Uint8ClampedArray; w: number; h: number } {
  return { data: new Uint8ClampedArray(rows.flat(2)), w: rows[0]!.length, h: rows.length };
}

const at = (img: { data: Uint8ClampedArray; w: number }, x: number, y: number) => [...img.data.slice((y * img.w + x) * 4, (y * img.w + x) * 4 + 4)];

const T: Px = [0, 0, 0, 0];
const O: Px = [60, 30, 20, 255]; // dark outline
const F: Px = [240, 240, 235, 255]; // light halo pixel
const A: Px = [250, 200, 60, 255]; // bright yellow fill

describe('removeIslands', () => {
  it('clears small blobs (sprite-sheet leftovers) and keeps the main art', () => {
    const big = Array.from({ length: 5 }, () => [O, O, O, O, O, T, T, T, O] as Px[]);
    const img = image(big);
    // Column 8 is a 5px sliver; the main blob is 25px, so the sliver is 20% < 30%.
    expect(removeIslands(img.data, img.w, img.h, 0.3)).toBe(5);
    expect(at(img, 8, 2)[3]).toBe(0);
    expect(at(img, 2, 2)[3]).toBe(255);
  });

  it('keeps every blob that is big enough (multi-part sprites)', () => {
    const img = image([[O, O, T, O, O]]);
    expect(removeIslands(img.data, img.w, img.h, 0.5)).toBe(0);
    expect(at(img, 4, 0)[3]).toBe(255);
  });

  it('treats diagonal neighbours as connected', () => {
    const img = image([
      [O, T, T],
      [T, O, T],
      [T, T, O],
    ]);
    expect(removeIslands(img.data, img.w, img.h, 0.9)).toBe(0);
  });
});

describe('erodeAlpha', () => {
  it('shrinks the alpha mask by one pixel', () => {
    const img = image([
      [T, T, T, T, T],
      [T, O, O, O, T],
      [T, O, O, O, T],
      [T, O, O, O, T],
      [T, T, T, T, T],
    ]);
    erodeAlpha(img.data, img.w, img.h, 1);
    expect(at(img, 1, 1)[3]).toBe(0);
    expect(at(img, 2, 2)[3]).toBe(255);
  });
});

describe('defringe', () => {
  it('pulls light halo pixels at the edge to the outline color', () => {
    const img = image([[T, F, O, A, A, A, O, F, T]]);
    expect(defringe(img.data, img.w, img.h, 2, 150)).toBeGreaterThanOrEqual(2);
    expect(at(img, 1, 0)).toEqual([60, 30, 20, 255]);
    expect(at(img, 7, 0)).toEqual([60, 30, 20, 255]);
  });

  it('leaves light pixels well inside the art alone', () => {
    const row: Px[] = [T, O, A, A, A, A, A, A, A, O, T];
    const img = image([row]);
    defringe(img.data, img.w, img.h, 2, 150);
    expect(at(img, 5, 0)).toEqual([250, 200, 60, 255]);
  });

  it('keeps edge pixels with no darker outline nearby', () => {
    const img = image([[T, F, F, F, T]]);
    expect(defringe(img.data, img.w, img.h, 2, 150)).toBe(0);
  });
});
