// The pure rules of the overlay system: which primitive an overlay becomes on a given screen, how wide a side panel is,
// which density the screen is in, where a sheet snaps, and where a popover goes. No DOM: unit-tested for every screen.
// (The hooks in useOverlayVariant.ts feed these from matchMedia / the visual viewport.)

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

/** What an overlay IS (its role), as opposed to the primitive it is shown with. */
export type OverlayKind = 'panel' | 'card' | 'dialog';
export type OverlayVariant = 'sheet' | 'sidepanel' | 'popover' | 'dialog';

export const OVERLAY_BREAKPOINTS = {
  /** Below this CSS width panels and cards are bottom sheets (portrait phones, very narrow windows). */
  sheetBelow: 600,
  /** Popovers need room next to the thing they point at. */
  popoverMinWidth: 600,
} as const;

/**
 * panel  → bottom Sheet on narrow screens, otherwise a SidePanel (landscape phones, tablets, desktop, zoomed-in desktop).
 * card   → anchored Popover for a mouse on a wide screen, otherwise a Sheet.
 * dialog → always a centred Dialog.
 */
export function pickVariant(kind: OverlayKind, env: ScreenEnv): OverlayVariant {
  if (kind === 'dialog') return 'dialog';
  if (kind === 'panel') return env.width < OVERLAY_BREAKPOINTS.sheetBelow ? 'sheet' : 'sidepanel';
  return env.hover && !env.coarse && env.width >= OVERLAY_BREAKPOINTS.popoverMinWidth ? 'popover' : 'sheet';
}

export const PANEL_WIDTH = { min: 320, vw: 0.3, max: 440 } as const;

/** Side panel width: clamp(320px, 30vw, 440px). */
export function panelWidth(viewportWidth: number): number {
  return Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, Math.round(viewportWidth * PANEL_WIDTH.vw)));
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

/** Per-density sizing used to set CSS custom properties (spacing scale, body type, icon size). Type never exceeds 18px. */
export const DENSITY_TOKENS: Record<Density, { space: number; body: number; label: number; icon: number }> = {
  compact: { space: 0.85, body: 14, label: 12, icon: 20 },
  regular: { space: 1, body: 15, label: 12, icon: 24 },
  spacious: { space: 1.15, body: 17, label: 13, icon: 28 },
};

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
export function placePopover(anchor: Box, size: { w: number; h: number }, viewport: { w: number; h: number }, opts: { gap?: number; pad?: number; prefer?: PopoverSide } = {}): PopoverPlacement {
  const gap = opts.gap ?? 12;
  const pad = opts.pad ?? 8;
  const prefer = opts.prefer ?? 'bottom';
  const room: Record<PopoverSide, number> = {
    top: anchor.y - pad,
    bottom: viewport.h - (anchor.y + anchor.h) - pad,
    left: anchor.x - pad,
    right: viewport.w - (anchor.x + anchor.w) - pad,
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
    x = clamp(ax - size.w / 2, pad, viewport.w - size.w - pad);
    y = side === 'bottom' ? anchor.y + anchor.h + gap : anchor.y - gap - size.h;
    arrow = clamp(ax - x, 14, size.w - 14);
  } else {
    y = clamp(ay - size.h / 2, pad, viewport.h - size.h - pad);
    x = side === 'right' ? anchor.x + anchor.w + gap : anchor.x - gap - size.w;
    arrow = clamp(ay - y, 14, size.h - 14);
  }
  // As a last resort keep the whole thing on screen even if it overlaps the anchor.
  x = clamp(x, pad, viewport.w - size.w - pad);
  y = clamp(y, pad, viewport.h - size.h - pad);
  return { x, y, side, arrow };
}
