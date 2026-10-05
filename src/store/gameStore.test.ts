import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEED_COOLDOWN_MS,
  BOND,
  FEED_XP_MAX_PER_HOUR,
  HOUR_MS,
  MINUTE_MS,
  PELLET_SINK_SPEED,
  PELLET_SPAWN_Y,
  SAVE_KEY,
  SECOND_MS,
  TANK_WIDTH,
  TOAST_QUEUE_MAX,
  TRICK_COOLDOWN_MS,
  XP,
} from '../game/constants';
import { makeFish, makeState, seededRng, T0 } from '../game/testUtils';
import type { GameState, Pellet } from '../game/types';
import { breedingToasts, mergeToast, startGame, subscribeBondEvents, subscribeSimEvents, useGameStore, type BondEvent, type Toast } from './gameStore';
import { saveGame } from './save';
import { isSaveLocked, setSaveLock } from './saveLock';
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

  it('advances Feed → Grow → Shells → Pet by doing each action, then finishes', () => {
    const fish = start();
    store().selectFish(fish.id); // wrong step: ignored
    expect(store().onboardingStep).toBe(0);
    store().dropPellet(300);
    expect(store().onboardingStep).toBe(1);
    store().selectFish(fish.id);
    expect(store().onboardingStep).toBe(2);
    store().collectDrop('d1');
    expect(store().onboardingStep).toBe(3);
    store().petFish(fish.id);
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

describe('startGame remounting (React StrictMode / hot reload)', () => {
  afterEach(() => setSaveLock(null));

  it('a torn-down mount never locks the one that replaced it', async () => {
    vi.useRealTimers();
    const env = fakeEnv();
    const stopFirst = startGame(env.env);
    stopFirst();
    const stopSecond = startGame(env.env);
    await new Promise((r) => setTimeout(r, 50));
    expect(isSaveLocked()).toBe(false);
    stopSecond();
  });
});

describe('startGame with a save from a newer version', () => {
  afterEach(() => setSaveLock(null));

  it('leaves that save untouched, locks saving, and tells nothing to overwrite it', () => {
    const env = fakeEnv();
    const raw = JSON.stringify({ ...makeState(), version: 999 });
    env.storage.setItem('fishbowl-save', raw);
    const stop = startGame(env.env);
    expect(isSaveLocked()).toBe(true);
    stop(); // the final save on shutdown must not overwrite it either
    expect(env.storage.getItem('fishbowl-save')).toBe(raw);
  });

  it('a normal save leaves saving unlocked', () => {
    const env = fakeEnv();
    saveGame(makeState(), env.storage);
    startGame(env.env)();
    expect(isSaveLocked()).toBe(false);
  });
});

describe('clean mode', () => {
  it('stays in look mode and hints when there is nothing to wipe', () => {
    load(makeState());
    store().setMode('clean');
    expect(store().mode).toBe('look');
    expect(store().toasts.some((t) => t.text.includes('Looking good'))).toBe(true);
  });

  it('opens whenever a dirty tank has spots, however low its cleanliness', () => {
    load(makeState({ tank: { cleanliness: 0, algaeSpots: [{ id: 'a1', x: 100, y: 100, size: 20 }] } }));
    store().setMode('clean');
    expect(store().mode).toBe('clean');
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

describe('sell with Undo', () => {
  it('offers an Undo toast that brings the fish back', () => {
    const fish = makeFish({ name: 'Mochi', stage: 'adult', growth: 99999 });
    load(makeState({ fish: [fish], overrides: { shells: 100 } }));
    expect(store().sellFish(fish.id)).toBe(true);
    expect(game().fish).toHaveLength(0);
    const toast = store().toasts.find((t) => t.action?.label === 'Undo')!;
    expect(toast.text).toMatch(/Sold Mochi/);
    toast.action!.run();
    expect(game().fish.map((f) => f.name)).toEqual(['Mochi']);
    expect(game().shells).toBe(100);
  });

  it('says so when the undo is no longer possible', () => {
    const fish = makeFish({ name: 'Mochi', stage: 'adult', growth: 99999 });
    load(makeState({ fish: [fish], overrides: { shells: 100 } }));
    store().sellFish(fish.id);
    useGameStore.setState((s) => ({ game: { ...s.game, shells: 0 } }));
    store().toasts.find((t) => t.action)!.action!.run();
    expect(game().fish).toHaveLength(0);
    expect(store().toasts.some((t) => /Couldn't bring/.test(t.text))).toBe(true);
  });

  it('action toasts are never merged away', () => {
    const a = mergeToast([], 'Sold X for 5 🐚', 1, { label: 'Undo', run: () => undefined });
    const b = mergeToast(a, 'Sold X for 5 🐚', 2, { label: 'Undo', run: () => undefined });
    expect(b).toHaveLength(2);
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
  it('formats lay and hatch toasts, including shiny and Nursery hatches and the quest reward', () => {
    const a = makeFish({ name: 'Mochi' });
    const b = makeFish({ name: 'Bean' });
    const baby = makeFish({ name: 'Pip', speciesId: 'guppy' });
    const napper = makeFish({ name: 'Dot', speciesId: 'guppy', tankId: '' });
    const game = { ...makeState({ fish: [a, b, baby] }), nursery: [napper] };
    expect(
      breedingToasts(
        [
          { type: 'eggLaid', tankId: 'tank-1', eggId: 'e1', parentIds: [a.id, b.id], shiny: false },
          { type: 'hatched', fishId: baby.id, tankId: 'tank-1', shiny: false, eggId: 'e1', destination: 'tank' },
          { type: 'hatched', fishId: baby.id, tankId: 'tank-1', shiny: true, eggId: 'e2', destination: 'tank' },
          { type: 'hatched', fishId: napper.id, tankId: 'tank-1', shiny: false, eggId: 'e3', destination: 'nursery' },
          { type: 'questComplete', shells: 50, pearls: 1 },
        ],
        game,
      ),
    ).toEqual([
      '💕 Mochi & Bean laid an egg!',
      '🐣 Pip the Guppy hatched!',
      '✨ Shiny! ✨ Say hi to Pip the Guppy (+2 ⚪)',
      '🐣 Dot the Guppy hatched!',
      '🍼 Baby moved to the Nursery — make room or upgrade your tank.',
      '🎉 Your first baby! +50 🐚 +1 ⚪',
    ]);
  });

  it('pairing: Pair up → pick partner → confirm starts a courtship; a wrong pick just toasts', () => {
    const a = makeFish({ name: 'Mochi', stage: 'adult', growth: 1200, hunger: 90, happiness: 90 });
    const b = makeFish({ name: 'Bean', stage: 'adult', growth: 1200, hunger: 90, happiness: 90 });
    const g = makeFish({ name: 'Gil', speciesId: 'guppy', stage: 'adult', growth: 1500, hunger: 90, happiness: 90 });
    vi.setSystemTime(T0);
    load(makeState({ fish: [a, b, g], overrides: { level: 5 } }));
    expect(store().startPairing(a.id)).toBe(true);
    expect(store().pairingFishId).toBe(a.id);
    store().pickPartner(g.id);
    expect(store().pairSheet).toBeNull();
    expect(store().toasts[store().toasts.length - 1]?.text).toMatch(/different species/);
    store().pickPartner(b.id);
    expect(store().pairSheet).toEqual({ aId: a.id, bId: b.id });
    expect(store().confirmCourtship(300)).toBe(true);
    expect(store().game.courtships).toHaveLength(1);
    expect(store().game.courtships[0]).toMatchObject({ fishIds: [a.id, b.id], x: 300 });
  });

  it('closing the guide marks it seen and starts the quest once', () => {
    load(makeState({ overrides: { level: 5, breedingQuest: { guideSeen: false, status: 'off' } } }));
    store().openGuide();
    store().closeGuide();
    expect(store().game.breedingQuest).toEqual({ guideSeen: true, status: 'active' });
    load(makeState({ overrides: { level: 5, breedingQuest: { guideSeen: true, status: 'done' } } }));
    store().closeGuide();
    expect(store().game.breedingQuest.status).toBe('done');
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
    load(makeState({ fish: [fish], tank: { decor: [{ id: 'd1', decorId: 'rock', x: 300, flipped: false, size: 'M' as const, z: 0.5 }] } }));
    store().selectFish(fish.id);
    store().selectDecor('d1');
    expect(store().selectedFishId).toBeNull();
    store().selectFish(fish.id);
    expect(store().selectedDecorId).toBeNull();
  });

  it('drags decor in the active tank and sells it back, clearing the selection', () => {
    load(makeState({ tank: { decor: [{ id: 'd1', decorId: 'castle', x: 300, flipped: false, size: 'M' as const, z: 0.5 }] }, overrides: { shells: 0 } }));
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

describe('notification budget', () => {
  it('refreshes identical toasts instead of repeating them', () => {
    const t = mergeToast(mergeToast([], 'Hello', 1), 'Hello', 2);
    expect(t).toHaveLength(1);
    expect(t[0]!.rev).toBe(1);
  });

  it('adds up "+N thing" toasts', () => {
    let t: Toast[] = [];
    for (let i = 0; i < 4; i++) t = mergeToast(t, '+3 🐚', i);
    expect(t.map((x) => x.text)).toEqual(['+12 🐚']);
    t = mergeToast(t, '+1 ⚪', 9);
    expect(t.map((x) => x.text)).toEqual(['+12 🐚', '+1 ⚪']);
  });

  it('keeps a short queue', () => {
    let t: Toast[] = [];
    for (let i = 0; i < 10; i++) t = mergeToast(t, `msg ${i}`, i);
    expect(t).toHaveLength(TOAST_QUEUE_MAX);
    expect(t[t.length - 1]!.text).toBe('msg 9');
  });
});

describe('petting & bond', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it('petFish rewards 2 sessions an hour, then the fish is just content', () => {
    const fish = makeFish({ happiness: 50 });
    load(makeState({ fish: [fish], overrides: { lastTickAt: T0 } }));
    for (let i = 0; i < BOND.sessionsPerHour; i++) expect(store().petFish(fish.id)?.rewarded).toBe(true);
    expect(store().petFish(fish.id)?.rewarded).toBe(false);
    expect(game().fish[0]!.bondPoints).toBe(BOND.sessionsPerHour * BOND.petSession);
  });

  it('a bond level-up toasts what is new and tells the renderer', () => {
    const fish = { ...makeFish({ name: 'Bubbles' }), bondPoints: 98, bondLevel: 2 as const };
    load(makeState({ fish: [fish], overrides: { lastTickAt: T0 } }));
    const seen: BondEvent[] = [];
    const off = subscribeBondEvents((e) => seen.push(e));
    store().petFish(fish.id);
    off();
    expect(store().toasts.map((t) => t.text)).toContain('Bubbles is now your Buddy! 🎉 New trick: Bubble Hoop');
    expect(seen).toContainEqual({ type: 'levelUp', fishId: fish.id, to: 3 });
  });

  it('only fish near a dropped pellet earn hand-feeding bond', () => {
    const near = makeFish({ hunger: 50 });
    const far = makeFish({ hunger: 50 });
    load(makeState({ fish: [near, far], overrides: { lastTickAt: T0 } }));
    store().dropPellet(300, false, [near.id]);
    const first = tank().pellets[0]!.id;
    store().eatPellet(near.id, first);
    vi.setSystemTime(T0 + FEED_COOLDOWN_MS);
    store().dropPellet(300, false, [near.id]);
    store().eatPellet(far.id, tank().pellets[0]!.id);
    expect(game().fish.find((f) => f.id === near.id)!.bondPoints).toBeCloseTo(0.2);
    expect(game().fish.find((f) => f.id === far.id)!.bondPoints).toBe(0);
  });

  it('tricks need the bond level and respect a 5s cooldown', () => {
    const stranger = makeFish();
    const friend = { ...makeFish(), bondPoints: 30, bondLevel: 2 as const };
    load(makeState({ fish: [stranger, friend], overrides: { lastTickAt: T0 } }));
    expect(store().playTrick(stranger.id, 'spin')).toBe(false);
    expect(store().playTrick(friend.id, 'hoop')).toBe(false);
    expect(store().playTrick(friend.id, 'spin')).toBe(true);
    expect(store().playTrick(friend.id, 'spin')).toBe(false);
    vi.setSystemTime(T0 + TRICK_COOLDOWN_MS);
    expect(store().playTrick(friend.id, 'spin')).toBe(true);
  });

  it('follow mode toggles for Best Friends only', () => {
    const buddy = { ...makeFish(), bondPoints: 60, bondLevel: 3 as const };
    const best = { ...makeFish(), bondPoints: 100, bondLevel: 4 as const };
    load(makeState({ fish: [buddy, best], overrides: { lastTickAt: T0 } }));
    store().toggleFollow(buddy.id);
    expect(store().follow).toBeNull();
    store().toggleFollow(best.id);
    expect(store().follow?.fishId).toBe(best.id);
    store().toggleFollow(best.id);
    expect(store().follow).toBeNull();
  });

  it('coming back after 30+ minutes makes Friendly+ fish greet you', () => {
    const friend = { ...makeFish(), bondPoints: 30, bondLevel: 2 as const };
    const stranger = makeFish();
    load(makeState({ fish: [friend, stranger], overrides: { lastTickAt: T0 } }));
    const seen: BondEvent[] = [];
    const off = subscribeBondEvents((e) => seen.push(e));
    store().advanceTo(T0 + 10 * MINUTE_MS);
    expect(seen).toEqual([]);
    store().advanceTo(T0 + 50 * MINUTE_MS);
    off();
    expect(seen).toEqual([{ type: 'greet', fishIds: [friend.id] }]);
  });
});

describe('decorate mode undo/redo', () => {
  it('undoes and redoes box moves, and keeps at most 20 steps', () => {
    const decor = [{ id: 'a', decorId: 'rock' as const, x: 200, flipped: false, size: 'M' as const, z: 0.5 }];
    load(makeState({ tank: { decor } }));
    store().setMode('decorate');
    store().storeDecor('a');
    expect(tank().decor).toHaveLength(0);
    expect(game().decorInventory).toEqual({ rock: 1 });
    store().undoDecor();
    expect(tank().decor.map((d) => d.id)).toEqual(['a']);
    expect(game().decorInventory).toEqual({});
    store().redoDecor();
    expect(tank().decor).toHaveLength(0);
    for (let i = 0; i < 30; i++) {
      store().recordDecor();
    }
    expect(store().decorHistory.past).toHaveLength(20);
    // Leaving Decorate mode clears the history.
    store().setMode('look');
    expect(store().decorHistory.past).toHaveLength(0);
  });

  it('selling clears the history (money changes are not undoable)', () => {
    const decor = [{ id: 'a', decorId: 'castle' as const, x: 200, flipped: false, size: 'M' as const, z: 0.5 }];
    load(makeState({ tank: { decor } }));
    store().setMode('decorate');
    store().updateDecor('a', { flipped: true });
    expect(store().decorHistory.past).toHaveLength(1);
    store().sellDecor('tank-1', 'a');
    expect(store().decorHistory.past).toHaveLength(0);
  });
});

describe('decor dev tools', () => {
  it('give all puts one of every piece in the box and owns every style', () => {
    load(makeState());
    store().dev.giveAllDecor();
    expect(Object.keys(game().decorInventory)).toHaveLength(28);
    expect(game().ownedStyles.length).toBeGreaterThan(10);
  });

  it('forcing the October event lets Halloween decor be bought in December', () => {
    vi.setSystemTime(new Date(2026, 11, 5));
    load(makeState({ overrides: { shells: 1000 } }));
    expect(store().buyDecor('pumpkin')).toBe(false);
    store().dev.forceEvent(true);
    expect(store().buyDecor('pumpkin')).toBe(true);
    store().dev.forceEvent(false);
  });
});
