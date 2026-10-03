// Painterly tank environment (BotW-inspired). Static layers are baked once per theme/size by the
// renderer (`bakeBackLayer`, `bakeFrontLayer`); animated layers (rays, grass, caustics, surface) draw live.
import { BUBBLER_X, SAND_Y, TANK_HEIGHT, TANK_WIDTH } from '../game/constants';
import type { AlgaeSpot, ThemeId } from '../game/types';
import { blobPath, celShade, dropShadow, hashSeq, mix, rgba } from './paint';

type Ctx = CanvasRenderingContext2D;

export interface ThemePalette {
  waterTop: string;
  waterMid: string;
  waterBottom: string;
  /** Depth haze near the floor and on distant shapes. */
  haze: string;
  /** Distant ridge / rock-spire silhouettes. */
  far: string;
  /** Big background rock arches and pillars (FishVille-style). */
  rock: string;
  /** Background grass: dark base and lit tip. */
  grassDark: string;
  grassLight: string;
  sandLight: string;
  sandMid: string;
  sandShadow: string;
  stones: string[];
  moss: string | null;
  /** God-ray and caustic light color. */
  light: string;
  rayStrength: number;
  causticStrength: number;
  algae: string;
  /** Ambient drifting motes. */
  mote: string;
  /** Scene-wide light tint multiplied over decor and fish (null = neutral daylight). */
  ambient: { color: string; alpha: number } | null;
  /** Night theme: fish outlines glow. */
  glowFish: boolean;
}

export const THEME_PALETTES: Record<ThemeId, ThemePalette> = {
  classic: {
    waterTop: '#62e6f2',
    waterMid: '#1fa8da',
    waterBottom: '#0a4aa0',
    haze: '#3fb8e0',
    far: '#1d7fbf',
    rock: '#2c47b0',
    grassDark: '#147a4a',
    grassLight: '#4fd06a',
    sandLight: '#ffe29a',
    sandMid: '#f5b95a',
    sandShadow: '#c97a3a',
    stones: ['#ff6b8b', '#ffb627', '#4ecdc4', '#a06cd5', '#5fb3ff', '#7ed957', '#ff8a3d'],
    moss: null,
    light: '#fffbe0',
    rayStrength: 0.26,
    causticStrength: 0.5,
    algae: '#3fa34d',
    mote: '#ffffff',
    ambient: null,
    glowFish: false,
  },
  night: {
    waterTop: '#5f6ff0',
    waterMid: '#3438b8',
    waterBottom: '#160f5e',
    haze: '#4a4ad0',
    far: '#2a2a9a',
    rock: '#2a2380',
    grassDark: '#126a6a',
    grassLight: '#3fe0c0',
    sandLight: '#b9a8f0',
    sandMid: '#8a74d8',
    sandShadow: '#4a3a9a',
    stones: ['#ff6bd5', '#6be8ff', '#b388ff', '#ffe66b', '#6bffb8'],
    moss: null,
    light: '#d8e4ff',
    rayStrength: 0.18,
    causticStrength: 0.3,
    algae: '#2fb89a',
    mote: '#b4f0ff',
    ambient: { color: '#7a80e0', alpha: 0.45 },
    glowFish: true,
  },
  coral: {
    waterTop: '#6ff7e6',
    waterMid: '#16c4c8',
    waterBottom: '#0a6aa8',
    haze: '#5ae0e0',
    far: '#1aa0b8',
    rock: '#2a6ab8',
    grassDark: '#128a6a',
    grassLight: '#5fe08a',
    sandLight: '#fff0c4',
    sandMid: '#ffd08a',
    sandShadow: '#e0985a',
    stones: ['#ff7a9c', '#ffc94a', '#ffffff', '#ff9a6b', '#c49cff', '#6bd8ff'],
    moss: null,
    light: '#fffde8',
    rayStrength: 0.28,
    causticStrength: 0.55,
    algae: '#45b04a',
    mote: '#ffffff',
    ambient: null,
    glowFish: false,
  },
  pond: {
    waterTop: '#a8ec7a',
    waterMid: '#4ab86a',
    waterBottom: '#1a6a4a',
    haze: '#6ad08a',
    far: '#2a8a5a',
    rock: '#3a6a4a',
    grassDark: '#2a7a2a',
    grassLight: '#9ae04a',
    sandLight: '#e8c98a',
    sandMid: '#c99a5a',
    sandShadow: '#8a5a2a',
    stones: ['#9a8a7a', '#c4a46a', '#7aa05a', '#b88a5a', '#8ab0a0'],
    moss: '#5fc040',
    light: '#fff6c0',
    rayStrength: 0.24,
    causticStrength: 0.35,
    algae: '#3a8a2a',
    mote: '#fff6c4',
    ambient: { color: '#e8f8c8', alpha: 0.3 },
    glowFish: false,
  },
};

/** The area of tank space to paint: the 1000×625 world, extended to fill wider/taller screens. */
export interface Extent {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const WORLD_EXTENT: Extent = { x0: 0, x1: TANK_WIDTH, y0: 0, y1: TANK_HEIGHT };

/** Wavy sand line (shared by baking, plants and caustics). */
export function sandLineY(x: number): number {
  return SAND_Y + Math.sin(x * 0.011) * 5 + Math.sin(x * 0.034 + 1.3) * 2.2;
}

/** Deterministic per-slot random so extended areas get stable, varied scenery. */
function slotRand(slot: number, salt: number): () => number {
  return hashSeq(((slot + 1000) * 7919 + salt * 104729) >>> 0);
}

// ---------------------------------------------------------------------------
// Baked back layer: water, light pool, rock arches & pillars, back sand bank, blurred plants, coral
// ---------------------------------------------------------------------------

/** A big rock arch (outer blob minus an inner hole), FishVille-style. */
function archPath(cx: number, baseY: number, w: number, h: number, rand: () => number): Path2D {
  const p = new Path2D();
  const outer = blobPath(cx, baseY - h * 0.5, w * 0.5, h * 0.55, rand, 11, 0.18);
  p.addPath(outer);
  const hole = blobPath(cx + (rand() - 0.5) * w * 0.12, baseY - h * 0.28, w * 0.2, h * 0.24, rand, 9, 0.2);
  p.addPath(hole);
  return p;
}

function pillarPath(cx: number, baseY: number, w: number, h: number, lean: number): Path2D {
  const p = new Path2D();
  p.moveTo(cx - w * 0.55, baseY);
  p.bezierCurveTo(cx - w * 0.6, baseY - h * 0.5, cx - w * 0.3 + lean * 0.4, baseY - h * 0.85, cx - w * 0.15 + lean, baseY - h);
  p.quadraticCurveTo(cx + lean, baseY - h * 1.08, cx + w * 0.25 + lean, baseY - h * 0.96);
  p.bezierCurveTo(cx + w * 0.4 + lean * 0.4, baseY - h * 0.7, cx + w * 0.6, baseY - h * 0.4, cx + w * 0.55, baseY);
  p.closePath();
  return p;
}

function paintRock(ctx: Ctx, path: Path2D, box: [number, number, number, number], pal: ThemePalette, px: number, evenodd: boolean): void {
  const [bx, by, bw, bh] = box;
  const g = ctx.createLinearGradient(0, by, 0, by + bh);
  g.addColorStop(0, mix(pal.rock, '#ffffff', 0.25));
  g.addColorStop(0.45, pal.rock);
  g.addColorStop(1, mix(pal.rock, pal.waterBottom, 0.55));
  ctx.fillStyle = g;
  ctx.fill(path, evenodd ? 'evenodd' : 'nonzero');
  ctx.save();
  ctx.clip(path, evenodd ? 'evenodd' : 'nonzero');
  // Lit top edge and soft streaks for rock texture.
  ctx.fillStyle = rgba(mix(pal.rock, '#ffffff', 0.5), 0.35);
  ctx.fillRect(bx, by, bw, bh * 0.12);
  const rand = hashSeq(Math.round(bx * 13 + bh));
  ctx.strokeStyle = rgba(mix(pal.rock, '#000020', 0.4), 0.3);
  ctx.lineWidth = 3 * px;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const x = bx + rand() * bw;
    const y = by + bh * (0.2 + rand() * 0.6);
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 12, y + 10 + rand() * 20, x + 4, y + 30 + rand() * 30);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = rgba(mix(pal.rock, '#000020', 0.45), 0.85);
  ctx.lineWidth = 3 * px;
  ctx.stroke(path);
}

/** Glossy fan/branch coral clump for the mid-background. */
function coralClump(ctx: Ctx, x: number, color: string, scale: number, px: number, rand: () => number): void {
  const y = sandLineY(x) + 4;
  ctx.lineCap = 'round';
  const dark = mix(color, '#1a1030', 0.35);
  const segs: [number, number, number, number, number][] = [];
  const grow = (bx: number, by: number, len: number, a: number, w: number, d: number) => {
    const ex = bx + Math.sin(a) * len;
    const ey = by - Math.cos(a) * len;
    segs.push([bx, by, ex, ey, w]);
    if (d > 0) {
      grow(ex, ey, len * 0.72, a - 0.4 - rand() * 0.3, w * 0.72, d - 1);
      grow(ex, ey, len * 0.7, a + 0.35 + rand() * 0.3, w * 0.72, d - 1);
    }
  };
  grow(x, y, 34 * scale, (rand() - 0.5) * 0.3, 9 * scale, 3);
  for (const [c, k] of [[dark, 1.35], [color, 1], [mix(color, '#ffffff', 0.4), 0.4]] as const) {
    for (const [bx, by, ex, ey, w] of segs) {
      ctx.beginPath();
      ctx.moveTo(bx - (c === dark ? 0 : w * 0.12), by);
      ctx.lineTo(ex - (c === dark ? 0 : w * 0.12), ey);
      ctx.strokeStyle = c;
      ctx.lineWidth = w * k + (c === dark ? 2 * px : 0);
      ctx.stroke();
    }
  }
}

export function bakeBackLayer(ctx: Ctx, pal: ThemePalette, ext: Extent = WORLD_EXTENT, px = 1): void {
  const w = ext.x1 - ext.x0;
  // Water column: bright turquoise at the top → deep blue at the bottom.
  const water = ctx.createLinearGradient(0, ext.y0, 0, SAND_Y);
  water.addColorStop(0, pal.waterTop);
  water.addColorStop(0.5, pal.waterMid);
  water.addColorStop(1, pal.waterBottom);
  ctx.fillStyle = water;
  ctx.fillRect(ext.x0, ext.y0, w, ext.y1 - ext.y0);
  const pool = ctx.createRadialGradient(TANK_WIDTH * 0.45, ext.y0 - 80, 20, TANK_WIDTH * 0.45, ext.y0 - 80, 700);
  pool.addColorStop(0, rgba(pal.light, 0.45));
  pool.addColorStop(1, rgba(pal.light, 0));
  ctx.fillStyle = pool;
  ctx.fillRect(ext.x0, ext.y0, w, SAND_Y - ext.y0);

  // Big rock arches and pillars across the back, one formation per ~460 units (stable per slot).
  const slotW = 460;
  for (let slot = Math.floor(ext.x0 / slotW) - 1; slot * slotW < ext.x1 + slotW; slot++) {
    const rand = slotRand(slot, 1);
    const cx = slot * slotW + slotW * (0.3 + rand() * 0.4);
    const baseY = SAND_Y - 20;
    if (rand() < 0.5) {
      const aw = 260 + rand() * 140;
      const ah = 280 + rand() * 120;
      const arch = archPath(cx, baseY, aw, ah, rand);
      paintRock(ctx, arch, [cx - aw / 2, baseY - ah * 1.05, aw, ah * 1.05], pal, px, true);
    } else {
      const ph = 300 + rand() * 160;
      const pw = 90 + rand() * 60;
      const lean = (rand() - 0.5) * 50;
      paintRock(ctx, pillarPath(cx, baseY + 10, pw, ph, lean), [cx - pw, baseY - ph, pw * 2, ph], pal, px, false);
      const ph2 = ph * (0.45 + rand() * 0.2);
      const cx2 = cx + (rand() < 0.5 ? -1 : 1) * pw * 0.9;
      paintRock(ctx, pillarPath(cx2, baseY + 10, pw * 0.7, ph2, -lean * 0.5), [cx2 - pw, baseY - ph2, pw * 1.4, ph2], pal, px, false);
    }
  }
  // Soft water haze over the rocks so they read as distant.
  ctx.fillStyle = rgba(pal.waterMid, 0.28);
  ctx.fillRect(ext.x0, ext.y0, w, SAND_Y - ext.y0 + 10);

  // Back sand bank rising toward the rear (perspective).
  const bank = new Path2D();
  bank.moveTo(ext.x0, SAND_Y + 10);
  for (let x = ext.x0; x <= ext.x1 + 20; x += 20) bank.lineTo(x, SAND_Y - 38 - Math.sin(x * 0.006 + 1) * 16 - Math.sin(x * 0.017) * 6);
  bank.lineTo(ext.x1, SAND_Y + 10);
  bank.closePath();
  const bg = ctx.createLinearGradient(0, SAND_Y - 60, 0, SAND_Y + 10);
  bg.addColorStop(0, mix(pal.sandLight, pal.waterMid, 0.45));
  bg.addColorStop(1, mix(pal.sandMid, pal.waterMid, 0.3));
  ctx.fillStyle = bg;
  ctx.fill(bank);

  // Back depth layer: darker, slightly blurred plants (depth of field).
  ctx.save();
  if ('filter' in ctx) ctx.filter = 'blur(2px)';
  const dark = mix(pal.grassDark, pal.waterBottom, 0.3);
  const lit = mix(pal.grassLight, pal.waterMid, 0.35);
  const clusterW = TANK_WIDTH / 11;
  for (let c = Math.floor(ext.x0 / clusterW) - 1; c * clusterW < ext.x1 + clusterW; c++) {
    const rand = slotRand(c, 2);
    const cx = (c + 0.3 + rand() * 0.5) * clusterW;
    const blades = 5 + Math.floor(rand() * 5);
    for (let i = 0; i < blades; i++) {
      const bx = cx + (rand() - 0.5) * 34;
      const h = 70 + rand() * 170;
      const lean = (rand() - 0.5) * 50;
      const by = sandLineY(bx) - 20;
      const bw = 4 + rand() * 4;
      const blade = new Path2D();
      blade.moveTo(bx - bw, by);
      blade.quadraticCurveTo(bx + lean * 0.3 - bw, by - h * 0.55, bx + lean, by - h);
      blade.quadraticCurveTo(bx + lean * 0.3 + bw, by - h * 0.5, bx + bw, by);
      blade.closePath();
      const g = ctx.createLinearGradient(0, by, 0, by - h);
      g.addColorStop(0, dark);
      g.addColorStop(1, lit);
      ctx.fillStyle = g;
      ctx.fill(blade);
    }
  }
  ctx.restore();

  // Colorful coral clumps on the back bank.
  const coralColors = ['#ff5a8a', '#ff8a3d', '#ffd23a', '#c45aff'];
  for (let slot = Math.floor(ext.x0 / 300) - 1; slot * 300 < ext.x1 + 300; slot++) {
    const rand = slotRand(slot, 3);
    if (rand() < 0.35) continue;
    const x = slot * 300 + 40 + rand() * 220;
    coralClump(ctx, x, coralColors[Math.floor(rand() * coralColors.length)]!, 0.8 + rand() * 0.5, px, rand);
  }
}

// ---------------------------------------------------------------------------
// Baked front layer: sand, ripples, colorful pebbles, shells, framing rocks
// ---------------------------------------------------------------------------

function sandPath(ext: Extent): Path2D {
  const p = new Path2D();
  p.moveTo(ext.x0, ext.y1);
  for (let x = ext.x0; x <= ext.x1 + 10; x += 10) p.lineTo(x, sandLineY(x));
  p.lineTo(ext.x1, ext.y1);
  p.closePath();
  return p;
}

interface Stone {
  x: number;
  y: number;
  rx: number;
  ry: number;
  color: string;
  mossy: boolean;
  seed: number;
}

/** Deterministic pebble layout across the extent: candy pebbles, plus chunky boulders at the world's corners. */
export function makeStones(pal: ThemePalette, ext: Extent = WORLD_EXTENT): Stone[] {
  const stones: Stone[] = [];
  const sandDepth = ext.y1 - SAND_Y;
  const slotW = 100;
  for (let slot = Math.floor(ext.x0 / slotW); slot * slotW < ext.x1; slot++) {
    const rand = slotRand(slot, 4);
    const count = 4 + Math.floor(rand() * 3) + Math.floor(sandDepth / 80);
    for (let i = 0; i < count; i++) {
      const r = 3.5 + rand() * rand() * 8;
      stones.push({
        x: slot * slotW + rand() * slotW,
        y: SAND_Y + 12 + rand() * (sandDepth - 14),
        rx: r,
        ry: r * (0.62 + rand() * 0.2),
        color: pal.stones[Math.floor(rand() * pal.stones.length)]!,
        mossy: pal.moss !== null && rand() < 0.15,
        seed: Math.floor(rand() * 1e6),
      });
    }
  }
  for (const [x, y, rx, ry] of [[24, SAND_Y + 30, 46, 32], [118, SAND_Y + 46, 24, 15], [972, SAND_Y + 24, 52, 40], [898, SAND_Y + 48, 28, 17]] as const) {
    stones.push({ x, y, rx, ry, color: '#7c8fb0', mossy: pal.moss !== null, seed: x * 31 + y });
  }
  return stones.sort((a, b) => a.y - b.y);
}

function drawStone(ctx: Ctx, s: Stone, pal: ThemePalette, px: number): void {
  const rand = hashSeq(s.seed);
  dropShadow(ctx, s.x + s.rx * 0.2, s.y + s.ry * 0.8, s.rx * 1.15, s.ry * 0.45, 0.35);
  const shape = blobPath(s.x, s.y, s.rx, s.ry, rand, 8, 0.22);
  celShade(ctx, shape, [s.x - s.rx, s.y - s.ry, s.rx * 2, s.ry * 2], { base: s.color }, (s.rx > 15 ? 1.4 : 0.9) * px);
  if (s.mossy && pal.moss) {
    ctx.save();
    ctx.clip(shape);
    ctx.fillStyle = rgba(pal.moss, 0.9);
    ctx.fill(blobPath(s.x - s.rx * 0.1, s.y - s.ry * 0.85, s.rx * 0.9, s.ry * 0.5, rand, 9, 0.5));
    ctx.restore();
  }
}

/** A small glossy scallop shell lying on the sand. */
function drawSandShell(ctx: Ctx, x: number, y: number, size: number, color: string, angle: number, px: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size / 10, size / 10);
  dropShadow(ctx, 0, 5, 10, 3, 0.3);
  const shell = new Path2D();
  shell.moveTo(0, 5);
  shell.lineTo(-9, -1);
  shell.bezierCurveTo(-8.5, -9.5, 8.5, -9.5, 9, -1);
  shell.closePath();
  celShade(ctx, shell, [-9, -8, 18, 13], { base: color }, (1.1 * px * 10) / size);
  ctx.save();
  ctx.clip(shell);
  ctx.strokeStyle = rgba(mix(color, '#1a1030', 0.45), 0.5);
  ctx.lineWidth = (1 * px * 10) / size;
  ctx.beginPath();
  for (const dx of [-6, -3, 0, 3, 6]) {
    ctx.moveTo(0, 4.5);
    ctx.lineTo(dx * 1.35, -8);
  }
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

export function bakeFrontLayer(ctx: Ctx, pal: ThemePalette, px: number, ext: Extent = WORLD_EXTENT): void {
  const sand = sandPath(ext);
  const g = ctx.createLinearGradient(0, SAND_Y - 6, 0, Math.max(ext.y1, SAND_Y + 60));
  g.addColorStop(0, pal.sandLight);
  g.addColorStop(0.5, pal.sandMid);
  g.addColorStop(1, mix(pal.sandMid, pal.sandShadow, 0.55));
  ctx.fillStyle = g;
  ctx.fill(sand);
  ctx.save();
  ctx.clip(sand);
  // Soft ripples (repeat every ~18 units of depth).
  ctx.lineWidth = 2.2 * px;
  let k = 0;
  for (let base = SAND_Y + 20; base < ext.y1; base += 18, k++) {
    const amp = 3 + (k % 2) * 0.6;
    const freq = 0.009 + (k % 3) * 0.002;
    ctx.beginPath();
    for (let x = ext.x0; x <= ext.x1 + 12; x += 12) {
      const y = base + Math.sin(x * freq + k * 2) * amp;
      if (x === ext.x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(pal.sandShadow, 0.28);
    ctx.stroke();
    ctx.translate(0, -2.2 * px);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.stroke();
    ctx.translate(0, 2.2 * px);
  }
  const rand = hashSeq(99);
  const area = (ext.x1 - ext.x0) * (ext.y1 - SAND_Y);
  for (let i = 0; i < area / 70; i++) {
    ctx.fillStyle = rand() < 0.5 ? rgba(pal.sandShadow, 0.22) : 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(ext.x0 + rand() * (ext.x1 - ext.x0), SAND_Y - 2 + rand() * (ext.y1 - SAND_Y + 2), 1, 1);
  }
  ctx.restore();
  // Glossy lip where the sand meets the water.
  const lip = new Path2D();
  for (let x = ext.x0; x <= ext.x1 + 10; x += 10) (x === ext.x0 ? lip.moveTo(x, sandLineY(x)) : lip.lineTo(x, sandLineY(x)));
  ctx.strokeStyle = mix(pal.sandShadow, '#1a1030', 0.25);
  ctx.lineWidth = 3 * px;
  ctx.stroke(lip);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.5 * px;
  ctx.translate(0, 2.5 * px);
  ctx.stroke(lip);
  ctx.translate(0, -2.5 * px);

  for (const stone of makeStones(pal, ext)) drawStone(ctx, stone, pal, px);
  const shellColors = ['#ffb3c7', '#ffd6a0', '#c8b6ff', '#ffe3e3', '#a8f0e0'];
  for (let slot = Math.floor(ext.x0 / 200); slot * 200 < ext.x1; slot++) {
    const rand = slotRand(slot, 5);
    if (rand() < 0.4) continue;
    drawSandShell(ctx, slot * 200 + 20 + rand() * 160, SAND_Y + 18 + rand() * Math.min(40, ext.y1 - SAND_Y - 20), 8 + rand() * 5, shellColors[Math.floor(rand() * shellColors.length)]!, (rand() - 0.5) * 0.8, px);
  }
}

// ---------------------------------------------------------------------------
// Live layers
// ---------------------------------------------------------------------------

/** Slow, warm god rays from the surface. */
export function drawLightRays(ctx: Ctx, pal: ThemePalette, timeSec: number, ext: Extent = WORLD_EXTENT): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const spacing = 200;
  for (let i = Math.floor(ext.x0 / spacing) - 1; i * spacing < ext.x1 + spacing; i++) {
    const rand = slotRand(i, 6);
    const x = i * spacing + rand() * 80;
    const rw = 50 + rand() * 80;
    const speed = 0.06 + rand() * 0.05;
    const phase = rand() * 6;
    const sway = Math.sin(timeSec * speed * Math.PI * 2 + phase) * 35;
    const pulse = 0.55 + 0.45 * Math.sin(timeSec * speed * 3 + phase);
    const g = ctx.createLinearGradient(0, ext.y0, 0, SAND_Y + 40);
    g.addColorStop(0, rgba(pal.light, pal.rayStrength * pulse));
    g.addColorStop(0.7, rgba(pal.light, pal.rayStrength * 0.35 * pulse));
    g.addColorStop(1, rgba(pal.light, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, ext.y0);
    ctx.lineTo(x + rw, ext.y0);
    ctx.lineTo(x + rw * 1.9 + sway + 90, SAND_Y + 40);
    ctx.lineTo(x + sway + 90, SAND_Y + 40);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Animated caustic light on the sand: broken, drifting wavy filaments with a soft glow. */
export function drawCaustics(ctx: Ctx, pal: ThemePalette, timeSec: number, px: number, ext: Extent = WORLD_EXTENT): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(ext.x0, SAND_Y - 6, ext.x1 - ext.x0, ext.y1 - SAND_Y + 6);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const t = timeSec;
  ctx.setLineDash([22 * px * 6, 10 * px * 6, 9 * px * 6, 16 * px * 6]);
  ctx.shadowColor = rgba(pal.light, 0.6);
  ctx.shadowBlur = 3;
  const rows = Math.max(7, Math.ceil((ext.y1 - SAND_Y) / 10));
  for (const [family, alpha, width] of [[0, 0.38, 2.2], [1, 0.24, 1.5]] as const) {
    ctx.beginPath();
    for (let i = 0; i < rows; i++) {
      const base = SAND_Y + 6 + i * 10 + family * 5;
      for (let x = ext.x0 - 20; x <= ext.x1 + 20; x += 8) {
        const y = base + Math.sin(x * 0.07 + t * (0.8 + family * 0.3) + i * 1.9) * 2.6 + Math.sin(x * 0.021 - t * 0.45 + i * 0.7) * 3.4;
        if (x === ext.x0 - 20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.lineDashOffset = -t * (14 + family * 9);
    ctx.strokeStyle = rgba(pal.light, pal.causticStrength * alpha);
    ctx.lineWidth = width * px;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  ctx.restore();
}

/** Underside of the water surface at the top of the view: a bright band with drifting highlights. */
export function drawSurface(ctx: Ctx, pal: ThemePalette, timeSec: number, px: number, ext: Extent = WORLD_EXTENT): void {
  const y0 = ext.y0;
  const g = ctx.createLinearGradient(0, y0, 0, y0 + 16);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  g.addColorStop(1, rgba(pal.waterTop, 0));
  ctx.fillStyle = g;
  ctx.fillRect(ext.x0, y0, ext.x1 - ext.x0, 16);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1.4 * px;
  ctx.beginPath();
  const span = ext.x1 - ext.x0 + 60;
  const count = Math.ceil(span / 45);
  for (let i = 0; i < count; i++) {
    const x = ext.x0 + ((i * 97 + timeSec * (8 + (i % 4) * 3)) % span) - 30;
    const y = y0 + 6 + Math.sin(timeSec + i) * 1.5 + (i % 3) * 2.5;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 10, y - 1.5, x + 20 + (i % 5) * 4, y);
  }
  ctx.stroke();
}

/** Little airstone on the sand at the left; bubbles rise from (BUBBLER_X, bubblerTop()). */
export function bubblerTop(): number {
  return SAND_Y - 6;
}

export function drawBubbler(ctx: Ctx, px: number): void {
  const x = BUBBLER_X;
  const y = SAND_Y + 1;
  dropShadow(ctx, x + 2, y + 2, 20, 5, 0.35);
  const stone = blobPath(x, y - 3, 15, 8, hashSeq(5), 8, 0.2);
  celShade(ctx, stone, [x - 15, y - 11, 30, 16], { base: '#7f8a99' }, 1.4 * px);
  ctx.fillStyle = 'rgba(30, 30, 60, 0.7)';
  for (const dx of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.ellipse(x + dx, y - 8, 1.5, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Front depth layer: chunky glossy plants at the bottom corners of the view, drawn AFTER the fish
 * so they overlap them. Purely visual (input still targets the fish behind).
 */
export function drawFrontPlants(ctx: Ctx, pal: ThemePalette, timeSec: number, px: number, ext: Extent = WORLD_EXTENT): void {
  const leaf = (bx: number, by: number, len: number, angle: number, width: number, color: string) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angle);
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(-width, -len * 0.3, -width * 0.8, -len * 0.8, 0, -len);
    p.bezierCurveTo(width * 0.8, -len * 0.8, width, -len * 0.3, 0, 0);
    p.closePath();
    celShade(ctx, p, [-width, -len, width * 2, len], { base: color }, 1.3 * px);
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.quadraticCurveTo(width * 0.15, -len * 0.5, 0, -len * 0.92);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.4 * px;
    ctx.stroke();
    ctx.restore();
  };
  const by = ext.y1 + 6;
  const clump = (cx: number, leaves: [number, number, number][], tint: number) => {
    for (const [angle, len, w] of leaves) {
      const sway = Math.sin(timeSec * 0.9 + angle * 2 + cx * 0.01) * 0.07;
      leaf(cx, by, len, angle + sway, w, mix(pal.grassLight, pal.grassDark, tint));
    }
  };
  clump(ext.x0 + 18, [[0.15, 150, 16], [0.45, 120, 14], [-0.1, 110, 13], [0.75, 90, 12]], 0.25);
  clump(ext.x0 + 70, [[0.2, 80, 12], [-0.25, 95, 13], [0.55, 70, 11]], 0.05);
  clump(ext.x1 - 15, [[-0.15, 160, 17], [-0.5, 125, 14], [0.12, 105, 13], [-0.8, 92, 12]], 0.25);
  clump(ext.x1 - 70, [[-0.2, 85, 12], [0.25, 72, 11]], 0.05);
}

/** Soft, mossy algae on the glass: overlapping fuzzy lobes with darker cores and fine filaments. */
export function drawAlgae(ctx: Ctx, pal: ThemePalette, spots: AlgaeSpot[]): void {
  for (const spot of spots) {
    const r = spot.size / 2;
    const cx = spot.x + r;
    const cy = spot.y + r;
    let seed = 0;
    for (let i = 0; i < spot.id.length; i++) seed = (seed * 31 + spot.id.charCodeAt(i)) >>> 0;
    const rand = hashSeq(seed);
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.55;
      const lr = r * (0.55 + rand() * 0.4);
      const lx = cx + Math.cos(a) * d;
      const ly = cy + Math.sin(a) * d;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      g.addColorStop(0, rgba(mix(pal.algae, '#10301a', 0.25), 0.75));
      g.addColorStop(0.6, rgba(pal.algae, 0.55));
      g.addColorStop(1, rgba(pal.algae, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Soft vignette over the visible area, drawn last. */
export function drawGlass(ctx: Ctx, ext: Extent = WORLD_EXTENT): void {
  const cx = (ext.x0 + ext.x1) / 2;
  const cy = (ext.y0 + ext.y1) / 2;
  const r = Math.max(ext.x1 - ext.x0, ext.y1 - ext.y0);
  const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 0.72);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(8, 24, 60, 0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(ext.x0, ext.y0, ext.x1 - ext.x0, ext.y1 - ext.y0);
}
