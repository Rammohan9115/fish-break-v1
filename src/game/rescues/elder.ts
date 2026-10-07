// Professor Whiskers: loneliness (no other cory near him) and the gameplay tips he shares once rescued.
import { LONELY_RADIUS } from '../constants';

type Pt = { x: number; y: number };

/** The nearest friend within reach, or null when he is lonely. */
export function nearestFriend(prof: Pt, others: readonly Pt[], radius = LONELY_RADIUS): Pt | null {
  let best: Pt | null = null;
  let bestD = radius;
  for (const o of others) {
    const d = Math.hypot(o.x - prof.x, o.y - prof.y);
    if (d <= bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

export const isLonely = (prof: Pt, others: readonly Pt[]): boolean => nearestFriend(prof, others) === null;

export const TIPS: readonly string[] = [
  'Press and hold a fish to pet it. Bonds only ever go up! 💕',
  'Happy fish grow faster. Clean water and decor both help.',
  'Corys eat landed pellets, so the sand stays clean.',
  'Cherry shrimp take up half a tank slot.',
  'Wipe algae with the sponge for a quick XP boost.',
  'Premium food gives a 3-minute growth boost.',
  'Three different decor pieces from one collection give a set bonus.',
  'Break Mode is great for a calm five minutes ☕',
  'Eggs never count toward tank capacity.',
  'A full tank is a bit less happy. Upgrade it when it gets crowded.',
  'Babies of two Buddy fish start with a head start on bond.',
  'Tap the shells on the sand to collect them.',
  'Selling a fish can always be undone for a few seconds.',
  'Night feeding is a treat for shy night owls.',
  'Fish tricks are in the FishCard; double-tap a fish to play one.',
  'Care items are used only when a task still needs them.',
  'Skipping a day never hurts a rescue. It just waits.',
  'The weekly chest needs 5 busy days out of 7, in any order.',
  'Try Decorate mode: drag pieces up to push them to the back.',
  'Different sand colors change the whole mood of the tank.',
];

/** A tip, picked by `r` in [0,1). */
export const pickTip = (r: number): string => TIPS[Math.min(TIPS.length - 1, Math.floor(r * TIPS.length))]!;
