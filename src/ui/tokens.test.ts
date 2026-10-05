import { describe, expect, it } from 'vitest';
import { color, contrastRatio, layer, TEXT_PAIRS, tokenCssVars } from './tokens';

describe('design tokens', () => {
  it.each(TEXT_PAIRS)('%s on %s meets WCAG AA (4.5:1)', (fg, bg) => {
    expect(contrastRatio(color[fg], color[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('computes known contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('keeps layers unique and ordered', () => {
    const values = Object.values(layer);
    expect(new Set(values).size).toBe(values.length);
    expect(layer.toast).toBeGreaterThan(layer.coachmark);
    expect(layer.confirm).toBeGreaterThan(layer.sheet);
    expect(layer.popover).toBeGreaterThan(layer.toast);
    expect(layer.popover).toBeLessThan(layer.sheet);
    expect(layer.hint).toBeGreaterThan(layer.banner);
    expect(layer.hint).toBeLessThan(layer.coachmark);
  });

  it('zeroes travel durations for reduced motion', () => {
    expect(tokenCssVars(true)['--motion-slow']).toBe('1ms');
    expect(tokenCssVars(false)['--motion-slow']).toBe('320ms');
    expect(tokenCssVars()['--color-brand']).toBe(color.brand);
  });
});
