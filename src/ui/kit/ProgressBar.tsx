// Labeled progress bar. Always icon + label + value text (never color alone, for color-blind players).
import type { ReactNode } from 'react';

export type BarTone = 'hunger' | 'happy' | 'growth' | 'xp' | 'brand';

export interface ProgressBarProps {
  label: string;
  /** 0..max */
  value: number;
  max?: number;
  tone?: BarTone;
  icon?: ReactNode;
  /** Right-side text, e.g. "Full", "~7 min". Defaults to the percentage. */
  valueText?: ReactNode;
  /** Hide the label row (the bar still has an aria-label). */
  bare?: boolean;
  className?: string;
}

export function ProgressBar({ label, value, max = 100, tone = 'brand', icon, valueText, bare = false, className = '' }: ProgressBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`pbar pbar-${tone} ${className}`}>
      {!bare && (
        <div className="pbar-head">
          <span className="pbar-label">
            {icon && <span aria-hidden="true">{icon}</span>} {label}
          </span>
          <span className="pbar-value">{valueText ?? `${Math.round(pct)}%`}</span>
        </div>
      )}
      <div className="pbar-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
        <div className="pbar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
