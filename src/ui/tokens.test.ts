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

  it('compact is the default and follows the compact scale', () => {
    const v = tokenCssVars(false, 'compact', false);
    expect(tokenCssVars()['--ctl-h']).toBe('36px');
    expect(v['--text-body']).toBe('14px');
    expect(v['--text-lg']).toBe('16px');
    expect(v['--icon-currency']).toBe('16px');
    expect(v['--space-3']).toBe('8px');
    expect(tokenCssVars(false, 'compact', true)['--text-lg']).toBe('18px');
    expect(v['--tap-min']).toBe('44px'); // the touch hit area never shrinks
  });

  it('comfortable keeps the original larger sizes', () => {
    const v = tokenCssVars(false, 'comfortable');
    expect(v['--ctl-h']).toBe('44px');
    expect(v['--space-4']).toBe('16px');
    expect(v['--radius-btn']).toBe('999px');
  });

  it.each(['compact', 'comfortable'] as const)('%s never uses text under 12px', (d) => {
    for (const wide of [false, true]) {
      const v = tokenCssVars(false, d, wide);
      for (const [k, val] of Object.entries(v)) if (k.startsWith('--text-')) expect(Number.parseFloat(val)).toBeGreaterThanOrEqual(12);
    }
  });
});
