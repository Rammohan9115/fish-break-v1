// Decorate mode tray: the decor box (drag an item into the tank, or tap to drop it in the middle), saved
// layouts (3 slots per tank) and Tank Style. A bottom sheet on phones, docked right on desktop.
import { useEffect, useRef, useState } from 'react';
import { DECOR, LAYOUT_PRESET_SLOTS } from '../game/constants';
import { boxCount } from '../game/decor';
import type { DecorId } from '../game/types';
import { currentRenderer } from '../render/renderer';
import { sound } from '../audio/sound';
import { useGameStore, type TrayTab } from '../store/gameStore';
import { Button, ConfirmDialog, EmptyState, Sheet, Tabs } from './kit';
import { DecorPreview } from './Preview';
import { PriceTag } from './Shop';
import { StylePicker } from './StylePicker';
import { decorRefund } from '../game/economy';

/** Pointer travel (px) before a press on a box item becomes a drag. */
const DRAG_START_PX = 8;

/** Places `decorId` where the pointer was released over the tank (or the middle of the view). */
function dropInTank(decorId: DecorId, clientX: number | null): boolean {
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
  const ok = store.placeFromBox(decorId, x);
  if (ok) sound.play('plop');
  return ok;
}

function BoxItem({ decorId, count }: { decorId: DecorId; count: number }) {
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
    if (under?.classList.contains('tank-canvas')) dropInTank(decorId, e.clientX);
  };

  return (
    <li className="tile tray-item">
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

/** Phones: the tray would cover the sand, so it starts folded down to its header. */
const NARROW_PX = 640;

export function DecorTray() {
  const mode = useGameStore((s) => s.mode);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= NARROW_PX);
  const selected = useGameStore((s) => s.selectedDecorId);
  // On phones, picking a piece in the tank folds the tray so the piece (and its toolbar) stay in view.
  useEffect(() => {
    if (selected && window.innerWidth <= NARROW_PX) setCollapsed(true);
  }, [selected]);
  const tab = useGameStore((s) => s.trayTab);
  const setTab = useGameStore((s) => s.setTrayTab);
  const setMode = useGameStore((s) => s.setMode);
  const boxed = useGameStore((s) => boxCount(s.game));
  if (mode !== 'decorate') return null;
  return (
    <Sheet
      inline
      title="🎨 Decorate"
      onClose={() => setMode('look')}
      className={`decor-tray${collapsed ? ' decor-tray-collapsed' : ''}`}
      scrollKey={tab}
      headerExtra={
        <button type="button" className="mini-btn tray-fold" aria-expanded={!collapsed} aria-label={collapsed ? 'Show the decor tray' : 'Fold the decor tray'} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? '▲' : '▼'}
        </button>
      }
    >
      <Tabs<TrayTab>
        ariaLabel="Decorate"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'box', label: `📦 Box${boxed > 0 ? ` (${boxed})` : ''}`, title: `Box${boxed > 0 ? ` (${boxed})` : ''}: your decor box` },
          { id: 'layouts', label: '💾 Layouts' },
          { id: 'style', label: '✨ Tank Style' },
        ]}
      />
      {tab === 'box' && <BoxTab />}
      {tab === 'layouts' && <LayoutsTab />}
      {tab === 'style' && <StylePicker />}
    </Sheet>
  );
}
