// Decor rules: collections, set bonuses, variety happiness and the October event. Pure.
import {
  COLLECTION_LIST,
  DECOR_LIMIT,
  DECOR,
  HAPPINESS_DECOR_MAX,
  HAPPINESS_PER_DUPLICATE_DECOR,
  HAPPINESS_PER_SET,
  HAPPINESS_PER_UNIQUE_DECOR,
  OCTOBER_MONTH,
  SET_BONUS_ITEMS,
} from './constants';
import type { CollectionDef, CollectionId, DecorDef, DecorId, GameState, PlacedDecor, Tank } from './types';

/** The items of a collection, in catalog order. */
export function collectionItems(id: CollectionId): DecorDef[] {
  return Object.values(DECOR).filter((d) => d.collection === id);
}

/** Whether an event collection is in season on `date` (local time). Non-event collections always are. */
export function collectionInSeason(c: CollectionDef, date: Date): boolean {
  return c.event === null || (c.event === 'october' && date.getMonth() === OCTOBER_MONTH);
}

/** Can this item be bought on `date`? Event items only in season; everything else always. */
export function decorAvailable(decorId: DecorId, date: Date): boolean {
  const c = DECOR[decorId].collection;
  if (c === null) return true;
  const def = COLLECTION_LIST.find((x) => x.id === c)!;
  return collectionInSeason(def, date);
}

/** Collections with SET_BONUS_ITEMS or more different items placed in the tank (duplicates don't count). */
export function activeSets(tank: Pick<Tank, 'decor'>): CollectionId[] {
  const kinds = new Set(tank.decor.map((d) => d.decorId));
  const out: CollectionId[] = [];
  for (const c of COLLECTION_LIST) {
    let n = 0;
    for (const id of kinds) if (DECOR[id].collection === c.id) n++;
    if (n >= setBonusNeeds(c.id)) out.push(c.id);
  }
  return out;
}

/** Different items needed for a collection's set bonus: 3, or the whole collection if it's smaller (Halloween has 2). */
export function setBonusNeeds(id: CollectionId): number {
  return Math.min(SET_BONUS_ITEMS, collectionItems(id).length);
}

/** Happiness from decor: +3 per different item, +1 per duplicate (max +20), plus +5 per active set. */
export function decorHappiness(tank: Pick<Tank, 'decor'>): number {
  const unique = new Set(tank.decor.map((d) => d.decorId)).size;
  const duplicates = tank.decor.length - unique;
  const variety = Math.min(HAPPINESS_DECOR_MAX, unique * HAPPINESS_PER_UNIQUE_DECOR + duplicates * HAPPINESS_PER_DUPLICATE_DECOR);
  return variety + activeSets(tank).length * HAPPINESS_PER_SET;
}

/** What one more copy of `decorId` would add to the tank's decor happiness (for the shop / decor card). */
export function decorHappinessGain(tank: Pick<Tank, 'decor'>, decorId: DecorId): number {
  return decorHappiness({ decor: [...tank.decor, newPlaced('_', decorId, 0)] }) - decorHappiness(tank);
}

/** Different items of a collection the player owns (placed in any tank or in the decor box), out of its total. */
export function collectionProgress(game: Pick<GameState, 'tanks' | 'decorInventory'>, id: CollectionId): { owned: number; total: number } {
  const all = [...game.tanks.flatMap((t) => t.decor.map((d) => d.decorId)), ...(Object.keys(game.decorInventory) as DecorId[])];
  const owned = new Set(all.filter((d) => DECOR[d].collection === id));
  return { owned: owned.size, total: collectionItems(id).length };
}

/** Different items of `collection` in this tank (toward its set bonus). */
export function setProgress(tank: Pick<Tank, 'decor'>, id: CollectionId): number {
  return new Set(tank.decor.map((d) => d.decorId).filter((d) => DECOR[d].collection === id)).size;
}

/** How many decor items a tank can hold: 15, plus 3 per capacity upgrade. */
export function maxDecor(tank: Pick<Tank, 'upgrades'>): number {
  return DECOR_LIMIT.base + DECOR_LIMIT.perUpgrade * tank.upgrades;
}

/** A newly placed item with the default look (medium, not flipped, behind the fish). */
export function newPlaced(id: string, decorId: DecorId, x: number): PlacedDecor {
  return { id, decorId, x, flipped: false, size: 'M', depth: 'back' };
}

/** Total items in the decor box. */
export function boxCount(game: Pick<GameState, 'decorInventory'>): number {
  return Object.values(game.decorInventory).reduce((n, c) => n + (c ?? 0), 0);
}
