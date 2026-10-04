import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './ui/kit/kit.css';
import './ui/screens.css';
import { applyTokens } from './ui/tokens';

// Dev-only test hooks for e2e/screenshot scripts (stripped from production builds).
if (import.meta.env.DEV) {
  void Promise.all([import('./store/gameStore'), import('./game/testUtils')]).then(([store, utils]) => {
    (window as unknown as { __fishbowl: unknown }).__fishbowl = { store: store.useGameStore, utils };
  });
}

// Tokens go on :root before the first paint; App re-applies them when the reduced-motion setting changes.
applyTokens(document.documentElement, window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
