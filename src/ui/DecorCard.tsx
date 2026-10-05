// Card for the selected decor item, built to fit without scrolling: a compact header (preview, name, collection), two short
// lines (set bonus / happiness) and one hint, with Decorate and Sell back pinned in the footer. A Popover next to the piece
// for a mouse, a docked card for a finger on a wide screen, a bottom sheet on a phone (see overlay/Card.tsx).
import { useCallback, useState } from 'react';
import { COLLECTIONS, DECOR } from '../game/constants';
import { activeSets, decorHappiness } from '../game/decor';
import { decorRefund } from '../game/economy';
import { currentRenderer } from '../render/renderer';
import { useGameStore } from '../store/gameStore';
import { Button, ConfirmDialog } from './kit';
import { Card } from './overlay/Card';
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
  const placedId = placed?.id ?? null;

  const anchor = useCallback(() => {
    if (!placedId) return null;
    const p = currentRenderer()?.decorScreenPoint(placedId);
    return p ? { x: p.x - 36, y: p.top, w: 72, h: Math.max(1, p.bottom - p.top) } : null;
  }, [placedId]);

  // In Decorate mode the floating toolbar edits the piece instead.
  if (!tank || !placed || mode === 'decorate') return null;
  const def = DECOR[placed.decorId];

  return (
    <>
      <Card
        ariaLabel={`About ${def.name}`}
        className="decorcard"
        anchor={anchor}
        onClose={() => selectDecor(null)}
        onLost={() => selectDecor(null)}
        title={
          <span className="fc-title">
            <span className="fc-thumb" aria-hidden="true">
              <DecorPreview decorId={placed.decorId} />
            </span>
            <span className="fc-title-text">
              <span className="fc-name">{def.name}</span>
              {def.collection && (
                <span className="fc-meta">
                  {COLLECTIONS[def.collection].icon} {COLLECTIONS[def.collection].name}
                </span>
              )}
            </span>
          </span>
        }
        footer={
          <div className="fc-actions">
            <Button variant="primary" size="sm" onClick={() => setMode('decorate')}>
              🎨 Decorate
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              Sell back <PriceTag price={decorRefund(placed.decorId)} />
            </Button>
          </div>
        }
      >
        <p className="meta">
          {def.collection && activeSets(tank).includes(def.collection) ? '✨ Set bonus active · ' : ''}Decor here gives fish +{decorHappiness(tank)} happiness
        </p>
        <p className="decorcard-hint">↔ Drag to move it, up and down to push it back or pull it forward.</p>
      </Card>
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
    </>
  );
}
