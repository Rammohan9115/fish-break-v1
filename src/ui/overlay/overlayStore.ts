// The registry of open overlays. Every Sheet / Dialog registers on mount, so one place decides what Esc closes and which
// overlays make the rest of the app inert. (The old sheetStack.ts API is kept as a thin wrapper below.)
import { create } from 'zustand';

/** Higher closes first: a dialog beats a panel/sheet, which beats a floating card or popover. */
export type OverlayRank = 'popover' | 'panel' | 'dialog';
const RANK: Record<OverlayRank, number> = { popover: 1, panel: 2, dialog: 3 };

interface Entry {
  id: number;
  rank: OverlayRank;
  /** Blocks the rest of the app while open (dialogs). */
  modal: boolean;
  close: () => void;
}

interface OverlayState {
  entries: Entry[];
}

export const useOverlayStore = create<OverlayState>()(() => ({ entries: [] }));

let seq = 0;

/** Registers an open overlay; returns the unregister function. */
export function registerOverlay(close: () => void, opts: { rank?: OverlayRank; modal?: boolean } = {}): () => void {
  seq += 1;
  const entry: Entry = { id: seq, rank: opts.rank ?? 'panel', modal: opts.modal ?? false, close };
  useOverlayStore.setState((s) => ({ entries: [...s.entries, entry] }));
  return () => useOverlayStore.setState((s) => ({ entries: s.entries.filter((e) => e.id !== entry.id) }));
}

/** The overlay Esc should close: highest rank, newest first. */
export function topOverlay(entries: readonly Entry[]): Entry | null {
  let best: Entry | null = null;
  for (const e of entries) if (!best || RANK[e.rank] >= RANK[best.rank]) best = e;
  return best;
}

/** Closes the topmost overlay. Returns false when none is open. */
export function closeTopOverlay(): boolean {
  const top = topOverlay(useOverlayStore.getState().entries);
  if (!top) return false;
  top.close();
  return true;
}

export const openOverlayCount = (): number => useOverlayStore.getState().entries.length;
export const hasModalOverlay = (entries: readonly Entry[]): boolean => entries.some((e) => e.modal);
