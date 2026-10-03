// A gentle global current: slow noise-driven drift that wanders in direction and strength, plus a soft
// gust every few minutes (plants lean, particles stream sideways, bubbles drift) that settles over ~5s.
import {
  CURRENT_NOISE_SPEED,
  GUST_FIRST_MIN_S,
  GUST_HOLD_S,
  GUST_MAX_S,
  GUST_MIN_S,
  GUST_RISE_S,
  GUST_SETTLE_S,
  GUST_STRENGTH,
} from '../../game/constants';
import { fbm1D, smoothstep } from './noise';

export interface CurrentState {
  /** Slow drift, −1..1 (positive = toward +x). */
  drift: number;
  /** Gust envelope, 0..1, times its direction (−1 or 1). */
  gust: number;
  /** drift + gust × GUST_STRENGTH: what plants, particles and bubbles respond to. */
  total: number;
}

/** Gust strength `t` seconds after it starts: eased rise, short hold, long soft settle. 0 outside. Pure. */
export function gustEnvelope(t: number): number {
  if (t < 0) return 0;
  if (t < GUST_RISE_S) return smoothstep(t / GUST_RISE_S);
  if (t < GUST_RISE_S + GUST_HOLD_S) return 1;
  const settle = (t - GUST_RISE_S - GUST_HOLD_S) / GUST_SETTLE_S;
  return settle >= 1 ? 0 : 1 - smoothstep(settle);
}

export class Currents {
  private time = 0;
  private nextGustAt: number;
  private gustStart = -Infinity;
  private gustDir = 1;
  state: CurrentState = { drift: 0, gust: 0, total: 0 };

  constructor(
    private readonly rng: () => number = Math.random,
    private readonly seed = Math.floor(Math.random() * 1000),
  ) {
    this.nextGustAt = GUST_FIRST_MIN_S + rng() * GUST_MIN_S;
  }

  update(dt: number): CurrentState {
    this.time += dt;
    if (this.time >= this.nextGustAt) this.startGust();
    const drift = Math.max(-1, Math.min(1, fbm1D(this.time * CURRENT_NOISE_SPEED, this.seed) * 1.6));
    const gust = gustEnvelope(this.time - this.gustStart) * this.gustDir;
    this.state = { drift, gust, total: drift + gust * GUST_STRENGTH };
    return this.state;
  }

  /** Starts a gust now (dev button, or on schedule), mostly along the current drift. */
  forceGust(): void {
    this.startGust();
  }

  private startGust(): void {
    this.gustStart = this.time;
    this.gustDir = this.state.drift !== 0 && this.rng() < 0.7 ? Math.sign(this.state.drift) : this.rng() < 0.5 ? -1 : 1;
    this.nextGustAt = this.time + GUST_MIN_S + this.rng() * (GUST_MAX_S - GUST_MIN_S);
  }
}
