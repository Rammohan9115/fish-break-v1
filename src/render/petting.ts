// Petting & tricks: pure timing/pose math for the renderer (no DOM, no canvas). Unit-tested.
import { PET_METER_MS, PET_STROKE_BOOST, PET_STROKE_MIN_TRAVEL, PET_STROKE_REVERSALS, PET_STROKE_WINDOW_MS } from '../game/constants';
import type { TrickId } from '../game/bond';
import type { SpeciesId } from '../game/types';

/** The heart-ring meter: fills in PET_METER_MS, PET_STROKE_BOOST× faster while stroking. */
export class PetMeter {
  /** 0..1 */
  progress = 0;

  /** Advances by `dtMs`. Returns true when it fills (then it starts over at 0 for the next session). */
  advance(dtMs: number, stroking: boolean): boolean {
    this.progress += (dtMs / PET_METER_MS) * (stroking ? PET_STROKE_BOOST : 1);
    if (this.progress < 1) return false;
    this.progress = 0;
    return true;
  }

  reset(): void {
    this.progress = 0;
  }
}

const RING = 8;

/**
 * Detects stroking: the pointer moving back and forth. A direction reversal counts once the pointer has
 * travelled PET_STROKE_MIN_TRAVEL the other way. Stroking = PET_STROKE_REVERSALS reversals within the
 * last PET_STROKE_WINDOW_MS. Fixed ring buffer, so it never allocates.
 */
export class StrokeDetector {
  private readonly times = new Float64Array(RING).fill(-Infinity);
  private head = 0;
  private dir = 0;
  private anchor: number | null = null;

  reset(): void {
    this.times.fill(-Infinity);
    this.dir = 0;
    this.anchor = null;
  }

  /** Feed the pointer's x (tank units) at time `now` (ms). */
  move(x: number, now: number): void {
    if (this.anchor === null) {
      this.anchor = x;
      return;
    }
    const d = x - this.anchor;
    if (Math.abs(d) < PET_STROKE_MIN_TRAVEL) return;
    const dir = Math.sign(d);
    if (this.dir !== 0 && dir !== this.dir) {
      this.times[this.head] = now;
      this.head = (this.head + 1) % RING;
    }
    this.dir = dir;
    this.anchor = x;
  }

  stroking(now: number): boolean {
    let n = 0;
    for (let i = 0; i < RING; i++) if (now - this.times[i]! <= PET_STROKE_WINDOW_MS) n++;
    return n >= PET_STROKE_REVERSALS;
  }
}

/** A visual offset for a fish doing a trick, applied around its center. */
export interface TrickPose {
  /** Rotation (radians, + = clockwise on screen). */
  rot: number;
  dx: number;
  dy: number;
  scale: number;
  /** Body-wave amplitude multiplier (fin fan, wiggle). */
  wave: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Which visual a trick plays for this species (danio and tetra share the zoom dash). */
export type TrickVisual = 'spin' | 'hoop' | 'heartBubble' | 'rainbowTwirl' | 'zoom' | 'finFan' | 'loop' | 'wiggle' | 'puffPop' | 'backflip' | 'leap' | 'rainbowGlow' | 'snuffleDance' | 'splashJump' | 'clawClap';

const SIGNATURE_VISUAL: Record<SpeciesId, TrickVisual> = {
  goldfish: 'heartBubble',
  guppy: 'rainbowTwirl',
  danio: 'zoom',
  tetra: 'zoom',
  betta: 'finFan',
  angelfish: 'loop',
  clownfish: 'wiggle',
  puffer: 'puffPop',
  axolotl: 'backflip',
  koi: 'leap',
  jellyfish: 'rainbowGlow',
  cory: 'snuffleDance',
  cherry_shrimp: 'backflip',
  kuhli_loach: 'loop',
  hatchetfish: 'splashJump',
  crab: 'clawClap',
};

export function trickVisual(trick: Exclude<TrickId, 'follow'>, speciesId: SpeciesId): TrickVisual {
  if (trick === 'spin') return 'spin';
  if (trick === 'hoop') return 'hoop';
  return SIGNATURE_VISUAL[speciesId];
}

const REST: TrickPose = { rot: 0, dx: 0, dy: 0, scale: 1, wave: 1 };

/**
 * The pose at progress t (0..1) of a trick. `facing` is ±1 (which way the fish looks); `leapHeight` is how
 * far up the koi jumps. Reduced motion turns every trick into a gentle scale pulse.
 */
export function trickPose(visual: TrickVisual, t: number, facing: number, reduced: boolean, leapHeight = 0, out: TrickPose = { ...REST }): TrickPose {
  out.rot = 0;
  out.dx = 0;
  out.dy = 0;
  out.scale = 1;
  out.wave = 1;
  if (t <= 0 || t >= 1) return out;
  const bell = Math.sin(Math.PI * t);
  if (reduced) {
    out.scale = 1 + 0.12 * bell;
    return out;
  }
  const back = facing >= 0 ? -1 : 1;
  switch (visual) {
    case 'spin':
    case 'rainbowTwirl':
      out.rot = easeInOut(t) * Math.PI * 2 * back;
      out.scale = 1 + 0.08 * bell;
      break;
    case 'hoop':
    case 'zoom':
      // The fish itself swims (the renderer steers it); just a stretch here.
      out.scale = 1 + 0.06 * bell;
      out.wave = 1.6;
      break;
    case 'heartBubble':
      out.scale = 1 + 0.15 * Math.sin(Math.PI * Math.min(1, t * 2.5));
      break;
    case 'finFan':
      out.scale = 1 + 0.12 * bell;
      out.wave = 1 + 2.5 * bell;
      out.rot = Math.sin(t * Math.PI * 4) * 0.08;
      break;
    case 'loop': {
      const a = easeInOut(t) * Math.PI * 2;
      const r = 34;
      out.dx = Math.sin(a) * r * (facing >= 0 ? 1 : -1);
      out.dy = -(1 - Math.cos(a)) * r;
      out.rot = a * back;
      break;
    }
    case 'wiggle':
      out.rot = Math.sin(t * Math.PI * 8) * 0.35 * bell;
      out.dy = -Math.abs(Math.sin(t * Math.PI * 4)) * 8;
      out.wave = 2;
      break;
    case 'puffPop':
      out.rot = t > 0.2 && t < 0.8 ? easeInOut((t - 0.2) / 0.6) * Math.PI * 2 * back : 0;
      out.scale = t > 0.8 ? 1 + 0.25 * Math.sin(((t - 0.8) / 0.2) * Math.PI) : 1;
      break;
    case 'backflip':
      out.dy = -bell * 50;
      out.rot = easeInOut(t) * Math.PI * 2 * back;
      break;
    case 'leap':
      out.dy = -bell * leapHeight;
      out.rot = (t - 0.5) * 1.6 * (facing >= 0 ? 1 : -1);
      break;
    case 'rainbowGlow':
      out.scale = 1 + 0.1 * Math.sin(t * Math.PI * 6) * bell;
      break;
    case 'snuffleDance':
      out.dy = Math.abs(Math.sin(t * Math.PI * 6)) * 3 * bell;
      out.rot = Math.sin(t * Math.PI * 6) * 0.12 * bell * (facing >= 0 ? 1 : -1);
      out.wave = 1.8;
      break;
    case 'splashJump':
      out.dy = -bell * (leapHeight || 60);
      out.rot = (t - 0.5) * 1.2 * (facing >= 0 ? 1 : -1);
      out.wave = 1.6;
      break;
    case 'clawClap':
      out.dy = -Math.abs(Math.sin(t * Math.PI * 6)) * 5 * bell;
      out.rot = Math.sin(t * Math.PI * 6) * 0.07 * bell;
      break;
  }
  return out;
}
