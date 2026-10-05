// Compatibility wrappers over the overlay registry (src/ui/overlay/overlayStore.ts): Esc closes only the topmost overlay.
import { closeTopOverlay, openOverlayCount, registerOverlay } from '../overlay/overlayStore';

/** Registers a sheet's close handler; returns the unregister function. */
export function pushSheet(close: () => void): () => void {
  return registerOverlay(close);
}

/** Closes the topmost overlay. Returns false when none is open. */
export function closeTopSheet(): boolean {
  return closeTopOverlay();
}

export function openSheetCount(): number {
  return openOverlayCount();
}
