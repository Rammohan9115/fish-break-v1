import type { RescueDef } from './types';

export const rescue: RescueDef = {
  id: 'pinch',
  speciesId: 'crab',
  name: 'Pinch',
  title: 'The Storm Survivor',
  summary: 'Washed up after a storm with a cracked shell and a hurt claw.',
  estDays: 4,
  intro: {
    title: 'A little crab needs you!',
    body: 'My pelican found a tiny crab on the beach after last night’s storm. Cracked shell, sore claw, and VERY grumpy (I think he’s just scared). He needs a quiet home to heal.\n— Dr. Fisher 🩺🐟',
  },
  careNote: 'He’s shy and sore. Give him a hideout, gentle meals and a clean, quiet tank.',
  stages: [
    {
      story: 'Pinch peeks out from under his bandage. A hideout and a soft meal will help.',
      visual: { cracks: true, bandage: { x: 0.8, y: 0.45 }, shy: true },
      tasks: [
        { type: 'placeDecor', decorIds: ['rock', 'driftwood', 'broken_arch', 'castle', 'tiny_cottage'], label: 'Place a hideout (rock, driftwood…)', hint: 'Decorate 🎨 → place a rock or driftwood', highlight: 'decorate' },
        { type: 'useItem', itemId: 'soft_food', count: 2, label: 'Give soft food ×2', hint: 'Pick Soft food in the Care tab, then tap Pinch', highlight: 'care' },
      ],
      letter: { title: 'Pinch is settling in', body: 'He ate! He’s still grumpy, but he ate. I call that a win.\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'He’s less shy now. Keep the water clean and keep your pets short and sweet.',
      visual: { cracks: true, bandage: { x: 0.8, y: 0.45 } },
      tasks: [
        { type: 'keepCleanliness', min: 70, minutes: 3, label: 'Keep the tank 70%+ clean for 3 min', hint: 'Wipe algae with Clean 🧽', highlight: 'clean' },
        { type: 'pet', count: 2, maxSecondsPerPet: 3, label: 'Short pets ×2 (he’s shy)', hint: 'Hold on Pinch, then let go quickly', highlight: 'pet' },
      ],
    },
    {
      story: 'Pinch is molting! He hides for the day, only his eye stalks peek out.',
      visual: { cracks: true, hidden: true },
      tasks: [
        { type: 'interact', actionId: 'leave_him_be', count: 1, button: 'Let him rest 🛌', label: 'Let him rest', hint: 'Open Pinch’s Care tab and tap “Let him rest”', highlight: 'care' },
        { type: 'useItem', itemId: 'healing_moss', count: 1, label: 'Give healing moss', hint: 'Pick Healing moss in the Care tab, then tap Pinch', highlight: 'care' },
      ],
      letter: { title: 'Molting is a good sign!', body: 'Crabs hide when they molt. It means he feels safe with you. Almost there!\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'A brand new shiny shell! Time for the last bit of TLC.',
      visual: {},
      tasks: [
        { type: 'pet', count: 3, label: 'Pet Pinch ×3', hint: 'Press and hold on Pinch', highlight: 'pet' },
        { type: 'useItem', itemId: 'vitamin_flakes', count: 1, label: 'Give vitamin flakes', hint: 'Pick Vitamin flakes in the Care tab, then tap Pinch', highlight: 'care' },
      ],
    },
  ],
  completion: {
    title: 'Pinch is all better! 💚',
    body: 'Look at that SHELL! He’s officially yours now: a Stormshell crab, and a brave one. Thank you for everything.\n— Dr. Fisher 🩺🐟',
  },
  rewards: {
    variant: 'stormshell',
    items: { soft_food: 2, healing_moss: 1 },
    journal: 'Rescued Pinch, the storm survivor crab. He’s a Stormshell now!',
    perks: { digBonus: 1.3, tricks: ['signature'] },
  },
};
