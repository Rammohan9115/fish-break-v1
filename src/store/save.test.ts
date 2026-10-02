import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRUPT_SAVE_PREFIX, HOUR_MS, MINUTE_MS, SAVE_INTERVAL_MS, SAVE_KEY, SAVE_VERSION } from '../game/constants';
import type { OfflineSummary } from '../game/sim';
import { makeFish, makeState, seededRng, T0 } from '../game/testUtils';
import { formatOfflineSummary, isValidGameState, loadGame, loadOnboarding, migrate, saveGame, saveOnboarding, startAutosave } from './save';
import { fakeEnv, MemoryStorage } from './testEnv';

const rng = () => seededRng(1);

describe('saveGame / loadGame', () => {
  it('starts a fresh game when there is no save', () => {
    const { state, summary, corrupt } = loadGame(new MemoryStorage(), T0, { rng: rng() });
    expect(corrupt).toBe(false);
    expect(summary).toBeNull();
    expect(state.fish).toHaveLength(2);
    expect(state.lastTickAt).toBe(T0);
  });

  it('round-trips a save, including version', () => {
    const storage = new MemoryStorage();
    const game = makeState({ fish: [makeFish({ name: 'Mochi' })], overrides: { shells: 123 } });
    saveGame(game, storage);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).version).toBe(SAVE_VERSION);
    const { state } = loadGame(storage, T0, { rng: rng() });
    expect(state).toEqual(game);
  });

  it('runs offline catch-up and returns a summary', () => {
    const storage = new MemoryStorage();
    const adult = makeFish({ stage: 'adult', growth: 1200, lastDropAt: T0 });
    saveGame(makeState({ fish: [adult] }), storage);
    const { state, summary } = loadGame(storage, T0 + HOUR_MS, { rng: rng() });
    expect(state.lastTickAt).toBe(T0 + HOUR_MS);
    expect(summary).not.toBeNull();
    expect(summary!.elapsedMs).toBe(HOUR_MS);
    expect(summary!.shellsDropped + summary!.pearlsDropped).toBe(7);
  });

  it('skips the summary for very short absences', () => {
    const storage = new MemoryStorage();
    saveGame(makeState(), storage);
    expect(loadGame(storage, T0 + 30_000, { rng: rng() }).summary).toBeNull();
  });

  it('caps offline catch-up at 8 hours', () => {
    const storage = new MemoryStorage();
    saveGame(makeState(), storage);
    const { summary } = loadGame(storage, T0 + 48 * HOUR_MS, { rng: rng() });
    expect(summary!.elapsedMs).toBe(8 * HOUR_MS);
  });

  it('swallows storage errors when saving', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(() => saveGame(makeState(), storage)).not.toThrow();
  });
});

describe('corrupt saves', () => {
  const corruptCases: [string, string][] = [
    ['invalid JSON', '{not json'],
    ['a non-object', '42'],
    ['missing fields', JSON.stringify({ version: SAVE_VERSION, shells: 5 })],
    ['a future version', JSON.stringify({ ...makeState(), version: SAVE_VERSION + 1 })],
    ['an unknown activeTankId', JSON.stringify({ ...makeState(), activeTankId: 'nope' })],
  ];

  it.each(corruptCases)('backs up %s and starts fresh', (_label, raw) => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, raw);
    const { state, corrupt, summary } = loadGame(storage, T0, { rng: rng() });
    expect(corrupt).toBe(true);
    expect(summary).toBeNull();
    expect(storage.getItem(`${CORRUPT_SAVE_PREFIX}${T0}`)).toBe(raw);
    expect(state.shells).toBe(30);
    expect(state.fish).toHaveLength(2);
  });
});

describe('migrations', () => {
  it('passes current-version saves through unchanged', () => {
    const data = { version: SAVE_VERSION, a: 1 };
    expect(migrate(data)).toEqual(data);
  });

  it('applies each step in order and bumps the version', () => {
    const calls: number[] = [];
    const table = {
      [SAVE_VERSION - 2]: (d: Record<string, unknown>) => (calls.push(1), { ...d, a: 1 }),
      [SAVE_VERSION - 1]: (d: Record<string, unknown>) => (calls.push(2), { ...d, b: 2 }),
    };
    expect(migrate({ version: SAVE_VERSION - 2 }, table)).toEqual({ version: SAVE_VERSION, a: 1, b: 2 });
    expect(calls).toEqual([1, 2]);
  });

  it('throws when a migration step is missing', () => {
    expect(() => migrate({ version: SAVE_VERSION - 1 }, {})).toThrow(/No migration/);
  });

  it('loadGame uses the migration table, and treats failures as corrupt', () => {
    const storage = new MemoryStorage();
    const old = { ...makeState(), version: SAVE_VERSION - 1, shells: 'legacy' };
    storage.setItem(SAVE_KEY, JSON.stringify(old));
    const table = { [SAVE_VERSION - 1]: (d: Record<string, unknown>) => ({ ...d, shells: 77 }) };
    const ok = loadGame(storage, T0, { rng: rng(), migrations: table });
    expect(ok.corrupt).toBe(false);
    expect(ok.state.shells).toBe(77);
    expect(loadGame(storage, T0, { rng: rng(), migrations: {} }).corrupt).toBe(true);
  });

  it('validates a fresh state', () => {
    expect(isValidGameState(makeState())).toBe(true);
  });
});

describe('formatOfflineSummary', () => {
  const base: OfflineSummary = { elapsedMs: 2 * HOUR_MS + 15 * MINUTE_MS, shellsDropped: 0, shellValue: 0, pearlsDropped: 0, eggsHatched: 0, fishGrown: 0, levelsGained: [] };

  it('lists what happened', () => {
    const text = formatOfflineSummary({ ...base, shellsDropped: 6, shellValue: 12, pearlsDropped: 1, eggsHatched: 2, fishGrown: 3 });
    expect(text).toBe('While you were away (2h 15m): 🐚 12 shells dropped, ⚪ 1 pearl, 🥚 2 eggs hatched, 🐟 3 grew up a stage');
  });

  it('has a friendly fallback when nothing happened', () => {
    expect(formatOfflineSummary({ ...base, elapsedMs: 5 * MINUTE_MS })).toBe('While you were away (5m), your fish missed you!');
  });
});

describe('startAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves every 10 seconds', () => {
    const { env, storage } = fakeEnv();
    let shells = 1;
    const stop = startAutosave(() => makeState({ overrides: { shells } }), env);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    vi.advanceTimersByTime(SAVE_INTERVAL_MS);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).shells).toBe(1);
    shells = 2;
    vi.advanceTimersByTime(SAVE_INTERVAL_MS);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).shells).toBe(2);
    stop();
  });

  it('saves when the page becomes hidden, not when visible', () => {
    const { env, storage, doc } = fakeEnv();
    const stop = startAutosave(() => makeState(), env);
    doc.visibilityState = 'visible';
    doc.dispatch('visibilitychange');
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    doc.visibilityState = 'hidden';
    doc.dispatch('visibilitychange');
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    stop();
  });

  it('saves on beforeunload', () => {
    const { env, storage, win } = fakeEnv();
    const stop = startAutosave(() => makeState(), env);
    win.dispatch('beforeunload');
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    stop();
  });

  it('stop() removes listeners and the interval', () => {
    const { env, storage, win, doc } = fakeEnv();
    startAutosave(() => makeState(), env)();
    expect(win.count('beforeunload')).toBe(0);
    expect(doc.count('visibilitychange')).toBe(0);
    vi.advanceTimersByTime(SAVE_INTERVAL_MS * 3);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });
});

describe('onboarding persistence', () => {
  it('starts new players at step 0 and skips returning players', () => {
    expect(loadOnboarding(new MemoryStorage(), true)).toBe(0);
    expect(loadOnboarding(new MemoryStorage(), false)).toBeNull();
  });

  it('round-trips the step and "done"', () => {
    const storage = new MemoryStorage();
    saveOnboarding(storage, 2);
    expect(loadOnboarding(storage, true)).toBe(2);
    saveOnboarding(storage, null);
    expect(loadOnboarding(storage, true)).toBeNull();
  });

  it('loadGame flags brand-new players only', () => {
    const storage = new MemoryStorage();
    expect(loadGame(storage, T0, { rng: rng() }).isNew).toBe(true);
    saveGame(makeState(), storage);
    expect(loadGame(storage, T0, { rng: rng() }).isNew).toBe(false);
  });
});

describe('v1 → v2 migration (real table)', () => {
  it('adds feedXp, ownedThemes from tank themes, and boostUntil', () => {
    const v2 = makeState();
    const { feedXp: _f, ownedThemes: _o, ...rest } = v2;
    const v1 = {
      ...rest,
      version: 1,
      tanks: [{ ...v2.tanks[0]!, theme: 'night' }],
      fish: [(({ boostUntil: _b, ...f }) => f)(makeFish())],
    };
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(v1));
    const { state, corrupt } = loadGame(storage, T0, { rng: rng() });
    expect(corrupt).toBe(false);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.feedXp).toEqual({ windowStart: 0, earned: 0 });
    expect(state.ownedThemes.sort()).toEqual(['classic', 'night']);
    expect(state.fish[0]!.boostUntil).toBeNull();
  });
});

describe('v2 → v3 migration', () => {
  it('adds lastBreakXpAt', () => {
    const { lastBreakXpAt: _l, ...v2 } = { ...makeState(), version: 2 };
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(v2));
    const { state, corrupt } = loadGame(storage, T0, { rng: rng() });
    expect(corrupt).toBe(false);
    expect(state.version).toBe(3);
    expect(state.lastBreakXpAt).toBeNull();
  });
});
