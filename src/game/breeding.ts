// Breeding (unlocks at L5). Pure: decisions depend only on (state, now, rng).
import { BREEDING, MINUTE_MS, UNLOCK_LEVEL } from './constants';
import { randomVariantKey, SPECIES } from './species';
import type { Egg, Fish, GameState, Rng, SpeciesId } from './types';

export function breedingUnlocked(state: GameState): boolean {
  return state.level >= UNLOCK_LEVEL.breeding;
}

/** Minutes until a laid egg hatches: max(10, growMinutes / 4). */
export function hatchMinutes(speciesId: SpeciesId): number {
  return Math.max(BREEDING.eggMinMinutes, SPECIES[speciesId].growMinutes / BREEDING.eggGrowDivisor);
}

/** Ms of breeding cooldown left (0 when ready). */
export function breedCooldownLeft(fish: Fish, now: number): number {
  if (fish.lastBredAt === null) return 0;
  return Math.max(0, fish.lastBredAt + BREEDING.cooldownMs - now);
}

/** A single fish's readiness: adult, happiness ≥ 80, hunger ≥ 50, off cooldown. */
export function canBreed(fish: Fish, now: number): boolean {
  return (
    fish.stage === 'adult' &&
    fish.happiness >= BREEDING.minHappiness &&
    fish.hunger >= BREEDING.minHunger &&
    breedCooldownLeft(fish, now) === 0
  );
}

/** True if `now` is the first moment at or past a 5-minute boundary since `now - dtMs`. */
export function isBreedingCheckDue(now: number, dtMs: number): boolean {
  const interval = BREEDING.checkIntervalMs;
  return Math.floor(now / interval) > Math.floor((now - dtMs) / interval);
}

/** All eligible same-species pairs in a tank (each unordered pair once, in fish-list order). */
export function eligiblePairs(state: GameState, tankId: string, now: number): [Fish, Fish][] {
  const ready = state.fish.filter((f) => f.tankId === tankId && canBreed(f, now));
  const pairs: [Fish, Fish][] = [];
  for (let i = 0; i < ready.length; i++) {
    for (let j = i + 1; j < ready.length; j++) {
      const a = ready[i]!;
      const b = ready[j]!;
      if (a.speciesId === b.speciesId) pairs.push([a, b]);
    }
  }
  return pairs;
}

/** True if `fish` is ready and has at least one ready partner of its species in its tank. */
export function hasReadyPartner(state: GameState, fish: Fish, now: number): boolean {
  return state.fish.some((o) => o.id !== fish.id && o.tankId === fish.tankId && o.speciesId === fish.speciesId && canBreed(o, now));
}

/** 45% parent A's variant, 45% parent B's, 10% a random variant of the species. */
export function offspringVariant(a: Fish, b: Fish, rng: Rng): string {
  const roll = rng();
  if (roll < BREEDING.variantParentAChance) return a.variant;
  if (roll < BREEDING.variantParentAChance + BREEDING.variantParentBChance) return b.variant;
  return randomVariantKey(a.speciesId, rng);
}

/** 3% shiny, or 10% if either parent is shiny. */
export function offspringShiny(a: Fish, b: Fish, rng: Rng): boolean {
  const chance = a.shiny || b.shiny ? BREEDING.shinyChanceShinyParent : BREEDING.shinyChance;
  return rng() < chance;
}

export interface EggLaid {
  egg: Egg;
  parentIds: [string, string];
}

/**
 * One breeding check across all tanks. Each eligible pair has a 25% chance to lay one egg,
 * if the tank still has a free slot (eggs count toward capacity). Laying starts both parents'
 * 60-minute cooldown, so a fish lays at most one egg per check.
 */
export function runBreedingCheck(
  state: GameState,
  now: number,
  rng: Rng,
  newId: (prefix: string) => string,
): { state: GameState; laid: EggLaid[] } {
  if (!breedingUnlocked(state)) return { state, laid: [] };
  let fish = state.fish;
  const eggs = [...state.eggs];
  const laid: EggLaid[] = [];

  for (const tank of state.tanks) {
    for (const [a0, b0] of eligiblePairs({ ...state, fish, eggs }, tank.id, now)) {
      // Re-read parents: an earlier pair this check may have started their cooldown.
      const a = fish.find((f) => f.id === a0.id)!;
      const b = fish.find((f) => f.id === b0.id)!;
      if (!canBreed(a, now) || !canBreed(b, now)) continue;
      const occupancy = fish.filter((f) => f.tankId === tank.id).length + eggs.filter((e) => e.tankId === tank.id).length;
      if (occupancy >= tank.capacity) break;
      if (rng() >= BREEDING.chancePerPair) continue;

      const egg: Egg = {
        id: newId('egg'),
        speciesId: a.speciesId,
        variant: offspringVariant(a, b, rng),
        shiny: offspringShiny(a, b, rng),
        tankId: tank.id,
        hatchAt: now + hatchMinutes(a.speciesId) * MINUTE_MS,
      };
      eggs.push(egg);
      fish = fish.map((f) => (f.id === a.id || f.id === b.id ? { ...f, lastBredAt: now } : f));
      laid.push({ egg, parentIds: [a.id, b.id] });
    }
  }
  return laid.length === 0 ? { state, laid } : { state: { ...state, fish, eggs }, laid };
}
