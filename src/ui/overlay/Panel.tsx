// Panel: the container for Shop, My Fish, Breeding, Tanks, Settings, the Decorate tray…
//  - narrow screens (portrait phones, very narrow windows): a bottom Sheet with snap points (peek 40 / half 60 / full 92 %),
//    a drag handle and swipe-down to close. Modal by default (scrim, tap outside closes, rest of the app inert).
//  - everywhere else (landscape phones, tablets, desktop, zoomed-in desktop): a SidePanel docked right,
//    width clamp(320px, 30vw, 440px). The tank, HUD and dock make room (--panel-w) so the fish stay visible and playable.
// The variant follows the screen live (resize / rotate / zoom) without remounting the content.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { OverlayFrame } from './OverlayFrame';
import { OverlayPortal } from './OverlayRoot';
import { registerOverlay } from './overlayStore';
import { panelWidth, settleSheet, SHEET_SNAPS } from './rules';
import { useFocusTrap } from './useFocusTrap';
import { useOverlayVariant, useScreenEnv } from './useScreenEnv';

export type PanelSnap = 'peek' | 'half' | 'full';
const SNAP_FRACTION: Record<PanelSnap, number> = { peek: SHEET_SNAPS[0], half: SHEET_SNAPS[1], full: SHEET_SNAPS[2] };

export interface PanelProps {
  title: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  /** Pinned under the header (tabs / filters); it never scrolls away. */
  tabs?: ReactNode;
  ariaLabel?: string;
  className?: string;
  plainHeader?: boolean;
  scrollKey?: string;
  /** Modal panels (default) dim the tank on phones and make the app inert; the Decorate tray is not modal. */
  modal?: boolean;
  /** Where the bottom sheet opens (default full). */
  snap?: PanelSnap;
  /** Header only (the Decorate tray folds like this). */
  collapsed?: boolean;
}

export function Panel({ title, onClose, children, footer, headerExtra, tabs, ariaLabel, className = '', plainHeader = false, scrollKey, modal = true, snap = 'full', collapsed = false }: PanelProps) {
  const variant = useOverlayVariant('panel');
  const { width } = useScreenEnv();
  const sheet = variant === 'sheet';
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [fraction, setFraction] = useState(SNAP_FRACTION[snap]);
  const [dragPx, setDragPx] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number } | null>(null);

  // Esc closes the topmost overlay; a modal sheet also makes the rest of the app inert.
  const dismissible = onClose !== undefined;
  useEffect(() => registerOverlay(() => closeRef.current?.(), { rank: 'panel', modal: sheet && modal }), [sheet, modal]);
  useFocusTrap(ref, sheet && modal);
  // Side panels are not modal: move focus in once, but never trap it (the tank beside it stays usable).
  useEffect(() => {
    if (sheet) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => {
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [sheet]);

  // The tank, HUD and dock make room for a docked side panel.
  useLayoutEffect(() => {
    if (sheet) return undefined;
    const app = document.querySelector<HTMLElement>('.app');
    app?.style.setProperty('--panel-w', `${panelWidth(width)}px`);
    return () => {
      app?.style.setProperty('--panel-w', '0px');
    };
  }, [sheet, width]);

  // Bottom sheet: drag the handle / header. Down past the lowest snap (or a hard flick) closes; otherwise it snaps.
  const onDragStart = (e: React.PointerEvent) => {
    if (!sheet || !dismissible || e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button, input')) return;
    const h = ref.current?.getBoundingClientRect().height ?? 0;
    drag.current = { startY: e.clientY, startH: h, lastY: e.clientY, lastT: performance.now(), v: 0 };
    setDragPx(h);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    d.v = (e.clientY - d.lastY) / Math.max(1, now - d.lastT);
    d.lastY = e.clientY;
    d.lastT = now;
    setDragPx(Math.max(40, d.startH - (e.clientY - d.startY)));
  };
  const onDragEnd = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const avail = (window.visualViewport?.height ?? window.innerHeight) * 0.98;
    const result = settleSheet((dragPx ?? d.startH) / avail, d.v);
    setDragPx(null);
    if (result === 'close') closeRef.current?.();
    else setFraction(result);
  };
  const dragProps = sheet && dismissible ? { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd } : undefined;

  const style: CSSProperties | undefined = sheet
    ? dragPx !== null
      ? { height: dragPx, transition: 'none' }
      : collapsed
        ? undefined
        : ({ '--snap': fraction } as CSSProperties)
    : undefined;

  const section = (
    <section
      ref={ref}
      className={`sheet ${sheet ? 'ov-sheet' : 'ov-sidepanel'}${collapsed ? ' ov-collapsed' : ''} ${className}`}
      role="dialog"
      aria-modal={sheet && modal ? true : undefined}
      aria-labelledby={ariaLabel ? undefined : titleId}
      aria-label={ariaLabel}
      tabIndex={-1}
      style={style}
    >
      <OverlayFrame title={title} titleId={titleId} onClose={onClose} headerExtra={headerExtra} tabs={tabs} footer={footer} plainHeader={plainHeader} scrollKey={scrollKey} grab={sheet} dragProps={dragProps}>
        {children}
      </OverlayFrame>
    </section>
  );

  return (
    <OverlayPortal>
      {sheet ? (
        <div
          className={`sheet-layer ov-layer ov-layer-sheet${modal ? ' sheet-layer-modal' : ' ov-layer-free'}`}
          onPointerDown={(e) => {
            if (modal && onClose && e.target === e.currentTarget) onClose();
          }}
        >
          {section}
        </div>
      ) : (
        section
      )}
    </OverlayPortal>
  );
}
