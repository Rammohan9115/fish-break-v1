// Full-screen loader shown while every sprite and tank background preloads: a bubbly progress bar
// with the shell riding along its fill.
import { useEffect, useState } from 'react';
import { SAVE_KEY } from '../game/constants';
import type { DecorId, SpeciesId, ThemeId } from '../game/types';
import { LOADING_ICON_URL, preloadAssets, type PreloadPriority } from '../render/assets';

/**
 * What the first screen needs, read straight from the local save (no migration, no side effects): the active
 * tank's theme and every species and decor piece in play. A brand-new or unreadable save gets the starter set.
 */
export function savedArtPriority(storage: Pick<Storage, 'getItem'> = window.localStorage): PreloadPriority {
  const species = new Set<SpeciesId>(['danio', 'guppy']);
  const decor = new Set<DecorId>();
  let theme: ThemeId = 'classic';
  try {
    const raw = storage.getItem(SAVE_KEY);
    const game = raw ? (JSON.parse(raw) as { fish?: { speciesId: SpeciesId }[]; nursery?: { speciesId: SpeciesId }[]; eggs?: { speciesId: SpeciesId }[]; tanks?: { id: string; theme: ThemeId; decor?: { decorId: DecorId }[] }[]; activeTankId?: string }) : null;
    for (const f of [...(game?.fish ?? []), ...(game?.nursery ?? []), ...(game?.eggs ?? [])]) species.add(f.speciesId);
    const tank = game?.tanks?.find((t) => t.id === game.activeTankId) ?? game?.tanks?.[0];
    if (tank) theme = tank.theme;
    for (const t of game?.tanks ?? []) for (const d of t.decor ?? []) decor.add(d.decorId);
  } catch {
    // unreadable save: starter set
  }
  return { theme, species: [...species], decor: [...decor] };
}

/** Preloads the first screen's art (the rest follows in the background); ready when that part is done (missing files fall back to drawn art). */
export function useArtPreload(): { ready: boolean; done: number; total: number } {
  const [progress, setProgress] = useState({ ready: false, done: 0, total: 0 });
  useEffect(() => {
    let alive = true;
    preloadAssets((done, total) => {
      if (alive) setProgress((p) => ({ ...p, done, total }));
    }, savedArtPriority()).then(() => {
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
