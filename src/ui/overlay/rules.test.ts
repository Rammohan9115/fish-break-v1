import { describe, expect, it } from 'vitest';
import { densityVars, dialogWidth, needsReplace, pickDensity, pickVariant, placePopover, panelWidth, settleSheet, SHEET_SNAPS, tankShareBesidePanel, uiZoom, type ScreenEnv } from './rules';

const env = (width: number, height: number, mode: 'touch' | 'mouse'): ScreenEnv => ({ width, height, coarse: mode === 'touch', hover: mode === 'mouse' });

describe('pickVariant', () => {
  it('dialogs are always dialogs', () => {
    for (const e of [env(360, 640, 'touch'), env(1920, 1080, 'mouse')]) expect(pickVariant('dialog', e)).toBe('dialog');
  });

  it('panels are bottom sheets on narrow screens and side panels everywhere else', () => {
    expect(pickVariant('panel', env(390, 844, 'touch'))).toBe('sheet');
    expect(pickVariant('panel', env(360, 640, 'touch'))).toBe('sheet');
    expect(pickVariant('panel', env(844, 390, 'touch'))).toBe('sidepanel'); // landscape phone
    expect(pickVariant('panel', env(820, 1180, 'touch'))).toBe('sidepanel'); // tablet portrait
    expect(pickVariant('panel', env(1366, 768, 'mouse'))).toBe('sidepanel');
    expect(pickVariant('panel', env(911, 512, 'mouse'))).toBe('sidepanel'); // 1366×768 at 150% zoom
  });

  it('cards: a popover for a mouse on a wide screen, a docked panel for a finger on a wide screen, a sheet when narrow', () => {
    expect(pickVariant('card', env(1366, 768, 'mouse'))).toBe('popover');
    expect(pickVariant('card', env(1180, 820, 'touch'))).toBe('sidepanel'); // a tablet finger: docked, the fish stay visible
    expect(pickVariant('card', env(844, 390, 'touch'))).toBe('sidepanel'); // landscape phone
    expect(pickVariant('card', env(390, 844, 'touch'))).toBe('sheet');
    expect(pickVariant('card', env(500, 700, 'mouse'))).toBe('sheet'); // a very narrow window
  });

  it('is decided by size and input, not by device name: same size, different input → different result', () => {
    expect(pickVariant('card', env(1024, 768, 'mouse'))).not.toBe(pickVariant('card', env(1024, 768, 'touch')));
  });
});

describe('sizes', () => {
  it('side panel width is clamp(320px, 30vw, 440px)', () => {
    expect(panelWidth(600)).toBe(320);
    expect(panelWidth(1180)).toBe(354);
    expect(panelWidth(1920)).toBe(440);
    expect(panelWidth(2560)).toBe(440);
  });

  it('the tank keeps at least 55% of the width beside a panel on any screen 800px wide or more', () => {
    for (const w of [800, 820, 844, 911, 1180, 1280, 1366, 1440, 1536, 1920, 2560]) expect(tankShareBesidePanel(w)).toBeGreaterThanOrEqual(0.55);
  });

  it('dialog width is clamp(280px, 92vw, 400px)', () => {
    expect(dialogWidth(320)).toBe(294);
    expect(dialogWidth(360)).toBe(331);
    expect(dialogWidth(390)).toBe(359);
    expect(dialogWidth(1920)).toBe(400);
    expect(dialogWidth(200)).toBe(280);
  });
});

describe('pickDensity', () => {
  it('compact for small phones and short windows (incl. zoomed desktops), spacious for big screens', () => {
    expect(pickDensity({ width: 375, height: 667 })).toBe('compact');
    expect(pickDensity({ width: 390, height: 844 })).toBe('compact'); // < 400 wide
    expect(pickDensity({ width: 911, height: 512 })).toBe('compact'); // 1366×768 @150%
    expect(pickDensity({ width: 1366, height: 768 })).toBe('regular');
    expect(pickDensity({ width: 820, height: 1180 })).toBe('regular');
    expect(pickDensity({ width: 1920, height: 1080 })).toBe('spacious');
    expect(pickDensity({ width: 2560, height: 1440 })).toBe('spacious');
  });
});

describe('settleSheet', () => {
  it('snaps to the nearest of peek / half / full', () => {
    expect(settleSheet(0.45)).toBe(SHEET_SNAPS[0]);
    expect(settleSheet(0.58)).toBe(SHEET_SNAPS[1]);
    expect(settleSheet(0.9)).toBe(SHEET_SNAPS[2]);
  });

  it('closes when dragged low, or flicked down from the lowest snap', () => {
    expect(settleSheet(0.1)).toBe('close');
    expect(settleSheet(0.4, 1.2)).toBe('close');
    expect(settleSheet(0.9, 1.2)).not.toBe('close');
  });

  it('a fast flick up goes one snap higher', () => {
    expect(settleSheet(0.5, -1.5)).toBe(SHEET_SNAPS[1]);
  });
});

describe('placePopover', () => {
  const viewport = { w: 1366, h: 768 };
  const size = { w: 300, h: 260 };

  it('sits on the preferred side when it fits, centred on the anchor, arrow in the middle', () => {
    const p = placePopover({ x: 600, y: 200, w: 40, h: 40 }, size, viewport, { prefer: 'bottom' });
    expect(p.side).toBe('bottom');
    expect(p.y).toBeGreaterThan(240);
    expect(p.x).toBe(600 + 20 - 150);
    expect(p.arrow).toBe(150);
  });

  it('flips to the other side when there is no room', () => {
    const p = placePopover({ x: 600, y: 650, w: 40, h: 40 }, size, viewport, { prefer: 'bottom' });
    expect(p.side).toBe('top');
    expect(p.y + size.h).toBeLessThanOrEqual(650);
  });

  it('shifts to stay on screen at the edges and keeps the arrow on the anchor', () => {
    const left = placePopover({ x: 4, y: 300, w: 40, h: 40 }, size, viewport);
    expect(left.x).toBe(8);
    expect(left.arrow).toBeLessThan(size.w / 2);
    const right = placePopover({ x: 1330, y: 300, w: 40, h: 40 }, size, viewport);
    expect(right.x + size.w).toBeLessThanOrEqual(viewport.w - 8);
    expect(right.arrow).toBeGreaterThan(size.w / 2);
  });

  it('always lands fully inside the viewport, for anchors all over the screen', () => {
    for (let ax = 0; ax <= 1366; ax += 137) {
      for (let ay = 0; ay <= 768; ay += 96) {
        for (const prefer of ['top', 'bottom', 'left', 'right'] as const) {
          const p = placePopover({ x: ax, y: ay, w: 36, h: 36 }, size, viewport, { prefer });
          expect(p.x).toBeGreaterThanOrEqual(8);
          expect(p.y).toBeGreaterThanOrEqual(8);
          expect(p.x + size.w).toBeLessThanOrEqual(viewport.w - 8);
          expect(p.y + size.h).toBeLessThanOrEqual(viewport.h - 8);
        }
      }
    }
  });

  it('keep-out insets (HUD above, dock below, a docked panel on the right) are respected', () => {
    const inset = { top: 80, right: 400, bottom: 90 };
    for (let ax = 0; ax <= 1366; ax += 137) {
      for (let ay = 0; ay <= 768; ay += 96) {
        const p = placePopover({ x: ax, y: ay, w: 36, h: 36 }, size, viewport, { inset });
        expect(p.y).toBeGreaterThanOrEqual(80 + 8);
        expect(p.y + size.h).toBeLessThanOrEqual(768 - 90 - 8);
        expect(p.x + size.w).toBeLessThanOrEqual(1366 - 400 - 8);
      }
    }
  });

  it('a side-placed popover points its arrow at the anchor centre', () => {
    const p = placePopover({ x: 300, y: 400, w: 40, h: 40 }, size, viewport, { prefer: 'right' });
    expect(p.side).toBe('right');
    expect(p.x).toBe(300 + 40 + 12);
    expect(p.y + p.arrow).toBe(420);
  });
});

describe('needsReplace (sticky popovers)', () => {
  const anchor = { x: 400, y: 300, w: 40, h: 30 };
  const size = { w: 300, h: 260 };
  const prev = { cx: 420, cy: 315, w: 300, h: 260 };

  it('a tight follower always re-places; the first placement is always needed', () => {
    expect(needsReplace(prev, anchor, size, 0)).toBe(true);
    expect(needsReplace(null, anchor, size, 140)).toBe(true);
  });

  it('a sticky popover holds still while its target stays close', () => {
    expect(needsReplace(prev, { ...anchor, x: anchor.x + 60 }, size, 140)).toBe(false);
    expect(needsReplace(prev, { ...anchor, y: anchor.y - 100 }, size, 140)).toBe(false);
  });

  it('…and follows once the target has moved far enough', () => {
    expect(needsReplace(prev, { ...anchor, x: anchor.x + 200 }, size, 140)).toBe(true);
  });

  it('re-places when its own size changes (switching tabs)', () => {
    expect(needsReplace(prev, anchor, { w: 300, h: 300 }, 140)).toBe(true);
  });
});

describe('density tokens', () => {
  it('regular is the base token set', () => {
    const v = densityVars('regular');
    expect(v['--space-3']).toBe('12px');
    expect(v['--text-body']).toBe('14px');
    expect(v['--text-label']).toBe('12px');
  });

  it('compact tightens spacing but never shrinks type below the minimums (body 14, label 12)', () => {
    const v = densityVars('compact');
    expect(Number.parseFloat(v['--space-4']!)).toBeLessThan(16);
    expect(v['--text-body']).toBe('14px');
    expect(v['--text-label']).toBe('12px');
  });

  it('spacious grows spacing and type, but body stays within 18px', () => {
    const v = densityVars('spacious');
    expect(Number.parseFloat(v['--space-4']!)).toBeGreaterThan(16);
    expect(Number.parseFloat(v['--text-body']!)).toBeGreaterThan(14);
    expect(Number.parseFloat(v['--text-body']!)).toBeLessThanOrEqual(18);
  });

  it('every density keeps body ≥ 14px, labels ≥ 12px and body ≤ 18px', () => {
    for (const d of ['compact', 'regular', 'spacious'] as const) {
      const v = densityVars(d);
      expect(Number.parseFloat(v['--text-body']!)).toBeGreaterThanOrEqual(14);
      expect(Number.parseFloat(v['--text-body']!)).toBeLessThanOrEqual(18);
      expect(Number.parseFloat(v['--text-label']!)).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('uiZoom', () => {
  it('is 1 except on spacious (big) screens, where the HUD and dock grow so they do not look tiny', () => {
    expect(uiZoom('compact', 375)).toBe(1);
    expect(uiZoom('regular', 1366)).toBe(1);
    expect(uiZoom('spacious', 1600)).toBeGreaterThanOrEqual(1);
    expect(uiZoom('spacious', 1920)).toBeGreaterThan(1.1);
    expect(uiZoom('spacious', 2560)).toBeGreaterThan(uiZoom('spacious', 1920));
  });

  it('is capped', () => {
    expect(uiZoom('spacious', 10000)).toBe(1.35);
  });
});
