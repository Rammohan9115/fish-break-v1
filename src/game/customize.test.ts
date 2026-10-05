import { describe, expect, it } from 'vitest';
import { DECOR_LIMIT, DEFAULT_TANK_STYLE, STYLE_CATEGORIES, STYLE_OPTIONS } from './constants';
import { maxDecor, newPlaced } from './decor';
import {
  applyPreset,
  applyStyle,
  buyAndPlaceDecor,
  buyStyle,
  ownsStyle,
  placeFromBox,
  savePreset,
  sellBoxedDecor,
  storeDecor,
  updateDecor,
  type Result,
} from './economy';
import { makeState, seededRng, T0 } from './testUtils';
import type { DecorId, GameState } from './types';

type R = { ok: true; state: GameState } | { ok: false; reason: string };
const okState = (r: R | Result): GameState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.state;
};
const tank = (s: GameState) => s.tanks[0]!;
const withDecor = (ids: DecorId[], o: Partial<GameState> = {}) =>
  makeState({ tank: { decor: ids.map((id, i) => newPlaced(`p${i}`, id, 100 + i * 80)) }, overrides: { shells: 5000, pearls: 50, ...o } });

describe('decor limit', () => {
  it('is 15, plus 3 per capacity upgrade', () => {
    expect(maxDecor({ upgrades: 0 })).toBe(DECOR_LIMIT.base);
    expect(maxDecor({ upgrades: 2 })).toBe(21);
  });
});

describe('decor box', () => {
  it('store → place round-trips an item; place needs one in the box and room', () => {
    let s = withDecor(['rock', 'castle']);
    s = okState(storeDecor(s, 'tank-1', 'p0'));
    expect(tank(s).decor.map((d) => d.decorId)).toEqual(['castle']);
    expect(s.decorInventory).toEqual({ rock: 1 });
    s = okState(placeFromBox(s, 'tank-1', 'rock', 640, T0, seededRng(1)));
    expect(s.decorInventory).toEqual({});
    expect(tank(s).decor.find((d) => d.decorId === 'rock')?.x).toBe(640);
    expect(placeFromBox(s, 'tank-1', 'rock', 500, T0, seededRng(2)).ok).toBe(false);
  });

  it('a full tank refuses new pieces from the box', () => {
    const full = withDecor(Array.from({ length: 15 }, () => 'moss_ball' as const), { decorInventory: { rock: 1 } });
    expect(placeFromBox(full, 'tank-1', 'rock', 500, T0, seededRng(1))).toEqual({ ok: false, reason: 'full' });
  });

  it('selling from the box refunds half', () => {
    const s = okState(sellBoxedDecor(withDecor([], { decorInventory: { castle: 2 }, shells: 0 }), 'castle'));
    expect(s.shells).toBe(75);
    expect(s.decorInventory).toEqual({ castle: 1 });
  });

  it('flip, size and depth can be changed', () => {
    const s = okState(updateDecor(withDecor(['rock']), 'tank-1', 'p0', { flipped: true, size: 'L', depth: 'front' }));
    expect(tank(s).decor[0]).toMatchObject({ flipped: true, size: 'L', depth: 'front' });
  });

  it('Try it buys and places at the chosen spot with the chosen look', () => {
    const s = okState(buyAndPlaceDecor(withDecor([]), 'bench', 333, { flipped: true, size: 'S', depth: 'back' }, T0, seededRng(1)));
    expect(tank(s).decor[0]).toMatchObject({ decorId: 'bench', x: 333, flipped: true, size: 'S' });
    expect(s.shells).toBe(5000 - 60);
  });
});

describe('layout presets', () => {
  it('saves and re-applies a layout; current pieces go back to the box first', () => {
    let s = withDecor(['rock', 'castle']);
    s = okState(updateDecor(s, 'tank-1', 'p1', { flipped: true }));
    s = okState(savePreset(s, 'tank-1', 0, 'Cozy'));
    s = okState(storeDecor(s, 'tank-1', 'p0'));
    s = okState(storeDecor(s, 'tank-1', 'p1'));
    s = okState(placeFromBox(s, 'tank-1', 'castle', 900, T0, seededRng(3)));
    const applied = applyPreset(s, 'tank-1', 0, T0, seededRng(4));
    const next = okState(applied);
    expect(applied.ok && applied.skipped).toBe(0);
    expect(tank(next).decor.map((d) => [d.decorId, d.x, d.flipped])).toEqual([
      ['rock', 100, false],
      ['castle', 180, true],
    ]);
    expect(next.decorInventory).toEqual({});
  });

  it('skips pieces you no longer own, and counts them', () => {
    let s = withDecor(['rock', 'castle']);
    s = okState(savePreset(s, 'tank-1', 1, ''));
    expect(tank(s).layoutPresets[1]?.name).toBe('Layout 2');
    // Sold the castle: it can't come back.
    s = { ...s, tanks: [{ ...tank(s), decor: tank(s).decor.filter((d) => d.decorId !== 'castle') }] };
    const applied = applyPreset(s, 'tank-1', 1, T0, seededRng(5));
    expect(applied.ok && applied.skipped).toBe(1);
    expect(tank(okState(applied)).decor.map((d) => d.decorId)).toEqual(['rock']);
  });
});

describe('tank styles', () => {
  it('every category has at least 2 free options and no level gates', () => {
    for (const c of STYLE_CATEGORIES) expect(STYLE_OPTIONS.filter((o) => o.category === c.id && o.price === null).length).toBeGreaterThanOrEqual(2);
    expect(STYLE_OPTIONS.find((o) => o.id === 'bubbler:hearts')?.price).toEqual({ currency: 'shells', amount: 200 });
  });

  it('free options apply right away; paid ones must be bought first, then work on every tank', () => {
    let s = withDecor([]);
    s = { ...s, tanks: [tank(s), { ...tank(s), id: 'tank-2' }] };
    s = okState(applyStyle(s, 'tank-1', 'frame:wood'));
    expect(tank(s).style.frame).toBe('frame:wood');
    expect(applyStyle(s, 'tank-1', 'frame:chrome')).toEqual({ ok: false, reason: 'locked' });
    s = okState(buyStyle(s, 'tank-1', 'frame:chrome'));
    expect(s.shells).toBe(5000 - 200);
    expect(ownsStyle(s, 'frame:chrome')).toBe(true);
    s = okState(applyStyle(s, 'tank-2', 'frame:chrome'));
    expect(s.tanks[1]!.style.frame).toBe('frame:chrome');
    expect(buyStyle(s, 'tank-1', 'frame:chrome')).toEqual({ ok: false, reason: 'owned' });
  });

  it('new tanks start with the default style', () => {
    expect(tank(makeState()).style).toEqual(DEFAULT_TANK_STYLE);
  });
});
