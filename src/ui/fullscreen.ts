// Fullscreen helpers. iPhone Safari has no element fullscreen; there, "Add to Home Screen" runs the
// game fullscreen via the web-app meta tags in index.html.

export function fullscreenSupported(): boolean {
  return typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function';
}

export function enterFullscreen(): void {
  if (!fullscreenSupported() || document.fullscreenElement) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
}

export function exitFullscreen(): void {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) exitFullscreen();
  else enterFullscreen();
}

/** Phones/tablets held sideways: go fullscreen on the first tap (browsers require a user gesture). */
export function isTouchLandscape(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(orientation: landscape) and (pointer: coarse)').matches;
}

/** iPhone/iPad (including iPadOS, which reports itself as a Mac with touch). */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Launched from the Home Screen (no browser UI). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
}
