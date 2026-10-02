// Eggs resting on the sand: tinted by the expected variant, wobbling more as hatching nears.
import { MINUTE_MS, SAND_Y } from '../game/constants';
import { hatchMinutes } from '../game/breeding';
import { getVariant, SHINY_OUTLINE, SHINY_SPARKLE } from '../game/species';
import type { Egg } from '../game/types';
import { drawStar } from './drawFish';

type Ctx = CanvasRenderingContext2D;

/** 0 when just laid → 1 at hatch time. */
export function eggProgress(egg: Egg, nowMs: number): number {
  const total = hatchMinutes(egg.speciesId) * MINUTE_MS;
  return Math.min(1, Math.max(0, 1 - (egg.hatchAt - nowMs) / total));
}

export function drawEgg(ctx: Ctx, egg: Egg, x: number, nowMs: number, timeSec: number, px: number, wobbleAmp: number): void {
  const pal = getVariant(egg.speciesId, egg.variant);
  const progress = eggProgress(egg, nowMs);
  // Gentle rock that grows near hatching, in little bursts.
  const burst = Math.sin(timeSec * 1.3 + x) > 0.2 ? 1 : 0.35;
  const amp = (0.05 + 0.3 * progress * progress) * burst * wobbleAmp;
  const angle = Math.sin(timeSec * (6 + progress * 6) + x) * amp;
  const rx = 7.5;
  const ry = 9.5;

  ctx.save();
  ctx.translate(x, SAND_Y + 4);
  // shadow
  ctx.beginPath();
  ctx.ellipse(0, 1, rx * 0.9, 2.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.fill();
  ctx.rotate(angle);
  ctx.translate(0, -ry);

  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(0, -ry, 0, ry);
  g.addColorStop(0, pal.belly);
  g.addColorStop(1, pal.body);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = 0.45;
  for (const [sx, sy, r] of [[-3, -3, 1.8], [2.5, 1, 1.4], [-1, 5, 1.2], [3, -6, 1.1]] as const) {
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = egg.shiny ? SHINY_OUTLINE : pal.outline;
  ctx.lineWidth = 2 * px;
  ctx.stroke();
  // highlight
  ctx.beginPath();
  ctx.ellipse(-2.6, -4.5, 1.6, 2.6, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fill();
  // cracks in the last stretch
  if (progress > 0.8) {
    ctx.beginPath();
    ctx.moveTo(-5, -1);
    ctx.lineTo(-2, 1.5);
    ctx.lineTo(0, -1);
    ctx.lineTo(2.5, 1.8);
    ctx.lineTo(5, -0.5);
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.4 * px;
    ctx.stroke();
  }
  if (egg.shiny) {
    const tw = (Math.sin(timeSec * 4 + x) + 1) / 2;
    drawStar(ctx, 6, -8, 3 * tw, SHINY_SPARKLE, SHINY_OUTLINE, 0.6 * px);
  }
  ctx.restore();
}
