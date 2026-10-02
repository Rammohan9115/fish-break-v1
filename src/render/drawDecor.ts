// Decor drawn with Canvas paths, sitting on the sand with its base at (x, baseY).
import { CHEST_BUBBLE_INTERVAL_MS, SECOND_MS } from '../game/constants';
import type { DecorId } from '../game/types';

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

function stroke(ctx: Ctx, color: string, lw: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function leaf(ctx: Ctx, x: number, y: number, len: number, angle: number, fill: string, outline: string, lw: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.35, -len * 0.5, 0, -len);
  ctx.quadraticCurveTo(-len * 0.35, -len * 0.5, 0, 0);
  ctx.fillStyle = fill;
  ctx.fill();
  stroke(ctx, outline, lw);
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(0, -len * 0.8);
  stroke(ctx, 'rgba(255,255,255,0.4)', lw * 0.6);
  ctx.restore();
}

function drawSprout(ctx: Ctx, x: number, y: number, t: number, lw: number): void {
  const sway = Math.sin(t * 1.4 + x) * 0.06;
  const leaves: [number, number][] = [[-0.6, 24], [-0.2, 34], [0.25, 30], [0.7, 22]];
  for (const [a, len] of leaves) leaf(ctx, x, y, len, a + sway, '#8fdc8a', '#4f9c55', lw);
}

function drawTallWeed(ctx: Ctx, x: number, y: number, t: number, lw: number): void {
  const blades: [number, number, string][] = [[-10, 120, '#6fcf8a'], [0, 150, '#86dc98'], [10, 110, '#5cbf7a'], [5, 90, '#9be8a8']];
  for (const [dx, h, color] of blades) {
    const sway = Math.sin(t * 0.9 + dx * 0.3 + x * 0.01) * 10;
    ctx.beginPath();
    ctx.moveTo(x + dx - 4, y);
    ctx.bezierCurveTo(x + dx - 8 + sway * 0.3, y - h * 0.4, x + dx + sway * 0.8, y - h * 0.7, x + dx + sway - 1, y - h);
    ctx.quadraticCurveTo(x + dx + sway + 4, y - h + 6, x + dx + sway * 0.8 + 5, y - h * 0.7);
    ctx.bezierCurveTo(x + dx + 4 + sway * 0.3, y - h * 0.4, x + dx + 4, y - h * 0.1, x + dx + 4, y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    stroke(ctx, '#3f8f5a', lw);
  }
}

function drawRock(ctx: Ctx, x: number, y: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(x - 30, y + 2);
  ctx.bezierCurveTo(x - 34, y - 20, x - 10, y - 34, x + 8, y - 30);
  ctx.bezierCurveTo(x + 28, y - 26, x + 36, y - 10, x + 30, y + 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, y - 34, 0, y);
  g.addColorStop(0, '#c9d2dc');
  g.addColorStop(1, '#9aa7b6');
  ctx.fillStyle = g;
  ctx.fill();
  stroke(ctx, '#6f7c8c', lw);
  ctx.beginPath();
  ctx.ellipse(x - 8, y - 22, 9, 4, -0.3, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 14, y - 8, 4, 3, 0, 0, TAU);
  ctx.fillStyle = 'rgba(111,124,140,0.35)';
  ctx.fill();
}

function drawCastle(ctx: Ctx, x: number, y: number, t: number, lw: number): void {
  const stone = '#e8d9f2';
  const edge = '#9c86b5';
  const tower = (cx: number, w: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y);
    ctx.lineTo(cx - w / 2, y - h);
    const teeth = 3;
    const tw = w / (teeth * 2 - 1);
    for (let i = 0; i < teeth * 2 - 1; i++) {
      const tx = cx - w / 2 + i * tw;
      if (i % 2 === 0) {
        ctx.lineTo(tx, y - h - 7);
        ctx.lineTo(tx + tw, y - h - 7);
      } else {
        ctx.lineTo(tx, y - h);
        ctx.lineTo(tx + tw, y - h);
      }
    }
    ctx.lineTo(cx + w / 2, y);
    ctx.closePath();
    ctx.fillStyle = stone;
    ctx.fill();
    stroke(ctx, edge, lw);
  };
  tower(x - 24, 22, 70);
  tower(x + 24, 22, 70);
  tower(x, 40, 52);
  // door
  ctx.beginPath();
  ctx.moveTo(x - 9, y);
  ctx.lineTo(x - 9, y - 16);
  ctx.arc(x, y - 16, 9, Math.PI, 0);
  ctx.lineTo(x + 9, y);
  ctx.closePath();
  ctx.fillStyle = '#5a4870';
  ctx.fill();
  stroke(ctx, edge, lw);
  // windows
  ctx.fillStyle = '#5a4870';
  for (const wx of [x - 24, x + 24]) {
    ctx.beginPath();
    ctx.roundRect(wx - 3, y - 52, 6, 10, 3);
    ctx.fill();
  }
  // flag
  const wave = Math.sin(t * 3) * 2;
  ctx.beginPath();
  ctx.moveTo(x + 24, y - 77);
  ctx.lineTo(x + 24, y - 96);
  stroke(ctx, edge, lw);
  ctx.beginPath();
  ctx.moveTo(x + 24, y - 96);
  ctx.quadraticCurveTo(x + 32, y - 94 + wave, x + 40, y - 92);
  ctx.quadraticCurveTo(x + 32, y - 88 - wave, x + 24, y - 86);
  ctx.fillStyle = '#ff9eb5';
  ctx.fill();
  stroke(ctx, '#d0708a', lw * 0.8);
}

/** 0..1 lid openness; the chest pops open briefly every CHEST_BUBBLE_INTERVAL_MS. */
export function chestOpenAmount(timeMs: number, x: number): number {
  const period = CHEST_BUBBLE_INTERVAL_MS;
  const phase = (timeMs + x * 97) % period;
  const openMs = 1.6 * SECOND_MS;
  if (phase > openMs) return 0;
  return Math.sin((phase / openMs) * Math.PI);
}

function drawChest(ctx: Ctx, x: number, y: number, timeMs: number, lw: number): void {
  const open = chestOpenAmount(timeMs, x);
  const wood = '#d9a066';
  const dark = '#8f5a34';
  const gold = '#ffd257';
  // body
  ctx.beginPath();
  ctx.roundRect(x - 26, y - 26, 52, 26, 4);
  ctx.fillStyle = wood;
  ctx.fill();
  stroke(ctx, dark, lw);
  ctx.fillStyle = gold;
  ctx.fillRect(x - 26, y - 16, 52, 4);
  ctx.fillRect(x - 3, y - 26, 6, 26);
  // glow + coins when open
  if (open > 0.05) {
    ctx.save();
    ctx.globalAlpha = open;
    ctx.beginPath();
    ctx.ellipse(x, y - 27, 22, 6, 0, 0, TAU);
    ctx.fillStyle = '#fff2a8';
    ctx.fill();
    ctx.restore();
  }
  // lid hinged at the back
  ctx.save();
  ctx.translate(x - 26, y - 26);
  ctx.rotate(-open * 0.9);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -8);
  ctx.quadraticCurveTo(26, -22, 52, -8);
  ctx.lineTo(52, 0);
  ctx.closePath();
  ctx.fillStyle = wood;
  ctx.fill();
  stroke(ctx, dark, lw);
  ctx.fillStyle = gold;
  ctx.fillRect(23, -15, 6, 15);
  ctx.restore();
  // lock
  ctx.beginPath();
  ctx.roundRect(x - 5, y - 22, 10, 9, 2);
  ctx.fillStyle = gold;
  ctx.fill();
  stroke(ctx, '#c48a00', lw * 0.8);
}

function drawShipwreck(ctx: Ctx, x: number, y: number, lw: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.12);
  // broken mast
  ctx.beginPath();
  ctx.moveTo(-8, -30);
  ctx.lineTo(-14, -100);
  ctx.lineTo(-6, -92);
  ctx.lineTo(-2, -30);
  ctx.closePath();
  ctx.fillStyle = '#a77b52';
  ctx.fill();
  stroke(ctx, '#6b4a2e', lw);
  // torn sail
  ctx.beginPath();
  ctx.moveTo(-12, -90);
  ctx.quadraticCurveTo(14, -80, 18, -58);
  ctx.lineTo(8, -62);
  ctx.lineTo(4, -52);
  ctx.lineTo(-6, -56);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 246, 230, 0.85)';
  ctx.fill();
  stroke(ctx, '#b8a68a', lw * 0.8);
  // hull
  ctx.beginPath();
  ctx.moveTo(-78, -40);
  ctx.quadraticCurveTo(-70, 4, -30, 6);
  ctx.lineTo(56, 6);
  ctx.quadraticCurveTo(80, -10, 84, -34);
  ctx.lineTo(40, -30);
  ctx.lineTo(30, -40);
  ctx.lineTo(16, -32);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -40, 0, 6);
  g.addColorStop(0, '#c4936a');
  g.addColorStop(1, '#8f6442');
  ctx.fillStyle = g;
  ctx.fill();
  stroke(ctx, '#5e4028', lw);
  // planks
  ctx.beginPath();
  ctx.moveTo(-70, -22);
  ctx.quadraticCurveTo(0, -16, 76, -20);
  ctx.moveTo(-60, -8);
  ctx.quadraticCurveTo(0, -4, 66, -6);
  stroke(ctx, 'rgba(94,64,40,0.5)', lw * 0.7);
  // portholes
  for (const px of [-40, -10, 20]) {
    ctx.beginPath();
    ctx.arc(px, -14, 5, 0, TAU);
    ctx.fillStyle = '#3b5a6e';
    ctx.fill();
    stroke(ctx, '#ffd257', lw);
  }
  ctx.restore();
}

/** Approximate drawn size [width, height] of each decor item (base-centered), for hit tests and previews. */
export const DECOR_BOUNDS: Record<DecorId, [number, number]> = {
  plant_small: [60, 42],
  plant_tall: [44, 160],
  rock: [72, 40],
  castle: [96, 110],
  chest: [60, 56],
  shipwreck: [170, 110],
};

/** Draws one decor item with its base centered at (x, baseY). `px` = tank units per CSS pixel. */
export function drawDecor(ctx: Ctx, decorId: DecorId, x: number, baseY: number, timeMs: number, px: number): void {
  const t = timeMs / SECOND_MS;
  const lw = 2 * px;
  switch (decorId) {
    case 'plant_small':
      return drawSprout(ctx, x, baseY, t, lw);
    case 'plant_tall':
      return drawTallWeed(ctx, x, baseY, t, lw);
    case 'rock':
      return drawRock(ctx, x, baseY, lw);
    case 'castle':
      return drawCastle(ctx, x, baseY, t, lw);
    case 'chest':
      return drawChest(ctx, x, baseY, timeMs, lw);
    case 'shipwreck':
      return drawShipwreck(ctx, x, baseY, lw);
  }
}
