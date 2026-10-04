// Greys out locked content and says when it unlocks (never color/opacity alone: a 🔒 and the level).
import type { ReactNode } from 'react';

export function LockedOverlay({ level, children, compact = false }: { level: number; children?: ReactNode; compact?: boolean }) {
  return (
    <span className={`locked${compact ? ' locked-compact' : ''}`}>
      {children && <span className="locked-content">{children}</span>}
      <span className="locked-tag">
        <span aria-hidden="true">🔒</span> {compact ? `Lv ${level}` : `Unlocks at Lv ${level}`}
      </span>
    </span>
  );
}
