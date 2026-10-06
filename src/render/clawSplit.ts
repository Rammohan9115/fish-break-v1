// Crab claws as separate sprite parts (the same idea as the chest lid): the body sprite has the claw regions cut out,
// and each claw is drawn on top, rotated about its wrist pivot. Regions and pivots are fractions of the trimmed
// sprite, set with the dev panel's claw tool (ui/ClawEditor.tsx) and kept here.
import type { SpeciesId } from '../game/types';
import type { Sprite } from './sprites';

export interface ClawRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Wrist pivot the claw rotates about. */
  px: number;
  py: number;
}

export interface ClawConfig {
  left: ClawRegion;
  right: ClawRegion;
}

export type ClawArt = 'adult' | 'baby';

/** Species whose sprite is split into claws, with the regions for the adult and baby art. */
const DEFAULTS: Partial<Record<SpeciesId, Record<ClawArt, ClawConfig>>> = {
  crab: {
    adult: {
      left: { x0: 0, y0: 0, x1: 0.34, y1: 0.46, px: 0.14, py: 0.45 },
      right: { x0: 0.66, y0: 0, x1: 1, y1: 0.46, px: 0.84, py: 0.46 },
    },
    baby: {
      left: { x0: 0, y0: 0, x1: 0.29, y1: 0.5, px: 0.2, py: 0.5 },
      right: { x0: 0.72, y0: 0, x1: 1, y1: 0.5, px: 0.77, py: 0.5 },
    },
  },
};

/** Settings changed live from the dev panel (they win until reload). */
const overrides = new Map<string, ClawConfig>();

export function clawConfig(speciesId: SpeciesId, art: ClawArt): ClawConfig | null {
  return overrides.get(`${speciesId}:${art}`) ?? DEFAULTS[speciesId]?.[art] ?? null;
}

export function setClawConfig(speciesId: SpeciesId, art: ClawArt, cfg: ClawConfig): void {
  overrides.set(`${speciesId}:${art}`, cfg);
}

export function hasClaws(speciesId: SpeciesId): boolean {
  return DEFAULTS[speciesId] !== undefined;
}

/** Every claw setting in use, as source lines for the dev panel's copy button. */
export function clawConfigSource(): string {
  const fmt = (r: ClawRegion) => `{ x0: ${r.x0}, y0: ${r.y0}, x1: ${r.x1}, y1: ${r.y1}, px: ${r.px}, py: ${r.py} }`;
  const lines: string[] = [];
  for (const id of Object.keys(DEFAULTS) as SpeciesId[]) {
    for (const art of ['adult', 'baby'] as const) {
      const c = clawConfig(id, art)!;
      lines.push(`${id} ${art}: left: ${fmt(c.left)}, right: ${fmt(c.right)}`);
    }
  }
  return lines.join('\n');
}

export interface ClawPart {
  side: 'left' | 'right';
  canvas: HTMLCanvasElement;
  /** The part's top-left in sprite pixels, and its wrist pivot in sprite pixels. */
  x: number;
  y: number;
  pivotX: number;
  pivotY: number;
}

export interface SplitSprite {
  /** The sprite with both claw regions erased. */
  body: Sprite;
  claws: ClawPart[];
}

const cache = new WeakMap<Sprite, { key: string; split: SplitSprite }>();

/** Splits a sprite into body + claws (cached per sprite and config). Null when there's no canvas to work with. */
export function splitSprite(s: Sprite, cfg: ClawConfig): SplitSprite | null {
  const key = JSON.stringify(cfg);
  const hit = cache.get(s);
  if (hit && hit.key === key) return hit.split;
  const body = document.createElement('canvas');
  body.width = s.w;
  body.height = s.h;
  const bctx = body.getContext('2d');
  if (!bctx) return null;
  bctx.drawImage(s.canvas, 0, 0);
  bctx.globalCompositeOperation = 'destination-out';
  const claws: ClawPart[] = [];
  for (const side of ['left', 'right'] as const) {
    const r = cfg[side];
    const x = Math.floor(r.x0 * s.w);
    const y = Math.floor(r.y0 * s.h);
    const w = Math.max(1, Math.ceil(r.x1 * s.w) - x);
    const h = Math.max(1, Math.ceil(r.y1 * s.h) - y);
    const part = document.createElement('canvas');
    part.width = w;
    part.height = h;
    part.getContext('2d')?.drawImage(s.canvas, x, y, w, h, 0, 0, w, h);
    bctx.fillStyle = '#000';
    bctx.fillRect(x, y, w, h);
    claws.push({ side, canvas: part, x, y, pivotX: r.px * s.w, pivotY: r.py * s.h });
  }
  const split: SplitSprite = { body: { canvas: body, w: s.w, h: s.h }, claws };
  cache.set(s, { key, split });
  return split;
}

// ---------------------------------------------------------------------------
// Claw animation (pure)
// ---------------------------------------------------------------------------

export interface ClawAngles {
  /** Rotation (radians, + = clockwise on screen) for each claw. */
  left: number;
  right: number;
}

export interface ClawMood {
  /** Seconds (renderer clock). */
  timeSec: number;
  /** Per-crab offset so claws don't sync. */
  seed: number;
  /** Petted, or a trick that raises them: wave continuously. */
  waving: boolean;
  /** Clap trick: swing both inward fast. */
  clapping: boolean;
  /** Happy: wave for a couple of seconds now and then. */
  happy: boolean;
  /** Dance Mode beat length (ms) and the renderer clock (ms), or null. */
  beatMs: number | null;
  nowMs: number;
  reduced: boolean;
}

/** Idle snip every few seconds, waving when happy or petted, a clap, snapping to the beat in Dance Mode. */
export function clawAngles(m: ClawMood, out: ClawAngles = { left: 0, right: 0 }): ClawAngles {
  out.left = 0;
  out.right = 0;
  const k = m.reduced ? 0.4 : 1;
  if (m.beatMs !== null && !m.reduced) {
    // Snap in on each beat (alternating sides), easing back out.
    const beat = Math.floor(m.nowMs / m.beatMs);
    const t = (m.nowMs % m.beatMs) / m.beatMs;
    const snap = Math.max(0, 1 - t * 2.4);
    const sign = beat % 2 === 0 ? 1 : -1;
    out.left = 0.34 * snap * sign;
    out.right = -0.34 * snap * sign;
    return out;
  }
  if (m.clapping) {
    const clap = Math.abs(Math.sin(m.timeSec * Math.PI * 3));
    out.left = 0.42 * clap * k;
    out.right = -0.42 * clap * k;
    return out;
  }
  if (m.waving || (m.happy && Math.sin(m.timeSec * 0.35 + m.seed) > 0.55)) {
    const w = Math.sin(m.timeSec * 9 + m.seed);
    out.left = (-0.1 + 0.26 * w) * k;
    out.right = (0.1 + 0.26 * Math.sin(m.timeSec * 9 + m.seed + 1.6)) * k;
    return out;
  }
  // Idle: a quick double snip every ~4s (one claw at a time).
  const cycle = (m.timeSec + m.seed * 2) % 4.2;
  if (cycle < 0.5) {
    const snip = Math.sin((cycle / 0.5) * Math.PI * 2) * Math.sin((cycle / 0.5) * Math.PI);
    if (Math.floor((m.timeSec + m.seed * 2) / 4.2) % 2 === 0) out.left = 0.2 * snip * k;
    else out.right = -0.2 * snip * k;
  }
  return out;
}
