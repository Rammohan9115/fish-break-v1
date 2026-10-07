// Starting values for the rescue, mail and daily state (no imports from sim/engine, so sim.ts and save.ts can use it).
import type { DailyState, Letter, RescueState } from '../types';

export const emptyRescueState = (): RescueState => ({
  activeId: null,
  cases: {},
  careItems: { soft_food: 0, healing_moss: 0, vitamin_flakes: 0 },
  kitGiven: false,
});

export const emptyDaily = (): DailyState => ({ date: '', tasks: [], rerolled: false, bonusClaimed: false, fullDays: [], chestClaimedOn: null });

let letterSeq = 0;
export function makeLetter(caseId: string | null, title: string, body: string, now: number, action?: Letter['action']): Letter {
  letterSeq += 1;
  return { id: `letter-${now}-${letterSeq}`, caseId, title, body, at: now, read: false, ...(action ? { action } : {}) };
}

export const welcomeLetter = (now: number): Letter =>
  makeLetter(
    null,
    'Welcome to the Rescue Center!',
    'Hi, I’m Dr. Fisher! I run a little aquatic rescue center, and my pelican and I find animals that need a calm home to heal. Want to help? Take a look at my Rescue Board, whenever you’re ready. No rush, ever.\n— Dr. Fisher 🩺🐟',
    now,
    'rescueBoard',
  );
