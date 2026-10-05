import { describe, expect, it } from 'vitest';
import { makeFish, makeState } from '../game/testUtils';
import { createTank } from '../game/sim';
import { eventsBetween } from './analyticsWiring';

const names = (a: ReturnType<typeof makeState>, b: ReturnType<typeof makeState>) => eventsBetween(a, b).map((e) => e.event);

describe('eventsBetween', () => {
  const base = makeState({ fish: [makeFish()] });

  it('sees nothing when nothing happened', () => {
    expect(names(base, { ...base })).toEqual([]);
  });

  it('level up', () => {
    expect(eventsBetween(base, { ...base, level: base.level + 1 })).toEqual([{ event: 'level_up', props: { level: base.level + 1 } }]);
  });

  it('a bought fish carries only its species, but a hatched one is not a purchase', () => {
    const bought = { ...base, fish: [...base.fish, makeFish({ id: 'new', speciesId: 'betta' })] };
    expect(eventsBetween(base, bought)).toEqual([{ event: 'buy_fish', props: { species: 'betta' } }]);
    const hatched = { ...bought, stats: { ...bought.stats, hatched: bought.stats.hatched + 1 } };
    expect(names(base, hatched)).toEqual([]);
  });

  it('decor, tanks, themes, styles and capacity upgrades', () => {
    expect(names(base, { ...base, decorInventory: { rock: 1 } })).toEqual(['buy_decor']);
    expect(names(base, { ...base, tanks: [...base.tanks, createTank('t2', 'Two')] })).toEqual(['buy_tank']);
    expect(names(base, { ...base, ownedThemes: [...base.ownedThemes, 'night'] })).toEqual(['buy_theme']);
    expect(names(base, { ...base, ownedStyles: [...base.ownedStyles, 'frame:bamboo'] })).toEqual(['buy_style']);
    expect(names(base, { ...base, tanks: base.tanks.map((t) => ({ ...t, upgrades: t.upgrades + 1 })) })).toEqual(['buy_upgrade']);
  });

  it('breeding and petting', () => {
    expect(names(base, { ...base, courtships: [{ id: 'c', tankId: 'tank-1', fishIds: ['a', 'b'], startedAt: 0, endsAt: 1, x: 0 }] })).toEqual(['breed_start']);
    expect(names(base, { ...base, fish: base.fish.map((f) => ({ ...f, petLog: [1] })) })).toEqual(['pet_complete']);
  });

  it('never includes names, ids or amounts of money', () => {
    const bought = { ...base, fish: [...base.fish, makeFish({ id: 'secret-id', name: 'Private Name', speciesId: 'koi' })], shells: 1 };
    expect(JSON.stringify(eventsBetween(base, bought))).not.toMatch(/Private Name|secret-id/);
  });
});
