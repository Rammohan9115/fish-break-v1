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
export const SHINY_OUTLINE = '#e0a800';
export const SHINY_SPARKLE = '#fff6c2';

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
    variants: [
      v('zebra', 'Zebra', '#bfe3ff', '#eef8ff', '#8cc8f5', '#5a8fc4', '#4f7ea8'),
      v('peach', 'Peach', '#ffd3b8', '#fff1e6', '#ffb08a', '#e0805a', '#c26f4e'),
      v('mint', 'Mint', '#c4f0d8', '#effcf5', '#94dcb6', '#4fae82', '#4a9672'),
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
    variants: [
      v('sunset', 'Sunset', '#ffd59e', '#fff3de', '#ff9eb5', '#ff6f91', '#c9785a'),
      v('lilac', 'Lilac', '#dccbff', '#f5f0ff', '#b49cff', '#8a6be0', '#7a64b8'),
      v('sky', 'Sky', '#bde8f7', '#effaff', '#8fd3f0', '#4fa9d1', '#4b8ea8'),
      v('cherry', 'Cherry', '#ffc2cc', '#fff0f2', '#ff8fa3', '#e0566f', '#c0606f'),
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
    variants: [
      v('classic', 'Classic', '#ffbe76', '#fff0d9', '#ffa04d', '#f07f2a', '#c97a3a'),
      v('calico', 'Calico', '#fff1e0', '#ffffff', '#ffb38a', '#6b6b8f', '#b08f78'),
      v('lemon', 'Lemon', '#fff09e', '#fffbe0', '#ffe066', '#e0b000', '#bba23f'),
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
    variants: [
      v('neon', 'Neon', '#c7d7ff', '#fff0f3', '#a8bfff', '#3ee6ff', '#6577b8'),
      v('cardinal', 'Cardinal', '#ffc7d1', '#fff2f4', '#ff9fb0', '#43d9f0', '#bf6e7e'),
      v('glowlight', 'Glowlight', '#ffe6c4', '#fffaf0', '#ffd09a', '#ff8a3d', '#c09460'),
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
    variants: [
      v('royal', 'Royal', '#a9b8ff', '#e8ecff', '#7f8fff', '#5b5fe0', '#5a66b0'),
      v('ruby', 'Ruby', '#ffa8b8', '#ffe8ec', '#ff7a94', '#d9405e', '#b85a6a'),
      v('opal', 'Opal', '#f0e6ff', '#ffffff', '#d8c6ff', '#a98be6', '#9d8bbf'),
      v('teal', 'Teal', '#9fe6dc', '#e6fbf8', '#6fd3c4', '#2fa898', '#4a9a8e'),
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
    variants: [
      v('silver', 'Silver', '#e8eef5', '#ffffff', '#cdd8e6', '#6d7a8f', '#8e9bb0'),
      v('marble', 'Marble', '#fff4e0', '#ffffff', '#f5d7a8', '#4a4a5e', '#b3a07e'),
      v('blush', 'Blush', '#ffd9e3', '#fff5f8', '#ffb8cb', '#e07a98', '#c48a9b'),
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
    variants: [
      v('ocellaris', 'Ocellaris', '#ffad73', '#ffe6d1', '#ff9050', '#ffffff', '#c06a3a'),
      v('maroon', 'Maroon', '#e8868f', '#ffe0e3', '#d96a75', '#fff2c2', '#a85560'),
      v('snowflake', 'Snowflake', '#ffc8a0', '#ffffff', '#ffb080', '#ffffff', '#c58560'),
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
    variants: [
      v('sandy', 'Sandy', '#f5e2a8', '#fffaeb', '#e8cc80', '#a88a4a', '#b39a5e'),
      v('spotted', 'Spotted', '#d6ecc4', '#f6fcf0', '#b8dca0', '#5f8a4a', '#7f9e6a'),
      v('berry', 'Berry', '#f2c4e8', '#fff0fb', '#e6a0d6', '#a8508f', '#a87598'),
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
    variants: [
      v('leucistic', 'Leucistic', '#ffd6e0', '#fff4f7', '#ffb3c6', '#ff7aa0', '#c98a9c'),
      v('golden', 'Golden', '#ffe8a3', '#fffaea', '#ffd970', '#ff9eb0', '#c2a65a'),
      v('wild', 'Wild', '#b8c9a8', '#eef3e8', '#9fb38c', '#d98aa8', '#7c8c6c'),
      v('lavender', 'Lavender', '#e0d4f5', '#f9f5ff', '#c8b4ec', '#f08ab8', '#9a8ab8'),
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
    variants: [
      v('kohaku', 'Kohaku', '#fff8f2', '#ffffff', '#ffe6d9', '#ff7a6b', '#c0a090'),
      v('sanke', 'Sanke', '#fff8f2', '#ffffff', '#ffe0cc', '#3f3f55', '#b09a8c'),
      v('ogon', 'Ogon', '#ffe7a0', '#fff8e0', '#ffd666', '#e0a020', '#c2a050'),
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
