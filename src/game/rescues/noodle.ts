import { SIT_ACTION } from '../constants';
import type { RescueDef } from './types';

export const rescue: RescueDef = {
  id: 'noodle',
  speciesId: 'kuhli_loach',
  name: 'Noodle',
  title: 'Too Shy to Shine',
  summary: 'Rescued from an overcrowded pet store tank, too scared to leave the sand.',
  estDays: 4,
  trustMeter: true,
  intro: {
    title: 'A very shy noodle needs you!',
    body: 'Noodle came from a pet store tank that was WAY too crowded. He’s sweet, but so scared he won’t come out of the sand. I think a calm tank and a patient friend will change that.\n— Dr. Fisher 🩺🐟',
  },
  careNote: 'He’s very shy. Give him cover, quiet company and a lot of patience.',
  stages: [
    {
      story: 'Noodle is burrowed with only his eyes showing. Some leafy cover and a late-night snack will help.',
      visual: { burrow: 0.88 },
      tasks: [
        { type: 'placeDecor', decorIds: ['plant_small', 'plant_tall', 'flower_plant', 'sea_fan', 'moss_ball'], count: 2, label: 'Place 2 plants for cover', hint: 'Decorate 🎨 → place two plants', highlight: 'decorate' },
        { type: 'feedAtTime', timeOfDay: 'night', label: 'Feed him at night (8 pm – 6 am)', hint: 'Drop pellets with Feed 🍤 after dark: he’s a night owl', highlight: 'feed' },
      ],
      letter: { title: 'Noodle peeked!', body: 'I got a report of two little eyes watching the tank. That’s a HUGE deal for him.\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'His head and neck are out now. He likes quiet company and clean water.',
      visual: { burrow: 0.6 },
      tasks: [
        { type: 'breakModeMinutes', minutes: 3, label: 'Spend 3 min in Break Mode', hint: 'Start Break ☕ and just sit quietly', highlight: 'break' },
        { type: 'keepCleanliness', min: 65, minutes: 3, label: 'Keep the tank 65%+ clean for 3 min', hint: 'Wipe algae with Clean 🧽', highlight: 'clean' },
      ],
    },
    {
      story: 'He slides out for a moment, then darts back. Sit near his burrow and let him get used to you.',
      visual: { burrow: 0.3, shy: true },
      tasks: [
        { type: 'interact', actionId: SIT_ACTION, count: 1, label: 'Sit with him for 5 seconds', hint: 'Press and hold the water near (not on) his burrow for 5 seconds', highlight: 'care' },
        { type: 'useItem', itemId: 'soft_food', count: 1, label: 'Give soft food', hint: 'Pick Soft food in the Care tab, then tap Noodle', highlight: 'care' },
      ],
      letter: { title: 'He sat with you!', body: 'Noodle let you sit next to him. I may have cried a little. Don’t tell anyone.\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'Noodle swims freely! One last round of friendship.',
      visual: {},
      tasks: [
        { type: 'pet', count: 2, label: 'Pet Noodle ×2', hint: 'Press and hold on Noodle', highlight: 'pet' },
        { type: 'feedAtTime', timeOfDay: 'night', label: 'Feed him at night once more', hint: 'Drop pellets with Feed 🍤 after dark', highlight: 'feed' },
      ],
    },
  ],
  completion: {
    title: 'Noodle is out and proud! 💚',
    body: 'Look at him go! A Shadow Stripe loach, charcoal with glowing amber stripes at night. He’ll meet you at the glass every time you come back. Thank you, my friend.\n— Dr. Fisher 🩺🐟',
  },
  rewards: {
    variant: 'shadow_stripe',
    items: { soft_food: 1, vitamin_flakes: 1 },
    journal: 'Rescued Noodle, the shy kuhli loach. He greets me at the glass now!',
    perks: { greets: true },
  },
};
