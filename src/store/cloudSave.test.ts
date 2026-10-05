import { describe, expect, it } from 'vitest';
import { CLOUD_FINAL_SAVE_TIMEOUT_MS, CLOUD_META_KEY, CLOUD_SAVE_DEBOUNCE_MS, MINUTE_MS, SAVE_KEY, SAVE_VERSION } from '../game/constants';
import { createInitialState } from '../game/sim';
import { makeFish, makeState, seededRng, T0 } from '../game/testUtils';
import type { GameState } from '../game/types';
import { CloudSync, hasProgress, readMeta, type CloudBackend, type CloudConflict, type CloudRow, type SyncStatus } from './cloudSave';
import { MemoryStorage } from './testEnv';

/** In-memory Supabase stand-in with a server clock for updated_at. */
class FakeBackend implements CloudBackend {
  rows = new Map<string, CloudRow>();
  clock = 0;
  offline = false;
  writes = 0;
  private stamp(): string {
    this.clock += 1;
    return `2026-01-01T00:00:${String(this.clock).padStart(2, '0')}Z`;
  }
  async fetch(userId: string) {
    if (this.offline) throw new Error('offline');
    return this.rows.get(userId) ?? null;
  }
  async upsert(userId: string, state: GameState) {
    if (this.offline) throw new Error('offline');
    this.writes += 1;
    const updatedAt = this.stamp();
    this.rows.set(userId, { data: structuredClone(state), version: SAVE_VERSION, updatedAt });
    return updatedAt;
  }
  async updateIf(userId: string, state: GameState, expected: string) {
    if (this.offline) throw new Error('offline');
    const row = this.rows.get(userId);
    if (!row || row.updatedAt !== expected) return null;
    return this.upsert(userId, state);
  }
}

function setup(local: GameState, backend = new FakeBackend(), storage = new MemoryStorage()) {
  const h = {
    game: local,
    statuses: [] as SyncStatus[],
    toasts: [] as string[],
    conflict: null as CloudConflict | null,
    timers: [] as { fn: () => void; ms: number; cleared: boolean }[],
  };
  const sync = new CloudSync(backend, {
    getGame: () => h.game,
    applyGame: (s) => {
      h.game = s;
      storage.setItem(SAVE_KEY, JSON.stringify(s));
    },
    toast: (t) => h.toasts.push(t),
    setStatus: (s) => h.statuses.push(s),
    setConflict: (c) => {
      h.conflict = c;
    },
    now: () => h.game.lastTickAt + MINUTE_MS / 2,
    storage,
    setTimeout: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      h.timers.push(t);
      return t;
    },
    clearTimeout: (t) => {
      (t as { cleared: boolean }).cleared = true;
    },
  });
  const status = () => h.statuses[h.statuses.length - 1];
  return { sync, h, backend, storage, status };
}

const progressed = (shells: number, level = 4) => makeState({ fish: [makeFish({ name: 'Mochi' })], overrides: { shells, level, xp: 10 } });
const fresh = () => createInitialState(T0, seededRng(2));

describe('hasProgress', () => {
  it('treats a brand-new guest tank as no progress', () => {
    expect(hasProgress(fresh())).toBe(false);
    expect(hasProgress(progressed(500))).toBe(true);
  });
});

describe('CloudSync login', () => {
  it('uploads local progress when the cloud has no save', async () => {
    const { sync, backend, storage, status } = setup(progressed(500));
    await sync.login('u1');
    expect((backend.rows.get('u1')!.data as GameState).shells).toBe(500);
    expect(readMeta(storage)).toEqual({ userId: 'u1', lastSyncedAt: backend.rows.get('u1')!.updatedAt });
    expect(status()).toBe('synced');
  });

  it('silently loads the cloud save when local is a fresh guest game', async () => {
    const backend = new FakeBackend();
    await backend.upsert('u1', progressed(900));
    const { sync, h, status } = setup(fresh(), backend);
    await sync.login('u1');
    expect(h.game.shells).toBe(900);
    expect(h.conflict).toBeNull();
    expect(status()).toBe('synced');
  });

  it('asks the player when both local and cloud have progress, and honours the choice', async () => {
    const backend = new FakeBackend();
    await backend.upsert('u1', progressed(900));
    const a = setup(progressed(100), backend);
    await a.sync.login('u1');
    expect(a.status()).toBe('conflict');
    expect(a.h.conflict?.cloud.shells).toBe(900);
    expect(a.h.conflict?.local.shells).toBe(100);
    // No saves while the choice is pending.
    await a.sync.saveNow();
    expect((backend.rows.get('u1')!.data as GameState).shells).toBe(900);

    await a.sync.resolveConflict('local');
    expect(a.h.conflict).toBeNull();
    expect((backend.rows.get('u1')!.data as GameState).shells).toBe(100);

    const b = setup(progressed(100), backend);
    await b.sync.login('u1');
    await b.sync.resolveConflict('cloud');
    expect(b.h.game.shells).toBe(100); // cloud now holds device A's choice
    expect(b.status()).toBe('synced');
  });

  it('loads the cloud when it changed since this device last synced', async () => {
    const backend = new FakeBackend();
    const storage = new MemoryStorage();
    const first = setup(progressed(100), backend, storage);
    await first.sync.login('u1');
    // Another device writes newer progress.
    await backend.upsert('u1', progressed(777));
    const again = setup(progressed(100), backend, storage);
    await again.sync.login('u1');
    expect(again.h.game.shells).toBe(777);
    expect(again.h.conflict).toBeNull();
  });

  it('never overwrites cloud data it cannot read', async () => {
    const backend = new FakeBackend();
    backend.rows.set('u1', { data: { version: 99, junk: true }, version: 99, updatedAt: 'x' });
    const { sync, status, h } = setup(progressed(100), backend);
    await sync.login('u1');
    await sync.saveNow();
    expect(status()).toBe('error');
    expect(backend.rows.get('u1')!.updatedAt).toBe('x');
    expect(h.toasts.join()).toMatch(/left untouched/);
  });

  it('runs migrations on older cloud saves before loading', async () => {
    const backend = new FakeBackend();
    const old = progressed(321) as unknown as Record<string, unknown>;
    const { lastBreakXpAt: _drop, ...v2 } = { ...old, version: 2 } as Record<string, unknown>;
    backend.rows.set('u1', { data: v2, version: 2, updatedAt: 'old' });
    const { sync, h } = setup(fresh(), backend);
    await sync.login('u1');
    expect(h.game.shells).toBe(321);
    expect(h.game.version).toBe(SAVE_VERSION);
  });

  it('goes offline without blocking, and retries later', async () => {
    const backend = new FakeBackend();
    backend.offline = true;
    const { sync, status } = setup(progressed(100), backend);
    await sync.login('u1');
    expect(status()).toBe('offline');
    backend.offline = false;
    await sync.retry();
    expect(status()).toBe('synced');
    expect(backend.rows.has('u1')).toBe(true);
  });
});

describe('CloudSync saving', () => {
  it('debounces saves to one write per window', async () => {
    const { sync, h, backend } = setup(progressed(100));
    await sync.login('u1');
    const before = backend.writes;
    sync.scheduleSave();
    sync.scheduleSave();
    sync.scheduleSave();
    const pending = h.timers.filter((t) => t.ms === CLOUD_SAVE_DEBOUNCE_MS && !t.cleared);
    expect(pending).toHaveLength(1);
    h.game = { ...h.game, shells: 222 };
    pending[0]!.fn();
    await new Promise((r) => setTimeout(r, 0));
    expect(backend.writes).toBe(before + 1);
    expect((backend.rows.get('u1')!.data as GameState).shells).toBe(222);
  });

  it('loads the newer cloud copy instead of overwriting another device', async () => {
    const backend = new FakeBackend();
    const a = setup(progressed(100), backend, new MemoryStorage());
    await a.sync.login('u1');
    const b = setup(fresh(), backend, new MemoryStorage());
    await b.sync.login('u1');
    b.h.game = { ...b.h.game, shells: 5000 };
    await b.sync.saveNow();
    // Device A still thinks the old row is current: its save must not clobber B's.
    a.h.game = { ...a.h.game, shells: 1 };
    await a.sync.saveNow();
    expect((backend.rows.get('u1')!.data as GameState).shells).toBe(5000);
    expect(a.h.game.shells).toBe(5000);
    expect(a.h.toasts.join()).toMatch(/another device/);
  });
});

describe('CloudSync logout', () => {
  it('saves once more, clears the local cache, and starts a fresh guest game', async () => {
    const { sync, h, backend, storage, status } = setup(progressed(100));
    await sync.login('u1');
    h.game = { ...h.game, shells: 4242 };
    await sync.logout();
    expect((backend.rows.get('u1')!.data as GameState).shells).toBe(4242);
    expect(storage.getItem(CLOUD_META_KEY)).toBeNull();
    expect(h.game.shells).not.toBe(4242);
    expect(hasProgress(h.game)).toBe(false);
    expect(status()).toBe('off');
  });

  it('does not hang when the final save cannot reach the server, and keeps the progress', async () => {
    const backend = new FakeBackend();
    const { sync, h, storage } = setup(progressed(100), backend);
    await sync.login('u1');
    h.game = { ...h.game, shells: 4242 };
    const never = new Promise<string | null>(() => undefined);
    backend.updateIf = () => never;
    const done = sync.logout();
    const timeout = h.timers.find((t) => t.ms === CLOUD_FINAL_SAVE_TIMEOUT_MS)!;
    timeout.fn();
    expect(await done).toEqual({ ok: false });
    expect(h.game.shells).toBe(4242);
    expect(readMeta(storage)).not.toBeNull();
  });

  it('refuses to wipe unsynced progress while offline', async () => {
    const { sync, h, backend, storage } = setup(progressed(100));
    await sync.login('u1');
    h.game = { ...h.game, shells: 777 };
    backend.offline = true;
    expect(await sync.logout()).toEqual({ ok: false });
    expect(h.game.shells).toBe(777);
    expect(readMeta(storage)).not.toBeNull();
  });

  it('logs out anyway when forced (the player accepted the risk)', async () => {
    const { sync, h, backend } = setup(progressed(100));
    await sync.login('u1');
    h.game = { ...h.game, shells: 777 };
    backend.offline = true;
    expect(await sync.logout(true)).toEqual({ ok: true });
    expect(hasProgress(h.game)).toBe(false);
  });
});
