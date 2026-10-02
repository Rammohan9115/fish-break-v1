import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEED_COOLDOWN_MS,
  FEED_XP_MAX_PER_HOUR,
  HOUR_MS,
  MINUTE_MS,
  PELLET_SINK_SPEED,
  PELLET_SPAWN_Y,
  SAVE_KEY,
  SECOND_MS,
  TANK_WIDTH,
  XP,
} from '../game/constants';
import { makeFish, makeState, seededRng, T0 } from '../game/testUtils';
import type { GameState, Pellet } from '../game/types';
import { breedingToasts, startGame, subscribeSimEvents, useGameStore } from './gameStore';
import { saveGame } from './save';
import { fakeEnv } from './testEnv';

const store = () => useGameStore.getState();
const game = () => store().game;
const tank = () => game().tanks[0]!;

function load(state: GameState) {
  useGameStore.setState({ toasts: [] });
  store().loadState(state);
}

function pellet(overrides: Partial<Pellet> = {}): Pellet {
  return { id: 'p1', x: 500, y: 300, vy: 40, premium: false, landedAt: null, ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe('advanceTo (fixed 1s tick)', () => {
  it('runs one sim tick per elapsed second', () => {
    load(makeState({ fish: [makeFish({ hunger: 80 })] }));
    store().advanceTo(T0 + 3500, seededRng(1));
    expect(game().lastTickAt).toBe(T0 + 3000);
    expect(game().fish[0]!.hunger).toBeCloseTo(80 - (2 / 60) * 3);
  });

  it('does nothing before a full second has passed', () => {
    load(makeState());
    store().advanceTo(T0 + 999, seededRng(1));
    expect(game().lastTickAt).toBe(T0);
  });

  it('uses offline catch-up for long gaps and shows a summary toast', () => {
    load(makeState({ fish: [makeFish()] }));
    store().advanceTo(T0 + 10 * MINUTE_MS, seededRng(1));
    expect(game().lastTickAt).toBe(T0 + 10 * MINUTE_MS);
    expect(store().toasts.some((t) => t.text.startsWith('While you were away'))).toBe(true);
  });

  it('resyncs if the clock goes backwards', () => {
    load(makeState());
    store().advanceTo(T0 - 5000, seededRng(1));
    expect(game().lastTickAt).toBe(T0 - 5000);
  });

  it('queues level-ups from the sim', () => {
    const fish = makeFish({ hunger: 80, happiness: 85, growth: 1199, stage: 'juvenile' });
    load(makeState({ fish: [fish], overrides: { xp: 39 } }));
    store().advanceTo(T0 + SECOND_MS, seededRng(1));
    expect(game().level).toBe(2);
    expect(store().pendingLevelUps).toEqual([2]);
    store().dismissLevelUp();
    expect(store().pendingLevelUps).toEqual([]);
  });
});

describe('dropPellet', () => {
  it('adds a pellet near the surface of the active tank', () => {
    load(makeState());
    expect(store().dropPellet(400)).toBe(true);
    expect(tank().pellets).toHaveLength(1);
    expect(tank().pellets[0]).toMatchObject({ x: 400, y: PELLET_SPAWN_Y, vy: PELLET_SINK_SPEED, premium: false, landedAt: null });
  });

  it('is rate-limited to one pellet per 150ms', () => {
    load(makeState());
    expect(store().dropPellet(400)).toBe(true);
    vi.advanceTimersByTime(FEED_COOLDOWN_MS - 1);
    expect(store().dropPellet(400)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(store().dropPellet(400)).toBe(true);
    expect(tank().pellets).toHaveLength(2);
  });

  it('clamps x inside the tank', () => {
    load(makeState());
    store().dropPellet(-50);
    expect(tank().pellets[0]!.x).toBeGreaterThan(0);
    vi.advanceTimersByTime(FEED_COOLDOWN_MS);
    store().dropPellet(TANK_WIDTH + 50);
    expect(tank().pellets[1]!.x).toBeLessThan(TANK_WIDTH);
  });

  it('premium pellets consume inventory and fail when empty', () => {
    load(makeState({ overrides: { inventory: { premiumFood: 1 } } }));
    expect(store().dropPellet(400, true)).toBe(true);
    expect(game().inventory.premiumFood).toBe(0);
    expect(tank().pellets[0]!.premium).toBe(true);
    vi.advanceTimersByTime(FEED_COOLDOWN_MS);
    expect(store().dropPellet(400, true)).toBe(false);
  });

  it('only drops into the active tank', () => {
    const state = makeState();
    state.tanks.push({ ...state.tanks[0]!, id: 'tank-2' });
    load({ ...state, activeTankId: 'tank-2' });
    store().dropPellet(400);
    expect(game().tanks[0]!.pellets).toHaveLength(0);
    expect(game().tanks[1]!.pellets).toHaveLength(1);
  });
});

describe('eatPellet', () => {
  it('feeds the fish and grants 1 XP', () => {
    const fish = makeFish({ hunger: 50 });
    load(makeState({ fish: [fish], tank: { pellets: [pellet()] } }));
    expect(store().eatPellet(fish.id, 'p1')).toBe(true);
    expect(game().fish[0]!.hunger).toBe(65);
    expect(game().xp).toBe(XP.pelletEaten);
    expect(tank().pellets).toHaveLength(0);
  });

  it('returns false when the fish is full', () => {
    const fish = makeFish({ hunger: 96 });
    load(makeState({ fish: [fish], tank: { pellets: [pellet()] } }));
    expect(store().eatPellet(fish.id, 'p1')).toBe(false);
    expect(tank().pellets).toHaveLength(1);
  });

  it('caps feeding XP at 30 per hour, then resets', () => {
    const fish = makeFish({ hunger: 0 });
    const pellets = Array.from({ length: 40 }, (_, i) => pellet({ id: `p${i}` }));
    load(makeState({ fish: [fish], tank: { pellets }, overrides: { level: 5 } }));
    for (let i = 0; i < 35; i++) {
      useGameStore.setState((s) => ({ game: { ...s.game, fish: s.game.fish.map((f) => ({ ...f, hunger: 0 })) } }));
      store().eatPellet(fish.id, `p${i}`);
    }
    expect(game().xp).toBe(FEED_XP_MAX_PER_HOUR);
    vi.advanceTimersByTime(HOUR_MS);
    useGameStore.setState((s) => ({ game: { ...s.game, fish: s.game.fish.map((f) => ({ ...f, hunger: 0 })) } }));
    store().eatPellet(fish.id, 'p36');
    expect(game().xp).toBe(FEED_XP_MAX_PER_HOUR + 1);
  });
});

describe('collectDrop', () => {
  it('adds shells and 1 XP', () => {
    load(makeState({ tank: { shells: [{ id: 'd1', x: 100, value: 5, pearl: false }] } }));
    const before = game().shells;
    expect(store().collectDrop('d1')).toBe(true);
    expect(game().shells).toBe(before + 5);
    expect(game().xp).toBe(XP.shellCollected);
    expect(tank().shells).toHaveLength(0);
  });

  it('adds pearls for pearl drops', () => {
    load(makeState({ tank: { shells: [{ id: 'd1', x: 100, value: 1, pearl: true }] } }));
    store().collectDrop('d1');
    expect(game().pearls).toBe(1);
  });

  it('returns false for unknown drops', () => {
    load(makeState());
    expect(store().collectDrop('nope')).toBe(false);
  });

  it('can trigger a level-up with shells reward and queue the level-up modal', () => {
    load(makeState({ tank: { shells: [{ id: 'd1', x: 100, value: 1, pearl: false }] }, overrides: { xp: 39 } }));
    const before = game().shells;
    store().collectDrop('d1');
    expect(game().level).toBe(2);
    expect(game().shells).toBe(before + 1 + 20);
    expect(store().pendingLevelUps).toEqual([2]);
  });
});

describe('wipeAlgae', () => {
  it('removes the spot, +6 cleanliness, +2 XP, counts it', () => {
    load(makeState({ tank: { cleanliness: 50, algaeSpots: [{ id: 'a1', x: 1, y: 1, size: 20 }] } }));
    expect(store().wipeAlgae('a1')).toBe(true);
    expect(tank().algaeSpots).toHaveLength(0);
    expect(tank().cleanliness).toBe(56);
    expect(game().xp).toBe(XP.algaeWiped);
    expect(game().stats.cleaned).toBe(1);
  });

  it('caps cleanliness at 100', () => {
    load(makeState({ tank: { cleanliness: 97, algaeSpots: [{ id: 'a1', x: 1, y: 1, size: 20 }] } }));
    store().wipeAlgae('a1');
    expect(tank().cleanliness).toBe(100);
  });

  it('returns false for unknown spots', () => {
    load(makeState());
    expect(store().wipeAlgae('nope')).toBe(false);
  });
});

describe('renameFish', () => {
  it('trims and limits the name, ignores blanks', () => {
    const fish = makeFish({ name: 'Old' });
    load(makeState({ fish: [fish] }));
    store().renameFish(fish.id, '  Sir Bubbles  ');
    expect(game().fish[0]!.name).toBe('Sir Bubbles');
    store().renameFish(fish.id, '   ');
    expect(game().fish[0]!.name).toBe('Sir Bubbles');
    store().renameFish(fish.id, 'x'.repeat(50));
    expect(game().fish[0]!.name).toHaveLength(20);
  });
});

describe('toggleMute', () => {
  it('flips the muted setting', () => {
    load(makeState());
    const before = game().settings.muted;
    store().toggleMute();
    expect(game().settings.muted).toBe(!before);
  });
});

describe('startGame', () => {
  it('loads the save, ticks every second, autosaves, and saves on stop', () => {
    const { env, storage } = fakeEnv();
    saveGame(makeState({ fish: [makeFish({ hunger: 80 })], overrides: { shells: 999 } }), storage);
    useGameStore.setState({ toasts: [] });
    const stop = startGame(env);
    expect(game().shells).toBe(999);

    vi.advanceTimersByTime(5 * SECOND_MS);
    expect(game().lastTickAt).toBe(T0 + 5 * SECOND_MS);

    stop();
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).lastTickAt).toBe(T0 + 5 * SECOND_MS);
    vi.advanceTimersByTime(5 * SECOND_MS);
    expect(game().lastTickAt).toBe(T0 + 5 * SECOND_MS);
  });

  it('shows a toast when the save was corrupt', () => {
    const { env, storage } = fakeEnv();
    storage.setItem(SAVE_KEY, '{oops');
    useGameStore.setState({ toasts: [] });
    startGame(env)();
    expect(store().toasts.some((t) => t.text.includes("couldn't be read"))).toBe(true);
  });

  it('shows the "While you were away" toast on load after time away', () => {
    const { env, storage } = fakeEnv();
    saveGame(makeState({ overrides: { lastTickAt: T0 - HOUR_MS } }), storage);
    useGameStore.setState({ toasts: [] });
    startGame(env)();
    expect(store().toasts.some((t) => t.text.startsWith('While you were away (1h)'))).toBe(true);
  });
});

describe('tool mode', () => {
  it('switches between look / feed / premium', () => {
    load(makeState({ overrides: { inventory: { premiumFood: 2 } } }));
    store().setMode('feed');
    expect(store().mode).toBe('feed');
    store().setMode('premium');
    expect(store().mode).toBe('premium');
    store().setMode('look');
    expect(store().mode).toBe('look');
  });

  it('refuses premium mode with no premium food', () => {
    load(makeState({ overrides: { inventory: { premiumFood: 0 } } }));
    store().setMode('feed');
    store().setMode('premium');
    expect(store().mode).toBe('feed');
    expect(store().toasts.some((t) => t.text.includes('Out of premium food'))).toBe(true);
  });

  it('premium pellet eaten applies the growth boost', () => {
    const fish = makeFish({ hunger: 50 });
    load(makeState({ fish: [fish], overrides: { inventory: { premiumFood: 1 } } }));
    store().dropPellet(400, true);
    const pelletId = tank().pellets[0]!.id;
    store().eatPellet(fish.id, pelletId);
    expect(game().fish[0]!.hunger).toBe(75);
    expect(game().fish[0]!.boostUntil).toBe(T0 + 3 * MINUTE_MS);
  });
});

describe('fish selection', () => {
  it('selects and deselects a fish; loading a new game clears it', () => {
    const fish = makeFish();
    load(makeState({ fish: [fish] }));
    store().selectFish(fish.id);
    expect(store().selectedFishId).toBe(fish.id);
    store().selectFish(null);
    expect(store().selectedFishId).toBeNull();
    store().selectFish(fish.id);
    load(makeState());
    expect(store().selectedFishId).toBeNull();
  });
});

describe('onboarding', () => {
  const start = () => {
    const fish = makeFish({ hunger: 50 });
    load(makeState({ fish: [fish], tank: { shells: [{ id: 'd1', x: 100, value: 2, pearl: false }] } }));
    useGameStore.setState({ onboardingStep: 0 });
    return fish;
  };

  it('advances Feed → Grow → Shells by doing each action, then finishes', () => {
    const fish = start();
    store().selectFish(fish.id); // wrong step: ignored
    expect(store().onboardingStep).toBe(0);
    store().dropPellet(300);
    expect(store().onboardingStep).toBe(1);
    store().selectFish(fish.id);
    expect(store().onboardingStep).toBe(2);
    store().collectDrop('d1');
    expect(store().onboardingStep).toBeNull();
  });

  it('can be advanced with "Got it" or skipped', () => {
    start();
    store().completeOnboardingStep(0);
    store().completeOnboardingStep(1);
    expect(store().onboardingStep).toBe(2);
    store().skipOnboarding();
    expect(store().onboardingStep).toBeNull();
  });

  it('startGame shows onboarding only to brand-new players and persists progress', () => {
    const fresh = fakeEnv();
    const stop = startGame(fresh.env);
    expect(store().onboardingStep).toBe(0);
    store().completeOnboardingStep(0);
    stop();
    startGame(fresh.env)();
    expect(store().onboardingStep).toBe(1);

    // StrictMode-style immediate remount must not lose onboarding for a new player.
    const remount = fakeEnv();
    startGame(remount.env)();
    startGame(remount.env)();
    expect(store().onboardingStep).toBe(0);

    const returning = fakeEnv();
    saveGame(makeState(), returning.storage);
    startGame(returning.env)();
    expect(store().onboardingStep).toBeNull();
  });
});

describe('clean mode', () => {
  it('enters clean mode and hints when there is nothing to wipe', () => {
    load(makeState());
    store().setMode('clean');
    expect(store().mode).toBe('clean');
    expect(store().toasts.some((t) => t.text.includes('Sparkling clean'))).toBe(true);
  });

  it('wiping spots touched by the sponge gives +6 cleanliness and +2 XP each', () => {
    const spots = [
      { id: 'a1', x: 100, y: 100, size: 20 },
      { id: 'a2', x: 200, y: 100, size: 20 },
    ];
    load(makeState({ tank: { cleanliness: 40, algaeSpots: spots } }));
    store().setMode('clean');
    for (const id of ['a1', 'a2']) store().wipeAlgae(id);
    expect(tank().algaeSpots).toHaveLength(0);
    expect(tank().cleanliness).toBe(52);
    expect(game().xp).toBe(2 * XP.algaeWiped);
    expect(game().stats.cleaned).toBe(2);
  });
});

describe('daily gift (store)', () => {
  it('can be claimed once per local day, with no streak tracking', () => {
    load(makeState({ overrides: { shells: 0, lastDailyGift: '2001-01-01' } }));
    const gift = store().claimDailyGift();
    expect(gift).toMatchObject({ shells: 20, premiumFood: 3 });
    expect(game().shells).toBe(20);
    expect(game().inventory.premiumFood).toBe(3);
    expect(game().xp).toBe(XP.dailyGift);
    expect(store().claimDailyGift()).toBeNull();
    expect(game().shells).toBe(20);
  });

  it('marks the store loaded after startGame', () => {
    useGameStore.setState({ loaded: false });
    startGame(fakeEnv().env)();
    expect(store().loaded).toBe(true);
  });
});

describe('breeding events (store)', () => {
  it('formats lay and hatch toasts, including shiny hatches', () => {
    const a = makeFish({ name: 'Mochi' });
    const b = makeFish({ name: 'Bean' });
    const baby = makeFish({ name: 'Pip', speciesId: 'guppy' });
    const game = makeState({ fish: [a, b, baby] });
    expect(
      breedingToasts(
        [
          { type: 'eggLaid', tankId: 'tank-1', eggId: 'e1', parentIds: [a.id, b.id], shiny: false },
          { type: 'hatched', fishId: baby.id, tankId: 'tank-1', shiny: false, eggId: 'e1' },
          { type: 'hatched', fishId: baby.id, tankId: 'tank-1', shiny: true, eggId: 'e2' },
        ],
        game,
      ),
    ).toEqual(['💕 Mochi & Bean laid an egg!', '🐣 Pip the Guppy hatched!', '✨ A shiny Guppy hatched! Say hi to Pip (+2 pearls)']);
  });

  it('notifies subscribers and toasts when an egg hatches during live ticks', () => {
    const egg = { id: 'egg-x', speciesId: 'danio' as const, variant: 'mint', shiny: false, tankId: 'tank-1', hatchAt: T0 + 500 };
    load({ ...makeState(), eggs: [egg] });
    const seen: string[] = [];
    const unsubscribe = subscribeSimEvents((events) => seen.push(...events.map((e) => e.type)));
    store().advanceTo(T0 + SECOND_MS, seededRng(1));
    unsubscribe();
    expect(seen).toContain('hatched');
    expect(store().toasts.some((t) => t.text.includes('hatched'))).toBe(true);
  });

  it('does not spam toasts or listeners for offline catch-up', () => {
    const egg = { id: 'egg-y', speciesId: 'danio' as const, variant: 'mint', shiny: false, tankId: 'tank-1', hatchAt: T0 + 500 };
    load({ ...makeState(), eggs: [egg] });
    const seen: string[] = [];
    const unsubscribe = subscribeSimEvents((events) => seen.push(...events.map((e) => e.type)));
    store().advanceTo(T0 + 10 * MINUTE_MS, seededRng(1));
    unsubscribe();
    expect(seen).toEqual([]);
    expect(store().toasts.some((t) => t.text.includes('🐣'))).toBe(false);
    expect(store().toasts.some((t) => t.text.includes('While you were away'))).toBe(true);
  });
});

describe('decor & tanks (store)', () => {
  it('selecting decor and fish are mutually exclusive', () => {
    const fish = makeFish();
    load(makeState({ fish: [fish], tank: { decor: [{ id: 'd1', decorId: 'rock', x: 300 }] } }));
    store().selectFish(fish.id);
    store().selectDecor('d1');
    expect(store().selectedFishId).toBeNull();
    store().selectFish(fish.id);
    expect(store().selectedDecorId).toBeNull();
  });

  it('drags decor in the active tank and sells it back, clearing the selection', () => {
    load(makeState({ tank: { decor: [{ id: 'd1', decorId: 'castle', x: 300 }] }, overrides: { shells: 0 } }));
    store().moveDecor('d1', 512);
    expect(tank().decor[0]!.x).toBe(512);
    store().selectDecor('d1');
    expect(store().sellDecor('tank-1', 'd1')).toBe(true);
    expect(game().shells).toBe(75);
    expect(store().selectedDecorId).toBeNull();
  });

  it('moves a fish to another tank, toasts, and closes its card', () => {
    const fish = makeFish({ name: 'Mochi' });
    const state = makeState({ fish: [fish] });
    state.tanks.push({ ...state.tanks[0]!, id: 'tank-2', name: 'Cozy Cove' });
    load(state);
    store().selectFish(fish.id);
    expect(store().moveFish(fish.id, 'tank-2')).toBe(true);
    expect(game().fish[0]!.tankId).toBe('tank-2');
    expect(store().selectedFishId).toBeNull();
    expect(store().toasts.some((t) => t.text === '🏠 Mochi moved to Cozy Cove')).toBe(true);
  });

  it('renames tanks and switching clears selections', () => {
    const state = makeState({ fish: [makeFish()] });
    state.tanks.push({ ...state.tanks[0]!, id: 'tank-2' });
    load(state);
    store().renameTank('tank-2', 'Night Nook');
    expect(game().tanks[1]!.name).toBe('Night Nook');
    store().selectFish(game().fish[0]!.id);
    store().switchTank('tank-2');
    expect(game().activeTankId).toBe('tank-2');
    expect(store().selectedFishId).toBeNull();
  });
});

describe('themes (store)', () => {
  it('buying a theme applies it to the active tank', () => {
    load(makeState({ overrides: { level: 10, pearls: 8 } }));
    expect(store().buyTheme('night')).toBe(true);
    expect(tank().theme).toBe('night');
    expect(store().toasts.some((t) => t.text === '🎨 Night Glow theme unlocked!')).toBe(true);
  });

  it('explains when a theme-only species blocks a theme', () => {
    const clown = makeFish({ speciesId: 'clownfish' });
    load(makeState({ fish: [clown], tank: { theme: 'coral' }, overrides: { level: 20, pearls: 50, ownedThemes: ['classic', 'coral'] } }));
    expect(store().buyTheme('pond')).toBe(true);
    expect(tank().theme).toBe('coral');
    expect(game().ownedThemes).toContain('pond');
    expect(store().toasts.some((t) => t.text.includes('Clownfish live here and need the Coral Reef theme'))).toBe(true);
    expect(store().applyTheme('classic')).toBe(false);
  });
});

describe('break mode (store)', () => {
  it('starts a session, closes panels/cards, and grants +10 XP once when finished', () => {
    const fish = makeFish();
    load(makeState({ fish: [fish] }));
    store().selectFish(fish.id);
    store().openPanel('break');
    store().startBreak(5, true);
    expect(store().breakSession).toMatchObject({ durationMs: 5 * MINUTE_MS, startedAt: T0, breathing: true, result: null });
    expect(store().panel).toBeNull();
    expect(store().selectedFishId).toBeNull();
    vi.advanceTimersByTime(5 * MINUTE_MS);
    store().finishBreak();
    expect(store().breakSession!.result).toEqual({ xp: XP.breakComplete });
    expect(game().xp).toBe(XP.breakComplete);
    store().finishBreak(); // idempotent
    expect(game().xp).toBe(XP.breakComplete);
    store().exitBreak();
    expect(store().breakSession).toBeNull();
  });

  it('a second break within the hour gives no XP', () => {
    load(makeState({ overrides: { lastBreakXpAt: T0 - 10 * MINUTE_MS } }));
    store().startBreak(3, false);
    store().finishBreak();
    expect(store().breakSession!.result).toEqual({ xp: 0 });
    expect(game().xp).toBe(0);
  });

  it('exiting early grants nothing', () => {
    load(makeState());
    store().startBreak(10, false);
    store().exitBreak();
    expect(game().xp).toBe(0);
    expect(game().lastBreakXpAt).toBeNull();
  });
});

describe('mute setting', () => {
  it('is muted by default and the toggle is saved with the game', () => {
    const { env, storage } = fakeEnv();
    useGameStore.setState({ toasts: [] });
    const stop = startGame(env);
    expect(game().settings.muted).toBe(true);
    store().toggleMute();
    stop();
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).settings.muted).toBe(false);
    startGame(env)();
    expect(game().settings.muted).toBe(false);
  });
});
