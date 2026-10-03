// Versioned localStorage persistence with migrations, corrupt-save backup, and offline catch-up.
import {
  CORRUPT_SAVE_PREFIX,
  MINUTE_MS,
  OFFLINE_SUMMARY_MIN_MS,
  ONBOARDING_KEY,
  ONBOARDING_STEPS,
  SAVE_INTERVAL_MS,
  SAVE_KEY,
  SAVE_VERSION,
} from '../game/constants';
import { createInitialState, simulateOffline, type OfflineSummary } from '../game/sim';
import type { GameState, Rng } from '../game/types';

/** The subset of the Storage API we use (injectable for tests). */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type SaveData = Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade FROM. `migrations[1]` turns a v1 save into v2.
 * When bumping SAVE_VERSION, add an entry here.
 */
export type Migration = (data: SaveData) => SaveData;
export const migrations: Record<number, Migration> = {
  // v1 → v2: persisted feeding-XP window, owned themes; ensure every fish has boostUntil.
  1: (data) => {
    const tanks = Array.isArray(data.tanks) ? data.tanks : [];
    const themes = new Set<string>(['classic']);
    for (const t of tanks) if (isObject(t) && isStr(t.theme)) themes.add(t.theme);
    const fish = Array.isArray(data.fish) ? data.fish.map((f) => (isObject(f) ? { boostUntil: null, ...f } : f)) : data.fish;
    return { ...data, fish, feedXp: { windowStart: 0, earned: 0 }, ownedThemes: [...themes] };
  },
  // v2 → v3: Break Mode XP cooldown.
  2: (data) => ({ ...data, lastBreakXpAt: null }),
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is SaveData => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function isTank(v: unknown): boolean {
  return (
    isObject(v) &&
    isStr(v.id) &&
    isStr(v.theme) &&
    isNum(v.capacity) &&
    isNum(v.cleanliness) &&
    Array.isArray(v.algaeSpots) &&
    Array.isArray(v.decor) &&
    Array.isArray(v.pellets) &&
    Array.isArray(v.shells)
  );
}

function isFish(v: unknown): boolean {
  return (
    isObject(v) &&
    isStr(v.id) &&
    isStr(v.speciesId) &&
    isStr(v.name) &&
    isStr(v.stage) &&
    isNum(v.growth) &&
    isNum(v.hunger) &&
    isNum(v.happiness) &&
    isNum(v.lastDropAt) &&
    isStr(v.tankId)
  );
}

/** Structural check for a current-version save. */
export function isValidGameState(v: unknown): v is GameState {
  if (!isObject(v)) return false;
  if (!isNum(v.version) || !isNum(v.shells) || !isNum(v.pearls) || !isNum(v.xp) || !isNum(v.level) || !isNum(v.lastTickAt)) return false;
  if (!Array.isArray(v.tanks) || v.tanks.length === 0 || !v.tanks.every(isTank)) return false;
  if (!Array.isArray(v.fish) || !v.fish.every(isFish)) return false;
  if (!Array.isArray(v.eggs)) return false;
  if (!isObject(v.inventory) || !isNum(v.inventory.premiumFood)) return false;
  if (!isObject(v.settings) || !isObject(v.stats)) return false;
  if (!isObject(v.feedXp) || !isNum(v.feedXp.windowStart) || !isNum(v.feedXp.earned)) return false;
  if (!Array.isArray(v.ownedThemes) || !v.ownedThemes.every(isStr)) return false;
  if (v.lastBreakXpAt !== null && !isNum(v.lastBreakXpAt)) return false;
  return isStr(v.activeTankId) && v.tanks.some((t) => isObject(t) && t.id === v.activeTankId);
}

// ---------------------------------------------------------------------------
// Save / load
// ---------------------------------------------------------------------------

export function saveGame(state: GameState, storage: SaveStorage): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable (private mode). Nothing useful to do; the game keeps running.
  }
}

/** Runs migrations in order from data.version up to SAVE_VERSION. Throws if a step is missing. */
export function migrate(data: SaveData, table: Record<number, Migration> = migrations): SaveData {
  let current = data;
  let version = current.version;
  if (!isNum(version)) throw new Error('Save has no version');
  if (version > SAVE_VERSION) throw new Error(`Save version ${version} is newer than ${SAVE_VERSION}`);
  while (version < SAVE_VERSION) {
    const step = table[version];
    if (!step) throw new Error(`No migration from version ${version}`);
    current = { ...step(current), version: version + 1 };
    version += 1;
  }
  return current;
}

/** Parses save data from any source (e.g. the cloud): migrates to the current version and validates. Null if unusable. */
export function parseSaveData(data: unknown, table: Record<number, Migration> = migrations): GameState | null {
  try {
    if (!isObject(data)) return null;
    const migrated = migrate(data, table);
    return isValidGameState(migrated) ? migrated : null;
  } catch {
    return null;
  }
}

export interface LoadResult {
  state: GameState;
  /** Present when offline catch-up ran for at least OFFLINE_SUMMARY_MIN_MS. */
  summary: OfflineSummary | null;
  /** True if an unreadable save was backed up and replaced with a fresh game. */
  corrupt: boolean;
  /** True only for a brand-new player (there was no save at all). */
  isNew: boolean;
}

export interface LoadOptions {
  rng?: Rng;
  migrations?: Record<number, Migration>;
}

/** Loads (or creates) the game, migrates it, and simulates time spent away. */
export function loadGame(storage: SaveStorage, now: number, opts: LoadOptions = {}): LoadResult {
  const rng = opts.rng ?? Math.random;
  const raw = storage.getItem(SAVE_KEY);
  if (raw === null) return { state: createInitialState(now, rng), summary: null, corrupt: false, isNew: true };

  let loaded: GameState;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) throw new Error('Save is not an object');
    const migrated = migrate(parsed, opts.migrations);
    if (!isValidGameState(migrated)) throw new Error('Save failed validation');
    loaded = migrated;
  } catch {
    try {
      storage.setItem(`${CORRUPT_SAVE_PREFIX}${now}`, raw);
    } catch {
      // Couldn't back it up; still start fresh rather than crash.
    }
    return { state: createInitialState(now, rng), summary: null, corrupt: true, isNew: false };
  }

  const offline = simulateOffline(loaded, now, rng);
  const summary = offline.summary.elapsedMs >= OFFLINE_SUMMARY_MIN_MS ? offline.summary : null;
  return { state: offline.state, summary, corrupt: false, isNew: false };
}

// ---------------------------------------------------------------------------
// Onboarding progress (UI-only, kept outside GameState)
// ---------------------------------------------------------------------------

/** Current onboarding step, or null when finished. New players start at step 0; existing players skip it. */
export function loadOnboarding(storage: SaveStorage, isNew: boolean): number | null {
  const raw = storage.getItem(ONBOARDING_KEY);
  if (raw === null) return isNew ? 0 : null;
  const step = Number(raw);
  return Number.isInteger(step) && step >= 0 && step < ONBOARDING_STEPS ? step : null;
}

export function saveOnboarding(storage: SaveStorage, step: number | null): void {
  try {
    storage.setItem(ONBOARDING_KEY, step === null ? 'done' : String(step));
  } catch {
    // Not critical.
  }
}

// ---------------------------------------------------------------------------
// Offline summary text
// ---------------------------------------------------------------------------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / MINUTE_MS);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatOfflineSummary(summary: OfflineSummary): string {
  const parts: string[] = [];
  if (summary.shellsDropped > 0) parts.push(`🐚 ${summary.shellValue} shells dropped`);
  if (summary.pearlsDropped > 0) parts.push(`⚪ ${plural(summary.pearlsDropped, 'pearl')}`);
  if (summary.eggsHatched > 0) parts.push(`🥚 ${plural(summary.eggsHatched, 'egg')} hatched`);
  if (summary.fishGrown > 0) parts.push(`🐟 ${summary.fishGrown} grew up a stage`);
  const head = `While you were away (${formatDuration(summary.elapsedMs)})`;
  return parts.length > 0 ? `${head}: ${parts.join(', ')}` : `${head}, your fish missed you!`;
}

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

interface EventSource {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface AutosaveEnv {
  storage: SaveStorage;
  window: EventSource;
  document: EventSource & { visibilityState: string };
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export function browserEnv(): AutosaveEnv {
  return {
    storage: window.localStorage,
    window,
    document,
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (handle) => window.clearInterval(handle as number),
  };
}

/** Saves every 10s, when the page is hidden, and before unload. Returns a stop function. */
export function startAutosave(getState: () => GameState, env: AutosaveEnv): () => void {
  const save = () => saveGame(getState(), env.storage);
  const onVisibility = () => {
    if (env.document.visibilityState === 'hidden') save();
  };
  const handle = env.setInterval(save, SAVE_INTERVAL_MS);
  env.document.addEventListener('visibilitychange', onVisibility);
  env.window.addEventListener('beforeunload', save);
  return () => {
    env.clearInterval(handle);
    env.document.removeEventListener('visibilitychange', onVisibility);
    env.window.removeEventListener('beforeunload', save);
  };
}
