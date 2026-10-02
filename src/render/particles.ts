// Particles (bubbles, sparkles) plus small sprites: food pellets and shell/pearl drops.
import { BUBBLER_X, BUBBLES_PER_SEC, BUBBLES_PER_SEC_REDUCED, POP_TEXT_DURATION_MS, SAND_Y, SECOND_MS } from '../game/constants';
import { SHINY_OUTLINE, SHINY_SPARKLE } from '../game/species';
import type { ShellDrop } from '../game/types';
import { bubblerTop } from './drawTank';
import { drawStar } from './drawFish';

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
}

const SURFACE_Y = 8;
const POP_LIFE_SEC = POP_TEXT_DURATION_MS / SECOND_MS;

export class Particles {
  private bubbles: Bubble[] = [];
  private sparkles: Sparkle[] = [];
  private bubbleAcc = 0;
  private pops: PopText[] = [];
  private hearts: Heart[] = [];

  update(dt: number, reducedMotion: boolean): void {
    const rate = reducedMotion ? BUBBLES_PER_SEC_REDUCED : BUBBLES_PER_SEC;
    this.bubbleAcc += dt * rate;
    while (this.bubbleAcc >= 1) {
      this.bubbleAcc -= 1;
      this.spawnBubble(BUBBLER_X + (Math.random() - 0.5) * 10, bubblerTop(), 1.5 + Math.random() * 3);
    }
    for (const b of this.bubbles) {
      b.y -= b.vy * dt;
      b.phase += dt * 3;
      b.r += dt * 0.4;
    }
    this.bubbles = this.bubbles.filter((b) => b.y > SURFACE_Y);
    for (const s of this.sparkles) s.age += dt;
    this.sparkles = this.sparkles.filter((s) => s.age < s.life);
    for (const p of this.pops) p.age += dt;
    this.pops = this.pops.filter((p) => p.age < POP_LIFE_SEC);
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

  /** Floating "+N" coin-pop text with a little sparkle burst. */
  spawnPop(x: number, y: number, text: string, color: string): void {
    this.pops.push({ x, y, text, color, age: 0 });
    for (let i = 0; i < 5; i++) this.spawnSparkle(x + (Math.random() - 0.5) * 24, y - Math.random() * 14);
  }

  drawPops(ctx: Ctx, px: number): void {
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
      ctx.lineWidth = 4 * px;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
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
  ctx.beginPath();
  ctx.arc(x, y, premium ? 4.2 : 3.4, 0, Math.PI * 2);
  ctx.fillStyle = premium ? '#ffd257' : '#c98a5a';
  ctx.fill();
  ctx.strokeStyle = premium ? '#d99a1e' : '#8f5a34';
  ctx.lineWidth = 1.5 * px;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - 1.1, y - 1.1, 1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fill();
  if (premium) {
    const tw = (Math.sin(timeSec * 6 + x) + 1) / 2;
    drawStar(ctx, x + 5, y - 5, 2.5 * tw, SHINY_SPARKLE, null, 0);
  }
}

/** A shell or pearl resting on the sand at drop.x. */
export function drawDrop(ctx: Ctx, drop: ShellDrop, px: number, timeSec: number): void {
  const x = drop.x;
  const y = SAND_Y + 6;
  const bob = Math.sin(timeSec * 2 + x) * 0.8;
  ctx.save();
  ctx.translate(x, y + bob);
  if (drop.pearl) {
    const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 7);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#f3ecff');
    g.addColorStop(1, '#cdbfe8');
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#a796cc';
    ctx.lineWidth = 1.5 * px;
    ctx.stroke();
    const tw = (Math.sin(timeSec * 4 + x) + 1) / 2;
    drawStar(ctx, 5, -6, 3 * tw, '#ffffff', null, 0);
  } else {
    // scallop shell: fan with ribs
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.lineTo(-9, -2);
    ctx.quadraticCurveTo(0, -12, 9, -2);
    ctx.closePath();
    ctx.fillStyle = '#ffc9b8';
    ctx.fill();
    ctx.strokeStyle = '#d98f7a';
    ctx.lineWidth = 1.6 * px;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineWidth = 1 * px;
    for (const dx of [-5, -2, 2, 5]) {
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(dx * 1.3, -5);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, 5, 3, 1.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffb3a0';
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
