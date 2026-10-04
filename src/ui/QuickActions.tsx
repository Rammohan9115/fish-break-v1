// Tapping a fish shows three quick actions right next to it (Feed · Pair · Info) instead of a big card.
// It follows the fish as it swims; tap the water, press Esc, or tap another fish to move on. Tapping the same
// fish again (or Info) opens the full FishCard.
import { useEffect, useRef, useState } from 'react';
import { FULL_HUNGER } from '../game/constants';
import { breedingChecklist, breedingUnlocked, courtshipOf } from '../game/breeding';
import { sound } from '../audio/sound';
import { currentRenderer } from '../render/renderer';
import { useGameStore } from '../store/gameStore';
import { Button } from './kit';
import { pushSheet } from './kit/sheetStack';
import { useNow, useQuestStep } from './useBreeding';

/** Gap (px) between the fish and the action row. */
const GAP_PX = 14;
/** Keep the row this far from the viewport edges (px). */
const EDGE_PX = 8;

function usePositionNear(fishId: string, el: React.RefObject<HTMLDivElement>, onLost: () => void) {
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const node = el.current;
      const p = currentRenderer()?.fishScreenPoint(fishId);
      if (!p) {
        onLost();
        return;
      }
      if (node) {
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        const above = p.y - p.halfHeight - GAP_PX - h;
        // Prefer above the fish; flip below when there's no room under the HUD.
        const top = above > 90 ? above : p.y + p.halfHeight + GAP_PX;
        const left = Math.min(window.innerWidth - w - EDGE_PX, Math.max(EDGE_PX, p.x - w / 2));
        node.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.min(window.innerHeight - h - EDGE_PX, top))}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fishId, el, onLost]);
}

function Actions({ fishId }: { fishId: string }) {
  const fish = useGameStore((s) => s.game.fish.find((f) => f.id === fishId) ?? null);
  const game = useGameStore((s) => s.game);
  const show = useGameStore((s) => s.showQuickActions);
  const selectFish = useGameStore((s) => s.selectFish);
  const startPairing = useGameStore((s) => s.startPairing);
  const dropPellet = useGameStore((s) => s.dropPellet);
  const quest = useQuestStep();
  const now = useNow(1000);
  const ref = useRef<HTMLDivElement>(null);
  const [close] = useState(() => () => show(null));
  usePositionNear(fishId, ref, close);
  useEffect(() => pushSheet(close), [close]);
  if (!fish) return null;

  const full = fish.hunger >= FULL_HUNGER;
  const feed = () => {
    const renderer = currentRenderer();
    const p = renderer?.fishScreenPoint(fish.id);
    if (!renderer || !p) return;
    if (dropPellet(renderer.toTank(p.x, p.y).x)) sound.play('plop');
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
    <div ref={ref} className="quick" role="toolbar" aria-label={`${fish.name}: quick actions`}>
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
    </div>
  );
}

export function QuickActions() {
  const fishId = useGameStore((s) => s.quickFishId);
  const mode = useGameStore((s) => s.mode);
  if (!fishId || mode !== 'look') return null;
  return <Actions key={fishId} fishId={fishId} />;
}
