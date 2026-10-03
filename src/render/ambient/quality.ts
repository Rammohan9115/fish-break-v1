// Effect quality (low / medium / high). Picked automatically from the median frame time over the first
// few seconds, then stepped down if frames keep dropping (never back up on its own, so it doesn't
// flip-flop). Reduced motion always runs 'low' with no parallax, warp or light rays.
import {
  QUALITY_DOWNGRADE_MS,
  QUALITY_HIGH_MS,
  QUALITY_IGNORE_MS,
  QUALITY_MEDIUM_MS,
  QUALITY_PRESETS,
  QUALITY_PROBE_MS,
  QUALITY_WINDOW,
} from '../../game/constants';

export type QualityLevel = keyof typeof QUALITY_PRESETS;
export type QualityPreset = (typeof QUALITY_PRESETS)[QualityLevel];

export const QUALITY_LEVELS: QualityLevel[] = ['low', 'medium', 'high'];

export class QualityManager {
  private auto: QualityLevel = 'high';
  private override: QualityLevel | null = null;
  private probeStart: number | null = null;
  private probing = true;
  private samples: number[] = [];

  /** The level in effect (a dev override wins over the automatic pick). */
  get level(): QualityLevel {
    return this.override ?? this.auto;
  }

  get autoLevel(): QualityLevel {
    return this.auto;
  }

  get overridden(): QualityLevel | null {
    return this.override;
  }

  /** null returns to the automatic pick. */
  setOverride(level: QualityLevel | null): void {
    this.override = level;
  }

  preset(reducedMotion: boolean): QualityPreset {
    return QUALITY_PRESETS[reducedMotion ? 'low' : this.level];
  }

  /** Feed one frame's duration. `now` is a monotonic clock in ms. */
  sample(frameMs: number, now: number): void {
    if (!(frameMs > 0) || frameMs > QUALITY_IGNORE_MS) return;
    if (this.probing) {
      this.probeStart ??= now;
      this.samples.push(frameMs);
      if (now - this.probeStart < QUALITY_PROBE_MS) return;
      const sorted = [...this.samples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      this.auto = median <= QUALITY_HIGH_MS ? 'high' : median <= QUALITY_MEDIUM_MS ? 'medium' : 'low';
      this.probing = false;
      this.samples = [];
      return;
    }
    this.samples.push(frameMs);
    if (this.samples.length < QUALITY_WINDOW) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples = [];
    if (this.auto === 'high' && avg > QUALITY_DOWNGRADE_MS.high) this.auto = 'medium';
    else if (this.auto === 'medium' && avg > QUALITY_DOWNGRADE_MS.medium) this.auto = 'low';
  }
}
