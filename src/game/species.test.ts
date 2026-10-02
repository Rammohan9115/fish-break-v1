import { describe, expect, it } from 'vitest';
import { getVariant, randomVariantKey, SPECIES, SPECIES_LIST } from './species';
import { randomName, FISH_NAMES } from './names';

describe('species catalog', () => {
  it('has all 10 species with ids matching keys', () => {
    expect(SPECIES_LIST).toHaveLength(10);
    for (const [key, species] of Object.entries(SPECIES)) expect(species.id).toBe(key);
  });

  it('gives every species 3–4 unique variants', () => {
    for (const species of SPECIES_LIST) {
      expect(species.variants.length).toBeGreaterThanOrEqual(3);
      expect(species.variants.length).toBeLessThanOrEqual(4);
      expect(new Set(species.variants.map((v) => v.key)).size).toBe(species.variants.length);
    }
  });

  it('matches spec balance numbers', () => {
    expect(SPECIES.danio).toMatchObject({ unlockLevel: 1, growMinutes: 20, hungerRate: 2.0, sellPrice: 25, dropMinutes: 8, dropValue: 2 });
    expect(SPECIES.koi).toMatchObject({ unlockLevel: 20, growMinutes: 300, hungerRate: 0.6, sellPrice: 2500, dropMinutes: 30, dropValue: 80, themeOnly: 'pond' });
    expect(SPECIES.puffer.cost).toEqual({ currency: 'pearls', amount: 5 });
    expect(SPECIES.clownfish.themeOnly).toBe('coral');
  });

  it('picks variants with the injected rng', () => {
    expect(randomVariantKey('guppy', () => 0)).toBe(SPECIES.guppy.variants[0]!.key);
    expect(randomVariantKey('guppy', () => 0.999)).toBe(SPECIES.guppy.variants[3]!.key);
    expect(getVariant('guppy', 'nope').key).toBe(SPECIES.guppy.variants[0]!.key);
  });
});

describe('names', () => {
  it('avoids excluded names when possible', () => {
    const first = FISH_NAMES[0]!;
    expect(randomName(() => 0, [first])).toBe(FISH_NAMES[1]);
    expect(randomName(() => 0, FISH_NAMES)).toBe(first);
  });
});
