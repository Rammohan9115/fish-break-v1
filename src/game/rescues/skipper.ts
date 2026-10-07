import { ENCOURAGE_ACTION, FIRST_LEAP_ACTION } from '../constants';
import type { RescueDef } from './types';

export const rescue: RescueDef = {
  id: 'skipper',
  speciesId: 'hatchetfish',
  name: 'Skipper',
  title: 'Afraid to Jump',
  summary: 'Jumped out of a pond and landed in a puddle. Now he’s scared of the surface.',
  estDays: 4,
  intro: {
    title: 'A hatchetfish who won’t go up!',
    body: 'My pelican found this little guy flopping in a puddle after he jumped out of a pond. Hatchetfish LOVE the surface, but Skipper won’t go near it anymore. He needs shade, patience, and a friend cheering him on.\n— Dr. Fisher 🩺🐟',
  },
  careNote: 'He’s afraid of the surface. Give him shade and a lot of encouragement.',
  stages: [
    {
      story: 'Skipper hugs the bottom, low and shy. Some shade on the surface will make it feel safer.',
      visual: { zone: { top: 0.55, bottom: 0.8 }, hops: 'none', shy: true },
      tasks: [
        { type: 'placeDecor', decorIds: ['lily_pad'], label: 'Place a lily pad', hint: 'Decorate 🎨 → place a Lily Pad (Shop → Decor): shade makes the surface feel safe', highlight: 'decorate' },
        { type: 'useItem', itemId: 'soft_food', count: 1, label: 'Give soft food', hint: 'Pick Soft food in the Care tab, then tap Skipper', highlight: 'care' },
      ],
      letter: { title: 'He looked up!', body: 'Skipper glanced at the lily pad. For a whole second! The pelican gave him a thumbs-up (wing-up?).\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'He swims mid-water now. Cheer him on: tap the water just above him 3 times in a row.',
      visual: { zone: { top: 0.3, bottom: 0.55 }, hops: 'none' },
      tasks: [
        { type: 'interact', actionId: ENCOURAGE_ACTION, count: 3, label: 'Encourage him ×3', hint: 'Tap the water just above Skipper 3 times within 5 seconds, three times', highlight: 'care' },
      ],
    },
    {
      story: 'Just under the surface! He’s even trying tiny practice hops.',
      visual: { zone: { top: 0.08, bottom: 0.3 }, hops: 'practice' },
      tasks: [
        { type: 'interact', actionId: ENCOURAGE_ACTION, count: 4, label: 'Encourage him ×4', hint: 'Tap the water just above Skipper 3 times within 5 seconds, four times', highlight: 'care' },
        { type: 'keepCleanliness', min: 65, minutes: 10, label: 'Keep the tank 65%+ clean for 10 min', hint: 'Wipe algae with Clean 🧽', highlight: 'clean' },
      ],
      letter: { title: 'Practice hops!', body: 'He HOPPED. A tiny one, about the size of a pea, but a hop is a hop. I’m framing this report.\n— Dr. Fisher 🩺🐟' },
    },
    {
      story: 'Time for the big moment! Tap the glowing ring as he jumps.',
      visual: { hops: 'full', leap: true },
      tasks: [
        { type: 'interact', actionId: FIRST_LEAP_ACTION, count: 1, label: 'Catch his first leap', hint: 'Tap the glowing ring above the water while Skipper jumps', highlight: 'care' },
        { type: 'pet', count: 2, label: 'Pet Skipper ×2', hint: 'Press and hold on Skipper', highlight: 'pet' },
      ],
    },
  ],
  completion: {
    title: 'Skipper soars! 💚',
    body: 'Did you SEE that leap?! A Sky Silver hatchetfish, with a soft sky-blue sheen. He’ll hop twice as often now, just because he can. Thank you, my friend.\n— Dr. Fisher 🩺🐟',
  },
  rewards: {
    variant: 'sky_silver',
    items: { soft_food: 1, healing_moss: 1 },
    journal: 'Rescued Skipper, the hatchetfish who was afraid to jump. He leaps all the time now!',
    perks: { tricks: ['signature'], hopRate: 2 },
  },
};
