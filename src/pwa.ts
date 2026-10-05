// Service worker registration and the "new version" state. The worker precaches the app shell and sprites
// (offline start); a new build waits until the player taps Update, so nobody is reloaded mid-pet.
import { create } from 'zustand';

interface PwaStore {
  /** A new version is downloaded and waiting. */
  needRefresh: boolean;
  /** The app is cached and works offline (shown once). */
  offlineReady: boolean;
  dismiss: () => void;
  /** Activates the waiting worker and reloads. */
  update: () => void;
}

let applyUpdate: (() => Promise<void>) | null = null;

export const usePwaStore = create<PwaStore>()((set) => ({
  needRefresh: false,
  offlineReady: false,
  dismiss: () => set({ needRefresh: false, offlineReady: false }),
  update: () => void applyUpdate?.(),
}));

/** Registers the worker (production only; a no-op in dev and where service workers don't exist). */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    applyUpdate = registerSW({
      onNeedRefresh: () => usePwaStore.setState({ needRefresh: true }),
      onOfflineReady: () => usePwaStore.setState({ offlineReady: true }),
    });
  });
}
