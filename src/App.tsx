import { lazy, Suspense, useEffect } from 'react';
import { sound } from './audio/sound';
import { DEV_TOOLS_IN_PRODUCTION } from './game/constants';
import { startCloudSync } from './store/cloudSave';
import { startGame, useGameStore, type GameStore } from './store/gameStore';
import { BreakMode } from './ui/BreakMode';
import { CloudConflictModal } from './ui/CloudConflictModal';
import { DecorCard } from './ui/DecorCard';
import { FishCard } from './ui/FishCard';
import { Hud } from './ui/Hud';
import { IosInstallHint } from './ui/IosInstallHint';
import { LoadingScreen, useArtPreload } from './ui/LoadingScreen';
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
import { PairingBanner } from './ui/PairingBanner';
import { PairSheet } from './ui/PairSheet';
import { QuestBanner } from './ui/QuestBanner';
import { enterFullscreen, isTouchLandscape } from './ui/fullscreen';

// Dev/art-preview panel: always in dev; in production only while DEV_TOOLS_IN_PRODUCTION is true
// (when false, the lazy chunk is never loaded).
const DevPanel = import.meta.env.DEV || DEV_TOOLS_IN_PRODUCTION ? lazy(() => import('./ui/DevPanel')) : null;

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
    return () => {
      unsubscribe();
      for (const type of events) window.removeEventListener(type, unlock, { capture: true });
    };
  }, []);
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
  // After the local load: restores a Supabase session (incl. a magic-link redirect) and keeps the cloud in sync.
  useEffect(() => startCloudSync(), []);
  useSoundSync();
  useLandscapeFullscreen();
  const onBreak = useGameStore((s) => s.breakSession !== null);
  const art = useArtPreload();

  // Esc ends a break, or closes cards/panels and leaves Feed/Premium/Clean mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const store = useGameStore.getState();
      if (store.breakSession) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
        store.exitBreak();
        return;
      }
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
      {/* Break Mode hides every other piece of UI. */}
      {!onBreak && (
        <>
          <Hud />
          <IosInstallHint />
          <FishCard />
          <DecorCard />
          <Onboarding />
          <Toasts />
          <Toolbar />
          <Shop />
          <TankSwitcher />
          <BreedingPanel />
          <PairingBanner />
          <PairSheet />
          <QuestBanner />
          <BreedingGuide />
          <LevelUpModal />
          <Settings />
          {DevPanel && (
            <Suspense fallback={null}>
              <DevPanel />
            </Suspense>
          )}
        </>
      )}
      <BreakMode />
      <CloudConflictModal />
    </div>
  );
}
