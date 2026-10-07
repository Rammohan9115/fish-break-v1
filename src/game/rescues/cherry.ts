import type { RescueDef } from './types';

export const rescue: RescueDef = {
  id: 'cherry',
  speciesId: 'cherry_shrimp',
  name: 'Cherry',
  title: 'Lost Her Color',
  summary: 'So stressed she’s lost all her color.',
  estDays: 4,
  colorRecovery: { from: 0.95 },
  intro: {
    title: 'A see-through shrimp needs you!',
    body: 'This little shrimp arrived almost see-through from stress. Clean water and some calm should bring her color back. I can’t wait to see it!\n— Dr. Fisher 🩺🐟',
  },
  careNote: 'She needs spotless water and a calm, uncrowded tank. Her color returns a little with every kind thing you do.',
  stages: [
    {
      story: 'Cherry is almost white and see-through. Clean water and a moss ball to nibble on will help.',
      visual: {},
      tasks: [
        { type: 'keepCleanliness', min: 75, minutes: 3, label: 'Keep the tank 75%+ clean for 3 min', hint: 'Wipe algae with Clean 🧽', highlight: 'clean' },
        { type: 'placeDecor', decorIds: ['moss_ball'], label: 'Place a moss ball', hint: 'Decorate 🎨 → place a Moss Ball (Shop → Decor)', highlight: 'decorate' },
      ],
      letter: { title: 'A hint of pink!', body: 'Is that… a blush? Cherry’s shell just got the faintest pink. I did a little dance. The pelican judged me.\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'She’s pale pink. Easy on the pellets: nothing should rot on the sand today.',
      visual: {},
      tasks: [
        { type: 'noDissolve', minutes: 5, label: 'No pellets dissolving on the sand (5 min of play)', hint: 'Feed small amounts. Corys eating landed pellets counts as success', highlight: 'feed' },
        { type: 'useItem', itemId: 'vitamin_flakes', count: 1, label: 'Give vitamin flakes', hint: 'Pick Vitamin flakes in the Care tab, then tap Cherry', highlight: 'care' },
      ],
    },
    {
      story: 'Pink at last! Corys keep the sand clean, which makes her feel safe.',
      visual: {},
      tasks: [
        { type: 'ownSpecies', speciesId: 'cory', count: 1, label: 'Own a Cory Catfish', hint: 'Buy one: Shop 🛒 → Fish → Cory Catfish (20 🐚): they keep the sand clean for her', highlight: 'shop' },
        { type: 'useItem', itemId: 'healing_moss', count: 1, label: 'Give healing moss', hint: 'Pick Healing moss in the Care tab, then tap Cherry', highlight: 'care' },
      ],
      letter: { title: 'Pink!', body: 'She’s PINK. Properly pink. Please send a photo. Actually, I’ll come look.\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'Nearly there! One last stretch of sparkling water and a gentle pet.',
      visual: {},
      tasks: [
        { type: 'keepCleanliness', min: 80, minutes: 3, label: 'Keep the tank 80%+ clean for 3 min', hint: 'Wipe algae with Clean 🧽', highlight: 'clean' },
        { type: 'pet', count: 2, label: 'Pet Cherry ×2', hint: 'Press and hold on Cherry', highlight: 'pet' },
      ],
    },
  ],
  completion: {
    title: 'Ruby red! 💚',
    body: 'Look at that color! A glossy ruby red shrimp. And she laid a clutch of eggs, so little ones will hatch over the next hour. Welcome to the colony!\n— Dr. Fisher 🩺🐟',
  },
  rewards: {
    variant: 'ruby',
    items: { vitamin_flakes: 1, soft_food: 1 },
    journal: 'Rescued Cherry, the see-through shrimp. Her color is back, and she started a colony!',
    perks: {},
    colony: 3,
  },
};
