// Rescue engine (pure): taking/pausing/resuming a case, evaluating care tasks from game events,
// the one-stage-per-day rule, and completion. Nothing here can fail a player: skipped days just pause the story.
import { createFish, growthTotalSeconds } from '../sim';
import type { CareItemId, GameState, Letter, RescueCaseState, RescueState, Rng } from '../types';
import { makeLetter } from './init';
import { getRescue } from './registry';
import type { CareTask, RescueDef, StageVisual } from './types';

export const CARE_ITEMS: Record<CareItemId, { name: string; icon: string; price: number }> = {
  soft_food: { name: 'Soft food', icon: '🥣', price: 15 },
  healing_moss: { name: 'Healing moss', icon: '🌿', price: 20 },
  vitamin_flakes: { name: 'Vitamin flakes', icon: '💊', price: 20 },
};
export const CARE_ITEM_IDS = Object.keys(CARE_ITEMS) as CareItemId[];
export const STARTER_KIT = 2;

/** A game moment the rescue and daily systems care about. */
export type GameEvent =
  | { type: 'useItem'; itemId: CareItemId; fishId: string }
  | { type: 'pet'; fishId: string; seconds: number }
  | { type: 'feed'; hour: number }
  | { type: 'breakMinutes'; minutes: number }
  | { type: 'interact'; actionId: string; fishId?: string }
  | { type: 'play'; seconds: number }
  | { type: 'shellCollected' }
  | { type: 'algaeWiped' }
  | { type: 'pelletDissolved' }
  | { type: 'decorPlaced' }
  | { type: 'hatched' }
  | { type: 'bondUp' }
  | { type: 'check' };

export interface EngineResult {
  state: GameState;
  /** Friendly toasts to show. */
  toasts: string[];
  /** Fish that just finished a stage (sparkle-heal) or the whole rescue. */
  healed: { fishId: string; done: boolean }[];
}

export const isNight = (hour: number): boolean => hour >= 20 || hour < 6;

// ---------------------------------------------------------------------------
// Task evaluation
// ---------------------------------------------------------------------------

export function taskTarget(task: CareTask): number {
  switch (task.type) {
    case 'placeDecor':
      return task.count ?? 1;
    case 'useItem':
    case 'pet':
    case 'ownSpecies':
    case 'interact':
      return task.count;
    case 'keepCleanliness':
    case 'noDissolve':
      return task.minutes * 60;
    case 'breakModeMinutes':
      return task.minutes;
    case 'feedAtTime':
    case 'changeSubstrate':
    case 'decorPresent':
      return 1;
  }
}

/** Tasks judged from the current state (not counted from events). */
const isSnapshot = (t: CareTask): boolean =>
  t.type === 'placeDecor' || t.type === 'ownSpecies' || t.type === 'changeSubstrate' || t.type === 'decorPresent';

export function snapshotValue(game: GameState, task: CareTask, fishId: string | null): number {
  switch (task.type) {
    case 'placeDecor':
      return game.tanks.reduce((n, t) => n + t.decor.filter((d) => task.decorIds.includes(d.decorId)).length, 0);
    case 'decorPresent':
      return game.tanks.some((t) => t.decor.some((d) => d.decorId === task.decorId)) ? 1 : 0;
    case 'ownSpecies':
      return game.fish.filter((f) => f.speciesId === task.speciesId && f.id !== fishId).length;
    case 'changeSubstrate': {
      const tankId = game.fish.find((f) => f.id === fishId)?.tankId ?? game.activeTankId;
      const tank = game.tanks.find((t) => t.id === tankId);
      return tank && task.substrateIds.includes(tank.style.substrate) ? 1 : 0;
    }
    default:
      return 0;
  }
}

/** Progress of task `i` in the active stage of a case, clamped to its target. */
export function taskValue(game: GameState, def: RescueDef, c: RescueCaseState, i: number): number {
  const task = def.stages[c.stage]?.tasks[i];
  if (!task) return 0;
  const raw = isSnapshot(task) ? snapshotValue(game, task, c.fishId) : (c.progress[i] ?? 0);
  return Math.min(taskTarget(task), raw);
}

export const taskDone = (game: GameState, def: RescueDef, c: RescueCaseState, i: number): boolean => {
  const task = def.stages[c.stage]?.tasks[i];
  return !!task && taskValue(game, def, c, i) >= taskTarget(task);
};

/** Whether the case can take progress today (a stage was already finished today → wait for tomorrow). */
export const stageOpen = (c: RescueCaseState, today: string): boolean => c.status === 'active' && c.stageDoneOn !== today;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withCase(game: GameState, id: string, c: RescueCaseState): GameState {
  return { ...game, rescue: { ...game.rescue, cases: { ...game.rescue.cases, [id]: c } } };
}

export const caseOf = (game: GameState, id: string): RescueCaseState | undefined => game.rescue.cases[id];

export function activeCase(game: GameState): { def: RescueDef; c: RescueCaseState } | null {
  const id = game.rescue.activeId;
  const def = id ? getRescue(id) : undefined;
  const c = id ? game.rescue.cases[id] : undefined;
  return def && c && c.status === 'active' ? { def, c } : null;
}

/** The fish a case is caring for (in the tank), if any. */
export const rescueFish = (game: GameState, caseId: string) => game.fish.find((f) => f.rescue?.caseId === caseId);

export function stageVisual(game: GameState, fishId: string): StageVisual | null {
  const fish = game.fish.find((f) => f.id === fishId);
  if (!fish?.rescue?.recovering) return null;
  const def = getRescue(fish.rescue.caseId);
  const c = game.rescue.cases[fish.rescue.caseId];
  const visual = def && c ? (def.stages[Math.min(c.stage, def.stages.length - 1)]?.visual ?? null) : null;
  let out = visual && def?.trustMeter && c ? { ...visual, trust: rescueTrust(game, def, c) } : visual;
  if (out && def?.colorRecovery && c) out = { ...out, desaturate: def.colorRecovery.from * (1 - rescueRecovery(game, def, c)) };
  return out;
}

/** 0..1 smooth recovery: finished tasks in full plus the partial progress of the current stage's tasks (so color returns immediately). */
export function rescueRecovery(game: GameState, def: RescueDef, c: RescueCaseState): number {
  if (c.status === 'done') return 1;
  const total = def.stages.reduce((n, s) => n + s.tasks.length, 0);
  if (total === 0) return 0;
  let done = def.stages.slice(0, c.stage).reduce((n, s) => n + s.tasks.length, 0);
  (def.stages[c.stage]?.tasks ?? []).forEach((task, i) => {
    done += taskValue(game, def, c, i) / taskTarget(task);
  });
  return Math.min(1, done / total);
}

/** 0..1 trust: the share of all care tasks done so far (earlier stages in full, plus the current stage's finished tasks). */
export function rescueTrust(game: GameState, def: RescueDef, c: RescueCaseState): number {
  if (c.status === 'done') return 1;
  const total = def.stages.reduce((n, s) => n + s.tasks.length, 0);
  if (total === 0) return 0;
  let done = def.stages.slice(0, c.stage).reduce((n, s) => n + s.tasks.length, 0);
  const tasks = def.stages[c.stage]?.tasks ?? [];
  tasks.forEach((_, i) => {
    if (taskDone(game, def, c, i)) done += 1;
  });
  return Math.min(1, done / total);
}

export { perksOf } from './registry';

// ---------------------------------------------------------------------------
// Taking, pausing, resuming
// ---------------------------------------------------------------------------

export type TakeResult = { ok: true; state: GameState; toasts: string[]; arrived: string } | { ok: false; reason: 'unknown' | 'done' | 'active' };

/** Why switching needs a confirm: another rescue is active. */
export const pausingOther = (game: GameState, id: string): boolean => !!game.rescue.activeId && game.rescue.activeId !== id;

/** Takes a new rescue or resumes a paused one. Any other active rescue is paused (its animal goes back to the center). */
export function takeRescue(game: GameState, id: string, now: number, rng: Rng): TakeResult {
  const def = getRescue(id);
  if (!def) return { ok: false, reason: 'unknown' };
  const existing = game.rescue.cases[id];
  if (existing?.status === 'done') return { ok: false, reason: 'done' };
  if (existing?.status === 'active') return { ok: false, reason: 'active' };
  const toasts: string[] = [];
  let state = game;
  if (state.rescue.activeId) state = pauseRescue(state, state.rescue.activeId, now, toasts);

  const tankId = state.activeTankId;
  const letters: Letter[] = [];
  let c: RescueCaseState;
  let fish;
  if (existing?.away) {
    fish = { ...existing.away, tankId };
    c = { ...existing, status: 'active', fishId: fish.id, away: null };
    toasts.push(`📬 ${def.name} is back in your tank.`);
  } else {
    const taken = state.fish.map((f) => f.name);
    fish = {
      ...createFish(def.speciesId, tankId, now, rng, { id: `rescue-${id}`, takenNames: taken }),
      name: def.name,
      stage: 'adult' as const,
      growth: growthTotalSeconds(def.speciesId),
      hunger: 70,
      happiness: 60,
    };
    c = { status: 'active', stage: 0, stageDoneOn: null, progress: [], fishId: fish.id, away: null };
    letters.push(makeLetter(id, def.intro.title, def.intro.body, now));
    toasts.push(`🩺 ${def.name} arrived! Dr. Fisher sent a letter.`);
  }
  fish = { ...fish, rescue: { caseId: id, recovering: true } };

  let rescue: RescueState = { ...state.rescue, activeId: id };
  if (!rescue.kitGiven) {
    rescue = { ...rescue, kitGiven: true, careItems: Object.fromEntries(CARE_ITEM_IDS.map((k) => [k, rescue.careItems[k] + STARTER_KIT])) as RescueState['careItems'] };
    toasts.push('🎁 Starter care kit: 2 of each item.');
  }
  state = { ...state, fish: [...state.fish.filter((f) => f.id !== fish.id), fish], rescue, mail: [...letters, ...state.mail] };
  state = withCase(state, id, c);
  return { ok: true, state, toasts, arrived: fish.id };
}

/** Pauses a case: it keeps all progress; its animal leaves the tank (with a letter). */
export function pauseRescue(game: GameState, id: string, now: number, toasts: string[] = []): GameState {
  const def = getRescue(id);
  const c = game.rescue.cases[id];
  if (!def || !c || c.status !== 'active') return game;
  const fish = game.fish.find((f) => f.id === c.fishId) ?? null;
  const letter = makeLetter(id, `${def.name} is resting at the center`, `${def.name} is safe at the rescue center while you help someone else. His care picks up right where you left off.\n— Dr. Fisher 🩺🐟`, now);
  toasts.push(`⏸ ${def.name} went back to the center. Progress is saved.`);
  const state = withCase(
    { ...game, fish: game.fish.filter((f) => f.id !== c.fishId), mail: [letter, ...game.mail], rescue: { ...game.rescue, activeId: game.rescue.activeId === id ? null : game.rescue.activeId } },
    id,
    { ...c, status: 'paused', fishId: null, away: fish },
  );
  return state;
}

// ---------------------------------------------------------------------------
// Events → progress → stage/rescue completion
// ---------------------------------------------------------------------------

/** Adds `amount` to a counter task of the active stage when `match` says the task listens to this event. */
function bump(c: RescueCaseState, def: RescueDef, match: (t: CareTask) => boolean, amount = 1): RescueCaseState {
  const tasks = def.stages[c.stage]?.tasks ?? [];
  let changed = false;
  const progress = tasks.map((t, i) => {
    const cur = c.progress[i] ?? 0;
    if (isSnapshot(t) || !match(t)) return cur;
    changed = true;
    return Math.min(taskTarget(t), cur + amount);
  });
  return changed ? { ...c, progress } : c;
}

export function rescueEvent(game: GameState, ev: GameEvent, today: string, now: number): EngineResult {
  const out: EngineResult = { state: game, toasts: [], healed: [] };
  const a = activeCase(game);
  if (!a || !stageOpen(a.c, today)) return out;
  const { def } = a;
  let c = a.c;
  switch (ev.type) {
    case 'useItem':
      if (ev.fishId === c.fishId) c = bump(c, def, (t) => t.type === 'useItem' && t.itemId === ev.itemId);
      break;
    case 'pet':
      if (ev.fishId === c.fishId) c = bump(c, def, (t) => t.type === 'pet' && (t.maxSecondsPerPet === undefined || ev.seconds <= t.maxSecondsPerPet));
      break;
    case 'feed':
      c = bump(c, def, (t) => t.type === 'feedAtTime' && isNight(ev.hour) === (t.timeOfDay === 'night'));
      break;
    case 'breakMinutes':
      c = bump(c, def, (t) => t.type === 'breakModeMinutes', ev.minutes);
      break;
    case 'interact':
      c = bump(c, def, (t) => t.type === 'interact' && t.actionId === ev.actionId);
      break;
    case 'play': {
      const tank = game.tanks.find((t) => t.id === (game.fish.find((f) => f.id === c.fishId)?.tankId ?? game.activeTankId));
      c = bump(c, def, (t) => t.type === 'keepCleanliness' && !!tank && tank.cleanliness >= t.min, ev.seconds);
      c = bump(c, def, (t) => t.type === 'noDissolve', ev.seconds);
      break;
    }
    case 'pelletDissolved': {
      // A pellet fouled the sand: the calm streak starts over (only this task, only today's count).
      const tasks = def.stages[c.stage]?.tasks ?? [];
      if (tasks.some((t, i) => t.type === 'noDissolve' && (c.progress[i] ?? 0) > 0)) {
        c = { ...c, progress: tasks.map((t, i) => (t.type === 'noDissolve' ? 0 : (c.progress[i] ?? 0))) };
      }
      break;
    }
    default:
      break;
  }
  const state = c === a.c ? game : withCase(game, def.id, c);
  return finishStageIfDone(state, def.id, today, now, out);
}

function finishStageIfDone(game: GameState, id: string, today: string, now: number, out: EngineResult): EngineResult {
  const def = getRescue(id)!;
  const c = game.rescue.cases[id]!;
  const stage = def.stages[c.stage];
  if (!stage || !stage.tasks.every((_, i) => taskDone(game, def, c, i))) return { ...out, state: game };
  return advanceStage(game, id, today, now, out);
}

/** Completes the current stage (dev tools use this directly). */
export function forceAdvance(game: GameState, today: string, now: number): EngineResult {
  const a = activeCase(game);
  return a ? advanceStage(game, a.def.id, today, now, { state: game, toasts: [], healed: [] }) : { state: game, toasts: [], healed: [] };
}

function advanceStage(game: GameState, id: string, today: string, now: number, out: EngineResult): EngineResult {
  const def = getRescue(id)!;
  const c = game.rescue.cases[id]!;
  const stage = def.stages[c.stage]!;
  const finished = c.stage + 1 >= def.stages.length;
  const fish = game.fish.find((f) => f.id === c.fishId);
  const letters: Letter[] = [];
  if (stage.letter) letters.push(makeLetter(id, stage.letter.title, stage.letter.body, now));
  const stageJournal = stage.journal
    ? [{ id: `journal-${now}-${id}-s${c.stage}`, text: stage.journal.replace('{n}', String(game.fish.filter((f) => f.speciesId === def.speciesId && f.id !== c.fishId).length)), at: now }]
    : [];
  let state: GameState = withCase({ ...game, journal: [...stageJournal, ...game.journal] }, id, { ...c, stage: c.stage + 1, stageDoneOn: today, progress: [] });
  const toasts = [...out.toasts, finished ? `💚 ${def.name} is fully recovered!` : `💚 Stage ${c.stage + 1} of ${def.stages.length} done! Next stage tomorrow 🌙`];
  const healed = [...out.healed];
  if (fish) healed.push({ fishId: fish.id, done: finished });
  if (finished) {
    letters.push(makeLetter(id, def.completion.title, def.completion.body, now));
    const items = { ...state.rescue.careItems };
    for (const k of CARE_ITEM_IDS) items[k] += def.rewards.items[k] ?? 0;
    state = {
      ...state,
      fish: state.fish.map((f) => (f.id === c.fishId ? { ...f, variant: def.rewards.variant ?? f.variant, rescue: { caseId: id, recovering: false } } : f)),
      journal: [{ id: `journal-${now}-${id}`, text: def.rewards.journal, at: now }, ...state.journal],
      rescue: { ...state.rescue, activeId: null, careItems: items },
    };
    state = withCase(state, id, { ...state.rescue.cases[id]!, status: 'done', fishId: null });
    if (def.rewards.colony && fish) state = { ...state, eggs: [...state.eggs, ...colonyEggs(def, fish.tankId, now)] };
  }
  return { state: { ...state, mail: [...letters.reverse(), ...state.mail] }, toasts, healed };
}

/** The colony: one egg per baby, hatching 20 / 40 / 60 minutes from now (the usual tank-full → Nursery rule applies). */
const COLONY_SPREAD_MS = 20 * 60_000;
function colonyEggs(def: RescueDef, tankId: string, now: number) {
  return Array.from({ length: def.rewards.colony ?? 0 }, (_, i) => ({
    id: `colony-${def.id}-${now}-${i}`,
    speciesId: def.speciesId,
    variant: 'cherry',
    shiny: false,
    tankId,
    hatchAt: now + (i + 1) * COLONY_SPREAD_MS,
    x: 220 + i * 160,
  }));
}

/** Re-checks snapshot tasks (decor placed, species owned, substrate) after the state changed. */
export const recheck = (game: GameState, today: string, now: number): EngineResult => rescueEvent(game, { type: 'check' }, today, now);

/** Consumes one care item for the rescued animal, if it still needs it. */
export type UseItemResult = { ok: true; result: EngineResult } | { ok: false; reason: 'none' | 'notNeeded' | 'wrongFish' | 'wait' };

export function useCareItem(game: GameState, itemId: CareItemId, fishId: string, today: string, now: number): UseItemResult {
  if (game.rescue.careItems[itemId] <= 0) return { ok: false, reason: 'none' };
  const a = activeCase(game);
  if (!a || a.c.fishId !== fishId) return { ok: false, reason: 'wrongFish' };
  if (!stageOpen(a.c, today)) return { ok: false, reason: 'wait' };
  const needed = (def: RescueDef, c: RescueCaseState) =>
    def.stages[c.stage]!.tasks.some((t, i) => t.type === 'useItem' && t.itemId === itemId && !taskDone(game, def, c, i));
  if (!needed(a.def, a.c)) return { ok: false, reason: 'notNeeded' };
  const spent: GameState = { ...game, rescue: { ...game.rescue, careItems: { ...game.rescue.careItems, [itemId]: game.rescue.careItems[itemId] - 1 } } };
  return { ok: true, result: rescueEvent(spent, { type: 'useItem', itemId, fishId }, today, now) };
}

export const careItemsOwned = (game: GameState): number => CARE_ITEM_IDS.reduce((n, k) => n + game.rescue.careItems[k], 0);

/** A care task is available right now (for the 💚 dot on the Tools pill). */
export function careAvailable(game: GameState, today: string): boolean {
  const a = activeCase(game);
  return !!a && stageOpen(a.c, today) && a.def.stages[a.c.stage] !== undefined;
}

/** Statuses for the Rescue Board. */
export type CaseStatus = 'available' | 'active' | 'paused' | 'done';
export const caseStatus = (game: GameState, id: string): CaseStatus => game.rescue.cases[id]?.status ?? 'available';

/** The active rescue's current stage still wants this `interact` action (for gestures that only count when needed). */
export function wantsAction(game: GameState, actionId: string): boolean {
  const a = activeCase(game);
  return !!a && a.def.stages[a.c.stage]?.tasks.some((t, i) => t.type === 'interact' && t.actionId === actionId && !taskDone(game, a.def, a.c, i)) === true;
}
