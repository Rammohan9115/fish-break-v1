import { describe, expect, it } from 'vitest';
import { GUST_HOLD_S, GUST_RISE_S, GUST_SETTLE_S, QUALITY_PROBE_MS, QUALITY_WINDOW } from '../../game/constants';
import { Currents, gustEnvelope } from './currents';
import { dayLight } from './dayCycle';
import { fbm1D, noise1D } from './noise';
import { QualityManager } from './quality';
import { dropPose, easeX, planFall } from './sandItems';

describe('noise', () => {
  it('stays in −1..1 and is continuous', () => {
    let prev = noise1D(0);
    for (let x = 0; x < 50; x += 0.01) {
      const v = noise1D(x, 3);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      if (x > 0) expect(Math.abs(v - prev)).toBeLessThan(0.05);
      prev = v;
      expect(Math.abs(fbm1D(x))).toBeLessThanOrEqual(1);
    }
  });
});

describe('quality', () => {
  const feed = (q: QualityManager, ms: number, durationMs: number, start = 0) => {
    let t = start;
    while (t < start + durationMs) {
      t += ms;
      q.sample(ms, t);
    }
    return t;
  };

  it('picks high for a smooth probe, medium and low for slower ones', () => {
    const a = new QualityManager();
    feed(a, 16.7, QUALITY_PROBE_MS + 50);
    expect(a.level).toBe('high');
    const b = new QualityManager();
    feed(b, 25, QUALITY_PROBE_MS + 50);
    expect(b.level).toBe('medium');
    const c = new QualityManager();
    feed(c, 45, QUALITY_PROBE_MS + 50);
    expect(c.level).toBe('low');
  });

  it('steps down one level when frames keep dropping, and ignores tab-switch gaps', () => {
    const q = new QualityManager();
    let t = feed(q, 16.7, QUALITY_PROBE_MS + 50);
    q.sample(5000, t + 5000);
    expect(q.level).toBe('high');
    t = feed(q, 30, 30 * QUALITY_WINDOW + 1, t);
    expect(q.level).toBe('medium');
  });

  it('a dev override wins, and reduced motion always uses the low preset', () => {
    const q = new QualityManager();
    q.setOverride('low');
    expect(q.level).toBe('low');
    q.setOverride(null);
    expect(q.preset(true).warpStrips).toBe(0);
  });
});

describe('currents', () => {
  it('gusts rise, hold, settle over ~5s and end at zero', () => {
    expect(gustEnvelope(-1)).toBe(0);
    expect(gustEnvelope(0)).toBe(0);
    expect(gustEnvelope(GUST_RISE_S + GUST_HOLD_S / 2)).toBe(1);
    expect(gustEnvelope(GUST_RISE_S + GUST_HOLD_S + GUST_SETTLE_S / 2)).toBeCloseTo(0.5, 1);
    expect(gustEnvelope(GUST_RISE_S + GUST_HOLD_S + GUST_SETTLE_S + 0.01)).toBe(0);
  });

  it('drift stays gentle and a forced gust pushes the total past it, then settles', () => {
    const c = new Currents(() => 0.3, 7);
    for (let i = 0; i < 600; i++) expect(Math.abs(c.update(1 / 60).drift)).toBeLessThanOrEqual(1);
    c.forceGust();
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(Math.abs(c.state.gust)).toBeGreaterThan(0.9);
    for (let i = 0; i < 60 * 8; i++) c.update(1 / 60);
    expect(c.state.gust).toBe(0);
  });
});

describe('day cycle', () => {
  it('is bright and untinted at midday, dim blue with lights on at night', () => {
    expect(dayLight(13).tintAlpha).toBe(0);
    const night = dayLight(2);
    expect(night.lights).toBe(1);
    expect(night.particleGlow).toBe(1);
    expect(night.rays).toBeLessThan(dayLight(13).rays);
  });

  it('evening has the longest rays and a golden tint', () => {
    expect(dayLight(18.5).rayLength).toBeGreaterThan(dayLight(13).rayLength);
    expect(dayLight(18.5).sunX).toBeGreaterThan(0);
    expect(dayLight(7.5).sunX).toBeLessThan(0);
  });

  it('never snaps: a minute of time changes nothing by more than a sliver', () => {
    for (let h = 0; h < 24; h += 1 / 60) {
      const a = dayLight(h);
      const b = dayLight(h + 1 / 60);
      expect(Math.abs(a.tintAlpha - b.tintAlpha)).toBeLessThan(0.01);
      expect(Math.abs(a.lights - b.lights)).toBeLessThan(0.02);
    }
    expect(dayLight(23.999).tintAlpha).toBeCloseTo(dayLight(0).tintAlpha);
  });
});

describe('drop fall (depth planes)', () => {
  const land = { x: 400, y: 560 };
  const origin = { x: 460, y: 200 };

  it('back drops sink slower than mid and front ones', () => {
    const back = planFall(land, origin, 0.8, false);
    const mid = planFall(land, origin, 1, false);
    expect(back.ms).toBeGreaterThan(mid.ms);
    expect(back.ms / mid.ms).toBeCloseTo(1.25, 1);
  });

  it('starts at the fish, sinks with a side-to-side drift, and lands exactly on the plane', () => {
    const fall = planFall(land, origin, 1, false);
    const start = dropPose(0, fall, 0);
    expect(start.falling).toBe(true);
    expect(start.dx).toBeCloseTo(60, 5);
    expect(start.lift).toBeCloseTo(360, 5);
    const xs = Array.from({ length: 20 }, (_, i) => dropPose((i / 20) * fall.ms, planFall(land, { x: 400, y: 200 }, 1, false), 0.3).dx);
    expect(Math.max(...xs)).toBeGreaterThan(1);
    expect(Math.min(...xs)).toBeLessThan(-1); // wobbles to both sides
    const landed = dropPose(fall.ms, fall);
    expect(landed.falling).toBe(false);
    expect(landed.dx).toBe(0);
    expect(landed.lift).toBe(0); // touches down, then the existing bounce
    expect(dropPose(fall.ms + 0.3 * 900, fall).lift).toBeGreaterThan(0);
    expect(dropPose(fall.ms + 900, fall)).toEqual({ dx: 0, lift: 0, falling: false });
  });

  it('with no known fish it drops in from just above, and reduced motion is short with no drift', () => {
    expect(planFall(land, null, 1, false).dx).toBe(0);
    const reduced = planFall(land, origin, 1, true);
    expect(reduced.drift).toBe(0);
    expect(reduced.ms).toBeLessThan(500);
    expect(dropPose(reduced.ms / 2, reduced, 0.4).dx).toBe(0);
  });

  it('easeX moves toward a target and snaps when close', () => {
    expect(easeX(100, 200, 0.1)).toBeGreaterThan(100);
    expect(easeX(100, 200, 0.1)).toBeLessThan(200);
    expect(easeX(100, 100.01, 0.1)).toBe(100.01);
  });
});
