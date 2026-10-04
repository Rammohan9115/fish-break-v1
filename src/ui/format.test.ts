import { describe, expect, it } from 'vitest';
import { formatClock, formatCount, formatEta, formatMinutes } from './format';

describe('formatCount', () => {
  it('keeps small numbers exact with separators', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1250)).toBe('1,250');
    expect(formatCount(9999)).toBe('9,999');
  });
  it('compacts large numbers', () => {
    expect(formatCount(12_450)).toBe('12.5K');
    expect(formatCount(10_000)).toBe('10K');
    expect(formatCount(250_000)).toBe('250K');
    expect(formatCount(3_400_000)).toBe('3.4M');
  });
  it('floors fractions', () => expect(formatCount(41.7)).toBe('41'));
});

describe('durations', () => {
  it('formats minutes', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(100)).toBe('1h 40m');
    expect(formatMinutes(100 / 60 * 60)).toBe('1h 40m');
  });
  it('formats ETAs', () => {
    expect(formatEta(30)).toBe('under a minute');
    expect(formatEta(420)).toBe('~7 min');
    expect(formatEta(6000)).toBe('~1h 40m');
  });
  it('formats clocks', () => {
    expect(formatClock(42_000)).toBe('0:42');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('0:00');
  });
});
