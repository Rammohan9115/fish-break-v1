// The one structure every overlay shares: sticky Header (title + ✕, with an optional pinned tabs row) → Body (the ONLY
// scrolling region) → sticky Footer (primary actions always visible). Variant shells (Dialog, Sheet, SidePanel)
// position it; they never change what is inside. The classes are the established .sheet-* ones.
import { useEffect, useId, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { CloseButton } from '../kit/Button';

export interface FrameProps {
  title: ReactNode;
  onClose?: () => void;
  headerExtra?: ReactNode;
  /** A row pinned under the header (tabs, filters): it never scrolls away with the body. */
  tabs?: ReactNode;
  footer?: ReactNode;
  plainHeader?: boolean;
  /** Changes when the content swaps (tabs) so the body scrolls back to the top. */
  scrollKey?: string;
  children: ReactNode;
  /** Pointer handlers that drag the whole sheet (swipe to close), put on the grab bar and header. */
  dragProps?: HTMLAttributes<HTMLElement>;
  /** Show the drag handle (bottom sheets). */
  grab?: boolean;
  /** Id of the title element (for aria-labelledby). */
  titleId?: string;
}

/** The header, body and footer. Render inside the shell's <section>. */
export function OverlayFrame({ title, onClose, headerExtra, tabs, footer, plainHeader = false, scrollKey, children, dragProps, grab = false, titleId }: FrameProps) {
  const fallbackId = useId();
  const id = titleId ?? fallbackId;
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);
  return (
    <>
      {grab && <div className="sheet-grab" aria-hidden="true" {...dragProps} />}
      <header className={`sheet-head${plainHeader ? ' sheet-head-plain' : ''}`} {...dragProps}>
        <h2 id={id} className="sheet-title">
          {title}
        </h2>
        {headerExtra}
        {onClose && <CloseButton onClick={onClose} />}
      </header>
      {tabs && <div className="sheet-tabs">{tabs}</div>}
      <div className="sheet-body" ref={bodyRef}>
        {children}
      </div>
      {footer && <footer className="sheet-foot">{footer}</footer>}
    </>
  );
}
