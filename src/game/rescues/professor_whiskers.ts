import { GROUP_PHOTO_ACTION } from '../constants';
import type { RescueDef } from './types';

export const rescue: RescueDef = {
  id: 'professor_whiskers',
  speciesId: 'cory',
  name: 'Professor Whiskers',
  title: 'The Lonely Elder',
  summary: 'The rescue center’s oldest resident. He just needs friends.',
  estDays: 4,
  intro: {
    title: 'An old friend needs a family',
    body: 'Professor Whiskers was one of the very first animals I ever rescued, back when the center was just a tank in my garage. He’s lived here for years, but corys are happiest in groups, and he’s been alone too long. I trust you with him.\n— Dr. Fisher 🩺🐟',
  },
  careNote: 'Corys are happiest in groups. He needs friends, soft sand and a gentle hand.',
  stages: [
    {
      story: 'The Professor is lonely. A friend would change everything.',
      visual: { elder: true, desaturate: 0.2 },
      tasks: [
        { type: 'ownSpecies', speciesId: 'cory', count: 1, label: 'Get another Cory Catfish', hint: 'Buy one: Shop 🛒 → Fish → Cory Catfish, 20 🐚 (or breed one). It counts any cory besides him', highlight: 'shop' },
        { type: 'pet', count: 1, label: 'Pet the Professor', hint: 'Press and hold on him', highlight: 'pet' },
      ],
      letter: { title: 'The garage tank', body: 'The center started as one tank in my garage, a bucket, and a LOT of optimism. Professor Whiskers was the first resident. He supervised everything.\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'He grew up on soft sand. Let’s make him feel at home.',
      visual: { elder: true, desaturate: 0.15 },
      tasks: [
        { type: 'changeSubstrate', substrateIds: ['golden_sand', 'white_sand'], label: 'Switch to soft sand', hint: 'Decorate 🎨 → ✨ Style → Substrate: Golden or White Sand', highlight: 'decorate' },
        { type: 'useItem', itemId: 'soft_food', count: 1, label: 'Give soft food', hint: 'Pick Soft food in the Care tab, then tap the Professor', highlight: 'care' },
      ],
      letter: { title: 'Pelican problems', body: 'The pelican joined in year two. He was supposed to deliver ONE letter. He never left. I’m not complaining; the mail is very fast.\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'A little herd! He follows his new friends around.',
      visual: { elder: true, desaturate: 0.1 },
      tasks: [
        { type: 'ownSpecies', speciesId: 'cory', count: 2, label: 'Own 2 other Cory Catfish', hint: 'Buy one: Shop 🛒 → Fish → Cory Catfish, 20 🐚 (or breed one)', highlight: 'shop' },
        { type: 'keepCleanliness', min: 70, minutes: 10, label: 'Keep the tank 70%+ clean for 10 min', hint: 'Wipe algae with Clean 🧽', highlight: 'clean' },
      ],
      letter: { title: 'A strange report', body: 'Between us: fishermen keep reporting a strange glowing creature near the old pier. Probably nothing. Probably. I’ve packed a flashlight just in case.\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'Almost there. One gentle round of pets, then a group photo!',
      visual: { elder: true },
      tasks: [
        { type: 'pet', count: 3, label: 'Pet the Professor ×3', hint: 'Press and hold on him', highlight: 'pet' },
        { type: 'interact', actionId: GROUP_PHOTO_ACTION, count: 1, button: 'Group photo 📸', label: 'Take a group photo', hint: 'Open his Care tab and tap “Group photo”', highlight: 'care' },
      ],
      journal: '📸 Group photo: Professor Whiskers and his {n} cory friends. Everybody smiled (we think).',
      letter: { title: 'Thank you', body: 'I framed the photo. The Professor has a family again, and so do I, in a way. You’ve been a wonderful friend to this little center.\n— Dr. Fisher 🩺🐟' },
    },
  ],
  completion: {
    title: 'The Professor is home! 💚',
    body: 'Look at him in his glasses, surrounded by friends! He’ll happily share a tip or two if you tap him. The corys will eat a bit faster now, too. Thank you.\n— Dr. Fisher 🩺🐟',
  },
  rewards: {
    items: { soft_food: 1, vitamin_flakes: 1 },
    journal: 'Rescued Professor Whiskers, the lonely elder cory. He wears his glasses with pride!',
    perks: { glasses: true, groupEatBonus: 0.25, tips: true },
  },
};
