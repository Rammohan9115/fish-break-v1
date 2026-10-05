// Zustand store: holds GameState, runs the fixed 1-second sim tick, exposes player actions.
import { create } from 'zustand';
import {
  BREEDING,
  THEMES,
  FEED_COOLDOWN_MS,
  TOAST_QUEUE_MAX,
  FISH_NAME_MAX_LENGTH,
  DECOR,
  DECOR_UNDO_STEPS,
  OCTOBER_MONTH,
  STYLE_OPTIONS,
  FOLLOW_MS,
  GREET_AWAY_MS,
  GREET_START_DELAY_MS,
  TRICK_COOLDOWN_MS,
  JUVENILE_AT_FRACTION,
  MINUTE_MS,
  ONBOARDING_STEPS,
  OFFLINE_STEP_MS,
  OFFLINE_SUMMARY_MIN_MS,
  PELLET_SINK_SPEED,
  PELLET_SPAWN_Y,
  SIM_TICK_MS,
  TANK_EDGE_MARGIN,
  TANK_WIDTH,
  UNLOCK_LEVEL,
  XP,
} from '../game/constants';
import {
  bondName,
  completePetSession,
  grantFeedBond,
  levelUnlockText,
  setBondLevel,
  TRICKS,
  type BondLevelUp,
  type TrickId,
} from '../game/bond';
import { breedingChecklist, compatiblePartners, startCourtship } from '../game/breeding';
import * as economy from '../game/economy';
import { grantXp } from '../game/levels';
import { getSpecies } from '../game/species';
import {
  eatPellet as simEatPellet,
  createFish,
  createInitialState,
  growthTotalSeconds,
  simulateOffline,
  tankOccupancy,
  tick,
  wipeAlgae as wipeAlgaeRule,
  type SimEvent,
} from '../game/sim';
import type { BondLevel, DecorId, GameState, PlacedDecor, TankStyle, Rng, SpeciesId, Stage, ThemeId } from '../game/types';
import {
  browserEnv,
  formatOfflineSummary,
  loadGame,
  loadOnboarding,
  saveGame,
  saveOnboarding,
  startAutosave,
  type AutosaveEnv,
  type SaveStorage,
} from './save';
import { isSaveLocked, setSaveLock } from './saveLock';
import { browserTabLockHooks, TabLock } from './tabLock';

export interface Toast {
  id: number;
  text: string;
  /** Bumped when a duplicate merges in, so a visible toast restarts its timer. */
  rev: number;
}

/** "+5 🐚" → { amount: 5, unit: "🐚" } (merged by adding amounts). */
const AMOUNT_TOAST = /^\+(\d+) (.+)$/u;

/**
 * Notification budget: an identical toast already waiting or showing is refreshed instead of repeated,
 * and "+N thing" toasts add up ("+3 🐚" ×4 → "+12 🐚"). The queue keeps at most TOAST_QUEUE_MAX.
 */
export function mergeToast(toasts: Toast[], text: string, id: number): Toast[] {
  const m = AMOUNT_TOAST.exec(text);
  if (m) {
    const unit = m[2];
    const match = toasts.find((t) => AMOUNT_TOAST.exec(t.text)?.[2] === unit);
    if (match) {
      const total = Number(AMOUNT_TOAST.exec(match.text)?.[1] ?? 0) + Number(m[1]);
      return toasts.map((t) => (t === match ? { ...t, text: `+${total} ${unit}`, rev: t.rev + 1 } : t));
    }
  }
  const same = toasts.find((t) => t.text === text);
  if (same) return toasts.map((t) => (t === same ? { ...t, rev: t.rev + 1 } : t));
  return [...toasts, { id, text, rev: 0 }].slice(-TOAST_QUEUE_MAX);
}

/** What a click in the tank does. 'look' = select fish / collect shells; 'clean' = sponge algae. */
export type ToolMode = 'look' | 'feed' | 'premium' | 'clean' | 'decorate';

/** Overlay panel currently open. */
export type Panel = 'shop' | 'tanks' | 'break' | 'settings' | 'breeding' | 'myfish' | null;
export type BreedingTab = 'pairs' | 'nursery';

/** An active Break Mode session (UI-only; not saved). */
export interface BreakSession {
  durationMs: number;
  startedAt: number;
  breathing: boolean;
  /** Set when the timer completes: XP granted (0 if already earned this hour). */
  result: { xp: number } | null;
}
export type ShopTab = 'fish' | 'food' | 'decor' | 'styles' | 'tanks';

/** Player-facing text for a failed purchase. */
export const PURCHASE_ERROR_TEXT: Record<economy.PurchaseError, string> = {
  locked: 'Not unlocked yet',
  cost: "Can't afford that yet",
  full: 'This tank is full',
  theme: 'Needs a different tank theme',
  max: 'Maxed out',
  owned: 'Already yours',
  notFound: 'Not found',
  notSellable: "Babies can't be sold yet 🐣",
  claimed: 'Already opened today',
  courting: 'In love — try again after the egg 💞',
  event: 'Back next October 🎃',
};

/** Onboarding steps: 0 Feed → 1 Watch them grow → 2 Collect shells → 3 Pet your fish. null = finished/not shown. */
export type OnboardingStep = number | null;

export interface GameStore {
  game: GameState;
  /** True once startGame has loaded the save (UI that depends on saved state waits for it). */
  loaded: boolean;
  mode: ToolMode;
  selectedFishId: string | null;
  /** Placed decor (in the active tank) whose card is open. */
  selectedDecorId: string | null;
  onboardingStep: OnboardingStep;
  panel: Panel;
  shopTab: ShopTab;
  breakSession: BreakSession | null;
  toasts: Toast[];
  /** Levels reached that the level-up modal hasn't shown yet. */
  pendingLevelUps: number[];
  /** Transient (not saved): feed rate limit. */
  lastPelletAt: number;
  /** Pairing mode: the fish looking for a partner (the tank dims, compatible fish glow). */
  pairingFishId: string | null;
  /** The confirm sheet for a chosen pair. */
  pairSheet: { aId: string; bId: string } | null;
  breedingTab: BreedingTab;
  /** The 4-card breeding guide is showing. */
  guideOpen: boolean;
  /** The fish whose quick actions (Feed · Pair · Info) float next to it. */
  quickFishId: string | null;
  /** Last tap in the tank while a tool mode is on (modes exit after MODE_IDLE_EXIT_MS idle). */
  modeTouchedAt: number;
  /** Transient: the fish being petted and its meter (0..100, in steps), for the FishCard's live region. */
  petProgress: { fishId: string; pct: number } | null;
  /** Transient: when each `${fishId}:${trick}` can play again (ms). */
  trickCooldowns: Record<string, number>;
  /** Transient: a Best Friend+ fish following the pointer, until this time (ms). */
  follow: { fishId: string; until: number } | null;
  /** Decorate mode undo/redo (this session only): snapshots of the tank's decor and the decor box. */
  decorHistory: { past: DecorSnapshot[]; future: DecorSnapshot[] };
  /** Shop "Try it": a ghost of the item in the tank, positioned before buying. */
  tryDecor: ({ decorId: DecorId; x: number } & Pick<PlacedDecor, 'flipped' | 'size' | 'depth'>) | null;
  /** Tank Style live preview (not applied until used or bought). */
  stylePreview: Partial<TankStyle> | null;
  /** Decorate mode tray tab. */
  trayTab: TrayTab;
  /** Dev: the October event is forced on (shop and purchases behave as if it's October). */
  eventForced: boolean;

  loadState: (game: GameState) => void;
  /** Runs fixed 1s sim ticks up to `now`; long gaps use offline catch-up. */
  advanceTo: (now: number, rng?: Rng) => void;
  /** Drops a pellet at logical x in the active tank. Returns false if rate-limited or out of premium food. */
  /** `nearFishIds`: fish within BOND.feedRadius of the drop (they earn a little bond if they eat it). */
  dropPellet: (x: number, premium?: boolean, nearFishIds?: readonly string[]) => boolean;
  eatPellet: (fishId: string, pelletId: string) => boolean;
  collectDrop: (dropId: string) => boolean;
  wipeAlgae: (spotId: string) => boolean;
  renameFish: (fishId: string, name: string) => void;
  toggleMute: () => void;
  addToast: (text: string) => void;
  dismissToast: (id: number) => void;
  dismissLevelUp: () => void;
  /** Switches tool. Premium with no food left shows a toast and stays put. */
  setMode: (mode: ToolMode) => void;
  selectFish: (fishId: string | null) => void;
  /** Shows (or hides, with null) the quick actions for a tapped fish. */
  showQuickActions: (fishId: string | null) => void;
  /** Marks activity in the current tool mode (resets the idle exit). */
  touchMode: () => void;
  setReducedMotion: (on: boolean) => void;
  /** A pet session completed (the meter filled). Null if the fish is gone. */
  petFish: (fishId: string) => { rewarded: boolean; levelUp: BondLevelUp | null } | null;
  setPetProgress: (progress: { fishId: string; pct: number } | null) => void;
  /** Plays a trick if unlocked and off cooldown. Returns false otherwise. */
  playTrick: (fishId: string, trick: TrickId) => boolean;
  /** Best Friend+: follow the pointer for FOLLOW_MS (or stop). */
  toggleFollow: (fishId: string) => void;
  /** Decorate mode: decor box, editing, layouts, undo/redo. */
  placeFromBox: (decorId: DecorId, x: number) => boolean;
  storeDecor: (placedId: string) => boolean;
  updateDecor: (placedId: string, change: Partial<Pick<PlacedDecor, 'flipped' | 'size' | 'depth'>>) => void;
  sellBoxedDecor: (decorId: DecorId) => boolean;
  savePreset: (slot: number, name: string) => void;
  applyPreset: (slot: number) => void;
  /** Call before a drag (or any decor change) so it can be undone. */
  recordDecor: () => void;
  undoDecor: () => void;
  redoDecor: () => void;
  setTrayTab: (tab: TrayTab) => void;
  /** Tank styles: preview (null clears), apply an owned/free option, buy one, and the free extras. */
  previewStyle: (change: Partial<TankStyle> | null) => void;
  applyStyle: (optionId: string) => boolean;
  buyStyle: (optionId: string) => boolean;
  setStyleExtras: (change: { lightingColor?: string; nameplate?: boolean }) => void;
  /** Shop "Try it": show a ghost, move it, then buy & place it (or cancel). */
  startTry: (decorId: DecorId) => void;
  moveTry: (x: number) => void;
  confirmTry: () => boolean;
  cancelTry: () => void;
  /** Shows the first-time tips again. */
  replayTips: () => void;
  /** Completes `step` if it is the current one (no-op otherwise). */
  completeOnboardingStep: (step: number) => void;
  skipOnboarding: () => void;
  openPanel: (panel: Panel, tab?: ShopTab) => void;
  /** Shop & economy. Each returns true on success; failures show a toast. */
  buyFish: (speciesId: SpeciesId) => boolean;
  sellFish: (fishId: string) => boolean;
  buyPremiumFood: () => boolean;
  buyDecor: (decorId: DecorId) => boolean;
  sellDecor: (tankId: string, placedId: string) => boolean;
  buyCapacityUpgrade: () => boolean;
  buyTank: () => boolean;
  buyTheme: (themeId: ThemeId) => boolean;
  applyTheme: (themeId: ThemeId) => boolean;
  switchTank: (tankId: string) => void;
  renameTank: (tankId: string, name: string) => void;
  moveFish: (fishId: string, tankId: string) => boolean;
  /** Slides decor along the sand (active tank). */
  moveDecor: (placedId: string, x: number) => void;
  /** Breeding: enter pairing mode for a ready fish (or go straight to the sheet with `partnerId`). */
  startPairing: (fishId: string, partnerId?: string) => boolean;
  /** In pairing mode: choose the partner (opens the confirm sheet if compatible). */
  pickPartner: (fishId: string) => void;
  cancelPairing: () => void;
  /** From the confirm sheet: start the courtship (x = where the egg will be laid). */
  confirmCourtship: (x?: number) => boolean;
  moveFromNursery: (babyId: string, tankId: string) => boolean;
  rehomeBaby: (babyId: string) => boolean;
  openBreeding: (tab?: BreedingTab) => void;
  openGuide: () => void;
  /** Closing the guide marks it seen and starts the first-baby quest (once). */
  closeGuide: () => void;
  selectDecor: (placedId: string | null) => void;
  startBreak: (minutes: number, breathing: boolean) => void;
  /** Called when the break timer reaches zero: +10 XP once per hour. */
  finishBreak: () => void;
  exitBreak: () => void;
  /** Opens today's gift if available (the gift box UI comes later). */
  claimDailyGift: () => economy.DailyGiftContents | null;
  /** Dev-only helpers for previewing art (used by the dev panel). */
  dev: DevActions;
}

export interface DevSpawnOptions {
  speciesId: SpeciesId;
  stage: Exclude<Stage, 'egg'>;
  variant?: string;
  shiny?: boolean;
}

export interface DevActions {
  spawnFish: (opts: DevSpawnOptions) => void;
  clearFish: () => void;
  setMood: (mood: { hunger?: number; happiness?: number }) => void;
  setTheme: (theme: ThemeId) => void;
  /** Breeding test helpers: make the tank's fish ready, end courtships now, hatch eggs now, fill the tank. */
  makeReady: () => void;
  finishCourtships: () => void;
  hatchEggsNow: () => void;
  fillTank: () => void;
  /** Bond test helpers. */
  setBondLevel: (fishId: string, level: BondLevel) => void;
  resetPetCaps: () => void;
  greet: () => void;
  /** Give one of every decor piece (into the decor box) and every tank style. */
  giveAllDecor: () => void;
  /** Pretend it's October (the Halloween event) until turned off. Not saved. */
  forceEvent: (on: boolean) => void;
}

/** Growth seconds that put a fish at the start of `stage`. */
function growthForStage(speciesId: SpeciesId, stage: Exclude<Stage, 'egg'>): number {
  const total = growthTotalSeconds(speciesId);
  if (stage === 'adult') return total;
  return stage === 'juvenile' ? Math.ceil(total * JUVENILE_AT_FRACTION) : 0;
}

/** Why the active tank can't switch to `themeId` (a theme-only species lives there). */
function themeBlockedReason(game: GameState, themeId: ThemeId): string {
  const blocker = game.fish.find((f) => {
    const need = getSpecies(f.speciesId).themeOnly;
    return f.tankId === game.activeTankId && need !== null && need !== themeId;
  });
  if (!blocker) return 'This tank can’t use that theme.';
  const species = getSpecies(blocker.speciesId);
  return `${species.name} live here and need the ${THEMES[species.themeOnly!].name} theme. Use it on another tank!`;
}

/** Live sim events (not offline catch-up) for the renderer: hearts, egg placement, hatch spawns. */
type SimListener = (events: SimEvent[]) => void;
const simListeners = new Set<SimListener>();

export function subscribeSimEvents(listener: SimListener): () => void {
  simListeners.add(listener);
  return () => simListeners.delete(listener);
}

/** Friendly toasts for live breeding events (eggs laid, hatches, Nursery, the quest reward). */
export function breedingToasts(events: SimEvent[], game: GameState): string[] {
  const all = [...game.fish, ...game.nursery];
  const name = (id: string) => all.find((f) => f.id === id)?.name ?? 'A fish';
  const texts: string[] = [];
  for (const e of events) {
    if (e.type === 'eggLaid') {
      const egg = game.eggs.find((g) => g.id === e.eggId);
      const mins = egg ? Math.max(1, Math.round((egg.hatchAt - game.lastTickAt) / MINUTE_MS)) : null;
      texts.push(`💕 ${name(e.parentIds[0])} & ${name(e.parentIds[1])} laid an egg!${mins ? ` It hatches in ${mins} min.` : ''}`);
    } else if (e.type === 'hatched') {
      const fish = all.find((f) => f.id === e.fishId);
      const species = fish ? getSpecies(fish.speciesId).name : 'baby';
      if (e.shiny) texts.push(`✨ Shiny! ✨ Say hi to ${name(e.fishId)} the ${species} (+${BREEDING.shinyHatchPearls} ⚪)`);
      else texts.push(`🐣 ${name(e.fishId)} the ${species} hatched!`);
      if (e.destination === 'nursery') texts.push('🍼 Baby moved to the Nursery — make room or upgrade your tank.');
    } else if (e.type === 'eggWaiting') {
      texts.push('🥚 An egg is ready, but the tank and the Nursery are full. It will wait until there’s room.');
    } else if (e.type === 'questComplete') {
      texts.push(`🎉 Your first baby! +${e.shells} 🐚 +${e.pearls} ⚪`);
    }
  }
  return texts;
}

/** Bond moments for the renderer (not saved): level-ups, tricks, follow mode, the welcome-back greeting. */
export type BondEvent =
  | { type: 'levelUp'; fishId: string; to: BondLevel }
  | { type: 'trick'; fishId: string; trick: TrickId }
  | { type: 'follow'; fishId: string; until: number | null }
  | { type: 'greet'; fishIds: string[] };
type BondListener = (event: BondEvent) => void;
const bondListeners = new Set<BondListener>();

export function subscribeBondEvents(listener: BondListener): () => void {
  bondListeners.add(listener);
  return () => bondListeners.delete(listener);
}

function emitBond(event: BondEvent): void {
  for (const listener of bondListeners) listener(event);
}

/** What Decorate-mode undo restores: one tank's decor and the decor box. */
export interface DecorSnapshot {
  tankId: string;
  decor: PlacedDecor[];
  inventory: GameState['decorInventory'];
}

export type TrayTab = 'box' | 'layouts' | 'style';

/** Pellets dropped near fish: pelletId → the fish that were close (hand-feeding bond). Transient. */
const nearPellets = new Map<string, readonly string[]>();

/** Friendly+ fish in the active tank (they greet you after a long time away). */
function greeters(game: GameState): string[] {
  return game.fish.filter((f) => f.tankId === game.activeTankId && f.bondLevel >= 2).map((f) => f.id);
}

export const trickKey = (fishId: string, trick: TrickId): string => `${fishId}:${trick}`;

let toastSeq = 0;
let pelletSeq = 0;
let devFishSeq = 0;

/** Whether a fish's bond level unlocks this trick. */
function unlockedTrick(level: BondLevel, trick: TrickId): boolean {
  return TRICKS.some((t) => t.id === trick && level >= t.level);
}

/**
 * The clock seasonal decor checks against: now, or a day in October while the dev "force Halloween" switch is on.
 */
export function eventClock(): number {
  if (!useGameStore.getState().eventForced) return Date.now();
  const d = new Date();
  return new Date(d.getFullYear(), OCTOBER_MONTH, 15, 12).getTime();
}

/** Puts a snapshot's decor and decor box back (undo/redo). */
function restoreDecor(game: GameState, snap: DecorSnapshot): GameState {
  return { ...game, decorInventory: snap.inventory, tanks: game.tanks.map((t) => (t.id === snap.tankId ? { ...t, decor: snap.decor } : t)) };
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const useGameStore = create<GameStore>()((set, get) => {
  /** Queues level-up modals (LevelUpModal shows them one at a time). */
  const announceLevelUps = (levels: number[]) => {
    if (levels.length === 0) return;
    set((s) => ({ pendingLevelUps: [...s.pendingLevelUps, ...levels] }));
  };

  /** Commits a successful economy result, or toasts why it failed. */
  const commitResult = (result: economy.Result, success?: string): boolean => {
    if (!result.ok) {
      get().addToast(PURCHASE_ERROR_TEXT[result.reason]);
      return false;
    }
    set({ game: result.state });
    if (success) get().addToast(success);
    announceLevelUps(result.levelsGained);
    return true;
  };

  /** Applies an XP grant to the current game and announces any level-ups. */
  const commitWithXp = (game: GameState, amount: number) => {
    const { state, levelsGained } = grantXp(game, amount);
    set({ game: state });
    announceLevelUps(levelsGained);
  };

  /** Celebrates a bond level-up: a toast naming what's new, and the renderer's burst + trick demo. */
  const announceBondLevelUp = (levelUp: BondLevelUp | null) => {
    if (!levelUp) return;
    const fish = get().game.fish.find((f) => f.id === levelUp.fishId);
    if (!fish) return;
    const unlock = levelUnlockText(levelUp.to, fish.speciesId);
    get().addToast(`${fish.name} is now your ${bondName(levelUp.to)}! 🎉${unlock ? ` ${unlock.replace('Trick:', 'New trick:')}` : ''}`);
    emitBond({ type: 'levelUp', fishId: fish.id, to: levelUp.to });
  };

  const levelUpsFrom = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'levelUp' ? [e.level] : []));

  return {
    game: createInitialState(),
    loaded: false,
    mode: 'look',
    selectedFishId: null,
    selectedDecorId: null,
    onboardingStep: null,
    panel: null,
    shopTab: 'fish',
    breakSession: null,
    toasts: [],
    pendingLevelUps: [],
    lastPelletAt: -Infinity,
    pairingFishId: null,
    pairSheet: null,
    breedingTab: 'pairs',
    guideOpen: false,
    quickFishId: null,
    modeTouchedAt: 0,
    petProgress: null,
    trickCooldowns: {},
    follow: null,
    decorHistory: { past: [], future: [] },
    tryDecor: null,
    stylePreview: null,
    trayTab: 'box',
    eventForced: false,

    loadState: (game) =>
      set({
        game,
        pendingLevelUps: [],
        lastPelletAt: -Infinity,
        selectedFishId: null,
        selectedDecorId: null,
        mode: 'look',
        panel: null,
        pairingFishId: null,
        pairSheet: null,
        guideOpen: false,
        quickFishId: null,
      }),

    advanceTo: (now, rng = Math.random) => {
      let game = get().game;
      const gap = now - game.lastTickAt;
      if (gap < 0) {
        // Clock went backwards; resync instead of freezing the tank.
        set({ game: { ...game, lastTickAt: now } });
        return;
      }
      const events: SimEvent[] = [];
      if (gap >= OFFLINE_STEP_MS) {
        // Tab was hidden or the machine slept: catch up in bulk.
        const result = simulateOffline(game, now, rng);
        game = result.state;
        events.push(...result.events);
        if (result.summary.elapsedMs >= OFFLINE_SUMMARY_MIN_MS) get().addToast(formatOfflineSummary(result.summary));
        if (gap >= GREET_AWAY_MS) {
          const fishIds = greeters(game);
          if (fishIds.length > 0) emitBond({ type: 'greet', fishIds });
        }
      } else {
        while (game.lastTickAt + SIM_TICK_MS <= now) {
          const result = tick(game, SIM_TICK_MS, rng);
          game = result.state;
          events.push(...result.events);
        }
      }
      set({ game });
      announceLevelUps(levelUpsFrom(events));
      if (gap < OFFLINE_STEP_MS && events.length > 0) {
        for (const text of breedingToasts(events, game)) get().addToast(text);
        for (const listener of simListeners) listener(events);
      }
    },

    dropPellet: (x, premium = false, nearFishIds = []) => {
      const now = Date.now();
      const { game, lastPelletAt } = get();
      if (now - lastPelletAt < FEED_COOLDOWN_MS) return false;
      if (premium && game.inventory.premiumFood <= 0) return false;
      pelletSeq += 1;
      const pellet = {
        id: `pellet-${now.toString(36)}-${pelletSeq}`,
        x: clamp(x, TANK_EDGE_MARGIN, TANK_WIDTH - TANK_EDGE_MARGIN),
        y: PELLET_SPAWN_Y,
        vy: PELLET_SINK_SPEED,
        premium,
        landedAt: null,
      };
      get().completeOnboardingStep(0);
      if (nearFishIds.length > 0) nearPellets.set(pellet.id, nearFishIds);
      set({
        lastPelletAt: now,
        game: {
          ...game,
          inventory: premium ? { ...game.inventory, premiumFood: game.inventory.premiumFood - 1 } : game.inventory,
          tanks: game.tanks.map((t) => (t.id === game.activeTankId ? { ...t, pellets: [...t.pellets, pellet] } : t)),
        },
      });
      return true;
    },

    eatPellet: (fishId, pelletId) => {
      const now = Date.now();
      const { game } = get();
      let next = simEatPellet(game, fishId, pelletId, now);
      if (next === game) return false;
      // Hand-fed: the pellet was dropped near this fish.
      let levelUp: BondLevelUp | null = null;
      if (nearPellets.get(pelletId)?.includes(fishId)) ({ state: next, levelUp } = grantFeedBond(next, fishId, now));
      nearPellets.delete(pelletId);
      // Forget pellets that are gone (dissolved or eaten elsewhere).
      if (nearPellets.size > 0) {
        const alive = new Set(next.tanks.flatMap((t) => t.pellets.map((p) => p.id)));
        for (const id of nearPellets.keys()) if (!alive.has(id)) nearPellets.delete(id);
      }
      // Feeding XP is capped per hour-long window (saved, so reloads don't reset it).
      const { xp, feedXp } = economy.feedingXp(next, now);
      commitWithXp({ ...next, feedXp }, xp);
      announceBondLevelUp(levelUp);
      return true;
    },

    collectDrop: (dropId) => {
      const next = economy.collectDrop(get().game, dropId);
      if (!next) return false;
      commitWithXp(next, XP.shellCollected);
      get().completeOnboardingStep(2);
      return true;
    },

    wipeAlgae: (spotId) => {
      const next = wipeAlgaeRule(get().game, spotId);
      if (!next) return false;
      commitWithXp(next, XP.algaeWiped);
      return true;
    },

    renameFish: (fishId, name) => {
      const trimmed = name.trim().slice(0, FISH_NAME_MAX_LENGTH);
      if (trimmed.length === 0) return;
      set((s) => ({ game: { ...s.game, fish: s.game.fish.map((f) => (f.id === fishId ? { ...f, name: trimmed } : f)) } }));
    },

    toggleMute: () =>
      set((s) => ({ game: { ...s.game, settings: { ...s.game.settings, muted: !s.game.settings.muted } } })),

    addToast: (text) => {
      toastSeq += 1;
      const toast = { id: toastSeq, text };
      set((s) => ({ toasts: mergeToast(s.toasts, toast.text, toast.id) }));
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    dismissLevelUp: () => {
      const level = get().pendingLevelUps[0];
      set((s) => ({ pendingLevelUps: s.pendingLevelUps.slice(1) }));
      // Reaching the breeding level opens the guide (once).
      if (level === UNLOCK_LEVEL.breeding && !get().game.breedingQuest.guideSeen) set({ guideOpen: true });
    },

    setMode: (mode) => {
      if (mode === 'premium' && get().game.inventory.premiumFood <= 0) {
        get().addToast('Out of premium food 🌟');
        return;
      }
      if (mode === 'clean') {
        const { game } = get();
        const tank = game.tanks.find((t) => t.id === game.activeTankId);
        // Nothing to wipe: say so and stay in look mode instead of entering an empty mode. (A tank below
        // ALGAE_FLOOR_CLEANLINESS always has spots, so this only happens when it's actually clean enough.)
        if (tank && tank.algaeSpots.length === 0) {
          get().addToast(`✨ Looking good (${Math.round(tank.cleanliness)}% clean). Nothing to wipe right now.`);
          return;
        }
      }
      const leaving = get().mode === 'decorate' && mode !== 'decorate';
      set({
        mode,
        modeTouchedAt: Date.now(),
        quickFishId: null,
        ...(mode === 'decorate' ? { panel: null, selectedFishId: null, tryDecor: null } : {}),
        ...(leaving ? { decorHistory: { past: [], future: [] }, stylePreview: null, selectedDecorId: null } : {}),
      });
    },

    selectFish: (fishId) => {
      set(fishId ? { selectedFishId: fishId, selectedDecorId: null, quickFishId: null } : { selectedFishId: null });
      if (fishId) get().completeOnboardingStep(1);
    },

    showQuickActions: (fishId) => {
      set(fishId ? { quickFishId: fishId, selectedFishId: null, selectedDecorId: null } : { quickFishId: null });
      if (fishId) get().completeOnboardingStep(1);
    },

    touchMode: () => set({ modeTouchedAt: Date.now() }),

    setReducedMotion: (on) => set((s) => ({ game: { ...s.game, settings: { ...s.game.settings, reducedMotion: on } } })),

    petFish: (fishId) => {
      const result = completePetSession(get().game, fishId, Date.now());
      if (result.state === get().game) return null;
      set({ game: result.state });
      announceLevelUps(result.levelsGained);
      announceBondLevelUp(result.levelUp);
      get().completeOnboardingStep(3);
      return { rewarded: result.rewarded, levelUp: result.levelUp };
    },

    setPetProgress: (petProgress) => {
      const prev = get().petProgress;
      if (prev?.fishId === petProgress?.fishId && prev?.pct === petProgress?.pct) return;
      set({ petProgress });
    },

    playTrick: (fishId, trick) => {
      const fish = get().game.fish.find((f) => f.id === fishId);
      if (!fish || trick === 'follow') return false;
      const now = Date.now();
      const key = trickKey(fishId, trick);
      if ((get().trickCooldowns[key] ?? 0) > now) return false;
      if (!unlockedTrick(fish.bondLevel, trick)) return false;
      set((s) => ({ trickCooldowns: { ...s.trickCooldowns, [key]: now + TRICK_COOLDOWN_MS } }));
      emitBond({ type: 'trick', fishId, trick });
      return true;
    },

    toggleFollow: (fishId) => {
      const fish = get().game.fish.find((f) => f.id === fishId);
      if (!fish || !unlockedTrick(fish.bondLevel, 'follow')) return;
      const now = Date.now();
      const current = get().follow;
      if (current && current.fishId === fishId && current.until > now) {
        set({ follow: null });
        emitBond({ type: 'follow', fishId, until: null });
        return;
      }
      const until = now + FOLLOW_MS;
      if (current && current.fishId !== fishId) emitBond({ type: 'follow', fishId: current.fishId, until: null });
      set({ follow: { fishId, until } });
      emitBond({ type: 'follow', fishId, until });
    },

    replayTips: () => set({ onboardingStep: 0, panel: null }),

    completeOnboardingStep: (step) => {
      if (get().onboardingStep !== step) return;
      set({ onboardingStep: step + 1 < ONBOARDING_STEPS ? step + 1 : null });
    },

    skipOnboarding: () => set({ onboardingStep: null }),

    openPanel: (panel, tab) => set((s) => ({ panel, mode: 'look', shopTab: tab ?? s.shopTab })),

    buyFish: (speciesId) => {
      const before = new Set(get().game.fish.map((f) => f.id));
      const result = economy.buyFish(get().game, speciesId, Date.now(), Math.random);
      const born = result.ok ? result.state.fish.find((f) => !before.has(f.id)) : undefined;
      return commitResult(result, born ? `Welcome, ${born.name}! 🐟` : undefined);
    },

    sellFish: (fishId) => {
      const fish = get().game.fish.find((f) => f.id === fishId);
      const value = fish ? economy.sellValue(fish) : null;
      const sold = commitResult(economy.sellFish(get().game, fishId), fish && value !== null ? `Sold ${fish.name} for ${value} 🐚` : undefined);
      if (sold && get().selectedFishId === fishId) set({ selectedFishId: null });
      return sold;
    },

    buyPremiumFood: () => commitResult(economy.buyPremiumFood(get().game), '🌟 +3 premium food'),
    buyDecor: (decorId) => {
      const result = economy.buyDecor(get().game, decorId, eventClock(), Math.random);
      return commitResult(result, result.ok && result.boxed ? '📦 Tank is full, so it went into your decor box' : '🪴 Placed! Drag it in 🎨 Decorate mode to move it.');
    },
    sellDecor: (tankId, placedId) => {
      const placed = get().game.tanks.find((t) => t.id === tankId)?.decor.find((d) => d.id === placedId);
      const refund = placed ? economy.decorRefund(placed.decorId) : null;
      const sold = commitResult(
        economy.sellDecor(get().game, tankId, placedId),
        refund ? `Sold for ${refund.amount} ${refund.currency === 'shells' ? '🐚' : 'pearls'}` : undefined,
      );
      if (sold && get().selectedDecorId === placedId) set({ selectedDecorId: null });
      // Money changes can't be undone (it would bring the piece back for free), so the undo history starts over.
      if (sold) set({ decorHistory: { past: [], future: [] } });
      return sold;
    },
    buyCapacityUpgrade: () => commitResult(economy.buyCapacityUpgrade(get().game), '🏠 More room in the tank!'),
    buyTank: () => commitResult(economy.buyTank(get().game, Date.now(), Math.random), '🏠 A brand new tank!'),

    buyTheme: (themeId) => {
      if (!commitResult(economy.buyTheme(get().game, themeId))) return false;
      const applied = economy.applyTheme(get().game, get().game.activeTankId, themeId);
      if (applied.ok) {
        set({ game: applied.state });
        get().addToast(`🎨 ${THEMES[themeId].name} theme unlocked!`);
      } else {
        get().addToast(`🎨 ${THEMES[themeId].name} unlocked! ${themeBlockedReason(get().game, themeId)}`);
      }
      return true;
    },

    applyTheme: (themeId) => {
      const result = economy.applyTheme(get().game, get().game.activeTankId, themeId);
      if (!result.ok && result.reason === 'theme') {
        get().addToast(themeBlockedReason(get().game, themeId));
        return false;
      }
      return commitResult(result);
    },

    switchTank: (tankId) => {
      if (!get().game.tanks.some((t) => t.id === tankId)) return;
      set((s) => ({ game: { ...s.game, activeTankId: tankId }, selectedFishId: null, selectedDecorId: null }));
    },

    renameTank: (tankId, name) => {
      const result = economy.renameTank(get().game, tankId, name);
      if (result.ok) set({ game: result.state });
    },

    moveFish: (fishId, tankId) => {
      const fish = get().game.fish.find((f) => f.id === fishId);
      const tank = get().game.tanks.find((t) => t.id === tankId);
      const moved = commitResult(economy.moveFish(get().game, fishId, tankId), fish && tank ? `🏠 ${fish.name} moved to ${tank.name}` : undefined);
      if (moved && get().selectedFishId === fishId) set({ selectedFishId: null });
      return moved;
    },

    startPairing: (fishId, partnerId) => {
      const { game } = get();
      const fish = game.fish.find((f) => f.id === fishId);
      if (!fish) return false;
      const list = breedingChecklist(game, fish, Date.now());
      if (!list.canPair) return false;
      const base = { selectedFishId: null, selectedDecorId: null, mode: 'look' as const, panel: null };
      if (partnerId && list.partners.some((p) => p.id === partnerId)) set({ ...base, pairingFishId: null, pairSheet: { aId: fishId, bId: partnerId } });
      else set({ ...base, pairingFishId: fishId, pairSheet: null });
      return true;
    },

    pickPartner: (fishId) => {
      const { game, pairingFishId } = get();
      if (!pairingFishId || fishId === pairingFishId) return;
      const chooser = game.fish.find((f) => f.id === pairingFishId);
      const partner = game.fish.find((f) => f.id === fishId);
      if (!chooser || !partner) return;
      if (compatiblePartners(game, chooser, Date.now()).some((p) => p.id === fishId)) {
        set({ pairingFishId: null, pairSheet: { aId: pairingFishId, bId: fishId } });
      } else {
        get().addToast(partner.speciesId !== chooser.speciesId ? `${partner.name} is a different species — pick a glowing fish 💕` : `${partner.name} isn't ready — pick a glowing fish 💕`);
      }
    },

    cancelPairing: () => set({ pairingFishId: null, pairSheet: null }),

    confirmCourtship: (x) => {
      const sheet = get().pairSheet;
      if (!sheet) return false;
      const result = startCourtship(get().game, sheet.aId, sheet.bId, Date.now(), x);
      set({ pairSheet: null });
      if (!result.ok) {
        get().addToast(result.reason === 'notReady' ? 'One of them isn’t ready anymore — check the checklist 💕' : 'They can’t pair right now');
        return false;
      }
      set({ game: result.state });
      const [a, b] = result.courtship.fishIds.map((id) => result.state.fish.find((f) => f.id === id)?.name ?? 'A fish');
      get().addToast(`💞 ${a} & ${b} are falling in love…`);
      return true;
    },

    moveFromNursery: (babyId, tankId) => {
      const baby = get().game.nursery.find((f) => f.id === babyId);
      const tank = get().game.tanks.find((t) => t.id === tankId);
      return commitResult(economy.moveFromNursery(get().game, babyId, tankId, Date.now()), baby && tank ? `🍼 ${baby.name} moved into ${tank.name}` : undefined);
    },

    rehomeBaby: (babyId) => {
      const baby = get().game.nursery.find((f) => f.id === babyId);
      return commitResult(economy.rehomeNurseryBaby(get().game, babyId), baby ? `🏡 ${baby.name} found a cozy new home (+${economy.rehomeValue(baby)} 🐚)` : undefined);
    },

    openBreeding: (tab) => set((s) => ({ panel: 'breeding', mode: 'look', breedingTab: tab ?? s.breedingTab, pairingFishId: null })),

    openGuide: () => set({ guideOpen: true, panel: null }),

    closeGuide: () =>
      set((s) => {
        const q = s.game.breedingQuest;
        const start = q.status === 'off' && s.game.level >= UNLOCK_LEVEL.breeding;
        return { guideOpen: false, game: { ...s.game, breedingQuest: { guideSeen: true, status: start ? 'active' : q.status } } };
      }),

    recordDecor: () => {
      const { game, decorHistory } = get();
      const tank = game.tanks.find((t) => t.id === game.activeTankId);
      if (!tank) return;
      const snap: DecorSnapshot = { tankId: tank.id, decor: tank.decor, inventory: game.decorInventory };
      set({ decorHistory: { past: [...decorHistory.past, snap].slice(-DECOR_UNDO_STEPS), future: [] } });
    },

    undoDecor: () => {
      const { game, decorHistory } = get();
      const snap = decorHistory.past[decorHistory.past.length - 1];
      const tank = game.tanks.find((t) => t.id === snap?.tankId);
      if (!snap || !tank) return;
      const current: DecorSnapshot = { tankId: tank.id, decor: tank.decor, inventory: game.decorInventory };
      set({
        game: restoreDecor(game, snap),
        selectedDecorId: null,
        decorHistory: { past: decorHistory.past.slice(0, -1), future: [...decorHistory.future, current].slice(-DECOR_UNDO_STEPS) },
      });
    },

    redoDecor: () => {
      const { game, decorHistory } = get();
      const snap = decorHistory.future[decorHistory.future.length - 1];
      const tank = game.tanks.find((t) => t.id === snap?.tankId);
      if (!snap || !tank) return;
      const current: DecorSnapshot = { tankId: tank.id, decor: tank.decor, inventory: game.decorInventory };
      set({
        game: restoreDecor(game, snap),
        selectedDecorId: null,
        decorHistory: { past: [...decorHistory.past, current].slice(-DECOR_UNDO_STEPS), future: decorHistory.future.slice(0, -1) },
      });
    },

    placeFromBox: (decorId, x) => {
      const before = get().game;
      const result = economy.placeFromBox(before, before.activeTankId, decorId, x, Date.now(), Math.random);
      if (!result.ok) {
        get().addToast(result.reason === 'full' ? '🪸 This tank is full of decor. Put something in the box first.' : PURCHASE_ERROR_TEXT[result.reason]);
        return false;
      }
      get().recordDecor();
      const tank = result.state.tanks.find((t) => t.id === before.activeTankId)!;
      set({ game: result.state, selectedDecorId: tank.decor[tank.decor.length - 1]?.id ?? null });
      return true;
    },

    storeDecor: (placedId) => {
      const result = economy.storeDecor(get().game, get().game.activeTankId, placedId);
      if (!result.ok) return false;
      get().recordDecor();
      set({ game: result.state, selectedDecorId: get().selectedDecorId === placedId ? null : get().selectedDecorId });
      return true;
    },

    updateDecor: (placedId, change) => {
      const result = economy.updateDecor(get().game, get().game.activeTankId, placedId, change);
      if (!result.ok) return;
      get().recordDecor();
      set({ game: result.state });
    },

    sellBoxedDecor: (decorId) => {
      const refund = economy.decorRefund(decorId);
      // Money changes can't be undone, so the undo history starts over.
      const sold = commitResult(economy.sellBoxedDecor(get().game, decorId), `Sold for ${refund.amount} ${refund.currency === 'shells' ? '🐚' : 'pearls'}`);
      if (sold) set({ decorHistory: { past: [], future: [] } });
      return sold;
    },

    savePreset: (slot, name) => {
      if (commitResult(economy.savePreset(get().game, get().game.activeTankId, slot, name))) get().addToast(`💾 Layout saved to slot ${slot + 1}`);
    },

    applyPreset: (slot) => {
      const result = economy.applyPreset(get().game, get().game.activeTankId, slot, Date.now(), Math.random);
      if (!result.ok) return;
      get().recordDecor();
      set({ game: result.state, selectedDecorId: null });
      const skipped = result.skipped ?? 0;
      get().addToast(skipped > 0 ? `🎨 Layout applied · ${skipped} item${skipped === 1 ? '' : 's'} skipped (not in your decor box)` : '🎨 Layout applied');
    },

    setTrayTab: (trayTab) => set({ trayTab }),

    previewStyle: (change) => set({ stylePreview: change }),

    applyStyle: (optionId) => {
      const ok = commitResult(economy.applyStyle(get().game, get().game.activeTankId, optionId));
      if (ok) set({ stylePreview: null });
      return ok;
    },

    buyStyle: (optionId) => {
      const opt = economy.styleOption(optionId);
      const ok = commitResult(economy.buyStyle(get().game, get().game.activeTankId, optionId), opt ? `✨ ${opt.name} is yours — use it on any tank` : undefined);
      if (ok) set({ stylePreview: null });
      return ok;
    },

    setStyleExtras: (change) => {
      commitResult(economy.setTankStyleExtras(get().game, get().game.activeTankId, change));
    },

    startTry: (decorId) =>
      set({ tryDecor: { decorId, x: TANK_WIDTH / 2, flipped: false, size: 'M', depth: 'back' }, panel: null, mode: 'look', selectedDecorId: null, quickFishId: null }),

    moveTry: (x) => {
      const t = get().tryDecor;
      if (t) set({ tryDecor: { ...t, x: economy.clampDecorX(x) } });
    },

    confirmTry: () => {
      const t = get().tryDecor;
      if (!t) return false;
      const { decorId, x, ...look } = t;
      const name = DECOR[decorId].name;
      const ok = commitResult(economy.buyAndPlaceDecor(get().game, decorId, x, look, eventClock(), Math.random), `🪴 ${name} placed!`);
      if (ok) set({ tryDecor: null });
      return ok;
    },

    cancelTry: () => set({ tryDecor: null }),

    moveDecor: (placedId, x) => {
      const result = economy.moveDecor(get().game, get().game.activeTankId, placedId, x);
      if (result.ok) set({ game: result.state });
    },

    selectDecor: (placedId) => set(placedId ? { selectedDecorId: placedId, selectedFishId: null, quickFishId: null } : { selectedDecorId: null }),

    startBreak: (minutes, breathing) =>
      set({
        breakSession: { durationMs: minutes * MINUTE_MS, startedAt: Date.now(), breathing, result: null },
        panel: null,
        mode: 'look',
        selectedFishId: null,
        selectedDecorId: null,
      }),

    finishBreak: () => {
      const session = get().breakSession;
      if (!session || session.result) return;
      const result = economy.completeBreak(get().game, Date.now());
      if (result.ok) {
        set({ game: result.state });
        announceLevelUps(result.levelsGained);
      }
      set({ breakSession: { ...session, result: { xp: result.xp } } });
    },

    exitBreak: () => set({ breakSession: null }),

    claimDailyGift: () => {
      const result = economy.claimDailyGift(get().game, economy.localDateKey(new Date()), Math.random);
      if (!result.ok) return null;
      set({ game: result.state });
      announceLevelUps(result.levelsGained);
      return result.gift ?? null;
    },

    dev: {
      spawnFish: ({ speciesId, stage, variant, shiny }) => {
        const now = Date.now();
        devFishSeq += 1;
        set((s) => {
          const fish = createFish(speciesId, s.game.activeTankId, now, Math.random, {
            id: `fish-dev-${now.toString(36)}-${devFishSeq}`,
            variant,
            shiny,
            takenNames: s.game.fish.map((f) => f.name),
          });
          const spawned = { ...fish, stage, growth: growthForStage(speciesId, stage) };
          return { game: { ...s.game, fish: [...s.game.fish, spawned] } };
        });
      },
      clearFish: () => set((s) => ({ game: { ...s.game, fish: s.game.fish.filter((f) => f.tankId !== s.game.activeTankId) } })),
      setMood: ({ hunger, happiness }) =>
        set((s) => ({
          game: {
            ...s.game,
            fish: s.game.fish.map((f) =>
              f.tankId === s.game.activeTankId ? { ...f, hunger: hunger ?? f.hunger, happiness: happiness ?? f.happiness } : f,
            ),
          },
        })),
      setTheme: (theme) =>
        set((s) => ({ game: { ...s.game, tanks: s.game.tanks.map((t) => (t.id === s.game.activeTankId ? { ...t, theme } : t)) } })),
      makeReady: () =>
        set((s) => ({
          game: {
            ...s.game,
            fish: s.game.fish.map((f) => (f.tankId === s.game.activeTankId ? { ...f, hunger: 90, happiness: 90, lastBredAt: null } : f)),
          },
        })),
      finishCourtships: () => {
        const now = Date.now();
        set((s) => ({ game: { ...s.game, courtships: s.game.courtships.map((c) => ({ ...c, endsAt: Math.min(c.endsAt, now) })) } }));
      },
      hatchEggsNow: () => {
        const now = Date.now();
        set((s) => ({ game: { ...s.game, eggs: s.game.eggs.map((e) => ({ ...e, hatchAt: Math.min(e.hatchAt, now) })) } }));
      },
      setBondLevel: (fishId, level) =>
        set((s) => ({ game: { ...s.game, fish: s.game.fish.map((f) => (f.id === fishId ? setBondLevel(f, level) : f)) } })),
      resetPetCaps: () => {
        set((s) => ({ game: { ...s.game, fish: s.game.fish.map((f) => ({ ...f, petLog: [], feedBondLog: [] })) }, trickCooldowns: {} }));
      },
      greet: () => emitBond({ type: 'greet', fishIds: greeters(get().game) }),
      giveAllDecor: () =>
        set((s) => {
          const decorInventory = { ...s.game.decorInventory };
          for (const id of Object.keys(DECOR) as DecorId[]) decorInventory[id] = (decorInventory[id] ?? 0) + 1;
          const ownedStyles = STYLE_OPTIONS.filter((o) => o.price !== null).map((o) => o.id);
          return { game: { ...s.game, decorInventory, ownedStyles } };
        }),
      forceEvent: (on) => set({ eventForced: on }),
      fillTank: () => {
        const { game } = get();
        const tank = game.tanks.find((t) => t.id === game.activeTankId);
        if (!tank) return;
        const room = tank.capacity - tankOccupancy(game, tank.id);
        for (let i = 0; i < room; i++) get().dev.spawnFish({ speciesId: 'danio', stage: 'baby' });
      },
    },
  };
});

/**
 * Boots the game: load + offline catch-up, then the 1s tick loop and autosave.
 * Returns a stop function that also saves once.
 */
let activeTabLock: TabLock | null = null;
let activeStorage: SaveStorage | null = null;

/**
 * "Play here": this tab takes over from the tab that leads (which saves first), then loads the freshly saved game.
 * The previous leader's progress is therefore never lost.
 */
export async function playHere(): Promise<void> {
  if (!activeTabLock || !activeStorage) return;
  await activeTabLock.takeOver();
  setSaveLock(null);
  const result = loadGame(activeStorage, Date.now());
  if (result.tooNew) setSaveLock('newer');
  useGameStore.getState().loadState(result.state);
  if (result.summary) useGameStore.getState().addToast(formatOfflineSummary(result.summary));
}

export function startGame(env: AutosaveEnv = browserEnv()): () => void {
  const store = useGameStore.getState();
  const { state, summary, corrupt, tooNew, isNew } = loadGame(env.storage, Date.now());
  // A save from a newer version stays untouched: nothing may write over it until the player reloads into that version.
  if (tooNew) setSaveLock('newer');
  store.loadState(state);
  activeStorage = env.storage;
  const saveEnv: AutosaveEnv = {
    ...env,
    onSaveFailed:
      env.onSaveFailed ?? (() => useGameStore.getState().addToast("⚠️ Couldn't save — your device storage is full. Free some space to keep your progress.")),
  };
  const onboardingStep = loadOnboarding(env.storage, isNew);
  // Persist immediately so a remount (or reload) right after the first save still counts as onboarding.
  if (isNew) saveOnboarding(env.storage, onboardingStep);
  useGameStore.setState({ onboardingStep, loaded: true });
  const unsubscribe = useGameStore.subscribe((s, prev) => {
    if (s.onboardingStep !== prev.onboardingStep) saveOnboarding(env.storage, s.onboardingStep);
  });
  if (corrupt) store.addToast("Your save couldn't be read, so we started a fresh tank. A backup was kept.");
  // Players already past the breeding level when breeding changed (or who skipped it) see the guide once.
  const loaded = useGameStore.getState().game;
  if (loaded.level >= UNLOCK_LEVEL.breeding && !loaded.breedingQuest.guideSeen) useGameStore.setState({ guideOpen: true });
  if (summary) store.addToast(formatOfflineSummary(summary));
  // Back after a while: Friendly+ fish swim to the glass to say hi (once the tank has mounted).
  if (summary && summary.elapsedMs >= GREET_AWAY_MS) {
    const fishIds = greeters(loaded);
    if (fishIds.length > 0) globalThis.setTimeout(() => emitBond({ type: 'greet', fishIds }), GREET_START_DELAY_MS);
  }

  // Only one tab may save (two tabs would overwrite each other); the others wait behind a "Play here" prompt.
  const tabLock = new TabLock(
    browserTabLockHooks(
      () => void saveGame(useGameStore.getState().game, env.storage),
      () => setSaveLock('other-tab'),
    ),
  );
  activeTabLock = tabLock;
  void tabLock.claim().then((leads) => {
    // A mount that was already torn down (React StrictMode, hot reload) must not lock the one that replaced it.
    if (activeTabLock === tabLock && !leads && !isSaveLocked()) setSaveLock('other-tab');
  });

  const loop = env.setInterval(() => {
    if (!isSaveLocked()) useGameStore.getState().advanceTo(Date.now());
  }, SIM_TICK_MS);
  const stopAutosave = startAutosave(() => useGameStore.getState().game, saveEnv);
  return () => {
    env.clearInterval(loop);
    stopAutosave();
    unsubscribe();
    saveGame(useGameStore.getState().game, env.storage);
    tabLock.dispose();
    if (activeTabLock === tabLock) activeTabLock = null;
  };
}
