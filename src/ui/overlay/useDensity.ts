// Applies the density (compact / regular / spacious, by available space) to the app: `data-density`, the spacing and type
// variables from `densityVars`, and --ui-zoom (the HUD and dock grow a little on big screens so they don't look tiny).
import { useEffect } from 'react';
import { densityVars, pickDensity, uiZoom } from './rules';
import { useScreenEnv } from './useScreenEnv';

export function useDensity(active: boolean): void {
  const { width, height } = useScreenEnv();
  const density = pickDensity({ width, height });
  const zoom = uiZoom(density, width);
  useEffect(() => {
    if (!active) return;
    const app = document.querySelector<HTMLElement>('.app');
    if (!app) return;
    app.dataset.density = density;
    for (const [name, value] of Object.entries(densityVars(density))) app.style.setProperty(name, value);
    app.style.setProperty('--ui-zoom', String(zoom));
  }, [active, density, zoom]);
}
