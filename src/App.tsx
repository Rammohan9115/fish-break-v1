import { lazy, Suspense, useEffect } from 'react';
import { sound } from './audio/sound';
import { startGame, useGameStore, type GameStore } from './store/gameStore';
import { BreakMode } from './ui/BreakMode';
import { DecorCard } from './ui/DecorCard';
import { FishCard } from './ui/FishCard';
import { Hud } from './ui/Hud';
import { LevelUpModal } from './ui/LevelUpModal';
import { Onboarding } from './ui/Onboarding';
import { Shop } from './ui/Shop';
import { TankSwitcher } from './ui/TankSwitcher';
import { TankView } from './ui/TankView';
import { Toasts } from './ui/Toasts';
import { Toolbar } from './ui/Toolbar';

// Temporary art-preview panel; stripped from production builds.
const DevPanel = import.meta.env.DEV ? lazy(() => import('./ui/DevPanel')) : null;

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
    // Browsers only let audio start after a user gesture.
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      unsubscribe();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
}

export function App() {
  useEffect(() => startGame(), []);
  useSoundSync();
  const onBreak = useGameStore((s) => s.breakSession !== null);

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
      store.selectFish(null);
      store.selectDecor(null);
      store.setMode('look');
      store.openPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app${onBreak ? ' app-break' : ''}`}>
      <TankView />
      {/* Break Mode hides every other piece of UI. */}
      {!onBreak && (
        <>
          <Hud />
          <FishCard />
          <DecorCard />
          <Onboarding />
          <Toasts />
          <Toolbar />
          <Shop />
          <TankSwitcher />
          <LevelUpModal />
          {DevPanel && (
            <Suspense fallback={null}>
              <DevPanel />
            </Suspense>
          )}
        </>
      )}
      <BreakMode />
    </div>
  );
}
