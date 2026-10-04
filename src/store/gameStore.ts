// Zustand store: holds GameState, runs the fixed 1-second sim tick, exposes player actions.
import { create } from 'zustand';
import {
  ALGAE_WIPE_CLEANLINESS,
  BREEDING,
  THEMES,
  CLEANLINESS_MAX,
  FEED_COOLDOWN_MS,
  FISH_NAME_MAX_LENGTH,
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
  type SimEvent,
} from '../game/sim';
import type { DecorId, GameState, Rng, SpeciesId, Stage, ThemeId } from '../game/types';
import {
  browserEnv,
  formatOfflineSummary,
  loadGame,
  loadOnboarding,
  saveGame,
  saveOnboarding,
  startAutosave,
  type AutosaveEnv,
} from './save';

export interface Toast {
  id: number;
  text: string;
}

/** What a click in the tank does. 'look' = select fish / collect shells; 'clean' = sponge algae. */
export type ToolMode = 'look' | 'feed' | 'premium' | 'clean';

/** Overlay panel currently open. */
export type Panel = 'shop' | 'tanks' | 'break' | 'settings' | 'breeding' | null;
export type BreedingTab = 'pairs' | 'nursery';

/** An active Break Mode session (UI-only; not saved). */
export interface BreakSession {
  durationMs: number;
  startedAt: number;
  breathing: boolean;
  /** Set when the timer completes: XP granted (0 if already earned this hour). */
  result: { xp: number } | null;
}
export type ShopTab = 'fish' | 'food' | 'decor' | 'tanks';

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
};

/** Onboarding steps: 0 Feed → 1 Watch them grow → 2 Collect shells. null = finished/not shown. */
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

  loadState: (game: GameState) => void;
  /** Runs fixed 1s sim ticks up to `now`; long gaps use offline catch-up. */
  advanceTo: (now: number, rng?: Rng) => void;
  /** Drops a pellet at logical x in the active tank. Returns false if rate-limited or out of premium food. */
  dropPellet: (x: number, premium?: boolean) => boolean;
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
    } else if (e.type === 'questComplete') {
      texts.push(`🎉 Your first baby! +${e.shells} 🐚 +${e.pearls} ⚪`);
    }
  }
  return texts;
}

let toastSeq = 0;
let pelletSeq = 0;
let devFishSeq = 0;

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

    dropPellet: (x, premium = false) => {
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
      const next = simEatPellet(game, fishId, pelletId, now);
      if (next === game) return false;
      // Feeding XP is capped per hour-long window (saved, so reloads don't reset it).
      const { xp, feedXp } = economy.feedingXp(next, now);
      commitWithXp({ ...next, feedXp }, xp);
      return true;
    },

    collectDrop: (dropId) => {
      const { game } = get();
      const tank = game.tanks.find((t) => t.shells.some((d) => d.id === dropId));
      const drop = tank?.shells.find((d) => d.id === dropId);
      if (!tank || !drop) return false;
      const next: GameState = {
        ...game,
        shells: drop.pearl ? game.shells : game.shells + drop.value,
        pearls: drop.pearl ? game.pearls + drop.value : game.pearls,
        tanks: game.tanks.map((t) => (t.id === tank.id ? { ...t, shells: t.shells.filter((d) => d.id !== dropId) } : t)),
      };
      commitWithXp(next, XP.shellCollected);
      get().completeOnboardingStep(2);
      return true;
    },

    wipeAlgae: (spotId) => {
      const { game } = get();
      const tank = game.tanks.find((t) => t.algaeSpots.some((a) => a.id === spotId));
      if (!tank) return false;
      const next: GameState = {
        ...game,
        stats: { ...game.stats, cleaned: game.stats.cleaned + 1 },
        tanks: game.tanks.map((t) =>
          t.id === tank.id
            ? {
                ...t,
                cleanliness: Math.min(CLEANLINESS_MAX, t.cleanliness + ALGAE_WIPE_CLEANLINESS),
                algaeSpots: t.algaeSpots.filter((a) => a.id !== spotId),
              }
            : t,
        ),
      };
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
      set((s) => ({ toasts: [...s.toasts, toast] }));
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
      set({ mode });
      if (mode === 'clean') {
        const { game } = get();
        const tank = game.tanks.find((t) => t.id === game.activeTankId);
        if (tank && tank.algaeSpots.length === 0) get().addToast('✨ Sparkling clean! Nothing to wipe right now.');
      }
    },

    selectFish: (fishId) => {
      set(fishId ? { selectedFishId: fishId, selectedDecorId: null } : { selectedFishId: null });
      if (fishId) get().completeOnboardingStep(1);
    },

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
    buyDecor: (decorId) => commitResult(economy.buyDecor(get().game, decorId, Date.now(), Math.random), '🪴 Placed! Drag it along the sand to move it.'),
    sellDecor: (tankId, placedId) => {
      const placed = get().game.tanks.find((t) => t.id === tankId)?.decor.find((d) => d.id === placedId);
      const refund = placed ? economy.decorRefund(placed.decorId) : null;
      const sold = commitResult(
        economy.sellDecor(get().game, tankId, placedId),
        refund ? `Sold for ${refund.amount} ${refund.currency === 'shells' ? '🐚' : 'pearls'}` : undefined,
      );
      if (sold && get().selectedDecorId === placedId) set({ selectedDecorId: null });
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

    moveDecor: (placedId, x) => {
      const result = economy.moveDecor(get().game, get().game.activeTankId, placedId, x);
      if (result.ok) set({ game: result.state });
    },

    selectDecor: (placedId) => set(placedId ? { selectedDecorId: placedId, selectedFishId: null } : { selectedDecorId: null }),

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
export function startGame(env: AutosaveEnv = browserEnv()): () => void {
  const store = useGameStore.getState();
  const { state, summary, corrupt, isNew } = loadGame(env.storage, Date.now());
  store.loadState(state);
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

  const loop = env.setInterval(() => useGameStore.getState().advanceTo(Date.now()), SIM_TICK_MS);
  const stopAutosave = startAutosave(() => useGameStore.getState().game, env);
  return () => {
    env.clearInterval(loop);
    stopAutosave();
    unsubscribe();
    saveGame(useGameStore.getState().game, env.storage);
  };
}
