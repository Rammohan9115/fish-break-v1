// Random cute fish names.
import type { Rng } from './types';

export const FISH_NAMES: readonly string[] = [
  'Bubbles', 'Nibbles', 'Mochi', 'Pickle', 'Biscuit', 'Noodle', 'Peanut', 'Sprinkles',
  'Dumpling', 'Waffles', 'Pebble', 'Marble', 'Button', 'Tofu', 'Sushi', 'Boba',
  'Muffin', 'Cupcake', 'Jellybean', 'Gumdrop', 'Pudding', 'Taffy', 'Toffee', 'Cocoa',
  'Wiggles', 'Splash', 'Ripple', 'Puddle', 'Drizzle', 'Misty', 'Coral', 'Pearl',
  'Shelly', 'Finn', 'Flipper', 'Gill', 'Scales', 'Squishy', 'Blub', 'Glub',
  'Zippy', 'Dash', 'Sparky', 'Twinkle', 'Starla', 'Luna', 'Sunny', 'Honey',
  'Maple', 'Clover', 'Daisy', 'Poppy', 'Tulip', 'Lily', 'Fern', 'Willow',
  'Kiwi', 'Mango', 'Peach', 'Plum', 'Cherry', 'Berry', 'Lemon', 'Olive',
  'Pippin', 'Bean', 'Sprout', 'Nugget', 'Crumpet', 'Scone', 'Bagel', 'Pretzel',
  'Ziggy', 'Momo', 'Kiki', 'Lulu', 'Coco', 'Gigi', 'Fifi', 'Bibi',
];

/** Picks a random name, avoiding `exclude` when possible. */
export function randomName(rng: Rng, exclude: readonly string[] = []): string {
  const taken = new Set(exclude);
  const pool = FISH_NAMES.filter((name) => !taken.has(name));
  const source = pool.length > 0 ? pool : FISH_NAMES;
  return source[Math.floor(rng() * source.length)]!;
}
