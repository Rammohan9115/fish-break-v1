import { describe, expect, it } from 'vitest';
import { savedArtPriority } from './LoadingScreen';

const store = (value: unknown) => ({ getItem: () => (value === null ? null : JSON.stringify(value)) });

describe('savedArtPriority', () => {
  it('gives a new player the starter species on the classic theme', () => {
    expect(savedArtPriority(store(null))).toEqual({ theme: 'classic', species: ['danio', 'guppy'], decor: [] });
  });

  it('reads the active theme and every species and decor piece in play', () => {
    const save = {
      activeTankId: 't2',
      fish: [{ speciesId: 'koi' }],
      nursery: [{ speciesId: 'betta' }],
      eggs: [{ speciesId: 'koi' }],
      tanks: [
        { id: 't1', theme: 'classic', decor: [{ decorId: 'rock' }] },
        { id: 't2', theme: 'night', decor: [{ decorId: 'castle' }] },
      ],
    };
    const p = savedArtPriority(store(save));
    expect(p.theme).toBe('night');
    expect(new Set(p.species)).toEqual(new Set(['danio', 'guppy', 'koi', 'betta']));
    expect(new Set(p.decor)).toEqual(new Set(['rock', 'castle']));
  });

  it('survives a corrupt save', () => {
    expect(savedArtPriority({ getItem: () => '{nope' }).theme).toBe('classic');
  });
});
