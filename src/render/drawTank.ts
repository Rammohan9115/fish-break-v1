// Tank scenery: water gradient, light rays, sand with pebbles, bubbler, algae, glass.
import { BUBBLER_X, SAND_Y, TANK_HEIGHT, TANK_WIDTH } from '../game/constants';
import type { AlgaeSpot, Rng, ThemeId } from '../game/types';

type Ctx = CanvasRenderingContext2D;

export interface ThemePalette {
  waterTop: string;
  waterMid: string;
  waterBottom: string;
  ray: string;
  sandTop: string;
  sandBottom: string;
  sandEdge: string;
  pebbles: string[];
  algae: string;
  /** Night theme: fish outlines glow. */
  glowFish: boolean;
}

export const THEME_PALETTES: Record<ThemeId, ThemePalette> = {
  classic: {
    waterTop: '#b4ebff',
    waterMid: '#74c7ef',
    waterBottom: '#4aa3d6',
    ray: 'rgba(255, 255, 255, 0.16)',
    sandTop: '#f6e3b4',
    sandBottom: '#e6c88e',
    sandEdge: '#d9b878',
    pebbles: ['#f2b8c6', '#b8d8f2', '#c9e8c0', '#f5d6a8', '#d8c8f0', '#ffffff'],
    algae: '#6fbf73',
    glowFish: false,
  },
  night: {
    waterTop: '#3d3a8c',
    waterMid: '#25226a',
    waterBottom: '#171447',
    ray: 'rgba(170, 160, 255, 0.10)',
    sandTop: '#4c4678',
    sandBottom: '#363160',
    sandEdge: '#2b2750',
    pebbles: ['#7f77c9', '#5ad1e6', '#e18fd6', '#9ef0c2', '#c8c2ff'],
    algae: '#5fae9a',
    glowFish: true,
  },
  coral: {
    waterTop: '#a6f6ec',
    waterMid: '#5ad8cb',
    waterBottom: '#2eb3b0',
    ray: 'rgba(255, 255, 240, 0.18)',
    sandTop: '#ffeccf',
    sandBottom: '#f6d3a3',
    sandEdge: '#e8bd86',
    pebbles: ['#ff9e9e', '#ffc48a', '#ffffff', '#f7a8d0', '#ffd7a8'],
    algae: '#7cc77a',
    glowFish: false,
  },
  pond: {
    waterTop: '#c4ebb0',
    waterMid: '#86c993',
    waterBottom: '#4f9b70',
    ray: 'rgba(255, 255, 220, 0.14)',
    sandTop: '#cdb98f',
    sandBottom: '#a8936b',
    sandEdge: '#94805a',
    pebbles: ['#8a8a7a', '#b5a88a', '#d6cfb8', '#7c8f6a', '#a3b08c'],
    algae: '#4f8f4a',
    glowFish: false,
  },
};

export interface Pebble {
  x: number;
  y: number;
  rx: number;
  ry: number;
  color: number;
}

/** Deterministic pebble layout so the sand doesn't reshuffle every frame. */
export function makePebbles(rng: Rng, count = 46): Pebble[] {
  const pebbles: Pebble[] = [];
  for (let i = 0; i < count; i++) {
    const r = 3 + rng() * 6;
    pebbles.push({
      x: rng() * TANK_WIDTH,
      y: SAND_Y + 10 + rng() * (TANK_HEIGHT - SAND_Y - 14),
      rx: r,
      ry: r * (0.6 + rng() * 0.25),
      color: Math.floor(rng() * 1000),
    });
  }
  return pebbles.sort((a, b) => a.y - b.y);
}

export function drawWater(ctx: Ctx, pal: ThemePalette): void {
  const g = ctx.createLinearGradient(0, 0, 0, SAND_Y);
  g.addColorStop(0, pal.waterTop);
  g.addColorStop(0.5, pal.waterMid);
  g.addColorStop(1, pal.waterBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TANK_WIDTH, TANK_HEIGHT);
  // Surface shimmer line
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(0, 0, TANK_WIDTH, 6);
}

/** Slowly swaying translucent rays from the surface. */
export function drawLightRays(ctx: Ctx, pal: ThemePalette, timeSec: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rays = [
    { x: 160, w: 70, speed: 0.13, phase: 0 },
    { x: 360, w: 110, speed: 0.09, phase: 1.7 },
    { x: 590, w: 80, speed: 0.11, phase: 3.1 },
    { x: 800, w: 120, speed: 0.07, phase: 4.4 },
  ];
  for (const ray of rays) {
    const sway = Math.sin(timeSec * ray.speed * Math.PI * 2 + ray.phase) * 40;
    const alpha = 0.6 + 0.4 * Math.sin(timeSec * ray.speed * 3 + ray.phase);
    const g = ctx.createLinearGradient(0, 0, 0, SAND_Y);
    g.addColorStop(0, pal.ray);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ray.x, 0);
    ctx.lineTo(ray.x + ray.w, 0);
    ctx.lineTo(ray.x + ray.w * 1.8 + sway + 80, SAND_Y);
    ctx.lineTo(ray.x + sway + 80, SAND_Y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawSand(ctx: Ctx, pal: ThemePalette, pebbles: Pebble[], px: number): void {
  const g = ctx.createLinearGradient(0, SAND_Y - 8, 0, TANK_HEIGHT);
  g.addColorStop(0, pal.sandTop);
  g.addColorStop(1, pal.sandBottom);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, TANK_HEIGHT);
  ctx.lineTo(0, SAND_Y);
  for (let x = 0; x <= TANK_WIDTH; x += 20) {
    ctx.lineTo(x, SAND_Y + Math.sin(x * 0.012) * 5 + Math.sin(x * 0.037) * 2);
  }
  ctx.lineTo(TANK_WIDTH, TANK_HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = pal.sandEdge;
  ctx.lineWidth = 2 * px;
  ctx.stroke();

  for (const p of pebbles) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.pebbles[p.color % pal.pebbles.length]!;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1.5 * px;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.x - p.rx * 0.3, p.y - p.ry * 0.35, p.rx * 0.3, p.ry * 0.22, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();
  }
}

/** Little airstone on the sand at the left; bubbles rise from (BUBBLER_X, bubblerTop()). */
export function bubblerTop(): number {
  return SAND_Y - 6;
}

export function drawBubbler(ctx: Ctx, px: number): void {
  const x = BUBBLER_X;
  const y = SAND_Y + 2;
  ctx.beginPath();
  ctx.roundRect(x - 14, y - 10, 28, 14, 6);
  ctx.fillStyle = '#9aa6b8';
  ctx.fill();
  ctx.strokeStyle = '#6f7a8c';
  ctx.lineWidth = 2 * px;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.roundRect(x - 10, y - 8, 12, 4, 2);
  ctx.fill();
  // holes
  ctx.fillStyle = '#6f7a8c';
  for (const dx of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.arc(x + dx, y - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Soft, fuzzy green blobs on the glass: a few overlapping radial-gradient lobes per spot. */
export function drawAlgae(ctx: Ctx, pal: ThemePalette, spots: AlgaeSpot[]): void {
  for (const spot of spots) {
    const r = spot.size / 2;
    const cx = spot.x + r;
    const cy = spot.y + r;
    // Deterministic per-spot lobe layout so blobs don't shimmer between frames.
    let seed = 0;
    for (let i = 0; i < spot.id.length; i++) seed = (seed * 31 + spot.id.charCodeAt(i)) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.55;
      const lr = r * (0.55 + rand() * 0.4);
      const lx = cx + Math.cos(a) * d;
      const ly = cy + Math.sin(a) * d;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      g.addColorStop(0, pal.algae);
      g.addColorStop(0.6, pal.algae);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    // a few darker specks and a glassy highlight
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#2f6b34';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + (rand() - 0.5) * r, cy + (rand() - 0.5) * r, 0.8 + rand() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.18, r * 0.1, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Soft glass vignette and edge highlight, drawn last. */
export function drawGlass(ctx: Ctx): void {
  const g = ctx.createRadialGradient(TANK_WIDTH / 2, TANK_HEIGHT / 2, TANK_HEIGHT * 0.45, TANK_WIDTH / 2, TANK_HEIGHT / 2, TANK_WIDTH * 0.65);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(10, 40, 80, 0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TANK_WIDTH, TANK_HEIGHT);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.beginPath();
  ctx.moveTo(TANK_WIDTH - 90, 0);
  ctx.lineTo(TANK_WIDTH - 60, 0);
  ctx.lineTo(TANK_WIDTH - 140, TANK_HEIGHT);
  ctx.lineTo(TANK_WIDTH - 170, TANK_HEIGHT);
  ctx.closePath();
  ctx.fill();
}
