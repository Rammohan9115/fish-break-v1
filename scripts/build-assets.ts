// Offline art pipeline: art-src/ (original PNGs) -> public/assets-webp/ (small, pre-cleaned WebP).
// Run with `npm run build:assets` and commit the output. The cleanup is the same code the game used to run
// on every load (background removal, island removal, erode, defringe, trim), so players only decode images.
//   fish         -> fish/<file>.webp          trimmed, max SPRITE_MAX_PX on the long side
//   backgrounds  -> coral/<name>.webp         BACKGROUND_MAX_WIDTH wide, no alpha
//   decor        -> decor/<id>.webp           one per DECOR_ART item (cut from its sheet), cleaned, trimmed
//   icons        -> elements/<name>.webp      cleaned, trimmed
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ASSET_DEFRINGE_PX, ASSET_ERODE_PX, ASSET_FRINGE_MIN_LIGHT, ASSET_MIN_ISLAND, SPRITE_MAX_PX } from '../src/game/constants';
import { defringe, erodeAlpha, removeIslands } from '../src/render/assets';
import { DECOR_ART, ICON_ART, THEME_ART } from '../src/render/artConfig';
import { FISH_FILES, alphaBounds, removeBakedBackground } from '../src/render/sprites';

const SRC = path.resolve('art-src');
const OUT = path.resolve('public/assets-webp');
const BACKGROUND_MAX_WIDTH = 1600;
const DECOR_MAX_PX = 512;
const WEBP = { quality: 85, alphaQuality: 100, effort: 5 } as const;

let totalIn = 0;
let totalOut = 0;

interface Raw {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

async function readRaw(file: string, rect?: [number, number, number, number]): Promise<Raw> {
  let img = sharp(path.join(SRC, file)).ensureAlpha();
  if (rect) {
    const meta = await img.metadata();
    const left = Math.max(0, rect[0]);
    const top = Math.max(0, rect[1]);
    img = img.extract({ left, top, width: Math.min(meta.width! - left, rect[2]), height: Math.min(meta.height! - top, rect[3]) });
  }
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), w: info.width, h: info.height };
}

/** Trims to the art, shrinks so the long side is at most `maxPx`, and writes a WebP. */
async function writeSprite(raw: Raw, outFile: string, maxPx: number): Promise<void> {
  const box = alphaBounds(raw.data, raw.w, raw.h);
  if (!box) throw new Error(`${outFile}: nothing left after cleanup`);
  const k = Math.min(1, maxPx / Math.max(box.w, box.h));
  const out = path.join(OUT, outFile);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.length), { raw: { width: raw.w, height: raw.h, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .resize(Math.max(1, Math.round(box.w * k)), Math.max(1, Math.round(box.h * k)), { kernel: 'lanczos3' })
    .webp(WEBP)
    .toFile(out);
  await report(outFile, out);
}

async function report(srcName: string, out: string): Promise<void> {
  totalOut += (await stat(out)).size;
  console.log(`  ${srcName}  ${(((await stat(out)).size) / 1024).toFixed(0)} KB`);
}

async function addInput(file: string): Promise<void> {
  totalIn += (await stat(path.join(SRC, file))).size;
}

function cleanSheetSprite(raw: Raw): void {
  removeIslands(raw.data, raw.w, raw.h, ASSET_MIN_ISLAND);
  erodeAlpha(raw.data, raw.w, raw.h, ASSET_ERODE_PX);
  defringe(raw.data, raw.w, raw.h, ASSET_DEFRINGE_PX, ASSET_FRINGE_MIN_LIGHT);
}

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });

  console.log('fish');
  const fishFiles = new Set(Object.values(FISH_FILES).flatMap((f) => [f.adult, f.baby]));
  for (const f of fishFiles) {
    await addInput(`fish/${f}`);
    const raw = await readRaw(`fish/${f}`);
    removeBakedBackground(raw.data, raw.w, raw.h);
    await writeSprite(raw, `fish/${f.replace(/\.png$/i, '')}.webp`, SPRITE_MAX_PX);
  }

  console.log('backgrounds');
  for (const art of Object.values(THEME_ART)) {
    await addInput(art.file);
    const out = path.join(OUT, art.file.replace(/\.png$/i, '.webp'));
    await mkdir(path.dirname(out), { recursive: true });
    await sharp(path.join(SRC, art.file)).resize({ width: BACKGROUND_MAX_WIDTH, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(out);
    await report(art.file, out);
  }

  console.log('decor');
  const sheets = new Set<string>();
  for (const [id, art] of Object.entries(DECOR_ART)) {
    if (art.rect) sheets.add(art.file);
    else await addInput(art.file);
    const raw = await readRaw(art.file, art.rect);
    cleanSheetSprite(raw);
    await writeSprite(raw, `decor/${id}.webp`, DECOR_MAX_PX);
  }
  for (const sheet of sheets) await addInput(sheet);

  console.log('icons');
  for (const [id, art] of Object.entries(ICON_ART)) {
    await addInput(art.file);
    const raw = await readRaw(art.file);
    cleanSheetSprite(raw);
    await writeSprite(raw, `icons/${id}.webp`, DECOR_MAX_PX);
  }

  console.log(`\n${(totalIn / 1e6).toFixed(1)} MB of source art -> ${(totalOut / 1e6).toFixed(1)} MB in ${path.relative('.', OUT)}`);
}

void main();
