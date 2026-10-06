import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Self-hosted fonts (latin subset only; no request to Google).
import '@fontsource-variable/nunito/wght.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './styles.css';
import './ui/kit/kit.css';
import './ui/screens.css';
import './ui/overlay/overlay.css';
import './ui/mini.css';
import { registerServiceWorker } from './pwa';
import { applyTokens, DEFAULT_DENSITY, DESKTOP_QUERY } from './ui/tokens';

// Dev-only test hooks for e2e/screenshot scripts (stripped from production builds).
if (import.meta.env.DEV) {
  void Promise.all([
    import('./store/gameStore'),
    import('./game/testUtils'),
    import('./render/renderer'),
    import('./store/cloudSave'),
    import('./store/saveLock'),
    import('./pwa'),
  ]).then(([store, utils, renderer, cloud, lock, pwa]) => {
    (window as unknown as { __fishbowl: unknown }).__fishbowl = {
      store: store.useGameStore,
      utils,
      renderer: renderer.currentRenderer,
      // Extra stores so tests can open the overlays that only appear on cloud/PWA/lock events.
      cloud: cloud.useCloudStore,
      saveLock: lock.useSaveLock,
      pwa: pwa.usePwaStore,
    };
  });
}

// Tokens go on :root before the first paint; App re-applies them when the reduced-motion setting changes.
applyTokens(document.documentElement, window.matchMedia('(prefers-reduced-motion: reduce)').matches, DEFAULT_DENSITY, window.matchMedia(DESKTOP_QUERY).matches);

registerServiceWorker();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
