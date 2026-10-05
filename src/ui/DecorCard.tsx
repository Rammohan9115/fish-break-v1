// Card for the selected decor item: what it is, how to move it, and sell back for 50% (with a confirm).
import { useState } from 'react';
import { COLLECTIONS, DECOR } from '../game/constants';
import { activeSets, decorHappiness } from '../game/decor';
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
  const setMode = useGameStore((s) => s.setMode);
  const mode = useGameStore((s) => s.mode);
  const [confirming, setConfirming] = useState(false);
  // In Decorate mode the floating toolbar edits the piece instead.
  if (!tank || !placed || mode === 'decorate') return null;
  const def = DECOR[placed.decorId];

  return (
    <Sheet inline title={def.name} onClose={() => selectDecor(null)} className="decorcard" size="sm">
      <div className="decorcard-head">
        <DecorPreview decorId={placed.decorId} />
        <div>
          {def.collection && (
            <p className="meta">
              {COLLECTIONS[def.collection].icon} {COLLECTIONS[def.collection].name} collection
              {activeSets(tank).includes(def.collection) ? ' · ✨ set bonus active' : ''}
            </p>
          )}
          <p className="meta">Decor here gives fish +{decorHappiness(tank)} happiness</p>
          <p className="decorcard-hint">↔ Drag to move it, up and down to push it back or pull it forward. 🎨 Decorate to flip, resize or rearrange.</p>
        </div>
      </div>
      <Button variant="primary" size="sm" onClick={() => setMode('decorate')}>
        🎨 Decorate
      </Button>
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
