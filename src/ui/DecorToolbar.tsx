// Decorate mode: a small toolbar floating above the selected decor piece — flip, back/front (sand pieces),
// S/M/L size, back to the box, or sell. Follows the piece as it bobs or drifts.
import { useEffect, useRef, useState } from 'react';
import { DECOR } from '../game/constants';
import { decorRefund } from '../game/economy';
import type { DecorSize } from '../game/types';
import { currentRenderer } from '../render/renderer';
import { useGameStore } from '../store/gameStore';
import { Button, ConfirmDialog } from './kit';
import { PriceTag } from './Shop';

const GAP_PX = 12;
const EDGE_PX = 8;
const SIZES: DecorSize[] = ['S', 'M', 'L'];
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
  const ref = useRef<HTMLDivElement>(null);
  const moveDecor = useGameStore((s) => s.moveDecor);
  const placedX = placed?.x;

  // Keyboard path for moving a piece: ←/→ nudge the selected piece (Shift for bigger steps).
  useEffect(() => {
    if (mode !== 'decorate' || !selectedId || placedX === undefined) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      // Arrows inside tab lists / sliders keep their own meaning.
      if (t instanceof HTMLElement && t.closest('[role=tablist], [role=slider]')) return;
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_BIG : NUDGE;
      moveDecor(selectedId, placedX + (e.key === 'ArrowLeft' ? -step : step));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, selectedId, placedX, moveDecor]);

  // Follow the piece (it may bob or drift); flip below it when there's no room above.
  useEffect(() => {
    if (mode !== 'decorate' || !selectedId) return undefined;
    let raf = 0;
    const tick = () => {
      const p = currentRenderer()?.decorScreenPoint(selectedId);
      const node = ref.current;
      if (p && node) {
        // A tray docked at the right (tablet, desktop, landscape) is off limits; the toolbar wraps to fit.
        const tray = document.querySelector('.sheet-inline');
        const trayLeft = tray ? tray.getBoundingClientRect().left : Infinity;
        const right = Math.min(window.innerWidth, trayLeft > window.innerWidth * 0.4 ? trayLeft - EDGE_PX : window.innerWidth) - EDGE_PX;
        node.style.maxWidth = `${Math.max(160, right - EDGE_PX)}px`;
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        const above = p.top - GAP_PX - h;
        const hudStack = parseFloat(getComputedStyle(node.closest('.app') ?? document.body).getPropertyValue('--hud-stack')) || 90;
        const top = above > hudStack ? above : Math.min(window.innerHeight - h - EDGE_PX, p.bottom + GAP_PX);
        const left = Math.min(right - w, Math.max(EDGE_PX, p.x - w / 2));
        node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, selectedId]);

  if (mode !== 'decorate' || !placed) return null;
  const def = DECOR[placed.decorId];
  const sand = def.placement === 'sand';
  return (
    <>
      <div ref={ref} className="quick decor-tools" role="toolbar" aria-label={`${def.name}: edit`}>
        <span className="quick-name">{def.name}</span>
        <div className="quick-row">
          <Button size="sm" aria-pressed={placed.flipped} onClick={() => updateDecor(placed.id, { flipped: !placed.flipped })}>
            ⇋ Flip
          </Button>
          {sand && (
            <Button size="sm" onClick={() => updateDecor(placed.id, { depth: placed.depth === 'front' ? 'back' : 'front' })}>
              {placed.depth === 'front' ? '⬇ To back' : '⬆ To front'}
            </Button>
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
      </div>
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
