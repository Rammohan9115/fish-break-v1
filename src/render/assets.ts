// Generated sprite assets: theme backgrounds, decor, icons (shell, pearl) and the egg cluster.
// One typed manifest. The files in public/assets-webp are built offline by scripts/build-assets.ts (sprite-sheet
// leftovers removed, halo defringed, padding trimmed), so loading is just decoding. What the first screen needs
// (the saved theme, the species and decor in the save, the icons) loads behind the loading screen; the rest loads
// in the background afterwards. Copies at the exact device-pixel size the tank needs
// are made on demand (stepped downscaling) and cached. A file that fails to load stays missing and the
// renderer falls back to the code-drawn art; nothing here ever throws to the caller.
import { ASSET_SIZE_BUCKET_PX, SPRITE_ALPHA_TRIM } from '../game/constants';
import type { DecorId, SpeciesId, ThemeId } from '../game/types';
import { DECOR_ART, ICON_ART, THEME_ART, type IconId } from './artConfig';
import { ASSET_BASE, fishPreloadJobs, loadImage, webpName } from './sprites';

/** A cleaned, trimmed sprite at its native resolution. */
export interface AssetSprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

/** `file` is the built WebP under public/assets-webp (one per decor item and icon; backgrounds keep their names). */
type Manifest =
  | { kind: 'background'; id: ThemeId; file: string }
  | { kind: 'decor'; id: DecorId; file: string }
  | { kind: 'icon'; id: IconId; file: string };

export const ASSET_MANIFEST: Manifest[] = [
  ...(Object.entries(THEME_ART) as [ThemeId, { file: string }][]).map(([id, a]) => ({ kind: 'background' as const, id, file: webpName(a.file) })),
  ...(Object.keys(DECOR_ART) as DecorId[]).map((id) => ({ kind: 'decor' as const, id, file: `decor/${id}.webp` })),
  ...(Object.keys(ICON_ART) as IconId[]).map((id) => ({ kind: 'icon' as const, id, file: `icons/${id}.webp` })),
];

const backgrounds = new Map<ThemeId, HTMLImageElement>();
const decor = new Map<DecorId, AssetSprite>();
const icons = new Map<IconId, AssetSprite>();
const iconUrls = new Map<IconId, string>();

export function themePicture(theme: ThemeId): HTMLImageElement | null {
  return backgrounds.get(theme) ?? null;
}

export function decorSprite(id: DecorId): AssetSprite | null {
  return decor.get(id) ?? null;
}

export function iconSprite(id: IconId): AssetSprite | null {
  return icons.get(id) ?? null;
}

/** A cleaned image URL for an icon (for the DOM UI), or null to fall back to the emoji. */
export function iconUrl(id: IconId): string | null {
  return iconUrls.get(id) ?? null;
}

/** The shell file, for the loading screen (shown before anything is processed). */
export const LOADING_ICON_URL = `${ASSET_BASE}icons/shell.webp`;

// ---------------------------------------------------------------------------
// Pixel cleanup (pure; unit-tested). Images are RGBA, row-major.
// ---------------------------------------------------------------------------

const solid = (data: Uint8ClampedArray, i: number) => data[i * 4 + 3]! > SPRITE_ALPHA_TRIM;

/**
 * Generated sprites were cut from sheets, so slivers of the neighbouring sprites cling to the edges.
 * Finds the connected blobs (8-connected) and clears every blob smaller than `minFraction` of the
 * biggest one. Returns how many pixels were cleared.
 */
export function removeIslands(data: Uint8ClampedArray, w: number, h: number, minFraction: number): number {
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || !solid(data, start)) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    while (top > 0) {
      const i = stack[--top]!;
      size++;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const n = ny * w + nx;
          if (label[n] === -1 && solid(data, n)) {
            label[n] = id;
            stack[top++] = n;
          }
        }
      }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return 0;
  const keep = Math.max(...sizes) * minFraction;
  let cleared = 0;
  for (let i = 0; i < w * h; i++) {
    const id = label[i]!;
    // Faint pixels (unlabelled) next to a dropped blob go too; faint pixels next to kept art stay as anti-aliasing.
    if (id >= 0 ? sizes[id]! < keep : data[i * 4 + 3]! > 0 && !nearKept(label, sizes, keep, i, w, h)) {
      data[i * 4 + 3] = 0;
      if (id >= 0) cleared++;
    }
  }
  return cleared;
}

function nearKept(label: Int32Array, sizes: number[], keep: number, i: number, w: number, h: number): boolean {
  const x = i % w;
  const y = (i - x) / w;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const id = label[ny * w + nx]!;
      if (id >= 0 && sizes[id]! >= keep) return true;
    }
  }
  return false;
}

/** Shrinks the alpha mask by `radius` pixels (each alpha becomes the minimum around it). */
export function erodeAlpha(data: Uint8ClampedArray, w: number, h: number, radius: number): void {
  if (radius <= 0) return;
  const src = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) src[i] = data[i * 4 + 3]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let lo = src[y * w + x]!;
      if (lo === 0) continue;
      for (let dy = -radius; dy <= radius && lo > 0; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const a = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : src[ny * w + nx]!;
          if (a < lo) lo = a;
        }
      }
      data[(y * w + x) * 4 + 3] = lo;
    }
  }
}

const luma = (data: Uint8ClampedArray, o: number) => data[o]! * 0.299 + data[o + 1]! * 0.587 + data[o + 2]! * 0.114;

/**
 * Background removal leaves a light halo just outside the art's dark outline. Every light pixel within
 * `radius` of transparency takes on the color of the darkest solid pixel near it (the outline), so the
 * edge reads as outline instead of a white fringe. Returns how many pixels changed.
 */
export function defringe(data: Uint8ClampedArray, w: number, h: number, radius: number, minLight: number): number {
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3]!;
  const r = radius + 1;
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (alpha[i]! <= SPRITE_ALPHA_TRIM) continue;
      if (Math.max(data[o]!, data[o + 1]!, data[o + 2]!) < minLight) continue;
      let edge = false;
      let darkest = -1;
      let darkLuma = luma(data, o);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (alpha[n]! <= SPRITE_ALPHA_TRIM) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) <= radius) edge = true;
            continue;
          }
          if (alpha[n]! < 250) continue;
          const l = luma(data, n * 4);
          if (l < darkLuma) {
            darkLuma = l;
            darkest = n;
          }
        }
      }
      // Only clearly lighter-than-outline pixels count as halo.
      if (!edge || darkest < 0 || luma(data, o) - darkLuma < 40) continue;
      const d = darkest * 4;
      data[o] = data[d]!;
      data[o + 1] = data[d + 1]!;
      data[o + 2] = data[d + 2]!;
      changed++;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * High-quality downscale of a source rectangle to outW×outH: halves repeatedly, then one final
 * smooth step, so big reductions don't alias. Upscaling is a single smooth draw.
 */
export function downscale(
  src: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  outW: number,
  outH: number,
): HTMLCanvasElement {
  let cur: CanvasImageSource = src;
  let cx = sx;
  let cy = sy;
  let cw = sw;
  let ch = sh;
  while (cw * 0.5 >= outW && ch * 0.5 >= outH) {
    const half = makeCanvas(cw / 2, ch / 2);
    const hctx = half.getContext('2d');
    if (!hctx) break;
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(cur, cx, cy, cw, ch, 0, 0, half.width, half.height);
    cur = half;
    cx = 0;
    cy = 0;
    cw = half.width;
    ch = half.height;
  }
  const out = makeCanvas(outW, outH);
  const octx = out.getContext('2d');
  if (octx) {
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(cur, cx, cy, cw, ch, 0, 0, out.width, out.height);
  }
  return out;
}

/** Copies a pre-built (already cleaned and trimmed) image onto a canvas. Null for an empty image. */
function spriteFromImage(img: HTMLImageElement): AssetSprite | null {
  if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return null;
  const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
  canvas.getContext('2d')?.drawImage(img, 0, 0);
  return { canvas, w: canvas.width, h: canvas.height };
}

/** Rounds a device-pixel size up to the cache bucket. */
export function bucketPx(px: number): number {
  return Math.max(ASSET_SIZE_BUCKET_PX, Math.ceil(px / ASSET_SIZE_BUCKET_PX) * ASSET_SIZE_BUCKET_PX);
}

const scaledCache = new Map<string, HTMLCanvasElement>();
const SCALED_CACHE_MAX = 160;

/**
 * A copy of `sprite` exactly `pxW` device pixels wide (height by aspect), optionally post-processed by
 * `decorate` (tint, lighting, glow), cached under `key`. Never upscales past the native size: beyond
 * that the native sprite is returned and the canvas scales it while drawing.
 */
export function scaledSprite(
  key: string,
  sprite: AssetSprite,
  pxW: number,
  decorate?: (ctx: CanvasRenderingContext2D, w: number, h: number) => HTMLCanvasElement | void,
): HTMLCanvasElement {
  const w = Math.min(sprite.w, pxW);
  const fullKey = `${key}@${w}`;
  const hit = scaledCache.get(fullKey);
  if (hit) return hit;
  const h = Math.max(1, Math.round((sprite.h * w) / sprite.w));
  let canvas = w === sprite.w ? makeCanvas(w, h) : downscale(sprite.canvas, 0, 0, sprite.w, sprite.h, w, h);
  if (w === sprite.w) canvas.getContext('2d')?.drawImage(sprite.canvas, 0, 0);
  const ctx = canvas.getContext('2d');
  if (ctx && decorate) canvas = decorate(ctx, canvas.width, canvas.height) ?? canvas;
  if (scaledCache.size >= SCALED_CACHE_MAX) scaledCache.delete(scaledCache.keys().next().value!);
  scaledCache.set(fullKey, canvas);
  return canvas;
}

// ---------------------------------------------------------------------------
// Preload
// ---------------------------------------------------------------------------

async function loadAsset(entry: Manifest): Promise<void> {
  const img = await loadImage(`${ASSET_BASE}${entry.file}`);
  if (entry.kind === 'background') {
    backgrounds.set(entry.id, img);
    return;
  }
  const sprite = spriteFromImage(img);
  if (!sprite) return;
  if (entry.kind === 'decor') {
    decor.set(entry.id, sprite);
    return;
  }
  icons.set(entry.id, sprite);
  const url = await new Promise<string | null>((resolve) =>
    sprite.canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png'),
  );
  if (url) iconUrls.set(entry.id, url);
}

/** What the first screen needs; everything else loads afterwards (see preloadAssets). */
export interface PreloadPriority {
  theme?: ThemeId;
  species?: readonly SpeciesId[];
  decor?: readonly DecorId[];
}

let preload: Promise<void> | null = null;
const progress = { done: 0, total: 0 };
const listeners = new Set<(done: number, total: number) => void>();

const settle = (job: () => Promise<void>, report: () => void) =>
  job()
    .catch(() => undefined)
    .finally(() => {
      progress.done++;
      report();
    });

/**
 * Loads the assets the first screen needs (the `priority` theme background, the icons, the listed species and decor;
 * all of them when no priority is given) and resolves when those are ready. Everything else keeps loading in the
 * background (anything not there yet just draws as the code-art fallback until it arrives). Later calls share the
 * promise. Never rejects: failures are skipped. `onProgress(done, total)` covers the priority files only.
 */
export function preloadAssets(onProgress?: (done: number, total: number) => void, priority?: PreloadPriority): Promise<void> {
  if (onProgress) {
    listeners.add(onProgress);
    onProgress(progress.done, progress.total);
  }
  if (preload) return preload;
  const speciesFiles = (ids: readonly SpeciesId[]) => new Set(ids.map((id) => id));
  const wantSpecies = priority?.species ? speciesFiles(priority.species) : null;
  const wantDecor = priority?.decor ? new Set(priority.decor) : null;
  const isFirst = (e: Manifest) =>
    !priority ||
    e.kind === 'icon' ||
    (e.kind === 'background' && e.id === (priority.theme ?? 'classic')) ||
    (e.kind === 'decor' && (wantDecor?.has(e.id) ?? false));
  const fish = fishPreloadJobs();
  const first = [
    ...fish.filter((j) => !wantSpecies || wantSpecies.has(j.species)).map((j) => j.run),
    ...ASSET_MANIFEST.filter(isFirst).map((entry) => () => loadAsset(entry)),
  ];
  const rest = [
    ...fish.filter((j) => wantSpecies && !wantSpecies.has(j.species)).map((j) => j.run),
    ...ASSET_MANIFEST.filter((e) => !isFirst(e)).map((entry) => () => loadAsset(entry)),
  ];
  progress.total = first.length;
  const report = () => {
    for (const l of listeners) l(progress.done, progress.total);
  };
  report();
  preload = Promise.all(first.map((job) => settle(job, report))).then(() => {
    listeners.clear();
    // Background phase: after the first screen is up, a couple of files at a time.
    const queue = [...rest];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await job().catch(() => undefined);
    };
    void Promise.all([worker(), worker()]);
  });
  return preload;
}
