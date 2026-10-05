// Drawing the generated sprites in the tank: decor (contact shadow, water tint, shared top light,
// edit-mode glow, lift and drop bounce) and small sand items (shell/pearl drops, eggs).
// Every function returns false when its sprite is missing so the caller can draw the code art instead.
import {
  DECOR_DROP_FREQ,
  DECOR_DROP_MS,
  DECOR_DROP_SQUASH,
  DECOR_GLOW_ALPHA,
  DECOR_GLOW_PX,
  DECOR_LIFT,
  DECOR_LIFT_SCALE,
  DECOR_SIZE_SCALE,
  DECOR_SHADOW_ALPHA,
  DECOR_SHADOW_W,
  DECOR_TINT_BACK,
  DECOR_TINT_FRONT,
  DECOR,
  DECOR_Z,
  SAND_Y,
  SPRITE_BASE_SHADE,
  SPRITE_TOP_LIGHT,
} from '../game/constants';
import { depthGeometry, hazeBucket, type DepthGeometry } from '../game/decor';
import type { DecorId, DecorSize, ThemeId } from '../game/types';
import { DECOR_ART, ICON_ART, THEME_ART, type DecorLayer, type IconId } from './artConfig';
import { bucketPx, decorSprite, iconSprite, makeCanvas, scaledSprite, type AssetSprite } from './assets';
import { decorBounds } from './drawDecor';
import { COOL_SHADOW, dropShadow, rgba } from './paint';

type Ctx = CanvasRenderingContext2D;

/** Maps tank units to device pixels (and back) so static sprites land on whole pixels. */
export interface PixelGrid {
  /** Device pixels per tank unit. */
  k: number;
  camX: number;
  camY: number;
  dpr: number;
}

const snap = (v: number, cam: number, k: number) => Math.round((v - cam) * k) / k + cam;

/** Drawn size of a decor sprite in tank units, or null if its sprite is missing. */
export function decorSpriteSize(decorId: DecorId): { w: number; h: number } | null {
  const sprite = decorSprite(decorId);
  if (!sprite) return null;
  const w = DECOR_ART[decorId].width;
  return { w, h: (w * sprite.h) / sprite.w };
}

/** [width, height above the sand] for hit tests and selection, from the sprite when present. */
export function decorBox(decorId: DecorId): [number, number] {
  const size = decorSpriteSize(decorId);
  if (!size) return decorBounds(decorId);
  return [size.w, size.h * (1 - DECOR_ART[decorId].sink)];
}

export function decorLayer(decorId: DecorId): DecorLayer {
  return DECOR_ART[decorId].layer;
}

/**
 * Drop bounce: a squash that springs back with overshoot and settles (positive = flatter). Pure.
 */
export function dropSquash(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= DECOR_DROP_MS) return 0;
  const t = elapsedMs / DECOR_DROP_MS;
  return DECOR_DROP_SQUASH * (1 - t) ** 2 * Math.cos((elapsedMs / 1000) * DECOR_DROP_FREQ);
}

/** Water tint plus the shared top light, painted onto a sprite copy (only where it has pixels). */
function shade(tint: string, tintAlpha: number, desat = 0) {
  return (ctx: Ctx, w: number, h: number) => {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    if (tintAlpha > 0) {
      ctx.fillStyle = rgba(tint, tintAlpha);
      ctx.fillRect(0, 0, w, h);
    }
    // Far pieces also lose colour (a neutral blue-grey wash reads as distance haze).
    if (desat > 0) {
      ctx.fillStyle = rgba(FAR_HAZE, desat * 0.9);
      ctx.fillRect(0, 0, w, h);
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(255, 255, 255, ${SPRITE_TOP_LIGHT})`);
    g.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
    g.addColorStop(1, rgba(COOL_SHADOW, SPRITE_BASE_SHADE));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };
}

/** A soft white outline around a sprite copy (stamped silhouette rings), padded by `pad` device px. */
function glowFrom(src: HTMLCanvasElement, pad: number): HTMLCanvasElement {
  const sil = makeCanvas(src.width, src.height);
  const sctx = sil.getContext('2d');
  const out = makeCanvas(src.width + pad * 2, src.height + pad * 2);
  const octx = out.getContext('2d');
  if (!sctx || !octx) return out;
  sctx.drawImage(src, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0, 0, sil.width, sil.height);
  const steps = 16;
  for (const [r, a] of [[pad, 0.55], [pad * 0.55, 0.9]] as const) {
    octx.globalAlpha = a;
    for (let i = 0; i < steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      octx.drawImage(sil, pad + Math.cos(ang) * r, pad + Math.sin(ang) * r);
    }
  }
  return out;
}

/** A decor sprite ready to draw: the shaded copy at the tank's pixel size and its drawn size (tank units). */
export interface DecorImage {
  canvas: HTMLCanvasElement;
  /** Cache key of this copy (parts, glow and silhouettes derive from it). */
  key: string;
  dw: number;
  dh: number;
  /** The sprite's base sits this far below the sand line. */
  sinkY: number;
}

const FAR_HAZE = '#9fb4c8';

/** How a sand piece standing at depth `z` is scaled (size S/M/L × perspective) and shifted. Floating pieces ignore depth. */
export function depthOf(d: { decorId: DecorId; z?: number }): DepthGeometry {
  return DECOR[d.decorId].placement === 'sand' ? depthGeometry(d.z ?? DECOR_Z.default) : FLAT_DEPTH;
}
const FLAT_DEPTH: DepthGeometry = { dy: 0, scale: 1, tint: 0, desat: 0, frontOfFish: false };

/** Total draw scale of a placed piece: its S/M/L size times the perspective scale of its depth. */
export function sizeScale(d: { decorId: DecorId; size?: DecorSize; z?: number }): number {
  return DECOR_SIZE_SCALE[d.size ?? 'M'] * depthOf(d).scale;
}

/** The haze of a sand piece at depth `z`: water tint (from its own layer's value toward far/near) and desaturation. */
function hazeAt(baseTint: number, z: number): { tint: number; desat: number } {
  const far = z <= DECOR_Z.mid;
  const t = far ? z / DECOR_Z.mid : (z - DECOR_Z.mid) / (1 - DECOR_Z.mid);
  return {
    tint: far ? DECOR_Z.tintFar + (baseTint - DECOR_Z.tintFar) * t : baseTint + (DECOR_Z.tintNear - baseTint) * t,
    desat: far ? DECOR_Z.desatFar * (1 - t) : 0,
  };
}

/**
 * The decor sprite shaded for `theme` (water tint by layer + haze by depth + shared top light) at `k` device px per
 * unit. Depth is rounded to a few haze buckets so one baked copy serves nearby depths.
 */
export function decorImage(decorId: DecorId, theme: ThemeId, k: number, z: number = DECOR_Z.default): DecorImage | null {
  const sprite = decorSprite(decorId);
  if (!sprite) return null;
  const art = DECOR_ART[decorId];
  const baseTint = art.layer === 'back' ? DECOR_TINT_BACK : DECOR_TINT_FRONT;
  const sand = DECOR[decorId].placement === 'sand';
  const bucket = sand ? hazeBucket(z) : DECOR_Z.hazeSteps / 2;
  const haze = sand ? hazeAt(baseTint, bucket / DECOR_Z.hazeSteps) : { tint: baseTint, desat: 0 };
  const key = `decor:${decorId}:${theme}:h${bucket}`;
  const canvas = scaledSprite(key, sprite, bucketPx(art.width * k), shade(THEME_ART[theme].tint, haze.tint, haze.desat));
  // Draw at the copy's own pixel size (1 sprite px = 1 device px at rest); a capped native copy stretches to fit.
  const native = canvas.width === sprite.w && sprite.w < art.width * k;
  const dw = native ? art.width : canvas.width / k;
  const dh = native ? (art.width * sprite.h) / sprite.w : canvas.height / k;
  return { canvas, key: `${key}@${canvas.width}`, dw, dh, sinkY: dh * art.sink };
}

/** The decor contact shadow on the sand: fainter and wider while lifted, slid by the light (`shift`). */
export function decorShadow(ctx: Ctx, decorId: DecorId, x: number, lift: number, shift: number, strength = 1, scale = 1, baseY = SAND_Y + 1): void {
  const sw = DECOR_ART[decorId].width * DECOR_SHADOW_W * (1 + lift * 0.15) * (strength < 1 ? 1.4 : 1) * scale;
  dropShadow(ctx, x + shift, baseY, sw, sw * 0.2, DECOR_SHADOW_ALPHA * (1 - lift * 0.45) * strength);
}

/** Snaps a tank-space coordinate to the device pixel grid (crisp static sprites). */
export function snapTo(v: number, cam: number, k: number): number {
  return snap(v, cam, k);
}

/** The soft white edit-mode outline for a decor copy, padded by `pad` device px (cached). */
export function decorGlow(img: DecorImage, dpr: number): { canvas: HTMLCanvasElement; pad: number } {
  const pad = Math.max(2, Math.round(DECOR_GLOW_PX * dpr));
  const key = `${img.key}:glow:${pad}`;
  let glow = glowCache.get(key);
  if (!glow) {
    glow = glowFrom(img.canvas, pad);
    if (glowCache.size > 24) glowCache.clear();
    glowCache.set(key, glow);
  }
  return { canvas: glow, pad };
}

const glowCache = new Map<string, HTMLCanvasElement>();
const silhouetteCache = new Map<string, HTMLCanvasElement>();

/** The sprite's shape filled with one color (sheens, highlights), cached. */
export function silhouette(img: DecorImage, color: string): HTMLCanvasElement {
  const key = `${img.key}:sil:${color}`;
  let sil = silhouetteCache.get(key);
  if (!sil) {
    sil = makeCanvas(img.canvas.width, img.canvas.height);
    const sctx = sil.getContext('2d');
    if (sctx) {
      sctx.drawImage(img.canvas, 0, 0);
      sctx.globalCompositeOperation = 'source-in';
      sctx.fillStyle = color;
      sctx.fillRect(0, 0, sil.width, sil.height);
    }
    if (silhouetteCache.size > 24) silhouetteCache.clear();
    silhouetteCache.set(key, sil);
  }
  return sil;
}

export { DECOR_GLOW_ALPHA, DECOR_LIFT, DECOR_LIFT_SCALE };

/** A sprite copy for a small icon at `width` tank units (shared by sand items and coin pops). */
function iconCanvas(id: IconId, sprite: AssetSprite, width: number, k: number): HTMLCanvasElement {
  return scaledSprite(`icon:${id}`, sprite, bucketPx(width * k), shade('#000000', 0));
}

export interface SandItemOpts {
  /** Extra vertical offset (negative = up), rotation around the base, and scale. */
  lift?: number;
  angle?: number;
  scale?: number;
  /** Width override (defaults to the icon's config width). */
  width?: number;
  /** A soft glow behind the item so it stands out from the sand (colour + pulse 0…1). */
  halo?: { color: string; pulse: number };
}

/** A shell, pearl or egg resting on the sand at x, with its contact shadow. */
export function drawSandItem(ctx: Ctx, id: IconId, x: number, grid: PixelGrid, opts: SandItemOpts = {}): boolean {
  const sprite = iconSprite(id);
  if (!sprite) return false;
  const art = ICON_ART[id];
  const width = opts.width ?? art.width;
  const h = (width * sprite.h) / sprite.w;
  const scale = opts.scale ?? 1;
  const lift = opts.lift ?? 0;
  dropShadow(ctx, x, SAND_Y + 1, width * 0.45 * scale, width * 0.1 * scale, 0.28 * Math.max(0.3, 1 + lift / 20));
  ctx.save();
  ctx.translate(x, SAND_Y + h * art.sink + lift);
  if (opts.halo) {
    const r = width * 0.95;
    const g = ctx.createRadialGradient(0, -h / 2, 0, 0, -h / 2, r);
    g.addColorStop(0, rgba(opts.halo.color, 0.5 * (0.7 + 0.3 * opts.halo.pulse)));
    g.addColorStop(1, rgba(opts.halo.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-r, -h / 2 - r, r * 2, r * 2);
  }
  if (opts.angle) ctx.rotate(opts.angle);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.drawImage(iconCanvas(id, sprite, width * scale, grid.k), -width / 2, -h, width, h);
  ctx.restore();
  return true;
}

/** An icon centered at (cx, cy), `width` tank units wide (coin pops). */
export function drawIconAt(ctx: Ctx, id: IconId, cx: number, cy: number, width: number, k: number): boolean {
  const sprite = iconSprite(id);
  if (!sprite) return false;
  const h = (width * sprite.h) / sprite.w;
  ctx.drawImage(iconCanvas(id, sprite, width, k), cx - width / 2, cy - h / 2, width, h);
  return true;
}
