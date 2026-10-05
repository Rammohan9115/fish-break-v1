// Versioned localStorage persistence with migrations, corrupt-save backup, and offline catch-up.
import {
  BREEDING_QUEST_REWARD,
  CAPACITY_UPGRADE,
  CORRUPT_BACKUPS_KEPT,
  CORRUPT_SAVE_PREFIX,
  DEFAULT_TANK_STYLE,
  LAYOUT_PRESET_SLOTS,
  MINUTE_MS,
  OFFLINE_SUMMARY_MIN_MS,
  ONBOARDING_KEY,
  ONBOARDING_STEPS,
  SAVE_INTERVAL_MS,
  SAVE_KEY,
  SAVE_VERSION,
  UNLOCK_LEVEL,
} from '../game/constants';
import { baseCapacity } from '../game/economy';
import { createInitialState, simulateOffline, type OfflineSummary } from '../game/sim';
import type { GameState, Rng } from '../game/types';
import { isSaveLocked } from './saveLock';

/** The subset of the Storage API we use (injectable for tests). */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
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
  // v3 → v4: player-driven breeding and roomier tanks.
  // - Capacity: tanks start at 10 / 12 / 15 (by order) and each upgrade adds 3. Upgrades already bought
  //   (old: +2 each from 6) carry over as the same number of new +3 steps.
  // - The old random breeding kept no pending state beyond lastBredAt (kept) and eggs (kept as-is;
  //   they simply stop counting toward capacity). Courtships and the Nursery start empty.
  // - Players already at the breeding level see the new guide and quest once.
  3: (data) => {
    const tanks = Array.isArray(data.tanks)
      ? data.tanks.map((t, i) => {
          if (!isObject(t)) return t;
          const oldCapacity = isNum(t.capacity) ? t.capacity : V3_BASE_CAPACITY;
          const upgrades = Math.min(V3_MAX_UPGRADES, Math.max(0, Math.round((oldCapacity - V3_BASE_CAPACITY) / V3_UPGRADE_SLOTS)));
          return { ...t, upgrades, capacity: baseCapacity(i) + upgrades * CAPACITY_UPGRADE.slots };
        })
      : data.tanks;
    const level = isNum(data.level) ? data.level : 1;
    return {
      ...data,
      tanks,
      courtships: [],
      nursery: [],
      breedingQuest: { guideSeen: false, status: level >= UNLOCK_LEVEL.breeding ? 'active' : 'off' },
    };
  },
  // v4 → v5: petting & bond. Every fish (and napping baby) starts as a Stranger.
  4: (data) => {
    const withBond = (list: unknown) =>
      Array.isArray(list) ? list.map((f) => (isObject(f) ? { bondPoints: 0, bondLevel: 0, petLog: [], lastPettedAt: null, feedBondLog: [], ...f } : f)) : list;
    return { ...data, fish: withBond(data.fish), nursery: withBond(data.nursery) };
  },
  // v5 → v6: decor customization. Placed decor gets flip/size/depth defaults, every tank gets the default
  // style and empty layout slots, and there's a decor box (inventory) and owned styles. Nothing is lost.
  5: (data) => {
    const tanks = Array.isArray(data.tanks)
      ? data.tanks.map((t) => {
          if (!isObject(t)) return t;
          const decor = Array.isArray(t.decor) ? t.decor.map((d) => (isObject(d) ? { flipped: false, size: 'M', depth: 'back', ...d } : d)) : [];
          return { ...t, decor, style: { ...DEFAULT_TANK_STYLE }, layoutPresets: Array.from({ length: LAYOUT_PRESET_SLOTS }, () => null) };
        })
      : data.tanks;
    return { ...data, tanks, decorInventory: {}, ownedStyles: [] };
  },
};

/** The v3 capacity rules, needed to read old saves: base 6, +2 per upgrade, at most 3 upgrades. */
const V3_BASE_CAPACITY = 6;
const V3_UPGRADE_SLOTS = 2;
const V3_MAX_UPGRADES = 3;

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
    isNum(v.upgrades) &&
    isNum(v.cleanliness) &&
    Array.isArray(v.algaeSpots) &&
    Array.isArray(v.decor) &&
    Array.isArray(v.pellets) &&
    Array.isArray(v.shells) &&
    isObject(v.style) &&
    Array.isArray(v.layoutPresets)
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
    isStr(v.tankId) &&
    isNum(v.bondPoints) &&
    isNum(v.bondLevel) &&
    Array.isArray(v.petLog) &&
    Array.isArray(v.feedBondLog)
  );
}

/** Structural check for a current-version save. */
export function isValidGameState(v: unknown): v is GameState {
  if (!isObject(v)) return false;
  if (!isNum(v.version) || !isNum(v.shells) || !isNum(v.pearls) || !isNum(v.xp) || !isNum(v.level) || !isNum(v.lastTickAt)) return false;
  if (!Array.isArray(v.tanks) || v.tanks.length === 0 || !v.tanks.every(isTank)) return false;
  if (!Array.isArray(v.fish) || !v.fish.every(isFish)) return false;
  if (!Array.isArray(v.eggs)) return false;
  if (!Array.isArray(v.courtships) || !Array.isArray(v.nursery) || !v.nursery.every(isFish)) return false;
  if (!isObject(v.breedingQuest) || typeof v.breedingQuest.guideSeen !== 'boolean' || !isStr(v.breedingQuest.status)) return false;
  if (!isObject(v.inventory) || !isNum(v.inventory.premiumFood)) return false;
  if (!isObject(v.settings) || !isObject(v.stats)) return false;
  if (!isObject(v.feedXp) || !isNum(v.feedXp.windowStart) || !isNum(v.feedXp.earned)) return false;
  if (!Array.isArray(v.ownedThemes) || !v.ownedThemes.every(isStr)) return false;
  if (v.lastBreakXpAt !== null && !isNum(v.lastBreakXpAt)) return false;
  if (!isObject(v.decorInventory) || !Array.isArray(v.ownedStyles)) return false;
  return isStr(v.activeTankId) && v.tanks.some((t) => isObject(t) && t.id === v.activeTankId);
}

// ---------------------------------------------------------------------------
// Save / load
// ---------------------------------------------------------------------------

/**
 * Writes the save. Returns false when nothing was written: the save is locked (newer version / another tab leads)
 * or storage failed. A full storage first drops old corrupt-save backups (the only expendable data) and retries once.
 */
export function saveGame(state: GameState, storage: SaveStorage): boolean {
  if (isSaveLocked()) return false;
  const json = JSON.stringify(state);
  try {
    storage.setItem(SAVE_KEY, json);
    return true;
  } catch {
    // Storage full or unavailable (private mode).
  }
  try {
    for (const backup of listCorruptBackups(storage)) storage.removeItem(backup.key);
    storage.setItem(SAVE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Corrupt-save backups
// ---------------------------------------------------------------------------

export interface CorruptBackup {
  key: string;
  /** When the unreadable save was set aside (ms). */
  at: number;
}

/** Backups of unreadable saves, newest first. */
export function listCorruptBackups(storage: SaveStorage): CorruptBackup[] {
  const found: CorruptBackup[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(CORRUPT_SAVE_PREFIX)) continue;
    const at = Number(key.slice(CORRUPT_SAVE_PREFIX.length));
    found.push({ key, at: Number.isFinite(at) ? at : 0 });
  }
  return found.sort((a, b) => b.at - a.at);
}

/** Keeps only the newest `keep` backups so they can't eat the storage quota. */
export function pruneCorruptBackups(storage: SaveStorage, keep = CORRUPT_BACKUPS_KEPT): void {
  for (const backup of listCorruptBackups(storage).slice(keep)) {
    try {
      storage.removeItem(backup.key);
    } catch {
      // ignore
    }
  }
}

/**
 * Tries to bring a backup back: migrates and validates it, and on success makes it the current save (the save it
 * replaces is kept as a backup itself, so a restore can be undone). Null if the backup is still unusable.
 */
export function restoreCorruptBackup(storage: SaveStorage, key: string, now: number): GameState | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const state = parseSaveData(JSON.parse(raw));
    if (!state) return null;
    const current = storage.getItem(SAVE_KEY);
    if (current !== null) storage.setItem(`${CORRUPT_SAVE_PREFIX}${now}`, current);
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    storage.removeItem(key);
    pruneCorruptBackups(storage);
    return state;
  } catch {
    return null;
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
  /** True if the save was written by a newer version: it is left untouched and the game starts fresh, unsaved. */
  tooNew: boolean;
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
  if (raw === null) return { state: createInitialState(now, rng), summary: null, corrupt: false, tooNew: false, isNew: true };

  let loaded: GameState;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) throw new Error('Save is not an object');
    // A newer game wrote this (e.g. after a rollback): not corrupt, so don't touch it.
    if (isNum(parsed.version) && parsed.version > SAVE_VERSION) {
      return { state: createInitialState(now, rng), summary: null, corrupt: false, tooNew: true, isNew: false };
    }
    const migrated = migrate(parsed, opts.migrations);
    if (!isValidGameState(migrated)) throw new Error('Save failed validation');
    loaded = migrated;
  } catch {
    try {
      storage.setItem(`${CORRUPT_SAVE_PREFIX}${now}`, raw);
    } catch {
      // Couldn't back it up; still start fresh rather than crash.
    }
    pruneCorruptBackups(storage);
    return { state: createInitialState(now, rng), summary: null, corrupt: true, tooNew: false, isNew: false };
  }

  const offline = simulateOffline(loaded, now, rng);
  const summary = offline.summary.elapsedMs >= OFFLINE_SUMMARY_MIN_MS ? offline.summary : null;
  return { state: offline.state, summary, corrupt: false, tooNew: false, isNew: false };
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

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / MINUTE_MS);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatOfflineSummary(summary: OfflineSummary): string {
  const parts: string[] = [];
  if (summary.shellsDropped > 0) parts.push(`🐚 ${summary.shellValue} shells waiting on the sand`);
  if (summary.pearlsDropped > 0) parts.push(`⚪ ${plural(summary.pearlsDropped, 'pearl')}`);
  if (summary.eggsLaid > 0) parts.push(`💕 ${plural(summary.eggsLaid, 'egg')} laid`);
  if (summary.eggsHatched > 0) parts.push(`🥚 ${plural(summary.eggsHatched, 'egg')} hatched`);
  if (summary.questComplete) parts.push(`🎉 first baby: +${BREEDING_QUEST_REWARD.shells} 🐚 +${BREEDING_QUEST_REWARD.pearls} ⚪`);
  if (summary.toNursery > 0) parts.push(`🍼 ${plural(summary.toNursery, 'baby', 'babies')} napping in the Nursery`);
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
  /** Called (once per failure streak) when a save couldn't be written because storage is full or unavailable. */
  onSaveFailed?: () => void;
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
  let failing = false;
  const save = () => {
    if (isSaveLocked()) return;
    const ok = saveGame(getState(), env.storage);
    if (!ok && !failing) env.onSaveFailed?.();
    failing = !ok;
  };
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
