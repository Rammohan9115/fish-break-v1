import { describe, expect, it } from 'vitest';
import { getVariant, randomVariantKey, SPECIES, SPECIES_LIST } from './species';
import { randomName, FISH_NAMES } from './names';

describe('species catalog', () => {
  it('has all 11 species with ids matching keys', () => {
    expect(SPECIES_LIST).toHaveLength(11);
    for (const [key, species] of Object.entries(SPECIES)) expect(species.id).toBe(key);
  });

  it('gives every species 3–4 unique variants (the jelly has 5)', () => {
    for (const species of SPECIES_LIST) {
      expect(species.variants.length).toBeGreaterThanOrEqual(3);
      expect(species.variants.length).toBeLessThanOrEqual(species.id === 'jellyfish' ? 5 : 4);
      expect(new Set(species.variants.map((v) => v.key)).size).toBe(species.variants.length);
    }
  });

  it('matches spec balance numbers', () => {
    expect(SPECIES.danio).toMatchObject({ unlockLevel: 1, growMinutes: 20, hungerRate: 2.0, sellPrice: 25, dropMinutes: 8, dropValue: 2 });
    expect(SPECIES.koi).toMatchObject({ unlockLevel: 20, growMinutes: 300, hungerRate: 0.6, sellPrice: 2500, dropMinutes: 30, dropValue: 80, themeOnly: 'pond' });
    expect(SPECIES.puffer.cost).toEqual({ currency: 'pearls', amount: 5 });
    expect(SPECIES.clownfish.themeOnly).toBe('coral');
  });

  it('configures the jellyfish', () => {
    expect(SPECIES.jellyfish).toMatchObject({
      name: 'Jelly',
      unlockLevel: 10,
      cost: { currency: 'shells', amount: 400 },
      growMinutes: 100,
      hungerRate: 0.9,
      sellPrice: 700,
      dropMinutes: 18,
      dropValue: 25,
      themeOnly: null,
    });
    expect(SPECIES.jellyfish.traits).toContain('jelly');
    expect(SPECIES.jellyfish.motion.gait).toBe('pulse');
    // Variants are hue rotations of one pink sprite.
    expect(SPECIES.jellyfish.variants.map((v) => v.key)).toEqual(['pink', 'sky', 'lavender', 'peach', 'mint']);
    expect(SPECIES.jellyfish.variants[0]!.hue).toBe(0);
    for (const v of SPECIES.jellyfish.variants.slice(1)) expect(v.hue).toBeGreaterThan(0);
    for (const split of [SPECIES.jellyfish.bellSplitY!.adult, SPECIES.jellyfish.bellSplitY!.baby]) {
      expect(split).toBeGreaterThan(0.2);
      expect(split).toBeLessThan(0.8);
    }
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
