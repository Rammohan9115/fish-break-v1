// PNG fish sprites from /public/assets/fish (adult + baby per species). Preloaded once behind the
// loading screen by assets.ts (preloadAssets), together with the other generated art. Any file that fails to load simply stays
// missing and the renderer falls back to the code-drawn art for it.
import {
  SPRITE_ALPHA_TRIM,
  SPRITE_BG_MAX_SPREAD,
  SPRITE_BG_MIN_LIGHT,
  SPRITE_LOAD_TIMEOUT_MS,
  SPRITE_MAX_PX,
} from '../game/constants';
import type { SpeciesId, Stage } from '../game/types';

/** A trimmed, downscaled sprite. Its art faces +x (right). */
export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

const BASE = `${import.meta.env.BASE_URL}assets/`;

/**
 * Fish file names (case-sensitive on the server). Adults are also used for juveniles, scaled down.
 * Several files use short names (angel, axo, clown); tetrababy.PNG is a copy of the adult, so the
 * real baby art is tetrababy1.PNG. The jellyfish has one pink sprite per stage; its variants are hue rotations.
 */
const FISH_FILES: Record<SpeciesId, { adult: string; baby: string }> = {
  danio: { adult: 'danio.PNG', baby: 'daniobaby.PNG' },
  guppy: { adult: 'guppy.PNG', baby: 'guppybaby.PNG' },
  goldfish: { adult: 'goldfish.PNG', baby: 'goldfishbaby.PNG' },
  tetra: { adult: 'tetra.PNG', baby: 'tetrababy1.PNG' },
  betta: { adult: 'betta.PNG', baby: 'bettababy.PNG' },
  angelfish: { adult: 'angel.PNG', baby: 'angelbaby.PNG' },
  jellyfish: { adult: 'jellyfish.png', baby: 'jellyfish_baby.png' },
  clownfish: { adult: 'clownfish.PNG', baby: 'clownbaby.PNG' },
  puffer: { adult: 'puffer.PNG', baby: 'pufferbaby.PNG' },
  axolotl: { adult: 'axo.PNG', baby: 'axobaby.PNG' },
  koi: { adult: 'koi.PNG', baby: 'koibaby.PNG' },
};

const fishSprites = new Map<string, Sprite>();

function fishKey(speciesId: SpeciesId, art: 'adult' | 'baby'): string {
  return `${speciesId}:${art}`;
}

/** The sprite for a fish at this stage, or null (draw the code art instead). */
export function fishSprite(speciesId: SpeciesId, stage: Stage): Sprite | null {
  return fishSprites.get(fishKey(speciesId, stage === 'baby' ? 'baby' : 'adult')) ?? null;
}

// ---------------------------------------------------------------------------
// Pixel helpers (pure; unit-tested)
// ---------------------------------------------------------------------------

/**
 * Some exports have a fake "transparency" checkerboard baked in as opaque light-grey pixels.
 * If the image's corners are opaque, flood-fill from every edge pixel through light, unsaturated
 * pixels and make them transparent. The art's dark outline stops the fill, so white or silver
 * parts inside the fish survive. Returns true if anything was removed.
 */
export function removeBakedBackground(data: Uint8ClampedArray, w: number, h: number): boolean {
  const alphaAt = (x: number, y: number) => data[(y * w + x) * 4 + 3]!;
  const corners = [alphaAt(0, 0), alphaAt(w - 1, 0), alphaAt(0, h - 1), alphaAt(w - 1, h - 1)];
  if (corners.some((a) => a < 255)) return false;

  const isBg = (i: number) => {
    const o = i * 4;
    const r = data[o]!;
    const g = data[o + 1]!;
    const b = data[o + 2]!;
    const lo = Math.min(r, g, b);
    return data[o + 3]! > 0 && lo >= SPRITE_BG_MIN_LIGHT && Math.max(r, g, b) - lo <= SPRITE_BG_MAX_SPREAD;
  };
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (i: number) => {
    if (seen[i]) return;
    seen[i] = 1;
    if (isBg(i)) stack[top++] = i;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  let removed = false;
  while (top > 0) {
    const i = stack[--top]!;
    data[i * 4 + 3] = 0;
    removed = true;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  return removed;
}

/** Bounding box of pixels with alpha above the trim threshold, or null if the image is empty. */
export function alphaBounds(data: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! <= SPRITE_ALPHA_TRIM) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Rotates the hue of RGBA pixels in place by `deg` degrees (the same matrix as CSS `hue-rotate()`,
 * so it keeps lightness roughly the same). Used to recolor one master sprite into its variants.
 */
export function hueRotatePixels(data: Uint8ClampedArray, deg: number): void {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ] as const;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    data[i] = m[0] * r + m[1] * g + m[2] * b;
    data[i + 1] = m[3] * r + m[4] * g + m[5] * b;
    data[i + 2] = m[6] * r + m[7] * g + m[8] * b;
  }
}

/** Hue-rotated copies of a sprite (one per variant), made once and cached. */
const huedCache = new WeakMap<Sprite, Map<number, Sprite>>();

/** The sprite recolored by `deg` degrees of hue (the sprite itself for 0). */
export function huedSprite(s: Sprite, deg: number): Sprite {
  const hue = ((Math.round(deg) % 360) + 360) % 360;
  if (hue === 0) return s;
  let byHue = huedCache.get(s);
  if (!byHue) {
    byHue = new Map();
    huedCache.set(s, byHue);
  }
  const hit = byHue.get(hue);
  if (hit) return hit;
  const canvas = makeCanvas(s.w, s.h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return s;
  ctx.drawImage(s.canvas, 0, 0);
  const pixels = ctx.getImageData(0, 0, s.w, s.h);
  hueRotatePixels(pixels.data, hue);
  ctx.putImageData(pixels, 0, 0);
  const out: Sprite = { canvas, w: s.w, h: s.h };
  byHue.set(hue, out);
  return out;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => reject(new Error(`timeout: ${url}`)), SPRITE_LOAD_TIMEOUT_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(`failed: ${url}`));
    };
    img.src = url;
  });
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Strips a baked background, trims to the art, and downscales (in halving steps, for quality). */
function prepareSprite(img: HTMLImageElement): Sprite | null {
  const full = makeCanvas(img.naturalWidth, img.naturalHeight);
  const fctx = full.getContext('2d', { willReadFrequently: true });
  if (!fctx) return null;
  fctx.drawImage(img, 0, 0);
  const pixels = fctx.getImageData(0, 0, full.width, full.height);
  if (removeBakedBackground(pixels.data, full.width, full.height)) fctx.putImageData(pixels, 0, 0);
  const box = alphaBounds(pixels.data, full.width, full.height);
  if (!box) return null;

  const k = Math.min(1, SPRITE_MAX_PX / Math.max(box.w, box.h));
  let src: HTMLCanvasElement = full;
  let sx = box.x;
  let sy = box.y;
  let sw = box.w;
  let sh = box.h;
  while (sw * 0.5 > box.w * k * 1.0001) {
    const half = makeCanvas(sw / 2, sh / 2);
    const hctx = half.getContext('2d');
    if (!hctx) break;
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(src, sx, sy, sw, sh, 0, 0, half.width, half.height);
    src = half;
    sx = 0;
    sy = 0;
    sw = half.width;
    sh = half.height;
  }
  const out = makeCanvas(box.w * k, box.h * k);
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return { canvas: out, w: out.width, h: out.height };
}

/** One loader job per fish sprite file (run by preloadAssets). A job may reject; the fish then uses its drawn art. */
export function fishPreloadJobs(): (() => Promise<void>)[] {
  const jobs: (() => Promise<void>)[] = [];
  for (const [speciesId, files] of Object.entries(FISH_FILES) as [SpeciesId, { adult: string; baby: string }][]) {
    for (const art of ['adult', 'baby'] as const) {
      jobs.push(async () => {
        const sprite = prepareSprite(await loadImage(`${BASE}fish/${files[art]}`));
        if (sprite) fishSprites.set(fishKey(speciesId, art), sprite);
      });
    }
  }
  return jobs;
}

/** Colors (r, g, b, a) of the sprite at normalized points (u from the left, v from the top). Slow; cache the result. */
export function samplePixels(s: Sprite, points: [number, number][]): [number, number, number, number][] {
  const ctx = s.canvas.getContext('2d');
  if (!ctx) return [];
  return points.map(([u, v]) => {
    const x = Math.min(s.w - 1, Math.max(0, Math.round(u * s.w)));
    const y = Math.min(s.h - 1, Math.max(0, Math.round(v * s.h)));
    const d = ctx.getImageData(x, y, 1, 1).data;
    return [d[0]!, d[1]!, d[2]!, d[3]!];
  });
}
