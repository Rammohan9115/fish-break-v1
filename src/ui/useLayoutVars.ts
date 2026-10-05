// Publishes the real size of the HUD and the dock as CSS variables on .app, so banners, toasts, tips and cards
// always sit in the free space between them, whatever the screen:
//   --hud-stack  how far down the HUD reaches (banners start below it)
//   --dock-h     how much of the screen the dock takes from the bottom (toasts, tips, cards stay above it)
// The static values in styles.css are only the first-paint fallback.
import { useEffect } from 'react';

const HUD_PARTS = '.hud-bar, .hud-xpwrap, .hud-tank, .hud button';

/** Pure: the two variables for the given element boxes (px). Exported for tests. */
export function layoutVars(viewportH: number, hudBottoms: number[], dockTop: number | null): { hudStack: number; dockH: number | null } {
  const hudStack = Math.ceil(Math.max(0, ...hudBottoms)) + 6;
  const dockH = dockTop === null ? null : Math.max(0, Math.round(viewportH - dockTop));
  return { hudStack, dockH };
}

export function useLayoutVars(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const app = document.querySelector<HTMLElement>('.app');
    if (!app) return undefined;

    let raf = 0;
    const apply = () => {
      raf = 0;
      const hud = app.querySelector('.hud');
      const dock = app.querySelector('.dock');
      const bottoms = hud ? [...hud.querySelectorAll(HUD_PARTS)].map((el) => el.getBoundingClientRect().bottom) : [];
      const { hudStack, dockH } = layoutVars(window.innerHeight, bottoms, dock ? dock.getBoundingClientRect().top : null);
      if (bottoms.length > 0) app.style.setProperty('--hud-stack', `${hudStack}px`);
      if (dockH !== null) app.style.setProperty('--dock-h', `${dockH}px`);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    const watch = () => {
      ro.disconnect();
      for (const el of app.querySelectorAll('.hud, .dock, .dock-tools')) ro.observe(el);
    };
    watch();
    // The dock re-renders when it opens or closes; re-attach and re-measure.
    const mo = new MutationObserver(() => {
      watch();
      schedule();
    });
    mo.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [active]);
}
