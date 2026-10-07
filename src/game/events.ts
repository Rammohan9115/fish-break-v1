// One entry point for game moments: updates the active rescue and today's daily tasks together.
import { localDateKey } from './economy';
import { dailyEvent, ensureDaily } from './dailyTasks';
import { rescueEvent, taskDone, type GameEvent } from './rescues/engine';
import { getRescue } from './rescues/registry';
import type { GameState, Rng } from './types';

export interface EventResult {
  state: GameState;
  toasts: string[];
  /** Fish that just finished a stage (sparkle-heal) or their whole rescue. */
  healed: { fishId: string; done: boolean }[];
}

export function applyGameEvent(game: GameState, ev: GameEvent, now: number, rng: Rng): EventResult {
  const today = localDateKey(new Date(now));
  const base = ensureDaily(game, now);
  const rescue = rescueEvent(base, ev, today, now);
  const daily = dailyEvent(
    rescue.state,
    ev,
    now,
    rng,
    (g, t) => {
      const c = t.care && g.rescue.cases[t.care.caseId];
      const def = t.care && getRescue(t.care.caseId);
      if (!c || !def || !t.care) return false;
      return c.stage > t.care.stage || c.status === 'done' || (c.stage === t.care.stage && taskDone(g, def, c, t.care.index));
    },
  );
  return { state: daily.state, toasts: [...rescue.toasts, ...daily.toasts], healed: rescue.healed };
}
