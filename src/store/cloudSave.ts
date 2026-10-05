// Cloud saves via Supabase (client-only). Guest play is the default; when a player logs in we
// load/merge their cloud save, then keep it synced: debounced writes while playing, a write when
// the tab is hidden, and conditional writes keyed on the server's updated_at so two devices never
// silently overwrite each other. Network calls never block gameplay; localStorage stays the cache.
import type { SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import {
  CLOUD_FINAL_SAVE_TIMEOUT_MS,
  CLOUD_META_KEY,
  CLOUD_SAVE_DEBOUNCE_MS,
  OFFLINE_SUMMARY_MIN_MS,
  SAVE_KEY,
  SAVE_VERSION,
  STARTING,
} from '../game/constants';
import { createInitialState, simulateOffline } from '../game/sim';
import type { GameState } from '../game/types';
import { cloudConfigured, getSupabase, needsSupabaseAtStart } from '../lib/supabase';
import { useGameStore } from './gameStore';
import { formatOfflineSummary, parseSaveData, saveGame } from './save';

// ---------------------------------------------------------------------------
// Backend interface (Supabase in production, a fake in tests)
// ---------------------------------------------------------------------------

export interface CloudRow {
  data: unknown;
  version: number;
  /** Server timestamp of the last write (ISO string, exactly as returned). */
  updatedAt: string;
}

export interface CloudBackend {
  fetch(userId: string): Promise<CloudRow | null>;
  /** Creates or replaces the row. Returns the new updatedAt. */
  upsert(userId: string, state: GameState): Promise<string>;
  /** Writes only if the row's updatedAt still equals `expected`. Returns the new updatedAt, or null on conflict. */
  updateIf(userId: string, state: GameState, expected: string): Promise<string | null>;
}

export function supabaseBackend(client: SupabaseClient): CloudBackend {
  return {
    async fetch(userId) {
      const { data, error } = await client.from('saves').select('data, version, updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { data: data.data as unknown, version: data.version as number, updatedAt: data.updated_at as string };
    },
    async upsert(userId, state) {
      const { data, error } = await client
        .from('saves')
        .upsert({ user_id: userId, data: state, version: SAVE_VERSION })
        .select('updated_at')
        .single();
      if (error) throw error;
      return data.updated_at as string;
    },
    async updateIf(userId, state, expected) {
      const { data, error } = await client
        .from('saves')
        .update({ data: state, version: SAVE_VERSION })
        .eq('user_id', userId)
        .eq('updated_at', expected)
        .select('updated_at');
      if (error) throw error;
      const row = data?.[0];
      return row ? (row.updated_at as string) : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export interface SaveSummary {
  level: number;
  shells: number;
  pearls: number;
  fish: number;
  lastPlayed: number;
}

export function summarize(state: GameState): SaveSummary {
  return { level: state.level, shells: state.shells, pearls: state.pearls, fish: state.fish.length, lastPlayed: state.lastTickAt };
}

/** True if a local game has real progress worth protecting (vs. a brand-new guest tank). */
export function hasProgress(state: GameState): boolean {
  return (
    state.level > 1 ||
    state.xp > 0 ||
    state.stats.fed > 0 ||
    state.stats.hatched > 0 ||
    state.tanks.length > 1 ||
    state.fish.length !== STARTING.fishCount ||
    state.shells !== STARTING.shells
  );
}

/** Which user this device last synced with, and the cloud updated_at it last saw. */
export interface CloudMeta {
  userId: string;
  lastSyncedAt: string | null;
}

export interface MetaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readMeta(storage: MetaStorage): CloudMeta | null {
  try {
    const raw = storage.getItem(CLOUD_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CloudMeta>;
    return typeof parsed.userId === 'string' ? { userId: parsed.userId, lastSyncedAt: parsed.lastSyncedAt ?? null } : null;
  } catch {
    return null;
  }
}

function writeMeta(storage: MetaStorage, meta: CloudMeta | null): void {
  try {
    if (meta) storage.setItem(CLOUD_META_KEY, JSON.stringify(meta));
    else storage.removeItem(CLOUD_META_KEY);
  } catch {
    // Storage unavailable: we'll just treat the next login as a first login.
  }
}

// ---------------------------------------------------------------------------
// Sync engine
// ---------------------------------------------------------------------------

export type SyncStatus = 'off' | 'synced' | 'saving' | 'offline' | 'error' | 'conflict';

export interface CloudConflict {
  local: GameState;
  cloud: GameState;
  cloudUpdatedAt: string;
}

export interface SyncHooks {
  getGame(): GameState;
  /** Replace the running game (and the local cache) with `state`. */
  applyGame(state: GameState): void;
  toast(text: string): void;
  setStatus(status: SyncStatus): void;
  setConflict(conflict: CloudConflict | null): void;
  now(): number;
  storage: MetaStorage;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class CloudSync {
  private userId: string | null = null;
  /** True once login reconciliation finished, so saves are safe (we know the cloud state). */
  private ready = false;
  private conflictPending = false;
  private loggingIn = false;
  private saving: Promise<void> | null = null;
  /** Did the most recent push reach the cloud (or adopt the cloud's newer data)? */
  private lastPushOk = false;
  private timer: unknown = null;

  constructor(
    private readonly backend: CloudBackend,
    private readonly hooks: SyncHooks,
  ) {}

  get currentUser(): string | null {
    return this.userId;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Loads cloud data into the game, running the usual offline catch-up. Returns false if the data is unusable. */
  private loadCloud(row: CloudRow, message: string | null): boolean {
    const cloud = parseSaveData(row.data);
    if (!cloud) return false;
    const now = this.hooks.now();
    const caughtUp = simulateOffline(cloud, now);
    this.hooks.applyGame(caughtUp.state);
    writeMeta(this.hooks.storage, { userId: this.userId!, lastSyncedAt: row.updatedAt });
    if (message) this.hooks.toast(message);
    if (caughtUp.summary.elapsedMs >= OFFLINE_SUMMARY_MIN_MS) this.hooks.toast(formatOfflineSummary(caughtUp.summary));
    return true;
  }

  /**
   * Reconciles local and cloud after a login (new or restored session).
   * - No cloud row → upload local.
   * - Same user as last time: cloud changed since our last sync → load cloud; otherwise push local.
   * - First login on this device: fresh local → load cloud; local has progress → ask the player.
   */
  async login(userId: string): Promise<void> {
    if (this.userId === userId && (this.ready || this.conflictPending || this.loggingIn)) return;
    this.loggingIn = true;
    try {
      await this.reconcile(userId);
    } finally {
      this.loggingIn = false;
    }
  }

  private async reconcile(userId: string): Promise<void> {
    this.userId = userId;
    this.ready = false;
    this.conflictPending = false;
    this.hooks.setStatus('saving');
    let row: CloudRow | null;
    try {
      row = await this.backend.fetch(userId);
    } catch {
      this.hooks.setStatus('offline');
      return; // Retried by retry() when we're back online.
    }
    if (this.userId !== userId) return; // Logged out meanwhile.
    const meta = readMeta(this.hooks.storage);

    if (!row) {
      await this.push(true);
      return;
    }
    const cloud = parseSaveData(row.data);
    if (!cloud) {
      // Unreadable (e.g. saved by a newer app version): never overwrite it; keep playing locally.
      this.hooks.toast("Your cloud save couldn't be read on this version, so it was left untouched. Playing locally.");
      this.hooks.setStatus('error');
      return;
    }
    if (meta?.userId === userId) {
      if (meta.lastSyncedAt !== row.updatedAt) {
        this.loadCloud(row, '☁️ Loaded your latest progress from the cloud');
        this.ready = true;
        this.hooks.setStatus('synced');
      } else {
        this.ready = true;
        await this.push(false);
      }
      return;
    }
    const local = this.hooks.getGame();
    if (!hasProgress(local)) {
      this.loadCloud(row, '☁️ Welcome back! Loaded your cloud save');
      this.ready = true;
      this.hooks.setStatus('synced');
      return;
    }
    this.conflictPending = true;
    this.hooks.setStatus('conflict');
    this.hooks.setConflict({ local, cloud, cloudUpdatedAt: row.updatedAt });
  }

  /** The player picked which save to keep after a first-login conflict. */
  async resolveConflict(choice: 'local' | 'cloud'): Promise<void> {
    if (!this.userId || !this.conflictPending) return;
    this.conflictPending = false;
    this.hooks.setConflict(null);
    if (choice === 'cloud') {
      let row: CloudRow | null = null;
      try {
        row = await this.backend.fetch(this.userId);
      } catch {
        this.hooks.setStatus('offline');
        this.conflictPending = true;
        return;
      }
      if (row && this.loadCloud(row, '☁️ Loaded your cloud save')) {
        this.ready = true;
        this.hooks.setStatus('synced');
        return;
      }
    }
    await this.push(true);
  }

  /** Debounced save: at most one cloud write per CLOUD_SAVE_DEBOUNCE_MS while the game keeps changing. */
  scheduleSave(): void {
    if (!this.userId || this.timer !== null) return;
    this.timer = this.hooks.setTimeout(() => {
      this.timer = null;
      void this.saveNow();
    }, CLOUD_SAVE_DEBOUNCE_MS);
  }

  /** Immediate save (e.g. tab hidden). Safe to call any time; no-op until login reconciliation is done. */
  async saveNow(): Promise<void> {
    if (this.timer !== null) {
      this.hooks.clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.userId || !this.ready || this.conflictPending) return;
    await this.push(false);
  }

  /** Retries whatever failed while offline. */
  async retry(): Promise<void> {
    if (!this.userId) return;
    if (!this.ready && !this.conflictPending) {
      const id = this.userId;
      this.userId = null;
      await this.login(id);
    } else {
      await this.saveNow();
    }
  }

  /**
   * Writes the local game to the cloud. Uses a conditional update keyed on the last known updatedAt;
   * if another device wrote in the meantime, we load its data instead of overwriting it.
   */
  private async push(force: boolean): Promise<void> {
    if (this.saving) return this.saving;
    const userId = this.userId;
    if (!userId) return;
    const run = async () => {
      this.lastPushOk = false;
      this.hooks.setStatus('saving');
      const state = this.hooks.getGame();
      const meta = readMeta(this.hooks.storage);
      const lastKnown = meta?.userId === userId ? meta.lastSyncedAt : null;
      try {
        const at = force || !lastKnown ? await this.backend.upsert(userId, state) : await this.backend.updateIf(userId, state, lastKnown);
        if (this.userId !== userId) return;
        if (at === null) {
          // Someone else (another device) saved since our last sync: load theirs instead of overwriting.
          const row = await this.backend.fetch(userId);
          if (row && !this.loadCloud(row, '☁️ Loaded newer progress from another device')) {
            this.hooks.setStatus('error');
            return;
          }
        } else {
          writeMeta(this.hooks.storage, { userId, lastSyncedAt: at });
        }
        this.ready = true;
        this.lastPushOk = true;
        this.hooks.setStatus('synced');
      } catch {
        this.hooks.setStatus('offline');
      }
    };
    this.saving = run().finally(() => {
      this.saving = null;
    });
    return this.saving;
  }

  /**
   * Final save (bounded wait), then forget the user and start a fresh guest game with a clean local cache.
   * If that final save can't be confirmed (offline, timeout, conflict pending) and the game has progress, nothing is
   * cleared and `{ ok: false }` is returned so the UI can warn; pass `force` to log out and lose it anyway.
   */
  async logout(force = false): Promise<{ ok: boolean }> {
    if (this.userId) {
      let confirmed = false;
      if (this.ready && !this.conflictPending) {
        this.lastPushOk = false;
        await Promise.race([
          this.push(false),
          new Promise<void>((resolve) => this.hooks.setTimeout(resolve, CLOUD_FINAL_SAVE_TIMEOUT_MS)),
        ]);
        confirmed = this.lastPushOk;
      }
      if (!confirmed && !force && hasProgress(this.hooks.getGame())) return { ok: false };
    }
    if (this.timer !== null) this.hooks.clearTimeout(this.timer);
    this.timer = null;
    this.userId = null;
    this.ready = false;
    this.conflictPending = false;
    this.hooks.setConflict(null);
    writeMeta(this.hooks.storage, null);
    try {
      this.hooks.storage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
    this.hooks.applyGame(createInitialState(this.hooks.now()));
    this.hooks.setStatus('off');
    return { ok: true };
  }

  dispose(): void {
    if (this.timer !== null) this.hooks.clearTimeout(this.timer);
    this.timer = null;
  }
}

// ---------------------------------------------------------------------------
// UI-facing store + wiring
// ---------------------------------------------------------------------------

export interface CloudUser {
  id: string;
  email: string | null;
}

interface CloudStore {
  /** False when Supabase env vars are missing (local-only mode). */
  enabled: boolean;
  user: CloudUser | null;
  status: SyncStatus;
  conflict: CloudConflict | null;
}

export const useCloudStore = create<CloudStore>()(() => ({
  enabled: cloudConfigured,
  user: null,
  status: 'off',
  conflict: null,
}));

let activeSync: CloudSync | null = null;

/** Starts auth listening + sync. Returns a cleanup function. No-op in local-only mode. */
export function startCloudSync(): () => void {
  if (!needsSupabaseAtStart()) return () => undefined; // guests never load supabase-js
  let disposed = false;
  let detach: () => void = () => undefined;
  void getSupabase().then((client) => {
    if (client && !disposed) detach = attachCloudSync(client);
  });
  return () => {
    disposed = true;
    detach();
  };
}

function attachCloudSync(client: SupabaseClient): () => void {
  const sync = new CloudSync(supabaseBackend(client), {
    getGame: () => useGameStore.getState().game,
    applyGame: (state) => {
      useGameStore.getState().loadState(state);
      saveGame(state, window.localStorage);
    },
    toast: (text) => useGameStore.getState().addToast(text),
    setStatus: (status) => useCloudStore.setState({ status }),
    setConflict: (conflict) => useCloudStore.setState({ conflict }),
    now: () => Date.now(),
    storage: window.localStorage,
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  });
  activeSync = sync;

  const onSession = (user: { id: string; email?: string | null } | null) => {
    if (!user) return;
    useCloudStore.setState({ user: { id: user.id, email: user.email ?? null } });
    void sync.login(user.id);
  };
  // A failed/expired magic link comes back as #error_description=… in the URL.
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const authError = hash.get('error_description');
  if (authError) {
    useGameStore.getState().addToast(`Login link problem: ${authError}. Try sending a new one from ⚙️ Settings.`);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  void client.auth.getSession().then(({ data }) => onSession(data.session?.user ?? null));
  const { data: authSub } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') onSession(session?.user ?? null);
  });

  const unsubscribeGame = useGameStore.subscribe((s, prev) => {
    if (s.game !== prev.game) sync.scheduleSave();
  });
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void sync.saveNow();
  };
  const onOnline = () => void sync.retry();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);

  return () => {
    authSub.subscription.unsubscribe();
    unsubscribeGame();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    sync.dispose();
    if (activeSync === sync) activeSync = null;
  };
}

// ---------------------------------------------------------------------------
// Auth actions (used by the Settings and Login UI)
// ---------------------------------------------------------------------------

export async function sendMagicLink(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, message: 'Cloud saves are not set up.' };
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/** Redirects the page to Google; on return, the session is picked up from the URL on load. */
export async function signInWithGoogle(): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, message: 'Cloud saves are not set up.' };
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/** Returns false (and stays logged in) when unsynced progress would be lost and `force` isn't set. */
export async function logOut(force = false): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return true;
  const result = (await activeSync?.logout(force)) ?? { ok: true };
  if (!result.ok) return false;
  await supabase.auth.signOut();
  useCloudStore.setState({ user: null, status: 'off', conflict: null });
  useGameStore.getState().addToast('Logged out. Starting a fresh guest tank 🐟');
  return true;
}

export async function resolveCloudConflict(choice: 'local' | 'cloud'): Promise<void> {
  await activeSync?.resolveConflict(choice);
}
