// Theme background picture: "cover" scaled, placed so the picture's sand line (artConfig sandLineY)
// lands exactly on SAND_Y, where the sim puts decor, shells, eggs and the axolotl. A subtle eased
// parallax slides it with the mouse (or device tilt on phones). Reduced motion keeps it still.
import { PARALLAX_OVERSCAN, PARALLAX_SMOOTHING, PARALLAX_TILT_DEG, SAND_Y } from '../game/constants';
import type { ThemeId } from '../game/types';
import { sandLineY } from './artConfig';
import { downscale, themePicture } from './assets';
import { drawWarpedImage } from './ambient/backgroundFx';
import type { Extent } from './drawTank';

export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where to draw a picture of `aspect` (w/h) so it covers `ext`, with the line `sandFrac` (0..1 from the
 * top) at SAND_Y. Drawn `overscan`× larger around that line, then slid by `shift` (-1..1) at most half
 * the overscan, so the edges never show. Pure; unit-tested.
 */
export function backgroundPlacement(aspect: number, ext: Extent, sandFrac: number, overscan: number, shift: number): Placement {
  const s = Math.min(0.98, Math.max(0.02, sandFrac));
  const extW = ext.x1 - ext.x0;
  const baseH = Math.max(extW / aspect, (SAND_Y - ext.y0) / s, (ext.y1 - SAND_Y) / (1 - s));
  const h = baseH * overscan;
  const w = h * aspect;
  // Keep a sliver of the overscan in reserve so the water warp never shows an edge.
  const slide = ((w - baseH * aspect) / 2) * 0.85 * Math.max(-1, Math.min(1, shift));
  return { x: (ext.x0 + ext.x1) / 2 - w / 2 + slide, y: SAND_Y - s * h, w, h };
}

export class ThemeBackground {
  private shift = 0;
  private tilt: number | null = null;
  private cache: { key: string; canvas: CanvasImageSource } | null = null;
  private readonly onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma !== null) this.tilt = Math.max(-1, Math.min(1, e.gamma / PARALLAX_TILT_DEG));
  };

  constructor() {
    // Android delivers tilt freely; iOS needs a permission prompt, so iPhones simply skip tilt parallax.
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) window.addEventListener('deviceorientation', this.onTilt);
  }

  dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('deviceorientation', this.onTilt);
  }

  /** True when this theme has a picture (the drawn water/sand layers are skipped). */
  has(theme: ThemeId): boolean {
    return themePicture(theme) !== null;
  }

  /**
   * Draws the picture for `theme`, warped in `warpStrips` strips (0 = still). `pointerFrac` is the
   * cursor's position across the view (-1..1) or null. Returns false when there's no picture.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    theme: ThemeId,
    ext: Extent,
    view: Extent,
    grid: { k: number; camY: number; dpr: number },
    pointerFrac: number | null,
    dt: number,
    timeSec: number,
    reduced: boolean,
    warpStrips: number,
  ): boolean {
    const { k } = grid;
    const img = themePicture(theme);
    if (!img) return false;
    const target = reduced ? 0 : -(this.tilt ?? pointerFrac ?? 0);
    this.shift += (target - this.shift) * Math.min(1, dt * PARALLAX_SMOOTHING);
    const aspect = img.naturalWidth / img.naturalHeight;
    const overscan = reduced ? 1 : PARALLAX_OVERSCAN;
    const p = backgroundPlacement(aspect, ext, sandLineY(theme) / 100, overscan, this.shift);
    const src = this.scaled(theme, img, Math.round(p.w * k), Math.round(p.h * k));
    const [iw, ih] = src === img ? [img.naturalWidth, img.naturalHeight] : [(src as HTMLCanvasElement).width, (src as HTMLCanvasElement).height];
    drawWarpedImage(ctx, src, iw, ih, p, view, grid, timeSec, reduced ? 0 : warpStrips);
    return true;
  }

  /** The picture at exactly the drawn device-pixel size (downscaled once with quality; never upscaled). */
  private scaled(theme: ThemeId, img: HTMLImageElement, pw: number, ph: number): CanvasImageSource {
    if (pw >= img.naturalWidth) return img;
    const key = `${theme}:${pw}x${ph}`;
    if (this.cache?.key !== key) this.cache = { key, canvas: downscale(img, 0, 0, img.naturalWidth, img.naturalHeight, pw, ph) };
    return this.cache.canvas;
  }
}
