import { describe, expect, it } from 'vitest';
import { checkBuyDecor } from './economy';
import { COLLECTION_LIST, DECOR, HAPPINESS_DECOR_MAX, HAPPINESS_PER_SET } from './constants';
import { activeSets, collectionItems, collectionProgress, decorAvailable, decorHappiness, decorHappinessGain } from './decor';
import { makeState, makeTank } from './testUtils';
import type { DecorId, Tank } from './types';

const placed = (...ids: DecorId[]): Tank['decor'] => ids.map((decorId, i) => ({ id: `p${i}`, decorId, x: 100 + i * 50, flipped: false, size: 'M' as const, depth: 'back' as const }));

describe('catalog', () => {
  it('has the 22 collection items, in five collections', () => {
    const counts = Object.fromEntries(COLLECTION_LIST.map((c) => [c.id, collectionItems(c.id).length]));
    expect(counts).toEqual({ nature: 7, ruins: 4, village: 4, playful: 5, halloween: 2 });
  });

  it('prices come from the spec', () => {
    expect(DECOR.moss_ball.cost).toEqual({ currency: 'shells', amount: 15 });
    expect(DECOR.stone_head.cost).toEqual({ currency: 'pearls', amount: 6 });
    expect(DECOR.toy_submarine.cost).toEqual({ currency: 'pearls', amount: 5 });
    expect(DECOR.tiny_cottage.cost).toEqual({ currency: 'shells', amount: 300 });
  });

  it('floating items are placed at the surface or mid-water', () => {
    expect([DECOR.lily_pad.placement, DECOR.rubber_duck.placement, DECOR.toy_submarine.placement]).toEqual(['surface', 'surface', 'mid']);
  });
});

describe('set bonuses', () => {
  it('need 3 different items of one collection; duplicates do not count', () => {
    expect(activeSets(makeTank({ decor: placed('moss_ball', 'moss_ball', 'moss_ball') }))).toEqual([]);
    expect(activeSets(makeTank({ decor: placed('moss_ball', 'driftwood') }))).toEqual([]);
    expect(activeSets(makeTank({ decor: placed('moss_ball', 'driftwood', 'lily_pad') }))).toEqual(['nature']);
  });

  it('several sets can be active at once', () => {
    const decor = placed('moss_ball', 'driftwood', 'lily_pad', 'bench', 'lantern', 'mailbox');
    expect(activeSets(makeTank({ decor }))).toEqual(['nature', 'village']);
  });
});

describe('decor happiness', () => {
  it('+3 per different item, +1 per duplicate', () => {
    expect(decorHappiness(makeTank({ decor: placed('rock') }))).toBe(3);
    expect(decorHappiness(makeTank({ decor: placed('rock', 'rock', 'castle') }))).toBe(7);
  });

  it('caps variety at +20, then adds +5 per active set on top', () => {
    const many = placed('rock', 'castle', 'chest', 'shipwreck', 'plant_small', 'plant_tall', 'bench', 'lantern');
    expect(decorHappiness(makeTank({ decor: many }))).toBe(HAPPINESS_DECOR_MAX);
    const withSet = placed('rock', 'castle', 'chest', 'shipwreck', 'plant_small', 'bench', 'lantern', 'mailbox');
    expect(decorHappiness(makeTank({ decor: withSet }))).toBe(HAPPINESS_DECOR_MAX + HAPPINESS_PER_SET);
  });

  it('the shop shows what one more piece would add', () => {
    const tank = makeTank({ decor: placed('moss_ball', 'driftwood') });
    expect(decorHappinessGain(tank, 'moss_ball')).toBe(1);
    expect(decorHappinessGain(tank, 'lily_pad')).toBe(3 + HAPPINESS_PER_SET);
  });
});

describe('October event', () => {
  it('Halloween decor is only buyable in October (local date)', () => {
    expect(decorAvailable('pumpkin', new Date(2026, 8, 30))).toBe(false);
    expect(decorAvailable('pumpkin', new Date(2026, 9, 1))).toBe(true);
    expect(decorAvailable('spooky_tree', new Date(2026, 9, 31, 23, 59))).toBe(true);
    expect(decorAvailable('pumpkin', new Date(2026, 10, 1))).toBe(false);
    expect(decorAvailable('moss_ball', new Date(2026, 1, 1))).toBe(true);
  });

  it('out of season the shop says why; owned pieces stay and keep counting (and their set)', () => {
    const state = makeState({ tank: { decor: placed('pumpkin', 'spooky_tree') }, overrides: { shells: 1000 } });
    expect(checkBuyDecor(state, 'pumpkin', new Date(2026, 11, 1).getTime())).toBe('event');
    expect(checkBuyDecor(state, 'pumpkin', new Date(2026, 9, 10).getTime())).toBeNull();
    expect(collectionProgress(state, 'halloween')).toEqual({ owned: 2, total: 2 });
    expect(decorHappiness(state.tanks[0]!)).toBe(6 + HAPPINESS_PER_SET);
  });
});

describe('small collections', () => {
  it('Halloween (2 pieces) activates with both pieces', () => {
    expect(activeSets(makeTank({ decor: placed('pumpkin') }))).toEqual([]);
    expect(activeSets(makeTank({ decor: placed('pumpkin', 'spooky_tree') }))).toEqual(['halloween']);
  });
});
