import { describe, expect, it } from 'vitest';
import { goalOfTheDay, longTermGoals } from './goals';
import { makeFish, makeState } from './testUtils';

const NOV = new Date(2026, 10, 3); // not October: the Halloween collection is out of season
const OCT = new Date(2026, 9, 3);

describe('longTermGoals', () => {
  const game = makeState({ fish: [makeFish({ speciesId: 'danio' })] });

  it('lists collections with their progress, a soulmate, a shiny, species and room', () => {
    const ids = longTermGoals(game, NOV).map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(['collection:nature', 'collection:ruins', 'soulmate', 'shiny', 'species', 'fill']));
    expect(ids).not.toContain('collection:halloween');
  });

  it('the Halloween collection only counts in October', () => {
    expect(longTermGoals(game, OCT).map((g) => g.id)).toContain('collection:halloween');
  });

  it('shows real progress numbers', () => {
    const goal = longTermGoals(makeState({ fish: [makeFish({ speciesId: 'danio' }), makeFish({ speciesId: 'koi' })] }), NOV).find((g) => g.id === 'species')!;
    expect(goal.sub).toBe('2/11 species');
  });

  it('drops a goal once it is done', () => {
    const done = makeState({ fish: [{ ...makeFish({ shiny: true }), bondLevel: 5, bondPoints: 300 }] });
    const ids = longTermGoals(done, NOV).map((g) => g.id);
    expect(ids).not.toContain('soulmate');
    expect(ids).not.toContain('shiny');
  });

  it('has nothing to say when everything is done', () => {
    const none = makeState({ fish: [] });
    // No fish: no soulmate goal; the rest still apply, so an empty list needs everything finished.
    expect(goalOfTheDay({ ...none, tanks: [{ ...none.tanks[0]!, capacity: 0 }] }, NOV)).not.toBeUndefined();
  });
});

describe('goalOfTheDay', () => {
  const game = makeState({ fish: [makeFish()] });

  it('is the same all day and changes from one day to the next', () => {
    const morning = new Date(2026, 10, 3, 8);
    const evening = new Date(2026, 10, 3, 22);
    expect(goalOfTheDay(game, morning)?.id).toBe(goalOfTheDay(game, evening)?.id);
    const seen = new Set([3, 4, 5, 6, 7, 8].map((d) => goalOfTheDay(game, new Date(2026, 10, d))?.id));
    expect(seen.size).toBeGreaterThan(1);
  });
});
