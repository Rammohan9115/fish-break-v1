// Collection set bonuses add a themed touch of ambience to the tank:
// Nature = drifting pollen · Ruins = slow sand motes in the light · Cozy Village = fireflies at night ·
// Playful = rainbow bubbles now and then · Halloween = cute little ghosts floating up at night.
// Fixed-size particle pools: nothing is allocated per frame.
import { SAND_Y } from '../../game/constants';
import type { CollectionId } from '../../game/types';
import type { Extent } from '../drawTank';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

interface Mote {
  /** Which set it belongs to; null = free slot. */
  set: CollectionId | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  phase: number;
  hue: number;
}

/** How many of each kind live at once (full motion), and how often rare ones spawn (seconds). */
const COUNT: Record<CollectionId, number> = { nature: 22, ruins: 18, village: 12, playful: 3, halloween: 3 };
const SPAWN_GAP: Record<CollectionId, number> = { nature: 0.35, ruins: 0.5, village: 0.6, playful: 1.6, halloween: 3.5 };
/** Below this much night-light, fireflies and ghosts stay away. */
const NIGHT = 0.3;
const POOL = 80;

export class SetEffects {
  private readonly motes: Mote[] = Array.from({ length: POOL }, () => ({ set: null, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1, phase: 0, hue: 0 }));
  private readonly acc: Record<CollectionId, number> = { nature: 0, ruins: 0, village: 0, playful: 0, halloween: 0 };
  private readonly live: Record<CollectionId, number> = { nature: 0, ruins: 0, village: 0, playful: 0, halloween: 0 };

  constructor(private readonly rng: () => number = Math.random) {}

  /** `lights` is the night-light level (0 day … 1 night). */
  update(dt: number, sets: readonly CollectionId[], view: Extent, lights: number, reduced: boolean): void {
    for (const k of Object.keys(this.live) as CollectionId[]) this.live[k] = 0;
    for (const m of this.motes) {
      if (!m.set) continue;
      m.age += dt;
      // A set that's gone (or night that's over) lets its motes fade out naturally.
      const keep = sets.includes(m.set) && (!nightOnly(m.set) || lights >= NIGHT);
      if (!keep) m.life = Math.min(m.life, m.age + 0.6);
      if (m.age >= m.life) {
        m.set = null;
        continue;
      }
      this.live[m.set]++;
      const wobble = Math.sin(m.age * 1.7 + m.phase);
      m.x += (m.vx + wobble * (m.set === 'village' ? 14 : 4)) * dt;
      m.y += (m.vy + (m.set === 'village' ? Math.cos(m.age * 1.3 + m.phase) * 10 : 0)) * dt;
    }
    for (const set of sets) {
      if (nightOnly(set) && lights < NIGHT) continue;
      const max = Math.max(1, Math.round(COUNT[set] * (reduced ? 0.33 : 1)));
      this.acc[set] += dt;
      while (this.acc[set] >= SPAWN_GAP[set]) {
        this.acc[set] -= SPAWN_GAP[set];
        if (this.live[set] >= max) continue;
        if (this.spawn(set, view)) this.live[set]++;
      }
    }
  }

  draw(ctx: Ctx, px: number, timeSec: number): void {
    for (const m of this.motes) {
      if (!m.set) continue;
      const t = m.age / m.life;
      const fade = Math.min(1, m.age / 0.8, (m.life - m.age) / 0.8);
      switch (m.set) {
        case 'nature':
          ctx.globalAlpha = 0.7 * fade;
          ctx.fillStyle = '#f4f7a8';
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.size, 0, TAU);
          ctx.fill();
          break;
        case 'ruins':
          ctx.globalAlpha = 0.45 * fade * (0.6 + 0.4 * Math.sin(timeSec * 2 + m.phase));
          ctx.fillStyle = '#ffe9bf';
          ctx.fillRect(m.x - m.size / 2, m.y - m.size / 2, m.size, m.size);
          break;
        case 'village':
          this.glowDot(ctx, m.x, m.y, m.size * 7, `rgba(220, 255, 140, ${0.9 * fade * (0.55 + 0.45 * Math.sin(timeSec * 3 + m.phase))})`);
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#f6ffd0';
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.size * 0.8, 0, TAU);
          ctx.fill();
          break;
        case 'playful':
          this.rainbowBubble(ctx, m, fade, px);
          break;
        case 'halloween':
          this.ghost(ctx, m, t, fade, px);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  private spawn(set: CollectionId, view: Extent): boolean {
    const m = this.motes.find((x) => x.set === null);
    if (!m) return false;
    const r = this.rng;
    const w = view.x1 - view.x0;
    const water = SAND_Y - view.y0;
    m.set = set;
    m.age = 0;
    m.phase = r() * TAU;
    m.hue = r() * 360;
    switch (set) {
      case 'nature':
        m.x = view.x0 + r() * w;
        m.y = view.y0 + r() * water * 0.8;
        m.vx = 6 + r() * 6;
        m.vy = 3 + r() * 4;
        m.size = 1.2 + r() * 1.2;
        m.life = 8 + r() * 6;
        break;
      case 'ruins':
        m.x = view.x0 + r() * w;
        m.y = view.y0 + water * (0.1 + r() * 0.5);
        m.vx = (r() - 0.5) * 4;
        m.vy = -(1 + r() * 2);
        m.size = 1.2 + r() * 1.6;
        m.life = 9 + r() * 6;
        break;
      case 'village':
        m.x = view.x0 + r() * w;
        m.y = view.y0 + water * (0.35 + r() * 0.55);
        m.vx = (r() - 0.5) * 8;
        m.vy = (r() - 0.5) * 4;
        m.size = 1.4 + r() * 1;
        m.life = 6 + r() * 5;
        break;
      case 'playful':
        m.x = view.x0 + w * (0.1 + r() * 0.8);
        m.y = SAND_Y - 6;
        m.vx = 0;
        m.vy = -(28 + r() * 14);
        m.size = 5 + r() * 4;
        m.life = (water - 30) / -m.vy;
        break;
      case 'halloween':
        m.x = view.x0 + w * (0.1 + r() * 0.8);
        m.y = SAND_Y - 20;
        m.vx = (r() - 0.5) * 6;
        m.vy = -(12 + r() * 6);
        m.size = 9 + r() * 4;
        m.life = 7 + r() * 3;
        break;
    }
    return true;
  }

  private glowDot(ctx: Ctx, x: number, y: number, r: number, color: string): void {
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(220, 255, 140, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = prev;
  }

  /** A soap bubble with a slowly turning rainbow sheen. */
  private rainbowBubble(ctx: Ctx, m: Mote, fade: number, px: number): void {
    const x = m.x + Math.sin(m.age * 2.4 + m.phase) * 3;
    ctx.globalAlpha = 0.85 * fade;
    ctx.lineWidth = 1.6 * px;
    ctx.strokeStyle = `hsl(${(m.hue + m.age * 90) % 360}, 90%, 72%)`;
    ctx.fillStyle = `hsla(${(m.hue + m.age * 90 + 120) % 360}, 90%, 80%, 0.18)`;
    ctx.beginPath();
    ctx.arc(x, m.y, m.size, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(x - m.size * 0.35, m.y - m.size * 0.35, m.size * 0.22, 0, TAU);
    ctx.fill();
  }

  /** A tiny friendly ghost: round head, wavy hem, two dot eyes and a little smile. */
  private ghost(ctx: Ctx, m: Mote, t: number, fade: number, px: number): void {
    const s = m.size;
    const x = m.x + Math.sin(m.age * 1.6 + m.phase) * 6;
    const y = m.y;
    ctx.save();
    ctx.globalAlpha = 0.7 * fade;
    ctx.translate(x, y);
    ctx.rotate(Math.sin(m.age * 2 + m.phase) * 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, s, Math.PI, 0);
    ctx.lineTo(s, s * 1.1);
    const waves = 3;
    for (let i = 0; i < waves; i++) {
      const x0 = s - ((i + 0.5) * 2 * s) / waves;
      const x1 = s - ((i + 1) * 2 * s) / waves;
      ctx.quadraticCurveTo(x0, s * (1.1 + 0.35 * Math.sin(t * 20 + i)), x1, s * 1.1);
    }
    ctx.closePath();
    ctx.fillStyle = '#f6f3ff';
    ctx.fill();
    ctx.lineWidth = 1.4 * px;
    ctx.strokeStyle = '#b9a8e8';
    ctx.stroke();
    ctx.fillStyle = '#3b2e5a';
    ctx.beginPath();
    ctx.arc(-s * 0.35, -s * 0.1, s * 0.13, 0, TAU);
    ctx.arc(s * 0.35, -s * 0.1, s * 0.13, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, s * 0.2, s * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.lineWidth = 1.2 * px;
    ctx.strokeStyle = '#3b2e5a';
    ctx.stroke();
    ctx.restore();
  }
}

/** Fireflies and ghosts only come out at night. */
function nightOnly(set: CollectionId): boolean {
  return set === 'village' || set === 'halloween';
}
