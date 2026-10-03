// Painterly, cel-shaded decor (BotW-inspired), sitting on the sand with its base at (x, baseY).
import { CHEST_BUBBLE_INTERVAL_MS, SECOND_MS } from '../game/constants';
import type { DecorId } from '../game/types';
import { blobPath, celShade, COOL_SHADOW, hashSeq, mix, RIM_LIGHT, rgba, WARM_LIGHT } from './paint';

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

/** Approximate drawn size [width, height] of each decor item (base-centered), for hit tests and previews. */
export const DECOR_BOUNDS: Record<DecorId, [number, number]> = {
  plant_small: [64, 46],
  plant_tall: [50, 160],
  rock: [76, 44],
  castle: [100, 120],
  chest: [62, 58],
  shipwreck: [176, 112],
};

/** Soft contact shadow under an object. */
function contactShadow(ctx: Ctx, x: number, y: number, rx: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, rgba(COOL_SHADOW, 0.35));
  g.addColorStop(1, rgba(COOL_SHADOW, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.22, 0, 0, TAU);
  ctx.fill();
}

/** Moss patch clipped to a shape: dark base, lit dots. */
function moss(ctx: Ctx, shape: Path2D, x: number, y: number, rx: number, ry: number, seed: number): void {
  const rand = hashSeq(seed);
  ctx.save();
  ctx.clip(shape);
  ctx.fillStyle = rgba('#5f8a3f', 0.85);
  ctx.fill(blobPath(x, y, rx, ry, rand, 10, 0.55));
  ctx.fillStyle = rgba('#a9c86a', 0.65);
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(x + (rand() - 0.5) * rx * 1.6, y - ry * 0.2 + (rand() - 0.6) * ry, 0.5 + rand() * 1.1, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

/** Java-fern-like rosette: lance leaves split two-tone along the midrib (lit / shadow halves). */
function drawSprout(ctx: Ctx, x: number, y: number, t: number, lw: number): void {
  contactShadow(ctx, x, y + 1, 26);
  const leaves: [number, number][] = [[-1.15, 26], [-0.7, 36], [-0.25, 42], [0.2, 40], [0.6, 34], [1.05, 27], [-0.05, 30]];
  // Rhizome.
  ctx.beginPath();
  ctx.ellipse(x, y - 1, 9, 3, 0, 0, TAU);
  ctx.fillStyle = '#6b5233';
  ctx.fill();
  for (const [angle, len] of leaves) {
    const sway = Math.sin(t * 1.2 + angle * 3 + x * 0.01) * 0.06;
    ctx.save();
    ctx.translate(x, y - 1);
    ctx.rotate(angle + sway);
    const w = len * 0.2;
    const lit = new Path2D();
    lit.moveTo(0, 0);
    lit.quadraticCurveTo(-w, -len * 0.45, 0, -len);
    lit.lineTo(0, 0);
    const dark = new Path2D();
    dark.moveTo(0, 0);
    dark.quadraticCurveTo(w, -len * 0.45, 0, -len);
    dark.lineTo(0, 0);
    const gLit = ctx.createLinearGradient(0, 0, 0, -len);
    gLit.addColorStop(0, '#3f7a3e');
    gLit.addColorStop(1, '#a6cf72');
    ctx.fillStyle = gLit;
    ctx.fill(lit);
    const gDark = ctx.createLinearGradient(0, 0, 0, -len);
    gDark.addColorStop(0, '#22472e');
    gDark.addColorStop(1, '#5f9550');
    ctx.fillStyle = gDark;
    ctx.fill(dark);
    // Midrib and veins.
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(0, -len * 0.92);
    for (let i = 1; i < 5; i++) {
      const vy = -len * (i / 5.5);
      ctx.moveTo(0, vy);
      ctx.lineTo(-w * 0.55, vy - len * 0.06);
      ctx.moveTo(0, vy);
      ctx.lineTo(w * 0.55, vy - len * 0.06);
    }
    ctx.strokeStyle = rgba('#d9ecb0', 0.4);
    ctx.lineWidth = lw * 0.5;
    ctx.stroke();
    const outline = new Path2D();
    outline.moveTo(0, 0);
    outline.quadraticCurveTo(-w, -len * 0.45, 0, -len);
    outline.quadraticCurveTo(w, -len * 0.45, 0, 0);
    ctx.strokeStyle = rgba('#1d3a26', 0.55);
    ctx.lineWidth = lw * 0.7;
    ctx.stroke(outline);
    ctx.restore();
  }
}

/** Eelgrass: long ribbons, dark at the root and sunlit at the tips, with a lit edge. */
function drawTallWeed(ctx: Ctx, x: number, y: number, t: number, lw: number): void {
  contactShadow(ctx, x, y + 1, 24);
  const blades: [number, number, number][] = [[-12, 128, 0.2], [-5, 158, 0], [3, 140, 0.5], [10, 112, 0.9], [-1, 96, 1.4], [14, 84, 2], [-15, 90, 2.6]];
  for (const [dx, h, ph] of blades) {
    const sway = Math.sin(t * 0.9 + ph + x * 0.01) * (8 + h * 0.06);
    const bx = x + dx;
    const w = 3.6;
    const tipX = bx + sway;
    const tipY = y - h;
    const ribbon = new Path2D();
    ribbon.moveTo(bx - w, y);
    ribbon.bezierCurveTo(bx - w + sway * 0.1, y - h * 0.35, tipX - w * 0.6 - sway * 0.2, y - h * 0.75, tipX, tipY);
    ribbon.bezierCurveTo(tipX + w * 0.5 - sway * 0.2, y - h * 0.72, bx + w + sway * 0.1, y - h * 0.35, bx + w, y);
    ribbon.closePath();
    const g = ctx.createLinearGradient(0, y, 0, tipY);
    g.addColorStop(0, '#1f4a33');
    g.addColorStop(0.55, '#4f8f4c');
    g.addColorStop(1, '#b4d77c');
    ctx.fillStyle = g;
    ctx.fill(ribbon);
    // Shadowed half.
    ctx.save();
    ctx.clip(ribbon);
    ctx.fillStyle = rgba(COOL_SHADOW, 0.25);
    ctx.fillRect(bx, tipY - 10, w + 20, h + 20);
    ctx.restore();
    // Lit edge.
    ctx.beginPath();
    ctx.moveTo(bx - w * 0.7, y);
    ctx.bezierCurveTo(bx - w * 0.7 + sway * 0.1, y - h * 0.35, tipX - w * 0.4 - sway * 0.2, y - h * 0.75, tipX, tipY);
    ctx.strokeStyle = rgba(RIM_LIGHT, 0.4);
    ctx.lineWidth = lw * 0.6;
    ctx.stroke();
    ctx.strokeStyle = rgba('#173524', 0.5);
    ctx.lineWidth = lw * 0.6;
    ctx.stroke(ribbon);
  }
}

// ---------------------------------------------------------------------------
// Stone & structures
// ---------------------------------------------------------------------------

function drawRock(ctx: Ctx, x: number, y: number, lw: number): void {
  contactShadow(ctx, x + 4, y, 40);
  const rand = hashSeq(17);
  const shape = blobPath(x, y - 17, 34, 19, rand, 9, 0.22);
  celShade(ctx, shape, [x - 34, y - 36, 68, 38], { base: '#6f9ad6' }, lw);
  // Weathered crack and speckles.
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 30);
  ctx.lineTo(x - 4, y - 22);
  ctx.lineTo(x - 7, y - 14);
  ctx.strokeStyle = rgba(COOL_SHADOW, 0.35);
  ctx.lineWidth = lw * 0.7;
  ctx.stroke();
  ctx.save();
  ctx.clip(shape);
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    ctx.arc(x + (rand() - 0.5) * 60, y - 4 - rand() * 30, 0.5 + rand() * 0.8, 0, TAU);
    ctx.fillStyle = rand() < 0.5 ? rgba(COOL_SHADOW, 0.2) : rgba(WARM_LIGHT, 0.3);
    ctx.fill();
  }
  ctx.restore();
  moss(ctx, shape, x - 6, y - 34, 22, 9, 3);
}

/** A ruined stone watchtower with a smaller side tower, mortar lines, moss and a faded pennant. */
function drawCastle(ctx: Ctx, x: number, y: number, t: number, lw: number): void {
  contactShadow(ctx, x, y + 1, 56);
  const stone = '#f0c27a';
  const tower = (cx: number, w: number, h: number, seed: number) => {
    const rand = hashSeq(seed);
    const p = new Path2D();
    p.moveTo(cx - w / 2 - 2, y);
    p.lineTo(cx - w / 2, y - h);
    // Broken crenellations.
    const teeth = 3;
    const tw = w / (teeth * 2 - 1);
    for (let i = 0; i < teeth * 2 - 1; i++) {
      const tx = cx - w / 2 + i * tw;
      const up = i % 2 === 0 ? 7 - (rand() < 0.3 ? 4 : 0) : 0;
      p.lineTo(tx, y - h - up);
      p.lineTo(tx + tw, y - h - up);
    }
    p.lineTo(cx + w / 2, y - h);
    p.lineTo(cx + w / 2 + 2, y);
    p.closePath();
    celShade(ctx, p, [cx - w / 2, y - h - 7, w, h + 7], { base: stone }, lw);
    // Mortar courses.
    ctx.save();
    ctx.clip(p);
    ctx.strokeStyle = rgba(COOL_SHADOW, 0.22);
    ctx.lineWidth = lw * 0.5;
    ctx.beginPath();
    for (let row = 0, yy = y - 9; yy > y - h; yy -= 9, row++) {
      ctx.moveTo(cx - w, yy);
      ctx.lineTo(cx + w, yy);
      for (let xx = cx - w / 2 + (row % 2 ? 5 : 0); xx < cx + w / 2; xx += 11) {
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, yy + 9);
      }
    }
    ctx.stroke();
    ctx.restore();
    return p;
  };
  const side = tower(x + 30, 24, 66, 4);
  const main = tower(x - 6, 44, 104, 9);
  // Arched doorway with depth.
  const door = new Path2D();
  door.moveTo(x - 16, y);
  door.lineTo(x - 16, y - 22);
  door.arc(x - 6, y - 22, 10, Math.PI, 0);
  door.lineTo(x + 4, y);
  door.closePath();
  const dg = ctx.createLinearGradient(0, y - 32, 0, y);
  dg.addColorStop(0, '#1d2234');
  dg.addColorStop(1, '#2e3448');
  ctx.fillStyle = dg;
  ctx.fill(door);
  ctx.strokeStyle = rgba(COOL_SHADOW, 0.6);
  ctx.lineWidth = lw * 0.8;
  ctx.stroke(door);
  // Window slits.
  ctx.fillStyle = '#20263a';
  for (const [wx, wy] of [[x - 14, y - 70], [x + 2, y - 70], [x + 30, y - 44]] as const) {
    ctx.beginPath();
    ctx.roundRect(wx - 2, wy, 4, 11, 2);
    ctx.fill();
  }
  moss(ctx, main, x - 18, y - 4, 20, 8, 21);
  moss(ctx, main, x + 8, y - 100, 14, 6, 22);
  moss(ctx, side, x + 30, y - 4, 13, 6, 23);
  // Hanging vines.
  ctx.beginPath();
  for (const [vx, len] of [[x - 22, 34], [x + 12, 26], [x + 38, 20]] as const) {
    ctx.moveTo(vx, y - 104 + (vx > x + 20 ? 40 : 0));
    ctx.quadraticCurveTo(vx + 3, y - 104 + len * 0.5 + (vx > x + 20 ? 40 : 0), vx - 1, y - 104 + len + (vx > x + 20 ? 40 : 0));
  }
  ctx.strokeStyle = rgba('#4f7a36', 0.85);
  ctx.lineWidth = lw * 1.1;
  ctx.stroke();
  // Faded, tattered pennant.
  const wave = Math.sin(t * 2.6) * 2.2;
  ctx.beginPath();
  ctx.moveTo(x + 30, y - 72);
  ctx.lineTo(x + 30, y - 96);
  ctx.strokeStyle = '#5a4a3a';
  ctx.lineWidth = lw * 1.1;
  ctx.stroke();
  const flag = new Path2D();
  flag.moveTo(x + 30, y - 96);
  flag.quadraticCurveTo(x + 39, y - 94 + wave, x + 47, y - 92);
  flag.lineTo(x + 42, y - 89.5);
  flag.lineTo(x + 46, y - 86);
  flag.quadraticCurveTo(x + 38, y - 87 - wave, x + 30, y - 85);
  flag.closePath();
  ctx.fillStyle = '#b9584a';
  ctx.fill(flag);
  ctx.strokeStyle = rgba('#5a2a24', 0.6);
  ctx.lineWidth = lw * 0.6;
  ctx.stroke(flag);
}

/** 0..1 lid openness; the chest pops open briefly every CHEST_BUBBLE_INTERVAL_MS. */
export function chestOpenAmount(timeMs: number, x: number): number {
  const period = CHEST_BUBBLE_INTERVAL_MS;
  const phase = (timeMs + x * 97) % period;
  const openMs = 1.6 * SECOND_MS;
  if (phase > openMs) return 0;
  return Math.sin((phase / openMs) * Math.PI);
}

/** Weathered wooden chest with iron bands; glows gold and spills light when it opens. */
function drawChest(ctx: Ctx, x: number, y: number, timeMs: number, lw: number): void {
  const open = chestOpenAmount(timeMs, x);
  const wood = '#8a5a36';
  const iron = '#5e626b';
  contactShadow(ctx, x, y + 1, 36);
  // Inner glow and light shafts.
  if (open > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(x, y - 30, 2, x, y - 30, 46);
    glow.addColorStop(0, `rgba(255, 220, 120, ${0.55 * open})`);
    glow.addColorStop(1, 'rgba(255, 220, 120, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 50, y - 80, 100, 80);
    ctx.fillStyle = `rgba(255, 236, 170, ${0.18 * open})`;
    ctx.beginPath();
    ctx.moveTo(x - 20, y - 28);
    ctx.lineTo(x - 34, y - 90);
    ctx.lineTo(x + 30, y - 90);
    ctx.lineTo(x + 20, y - 28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#e8b93e';
    for (const [cx, cy] of [[x - 10, y - 29], [x - 2, y - 31], [x + 7, y - 29], [x + 2, y - 27]] as const) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, 4, 1.8, 0, 0, TAU);
      ctx.fill();
    }
  }
  // Body.
  const body = new Path2D();
  body.roundRect(x - 27, y - 28, 54, 28, 3);
  celShade(ctx, body, [x - 27, y - 28, 54, 28], { base: wood }, lw);
  ctx.save();
  ctx.clip(body);
  ctx.strokeStyle = rgba('#3d2614', 0.4);
  ctx.lineWidth = lw * 0.6;
  ctx.beginPath();
  for (const py of [y - 19, y - 10]) {
    ctx.moveTo(x - 30, py);
    ctx.lineTo(x + 30, py);
  }
  ctx.stroke();
  ctx.strokeStyle = rgba(WARM_LIGHT, 0.12);
  const rand = hashSeq(8);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const gy = y - 26 + rand() * 24;
    ctx.moveTo(x - 26 + rand() * 10, gy);
    ctx.quadraticCurveTo(x, gy + (rand() - 0.5) * 3, x + 16 + rand() * 10, gy);
  }
  ctx.stroke();
  ctx.restore();
  // Iron bands with rivets.
  const bands = new Path2D();
  bands.rect(x - 22, y - 28, 6, 28);
  bands.rect(x + 16, y - 28, 6, 28);
  celShade(ctx, bands, [x - 22, y - 28, 44, 28], { base: iron }, lw * 0.6);
  ctx.fillStyle = mix(iron, WARM_LIGHT, 0.5);
  for (const bx of [x - 19, x + 19]) {
    for (const ry of [y - 23, y - 14, y - 5]) {
      ctx.beginPath();
      ctx.arc(bx, ry, 0.9, 0, TAU);
      ctx.fill();
    }
  }
  // Lid, hinged at the back.
  ctx.save();
  ctx.translate(x - 27, y - 28);
  ctx.rotate(-open * 0.9);
  const lid = new Path2D();
  lid.moveTo(0, 0);
  lid.lineTo(0, -8);
  lid.quadraticCurveTo(27, -22, 54, -8);
  lid.lineTo(54, 0);
  lid.closePath();
  celShade(ctx, lid, [0, -17, 54, 17], { base: mix(wood, WARM_LIGHT, 0.06) }, lw);
  const lidBands = new Path2D();
  lidBands.rect(5, -14, 6, 14);
  lidBands.rect(43, -14, 6, 14);
  celShade(ctx, lidBands, [5, -14, 44, 14], { base: iron }, lw * 0.6);
  ctx.restore();
  // Lock plate.
  const lock = new Path2D();
  lock.roundRect(x - 5, y - 24, 10, 10, 2);
  celShade(ctx, lock, [x - 5, y - 24, 10, 10], { base: '#e0b030' }, lw * 0.7);
  ctx.fillStyle = '#2b2116';
  ctx.beginPath();
  ctx.arc(x, y - 19.5, 1.3, 0, TAU);
  ctx.fill();
}

/** Half-sunken wreck: weathered planks, broken mast, tattered sail, barnacles and algae. */
function drawShipwreck(ctx: Ctx, x: number, y: number, lw: number): void {
  contactShadow(ctx, x + 6, y + 2, 92);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.12);
  const wood = '#7a5b40';
  // Broken mast.
  const mast = new Path2D();
  mast.moveTo(-8, -30);
  mast.lineTo(-15, -102);
  mast.lineTo(-10, -96);
  mast.lineTo(-7, -100);
  mast.lineTo(-1, -30);
  mast.closePath();
  celShade(ctx, mast, [-15, -102, 14, 72], { base: mix(wood, '#9a8a70', 0.3) }, lw);
  // Tattered sail with holes.
  const sail = new Path2D();
  sail.moveTo(-12, -92);
  sail.quadraticCurveTo(14, -84, 20, -60);
  sail.lineTo(11, -63);
  sail.lineTo(8, -55);
  sail.lineTo(1, -60);
  sail.lineTo(-6, -54);
  sail.closePath();
  ctx.fillStyle = 'rgba(214, 203, 178, 0.82)';
  ctx.fill(sail);
  ctx.save();
  ctx.clip(sail);
  ctx.fillStyle = rgba(COOL_SHADOW, 0.25);
  ctx.fill(blobPath(4, -66, 10, 6, hashSeq(3), 7, 0.4));
  ctx.restore();
  ctx.fillStyle = 'rgba(40, 60, 80, 0.45)';
  ctx.beginPath();
  ctx.ellipse(2, -76, 2.2, 1.6, 0.3, 0, TAU);
  ctx.ellipse(9, -70, 1.5, 1.1, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba('#6a5e4a', 0.6);
  ctx.lineWidth = lw * 0.6;
  ctx.stroke(sail);
  // Hull.
  const hull = new Path2D();
  hull.moveTo(-80, -42);
  hull.quadraticCurveTo(-72, 4, -30, 6);
  hull.lineTo(58, 6);
  hull.quadraticCurveTo(82, -10, 86, -36);
  hull.lineTo(44, -30);
  hull.lineTo(36, -42);
  hull.lineTo(28, -33);
  hull.lineTo(16, -40);
  hull.lineTo(8, -32);
  hull.closePath();
  celShade(ctx, hull, [-80, -42, 166, 48], { base: wood }, lw);
  ctx.save();
  ctx.clip(hull);
  // Planks.
  ctx.strokeStyle = rgba('#3a2818', 0.45);
  ctx.lineWidth = lw * 0.6;
  ctx.beginPath();
  for (const py of [-30, -20, -10, 0]) {
    ctx.moveTo(-84, py);
    ctx.quadraticCurveTo(0, py + 5, 88, py - 4);
  }
  ctx.stroke();
  // Broken hole.
  ctx.fillStyle = '#1d2030';
  ctx.fill(blobPath(52, -16, 9, 7, hashSeq(11), 7, 0.5));
  // Algae streaks and barnacles.
  ctx.fillStyle = rgba('#4f7a3a', 0.55);
  ctx.fill(blobPath(-50, -2, 24, 6, hashSeq(12), 9, 0.5));
  ctx.fill(blobPath(20, 2, 30, 5, hashSeq(13), 9, 0.5));
  ctx.fillStyle = rgba('#d9d2c0', 0.7);
  const rand = hashSeq(14);
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(-70 + rand() * 140, -6 + rand() * 10, 0.8 + rand() * 1.1, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // Portholes (rusty rims, dark glass).
  for (const px0 of [-46, -18, 10]) {
    const rim = new Path2D();
    rim.arc(px0, -17, 5.2, 0, TAU);
    celShade(ctx, rim, [px0 - 5.2, -22.2, 10.4, 10.4], { base: '#c07a30' }, lw * 0.6);
    ctx.beginPath();
    ctx.arc(px0, -17, 3.4, 0, TAU);
    ctx.fillStyle = '#1e2a36';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px0 - 1.2, -18.4, 1, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
  }
  ctx.restore();
}

/** Draws one decor item with its base centered at (x, baseY). `px` = tank units per CSS pixel. */
export function drawDecor(ctx: Ctx, decorId: DecorId, x: number, baseY: number, timeMs: number, px: number): void {
  const t = timeMs / SECOND_MS;
  const lw = 1.6 * px;
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
