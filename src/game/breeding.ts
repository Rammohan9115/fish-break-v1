// Breeding (unlocks at L5): player-driven, never a hidden roll. The player pairs two ready fish, they
// court for a minute, and an egg is guaranteed. Randomness only picks the baby's color and shininess.
// Pure: decisions depend only on (state, now, rng).
import { startBondFor } from './bond';
import { BREEDING, MINUTE_MS, TANK_EDGE_MARGIN, TANK_WIDTH, UNLOCK_LEVEL } from './constants';
import { stageProgress } from './sim';
import { randomVariantKey, SPECIES } from './species';
import type { Courtship, Egg, Fish, GameState, Rng, SpeciesId } from './types';

export function breedingUnlocked(state: GameState): boolean {
  return state.level >= UNLOCK_LEVEL.breeding;
}

/** Minutes until a laid egg hatches: max(5, growMinutes / 6). */
export function hatchMinutes(speciesId: SpeciesId): number {
  return Math.max(BREEDING.eggMinMinutes, SPECIES[speciesId].growMinutes / BREEDING.eggGrowDivisor);
}

/** Ms of breeding cooldown left (0 when rested). */
export function breedCooldownLeft(fish: Fish, now: number): number {
  if (fish.lastBredAt === null) return 0;
  return Math.max(0, fish.lastBredAt + BREEDING.cooldownMs - now);
}

/** The courtship a fish is in, if any. */
export function courtshipOf(state: GameState, fishId: string): Courtship | null {
  return state.courtships.find((c) => c.fishIds.includes(fishId)) ?? null;
}

export function isCourting(state: GameState, fishId: string): boolean {
  return courtshipOf(state, fishId) !== null;
}

/** A fish's own readiness: adult, happiness ≥ 70, hunger ≥ 40, rested. */
export function canBreed(fish: Fish, now: number): boolean {
  return (
    fish.stage === 'adult' &&
    fish.happiness >= BREEDING.minHappiness &&
    fish.hunger >= BREEDING.minHunger &&
    breedCooldownLeft(fish, now) === 0
  );
}

/** Ready and free to start a courtship (not already in one). */
export function isReadyToPair(state: GameState, fish: Fish, now: number): boolean {
  return canBreed(fish, now) && !isCourting(state, fish.id);
}

/** Fish `fish` can pair with right now: same tank and species, ready, not courting, not itself. */
export function compatiblePartners(state: GameState, fish: Fish, now: number): Fish[] {
  return state.fish.filter(
    (o) => o.id !== fish.id && o.tankId === fish.tankId && o.speciesId === fish.speciesId && isReadyToPair(state, o, now),
  );
}

// ---------------------------------------------------------------------------
// The FishCard checklist
// ---------------------------------------------------------------------------

export type CheckKey = 'adult' | 'happy' | 'fed' | 'rested' | 'partner';

export interface CheckLine {
  key: CheckKey;
  ok: boolean;
  /** What's missing and how to fix it (shown under a ❌), or a short confirmation for a ✅. */
  hint: string;
  /** The partner line can offer a shortcut to buy one. */
  action?: 'buy';
}

export interface Checklist {
  lines: CheckLine[];
  /** Every line is ✅ (and the fish isn't already courting). */
  canPair: boolean;
  partners: Fish[];
}

function minutes(ms: number): string {
  const m = Math.ceil(ms / MINUTE_MS);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

/** Why a fish isn't ready, in a few words (for partner hints and the "Almost ready" list). */
export function notReadyReasons(fish: Fish, now: number): string[] {
  const reasons: string[] = [];
  if (fish.stage !== 'adult') reasons.push('still growing');
  if (fish.happiness < BREEDING.minHappiness) reasons.push('needs to be happier');
  if (fish.hunger < BREEDING.minHunger) reasons.push('hungry');
  if (breedCooldownLeft(fish, now) > 0) reasons.push(`resting ${minutes(breedCooldownLeft(fish, now))}`);
  return reasons;
}

/** The five checklist lines for a fish, each ✅/❌ with a fix hint. */
export function breedingChecklist(state: GameState, fish: Fish, now: number): Checklist {
  const species = SPECIES[fish.speciesId].name;
  const lines: CheckLine[] = [];

  const adult = fish.stage === 'adult';
  let growHint = 'Grown up';
  if (!adult) {
    const p = stageProgress(fish, now);
    growHint = !p.growing
      ? 'Too hungry to grow — feed it'
      : p.nextStage === 'adult' && p.secondsRemaining !== null
        ? `Grows up in ${minutes(p.secondsRemaining * 1000)}`
        : 'Still a youngster — growing up';
  }
  lines.push({ key: 'adult', ok: adult, hint: growHint });

  const happy = fish.happiness >= BREEDING.minHappiness;
  lines.push({
    key: 'happy',
    ok: happy,
    hint: happy ? `Happiness ${Math.round(fish.happiness)}` : `Happiness ${Math.floor(fish.happiness)}/${BREEDING.minHappiness} — clean the tank or add decor`,
  });

  const fed = fish.hunger >= BREEDING.minHunger;
  lines.push({ key: 'fed', ok: fed, hint: fed ? 'Well fed' : 'Feed a few pellets' });

  const cooldown = breedCooldownLeft(fish, now);
  lines.push({ key: 'rested', ok: cooldown === 0, hint: cooldown === 0 ? 'Rested' : `Ready again in ${minutes(cooldown)}` });

  const partners = compatiblePartners(state, fish, now);
  if (partners.length > 0) {
    lines.push({ key: 'partner', ok: true, hint: partners.length === 1 ? `${partners[0]!.name} is ready too` : `${partners.length} partners ready` });
  } else {
    const sameTank = state.fish.filter((o) => o.id !== fish.id && o.speciesId === fish.speciesId && o.tankId === fish.tankId && o.stage === 'adult');
    const elsewhere = state.fish.find((o) => o.id !== fish.id && o.speciesId === fish.speciesId && o.tankId !== fish.tankId && o.stage === 'adult');
    const busy = sameTank.find((o) => isCourting(state, o.id));
    const almost = sameTank.find((o) => !isCourting(state, o.id));
    if (almost) {
      lines.push({ key: 'partner', ok: false, hint: `${almost.name} isn't ready: ${notReadyReasons(almost, now).join(', ')}` });
    } else if (busy) {
      lines.push({ key: 'partner', ok: false, hint: `${busy.name} is busy courting — wait a moment` });
    } else if (elsewhere) {
      const tank = state.tanks.find((t) => t.id === elsewhere.tankId);
      lines.push({ key: 'partner', ok: false, hint: `${elsewhere.name} is in ${tank?.name ?? 'another tank'} — move them together` });
    } else {
      lines.push({ key: 'partner', ok: false, hint: `Needs another adult ${species}`, action: 'buy' });
    }
  }

  const canPair = lines.every((l) => l.ok) && !isCourting(state, fish.id) && breedingUnlocked(state);
  return { lines, canPair, partners };
}

// ---------------------------------------------------------------------------
// Courtship → egg
// ---------------------------------------------------------------------------

export type CourtshipError = 'locked' | 'notFound' | 'incompatible' | 'notReady';

/** A stable spot on the sand for a pair (used when the renderer doesn't supply one). */
export function defaultPairSpot(aId: string, bId: string): number {
  let h = 0;
  for (const ch of aId + bId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const margin = TANK_EDGE_MARGIN * 2;
  return margin + ((h % 1000) / 1000) * (TANK_WIDTH - margin * 2);
}

/** Why two fish can't start courting (null = they can). */
export function checkCourtship(state: GameState, aId: string, bId: string, now: number): CourtshipError | null {
  if (!breedingUnlocked(state)) return 'locked';
  const a = state.fish.find((f) => f.id === aId);
  const b = state.fish.find((f) => f.id === bId);
  if (!a || !b || a.id === b.id) return 'notFound';
  if (a.speciesId !== b.speciesId || a.tankId !== b.tankId) return 'incompatible';
  if (!isReadyToPair(state, a, now) || !isReadyToPair(state, b, now)) return 'notReady';
  return null;
}

/** Starts a courtship; the egg is laid when it ends (live or offline). */
export function startCourtship(
  state: GameState,
  aId: string,
  bId: string,
  now: number,
  x: number = defaultPairSpot(aId, bId),
): { ok: true; state: GameState; courtship: Courtship } | { ok: false; reason: CourtshipError } {
  const error = checkCourtship(state, aId, bId, now);
  if (error) return { ok: false, reason: error };
  const a = state.fish.find((f) => f.id === aId)!;
  const courtship: Courtship = {
    id: `court-${now.toString(36)}-${aId}`,
    tankId: a.tankId,
    fishIds: [aId, bId],
    startedAt: now,
    endsAt: now + BREEDING.courtshipMs,
    x: Math.min(TANK_WIDTH - TANK_EDGE_MARGIN, Math.max(TANK_EDGE_MARGIN, x)),
  };
  return { ok: true, state: { ...state, courtships: [...state.courtships, courtship] }, courtship };
}

/** 45% parent A's variant, 45% parent B's, 10% a random variant of the species. */
export function offspringVariant(a: Fish, b: Fish, rng: Rng): string {
  const roll = rng();
  if (roll < BREEDING.variantParentAChance) return a.variant;
  if (roll < BREEDING.variantParentAChance + BREEDING.variantParentBChance) return b.variant;
  return randomVariantKey(a.speciesId, rng);
}

/** 3% shiny, or 10% if either parent is shiny. */
export function shinyChance(a: Fish, b: Fish): number {
  return a.shiny || b.shiny ? BREEDING.shinyChanceShinyParent : BREEDING.shinyChance;
}

export function offspringShiny(a: Fish, b: Fish, rng: Rng): boolean {
  return rng() < shinyChance(a, b);
}

/** Chance of each baby color for a pair (same rules as offspringVariant), largest first. */
export function babyColorOdds(a: Fish, b: Fish): { variant: string; chance: number }[] {
  const variants = SPECIES[a.speciesId].variants;
  const random = 1 - BREEDING.variantParentAChance - BREEDING.variantParentBChance;
  const odds = new Map<string, number>();
  for (const v of variants) odds.set(v.key, random / variants.length);
  odds.set(a.variant, (odds.get(a.variant) ?? 0) + BREEDING.variantParentAChance);
  odds.set(b.variant, (odds.get(b.variant) ?? 0) + BREEDING.variantParentBChance);
  return [...odds.entries()].map(([variant, chance]) => ({ variant, chance })).sort((x, y) => y.chance - x.chance);
}

export interface EggLaid {
  egg: Egg;
  parentIds: [string, string];
}

/**
 * Finishes every courtship that ended by `now`: one egg (guaranteed) at the pair's spot, and both
 * parents start their cooldown from the moment it ended. A courtship whose fish are gone just ends.
 */
export function completeCourtships(
  state: GameState,
  now: number,
  rng: Rng,
  newId: (prefix: string) => string,
): { state: GameState; laid: EggLaid[] } {
  const due = state.courtships.filter((c) => c.endsAt <= now);
  if (due.length === 0) return { state, laid: [] };
  let fish = state.fish;
  const eggs = [...state.eggs];
  const laid: EggLaid[] = [];
  for (const c of due) {
    const a = fish.find((f) => f.id === c.fishIds[0]);
    const b = fish.find((f) => f.id === c.fishIds[1]);
    if (!a || !b) continue;
    const egg: Egg = {
      id: newId('egg'),
      speciesId: a.speciesId,
      variant: offspringVariant(a, b, rng),
      shiny: offspringShiny(a, b, rng),
      tankId: c.tankId,
      hatchAt: c.endsAt + hatchMinutes(a.speciesId) * MINUTE_MS,
      x: c.x,
    };
    const startBond = startBondFor(a, b);
    if (startBond > 0) egg.startBond = startBond;
    eggs.push(egg);
    fish = fish.map((f) => (f.id === a.id || f.id === b.id ? { ...f, lastBredAt: c.endsAt } : f));
    laid.push({ egg, parentIds: [a.id, b.id] });
  }
  return { state: { ...state, fish, eggs, courtships: state.courtships.filter((c) => c.endsAt > now) }, laid };
}

// ---------------------------------------------------------------------------
// "Your first baby" quest
// ---------------------------------------------------------------------------

export type QuestStep = 'getPair' | 'makeReady' | 'tapFish' | 'pairUp' | 'pickPartner' | 'confirm' | 'wait';

export interface QuestUi {
  selectedFishId: string | null;
  pairingFishId: string | null;
  sheetOpen: boolean;
}

/** The quest's current step and the fish to point at, or null when the quest isn't running. */
export function breedingQuestStep(state: GameState, ui: QuestUi, now: number): { step: QuestStep; fishId: string | null } | null {
  if (state.breedingQuest.status !== 'active' || !breedingUnlocked(state)) return null;
  if (state.courtships.length > 0 || state.eggs.length > 0) return { step: 'wait', fishId: null };
  if (ui.sheetOpen) return { step: 'confirm', fishId: null };
  const inTank = state.fish.filter((f) => f.tankId === state.activeTankId);
  if (ui.pairingFishId) {
    const chosen = inTank.find((f) => f.id === ui.pairingFishId);
    const partner = chosen ? compatiblePartners(state, chosen, now)[0] : undefined;
    return { step: 'pickPartner', fishId: partner?.id ?? null };
  }
  const ready = inTank.find((f) => isReadyToPair(state, f, now) && compatiblePartners(state, f, now).length > 0);
  if (ready) {
    const selected = inTank.find((f) => f.id === ui.selectedFishId);
    if (selected && isReadyToPair(state, selected, now) && compatiblePartners(state, selected, now).length > 0) return { step: 'pairUp', fishId: null };
    return { step: 'tapFish', fishId: ready.id };
  }
  const bySpecies = new Map<SpeciesId, number>();
  for (const f of inTank) if (f.stage === 'adult') bySpecies.set(f.speciesId, (bySpecies.get(f.speciesId) ?? 0) + 1);
  if ([...bySpecies.values()].some((n) => n >= 2)) return { step: 'makeReady', fishId: null };
  return { step: 'getPair', fishId: null };
}
