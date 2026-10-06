// Applies the density (compact / regular / spacious, by available space) to the app: `data-density`, the spacing and type
// variables from `densityVars`, and --ui-zoom (the HUD and dock grow a little on big screens so they don't look tiny).
import { useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { DEFAULT_DENSITY, DESKTOP_WIDTH } from '../tokens';
import { densityVars, pickDensity, uiZoom } from './rules';
import { useScreenEnv } from './useScreenEnv';

export function useDensity(active: boolean): void {
  const { width, height } = useScreenEnv();
  const density = pickDensity({ width, height });
  const zoom = uiZoom(density, width);
  const display = useGameStore((st) => st.game.settings.display ?? DEFAULT_DENSITY);
  const wide = width >= DESKTOP_WIDTH;
  useEffect(() => {
    if (!active) return;
    const app = document.querySelector<HTMLElement>('.app');
    if (!app) return;
    app.dataset.density = density;
    for (const [name, value] of Object.entries(densityVars(density, display, wide))) app.style.setProperty(name, value);
    app.style.setProperty('--ui-zoom', String(zoom));
  }, [active, density, zoom, display, wide]);
}
