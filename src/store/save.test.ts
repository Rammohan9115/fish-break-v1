import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRUPT_BACKUPS_KEPT, CORRUPT_SAVE_PREFIX, HOUR_MS, MINUTE_MS, SAVE_INTERVAL_MS, SAVE_KEY, SAVE_VERSION } from '../game/constants';
import type { OfflineSummary } from '../game/sim';
import { makeFish, makeState, seededRng, T0 } from '../game/testUtils';
import {
  formatOfflineSummary,
  isValidGameState,
  listCorruptBackups,
  loadGame,
  loadOnboarding,
  migrate,
  restoreCorruptBackup,
  saveGame,
  saveOnboarding,
  startAutosave,
} from './save';
import { setSaveLock } from './saveLock';
import { fakeEnv, MemoryStorage } from './testEnv';

const rng = () => seededRng(1);

afterEach(() => setSaveLock(null));

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
      ...new MemoryStorage(),
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => undefined,
      length: 0,
      key: () => null,
    };
    expect(() => saveGame(makeState(), storage)).not.toThrow();
    expect(saveGame(makeState(), storage)).toBe(false);
  });

  it('a full storage drops old corrupt backups and retries', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${CORRUPT_SAVE_PREFIX}1`, 'x'.repeat(10));
    const realSet = storage.setItem.bind(storage);
    storage.setItem = (k, v) => {
      if (k === SAVE_KEY && storage.data.has(`${CORRUPT_SAVE_PREFIX}1`)) throw new Error('QuotaExceeded');
      realSet(k, v);
    };
    expect(saveGame(makeState(), storage)).toBe(true);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    expect(storage.getItem(`${CORRUPT_SAVE_PREFIX}1`)).toBeNull();
  });

  it('writes nothing while the save is locked', () => {
    const storage = new MemoryStorage();
    setSaveLock('other-tab');
    expect(saveGame(makeState(), storage)).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    setSaveLock(null);
    expect(saveGame(makeState(), storage)).toBe(true);
  });
});

describe('corrupt saves', () => {
  const corruptCases: [string, string][] = [
    ['invalid JSON', '{not json'],
    ['a non-object', '42'],
    ['missing fields', JSON.stringify({ version: SAVE_VERSION, shells: 5 })],
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

describe('a save from a newer version', () => {
  it('is left untouched (not backed up, not corrupt) and flagged tooNew', () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ ...makeState(), version: SAVE_VERSION + 1 });
    storage.setItem(SAVE_KEY, raw);
    const r = loadGame(storage, T0, { rng: rng() });
    expect(r.tooNew).toBe(true);
    expect(r.corrupt).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    expect(listCorruptBackups(storage)).toHaveLength(0);
  });
});

describe('corrupt-save backups', () => {
  it('keeps only the newest few', () => {
    const storage = new MemoryStorage();
    for (let i = 1; i <= 5; i++) {
      storage.setItem(SAVE_KEY, `{bad ${i}`);
      loadGame(storage, T0 + i, { rng: rng() });
    }
    const kept = listCorruptBackups(storage);
    expect(kept).toHaveLength(CORRUPT_BACKUPS_KEPT);
    expect(kept.map((b) => b.at)).toEqual([T0 + 5, T0 + 4]);
  });

  it('restores a backup that is usable again, keeping the replaced save as a backup', () => {
    const storage = new MemoryStorage();
    const good = makeState({ overrides: { shells: 777 } });
    storage.setItem(`${CORRUPT_SAVE_PREFIX}${T0}`, JSON.stringify(good));
    storage.setItem(SAVE_KEY, JSON.stringify(makeState({ overrides: { shells: 1 } })));
    const restored = restoreCorruptBackup(storage, `${CORRUPT_SAVE_PREFIX}${T0}`, T0 + 5);
    expect(restored?.shells).toBe(777);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).shells).toBe(777);
    const backups = listCorruptBackups(storage);
    expect(backups).toHaveLength(1);
    expect(JSON.parse(storage.getItem(backups[0]!.key)!).shells).toBe(1);
  });

  it('refuses a backup that is still unreadable', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${CORRUPT_SAVE_PREFIX}${T0}`, '{nope');
    expect(restoreCorruptBackup(storage, `${CORRUPT_SAVE_PREFIX}${T0}`, T0)).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
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
  const base: OfflineSummary = { elapsedMs: 2 * HOUR_MS + 15 * MINUTE_MS, shellsDropped: 0, shellValue: 0, pearlsDropped: 0, eggsHatched: 0, eggsLaid: 0, toNursery: 0, questComplete: false, fishGrown: 0, levelsGained: [] };

  it('lists what happened', () => {
    const text = formatOfflineSummary({ ...base, shellsDropped: 6, shellValue: 12, pearlsDropped: 1, eggsHatched: 2, fishGrown: 3 });
    expect(text).toBe('While you were away (2h 15m): 🐚 12 shells waiting on the sand, ⚪ 1 pearl, 🥚 2 eggs hatched, 🐟 3 grew up a stage');
  });

  it('mentions eggs laid and babies sent to the Nursery', () => {
    expect(formatOfflineSummary({ ...base, eggsLaid: 1, eggsHatched: 1, toNursery: 2 })).toBe(
      'While you were away (2h 15m): 💕 1 egg laid, 🥚 1 egg hatched, 🍼 2 babies napping in the Nursery',
    );
  });

  it('has a friendly fallback when nothing happened', () => {
    expect(formatOfflineSummary({ ...base, elapsedMs: 5 * MINUTE_MS })).toBe('While you were away (5m), your fish missed you!');
  });
});

describe('startAutosave failures and locks', () => {
  it('reports a failed save once per failure streak', () => {
    const { env, storage } = fakeEnv();
    const failed = vi.fn();
    env.onSaveFailed = failed;
    vi.useFakeTimers();
    let broken = true;
    const real = storage.setItem.bind(storage);
    storage.setItem = (k, v) => {
      if (broken) throw new Error('QuotaExceeded');
      real(k, v);
    };
    const stop = startAutosave(() => makeState(), env);
    vi.advanceTimersByTime(SAVE_INTERVAL_MS * 3);
    expect(failed).toHaveBeenCalledTimes(1);
    broken = false;
    vi.advanceTimersByTime(SAVE_INTERVAL_MS);
    broken = true;
    vi.advanceTimersByTime(SAVE_INTERVAL_MS);
    expect(failed).toHaveBeenCalledTimes(2);
    stop();
    vi.useRealTimers();
  });

  it('does not save while locked', () => {
    const { env, storage } = fakeEnv();
    vi.useFakeTimers();
    setSaveLock('newer');
    const stop = startAutosave(() => makeState(), env);
    vi.advanceTimersByTime(SAVE_INTERVAL_MS * 2);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    stop();
    setSaveLock(null);
    vi.useRealTimers();
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
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.lastBreakXpAt).toBeNull();
  });
});

describe('v3 → v4 migration (breeding overhaul, bigger tanks)', () => {
  /** A v3-shaped save: old capacities (6 + 2 per upgrade), no upgrades/courtships/nursery/quest fields. */
  function v3Save(level: number) {
    const s = makeState({ overrides: { level } });
    const { courtships: _c, nursery: _n, breedingQuest: _q, ...rest } = s;
    const tank = (id: string, capacity: number) => {
      const { upgrades: _u, ...t } = { ...s.tanks[0]!, id, capacity };
      return t;
    };
    const fish = [makeFish({ tankId: 'tank-1' }), makeFish({ tankId: 'tank-1', stage: 'adult', growth: 1200, lastBredAt: T0 - 1000 }), makeFish({ tankId: 'tank-2' })];
    const eggs = [{ id: 'egg-1', speciesId: 'danio', variant: 'zebra', shiny: false, tankId: 'tank-1', hatchAt: T0 + HOUR_MS }];
    return { ...rest, version: 3, tanks: [tank('tank-1', 10), tank('tank-2', 6), tank('tank-3', 12)], fish, eggs };
  }

  it('raises capacities, keeps bought upgrades as +3 steps, and never loses fish or eggs', () => {
    const old = v3Save(9);
    const migrated = migrate(old as unknown as Record<string, unknown>);
    expect(isValidGameState(migrated)).toBe(true);
    const state = migrated as unknown as ReturnType<typeof makeState>;
    // tank-1: 10 = 6 + 2 upgrades → base 10 + 2×3; tank-2: none → 12; tank-3: 3 upgrades (max) → 15 + 9.
    expect(state.tanks.map((t) => [t.capacity, t.upgrades])).toEqual([
      [16, 2],
      [12, 0],
      [24, 3],
    ]);
    expect(state.fish).toEqual(old.fish);
    expect(state.eggs).toEqual(old.eggs);
    expect(state.courtships).toEqual([]);
    expect(state.nursery).toEqual([]);
  });

  it('starts the guide and quest for players already at the breeding level, not before', () => {
    const atFive = migrate(v3Save(5) as unknown as Record<string, unknown>) as unknown as ReturnType<typeof makeState>;
    expect(atFive.breedingQuest).toEqual({ guideSeen: false, status: 'active' });
    const early = migrate(v3Save(3) as unknown as Record<string, unknown>) as unknown as ReturnType<typeof makeState>;
    expect(early.breedingQuest).toEqual({ guideSeen: false, status: 'off' });
  });

  it('loads through loadGame without being treated as corrupt', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(v3Save(6)));
    const { state, corrupt } = loadGame(storage, T0, { rng: rng() });
    expect(corrupt).toBe(false);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.fish).toHaveLength(3);
  });
});

describe('v4 → v5 migration (petting & bond)', () => {
  const strip = (f: ReturnType<typeof makeFish>) => {
    const { bondPoints: _p, bondLevel: _l, petLog: _g, lastPettedAt: _t, feedBondLog: _f, ...rest } = f;
    return rest;
  };

  it('every fish and napping baby starts as a Stranger, and nothing else changes', () => {
    const s = makeState({ fish: [makeFish({ name: 'Bubbles' }), makeFish()] });
    const old = { ...s, version: 4, fish: s.fish.map(strip), nursery: [strip(makeFish({ tankId: '' }))] };
    const migrated = migrate(old as unknown as Record<string, unknown>);
    expect(isValidGameState(migrated)).toBe(true);
    const state = migrated as unknown as ReturnType<typeof makeState>;
    for (const f of [...state.fish, ...state.nursery]) {
      expect(f).toMatchObject({ bondPoints: 0, bondLevel: 0, petLog: [], lastPettedAt: null, feedBondLog: [] });
    }
    expect(state.fish[0]!.name).toBe('Bubbles');
    expect(state.tanks).toEqual(s.tanks);
  });

  it('a v4 save missing bond fields is not valid until migrated', () => {
    const s = makeState({ fish: [makeFish()] });
    expect(isValidGameState({ ...s, fish: s.fish.map(strip) })).toBe(false);
  });
});

describe('v5 → v6 migration (decor customization)', () => {
  it('placed decor gets the default look, tanks get the default style and empty layouts; nothing is lost', () => {
    const s = makeState({ fish: [makeFish()] });
    const oldTank = (({ style: _s, layoutPresets: _l, ...t }) => ({ ...t, decor: [{ id: 'd1', decorId: 'castle', x: 300 }] }))(s.tanks[0]!);
    const { decorInventory: _i, ownedStyles: _o, ...rest } = s;
    const migrated = migrate({ ...rest, version: 5, tanks: [oldTank] } as unknown as Record<string, unknown>);
    expect(isValidGameState(migrated)).toBe(true);
    const state = migrated as unknown as ReturnType<typeof makeState>;
    expect(state.tanks[0]!.decor).toEqual([{ id: 'd1', decorId: 'castle', x: 300, flipped: false, size: 'M', depth: 'back' }]);
    expect(state.tanks[0]!.style.frame).toBe('frame:glass');
    expect(state.tanks[0]!.layoutPresets).toEqual([null, null, null]);
    expect(state.decorInventory).toEqual({});
    expect(state.ownedStyles).toEqual([]);
    expect(state.fish).toEqual(s.fish);
  });
});
