// Popover: floating UI anchored to something that moves (a swimming fish, a decor piece). One shared follower: it asks
// `anchor()` for the target's box (viewport px) every frame, places itself with placePopover (flip to the side with room,
// shift to stay inside the free area, arrow pointing at the target) and calls `onLost` when the target is gone.
// The free area excludes the top row of the HUD and a docked side panel (--hud-top / --panel-w). It may float over the dock
// (a popover is transient and sits above it).
import { useEffect, useRef, type ReactNode } from 'react';
import { OverlayPortal } from './OverlayRoot';
import { registerOverlay } from './overlayStore';
import { needsReplace, placePopover, type Box, type PlacedFor, type PopoverPlacement, type PopoverSide } from './rules';

export interface PopoverProps {
  /** The target's box in viewport px, or null when it no longer exists. Called every frame. */
  anchor: () => Box | null;
  onLost?: () => void;
  /** Esc / outside handling lives with the caller; this registers the popover so Esc closes it. */
  onClose?: () => void;
  prefer?: PopoverSide;
  /** Gap (px) between the target and the popover. */
  gap?: number;
  /** Show the little arrow pointing at the target. */
  arrow?: boolean;
  /** 0 follows the target every frame (small chips). A number holds still until the target has moved that many px (cards with buttons). */
  stickiness?: number;
  className?: string;
  role?: 'dialog' | 'toolbar';
  ariaLabel?: string;
  children: ReactNode;
}

const px = (v: string): number => Number.parseFloat(v) || 0;

export function Popover({ anchor, onLost, onClose, prefer = 'top', gap = 14, arrow = true, stickiness = 0, className = '', role = 'dialog', ariaLabel, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const lostRef = useRef(onLost);
  lostRef.current = onLost;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const dismissible = onClose !== undefined;
  useEffect(() => (dismissible ? registerOverlay(() => closeRef.current?.(), { rank: 'popover', modal: false }) : undefined), [dismissible]);

  useEffect(() => {
    let raf = 0;
    let placedFor: PlacedFor | null = null;
    let place: PopoverPlacement | null = null;
    const tick = () => {
      const node = ref.current;
      const box = anchorRef.current();
      if (!box) {
        lostRef.current?.();
        return;
      }
      if (node) {
        const size = { w: node.offsetWidth, h: node.offsetHeight };
        if (!place || needsReplace(placedFor, box, size, stickiness)) {
          const cs = getComputedStyle(document.querySelector('.app') ?? document.documentElement);
          place = placePopover(box, size, { w: window.innerWidth, h: window.innerHeight }, {
            prefer,
            gap,
            inset: { top: px(cs.getPropertyValue('--hud-top')), right: px(cs.getPropertyValue('--panel-w')) },
          });
          placedFor = { cx: box.x + box.w / 2, cy: box.y + box.h / 2, w: size.w, h: size.h };
          node.style.transform = `translate(${Math.round(place.x)}px, ${Math.round(place.y)}px)`;
          node.dataset.side = place.side;
        }
        // Held in place, the arrow still points at the target (clamped to the popover's edge).
        const along = place.side === 'top' || place.side === 'bottom' ? box.x + box.w / 2 - place.x : box.y + box.h / 2 - place.y;
        const span = place.side === 'top' || place.side === 'bottom' ? size.w : size.h;
        node.style.setProperty('--arrow', `${Math.round(Math.min(span - 14, Math.max(14, along)))}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [prefer, gap, stickiness]);

  return (
    <OverlayPortal>
      <div ref={ref} className={`ov-popover ${className}`} role={role} aria-label={ariaLabel}>
        {arrow && <span className="ov-arrow" aria-hidden="true" />}
        {children}
      </div>
    </OverlayPortal>
  );
}
