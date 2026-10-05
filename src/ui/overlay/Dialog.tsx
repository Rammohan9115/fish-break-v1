// Dialog: confirmations and celebrations. Centred, width clamp(280px, 92vw, 400px), and it must always fit without
// scrolling (the body only scrolls as a last-resort safety on tiny screens). Rendered into the overlay root, modal:
// the rest of the app is inert, focus is trapped, Esc / backdrop / ✕ close it (unless it is undismissable).
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { OverlayFrame } from './OverlayFrame';
import { OverlayPortal } from './OverlayRoot';
import { registerOverlay } from './overlayStore';
import { useFocusTrap } from './useFocusTrap';

export interface DialogProps {
  title: ReactNode;
  /** Omit to make the dialog undismissable (a choice the player must make). */
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  /** Stacking: a normal dialog, a confirmation above panels, or a celebration. */
  layer?: 'sheet' | 'confirm' | 'celebrate';
  ariaLabel?: string;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  plainHeader?: boolean;
  scrollKey?: string;
}

export function Dialog({ title, onClose, children, footer, headerExtra, layer = 'sheet', ariaLabel, role = 'dialog', className = '', plainHeader = false, scrollKey }: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Esc: the overlay registry asks the topmost overlay to close (dialogs outrank panels).
  useEffect(() => registerOverlay(() => closeRef.current?.(), { rank: 'dialog', modal: true }), []);
  useFocusTrap(ref, true);

  return (
    <OverlayPortal>
      <div
        className={`sheet-layer sheet-layer-modal sheet-layer-${layer} ov-layer ov-layer-dialog`}
        onPointerDown={(e) => {
          if (onClose && e.target === e.currentTarget) onClose();
        }}
      >
        <section
          ref={ref}
          className={`sheet ov-dialog ${className}`}
          role={role}
          aria-modal="true"
          aria-labelledby={ariaLabel ? undefined : titleId}
          aria-label={ariaLabel}
          tabIndex={-1}
        >
          <OverlayFrame title={title} titleId={titleId} onClose={onClose} headerExtra={headerExtra} footer={footer} plainHeader={plainHeader} scrollKey={scrollKey}>
            {children}
          </OverlayFrame>
        </section>
      </div>
    </OverlayPortal>
  );
}
