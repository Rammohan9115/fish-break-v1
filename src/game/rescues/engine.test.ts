import { describe, expect, it } from 'vitest';
import { constRng, makeFish, T0 } from '../testUtils';
import { createInitialState } from '../sim';
import { localDateKey } from '../economy';
import { applyGameEvent } from '../events';
import { ensureDaily, rerollTask, seededRng, WEEKLY_CHEST } from '../dailyTasks';
import { migrate } from '../../store/save';
import { activeCase, careAvailable, forceAdvance, pauseRescue, takeRescue, taskValue, useCareItem } from './engine';
import { getRescue, RESCUES } from './registry';
import type { GameState } from '../types';

const DAY = 86_400_000;
const day = (n: number) => T0 + n * DAY;
const key = (now: number) => localDateKey(new Date(now));

function started(now = T0): GameState {
  const r = takeRescue(createInitialState(now, constRng(0.5)), 'pinch', now, constRng(0.5));
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}
const ev = (g: GameState, e: Parameters<typeof applyGameEvent>[1], now = T0) => applyGameEvent(g, e, now, constRng(0.5));
const pinch = (g: GameState) => g.fish.find((f) => f.rescue?.caseId === 'pinch')!;

describe('registry', () => {
  it('finds Pinch automatically', () => {
    expect(RESCUES.map((r) => r.id)).toContain('pinch');
  });
});

describe('taking a rescue', () => {
  it('adds a recovering animal that does not count toward capacity, and a starter kit and letter', () => {
    const g = started();
    expect(pinch(g).rescue?.recovering).toBe(true);
    expect(pinch(g).name).toBe('Pinch');
    expect(g.rescue.careItems).toEqual({ soft_food: 2, healing_moss: 2, vitamin_flakes: 2 });
    expect(g.mail.some((l) => l.caseId === 'pinch')).toBe(true);
  });

  it('gives the kit only once', () => {
    const g = started();
    const paused = pauseRescue(g, 'pinch', T0);
    expect(paused.rescue.careItems.soft_food).toBe(2);
  });

  it('keeps one active rescue: taking another pauses the first and keeps its progress', () => {
    let g = started();
    g = ev(g, { type: 'useItem', itemId: 'soft_food', fishId: pinch(g).id }).state;
    expect(g.rescue.cases.pinch!.progress[1]).toBe(1);
    const paused = pauseRescue(g, 'pinch', T0);
    expect(paused.rescue.activeId).toBeNull();
    expect(paused.fish.some((f) => f.rescue)).toBe(false);
    expect(paused.rescue.cases.pinch!.away?.name).toBe('Pinch');
    const back = takeRescue(paused, 'pinch', T0 + 1000, constRng(0.5));
    expect(back.ok && back.state.rescue.cases.pinch!.progress[1]).toBe(1);
    expect(back.ok && back.state.fish.filter((f) => f.rescue).length).toBe(1);
  });

  it('refuses a finished or active rescue', () => {
    const g = started();
    const again = takeRescue(g, 'pinch', T0, constRng(0.5));
    expect(again.ok).toBe(false);
  });
});

describe('care tasks', () => {
  it('counts items only on the rescued animal and only when needed', () => {
    const g = started();
    const today = key(T0);
    expect(useCareItem(g, 'healing_moss', pinch(g).id, today, T0)).toMatchObject({ ok: false, reason: 'notNeeded' });
    expect(useCareItem(g, 'soft_food', 'nope', today, T0)).toMatchObject({ ok: false, reason: 'wrongFish' });
    const r = useCareItem(g, 'soft_food', pinch(g).id, today, T0);
    expect(r.ok && r.result.state.rescue.careItems.soft_food).toBe(1);
  });

  it('judges placeDecor from the current tank', () => {
    let g = started();
    const def = getRescue('pinch')!;
    expect(taskValue(g, def, g.rescue.cases.pinch!, 0)).toBe(0);
    g = { ...g, tanks: g.tanks.map((t) => ({ ...t, decor: [{ id: 'd1', decorId: 'rock', x: 100, flipped: false, size: 'M', z: 0.5 }] })) };
    expect(taskValue(g, def, g.rescue.cases.pinch!, 0)).toBe(1);
  });

  it('accumulates cleanliness time only while clean enough', () => {
    let g = started();
    g = forceToStage(g, 1);
    const id = pinch(g).id;
    void id;
    g = { ...g, tanks: g.tanks.map((t) => ({ ...t, cleanliness: 50 })) };
    g = ev(g, { type: 'play', seconds: 100 }, day(1)).state;
    expect(g.rescue.cases.pinch!.progress[0] ?? 0).toBe(0);
    g = { ...g, tanks: g.tanks.map((t) => ({ ...t, cleanliness: 90 })) };
    g = ev(g, { type: 'play', seconds: 100 }, day(1)).state;
    expect(g.rescue.cases.pinch!.progress[0]).toBe(100);
  });

  it('counts only short pets when a maximum is set', () => {
    let g = forceToStage(started(), 1);
    const id = pinch(g).id;
    g = ev(g, { type: 'pet', fishId: id, seconds: 5 }, day(1)).state;
    expect(g.rescue.cases.pinch!.progress[1] ?? 0).toBe(0);
    g = ev(g, { type: 'pet', fishId: id, seconds: 2 }, day(1)).state;
    expect(g.rescue.cases.pinch!.progress[1]).toBe(1);
  });
});

/** Dev-style: skip to stage `n` (each skipped stage completes on its own day). */
function forceToStage(g: GameState, n: number): GameState {
  let state = g;
  for (let i = 0; i < n; i++) state = forceAdvance(state, key(day(i)), day(i)).state;
  return state;
}

describe('one stage per day', () => {
  it('finishing a stage locks progress until the next local day, then unlocks it', () => {
    let g = started();
    const id = pinch(g).id;
    g = { ...g, tanks: g.tanks.map((t) => ({ ...t, decor: [{ id: 'd1', decorId: 'rock', x: 100, flipped: false, size: 'M', z: 0.5 }] })) };
    g = ev(g, { type: 'useItem', itemId: 'soft_food', fishId: id }).state;
    g = ev(g, { type: 'useItem', itemId: 'soft_food', fishId: id }).state;
    expect(g.rescue.cases.pinch!.stage).toBe(1);
    expect(careAvailable(g, key(T0))).toBe(false);
    // Same day: stage 2 tasks don't progress.
    g = ev(g, { type: 'pet', fishId: id, seconds: 1 }).state;
    expect(g.rescue.cases.pinch!.progress[1] ?? 0).toBe(0);
    // Next day: they do.
    expect(careAvailable(g, key(day(1)))).toBe(true);
    g = ev(g, { type: 'pet', fishId: id, seconds: 1 }, day(1)).state;
    expect(g.rescue.cases.pinch!.progress[1]).toBe(1);
  });

  it('skipping days pauses the story: nothing is lost', () => {
    const g = forceToStage(started(), 1);
    const later = ev(g, { type: 'check' }, day(30)).state;
    expect(later.rescue.cases.pinch!.stage).toBe(1);
    expect(later.rescue.cases.pinch!.status).toBe('active');
  });
});

describe('completion', () => {
  it('turns the animal into a normal fish with its unique variant, journal entry and letter', () => {
    let g = started();
    for (let i = 0; i < 4; i++) g = forceAdvance(g, key(day(i)), day(i)).state;
    expect(g.rescue.cases.pinch!.status).toBe('done');
    expect(g.rescue.activeId).toBeNull();
    const f = pinch(g);
    expect(f.variant).toBe('stormshell');
    expect(f.rescue).toEqual({ caseId: 'pinch', recovering: false });
    expect(g.journal).toHaveLength(1);
    expect(g.mail.some((l) => l.title.includes('all better'))).toBe(true);
    expect(activeCase(g)).toBeNull();
  });

  it('a recovering animal cannot be sold', async () => {
    const { sellFish } = await import('../economy');
    const g = started();
    expect(sellFish(g, pinch(g).id).ok).toBe(false);
  });
});

describe('daily tasks', () => {
  it('makes 3 seeded tasks, with the rescue care tasks mixed in', () => {
    const g = ensureDaily(started(), T0);
    expect(g.daily.tasks).toHaveLength(3);
    const again = ensureDaily({ ...started(), daily: { ...g.daily, date: '' } }, T0);
    expect(again.daily.tasks.map((t) => t.kind)).toEqual(g.daily.tasks.map((t) => t.kind));
  });

  it('rerolls a general task once a day, never a care task', () => {
    const g = ensureDaily(createInitialState(T0, constRng(0.5)), T0);
    const first = g.daily.tasks[0]!;
    const next = rerollTask(g, first.id, seededRng(3))!;
    expect(next.daily.rerolled).toBe(true);
    expect(rerollTask(next, next.daily.tasks[1]!.id, seededRng(3))).toBeNull();
    const withCare = ensureDaily({ ...started(), daily: { ...g.daily, date: '' } }, T0);
    const care = withCare.daily.tasks.find((t) => t.care);
    if (care) expect(rerollTask(withCare, care.id, seededRng(3))).toBeNull();
  });

  it('pays rewards and the all-done bonus, then the weekly chest on the 5th full day', () => {
    let g = createInitialState(T0, constRng(0.5));
    const doAll = (now: number) => {
      g = ensureDaily(g, now);
      g = { ...g, daily: { ...g.daily, tasks: g.daily.tasks.map((t) => ({ ...t, progress: t.target - 1, kind: 'collectShells', care: undefined, reward: { shells: 1 } })) } };
      return applyGameEvent(g, { type: 'shellCollected' }, now, constRng(0.99));
    };
    for (let i = 0; i < WEEKLY_CHEST.days; i++) {
      const before = g.pearls;
      const r = doAll(day(i));
      g = r.state;
      expect(g.daily.tasks.every((t) => t.done)).toBe(true);
      if (i < WEEKLY_CHEST.days - 1) expect(g.pearls).toBe(before);
      else {
        expect(g.pearls).toBe(before + WEEKLY_CHEST.pearls);
        expect(g.daily.fullDays).toEqual([]);
        expect(r.toasts.some((t) => t.includes('Weekly chest'))).toBe(true);
      }
    }
  });

  it('does not give the chest for 4 full days or for days more than a week apart', () => {
    let g = createInitialState(T0, constRng(0.5));
    for (const i of [0, 3, 6, 9, 12]) {
      g = ensureDaily(g, day(i));
      g = { ...g, daily: { ...g.daily, tasks: g.daily.tasks.map((t) => ({ ...t, progress: t.target - 1, kind: 'collectShells', reward: { shells: 1 } })) } };
      g = applyGameEvent(g, { type: 'shellCollected' }, day(i), constRng(0.99)).state;
    }
    expect(g.pearls).toBe(0);
  });
});

describe('migration', () => {
  it('v8 saves gain empty rescue state, a welcome letter, a journal and daily state', () => {
    const base = createInitialState(T0) as unknown as Record<string, unknown>;
    const { rescue, mail, journal, daily, ...v8 } = base;
    void rescue; void mail; void journal; void daily;
    const out = migrate({ ...v8, version: 8 }) as unknown as GameState;
    expect(out.version).toBe(9);
    expect(out.rescue.activeId).toBeNull();
    expect(out.mail).toHaveLength(1);
    expect(out.mail[0]!.action).toBe('rescueBoard');
    expect(out.daily.tasks).toEqual([]);
  });

  it('keeps the rescue-only variant out of random picks', async () => {
    const { randomVariantKey } = await import('../species');
    for (let i = 0; i < 20; i++) expect(randomVariantKey('crab', () => i / 20)).not.toBe('stormshell');
    expect(makeFish({ speciesId: 'crab' }).variant).not.toBe('stormshell');
  });
});
