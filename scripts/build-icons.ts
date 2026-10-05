// App icons for install (Android/iOS/desktop) from public/icon.svg -> public/icons/*.png.
// Run with `npm run build:icons` and commit the output.
//   icon-192 / icon-512     the rounded icon as drawn
//   icon-maskable-512       full-bleed art with a 20% safe margin (the OS applies its own mask)
//   apple-touch-icon-180    opaque square (iOS rounds the corners itself)
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve('public/icons');
const svg = await readFile(path.resolve('public/icon.svg'));
await mkdir(OUT, { recursive: true });

const render = (size: number) => sharp(svg, { density: (72 * size) / 128 }).resize(size, size);
const BG = { r: 0x0b, g: 0x3d, b: 0x74, alpha: 1 };

/** The art scaled into the centre `inner` fraction over a solid background, so masks never crop it. */
async function padded(size: number, inner: number, file: string): Promise<void> {
  const art = await render(Math.round(size * inner)).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: art, gravity: 'centre' }])
    .png()
    .toFile(path.join(OUT, file));
}

await render(192).png().toFile(path.join(OUT, 'icon-192.png'));
await render(512).png().toFile(path.join(OUT, 'icon-512.png'));
await padded(512, 0.8, 'icon-maskable-512.png');
await padded(180, 0.86, 'apple-touch-icon-180.png');
console.log('icons written to', path.relative('.', OUT));
