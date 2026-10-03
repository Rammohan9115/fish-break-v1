// Particles (bubbles, sparkles) plus small sprites: food pellets and shell/pearl drops.
import { BUBBLE_CURRENT_DRIFT, BUBBLER_X, BUBBLES_PER_SEC, BUBBLES_PER_SEC_REDUCED, POP_TEXT_DURATION_MS, SAND_Y, SECOND_MS } from '../game/constants';
import { SHINY_OUTLINE, SHINY_SPARKLE } from '../game/species';
import type { ShellDrop } from '../game/types';
import type { IconId } from './artConfig';
import { bubblerTop } from './drawTank';
import { drawStar } from './drawFish';
import { blobPath, celShade, COOL_SHADOW, hashSeq, rgba } from './paint';

type Ctx = CanvasRenderingContext2D;

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  phase: number;
  wobble: number;
}

interface Sparkle {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
}

interface Heart {
  x: number;
  y: number;
  age: number;
}

const HEART_LIFE_SEC = 1.8;

interface PopText {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  /** Drawn after the text when its sprite is loaded (else the text carries an emoji). */
  icon: IconId | null;
}

/** A tumbling bit of eggshell. */
interface Chip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  vspin: number;
  size: number;
  color: string;
  age: number;
  life: number;
}

/** A soft cloud of sand kicked up when decor is set down. */
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  life: number;
}

/** Draws an icon sprite centered at (x, y), `size` tank units wide; false if it isn't loaded. */
export type IconDrawer = (icon: IconId, x: number, y: number, size: number) => boolean;

const SURFACE_Y = 8;
const POP_LIFE_SEC = POP_TEXT_DURATION_MS / SECOND_MS;

export class Particles {
  private bubbles: Bubble[] = [];
  private sparkles: Sparkle[] = [];
  private bubbleAcc = 0;
  private pops: PopText[] = [];
  private hearts: Heart[] = [];
  private chips: Chip[] = [];
  private puffs: Puff[] = [];

  /** `current` (−1..1 and beyond in gusts) pushes bubbles sideways. */
  update(dt: number, reducedMotion: boolean, current = 0): void {
    const rate = reducedMotion ? BUBBLES_PER_SEC_REDUCED : BUBBLES_PER_SEC;
    this.bubbleAcc += dt * rate;
    while (this.bubbleAcc >= 1) {
      this.bubbleAcc -= 1;
      this.spawnBubble(BUBBLER_X + (Math.random() - 0.5) * 10, bubblerTop(), 1.5 + Math.random() * 3);
    }
    for (const b of this.bubbles) {
      b.y -= b.vy * dt;
      b.x += current * BUBBLE_CURRENT_DRIFT * dt;
      b.phase += dt * 3;
      b.r += dt * 0.4;
    }
    this.bubbles = this.bubbles.filter((b) => b.y > SURFACE_Y);
    for (const s of this.sparkles) s.age += dt;
    this.sparkles = this.sparkles.filter((s) => s.age < s.life);
    for (const p of this.pops) p.age += dt;
    this.pops = this.pops.filter((p) => p.age < POP_LIFE_SEC);
    for (const p of this.puffs) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, dt * 3);
      p.vy *= 1 - Math.min(1, dt * 3);
    }
    this.puffs = this.puffs.filter((p) => p.age < p.life);
    for (const c of this.chips) {
      c.age += dt;
      c.vy += 260 * dt;
      c.x += c.vx * dt;
      c.y = Math.min(SAND_Y + 2, c.y + c.vy * dt);
      c.spin += c.vspin * dt;
    }
    this.chips = this.chips.filter((c) => c.age < c.life);
    for (const h of this.hearts) h.age += dt;
    this.hearts = this.hearts.filter((h) => h.age < HEART_LIFE_SEC);
  }

  /** A floating heart (e.g. between a pair that just laid an egg). */
  spawnHeart(x: number, y: number): void {
    this.hearts.push({ x, y, age: 0 });
  }

  drawHearts(ctx: Ctx, px: number): void {
    for (const h of this.hearts) {
      const t = h.age / HEART_LIFE_SEC;
      const scale = t < 0.15 ? (t / 0.15) * 1.15 : 1.15 - Math.min(0.15, (t - 0.15) * 0.5);
      const y = h.y - 36 * t;
      const x = h.x + Math.sin(t * Math.PI * 3) * 3;
      ctx.save();
      ctx.globalAlpha = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-12, -2, -8, -12, 0, -5);
      ctx.bezierCurveTo(8, -12, 12, -2, 0, 6);
      ctx.closePath();
      ctx.fillStyle = '#ff8fb1';
      ctx.fill();
      ctx.strokeStyle = '#d9577f';
      ctx.lineWidth = 1.6 * px;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-4, -5, 2, 1.3, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
      ctx.restore();
    }
  }

  /** A puff of sand along the floor at x (decor being set down). */
  spawnSandPuff(x: number, y: number, width: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.puffs.push({
        x: x + side * (width * 0.3 + Math.random() * width * 0.2),
        y: y - Math.random() * 3,
        vx: side * (14 + Math.random() * 22),
        vy: -(4 + Math.random() * 10),
        r: 3 + Math.random() * 4,
        age: 0,
        life: 0.7 + Math.random() * 0.5,
      });
    }
  }

  /** Eggshell chips flying out of a hatching egg. */
  spawnChips(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 60 + Math.random() * 70;
      this.chips.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: Math.random() * 6, vspin: (Math.random() - 0.5) * 14, size: 2.5 + Math.random() * 2.5, color, age: 0, life: 0.9 + Math.random() * 0.3 });
    }
  }

  drawChips(ctx: Ctx, px: number): void {
    for (const c of this.chips) {
      const t = c.age / c.life;
      ctx.save();
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.translate(c.x, c.y);
      ctx.rotate(c.spin);
      ctx.beginPath();
      ctx.moveTo(-c.size, c.size * 0.6);
      ctx.lineTo(0, -c.size);
      ctx.lineTo(c.size, c.size * 0.5);
      ctx.closePath();
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 60, 20, 0.7)';
      ctx.lineWidth = 0.8 * px;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawSandPuffs(ctx: Ctx, color: string): void {
    for (const p of this.puffs) {
      const t = p.age / p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + t * 1.6), 0, Math.PI * 2);
      ctx.fillStyle = rgba(color, 0.45 * (1 - t));
      ctx.fill();
    }
  }

  /** Floating "+N" coin-pop text (with an icon after it, if given) and a little sparkle burst. */
  spawnPop(x: number, y: number, text: string, color: string, icon: IconId | null = null): void {
    this.pops.push({ x, y, text, color, age: 0, icon });
    for (let i = 0; i < 5; i++) this.spawnSparkle(x + (Math.random() - 0.5) * 24, y - Math.random() * 14);
  }

  drawPops(ctx: Ctx, px: number, drawIcon?: IconDrawer): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 18px Nunito, system-ui, sans-serif';
    ctx.lineJoin = 'round';
    for (const p of this.pops) {
      const t = p.age / POP_LIFE_SEC;
      const y = p.y - 34 * (1 - (1 - t) * (1 - t));
      const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15) * 0.3);
      ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      ctx.save();
      ctx.translate(p.x, y);
      ctx.scale(scale, scale);
      const iconW = 20;
      const offset = p.icon ? -iconW * 0.55 : 0;
      ctx.lineWidth = 4 * px;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(p.text, offset, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, offset, 0);
      if (p.icon && drawIcon) drawIcon(p.icon, ctx.measureText(p.text).width / 2 + offset + iconW * 0.6, 0, iconW);
      ctx.restore();
    }
    ctx.restore();
  }

  spawnBubble(x: number, y: number, r: number): void {
    this.bubbles.push({ x, y, r, vy: 40 + Math.random() * 30, phase: Math.random() * 6, wobble: 2 + Math.random() * 3 });
  }

  spawnSparkle(x: number, y: number): void {
    this.sparkles.push({ x, y, age: 0, life: 0.6 + Math.random() * 0.5, size: 2.5 + Math.random() * 2.5 });
  }

  drawBubbles(ctx: Ctx, px: number): void {
    ctx.lineWidth = 1.2 * px;
    for (const b of this.bubbles) {
      const x = b.x + Math.sin(b.phase) * b.wobble;
      ctx.beginPath();
      ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
    }
  }

  drawSparkles(ctx: Ctx, px: number): void {
    for (const s of this.sparkles) {
      const t = s.age / s.life;
      const r = s.size * Math.sin(t * Math.PI);
      ctx.globalAlpha = 1 - t * 0.5;
      drawStar(ctx, s.x, s.y - t * 6, r, SHINY_SPARKLE, SHINY_OUTLINE, 0.8 * px);
    }
    ctx.globalAlpha = 1;
  }
}

export function drawPellet(ctx: Ctx, x: number, y: number, premium: boolean, px: number, timeSec: number): void {
  const r = premium ? 4.2 : 3.4;
  const shape = blobPath(x, y, r, r * 0.85, hashSeq(Math.floor(x * 7)), 6, 0.3);
  celShade(ctx, shape, [x - r, y - r * 0.85, r * 2, r * 1.7], { base: premium ? '#ffc21a' : '#b8702e' }, 1.2 * px);
  if (premium) {
    const tw = (Math.sin(timeSec * 6 + x) + 1) / 2;
    drawStar(ctx, x + 5, y - 5, 2.5 * tw, SHINY_SPARKLE, null, 0);
  }
}

/** A shell or pearl resting on the sand at drop.x. */
export function drawDrop(ctx: Ctx, drop: ShellDrop, px: number, timeSec: number): void {
  const x = drop.x;
  const y = SAND_Y + 6;
  const bob = Math.sin(timeSec * 2 + x) * 0.6;
  ctx.save();
  ctx.translate(x, y + bob);
  // Contact shadow.
  ctx.beginPath();
  ctx.ellipse(1, 5, 9, 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba(COOL_SHADOW, 0.25);
  ctx.fill();
  if (drop.pearl) {
    const g = ctx.createRadialGradient(-2, -2.5, 0.5, 0, 0, 7);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#f1ecf4');
    g.addColorStop(0.85, '#cfc4dc');
    g.addColorStop(1, '#a89bbd');
    ctx.beginPath();
    ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // Iridescent sheen.
    ctx.beginPath();
    ctx.ellipse(1.5, 2, 3.5, 1.6, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(190, 230, 235, 0.35)';
    ctx.fill();
    ctx.strokeStyle = rgba('#7d7090', 0.55);
    ctx.lineWidth = 1.1 * px;
    ctx.beginPath();
    ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
    ctx.stroke();
    const tw = (Math.sin(timeSec * 4 + x) + 1) / 2;
    drawStar(ctx, 5, -6, 3 * tw, '#ffffff', null, 0);
  } else {
    // Cockle shell: ribbed fan with a hinge, cel-shaded.
    const shell = new Path2D();
    shell.moveTo(0, 5);
    shell.lineTo(-8.5, -1.5);
    shell.bezierCurveTo(-8, -9, 8, -9, 8.5, -1.5);
    shell.closePath();
    celShade(ctx, shell, [-8.5, -8, 17, 13], { base: '#ffb3a0', outline: '#c0503c' }, 1.2 * px);
    ctx.save();
    ctx.clip(shell);
    ctx.strokeStyle = rgba('#9a7258', 0.45);
    ctx.lineWidth = 0.9 * px;
    ctx.beginPath();
    for (const dx of [-6.5, -4, -1.5, 1, 3.5, 6]) {
      ctx.moveTo(0, 4.5);
      ctx.lineTo(dx * 1.3, -8);
    }
    ctx.stroke();
    ctx.fillStyle = rgba('#e7a08a', 0.25);
    ctx.beginPath();
    ctx.ellipse(0, 1, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const hinge = new Path2D();
    hinge.ellipse(0, 5, 3, 1.5, 0, 0, Math.PI * 2);
    celShade(ctx, hinge, [-3, 3.5, 6, 3], { base: '#ff9a84' }, 0.8 * px);
  }
  ctx.restore();
}
