// Card for the selected decor item: what it is, how to move it, and sell back for 50%.
import { DECOR, HAPPINESS_PER_DECOR } from '../game/constants';
import { decorRefund } from '../game/economy';
import { useGameStore } from '../store/gameStore';
import { DecorPreview } from './Preview';
import { PriceTag } from './Shop';

export function DecorCard() {
  const tank = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId));
  const placed = useGameStore((s) => (s.selectedDecorId ? tank?.decor.find((d) => d.id === s.selectedDecorId) : undefined));
  const selectDecor = useGameStore((s) => s.selectDecor);
  const sellDecor = useGameStore((s) => s.sellDecor);
  if (!tank || !placed) return null;
  const def = DECOR[placed.decorId];

  return (
    <aside className="fishcard decorcard" aria-label={def.name}>
      <button type="button" className="fishcard-close" onClick={() => selectDecor(null)} aria-label="Close">
        ✕
      </button>
      <div className="decorcard-head">
        <DecorPreview decorId={placed.decorId} />
        <div>
          <div className="decorcard-name">{def.name}</div>
          <div className="fishcard-sub">+{HAPPINESS_PER_DECOR} happiness for fish in {tank.name}</div>
        </div>
      </div>
      <p className="decorcard-hint">↔ Drag it along the sand to move it.</p>
      <button type="button" className="fishcard-sell" onClick={() => sellDecor(tank.id, placed.id)}>
        Sell back <PriceTag price={decorRefund(placed.decorId)} />
      </button>
    </aside>
  );
}
