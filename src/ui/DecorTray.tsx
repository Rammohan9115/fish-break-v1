// Decorate mode shelf: no side bar, the tank stays full size. A slim strip under the water holds the decor box (drag a
// piece into the tank, or tap it to drop it in the middle) and opens Manage box, Layouts (3 slots per tank) and Tank Style
// as on-demand windows.
import { useEffect, useRef, useState } from 'react';
import { DECOR, LAYOUT_PRESET_SLOTS } from '../game/constants';
import { boxCount, snapZ, zFromBaseY } from '../game/decor';
import type { DecorId } from '../game/types';
import { currentRenderer } from '../render/renderer';
import { sound } from '../audio/sound';
import { useGameStore, type TrayTab } from '../store/gameStore';
import { Button, ConfirmDialog, EmptyState, Sheet } from './kit';
import { DecorPreview } from './Preview';
import { PriceTag } from './Shop';
import { StylePicker } from './StylePicker';
import { decorRefund } from '../game/economy';

/** Pointer travel (px) before a press on a box item becomes a drag. */
const DRAG_START_PX = 8;

/** Places `decorId` where the pointer was released over the tank (or the middle of the view); sand pieces take their depth from the release height. */
function dropInTank(decorId: DecorId, clientX: number | null, clientY: number | null = null): boolean {
  const renderer = currentRenderer();
  const store = useGameStore.getState();
  if (!renderer) return false;
  let x: number;
  if (clientX === null) {
    const rect = document.querySelector('.tank-canvas')?.getBoundingClientRect();
    x = rect ? renderer.toTank(rect.left + rect.width / 2, rect.top).x : 500;
  } else {
    x = renderer.toTank(clientX, 0).x;
  }
  const z = clientX !== null && clientY !== null && DECOR[decorId].placement === 'sand' ? snapZ(zFromBaseY(renderer.toTank(clientX, clientY).y)) : undefined;
  const ok = store.placeFromBox(decorId, x, z);
  if (ok) sound.play('plop');
  return ok;
}

function BoxItem({ decorId, count, compact = false }: { decorId: DecorId; count: number; compact?: boolean }) {
  const [selling, setSelling] = useState(false);
  const sellBoxed = useGameStore((s) => s.sellBoxedDecor);
  const ghost = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    start.current = { x: e.clientX, y: e.clientY, dragging: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    if (!s) return;
    if (!s.dragging && Math.hypot(e.clientX - s.x, e.clientY - s.y) < DRAG_START_PX) return;
    if (!s.dragging) {
      s.dragging = true;
      // A floating copy of the tile follows the finger.
      const g = document.createElement('div');
      g.className = 'tray-ghost';
      g.textContent = DECOR[decorId].name;
      document.body.appendChild(g);
      ghost.current = g;
    }
    if (ghost.current) ghost.current.style.transform = `translate(${e.clientX - 40}px, ${e.clientY - 20}px)`;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    start.current = null;
    ghost.current?.remove();
    ghost.current = null;
    if (!s) return;
    if (!s.dragging) {
      dropInTank(decorId, null);
      return;
    }
    // Dropped over the water (not over the tray or other UI): place it there.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (under?.classList.contains('tank-canvas')) dropInTank(decorId, e.clientX, e.clientY);
  };

  const grab = (
      <button
        type="button"
        className="tray-grab"
        aria-label={`Place ${DECOR[decorId].name}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          ghost.current?.remove();
          ghost.current = null;
        }}
      >
        <DecorPreview decorId={decorId} />
        <span className="tray-name">{DECOR[decorId].name}</span>
        {count > 1 && <span className="badge badge-brand badge-count">×{count}</span>}
      </button>
  );
  if (compact) return <li className="shelf-item">{grab}</li>;
  return (
    <li className="tile tray-item">
      {grab}
      <Button size="sm" variant="ghost" onClick={() => setSelling(true)} aria-label={`Sell ${DECOR[decorId].name}`}>
        Sell
      </Button>
      {selling && (
        <ConfirmDialog
          title={`Sell ${DECOR[decorId].name}?`}
          body={
            <p>
              You'll get back <PriceTag price={decorRefund(decorId)} /> (half its price).
            </p>
          }
          confirmLabel="Sell"
          cancelLabel="Keep it"
          tone="danger"
          onCancel={() => setSelling(false)}
          onConfirm={() => {
            setSelling(false);
            sellBoxed(decorId);
          }}
        />
      )}
    </li>
  );
}

function BoxTab() {
  const inventory = useGameStore((s) => s.game.decorInventory);
  const openPanel = useGameStore((s) => s.openPanel);
  const items = (Object.entries(inventory) as [DecorId, number][]).filter(([, n]) => n > 0);
  if (items.length === 0) {
    return (
      <EmptyState
        icon="📦"
        title="Your decor box is empty"
        body="Tap a piece in the tank and choose 📦 To box, or buy more in the shop."
        action={
          <Button size="sm" variant="primary" onClick={() => openPanel('shop', 'decor')}>
            🛒 Shop decor
          </Button>
        }
      />
    );
  }
  return (
    <>
      <p className="meta">Drag a piece into the water, or tap it to drop it in the middle.</p>
      <ul className="tray-list">
        {items.map(([id, n]) => (
          <BoxItem key={id} decorId={id} count={n} />
        ))}
      </ul>
    </>
  );
}

function LayoutsTab() {
  const tank = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId)!);
  const savePreset = useGameStore((s) => s.savePreset);
  const applyPreset = useGameStore((s) => s.applyPreset);
  const [confirm, setConfirm] = useState<number | null>(null);
  return (
    <>
      <p className="meta">Save up to {LAYOUT_PRESET_SLOTS} layouts for {tank.name} and switch between them. Pieces you no longer own are skipped.</p>
      <ul className="tray-list">
        {Array.from({ length: LAYOUT_PRESET_SLOTS }, (_, i) => {
          const preset = tank.layoutPresets[i] ?? null;
          return (
            <li key={i} className="tile layout-slot">
              <span className="layout-name">
                <strong>{preset ? preset.name : `Slot ${i + 1}`}</strong>
                <span className="meta">{preset ? `${preset.items.length} pieces` : 'Empty'}</span>
              </span>
              <Button size="sm" onClick={() => (preset ? setConfirm(i) : savePreset(i, `Layout ${i + 1}`))}>
                💾 Save here
              </Button>
              <Button size="sm" variant="primary" disabledReason={preset ? null : 'Save a layout here first'} onClick={() => applyPreset(i)}>
                Apply
              </Button>
            </li>
          );
        })}
      </ul>
      {confirm !== null && (
        <ConfirmDialog
          title={`Replace “${tank.layoutPresets[confirm]?.name}”?`}
          body={<p>The current layout of {tank.name} will be saved in this slot instead.</p>}
          confirmLabel="Replace"
          cancelLabel="Keep"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            savePreset(confirm, tank.layoutPresets[confirm]?.name ?? `Layout ${confirm + 1}`);
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}

export function DecorTray() {
  const mode = useGameStore((s) => s.mode);
  const selected = useGameStore((s) => s.selectedDecorId);
  const [win, setWin] = useState<TrayTab | null>(null);
  const inventory = useGameStore((s) => s.game.decorInventory);
  const openPanel = useGameStore((s) => s.openPanel);
  const boxed = useGameStore((s) => boxCount(s.game));
  // Leaving Decorate mode puts any open window away.
  useEffect(() => {
    if (mode !== 'decorate') setWin(null);
  }, [mode]);
  if (mode !== 'decorate') return null;
  const items = (Object.entries(inventory) as [DecorId, number][]).filter(([, n]) => n > 0);
  const titles: Record<TrayTab, string> = { box: '📦 Decor box', layouts: '💾 Layouts', style: '✨ Tank Style' };
  return (
    <>
      <div className={`decor-shelf${selected ? ' decor-shelf-quiet' : ''}`} role="region" aria-label="Decor shelf">
        <ul className="shelf-list">
          {items.length === 0 ? (
            <li className="shelf-empty">
              <span className="meta">Box is empty</span>
              <Button size="sm" variant="primary" onClick={() => openPanel('shop', 'decor')}>
                🛒 Shop decor
              </Button>
            </li>
          ) : (
            items.map(([id, n]) => <BoxItem key={id} decorId={id} count={n} compact />)
          )}
        </ul>
        <div className="shelf-actions">
          {items.length > 0 && (
            <Button size="sm" onClick={() => setWin('box')}>
              📦 Box{boxed > 0 ? ` (${boxed})` : ''}
            </Button>
          )}
          <Button size="sm" onClick={() => setWin('layouts')}>
            💾 Layouts
          </Button>
          <Button size="sm" onClick={() => setWin('style')}>
            ✨ Style
          </Button>
        </div>
      </div>
      {win && (
        <Sheet size="md" className="decor-window" title={titles[win]} onClose={() => setWin(null)} scrollKey={win}>
          {win === 'box' && <BoxTab />}
          {win === 'layouts' && <LayoutsTab />}
          {win === 'style' && <StylePicker />}
        </Sheet>
      )}
    </>
  );
}
