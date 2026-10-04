// The one button. Variants: primary (mint), secondary (white), danger, love (breeding pink), gold
// (celebrate/onboarding), ghost (text-like) and icon (round, 44px). Press animation comes from CSS.
// A blocked button is never natively `disabled`: it stays tappable/focusable, and a tap shakes it and
// shows `disabledReason` in a tooltip, so the player always learns why.
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'love' | 'gold' | 'ghost' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** How long the "why is this blocked" tooltip stays up. */
const REASON_MS = 2600;

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container's width. */
  block?: boolean;
  /** Blocks the action. A string is shown on tap; `true` just shakes (use when the reason is already on screen). */
  disabledReason?: string | true | null;
  /** Show a pending state (blocks repeat taps). */
  busy?: boolean;
  /** Draws attention (quest / onboarding highlight). */
  pulse?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block = false, disabledReason = null, busy = false, pulse = false, className = '', onClick, children, ...rest },
  ref,
) {
  const blocked = Boolean(disabledReason) || busy;
  const [nudge, setNudge] = useState(0);
  const [showReason, setShowReason] = useState(false);

  useEffect(() => {
    if (!showReason) return;
    const id = window.setTimeout(() => setShowReason(false), REASON_MS);
    return () => window.clearTimeout(id);
  }, [showReason, nudge]);

  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    block && 'btn-block',
    blocked && 'btn-blocked',
    nudge > 0 && blocked && (nudge % 2 ? 'btn-shake-a' : 'btn-shake-b'),
    pulse && !blocked && 'btn-pulse',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      aria-disabled={blocked || undefined}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (busy) return;
        if (disabledReason) {
          setNudge((n) => n + 1);
          if (typeof disabledReason === 'string') setShowReason(true);
          return;
        }
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
      {showReason && typeof disabledReason === 'string' && <Tooltip text={disabledReason} />}
    </button>
  );
});

/** The ✕ used by every sheet, card and banner (44px target). */
export function CloseButton({ onClick, label = 'Close', className = '' }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <Button variant="icon" className={`btn-close ${className}`} onClick={onClick} aria-label={label}>
      <span aria-hidden="true">✕</span>
    </Button>
  );
}
