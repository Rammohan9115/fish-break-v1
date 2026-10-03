// Full-screen loader shown while every sprite and tank background preloads: a bubbly progress bar
// with the shell riding along its fill.
import { useEffect, useState } from 'react';
import { LOADING_ICON_URL, preloadAssets } from '../render/assets';

/** Preloads all art once; returns true when done (missing files fall back to drawn art). */
export function useArtPreload(): { ready: boolean; done: number; total: number } {
  const [progress, setProgress] = useState({ ready: false, done: 0, total: 0 });
  useEffect(() => {
    let alive = true;
    preloadAssets((done, total) => {
      if (alive) setProgress((p) => ({ ...p, done, total }));
    }).then(() => {
      if (alive) setProgress((p) => ({ ...p, ready: true }));
    });
    return () => {
      alive = false;
    };
  }, []);
  return progress;
}

const BAR_BUBBLES = [8, 22, 37, 51, 66, 80, 93];

export function LoadingScreen({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-fish" aria-hidden="true">
        🐟
      </div>
      <div className="loading-title">Filling the tank…</div>
      <div className="loading-track">
        <div className="loading-bar" aria-label={`Loading ${pct}%`}>
          <div className="loading-bar-fill" style={{ width: `${pct}%` }}>
            {BAR_BUBBLES.map((left, i) => (
              <span key={left} className="loading-bubble" style={{ left: `${left}%`, animationDelay: `${i * 0.37}s` }} />
            ))}
          </div>
        </div>
        <img className="loading-shell" src={LOADING_ICON_URL} alt="" aria-hidden="true" style={{ left: `${pct}%` }} />
      </div>
      <div className="loading-pct">{pct}%</div>
    </div>
  );
}
