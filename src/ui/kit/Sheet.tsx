// Panel/Sheet: the container for every panel, card and dialog. A bottom sheet on phones, a centered modal
// on larger screens; `inline` sheets (FishCard, DecorCard) have no backdrop and dock to the right on desktop.
// One close pattern everywhere: ✕ top-right, tap outside, Esc (topmost sheet only), swipe down on phones.
// Modal sheets trap focus and give it back to whatever opened them.
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Dialog } from '../overlay/Dialog';
import { Panel } from '../overlay/Panel';
import { CloseButton } from './Button';
import { pushSheet } from './sheetStack';

/** Drag distance (px) that closes a sheet when swiped down. */
const SWIPE_CLOSE_PX = 80;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export interface SheetProps {
  title: ReactNode;
  /** Omit to make the sheet undismissable (e.g. a choice the player must make). */
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra header content (wallet, badge) between the title and ✕. */
  headerExtra?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Inline: no backdrop, doesn't block the tank, docks right on desktop. */
  inline?: boolean;
  /** Dialog above other sheets (confirmations). */
  layer?: 'sheet' | 'confirm' | 'celebrate';
  /** Accessible label when the title isn't plain text. */
  ariaLabel?: string;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  /** Plain header (no purple band), e.g. celebrations. */
  plainHeader?: boolean;
  /** Changes when the content swaps (tabs) so the body scrolls back to the top. */
  scrollKey?: string;
  /** A row pinned under the header (tabs, filters) that never scrolls away. */
  tabs?: ReactNode;
  /** Panels only: false leaves the tank playable around a bottom sheet (the Decorate tray). Default true. */
  modal?: boolean;
  /** Panels only: header only (the Decorate tray folds). */
  collapsed?: boolean;
  /** Panels only: where the bottom sheet opens. */
  snap?: 'peek' | 'half' | 'full';
  /** panel (Shop, Settings…) or dialog (confirmations, celebrations: centred, always fits). Defaults by `layer`. */
  kind?: 'panel' | 'dialog';
}

/**
 * The container for every panel, card and dialog. Dialogs (kind="dialog", or any confirm/celebrate layer) are rendered by
 * the overlay system's Dialog; panels and inline cards still use the sheet below until they are migrated.
 */
export function Sheet(props: SheetProps) {
  const kind = props.kind ?? (props.layer && props.layer !== 'sheet' ? 'dialog' : 'panel');
  if (kind === 'dialog' && !props.inline) {
    return (
      <Dialog
        title={props.title}
        onClose={props.onClose}
        footer={props.footer}
        headerExtra={props.headerExtra}
        layer={props.layer}
        ariaLabel={props.ariaLabel}
        role={props.role}
        className={props.className}
        plainHeader={props.plainHeader}
        scrollKey={props.scrollKey}
      >
        {props.children}
      </Dialog>
    );
  }
  if (!props.inline) {
    return (
      <Panel
        title={props.title}
        onClose={props.onClose}
        footer={props.footer}
        headerExtra={props.headerExtra}
        tabs={props.tabs}
        ariaLabel={props.ariaLabel}
        className={props.className}
        plainHeader={props.plainHeader}
        scrollKey={props.scrollKey}
        modal={props.modal}
        collapsed={props.collapsed}
        snap={props.snap}
      >
        {props.children}
      </Panel>
    );
  }
  return <PanelSheet {...props} />;
}

function PanelSheet({
  title,
  onClose,
  children,
  footer,
  headerExtra,
  size = 'md',
  inline = false,
  layer = 'sheet',
  ariaLabel,
  role = 'dialog',
  className = '',
  plainHeader = false,
  scrollKey,
}: SheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);

  // Esc closes the topmost sheet.
  const dismissible = onClose !== undefined;
  useEffect(() => (dismissible ? pushSheet(() => closeRef.current?.()) : undefined), [dismissible]);

  // Modal: move focus in, trap Tab, restore focus on close.
  useEffect(() => {
    if (inline) return undefined;
    const sheet = sheetRef.current;
    const opener = document.activeElement as HTMLElement | null;
    const auto = sheet?.querySelector<HTMLElement>('[data-autofocus]');
    (auto ?? sheet)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !sheet) return;
      const items = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    sheet?.addEventListener('keydown', onKey);
    return () => {
      sheet?.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [inline]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  // Swipe down on the grab bar / header (phones).
  const onDragStart = (e: React.PointerEvent) => {
    if (!onClose || e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button, input')) return;
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    setDrag(Math.max(0, e.clientY - dragStart.current));
  };
  const onDragEnd = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (drag > SWIPE_CLOSE_PX) closeRef.current?.();
    setDrag(0);
  };

  const style: CSSProperties | undefined = drag > 0 ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined;
  const dragProps = { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd };

  return (
    <div
      className={`sheet-layer sheet-layer-${layer}${inline ? ' sheet-layer-inline' : ' sheet-layer-modal'}`}
      onPointerDown={(e) => {
        if (!inline && onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={sheetRef}
        className={`sheet sheet-${size}${inline ? ' sheet-inline' : ''} ${className}`}
        role={role}
        aria-modal={inline ? undefined : true}
        aria-labelledby={ariaLabel ? undefined : titleId}
        aria-label={ariaLabel}
        tabIndex={-1}
        style={style}
      >
        <div className="sheet-grab" aria-hidden="true" {...dragProps} />
        <header className={`sheet-head${plainHeader ? ' sheet-head-plain' : ''}`} {...dragProps}>
          <h2 id={titleId} className="sheet-title">
            {title}
          </h2>
          {headerExtra}
          {onClose && <CloseButton onClick={onClose} />}
        </header>
        <div className="sheet-body" ref={bodyRef}>
          {children}
        </div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </div>
  );
}
