// Card for the selected decor item: what it is, how to move it, and sell back for 50% (with a confirm).
import { useState } from 'react';
import { DECOR, HAPPINESS_PER_DECOR } from '../game/constants';
import { decorRefund } from '../game/economy';
import { useGameStore } from '../store/gameStore';
import { Button, ConfirmDialog, Sheet } from './kit';
import { DecorPreview } from './Preview';
import { PriceTag } from './Shop';

export function DecorCard() {
  const tank = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId));
  const placed = useGameStore((s) => (s.selectedDecorId ? tank?.decor.find((d) => d.id === s.selectedDecorId) : undefined));
  const selectDecor = useGameStore((s) => s.selectDecor);
  const sellDecor = useGameStore((s) => s.sellDecor);
  const [confirming, setConfirming] = useState(false);
  if (!tank || !placed) return null;
  const def = DECOR[placed.decorId];

  return (
    <Sheet inline title={def.name} onClose={() => selectDecor(null)} className="decorcard" size="sm">
      <div className="decorcard-head">
        <DecorPreview decorId={placed.decorId} />
        <div>
          <p className="meta">+{HAPPINESS_PER_DECOR} happiness for fish in {tank.name}</p>
          <p className="decorcard-hint">↔ Drag it along the sand to move it. Next time, hold it to pick it up.</p>
        </div>
      </div>
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        Sell back <PriceTag price={decorRefund(placed.decorId)} />
      </Button>
      {confirming && (
        <ConfirmDialog
          title={`Sell ${def.name}?`}
          body={
            <p>
              You'll get back <PriceTag price={decorRefund(placed.decorId)} /> (half its price).
            </p>
          }
          confirmLabel="Sell back"
          cancelLabel="Keep it"
          tone="danger"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            sellDecor(tank.id, placed.id);
          }}
        />
      )}
    </Sheet>
  );
}
