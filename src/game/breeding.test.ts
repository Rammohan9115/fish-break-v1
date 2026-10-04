import { describe, expect, it } from 'vitest';
import {
  babyColorOdds,
  breedCooldownLeft,
  breedingChecklist,
  breedingQuestStep,
  breedingUnlocked,
  canBreed,
  checkCourtship,
  compatiblePartners,
  completeCourtships,
  hatchMinutes,
  isReadyToPair,
  offspringShiny,
  offspringVariant,
  shinyChance,
  startCourtship,
} from './breeding';
import { BREEDING, MINUTE_MS, XP } from './constants';
import { simulateOffline, tick } from './sim';
import { SPECIES } from './species';
import { constRng, makeFish, makeState, makeTank, seededRng, T0 } from './testUtils';
import type { Fish, GameState } from './types';

const ready = (o: Partial<Fish> = {}) => makeFish({ stage: 'adult', growth: 1200, hunger: 90, happiness: 90, lastBredAt: null, ...o });

let seq = 0;
const newId = (prefix: string) => `${prefix}-${++seq}`;

function breedState(fish: Fish[], o: { level?: number; capacity?: number; overrides?: Partial<GameState> } = {}): GameState {
  return makeState({ fish, tank: { capacity: o.capacity ?? 10 }, overrides: { level: o.level ?? 5, lastTickAt: T0, ...o.overrides } });
}

const lineOf = (state: GameState, fish: Fish, key: string) => breedingChecklist(state, fish, T0).lines.find((l) => l.key === key)!;

describe('unlock', () => {
  it('breeding unlocks at level 5', () => {
    expect(breedingUnlocked(makeState({ overrides: { level: 4 } }))).toBe(false);
    expect(breedingUnlocked(makeState({ overrides: { level: 5 } }))).toBe(true);
  });

  it('pairing is refused below level 5 even when both fish are ready', () => {
    const a = ready();
    const b = ready();
    expect(checkCourtship(breedState([a, b], { level: 4 }), a.id, b.id, T0)).toBe('locked');
  });
});

describe('readiness', () => {
  it('needs adult, happiness ≥ 70, hunger ≥ 40, and 30 minutes since breeding', () => {
    expect(canBreed(ready(), T0)).toBe(true);
    expect(canBreed(ready({ stage: 'juvenile' }), T0)).toBe(false);
    expect(canBreed(ready({ happiness: 69.9 }), T0)).toBe(false);
    expect(canBreed(ready({ happiness: 70 }), T0)).toBe(true);
    expect(canBreed(ready({ hunger: 39.9 }), T0)).toBe(false);
    expect(canBreed(ready({ hunger: 40 }), T0)).toBe(true);
    const bred = ready({ lastBredAt: T0 });
    expect(canBreed(bred, T0 + 30 * MINUTE_MS - 1)).toBe(false);
    expect(canBreed(bred, T0 + 30 * MINUTE_MS)).toBe(true);
    expect(breedCooldownLeft(bred, T0 + 12 * MINUTE_MS)).toBe(18 * MINUTE_MS);
  });

  it('jellies breed like every other species', () => {
    const a = ready({ speciesId: 'jellyfish', growth: 100 * 60 });
    const b = ready({ speciesId: 'jellyfish', growth: 100 * 60 });
    const goldfish = ready({ speciesId: 'goldfish' });
    const s = breedState([a, b, goldfish]);
    expect(canBreed(a, T0)).toBe(true);
    expect(compatiblePartners(s, a, T0).map((f) => f.id)).toEqual([b.id]);
    expect(compatiblePartners(s, goldfish, T0)).toEqual([]);
    expect(checkCourtship(s, a.id, goldfish.id, T0)).not.toBeNull();
    const started = startCourtship(s, a.id, b.id, T0);
    expect(started.ok).toBe(true);
    // The egg's baby is a jelly in one of the jelly variants.
    expect(babyColorOdds(a, b).every((o) => SPECIES.jellyfish.variants.some((v) => v.key === o.variant))).toBe(true);
  });

  it('partners must be ready, same species, same tank, and not courting', () => {
    const a = ready();
    const twin = ready();
    const otherSpecies = ready({ speciesId: 'guppy' });
    const otherTank = ready({ tankId: 'tank-2' });
    const sad = ready({ happiness: 30 });
    const s = breedState([a, twin, otherSpecies, otherTank, sad]);
    expect(compatiblePartners(s, a, T0).map((f) => f.id)).toEqual([twin.id]);
    const courting = startCourtship(s, twin.id, a.id, T0);
    expect(courting.ok).toBe(true);
    if (courting.ok) expect(isReadyToPair(courting.state, twin, T0)).toBe(false);
  });
});

describe('checklist', () => {
  it('every line is ✅ for a ready fish with a ready partner, so Pair up is enabled', () => {
    const a = ready();
    const b = ready({ name: 'Goldie' });
    const list = breedingChecklist(breedState([a, b]), a, T0);
    expect(list.lines.map((l) => [l.key, l.ok])).toEqual([
      ['adult', true],
      ['happy', true],
      ['fed', true],
      ['rested', true],
      ['partner', true],
    ]);
    expect(list.canPair).toBe(true);
    expect(list.lines[4]!.hint).toBe('Goldie is ready too');
  });

  it('a youngster says when it grows up', () => {
    const kid = ready({ stage: 'juvenile', growth: 800, hunger: 90, happiness: 50 });
    const line = lineOf(breedState([kid, ready()]), kid, 'adult');
    expect(line.ok).toBe(false);
    expect(line.hint).toMatch(/^Grows up in \d+ min$/);
  });

  it('happiness shows the number and how to fix it', () => {
    const a = ready({ happiness: 55.4 });
    expect(lineOf(breedState([a, ready()]), a, 'happy')).toEqual({ key: 'happy', ok: false, hint: 'Happiness 55/70 — clean the tank or add decor' });
  });

  it('hunger says to feed', () => {
    const a = ready({ hunger: 20 });
    expect(lineOf(breedState([a, ready()]), a, 'fed')).toEqual({ key: 'fed', ok: false, hint: 'Feed a few pellets' });
  });

  it('cooldown counts down in minutes', () => {
    const a = ready({ lastBredAt: T0 - 12 * MINUTE_MS });
    expect(lineOf(breedState([a, ready()]), a, 'rested')).toEqual({ key: 'rested', ok: false, hint: 'Ready again in 18 min' });
  });

  it('a lone fish needs another adult of its species, with a buy shortcut', () => {
    const a = ready({ speciesId: 'goldfish' });
    expect(lineOf(breedState([a]), a, 'partner')).toEqual({ key: 'partner', ok: false, hint: 'Needs another adult Goldfish', action: 'buy' });
  });

  it('names the partner and what it needs when it isn’t ready', () => {
    const a = ready();
    const b = ready({ name: 'Goldie', hunger: 10 });
    const line = lineOf(breedState([a, b]), a, 'partner');
    expect(line.ok).toBe(false);
    expect(line.hint).toBe("Goldie isn't ready: hungry");
  });

  it('points at a partner in another tank', () => {
    const a = ready();
    const b = ready({ name: 'Goldie', tankId: 'tank-2' });
    const s = { ...breedState([a, b]), tanks: [makeTank(), makeTank({ id: 'tank-2', name: 'Pond Two' })] };
    expect(lineOf(s, a, 'partner').hint).toBe('Goldie is in Pond Two — move them together');
  });

  it('Pair up stays disabled when any line is ❌', () => {
    const a = ready({ hunger: 10 });
    expect(breedingChecklist(breedState([a, ready()]), a, T0).canPair).toBe(false);
  });
});

describe('courtship', () => {
  it('validates both fish', () => {
    const a = ready();
    const b = ready();
    const g = ready({ speciesId: 'guppy' });
    const s = breedState([a, b, g, ready({ hunger: 5, id: 'hungry' })]);
    expect(checkCourtship(s, a.id, b.id, T0)).toBeNull();
    expect(checkCourtship(s, a.id, g.id, T0)).toBe('incompatible');
    expect(checkCourtship(s, a.id, 'hungry', T0)).toBe('notReady');
    expect(checkCourtship(s, a.id, a.id, T0)).toBe('notFound');
    expect(checkCourtship(s, a.id, 'missing', T0)).toBe('notFound');
  });

  it('guarantees an egg after 60 seconds at the pair’s spot, and starts both cooldowns', () => {
    const a = ready({ variant: 'zebra' });
    const b = ready({ variant: 'zebra' });
    const started = startCourtship(breedState([a, b]), a.id, b.id, T0, 420);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    let s = started.state;
    // 59 one-second ticks: still courting, no egg.
    for (let i = 0; i < 59; i++) s = tick(s, 1000, seededRng(i)).state;
    expect(s.eggs).toHaveLength(0);
    expect(s.courtships).toHaveLength(1);
    // Even if they got hungry during the courtship, the egg still comes.
    s = { ...s, fish: s.fish.map((f) => ({ ...f, hunger: 5 })) };
    const r = tick(s, 1000, seededRng(99));
    expect(r.state.courtships).toHaveLength(0);
    expect(r.state.eggs).toHaveLength(1);
    const egg = r.state.eggs[0]!;
    expect(egg).toMatchObject({ speciesId: 'danio', variant: 'zebra', x: 420, hatchAt: T0 + BREEDING.courtshipMs + hatchMinutes('danio') * MINUTE_MS });
    expect(r.state.fish.every((f) => f.lastBredAt === T0 + BREEDING.courtshipMs)).toBe(true);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'eggLaid', eggId: egg.id, parentIds: [a.id, b.id] }));
  });

  it('completes during offline catch-up, and the egg hatches later in the same catch-up', () => {
    const a = ready({ hunger: 100 });
    const b = ready({ hunger: 100 });
    const started = startCourtship(breedState([a, b]), a.id, b.id, T0);
    if (!started.ok) throw new Error('should start');
    const { state, summary } = simulateOffline(started.state, T0 + 30 * MINUTE_MS, seededRng(4));
    expect(summary.eggsLaid).toBe(1);
    expect(summary.eggsHatched).toBe(1);
    expect(state.courtships).toHaveLength(0);
    expect(state.eggs).toHaveLength(0);
    expect(state.fish).toHaveLength(3);
  });

  it('a courtship whose fish are gone ends quietly without an egg', () => {
    const a = ready();
    const b = ready();
    const started = startCourtship(breedState([a, b]), a.id, b.id, T0);
    if (!started.ok) throw new Error('should start');
    const gone = { ...started.state, fish: [a] };
    const r = completeCourtships(gone, T0 + BREEDING.courtshipMs, constRng(0), newId);
    expect(r.laid).toHaveLength(0);
    expect(r.state.courtships).toHaveLength(0);
  });

  it('parents can court again only after their 30-minute rest', () => {
    const a = ready();
    const b = ready();
    const s = breedState([a, b]);
    const first = startCourtship(s, a.id, b.id, T0);
    if (!first.ok) throw new Error('should start');
    const done = completeCourtships(first.state, T0 + BREEDING.courtshipMs, constRng(0.5), newId).state;
    const end = T0 + BREEDING.courtshipMs;
    expect(checkCourtship(done, a.id, b.id, end + 29 * MINUTE_MS)).toBe('notReady');
    expect(checkCourtship(done, a.id, b.id, end + 30 * MINUTE_MS)).toBeNull();
  });
});

describe('hatching', () => {
  it('hatches in max(5, growMinutes / 6) minutes', () => {
    expect(hatchMinutes('danio')).toBe(5); // 20/6 ≈ 3.3 → 5
    expect(hatchMinutes('goldfish')).toBe(7.5);
    expect(hatchMinutes('axolotl')).toBe(40);
    expect(hatchMinutes('koi')).toBe(50);
    for (const sp of Object.values(SPECIES)) expect(hatchMinutes(sp.id)).toBeGreaterThanOrEqual(5);
  });

  it('a shiny egg hatches into a shiny fish and gives +2 pearls and hatch XP', () => {
    const s: GameState = { ...breedState([]), eggs: [{ id: 'e1', speciesId: 'danio', variant: 'mint', shiny: true, tankId: 'tank-1', hatchAt: T0 + 500 }] };
    const r = tick(s, 1000, seededRng(1));
    expect(r.state.fish[0]!.shiny).toBe(true);
    expect(r.state.pearls).toBe(s.pearls + BREEDING.shinyHatchPearls);
    expect(r.state.xp).toBe(s.xp + XP.eggHatched);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'hatched', destination: 'tank', shiny: true }));
  });
});

describe('inheritance', () => {
  const a = ready({ variant: 'zebra' });
  const b = ready({ variant: 'peach' });

  it('45% parent A, 45% parent B, 10% random', () => {
    expect(offspringVariant(a, b, constRng(0.44))).toBe('zebra');
    expect(offspringVariant(a, b, constRng(0.45))).toBe('peach');
    expect(offspringVariant(a, b, constRng(0.899))).toBe('peach');
    const rolls = [0.95, 0.99];
    expect(offspringVariant(a, b, () => rolls.shift()!)).toBe(SPECIES.danio.variants[SPECIES.danio.variants.length - 1]!.key);
  });

  it('a seeded run matches the advertised odds', () => {
    const rng = seededRng(3);
    const counts: Record<string, number> = {};
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const v = offspringVariant(a, b, rng);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const { variant, chance } of babyColorOdds(a, b)) expect((counts[variant] ?? 0) / n).toBeCloseTo(chance, 1);
  });

  it('the confirm sheet odds add up to 100% and favor the parents', () => {
    const odds = babyColorOdds(a, b);
    expect(odds.reduce((sum, o) => sum + o.chance, 0)).toBeCloseTo(1);
    expect(odds.slice(0, 2).map((o) => o.variant).sort()).toEqual(['peach', 'zebra']);
    const same = babyColorOdds(a, ready({ variant: 'zebra' }));
    expect(same[0]).toEqual({ variant: 'zebra', chance: expect.closeTo(0.9 + 0.1 / SPECIES.danio.variants.length, 6) });
  });

  it('shiny chance is 3%, or 10% with a shiny parent', () => {
    expect(shinyChance(a, b)).toBe(0.03);
    expect(offspringShiny(a, b, constRng(0.0299))).toBe(true);
    expect(offspringShiny(a, b, constRng(0.03))).toBe(false);
    const shinyParent = ready({ shiny: true });
    expect(shinyChance(shinyParent, b)).toBe(0.1);
    expect(offspringShiny(a, shinyParent, constRng(0.0999))).toBe(true);
    expect(offspringShiny(shinyParent, b, constRng(0.1))).toBe(false);
  });
});

describe('first-baby quest steps', () => {
  const ui = { selectedFishId: null, pairingFishId: null, sheetOpen: false };
  const active = { breedingQuest: { guideSeen: true, status: 'active' as const } };

  it('walks from getting a pair to waiting for the egg', () => {
    expect(breedingQuestStep(breedState([ready()], { overrides: active }), ui, T0)?.step).toBe('getPair');
    const a = ready({ hunger: 10 });
    const b = ready();
    expect(breedingQuestStep(breedState([a, b], { overrides: active }), ui, T0)?.step).toBe('makeReady');
    const c = ready();
    const d = ready();
    const s = breedState([c, d], { overrides: active });
    expect(breedingQuestStep(s, ui, T0)).toEqual({ step: 'tapFish', fishId: c.id });
    expect(breedingQuestStep(s, { ...ui, selectedFishId: c.id }, T0)?.step).toBe('pairUp');
    expect(breedingQuestStep(s, { ...ui, pairingFishId: c.id }, T0)).toEqual({ step: 'pickPartner', fishId: d.id });
    expect(breedingQuestStep(s, { ...ui, sheetOpen: true }, T0)?.step).toBe('confirm');
    const courting = startCourtship(s, c.id, d.id, T0);
    if (!courting.ok) throw new Error('should start');
    expect(breedingQuestStep(courting.state, ui, T0)?.step).toBe('wait');
  });

  it('is silent unless the quest is active', () => {
    expect(breedingQuestStep(breedState([ready(), ready()]), ui, T0)).toBeNull();
  });
});

describe('first-baby quest reward', () => {
  it('pays 50 shells + 1 pearl on the first hatch while active, and only once', () => {
    const eggAt = (id: string, hatchAt: number) => ({ id, speciesId: 'danio' as const, variant: 'zebra', shiny: false, tankId: 'tank-1', hatchAt });
    const s = breedState([], { overrides: { breedingQuest: { guideSeen: true, status: 'active' }, eggs: [eggAt('e1', T0 + 500), eggAt('e2', T0 + 1500)] } });
    const first = tick(s, 1000, seededRng(1));
    expect(first.state.breedingQuest.status).toBe('done');
    expect(first.state.shells).toBe(s.shells + 50);
    expect(first.state.pearls).toBe(s.pearls + 1);
    expect(first.events).toContainEqual({ type: 'questComplete', shells: 50, pearls: 1 });
    const second = tick(first.state, 1000, seededRng(2));
    expect(second.state.shells).toBe(first.state.shells);
    expect(second.events.some((e) => e.type === 'questComplete')).toBe(false);
  });

  it('pays nothing when the quest isn’t running', () => {
    const s = breedState([], { overrides: { eggs: [{ id: 'e', speciesId: 'danio', variant: 'zebra', shiny: false, tankId: 'tank-1', hatchAt: T0 + 500 }] } });
    expect(tick(s, 1000, seededRng(1)).state.shells).toBe(s.shells);
  });
});
