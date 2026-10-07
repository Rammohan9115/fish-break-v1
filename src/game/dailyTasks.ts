// Daily tasks (pure): 3 per local day, 1–2 of them the active rescue's care tasks. No streaks.
// Weekly chest: all daily tasks done on any 5 of the last 7 days.
import { getRescue } from './rescues/registry';
import { DECOR } from './constants';
import { localDateKey } from './economy';
import { CARE_ITEM_IDS, activeCase, stageOpen, taskDone, taskTarget, type GameEvent } from './rescues/engine';
import type { CareItemId, DailyTaskState, DecorId, GameState, Rng } from './types';

export const DAILY_TASK_COUNT = 3;
export const DAILY_BONUS = { shells: 30 };
/** A task kind that was drawn is skipped for this many days after. */
export const KIND_COOLDOWN_DAYS = 3;
export const WEEKLY_CHEST = { days: 5, window: 7, pearls: 2, itemEach: 1, rareDecorChance: 0.25 };
const RARE_DECOR: DecorId[] = (Object.values(DECOR) as { id: DecorId; cost: { currency: string } }[]).filter((d) => d.cost.currency === 'pearls').map((d) => d.id);

interface GeneralKind {
  kind: string;
  label: (n: number) => string;
  base: number;
  /** Lowest player level it appears at. */
  minLevel?: number;
  /** Draw weight (default 1). */
  weight?: number;
  event: (e: GameEvent) => number;
}

export const GENERAL_KINDS: GeneralKind[] = [
  { kind: 'collectShells', label: (n) => `Collect ${n} shells`, base: 5, event: (e) => (e.type === 'shellCollected' ? 1 : 0) },
  { kind: 'pet', label: (n) => `Pet fish ×${n}`, base: 3, event: (e) => (e.type === 'pet' ? 1 : 0) },
  { kind: 'feed', label: (n) => `Feed ${n} pellets`, base: 8, event: (e) => (e.type === 'feed' ? 1 : 0) },
  { kind: 'clean', label: (n) => `Wipe ${n} algae spots`, base: 3, event: (e) => (e.type === 'algaeWiped' ? 1 : 0) },
  { kind: 'decor', label: () => 'Place a decor piece', base: 1, event: (e) => (e.type === 'decorPlaced' ? 1 : 0) },
  { kind: 'hatch', label: () => 'Hatch an egg', base: 1, minLevel: 5, weight: 0.5, event: (e) => (e.type === 'hatched' ? 1 : 0) },
  { kind: 'break', label: (n) => `${n} min in Break Mode`, base: 2, event: (e) => (e.type === 'breakMinutes' ? e.minutes : 0) },
  { kind: 'bond', label: () => 'Raise a fish’s bond level', base: 1, minLevel: 3, weight: 0.5, event: (e) => (e.type === 'bondUp' ? 1 : 0) },
];
/** Kinds that may be drawn now: level-gated, no hatch task without an egg. */
const eligibleKinds = (game: GameState): GeneralKind[] =>
  GENERAL_KINDS.filter((k) => (k.minLevel ?? 0) <= game.level && (k.kind !== 'hatch' || game.eggs.length > 0));

function pickKind(pool: GeneralKind[], rng: Rng): GeneralKind {
  const total = pool.reduce((n, k) => n + (k.weight ?? 1), 0);
  let r = rng() * total;
  for (const k of pool) {
    r -= k.weight ?? 1;
    if (r < 0) return k;
  }
  return pool[pool.length - 1]!;
}
const FIXED_TARGET = new Set(['decor', 'hatch', 'bond']);

const kindOf = (kind: string) => GENERAL_KINDS.find((k) => k.kind === kind);

export const taskLabel = (t: DailyTaskState): string => {
  if (t.care) return careDef(t) ?? 'Care task';
  return kindOf(t.kind)?.label(t.target) ?? t.kind;
};

function careDef(t: DailyTaskState): string | null {
  if (!t.care) return null;
  return getRescue(t.care.caseId)?.stages[t.care.stage]?.tasks[t.care.index]?.label ?? null;
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
/** Small seeded RNG (mulberry32) so a day's tasks are the same for everyone with the same level/rescue. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Only the day's first care task pays an item (supply ≈ demand); the second pays a few extra shells. */
const careReward = (level: number, n: number, item: CareItemId): DailyTaskState['reward'] =>
  n === 0 ? { shells: 15 + level * 2, item } : { shells: 20 + level * 2 };

function makeGeneral(kind: GeneralKind, level: number, rng: Rng, n: number): DailyTaskState {
  const target = FIXED_TARGET.has(kind.kind) ? kind.base : Math.max(1, Math.round(kind.base * (1 + Math.min(level, 30) / 15)));
  const roll = rng();
  const item: CareItemId | undefined = roll < 0.25 ? CARE_ITEM_IDS[Math.floor(rng() * CARE_ITEM_IDS.length)] : undefined;
  return {
    id: `task-${n}-${kind.kind}`,
    kind: kind.kind,
    target,
    progress: 0,
    done: false,
    reward: { shells: 10 + level * 2, ...(roll > 0.9 ? { pearls: 1 } : {}), ...(item ? { item } : {}) },
  };
}

/** Today's tasks (regenerated when the date changes). */
export function ensureDaily(game: GameState, now: number): GameState {
  const today = localDateKey(new Date(now));
  if (game.daily.date === today) return game;
  const rng = seededRng(hash(`${today}:${game.level}:${game.rescue.activeId ?? ''}`));
  const tasks: DailyTaskState[] = [];
  const a = activeCase(game);
  if (a && stageOpen(a.c, today)) {
    const stage = a.def.stages[a.c.stage];
    const open = (stage?.tasks ?? []).map((t, i) => ({ t, i })).filter(({ i }) => !taskDone(game, a.def, a.c, i));
    for (const { i } of open.slice(0, 2)) {
      tasks.push({
        id: `task-${tasks.length}-care`,
        kind: 'care',
        target: taskTarget(stage!.tasks[i]!),
        progress: 0,
        done: false,
        reward: careReward(game.level, tasks.length, CARE_ITEM_IDS[Math.floor(rng() * CARE_ITEM_IDS.length)]!),
        care: { caseId: a.def.id, stage: a.c.stage, index: i },
      });
    }
  }
  const recent = new Set(game.daily.recentKinds ?? []);
  const eligible = eligibleKinds(game);
  const fresh = eligible.filter((k) => !recent.has(k.kind));
  const pool = fresh.length >= DAILY_TASK_COUNT ? fresh : eligible;
  while (tasks.length < DAILY_TASK_COUNT && pool.length > 0) {
    const used = new Set(tasks.map((t) => t.kind));
    const free = pool.filter((k) => !used.has(k.kind));
    const kind = pickKind(free.length > 0 ? free : pool, rng);
    tasks.push(makeGeneral(kind, game.level, rng, tasks.length));
  }
  const keep = pruneDays(game.daily.fullDays, today);
  const drawn = tasks.filter((t) => !t.care).map((t) => t.kind);
  const recentKinds = [...drawn, ...(game.daily.recentKinds ?? [])].slice(0, DAILY_TASK_COUNT * (KIND_COOLDOWN_DAYS - 1));
  return { ...game, daily: { ...game.daily, date: today, recentKinds, tasks, rerolled: false, bonusClaimed: false, fullDays: keep } };
}

const dayNumber = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000);
};
const pruneDays = (days: string[], today: string): string[] => days.filter((d) => dayNumber(today) - dayNumber(d) < WEEKLY_CHEST.window && d <= today);

/** One free reroll of a general (non-care) task per day. */
export function rerollTask(game: GameState, taskId: string, rng: Rng): GameState | null {
  const t = game.daily.tasks.find((x) => x.id === taskId);
  if (!t || t.care || t.done || game.daily.rerolled) return null;
  const used = new Set(game.daily.tasks.map((x) => x.kind));
  const recent = new Set(game.daily.recentKinds ?? []);
  const open = eligibleKinds(game).filter((k) => !used.has(k.kind));
  const pool = open.some((k) => !recent.has(k.kind)) ? open.filter((k) => !recent.has(k.kind)) : open;
  if (pool.length === 0) return null;
  const kind = pickKind(pool, rng);
  const fresh = { ...makeGeneral(kind, game.level, rng, game.daily.tasks.length), id: t.id };
  return { ...game, daily: { ...game.daily, rerolled: true, tasks: game.daily.tasks.map((x) => (x.id === taskId ? fresh : x)) } };
}

export interface DailyResult {
  state: GameState;
  toasts: string[];
}

function grant(game: GameState, r: DailyTaskState['reward']): GameState {
  return {
    ...game,
    shells: game.shells + r.shells,
    pearls: game.pearls + (r.pearls ?? 0),
    rescue: r.item ? { ...game.rescue, careItems: { ...game.rescue.careItems, [r.item]: game.rescue.careItems[r.item] + 1 } } : game.rescue,
  };
}

const rewardText = (r: DailyTaskState['reward']): string =>
  `+${r.shells} 🐚${r.pearls ? ` +${r.pearls} ⚪` : ''}${r.item ? ` +1 ${r.item.replace('_', ' ')}` : ''}`;

/** Applies a game event to today's tasks, pays finished ones, and handles the all-done bonus and the weekly chest. */
export function dailyEvent(game: GameState, ev: GameEvent, now: number, rng: Rng, careNow: (g: GameState, t: DailyTaskState) => boolean): DailyResult {
  let state = ensureDaily(game, now);
  const toasts: string[] = [];
  const today = state.daily.date;
  const tasks = state.daily.tasks.map((t) => {
    if (t.done) return t;
    const add = t.care ? 0 : (kindOf(t.kind)?.event(ev) ?? 0);
    const done = t.care ? careNow(state, t) : t.progress + add >= t.target;
    if (!done && add === 0) return t;
    return { ...t, progress: done ? t.target : Math.min(t.target, t.progress + add), done };
  });
  if (tasks.every((t, i) => t === state.daily.tasks[i])) return { state, toasts };
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i]!.done && !state.daily.tasks[i]!.done) {
      state = grant(state, tasks[i]!.reward);
      toasts.push(`✓ Daily task done ${rewardText(tasks[i]!.reward)}`);
    }
  }
  state = { ...state, daily: { ...state.daily, tasks } };
  if (tasks.length > 0 && tasks.every((t) => t.done) && !state.daily.bonusClaimed) {
    state = { ...state, shells: state.shells + DAILY_BONUS.shells };
    const fullDays = state.daily.fullDays.includes(today) ? state.daily.fullDays : [...state.daily.fullDays, today];
    state = { ...state, daily: { ...state.daily, bonusClaimed: true, fullDays } };
    toasts.push(`🌟 All tasks done! +${DAILY_BONUS.shells} 🐚`);
    const week = pruneDays(fullDays, today);
    if (week.length >= WEEKLY_CHEST.days) {
      const items = { ...state.rescue.careItems };
      for (const k of CARE_ITEM_IDS) items[k] += WEEKLY_CHEST.itemEach;
      const rare = RARE_DECOR.length > 0 && rng() < WEEKLY_CHEST.rareDecorChance ? RARE_DECOR[Math.floor(rng() * RARE_DECOR.length)]! : null;
      state = {
        ...state,
        pearls: state.pearls + WEEKLY_CHEST.pearls,
        rescue: { ...state.rescue, careItems: items },
        decorInventory: rare ? { ...state.decorInventory, [rare]: (state.decorInventory[rare] ?? 0) + 1 } : state.decorInventory,
        daily: { ...state.daily, fullDays: [], chestClaimedOn: today },
      };
      toasts.push(`🎁 Weekly chest! +${WEEKLY_CHEST.pearls} ⚪ and care items${rare ? ` and a ${DECOR[rare].name}!` : ''}`);
    }
  }
  return { state, toasts };
}

export const dailyPending = (game: GameState): number => game.daily.tasks.filter((t) => !t.done).length;

/** After a rescue is taken or resumed: swap up to 2 unfinished general tasks for its care tasks (once per stage). */
export function addCareTasks(game: GameState, now: number): GameState {
  const s = ensureDaily(game, now);
  const a = activeCase(s);
  const today = s.daily.date;
  if (!a || !stageOpen(a.c, today) || s.daily.tasks.some((t) => t.care?.caseId === a.def.id && t.care.stage === a.c.stage)) return s;
  const stage = a.def.stages[a.c.stage];
  if (!stage) return s;
  const open = stage.tasks.map((t, i) => ({ t, i })).filter(({ i }) => !taskDone(s, a.def, a.c, i)).slice(0, 2);
  // Care tasks of another rescue or an older stage are stale (they were already paid): drop them.
  const current = s.daily.tasks.filter((t) => !t.care || (t.care.caseId === a.def.id && t.care.stage === a.c.stage));
  const general = current.filter((t) => !t.care);
  const drop = general.filter((t) => !t.done).slice(-open.length).map((t) => t.id);
  const kept = current.filter((t) => !drop.includes(t.id));
  const care: DailyTaskState[] = open.map(({ t, i }, n) => ({
    id: `task-care-${a.c.stage}-${n}`,
    kind: 'care',
    target: taskTarget(t),
    progress: 0,
    done: false,
    reward: careReward(s.level, n, CARE_ITEM_IDS[(a.c.stage + n) % CARE_ITEM_IDS.length]!),
    care: { caseId: a.def.id, stage: a.c.stage, index: i },
  }));
  const tasks = [...care, ...kept];
  // Dropping stale tasks can leave fewer than 3: top up from the general pool.
  const rng = seededRng(hash(`${today}:${s.level}:${a.def.id}:fill`));
  const fresh = eligibleKinds(s).filter((k) => !tasks.some((t) => t.kind === k.kind));
  while (tasks.length < DAILY_TASK_COUNT && fresh.length > 0) {
    const kind = pickKind(fresh, rng);
    fresh.splice(fresh.indexOf(kind), 1);
    tasks.push(makeGeneral(kind, s.level, rng, tasks.length));
  }
  return { ...s, daily: { ...s.daily, tasks } };
}
