// The pure rules of the overlay system: which primitive an overlay becomes on a given screen, how wide a side panel is,
// which density the screen is in, where a sheet snaps, and where a popover goes. No DOM: unit-tested for every screen.
// (The hooks in useScreenEnv.ts feed these from matchMedia / the visual viewport.)
import { sizeSet, type Density as Display } from '../tokens';

/** What the screen is like. Never derived from the user agent. */
export interface ScreenEnv {
  /** CSS px, from the visual viewport. */
  width: number;
  height: number;
  /** A touch-first device (`pointer: coarse`). */
  coarse: boolean;
  /** Can hover (`hover: hover`): a mouse or trackpad. */
  hover: boolean;
}

/**
 * What an overlay IS (its role), as opposed to the primitive it is shown with.
 *  panel  = a browse/manage window (Shop, My Fish, Breeding, Tanks, Settings)
 *  dock   = a tool you use WITH the tank visible (the Decorate tray)
 *  card   = info about a thing in the tank (fish, decor piece)
 *  dialog = a confirmation or celebration
 */
export type OverlayKind = 'panel' | 'dock' | 'card' | 'dialog';
export type OverlayVariant = 'sheet' | 'window' | 'sidepanel' | 'popover' | 'dialog';

export const OVERLAY_BREAKPOINTS = {
  /** Below this CSS width panels and cards are bottom sheets (portrait phones, very narrow windows). */
  sheetBelow: 600,
  /** Popovers need room next to the thing they point at. */
  popoverMinWidth: 600,
} as const;

/**
 * panel  → bottom Sheet on narrow screens, otherwise a big centred Window (frosted glass over the scene, like a game menu).
 * dock   → bottom Sheet on narrow screens, otherwise a SidePanel docked right (the tank stays visible and playable beside it).
 * card   → anchored Popover for a mouse on a wide screen; a docked SidePanel for a finger on a wide screen (tablet,
 *          landscape phone: the fish stay visible beside it); a bottom Sheet on narrow screens.
 * dialog → always a centred Dialog.
 */
export function pickVariant(kind: OverlayKind, env: ScreenEnv): OverlayVariant {
  if (kind === 'dialog') return 'dialog';
  const narrow = env.width < OVERLAY_BREAKPOINTS.sheetBelow;
  if (kind === 'panel') return narrow ? 'sheet' : 'window';
  if (kind === 'dock') return narrow ? 'sheet' : 'sidepanel';
  if (narrow) return 'sheet';
  return env.hover && !env.coarse && env.width >= OVERLAY_BREAKPOINTS.popoverMinWidth ? 'popover' : 'sidepanel';
}

export const PANEL_WIDTH = { min: 320, vw: 0.3, max: 440 } as const;

/** Side panel width: clamp(320px, 30vw, 440px). */
export function panelWidth(viewportWidth: number): number {
  return Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, Math.round(viewportWidth * PANEL_WIDTH.vw)));
}

/** The big window: width and height as fractions of the screen (and absolute caps), by size. */
export const WINDOW_SIZES = {
  lg: { w: 1120, h: 860 },
  md: { w: 820, h: 760 },
  sm: { w: 560, h: 720 },
} as const;
export const WINDOW_MARGIN = { w: 0.94, h: 0.88 } as const;

/** Size of a centred window on this screen: at most the cap for its size, at most 94 % × 88 % of the screen. */
export function windowSize(size: keyof typeof WINDOW_SIZES, viewport: { width: number; height: number }): { w: number; h: number } {
  const cap = WINDOW_SIZES[size];
  return { w: Math.round(Math.min(cap.w, viewport.width * WINDOW_MARGIN.w)), h: Math.round(Math.min(cap.h, viewport.height * WINDOW_MARGIN.h)) };
}

/** Share of the screen's width the tank keeps next to a side panel. */
export function tankShareBesidePanel(viewportWidth: number): number {
  return (viewportWidth - panelWidth(viewportWidth)) / viewportWidth;
}

/** Dialog width: clamp(280px, 92vw, 400px). */
export function dialogWidth(viewportWidth: number): number {
  return Math.min(400, Math.max(280, Math.round(viewportWidth * 0.92)));
}

export type Density = 'compact' | 'regular' | 'spacious';

/** By available space, never by device name: compact < 400 w or < 700 h; spacious ≥ 1600 w; otherwise regular. */
export function pickDensity(size: { width: number; height: number }): Density {
  if (size.width < 400 || size.height < 700) return 'compact';
  if (size.width >= 1600) return 'spacious';
  return 'regular';
}

/** How much each density scales spacing and type (relative to the regular tokens). */
const DENSITY_SCALE: Record<Density, { space: number; text: number }> = {
  compact: { space: 0.85, text: 1 },
  regular: { space: 1, text: 1 },
  spacious: { space: 1.12, text: 1.15 },
};

/** Type never goes above these (huge screens): body ≤ 18px, labels ≤ 14px. The floor is the display set's own size (compact: body 14, labels 12). */
const TEXT_CAPS: Record<string, number> = { label: 14, small: 16, body: 18, md: 20, lg: 24, xl: 30, hero: 42 };

/**
 * CSS custom properties for a screen density: the spacing scale and the type scale, derived from the base tokens of the chosen
 * display ("comfortable" = the original sizes, "compact" = the tighter scale; `wide` picks the compact scale's desktop step).
 * With the compact display the small-screen density never shrinks spacing further (the 4px base unit stays).
 */
export function densityVars(density: Density, display: Display = 'comfortable', wide = false): Record<string, string> {
  const k = DENSITY_SCALE[density];
  const base = sizeSet(display, wide);
  const spaceK = display === 'compact' ? Math.max(1, k.space) : k.space;
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(base.space)) vars[`--space-${name}`] = `${Math.round(Number.parseFloat(value) * spaceK)}px`;
  for (const [name, value] of Object.entries(base.text)) {
    const floor = Number.parseFloat(value);
    const cap = Math.max(floor, TEXT_CAPS[name] ?? Infinity);
    vars[`--text-${name}`] = `${Math.min(cap, Math.max(floor, Math.round(floor * k.text)))}px`;
  }
  return vars;
}

/** The HUD and dock are drawn in px, so on big screens they would shrink to nothing: scale them (never below 1, at most 1.35). */
export function uiZoom(density: Density, width: number): number {
  return density === 'spacious' ? Math.min(1.35, Math.max(1, +(1 + (width - 1500) / 3000).toFixed(2))) : 1;
}

/** Sheet snap points as fractions of the available height: peek, half, full. */
export const SHEET_SNAPS = [0.4, 0.6, 0.92] as const;

/**
 * Where a dragged sheet settles. `fraction` is its visible height / available height after the drag,
 * `velocity` is the recent downward speed (px/ms, positive = down). Dragged below a quarter, or flicked down hard from
 * the lowest snap, it closes.
 */
export function settleSheet(fraction: number, velocity = 0): number | 'close' {
  const lowest = SHEET_SNAPS[0];
  if (fraction < lowest * 0.62 || (velocity > 0.9 && fraction <= lowest + 0.05)) return 'close';
  // A fast flick moves one snap in its direction before measuring the nearest.
  const biased = velocity > 0.9 ? fraction - 0.12 : velocity < -0.9 ? fraction + 0.12 : fraction;
  let best: number = SHEET_SNAPS[0];
  for (const s of SHEET_SNAPS) if (Math.abs(s - biased) < Math.abs(best - biased)) best = s;
  return best;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PopoverSide = 'top' | 'bottom' | 'left' | 'right';

export interface PopoverPlacement {
  x: number;
  y: number;
  side: PopoverSide;
  /** Where the arrow sits along the popover edge facing the anchor, in px from the popover's left (top/bottom) or top (left/right). */
  arrow: number;
}

/**
 * Places a popover next to `anchor`: on the preferred side if it fits, else flipped to the opposite side (or whichever
 * side has more room), then shifted along the edge so it stays inside the viewport (`pad` from each edge). The arrow keeps
 * pointing at the anchor's centre even after shifting.
 */
export function placePopover(
  anchor: Box,
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  opts: { gap?: number; pad?: number; prefer?: PopoverSide; inset?: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>> } = {},
): PopoverPlacement {
  const gap = opts.gap ?? 12;
  const pad = opts.pad ?? 8;
  const prefer = opts.prefer ?? 'bottom';
  // Keep-out areas (the HUD at the top, the dock at the bottom, a docked panel on the right) shrink the usable region.
  const minX = (opts.inset?.left ?? 0) + pad;
  const minY = (opts.inset?.top ?? 0) + pad;
  const maxX = viewport.w - (opts.inset?.right ?? 0) - pad;
  const maxY = viewport.h - (opts.inset?.bottom ?? 0) - pad;
  const room: Record<PopoverSide, number> = {
    top: anchor.y - minY,
    bottom: maxY - (anchor.y + anchor.h),
    left: anchor.x - minX,
    right: maxX - (anchor.x + anchor.w),
  };
  const need = (s: PopoverSide) => (s === 'top' || s === 'bottom' ? size.h : size.w) + gap;
  const opposite: Record<PopoverSide, PopoverSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  let side = prefer;
  if (room[side] < need(side)) {
    const flipped = opposite[side];
    side = room[flipped] >= need(flipped) || room[flipped] > room[side] ? flipped : side;
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const ax = anchor.x + anchor.w / 2;
  const ay = anchor.y + anchor.h / 2;
  let x: number;
  let y: number;
  let arrow: number;
  if (side === 'top' || side === 'bottom') {
    x = clamp(ax - size.w / 2, minX, maxX - size.w);
    y = side === 'bottom' ? anchor.y + anchor.h + gap : anchor.y - gap - size.h;
    arrow = clamp(ax - x, 14, size.w - 14);
  } else {
    y = clamp(ay - size.h / 2, minY, maxY - size.h);
    x = side === 'right' ? anchor.x + anchor.w + gap : anchor.x - gap - size.w;
    arrow = clamp(ay - y, 14, size.h - 14);
  }
  // As a last resort keep the whole thing inside the usable region even if it overlaps the anchor.
  x = clamp(x, minX, maxX - size.w);
  y = clamp(y, minY, maxY - size.h);
  return { x, y, side, arrow };
}

/** What a popover remembers about where it was last placed. */
export interface PlacedFor {
  /** The anchor's centre when it was placed. */
  cx: number;
  cy: number;
  /** The popover's size when it was placed. */
  w: number;
  h: number;
}

/**
 * Whether a popover must be placed again. A tight follower (stickiness 0) re-places every frame; a sticky one (a card with
 * buttons you are about to tap) holds still until its target has moved `stickiness` px or the popover changed size
 * (a tab switch), so a swimming fish never moves the buttons under your finger.
 */
export function needsReplace(prev: PlacedFor | null, anchor: Box, size: { w: number; h: number }, stickiness: number): boolean {
  if (!prev || stickiness <= 0) return true;
  if (prev.w !== size.w || prev.h !== size.h) return true;
  return Math.hypot(anchor.x + anchor.w / 2 - prev.cx, anchor.y + anchor.h / 2 - prev.cy) >= stickiness;
}
