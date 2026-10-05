// Tank style: substrate, water tint and lighting tint (all code-drawn).
// The substrate is a procedural texture over the picture's sand band, baked once per substrate × size
// (it never changes while you watch); glow gravel adds a few live glowing specks at night.
// "Golden Sand" draws nothing: it is the picture's own sand.
import { SAND_Y } from '../game/constants';
import type { TankStyle } from '../game/types';
import type { Extent } from './drawTank';
import { blobPath, celShade, hashSeq, rgba } from './paint';

type Ctx = CanvasRenderingContext2D;

/** The substrate starts this far above the sand line, fading in (soft top edge). */
const TOP_FADE = 14;

interface SubstrateLook {
  top: string;
  bottom: string;
  /** Fine grain specks (light/dark). */
  grain: [string, string];
  /** Stone colors (none = just sand). */
  stones: string[];
  stoneSize: [number, number];
  /** Stones per 100 units² of band. */
  density: number;
  sparkle: boolean;
}

const LOOKS: Record<string, SubstrateLook> = {
  'substrate:white': { top: '#fffaf0', bottom: '#e9e0cf', grain: ['#ffffff', '#cfc3ad'], stones: ['#f3ece0', '#e2d8c7'], stoneSize: [2, 4], density: 0.5, sparkle: false },
  'substrate:gravel': { top: '#4a4e5c', bottom: '#2a2c36', grain: ['#6b7080', '#1c1d25'], stones: ['#3a3d4a', '#4c5062', '#5d6276', '#2f3140'], stoneSize: [4, 8], density: 2.2, sparkle: true },
  'substrate:pebbles': { top: '#fff1e6', bottom: '#f2dccb', grain: ['#ffffff', '#e2c8b4'], stones: ['#ffc2d6', '#bfe3ff', '#ccf5c4', '#fff0a8', '#ddcbff', '#ffd6b0'], stoneSize: [4, 7.5], density: 1.6, sparkle: false },
  'substrate:glow': { top: '#2b2f52', bottom: '#191b33', grain: ['#4f5a9a', '#10111f'], stones: ['#2f6f86', '#4b3f8f', '#2d8a78', '#3a4f9e'], stoneSize: [3.5, 7], density: 2, sparkle: false },
};

/** Glow gravel's glowing specks (fixed positions per bake, pulsing at night). */
interface GlowSpeck {
  x: number;
  y: number;
  r: number;
  hue: string;
  phase: number;
}

interface Baked {
  key: string;
  canvas: HTMLCanvasElement;
  x0: number;
  y0: number;
  specks: GlowSpeck[];
}

const GLOW_HUES = ['120, 255, 220', '170, 140, 255', '120, 200, 255'];

export class SubstrateLayer {
  private baked: Baked | null = null;

  /** Draws the substrate over the sand band of `ext` (tank units), at `k` device px per unit. */
  draw(ctx: Ctx, substrate: string, ext: Extent, k: number, px: number): void {
    const look = LOOKS[substrate];
    if (!look) return;
    const b = this.bake(substrate, look, ext, k, px);
    ctx.drawImage(b.canvas, b.x0, b.y0, b.canvas.width / k, b.canvas.height / k);
  }

  /** Glow gravel's specks, glowing with the night lights (0..1). Drawn after the scene light. */
  drawGlow(ctx: Ctx, substrate: string, lights: number, timeSec: number): void {
    if (substrate !== 'substrate:glow' || !this.baked) return;
    const a = 0.35 + 0.65 * lights;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.baked.specks) {
      const pulse = a * (0.55 + 0.45 * Math.sin(timeSec * 1.3 + s.phase));
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
      g.addColorStop(0, `rgba(${s.hue}, ${0.9 * pulse})`);
      g.addColorStop(1, `rgba(${s.hue}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(s.x - s.r * 3, s.y - s.r * 3, s.r * 6, s.r * 6);
    }
    ctx.restore();
  }

  private bake(substrate: string, look: SubstrateLook, ext: Extent, k: number, px: number): Baked {
    const y0 = SAND_Y - TOP_FADE;
    const key = `${substrate}:${k.toFixed(3)}:${ext.x0}:${ext.x1}:${ext.y1}`;
    if (this.baked?.key === key) return this.baked;
    const w = ext.x1 - ext.x0;
    const h = Math.max(1, ext.y1 - y0);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * k));
    canvas.height = Math.max(1, Math.ceil(h * k));
    const ctx = canvas.getContext('2d')!;
    ctx.scale(k, k);
    ctx.translate(-ext.x0, -y0);
    const rand = hashSeq(substrate.length * 977 + 13);

    const base = ctx.createLinearGradient(0, y0, 0, ext.y1);
    base.addColorStop(0, look.top);
    base.addColorStop(1, look.bottom);
    ctx.fillStyle = base;
    ctx.fillRect(ext.x0, y0, w, h);

    // Fine grain.
    const grains = Math.floor((w * h) / 9);
    for (let i = 0; i < grains; i++) {
      ctx.fillStyle = rgba(look.grain[i % 2]!, 0.35 + rand() * 0.35);
      ctx.fillRect(ext.x0 + rand() * w, y0 + rand() * h, 0.9, 0.9);
    }

    // Stones, bigger and fewer toward the back (top of the band) for a little depth.
    const specks: GlowSpeck[] = [];
    const stones = Math.floor(((w * h) / 100) * look.density);
    const order: { x: number; y: number }[] = [];
    for (let i = 0; i < stones; i++) order.push({ x: ext.x0 + rand() * w, y: y0 + TOP_FADE * 0.6 + rand() * (h - TOP_FADE * 0.6) });
    order.sort((a, b) => a.y - b.y);
    for (const p of order) {
      const depth = Math.min(1, (p.y - y0) / h);
      const r = (look.stoneSize[0] + rand() * (look.stoneSize[1] - look.stoneSize[0])) * (0.7 + 0.5 * depth);
      const color = look.stones[Math.floor(rand() * look.stones.length)]!;
      const shape = blobPath(p.x, p.y, r, r * 0.72, rand, 7, 0.22);
      celShade(ctx, shape, [p.x - r, p.y - r * 0.72, r * 2, r * 1.44], { base: color }, 0.8 * px, 0.7);
      if (look.sparkle && rand() < 0.08) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(p.x - r * 0.3, p.y - r * 0.4, 1, 1);
      }
      if (substrate === 'substrate:glow' && rand() < 0.12) {
        specks.push({ x: p.x, y: p.y, r: r * 0.7, hue: GLOW_HUES[Math.floor(rand() * GLOW_HUES.length)]!, phase: rand() * Math.PI * 2 });
      }
    }

    // Soft top edge: fade the band in over TOP_FADE so it meets the picture without a seam.
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createLinearGradient(0, y0, 0, y0 + TOP_FADE);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(ext.x0, y0, w, h);

    this.baked = { key, canvas, x0: ext.x0, y0, specks };
    return this.baked;
  }
}

/** Water clarity tints (soft-light over the water, under the fish). */
const WATER_TINT: Record<string, { color: string; alpha: number }> = {
  'water:lagoon': { color: '#1fb8ff', alpha: 0.45 },
  'water:emerald': { color: '#14c08c', alpha: 0.5 },
  'water:twilight': { color: '#5a3fb8', alpha: 0.55 },
};

/** Lighting tints (soft-light over the whole scene, rays included). */
const LIGHT_TINT: Record<string, string> = {
  'lighting:sunset': '#ff9442',
  'lighting:moon': '#6f95ff',
  'lighting:tropical': '#34e0c0',
  'lighting:pink': '#ff8fc8',
};
const LIGHT_ALPHA = 0.42;

/** Tints the water area (above the sand) for the tank's water clarity. */
export function drawWaterTint(ctx: Ctx, water: string, view: Extent): void {
  const tint = WATER_TINT[water];
  if (!tint) return;
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = tint.alpha;
  const g = ctx.createLinearGradient(0, view.y0, 0, SAND_Y + 10);
  g.addColorStop(0, tint.color);
  g.addColorStop(0.92, tint.color);
  g.addColorStop(1, rgba(tint.color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, SAND_Y + 10 - view.y0);
  ctx.restore();
}

/** Tints the whole scene for the tank's lighting color (custom uses `style.lightingColor`). */
export function drawLightingTint(ctx: Ctx, style: Pick<TankStyle, 'lighting' | 'lightingColor'>, view: Extent): void {
  const color = style.lighting === 'lighting:custom' ? style.lightingColor : LIGHT_TINT[style.lighting];
  if (!color) return;
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = LIGHT_ALPHA;
  ctx.fillStyle = color;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  ctx.restore();
}
