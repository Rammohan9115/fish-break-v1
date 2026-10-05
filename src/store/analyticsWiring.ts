// Turns what happens in the game into analytics events, by watching the store. Pure detection lives in
// `eventsBetween` (tested); `startAnalytics` subscribes and sends. Nothing here reads names, emails or ids.
import { analytics, type AnalyticsEvent, type AnalyticsProps } from '../lib/analytics';
import type { GameState } from '../game/types';
import { subscribeBondEvents, subscribeSimEvents, useGameStore } from './gameStore';

export interface DetectedEvent {
  event: AnalyticsEvent;
  props?: AnalyticsProps;
}

const decorOwned = (g: GameState) =>
  g.tanks.reduce((n, t) => n + t.decor.length, 0) + Object.values(g.decorInventory).reduce<number>((n, c) => n + (c ?? 0), 0);
const upgrades = (g: GameState) => g.tanks.reduce((n, t) => n + t.upgrades, 0);
const pets = (g: GameState) => g.fish.reduce((n, f) => n + f.petLog.length, 0);

/** What changed between two game states, as analytics events. `feed` is left to the throttled counter (see startAnalytics). */
export function eventsBetween(prev: GameState, next: GameState): DetectedEvent[] {
  const out: DetectedEvent[] = [];
  if (next.level > prev.level) out.push({ event: 'level_up', props: { level: next.level } });
  if (next.fish.length > prev.fish.length && next.stats.hatched === prev.stats.hatched) {
    const newest = next.fish.find((f) => !prev.fish.some((p) => p.id === f.id));
    out.push({ event: 'buy_fish', props: newest ? { species: newest.speciesId } : {} });
  }
  if (decorOwned(next) > decorOwned(prev)) out.push({ event: 'buy_decor' });
  if (next.tanks.length > prev.tanks.length) out.push({ event: 'buy_tank' });
  if (next.ownedThemes.length > prev.ownedThemes.length) out.push({ event: 'buy_theme' });
  if (next.ownedStyles.length > prev.ownedStyles.length) out.push({ event: 'buy_style' });
  if (upgrades(next) > upgrades(prev)) out.push({ event: 'buy_upgrade' });
  if (next.courtships.length > prev.courtships.length) out.push({ event: 'breed_start' });
  if (pets(next) > pets(prev)) out.push({ event: 'pet_complete' });
  return out;
}

/** Subscribes to the store and the game's event streams. Returns a stop function. */
export function startAnalytics(isNew: boolean): () => void {
  const a = analytics();
  if (!a.configured) return () => undefined;
  const game = () => useGameStore.getState().game;
  a.track('session_start', { level: game().level, new_player: isNew });

  let fedSent = game().stats.fed;
  const flushFeed = () => {
    const fed = game().stats.fed;
    if (fed > fedSent) a.track('feed', { count: fed - fedSent });
    fedSent = fed;
  };
  const feedTimer = window.setInterval(flushFeed, 60_000);

  const unsubscribeStore = useGameStore.subscribe((s, prev) => {
    for (const { event, props } of eventsBetween(prev.game, s.game)) a.track(event, props);
    if (s.onboardingStep !== prev.onboardingStep) a.track('onboarding_step', { step: s.onboardingStep ?? 'done' });
    if (s.mode === 'decorate' && prev.mode !== 'decorate') a.track('decorate_open');
  });
  const unsubscribeSim = subscribeSimEvents((events) => {
    for (const e of events) if (e.type === 'hatched') a.track('hatch', { shiny: e.shiny });
  });
  const unsubscribeBond = subscribeBondEvents((e) => {
    if (e.type === 'levelUp') a.track('bond_level', { level: e.to });
  });
  return () => {
    flushFeed();
    window.clearInterval(feedTimer);
    unsubscribeStore();
    unsubscribeSim();
    unsubscribeBond();
  };
}
