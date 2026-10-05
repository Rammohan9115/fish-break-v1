import { describe, expect, it } from 'vitest';
import { layoutVars } from './useLayoutVars';

describe('layoutVars', () => {
  it('banners start just below the lowest HUD element', () => {
    expect(layoutVars(667, [38, 66, 116.2], 600).hudStack).toBe(123);
    expect(layoutVars(390, [42], 330).hudStack).toBe(48);
  });

  it('the dock height is whatever it takes from the bottom, so an open 3-row dock is measured, not guessed', () => {
    expect(layoutVars(844, [40], 780).dockH).toBe(64);
    expect(layoutVars(844, [40], 640).dockH).toBe(204);
  });

  it('is safe with no HUD or dock', () => {
    expect(layoutVars(600, [], null)).toEqual({ hudStack: 6, dockH: null });
  });
});
