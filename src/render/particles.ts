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
  /** Fill color (default: the shiny gold). */
  color: string;
}

interface Heart {
  x: number;
  y: number;
  age: number;
  /** Burst velocity (units/s); 0 for a plain floating heart. */
  vx: number;
  vy: number;
  size: number;
  gold: boolean;
}

const HEART_LIFE_SEC = 1.8;

/** A ring of bubbles (Bubble Hoop) or a heart-shaped bubble (goldfish signature) that drifts up and fades. */
interface Ring {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  heart: boolean;
}

/** A speed line behind a dashing fish. */
interface Streak {
  x: number;
  y: number;
  len: number;
  dir: number;
  age: number;
  life: number;
}

/** Rainbow trail colors (shared, so sparkles never allocate a color). */
export const RAINBOW = ['#ff6b8b', '#ffb347', '#ffe066', '#7ee081', '#5ec8ff', '#a98bff'] as const;

/**
 * A fixed-shape object pool: `items` are live, dead ones go to a free list and are reused, and the live
 * list is compacted in place. Nothing is allocated per frame once the pool has warmed up.
 */
class Pool<T> {
  readonly items: T[] = [];
  private readonly free: T[] = [];
  constructor(private readonly make: () => T) {}

  spawn(): T {
    const item = this.free.pop() ?? this.make();
    this.items.push(item);
    return item;
  }

  /** Removes items for which `dead` is true (keeps order). */
  sweep(dead: (item: T) => boolean): void {
    let w = 0;
    for (let r = 0; r < this.items.length; r++) {
      const item = this.items[r]!;
      if (dead(item)) this.free.push(item);
      else this.items[w++] = item;
    }
    this.items.length = w;
  }
}

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

const lifeOver = (p: { age: number; life: number }) => p.age >= p.life;
const bubbleGone = (b: Bubble) => b.y <= SURFACE_Y;
const popOver = (p: PopText) => p.age >= POP_LIFE_SEC;
const heartOver = (h: Heart) => h.age >= HEART_LIFE_SEC;

/** A heart outline centered near the origin, `k` × the base 12-unit heart. Starts its own subpath. */
export function heartPath(ctx: Ctx, k: number): void {
  ctx.moveTo(0, 6 * k);
  ctx.bezierCurveTo(-12 * k, -2 * k, -8 * k, -12 * k, 0, -5 * k);
  ctx.bezierCurveTo(8 * k, -12 * k, 12 * k, -2 * k, 0, 6 * k);
  ctx.closePath();
}

export class Particles {
  private readonly bubblePool = new Pool<Bubble>(() => ({ x: 0, y: 0, r: 0, vy: 0, phase: 0, wobble: 0 }));
  private readonly sparklePool = new Pool<Sparkle>(() => ({ x: 0, y: 0, age: 0, life: 0, size: 0, color: SHINY_SPARKLE }));
  private bubbleAcc = 0;
  private readonly popPool = new Pool<PopText>(() => ({ x: 0, y: 0, text: '', color: '', age: 0, icon: null }));
  private readonly heartPool = new Pool<Heart>(() => ({ x: 0, y: 0, age: 0, vx: 0, vy: 0, size: 1, gold: false }));
  private readonly chipPool = new Pool<Chip>(() => ({ x: 0, y: 0, vx: 0, vy: 0, spin: 0, vspin: 0, size: 0, color: '', age: 0, life: 0 }));
  private readonly puffPool = new Pool<Puff>(() => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, age: 0, life: 0 }));
  private readonly ringPool = new Pool<Ring>(() => ({ x: 0, y: 0, r: 0, age: 0, life: 0, heart: false }));
  private readonly streakPool = new Pool<Streak>(() => ({ x: 0, y: 0, len: 0, dir: 1, age: 0, life: 0 }));
  private get bubbles(): Bubble[] {
    return this.bubblePool.items;
  }
  private get sparkles(): Sparkle[] {
    return this.sparklePool.items;
  }
  private get pops(): PopText[] {
    return this.popPool.items;
  }
  private get hearts(): Heart[] {
    return this.heartPool.items;
  }
  private get chips(): Chip[] {
    return this.chipPool.items;
  }
  private get puffs(): Puff[] {
    return this.puffPool.items;
  }

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
    this.bubblePool.sweep(bubbleGone);
    for (const s of this.sparkles) s.age += dt;
    this.sparklePool.sweep(lifeOver);
    for (const p of this.pops) p.age += dt;
    this.popPool.sweep(popOver);
    for (const p of this.puffs) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, dt * 3);
      p.vy *= 1 - Math.min(1, dt * 3);
    }
    this.puffPool.sweep(lifeOver);
    for (const c of this.chips) {
      c.age += dt;
      c.vy += 260 * dt;
      c.x += c.vx * dt;
      c.y = Math.min(SAND_Y + 2, c.y + c.vy * dt);
      c.spin += c.vspin * dt;
    }
    this.chipPool.sweep(lifeOver);
    for (const h of this.hearts) {
      h.age += dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      const drag = 1 - Math.min(1, dt * 3);
      h.vx *= drag;
      h.vy *= drag;
    }
    this.heartPool.sweep(heartOver);
    for (const r of this.ringPool.items) {
      r.age += dt;
      r.y -= 14 * dt;
      r.x += current * BUBBLE_CURRENT_DRIFT * 0.5 * dt;
    }
    this.ringPool.sweep(lifeOver);
    for (const k of this.streakPool.items) k.age += dt;
    this.streakPool.sweep(lifeOver);
  }

  /** A floating heart (e.g. between a pair that just laid an egg). `size` scales it; gold for Soulmates and big moments. */
  spawnHeart(x: number, y: number, size = 1, gold = false): void {
    const h = this.heartPool.spawn();
    h.x = x;
    h.y = y;
    h.age = 0;
    h.vx = 0;
    h.vy = 0;
    h.size = size;
    h.gold = gold;
  }

  /** Hearts flying out in a ring (a completed pet, a bond level-up). */
  spawnHeartBurst(x: number, y: number, count: number, speed: number, gold = false): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const v = speed * (0.7 + Math.random() * 0.5);
      const h = this.heartPool.spawn();
      h.x = x;
      h.y = y;
      h.age = 0;
      h.vx = Math.cos(a) * v;
      h.vy = Math.sin(a) * v;
      h.size = 0.7 + Math.random() * 0.5;
      h.gold = gold;
    }
  }

  /** A bubble ring (Bubble Hoop) or a heart-shaped bubble, centered at (x, y). */
  spawnRing(x: number, y: number, r: number, life: number, heart = false): void {
    const ring = this.ringPool.spawn();
    ring.x = x;
    ring.y = y;
    ring.r = r;
    ring.age = 0;
    ring.life = life;
    ring.heart = heart;
  }

  /** A speed line pointing along `dir` (±1). */
  spawnStreak(x: number, y: number, len: number, dir: number): void {
    const k = this.streakPool.spawn();
    k.x = x;
    k.y = y;
    k.len = len;
    k.dir = dir;
    k.age = 0;
    k.life = 0.35 + Math.random() * 0.15;
  }

  drawRings(ctx: Ctx, px: number): void {
    for (const r of this.ringPool.items) {
      const t = r.age / r.life;
      const alpha = t < 0.15 ? t / 0.15 : t > 0.6 ? Math.max(0, 1 - (t - 0.6) / 0.4) : 1;
      const grow = 0.6 + 0.4 * Math.min(1, t / 0.2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(r.x, r.y);
      ctx.scale(grow, grow);
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      if (r.heart) heartPath(ctx, r.r / 8);
      else ctx.ellipse(0, 0, r.r * 0.55, r.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Little bubbles strung along it.
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r.age * 1.5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r.r * 0.55, Math.sin(a) * r.r, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawStreaks(ctx: Ctx, px: number): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.2 * px;
    for (const k of this.streakPool.items) {
      const t = k.age / k.life;
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(k.x - k.dir * k.len * t, k.y);
      ctx.lineTo(k.x - k.dir * k.len * (0.4 + t), k.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHearts(ctx: Ctx, px: number): void {
    for (const h of this.hearts) {
      const t = h.age / HEART_LIFE_SEC;
      const scale = (t < 0.15 ? (t / 0.15) * 1.15 : 1.15 - Math.min(0.15, (t - 0.15) * 0.5)) * h.size;
      const y = h.y - 36 * t;
      const x = h.x + Math.sin(t * Math.PI * 3) * 3;
      ctx.save();
      ctx.globalAlpha = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.beginPath();
      heartPath(ctx, 1);
      ctx.fillStyle = h.gold ? '#ffd84a' : '#ff8fb1';
      ctx.fill();
      ctx.strokeStyle = h.gold ? '#c8901a' : '#d9577f';
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
      const p = this.puffPool.spawn();
      p.x = x + side * (width * 0.3 + Math.random() * width * 0.2);
      p.y = y - Math.random() * 3;
      p.vx = side * (14 + Math.random() * 22);
      p.vy = -(4 + Math.random() * 10);
      p.r = 3 + Math.random() * 4;
      p.age = 0;
      p.life = 0.7 + Math.random() * 0.5;
    }
  }

  /** Eggshell chips flying out of a hatching egg. */
  spawnChips(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 60 + Math.random() * 70;
      const c = this.chipPool.spawn();
      c.x = x;
      c.y = y;
      c.vx = Math.cos(a) * v;
      c.vy = Math.sin(a) * v;
      c.spin = Math.random() * 6;
      c.vspin = (Math.random() - 0.5) * 14;
      c.size = 2.5 + Math.random() * 2.5;
      c.color = color;
      c.age = 0;
      c.life = 0.9 + Math.random() * 0.3;
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
    const p = this.popPool.spawn();
    p.x = x;
    p.y = y;
    p.text = text;
    p.color = color;
    p.age = 0;
    p.icon = icon;
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
    const b = this.bubblePool.spawn();
    b.x = x;
    b.y = y;
    b.r = r;
    b.vy = 40 + Math.random() * 30;
    b.phase = Math.random() * 6;
    b.wobble = 2 + Math.random() * 3;
  }

  spawnSparkle(x: number, y: number, color: string = SHINY_SPARKLE): void {
    const s = this.sparklePool.spawn();
    s.x = x;
    s.y = y;
    s.age = 0;
    s.life = 0.6 + Math.random() * 0.5;
    s.size = 2.5 + Math.random() * 2.5;
    s.color = color;
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
      drawStar(ctx, s.x, s.y - t * 6, r, s.color, SHINY_OUTLINE, 0.8 * px);
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
