// Species catalog. Balance numbers mirror the table in CLAUDE.md.
import type { FishVariant, Rng, SpeciesDef, SpeciesId } from './types';

const v = (key: string, name: string, body: string, belly: string, fin: string, accent: string, outline: string): FishVariant => ({
  key,
  name,
  body,
  belly,
  fin,
  accent,
  outline,
});

/** Overlay colors used for any shiny fish, regardless of variant. */
export const SHINY_OUTLINE = '#d9a521';
export const SHINY_SPARKLE = '#fff4c4';

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  danio: {
    id: 'danio',
    name: 'Zippy Danio',
    unlockLevel: 1,
    cost: { currency: 'shells', amount: 10 },
    growMinutes: 20,
    hungerRate: 2.0,
    sellPrice: 25,
    dropMinutes: 8,
    dropValue: 2,
    speed: 90,
    themeOnly: null,
    traits: ['darts'],
    motion: { waveAmp: 0.65, waveSpeed: 1.6, gait: 'swim' },
    eye: { adult: { x: 0.88, y: 0.52, size: 0.21 }, baby: { x: 0.85, y: 0.55, size: 0.24 } },
    variants: [
      v('zebra', 'Zebra', '#4fa8ff', '#d8f0ff', '#7cc4ff', '#1a3fb8', '#1d4f9e'),
      v('peach', 'Peach', '#ff9a5c', '#ffe0c4', '#ffb87a', '#d4401a', '#a8481c'),
      v('mint', 'Mint', '#3fdc9a', '#d4ffe8', '#7aefc0', '#0f8a5a', '#167a52'),
    ],
  },
  guppy: {
    id: 'guppy',
    name: 'Guppy',
    unlockLevel: 1,
    cost: { currency: 'shells', amount: 15 },
    growMinutes: 25,
    hungerRate: 1.8,
    sellPrice: 35,
    dropMinutes: 8,
    dropValue: 3,
    speed: 60,
    themeOnly: null,
    traits: ['flowyTail'],
    motion: { waveAmp: 1.1, waveSpeed: 1.1, gait: 'swim' },
    eye: { adult: { x: 0.89, y: 0.5, size: 0.13 }, baby: { x: 0.855, y: 0.575, size: 0.17 } },
    variants: [
      v('sunset', 'Sunset', '#ffb02e', '#fff0c4', '#ff5a3d', '#2a6fff', '#b0640a'),
      v('lilac', 'Lilac', '#b07aff', '#efe2ff', '#8a4dff', '#ffd42e', '#6a36b8'),
      v('sky', 'Sky', '#38c8ff', '#dcf6ff', '#1f8cff', '#ffffff', '#1678b0'),
      v('cherry', 'Cherry', '#ff4f7a', '#ffdde6', '#e8204a', '#2a1f4a', '#a81e44'),
    ],
  },
  goldfish: {
    id: 'goldfish',
    name: 'Goldfish',
    unlockLevel: 3,
    cost: { currency: 'shells', amount: 40 },
    growMinutes: 45,
    hungerRate: 1.5,
    sellPrice: 80,
    dropMinutes: 10,
    dropValue: 5,
    speed: 40,
    themeOnly: null,
    traits: ['chubby'],
    motion: { waveAmp: 1, waveSpeed: 0.85, gait: 'swim' },
    eye: { adult: { x: 0.805, y: 0.47, size: 0.19 }, baby: { x: 0.79, y: 0.54, size: 0.2 } },
    variants: [
      v('classic', 'Classic', '#ff8a1a', '#ffe0a0', '#ffb84a', '#e8500a', '#b0500a'),
      v('calico', 'Calico', '#ffd9c4', '#ffffff', '#ffb89a', '#3a4ab8', '#c0704a'),
      v('lemon', 'Lemon', '#ffd21a', '#fff6b0', '#ffe066', '#e89a0a', '#b08a0a'),
    ],
  },
  tetra: {
    id: 'tetra',
    name: 'Neon Tetra',
    unlockLevel: 6,
    cost: { currency: 'shells', amount: 60 },
    growMinutes: 40,
    hungerRate: 1.6,
    sellPrice: 110,
    dropMinutes: 10,
    dropValue: 6,
    speed: 65,
    themeOnly: null,
    traits: ['glowStripe', 'schools'],
    motion: { waveAmp: 0.6, waveSpeed: 1.5, gait: 'swim' },
    eye: { adult: { x: 0.89, y: 0.56, size: 0.18 }, baby: { x: 0.87, y: 0.6, size: 0.25 } },
    variants: [
      v('neon', 'Neon', '#3a8aff', '#e8f4ff', '#ff3a4a', '#2ef0ff', '#1d4fb0'),
      v('cardinal', 'Cardinal', '#ff3a4a', '#ffe0e4', '#ff6a7a', '#2ee0ff', '#a81e2a'),
      v('glowlight', 'Glowlight', '#ffcf8a', '#fff4e0', '#fff0d0', '#ff6a1a', '#c0803a'),
    ],
  },
  betta: {
    id: 'betta',
    name: 'Betta',
    unlockLevel: 5,
    cost: { currency: 'shells', amount: 80 },
    growMinutes: 60,
    hungerRate: 1.2,
    sellPrice: 150,
    dropMinutes: 12,
    dropValue: 8,
    speed: 45,
    themeOnly: null,
    traits: ['bigFins'],
    motion: { waveAmp: 1.6, waveSpeed: 0.6, gait: 'swim' },
    eye: { adult: { x: 0.89, y: 0.54, size: 0.12 }, baby: { x: 0.86, y: 0.52, size: 0.15 } },
    variants: [
      v('royal', 'Royal', '#3a5aff', '#a8c0ff', '#2a4aff', '#8ae0ff', '#1a2aa8'),
      v('ruby', 'Ruby', '#ff2a5a', '#ffa0b8', '#e8104a', '#ffb0c8', '#a0103a'),
      v('opal', 'Opal', '#d8b0ff', '#fff0ff', '#c08aff', '#8ae8ff', '#8a5ac0'),
      v('teal', 'Teal', '#10d0c0', '#a8fff0', '#0ab0a8', '#c4fff0', '#0a7a72'),
    ],
  },
  angelfish: {
    id: 'angelfish',
    name: 'Angelfish',
    unlockLevel: 8,
    cost: { currency: 'shells', amount: 150 },
    growMinutes: 90,
    hungerRate: 1.0,
    sellPrice: 300,
    dropMinutes: 15,
    dropValue: 14,
    speed: 45,
    themeOnly: null,
    traits: ['tall'],
    motion: { waveAmp: 1.25, waveSpeed: 0.6, gait: 'swim' },
    eye: { adult: { x: 0.87, y: 0.47, size: 0.11 }, baby: { x: 0.855, y: 0.53, size: 0.14 } },
    variants: [
      v('silver', 'Silver', '#a8c8f0', '#f4faff', '#c8dcff', '#2a3a6a', '#4a6aa0'),
      v('marble', 'Marble', '#ffe6a8', '#fffbe8', '#fff0c8', '#2a2a4a', '#b09a50'),
      v('blush', 'Gold', '#ffc24a', '#fff0c4', '#ffd88a', '#e86a1a', '#b07a1a'),
    ],
  },
  clownfish: {
    id: 'clownfish',
    name: 'Clownfish',
    unlockLevel: 12,
    cost: { currency: 'shells', amount: 300 },
    growMinutes: 120,
    hungerRate: 1.0,
    sellPrice: 550,
    dropMinutes: 15,
    dropValue: 22,
    speed: 55,
    themeOnly: 'coral',
    traits: [],
    motion: { waveAmp: 0.9, waveSpeed: 1.2, gait: 'swim' },
    eye: { adult: { x: 0.855, y: 0.51, size: 0.19 }, baby: { x: 0.86, y: 0.54, size: 0.21 } },
    variants: [
      v('ocellaris', 'Ocellaris', '#ff7a1a', '#ffb05a', '#ff8a2a', '#ffffff', '#a8400a'),
      v('maroon', 'Maroon', '#d8243a', '#ff6a7a', '#e8344a', '#ffe08a', '#8a1020'),
      v('snowflake', 'Snowflake', '#ff9a2a', '#ffc46a', '#ffaa3a', '#ffffff', '#a85a0a'),
    ],
  },
  puffer: {
    id: 'puffer',
    name: 'Puffy',
    unlockLevel: 15,
    cost: { currency: 'pearls', amount: 5 },
    growMinutes: 180,
    hungerRate: 0.8,
    sellPrice: 900,
    dropMinutes: 20,
    dropValue: 35,
    speed: 35,
    themeOnly: null,
    traits: ['inflates'],
    motion: { waveAmp: 0.12, waveSpeed: 0.8, gait: 'bob' },
    eye: { adult: { x: 0.79, y: 0.375, size: 0.23 }, baby: { x: 0.76, y: 0.44, size: 0.27 } },
    variants: [
      v('sandy', 'Sandy', '#ffd25a', '#fffbe8', '#ffe08a', '#8a6a1a', '#b08a1a'),
      v('spotted', 'Spotted', '#8ad84a', '#f4ffe8', '#b8f07a', '#2a6a1a', '#4a8a1a'),
      v('berry', 'Berry', '#e870d0', '#ffeefb', '#f4a0e4', '#7a1a6a', '#a03a90'),
    ],
  },
  axolotl: {
    id: 'axolotl',
    name: 'Axolotl',
    unlockLevel: 18,
    cost: { currency: 'pearls', amount: 10 },
    growMinutes: 240,
    hungerRate: 0.6,
    sellPrice: 1500,
    dropMinutes: 25,
    dropValue: 50,
    speed: 25,
    themeOnly: null,
    traits: ['walksOnSand', 'smiles'],
    motion: { waveAmp: 0.5, waveSpeed: 0.8, gait: 'walk' },
    eye: { adult: { x: 0.76, y: 0.5, size: 0.21 }, baby: { x: 0.78, y: 0.5, size: 0.24 } },
    variants: [
      v('leucistic', 'Leucistic', '#ffaac4', '#ffe4ee', '#ffc4d8', '#ff2a6a', '#c0607a'),
      v('golden', 'Golden', '#ffd84a', '#fff4c4', '#ffe68a', '#ff6a3a', '#b0901a'),
      v('wild', 'Wild', '#6ab84a', '#c4f08a', '#8ad06a', '#e83a6a', '#3a7a2a'),
      v('lavender', 'Lavender', '#c4a0ff', '#f0e4ff', '#d8c0ff', '#ff4aa0', '#7a5ac0'),
    ],
  },
  koi: {
    id: 'koi',
    name: 'Koi',
    unlockLevel: 20,
    cost: { currency: 'pearls', amount: 15 },
    growMinutes: 300,
    hungerRate: 0.6,
    sellPrice: 2500,
    dropMinutes: 30,
    dropValue: 80,
    speed: 40,
    themeOnly: 'pond',
    traits: [],
    motion: { waveAmp: 1.1, waveSpeed: 0.7, gait: 'swim' },
    eye: { adult: { x: 0.84, y: 0.59, size: 0.14 }, baby: { x: 0.805, y: 0.585, size: 0.17 } },
    variants: [
      v('kohaku', 'Kohaku', '#ffffff', '#ffffff', '#f0f4ff', '#ff3a2a', '#8a8aa8'),
      v('sanke', 'Sanke', '#ffffff', '#ffffff', '#f0f4ff', '#1a1a3a', '#8a8aa8'),
      v('ogon', 'Ogon', '#ffc21a', '#fff0a0', '#ffd84a', '#e8900a', '#b0800a'),
    ],
  },
};

/** Species in table order (by shop listing). */
export const SPECIES_LIST: SpeciesDef[] = Object.values(SPECIES);

export function getSpecies(id: SpeciesId): SpeciesDef {
  return SPECIES[id];
}

export function getVariant(speciesId: SpeciesId, variantKey: string): FishVariant {
  const species = SPECIES[speciesId];
  return species.variants.find((variant) => variant.key === variantKey) ?? species.variants[0]!;
}

export function randomVariantKey(speciesId: SpeciesId, rng: Rng): string {
  const variants = SPECIES[speciesId].variants;
  return variants[Math.floor(rng() * variants.length)]!.key;
}
