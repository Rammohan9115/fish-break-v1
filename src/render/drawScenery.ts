// Theme-specific background scenery: coral formations (coral), lily pads & reeds (pond),
// glowing plankton (night). Purely decorative and not interactive.
import { SAND_Y, TANK_WIDTH } from '../game/constants';
import type { ThemeId } from '../game/types';

type Ctx = CanvasRenderingContext2D;

function branchCoral(ctx: Ctx, x: number, y: number, h: number, fill: string, edge: string, lw: number): void {
  const branch = (bx: number, by: number, len: number, angle: number, depth: number) => {
    const ex = bx + Math.sin(angle) * len;
    const ey = by - Math.cos(angle) * len;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = edge;
    ctx.lineWidth = (depth + 2) * 2.4 + lw * 2;
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = (depth + 2) * 2.4;
    ctx.stroke();
    if (depth > 0) {
      branch(ex, ey, len * 0.68, angle - 0.5, depth - 1);
      branch(ex, ey, len * 0.68, angle + 0.45, depth - 1);
    } else {
      ctx.beginPath();
      ctx.arc(ex, ey, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }
  };
  ctx.lineCap = 'round';
  branch(x, y, h * 0.4, 0, 2);
}

function seaFan(ctx: Ctx, x: number, y: number, r: number, fill: string, edge: string, lw: number, t: number): void {
  const sway = Math.sin(t * 0.8 + x) * 0.04;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, Math.PI * 1.08, Math.PI * 1.92);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  for (let i = 1; i < 6; i++) {
    const a = Math.PI * (1.08 + i * 0.14);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCoralScenery(ctx: Ctx, t: number, px: number): void {
  const lw = 2 * px;
  ctx.save();
  ctx.globalAlpha = 0.9;
  seaFan(ctx, 120, SAND_Y + 8, 70, '#c9a8f5', '#9b7ad6', lw, t);
  branchCoral(ctx, 260, SAND_Y + 10, 120, '#ff9e9e', '#d9707a', lw);
  branchCoral(ctx, 640, SAND_Y + 10, 95, '#ffc48a', '#d99a5a', lw);
  seaFan(ctx, 860, SAND_Y + 8, 60, '#ffb3d1', '#d97aa0', lw, t);
  // brain-coral mounds
  for (const [x, r, c, e] of [[470, 20, '#ffd7a8', '#d9a66f'], [930, 16, '#a8e6cf', '#6fb898']] as const) {
    ctx.beginPath();
    ctx.ellipse(x, SAND_Y + 8, r * 1.3, r, 0, Math.PI, 0);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = e;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(x + i * r * 0.35, SAND_Y + 8);
      ctx.quadraticCurveTo(x + i * r * 0.5 + 4, SAND_Y + 8 - r * 0.6, x + i * r * 0.3, SAND_Y + 8 - r * 0.9);
    }
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.globalAlpha = 0.9;
  }
  ctx.restore();
}

function drawPondScenery(ctx: Ctx, t: number, px: number): void {
  const lw = 2 * px;
  // reeds at the back edges
  ctx.save();
  ctx.lineCap = 'round';
  for (const [x, h] of [[30, 220], [48, 180], [970, 240], [952, 170], [935, 200]] as const) {
    const sway = Math.sin(t * 0.7 + x) * 6;
    ctx.beginPath();
    ctx.moveTo(x, SAND_Y + 8);
    ctx.quadraticCurveTo(x + sway * 0.4, SAND_Y - h * 0.5, x + sway, SAND_Y - h);
    ctx.strokeStyle = '#5f8f4e';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = '#8cc46f';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  // lily pads floating at the surface
  for (const [x, r, flower] of [[220, 34, true], [520, 26, false], [760, 38, true]] as const) {
    const bob = Math.sin(t * 1.1 + x) * 1.5;
    const y = 10 + bob;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.32, 0, 0.25, Math.PI * 2 - 0.05);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = '#7fc46a';
    ctx.fill();
    ctx.strokeStyle = '#4f8f45';
    ctx.lineWidth = lw;
    ctx.stroke();
    if (flower) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(x - r * 0.3 + Math.cos(a) * 5, y - 6 + Math.sin(a) * 2.5, 5, 2.6, a, 0, Math.PI * 2);
        ctx.fillStyle = '#ffc2d6';
        ctx.fill();
        ctx.strokeStyle = '#d9708f';
        ctx.lineWidth = lw * 0.6;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - 6, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe066';
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawNightScenery(ctx: Ctx, t: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const x = ((i * 397) % TANK_WIDTH) + Math.sin(t * 0.3 + i) * 12;
    const y = 40 + ((i * 211) % (SAND_Y - 80)) + Math.cos(t * 0.25 + i * 1.7) * 10;
    const glow = 0.35 + 0.35 * Math.sin(t * 1.5 + i * 2.1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
    g.addColorStop(0, `rgba(160, 240, 255, ${glow})`);
    g.addColorStop(1, 'rgba(160, 240, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Scenery behind decor and fish. `reducedMotion` freezes the drifting bits. */
export function drawThemeScenery(ctx: Ctx, theme: ThemeId, timeSec: number, px: number, reducedMotion: boolean): void {
  const t = reducedMotion ? 0 : timeSec;
  if (theme === 'coral') drawCoralScenery(ctx, t, px);
  else if (theme === 'pond') drawPondScenery(ctx, t, px);
  else if (theme === 'night') drawNightScenery(ctx, t);
}
