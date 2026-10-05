// The live ScreenEnv (size from the visual viewport, input from matchMedia). Re-renders on resize, rotation, zoom and
// when a mouse or finger is attached. One shared subscription, so many overlays cost one listener set.
import { useSyncExternalStore } from 'react';
import { pickDensity, pickVariant, type Density, type OverlayKind, type OverlayVariant, type ScreenEnv } from './rules';

const SERVER: ScreenEnv = { width: 1280, height: 800, coarse: false, hover: true };

let cached: ScreenEnv | null = null;
const listeners = new Set<() => void>();
let attached = false;

function read(): ScreenEnv {
  const vv = window.visualViewport;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(vv?.height ?? window.innerHeight);
  return {
    width,
    height,
    coarse: window.matchMedia('(pointer: coarse)').matches,
    hover: window.matchMedia('(hover: hover)').matches,
  };
}

function update(): void {
  const next = read();
  if (cached && cached.width === next.width && cached.height === next.height && cached.coarse === next.coarse && cached.hover === next.hover) return;
  cached = next;
  for (const l of listeners) l();
}

function attach(): void {
  if (attached) return;
  attached = true;
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  window.visualViewport?.addEventListener('resize', update);
  window.matchMedia('(pointer: coarse)').addEventListener('change', update);
  window.matchMedia('(hover: hover)').addEventListener('change', update);
}

function subscribe(listener: () => void): () => void {
  attach();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): ScreenEnv {
  cached ??= read();
  return cached;
}

/** The current screen (size + input). */
export function useScreenEnv(): ScreenEnv {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER);
}

/** Which primitive an overlay of this kind should be right now; switches live when the window is resized. */
export function useOverlayVariant(kind: OverlayKind): OverlayVariant {
  return pickVariant(kind, useScreenEnv());
}

/** compact / regular / spacious by available space. */
export function useDensityMode(): Density {
  const { width, height } = useScreenEnv();
  return pickDensity({ width, height });
}
