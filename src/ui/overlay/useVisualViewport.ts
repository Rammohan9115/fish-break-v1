// Publishes the visual viewport as CSS variables on :root so overlays stay above the on-screen keyboard and inside the
// zoomed area: --vvh (height), --vv-top (offset) and --kb (keyboard inset). Focused inputs are scrolled into view.
import { useEffect } from 'react';

export function useVisualViewportVars(): void {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const apply = () => {
      const h = vv?.height ?? window.innerHeight;
      const top = vv?.offsetTop ?? 0;
      root.style.setProperty('--vvh', `${Math.round(h)}px`);
      root.style.setProperty('--vv-top', `${Math.round(top)}px`);
      root.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - h - top))}px`);
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    // When the keyboard opens the viewport shrinks: keep the focused field visible inside its overlay body.
    let timer = 0;
    const onFocus = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (!el.closest('.sheet-body')) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    };
    document.addEventListener('focusin', onFocus);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      document.removeEventListener('focusin', onFocus);
      window.clearTimeout(timer);
    };
  }, []);
}
