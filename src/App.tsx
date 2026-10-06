import { lazy, Suspense, useEffect } from 'react';
import { sound } from './audio/sound';
import { DEV_TOOLS_IN_PRODUCTION, DEV_TOOLS_KEY } from './game/constants';
import { startAnalytics } from './store/analyticsWiring';
import { startCloudSync } from './store/cloudSave';
import { startGame, useGameStore, type GameStore } from './store/gameStore';
import { BreakMode } from './ui/BreakMode';
import { CloudConflictModal } from './ui/CloudConflictModal';
import { DecorCard } from './ui/DecorCard';
import { FishCard } from './ui/FishCard';
import { Hud } from './ui/Hud';
import { IosInstallHint } from './ui/IosInstallHint';
import { LoadingScreen, useArtPreload } from './ui/LoadingScreen';
import { useLayoutVars } from './ui/useLayoutVars';
import { SaveLockPrompt } from './ui/SaveLockPrompt';
import { OverlayRoot } from './ui/overlay/OverlayRoot';
import { useDensity } from './ui/overlay/useDensity';
import { useVisualViewportVars } from './ui/overlay/useVisualViewport';
import { UpdatePrompt } from './ui/UpdatePrompt';
import { LevelUpModal } from './ui/LevelUpModal';
import { Onboarding } from './ui/Onboarding';
import { Settings } from './ui/Settings';
import { Shop } from './ui/Shop';
import { TankSwitcher } from './ui/TankSwitcher';
import { TankView } from './ui/TankView';
import { Toasts } from './ui/Toasts';
import { Toolbar } from './ui/Toolbar';
import { BreedingGuide } from './ui/BreedingGuide';
import { BreedingPanel } from './ui/BreedingPanel';
import { MyFish } from './ui/MyFish';
import { DecorTray } from './ui/DecorTray';
import { DecorToolbar } from './ui/DecorToolbar';
import { TankFrame } from './ui/TankFrame';
import { PairingBanner } from './ui/PairingBanner';
import { PairSheet } from './ui/PairSheet';
import { TopChip } from './ui/TopChip';
import { QuickActions } from './ui/QuickActions';
import { enterFullscreen, isTouchLandscape } from './ui/fullscreen';
import { closeTopSheet } from './ui/kit';
import { applyTokens } from './ui/tokens';

/** Production builds show the dev panel only after opening the page with `?dev=1` (remembered; `?dev=0` forgets). */
function devToolsUnlocked(): boolean {
  try {
    const flag = new URLSearchParams(window.location.search).get('dev');
    if (flag === '1') localStorage.setItem(DEV_TOOLS_KEY, '1');
    if (flag === '0') localStorage.removeItem(DEV_TOOLS_KEY);
    return localStorage.getItem(DEV_TOOLS_KEY) === '1';
  } catch {
    return false;
  }
}

// Dev/art-preview panel: always in dev; in production only when unlocked (otherwise the lazy chunk never loads).
const DevPanel = import.meta.env.DEV || DEV_TOOLS_IN_PRODUCTION || devToolsUnlocked() ? lazy(() => import('./ui/DevPanel')) : null;

/** Keeps the sound engine in sync with the saved mute setting and Break Mode ambience. */
function useSoundSync() {
  useEffect(() => {
    const apply = (s: GameStore) => {
      sound.setMuted(s.game.settings.muted);
      sound.setAmbience(s.breakSession !== null);
    };
    apply(useGameStore.getState());
    const unsubscribe = useGameStore.subscribe((s, prev) => {
      if (s.game.settings.muted !== prev.game.settings.muted || (s.breakSession === null) !== (prev.breakSession === null)) apply(s);
    });
    // Browsers only let audio start inside a user gesture. Chrome accepts pointerdown, but
    // Safari/iOS only trust click/touchend/keydown, so listen to all of them (capture phase).
    const unlock = () => sound.unlock();
    const events = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const;
    for (const type of events) window.addEventListener(type, unlock, { capture: true, passive: true });
    // Coming back to the tab/app: wake a context the browser put to sleep (the next gesture covers iOS).
    const onVisible = () => {
      if (document.visibilityState === 'visible') sound.handleVisible();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      for (const type of events) window.removeEventListener(type, unlock, { capture: true });
    };
  }, []);
}

/** Motion tokens follow the in-game "Reduce motion" setting or the OS preference. */
function useMotionTokens() {
  const setting = useGameStore((s) => s.game.settings.reducedMotion);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => applyTokens(document.documentElement, setting || query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [setting]);
}

/** Phones held sideways go fullscreen on the next tap (browsers only allow it inside a user gesture). */
function useLandscapeFullscreen() {
  useEffect(() => {
    const onGesture = () => {
      if (isTouchLandscape() && !document.fullscreenElement) enterFullscreen();
    };
    window.addEventListener('pointerup', onGesture);
    window.addEventListener('touchend', onGesture);
    return () => {
      window.removeEventListener('pointerup', onGesture);
      window.removeEventListener('touchend', onGesture);
    };
  }, []);
}

export function App() {
  useEffect(() => startGame(), []);
  // Anonymous product analytics (a no-op unless a key is configured; players can opt out in Settings).
  useEffect(() => startAnalytics(useGameStore.getState().onboardingStep === 0), []);
  // After the local load: restores a Supabase session (incl. a magic-link redirect) and keeps the cloud in sync.
  useEffect(() => startCloudSync(), []);
  useSoundSync();
  useLandscapeFullscreen();
  useMotionTokens();
  const onBreak = useGameStore((s) => s.breakSession !== null);
  const art = useArtPreload();
  useLayoutVars(art.ready && !onBreak);
  useVisualViewportVars();
  useDensity(art.ready);

  // Esc ends a break, tucks the Tools tray away, or closes cards/panels and leaves Feed/Premium/Clean mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const store = useGameStore.getState();
      if (store.breakSession) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
        store.exitBreak();
        return;
      }
      if (store.game.settings.toolsOpen) {
        store.setToolsOpen(false);
        return;
      }
      // The topmost sheet/dialog/card closes first.
      if (closeTopSheet()) return;
      if (store.pairingFishId || store.pairSheet) {
        store.cancelPairing();
        return;
      }
      store.selectFish(null);
      store.selectDecor(null);
      store.setMode('look');
      store.openPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!art.ready) return <LoadingScreen done={art.done} total={art.total} />;

  return (
    <div className={`app${onBreak ? ' app-break' : ''}`}>
      <TankView />
      <TankFrame />
      {/* Break Mode hides every other piece of UI. */}
      {!onBreak && (
        <>
          <Hud />
          <IosInstallHint />
          <FishCard />
          <QuickActions />
          <DecorCard />
          <Onboarding />
          <Toasts />
          <Toolbar />
          <Shop />
          <TankSwitcher />
          <BreedingPanel />
          <MyFish />
          <DecorTray />
          <DecorToolbar />
          <PairingBanner />
          <PairSheet />
          <TopChip />
          <BreedingGuide />
          <LevelUpModal />
          <Settings />
          <UpdatePrompt />
          <SaveLockPrompt />
          {DevPanel && (
            <Suspense fallback={null}>
              <DevPanel />
            </Suspense>
          )}
        </>
      )}
      <BreakMode />
      <CloudConflictModal />
      <OverlayRoot />
    </div>
  );
}
