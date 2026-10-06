// Mini Tank: the live tank floats in an always-on-top window while you work in other apps.
//  - Chrome/Edge: Document Picture-in-Picture. The tank canvas itself moves into the PiP window (one game, one renderer),
//    which interacts normally. Panels never open there: they show an "Open in game" hint instead.
//  - Others: canvas.captureStream() into a hidden <video> and video Picture-in-Picture (view only).
import { create } from 'zustand';
import { SIM_TICK_MS } from '../game/constants';
import { sound } from '../audio/sound';
import type { Renderer } from '../render/renderer';
import { useGameStore } from '../store/gameStore';
import { isSaveLocked } from '../store/saveLock';
import { applyTokens, DEFAULT_DENSITY } from '../ui/tokens';
import { moveNode, type ChildLike, type ParentLike } from './canvasMove';

export type MiniKind = 'document' | 'video';

/** Frames per second the floating tank draws at (it runs all day beside work apps). */
export const MINI_FPS = 30;
export const MINI_SIZE = { width: 400, height: 260 } as const;
/** How long the "Open in game" hint stays up. */
const HINT_MS = 4000;

interface DocumentPip {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

type CaptureCanvas = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
type PipVideo = HTMLVideoElement & { webkitSetPresentationMode?: (mode: string) => void };

const docPip = (): DocumentPip | null => (typeof window !== 'undefined' && 'documentPictureInPicture' in window ? (window as unknown as { documentPictureInPicture: DocumentPip }).documentPictureInPicture : null);

/** 'document' = interactive window, 'video' = view-only fallback, null = neither (hide the button). */
export function miniSupport(): MiniKind | null {
  if (typeof window === 'undefined') return null;
  // A floating window beside other apps only makes sense with a mouse on a desktop.
  if (typeof window.matchMedia === 'function' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return null;
  if (docPip()) return 'document';
  const canvasOk = typeof HTMLCanvasElement !== 'undefined' && typeof (HTMLCanvasElement.prototype as CaptureCanvas).captureStream === 'function';
  const videoOk = typeof document !== 'undefined' && (document.pictureInPictureEnabled === true || 'webkitSetPresentationMode' in document.createElement('video'));
  return canvasOk && videoOk ? 'video' : null;
}

export const VIEW_ONLY_TIP = 'View-only here — use Chrome or Edge for an interactive mini tank.';

interface MiniState {
  /** null while the tank is in the main page. */
  kind: MiniKind | null;
  /** The floating window and the element React portals the mini controls into (document kind only). */
  win: Window | null;
  host: HTMLElement | null;
  /** A hint shown over the floating tank ("Open in game ↗"). */
  hint: { text: string; onOpen: () => void } | null;
}

export const useMiniTank = create<MiniState>(() => ({ kind: null, win: null, host: null, hint: null }));

export const isFloating = (): boolean => useMiniTank.getState().kind === 'document';

export interface TankHandle {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  /** The element the canvas lives in on the main page (its size drives the renderer there). */
  container: HTMLElement;
}

let handle: TankHandle | null = null;
let teardown: (() => void) | null = null;
let hintTimer: number | null = null;

/** TankView calls this once its renderer exists; closing the floating tank first if it unmounts. */
export function registerTank(h: TankHandle): () => void {
  handle = h;
  return () => {
    closeMini();
    if (handle === h) handle = null;
  };
}

/** Copies the page's styles and the root's token variables/attributes into the floating document. */
function copyPageInto(win: Window): void {
  for (const node of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
    const copy = node.cloneNode(true) as HTMLElement;
    if (copy instanceof HTMLLinkElement) copy.href = (node as HTMLLinkElement).href;
    win.document.head.appendChild(copy);
  }
  syncRoot(win);
}

/** Applies the size/color/motion tokens to the floating document's root (the compact scale's phone step: it is a small window). */
export function syncRoot(win: Window): void {
  const g = useGameStore.getState().game.settings;
  applyTokens(win.document.documentElement, g.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches, g.display ?? DEFAULT_DENSITY, false);
}

function sizeToHost(h: TankHandle, w: number, hgt: number): void {
  if (w > 0 && hgt > 0) h.renderer.resize(w, hgt);
}

async function openDocument(h: TankHandle): Promise<void> {
  const api = docPip();
  if (!api) return;
  const win = await api.requestWindow({ ...MINI_SIZE });
  // Clicking Mini Tank twice quickly can race: only one floating window at a time.
  if (teardown) {
    win.close();
    return;
  }
  copyPageInto(win);
  win.document.title = 'Fishbowl Break · Mini Tank';
  const root = win.document.createElement('div');
  root.className = 'mini-root';
  const stage = win.document.createElement('div');
  stage.className = 'mini-stage';
  const host = win.document.createElement('div');
  host.className = 'mini-host';
  root.append(stage, host);
  win.document.body.append(root);

  const restoreCanvas = moveNode(h.canvas as unknown as ChildLike, stage as unknown as ParentLike);
  h.renderer.setHostWindow(win);
  h.renderer.setLowPower(MINI_FPS);
  sizeToHost(h, stage.clientWidth || MINI_SIZE.width, stage.clientHeight || MINI_SIZE.height);
  // The floating window's own observer: the main window's observer doesn't see layout in another document.
  const ro = new (win as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver(([entry]) => {
    if (entry) sizeToHost(h, entry.contentRect.width, entry.contentRect.height);
  });
  ro.observe(stage);
  const onVisibility = () => h.renderer.setPaused(win.document.hidden);
  win.document.addEventListener('visibilitychange', onVisibility);
  // The main tab is hidden while you work elsewhere (its timers slow to a crawl), so the floating window also drives the sim clock.
  const sim = win.setInterval(() => {
    if (!isSaveLocked()) useGameStore.getState().advanceTo(Date.now());
  }, SIM_TICK_MS);
  // Audio plays from the main page; a click in this window is a gesture too.
  const unlock = () => sound.unlock();
  win.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  win.addEventListener('keydown', unlock, { capture: true, passive: true });
  win.addEventListener('keydown', onPipKey);
  win.addEventListener('pagehide', closeMini);

  teardown = () => {
    win.removeEventListener('pagehide', closeMini);
    win.removeEventListener('keydown', onPipKey);
    win.clearInterval(sim);
    win.document.removeEventListener('visibilitychange', onVisibility);
    ro.disconnect();
    restoreCanvas();
    h.renderer.setHostWindow(window);
    h.renderer.setLowPower(null);
    h.renderer.setPaused(false);
    h.renderer.setPointer(null);
    const r = h.container.getBoundingClientRect();
    sizeToHost(h, r.width, r.height);
    try {
      win.close();
    } catch {
      // Already closed.
    }
    useMiniTank.setState({ kind: null, win: null, host: null, hint: null });
  };
  useMiniTank.setState({ kind: 'document', win, host });
}

/** A worker's timer isn't slowed in a hidden tab, so it can keep the video fallback's canvas drawing. */
function startWorkerClock(onTick: () => void, ms: number): () => void {
  const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: 'text/javascript' }));
  const worker = new Worker(url);
  worker.onmessage = onTick;
  return () => {
    worker.terminate();
    URL.revokeObjectURL(url);
  };
}

async function openVideo(h: TankHandle): Promise<void> {
  const canvas = h.canvas as CaptureCanvas;
  if (!canvas.captureStream) return;
  const video = document.createElement('video') as PipVideo;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = canvas.captureStream(MINI_FPS);
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(video);
  await video.play();
  h.renderer.setLowPower(MINI_FPS);
  h.renderer.setExternalDriver(true);
  const stopClock = startWorkerClock(() => h.renderer.tickExternal(), Math.round(1000 / MINI_FPS));
  const end = () => {
    video.removeEventListener('leavepictureinpicture', end);
    stopClock();
    h.renderer.setExternalDriver(false);
    h.renderer.setLowPower(null);
    video.srcObject = null;
    video.remove();
    teardown = null;
    useMiniTank.setState({ kind: null });
  };
  video.addEventListener('leavepictureinpicture', end);
  teardown = () => {
    if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => undefined);
    else end();
  };
  try {
    if (video.requestPictureInPicture) await video.requestPictureInPicture();
    else video.webkitSetPresentationMode?.('picture-in-picture');
  } catch (err) {
    end();
    throw err;
  }
  useMiniTank.setState({ kind: 'video' });
}

/** Must be called from a click or key press (the browser requires a user gesture). Resolves false when it couldn't open. */
export async function openMini(): Promise<boolean> {
  const h = handle;
  const support = miniSupport();
  if (!h || !support || teardown) return false;
  try {
    if (support === 'document') await openDocument(h);
    else await openVideo(h);
    return useMiniTank.getState().kind !== null;
  } catch {
    // Declined or blocked: the tank simply stays where it is.
    return false;
  }
}

/** Brings the tank back to the main page (also runs when the floating window is closed with its ✕). */
export function closeMini(): void {
  const t = teardown;
  teardown = null;
  if (hintTimer !== null) window.clearTimeout(hintTimer);
  hintTimer = null;
  t?.();
}

export function toggleMini(): void {
  if (teardown) closeMini();
  else void openMini();
}

function onPipKey(e: KeyboardEvent): void {
  if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
    e.preventDefault();
    closeMini();
  }
}

/** Something in the floating tank would open a panel: say so, and let a click carry it over to the main tab. */
export function showOpenInGameHint(onOpen: () => void = () => undefined): void {
  useMiniTank.setState({ hint: { text: 'Open in game ↗', onOpen } });
  if (hintTimer !== null) window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => useMiniTank.setState({ hint: null }), HINT_MS);
}

/** Runs the hint's action and tries to focus the main tab (browsers may only allow the focus after a user gesture there). */
export function openInGame(): void {
  const hint = useMiniTank.getState().hint;
  hint?.onOpen();
  useMiniTank.setState({ hint: null });
  window.focus();
}

/** Re-applies tokens on the floating document when the display or motion settings change. */
export function syncMiniTokens(): void {
  const win = useMiniTank.getState().win;
  if (win) syncRoot(win);
}
