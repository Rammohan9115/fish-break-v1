// Full-screen loader shown while the fish sprites and tank backgrounds preload.
import { useEffect, useState } from 'react';
import { preloadArt } from '../render/sprites';

/** Preloads all art once; returns true when done (missing files fall back to drawn art). */
export function useArtPreload(): { ready: boolean; done: number; total: number } {
  const [progress, setProgress] = useState({ ready: false, done: 0, total: 0 });
  useEffect(() => {
    let alive = true;
    preloadArt((done, total) => {
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

export function LoadingScreen({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-fish" aria-hidden="true">
        🐟
      </div>
      <div className="loading-title">Filling the tank…</div>
      <div className="loading-bar" aria-label={`Loading ${pct}%`}>
        <div className="loading-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
