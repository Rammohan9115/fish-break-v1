// Long-term goals for players who have unlocked everything (after Lv20 the "next unlock" chip has nothing left to show).
// Pure: derived from the game state; the date only decides which one is highlighted today.
import { BOND, COLLECTION_LIST } from './constants';
import { collectionInSeason, collectionProgress } from './decor';
import { SPECIES } from './species';
import type { GameState } from './types';

export interface Goal {
  /** Stable id (used to remember a dismissed goal for the day). */
  id: string;
  text: string;
  sub: string;
}

const SOULMATE_LEVEL = BOND.levels.length - 1;

/** Every long-term goal that still applies, in a fixed priority order. */
export function longTermGoals(game: GameState, today: Date): Goal[] {
  const goals: Goal[] = [];

  for (const c of COLLECTION_LIST) {
    if (!collectionInSeason(c, today)) continue;
    const { owned, total } = collectionProgress(game, c.id);
    if (owned < total) goals.push({ id: `collection:${c.id}`, text: `${c.icon} Complete the ${c.name} collection`, sub: `${owned}/${total} pieces` });
  }

  const soulmates = game.fish.filter((f) => f.bondLevel >= SOULMATE_LEVEL).length;
  if (soulmates === 0 && game.fish.length > 0) goals.push({ id: 'soulmate', text: '💕 Make a Soulmate', sub: 'Pet a favourite fish until its bond is full' });

  if (!game.fish.some((f) => f.shiny) && !game.nursery.some((f) => f.shiny)) {
    goals.push({ id: 'shiny', text: '✨ Breed a shiny', sub: 'Any hatch has a small chance' });
  }

  const speciesOwned = new Set(game.fish.map((f) => f.speciesId)).size;
  const speciesTotal = Object.keys(SPECIES).length;
  if (speciesOwned < speciesTotal) goals.push({ id: 'species', text: '🐟 Raise every species', sub: `${speciesOwned}/${speciesTotal} species` });

  const room = game.tanks.reduce((n, t) => n + Math.max(0, t.capacity - game.fish.filter((f) => f.tankId === t.id).length), 0);
  if (room > 0) goals.push({ id: 'fill', text: '🏠 Fill every tank', sub: `${room} spots left` });

  return goals;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The goal to show today: the list rotates by calendar day, so the chip stays fresh without nagging. */
export function goalOfTheDay(game: GameState, today: Date): Goal | null {
  const goals = longTermGoals(game, today);
  if (goals.length === 0) return null;
  const day = Math.floor((today.getTime() - today.getTimezoneOffset() * 60_000) / DAY_MS);
  return goals[day % goals.length]!;
}
