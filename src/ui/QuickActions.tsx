// Tapping a fish shows three quick actions right next to it (Feed · Pair · Info) instead of a big card.
// It follows the fish as it swims; tap the water, press Esc, or tap another fish to move on. Tapping the same
// fish again (or Info) opens the full FishCard.
import { useCallback, useState } from 'react';
import { BOND, FULL_HUNGER } from '../game/constants';
import { breedingChecklist, breedingUnlocked, courtshipOf } from '../game/breeding';
import { sound } from '../audio/sound';
import { currentRenderer } from '../render/renderer';
import { useGameStore } from '../store/gameStore';
import { Button } from './kit';
import { Popover } from './overlay/Popover';
import { useNow, useQuestStep } from './useBreeding';

function Actions({ fishId }: { fishId: string }) {
  const fish = useGameStore((s) => s.game.fish.find((f) => f.id === fishId) ?? null);
  const game = useGameStore((s) => s.game);
  const show = useGameStore((s) => s.showQuickActions);
  const selectFish = useGameStore((s) => s.selectFish);
  const startPairing = useGameStore((s) => s.startPairing);
  const dropPellet = useGameStore((s) => s.dropPellet);
  const quest = useQuestStep();
  const now = useNow(1000);
  const [close] = useState(() => () => show(null));
  const anchor = useCallback(() => {
    const p = currentRenderer()?.fishScreenPoint(fishId);
    return p ? { x: p.x - 24, y: p.y - p.halfHeight, w: 48, h: p.halfHeight * 2 } : null;
  }, [fishId]);
  if (!fish) return null;

  const full = fish.hunger >= FULL_HUNGER;
  const feed = () => {
    const renderer = currentRenderer();
    const p = renderer?.fishScreenPoint(fish.id);
    if (!renderer || !p) return;
    const at = renderer.toTank(p.x, p.y);
    // Dropped right next to it: hand-fed, so it earns a little bond when it eats.
    if (dropPellet(at.x, false, renderer.fishNear(at.x, at.y, BOND.feedRadius))) sound.play('plop');
  };

  let pair: { reason: string | null } | null = null;
  if (breedingUnlocked(game) && fish.stage === 'adult') {
    if (courtshipOf(game, fish.id)) pair = { reason: 'Already in love 💞' };
    else {
      const missing = breedingChecklist(game, fish, now).lines.find((l) => !l.ok);
      pair = { reason: missing ? missing.hint : null };
    }
  }

  return (
    <Popover anchor={anchor} onLost={close} onClose={close} prefer="top" arrow={false} role="toolbar" className="quick" ariaLabel={`${fish.name}: quick actions`}>
      <span className="quick-name">{fish.name}</span>
      <div className="quick-row">
        <Button variant="primary" size="sm" disabledReason={full ? `${fish.name} is full!` : null} onClick={feed}>
          🍤 Feed
        </Button>
        {pair && (
          <Button variant="love" size="sm" pulse={quest?.step === 'pairUp' && !pair.reason} disabledReason={pair.reason} onClick={() => startPairing(fish.id)}>
            💕 Pair
          </Button>
        )}
        <Button size="sm" onClick={() => selectFish(fish.id)}>
          ℹ️ Info
        </Button>
      </div>
    </Popover>
  );
}

export function QuickActions() {
  const fishId = useGameStore((s) => s.quickFishId);
  const mode = useGameStore((s) => s.mode);
  if (!fishId || mode !== 'look') return null;
  return <Actions key={fishId} fishId={fishId} />;
}
