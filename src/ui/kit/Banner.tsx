// Floating banner over the water (pairing mode, quest step, active tool). One per slot; ✕ when dismissible.
import type { ReactNode } from 'react';
import { CloseButton } from './Button';

export function Banner({
  children,
  sub,
  tone = 'brand',
  onClose,
  closeLabel = 'Close',
  slot = 'top',
  className = '',
}: {
  children: ReactNode;
  sub?: ReactNode;
  tone?: 'brand' | 'love' | 'gold';
  onClose?: () => void;
  closeLabel?: string;
  /** top: under the HUD · bottom: above the toolbar. */
  slot?: 'top' | 'bottom';
  className?: string;
}) {
  return (
    <div className={`banner banner-${tone} banner-${slot}${onClose ? ' banner-closable' : ''} ${className}`} role="status">
      <div className="banner-text">
        <span className="banner-main">{children}</span>
        {sub && <span className="banner-sub">{sub}</span>}
      </div>
      {onClose && <CloseButton onClick={onClose} label={closeLabel} />}
    </div>
  );
}
