// Decorate mode: a small toolbar floating above the selected decor piece — flip, back/front (sand pieces),
// S/M/L size, back to the box, or sell. Follows the piece as it bobs or drifts.
import { useCallback, useEffect, useState } from 'react';
import { DECOR, DECOR_Z } from '../game/constants';
import { decorRefund } from '../game/economy';
import type { DecorSize } from '../game/types';
import { currentRenderer } from '../render/renderer';
import { useGameStore } from '../store/gameStore';
import { Button, ConfirmDialog } from './kit';
import { Popover } from './overlay/Popover';
import { PriceTag } from './Shop';

const SIZES: DecorSize[] = ['S', 'M', 'L'];
/** Quick depth presets (a piece dragged in between highlights the nearest one). */
const DEPTHS = [
  { label: 'Far', z: DECOR_Z.far },
  { label: 'Mid', z: DECOR_Z.mid },
  { label: 'Near', z: DECOR_Z.near },
] as const;
const nearestDepth = (z: number): number => DEPTHS.reduce((best, d) => (Math.abs(d.z - z) < Math.abs(best.z - z) ? d : best)).z;
/** Keyboard nudge in tank units (Shift = a bigger step). */
const NUDGE = 10;
const NUDGE_BIG = 40;

export function DecorToolbar() {
  const mode = useGameStore((s) => s.mode);
  const selectedId = useGameStore((s) => s.selectedDecorId);
  const placed = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId)?.decor.find((d) => d.id === s.selectedDecorId) ?? null);
  const updateDecor = useGameStore((s) => s.updateDecor);
  const storeDecor = useGameStore((s) => s.storeDecor);
  const sellDecor = useGameStore((s) => s.sellDecor);
  const tankId = useGameStore((s) => s.game.activeTankId);
  const [selling, setSelling] = useState(false);
  const moveDecor = useGameStore((s) => s.moveDecor);
  const placedX = placed?.x;
  const placedZ = placed?.z;
  const isSand = placed ? DECOR[placed.decorId].placement === 'sand' : false;

  // Keyboard path for moving a piece: ←/→ nudge it sideways (Shift for bigger steps), ↑/↓ push it back / pull it forward.
  useEffect(() => {
    if (mode !== 'decorate' || !selectedId || placedX === undefined) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && !(vertical && isSand)) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      // Arrows inside tab lists / sliders keep their own meaning.
      if (t instanceof HTMLElement && t.closest('[role=tablist], [role=slider]')) return;
      e.preventDefault();
      if (vertical) {
        // ↑ pushes the piece back (farther), ↓ pulls it forward; rounding to 2 decimals avoids float drift.
        const z = Math.round(((placedZ ?? DECOR_Z.default) + (e.key === 'ArrowUp' ? -DECOR_Z.step : DECOR_Z.step)) * 100) / 100;
        moveDecor(selectedId, placedX, Math.min(1, Math.max(0, z)));
        return;
      }
      const step = e.shiftKey ? NUDGE_BIG : NUDGE;
      moveDecor(selectedId, placedX + (e.key === 'ArrowLeft' ? -step : step));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, selectedId, placedX, placedZ, isSand, moveDecor]);

  // Where the piece is (it may bob or drift): the Popover follows it every frame, flips below it when there is no room above,
  // and keeps clear of the HUD, the dock and the docked Decorate tray.
  const anchor = useCallback(() => {
    if (!selectedId) return null;
    const p = currentRenderer()?.decorScreenPoint(selectedId);
    return p ? { x: p.x - 36, y: p.top, w: 72, h: Math.max(1, p.bottom - p.top) } : null;
  }, [selectedId]);

  if (mode !== 'decorate' || !placed) return null;
  const def = DECOR[placed.decorId];
  const sand = def.placement === 'sand';
  return (
    <>
      <Popover anchor={anchor} prefer="top" arrow={false} role="toolbar" className="quick decor-tools" ariaLabel={`${def.name}: edit`}>
        <span className="quick-name">{def.name}</span>
        <div className="quick-row">
          <Button size="sm" aria-pressed={placed.flipped} onClick={() => updateDecor(placed.id, { flipped: !placed.flipped })}>
            ⇋ Flip
          </Button>
          {sand && (
            <div className="size-seg" role="radiogroup" aria-label="Depth">
              {DEPTHS.map(({ label, z }) => {
                const on = nearestDepth(placed.z) === z;
                return (
                  <button key={label} type="button" role="radio" aria-checked={on} className={`size-btn depth-btn${on ? ' size-on' : ''}`} onClick={() => updateDecor(placed.id, { z })}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="size-seg" role="radiogroup" aria-label="Size">
            {SIZES.map((sz) => (
              <button key={sz} type="button" role="radio" aria-checked={placed.size === sz} className={`size-btn${placed.size === sz ? ' size-on' : ''}`} onClick={() => updateDecor(placed.id, { size: sz })}>
                {sz}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => storeDecor(placed.id)}>
            📦 To box
          </Button>
          <Button size="sm" variant="danger" onClick={() => setSelling(true)}>
            Sell
          </Button>
        </div>
      </Popover>
      {selling && (
        <ConfirmDialog
          title={`Sell ${def.name}?`}
          body={
            <p>
              You'll get back <PriceTag price={decorRefund(placed.decorId)} /> (half its price). Or keep it in your decor box with 📦 instead.
            </p>
          }
          confirmLabel="Sell"
          cancelLabel="Keep it"
          tone="danger"
          onCancel={() => setSelling(false)}
          onConfirm={() => {
            setSelling(false);
            sellDecor(tankId, placed.id);
          }}
        />
      )}
    </>
  );
}
