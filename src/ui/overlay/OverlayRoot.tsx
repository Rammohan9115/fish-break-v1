// The one place overlays render into (inside .app, so they inherit its CSS variables). Portalling out of the parent
// sheet also fixes a bug where a dialog opened inside a transformed sheet was positioned relative to that sheet.
// While a modal overlay is open the rest of the app is made inert (no focus, no taps, hidden from screen readers).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { hasModalOverlay, useOverlayStore } from './overlayStore';

const useRoot = create<{ el: HTMLElement | null; set: (el: HTMLElement | null) => void }>()((set) => ({ el: null, set: (el) => set({ el }) }));

/** Where to portal to (null until mounted: callers then render in place). */
export function useOverlayTarget(): HTMLElement | null {
  return useRoot((s) => s.el);
}

/** Portals `children` into the overlay root (or renders them in place if there is no root, e.g. in isolation). */
export function OverlayPortal({ children }: { children: React.ReactNode }) {
  const target = useOverlayTarget();
  return target ? createPortal(children, target) : <>{children}</>;
}

/** Elements that stay interactive under a modal overlay: the overlay root itself and the toasts. */
const KEEP = ['overlay-root', 'toasts'];

export function OverlayRoot() {
  const set = useRoot((s) => s.set);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const modal = useOverlayStore((s) => hasModalOverlay(s.entries));

  useEffect(() => {
    set(node);
    return () => set(null);
  }, [node, set]);

  useEffect(() => {
    if (!modal || !node?.parentElement) return undefined;
    const app = node.parentElement;
    const inerted: Element[] = [];
    for (const child of Array.from(app.children)) {
      if (KEEP.some((c) => child.classList.contains(c)) || child.hasAttribute('inert')) continue;
      child.setAttribute('inert', '');
      inerted.push(child);
    }
    return () => {
      for (const el of inerted) el.removeAttribute('inert');
    };
  }, [modal, node]);

  return <div className="overlay-root" ref={setNode} />;
}
