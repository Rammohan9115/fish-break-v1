// Hosts the tank canvas and the renderer. React never draws fish; it only mounts the canvas
// and routes input: collect a drop > sponge (Clean) / drop food (Feed/Premium) > fish > decor (hold to pick up, then drag).
import { useEffect, useRef } from 'react';
import { DECOR_LONG_PRESS_MS, DRAG_THRESHOLD_PX, LONG_PRESS_SLOP_PX, PAN_TIP_KEY, SAND_Y, XP } from '../game/constants';
import { algaeTouchedBySponge } from '../game/sim';
import { sound } from '../audio/sound';
import { breedingQuestStep, breedingUnlocked, compatiblePartners, isReadyToPair } from '../game/breeding';
import { Renderer, type BreedingView } from '../render/renderer';
import { subscribeSimEvents, useGameStore } from '../store/gameStore';
import { DailyGift } from './DailyGift';
import { HUD_BUMP_EVENT } from './Hud';

type Point = { x: number; y: number };

/** What a press in the tank started. */
type Gesture =
  | { kind: 'sponge'; last: Point }
  | { kind: 'decor'; id: string; grabOffset: number; startClientX: number; dragging: boolean }
  /** A press on decor that isn't picked up yet: it only moves if held for DECOR_LONG_PRESS_MS. */
  | { kind: 'hold'; id: string; grabOffset: number; startClientX: number; startClientY: number }
  | { kind: 'pan'; lastClientX: number }
  | null;

/** Wipes every algae spot the sponge touched between two tank-space points. */
function sponge(renderer: Renderer, from: Point, to: Point): void {
  const store = useGameStore.getState();
  const tank = store.game.tanks.find((t) => t.id === store.game.activeTankId);
  if (!tank) return;
  renderer.suds(to.x, to.y);
  for (const id of algaeTouchedBySponge(tank.algaeSpots, from, to)) {
    renderer.wipeEffect(id, XP.algaeWiped);
    useGameStore.getState().wipeAlgae(id);
    sound.play('squeak');
  }
}

/** What the tank shows for breeding: ready fish (💕), pairing mode, courtships, and the quest's target fish. */
function getBreedingView(): BreedingView {
  const s = useGameStore.getState();
  const { game } = s;
  const now = Date.now();
  const inTank = game.fish.filter((f) => f.tankId === game.activeTankId);
  const unlocked = breedingUnlocked(game);
  const readyIds = new Set<string>();
  if (unlocked) for (const f of inTank) if (isReadyToPair(game, f, now) && compatiblePartners(game, f, now).length > 0) readyIds.add(f.id);
  const chooser = s.pairingFishId ? inTank.find((f) => f.id === s.pairingFishId) : undefined;
  const quest = breedingQuestStep(game, { selectedFishId: s.quickFishId ?? s.selectedFishId, pairingFishId: s.pairingFishId, sheetOpen: s.pairSheet !== null }, now);
  return {
    readyIds,
    pairing: chooser ? { fishId: chooser.id, compatibleIds: new Set(compatiblePartners(game, chooser, now).map((f) => f.id)) } : null,
    courtships: game.courtships.filter((c) => c.tankId === game.activeTankId),
    questFishId: quest && (quest.step === 'tapFish' || quest.step === 'pickPartner') ? quest.fishId : null,
  };
}

function handleTankPress(renderer: Renderer, clientX: number, clientY: number): Gesture {
  // Any point on the canvas is in view (the view may extend beyond the 1000×625 world on wide/tall screens).
  const { x, y } = renderer.toTank(clientX, clientY);
  const store = useGameStore.getState();

  // During a break the tank is just for looking (fish still react to a poke).
  if (store.breakSession) {
    const fishId = renderer.fishAt(x, y);
    if (fishId) {
      renderer.poke(fishId);
      sound.play('bubble');
    }
    return null;
  }

  // Pairing mode: tap a glowing fish to choose it, anything else cancels.
  if (store.pairingFishId) {
    const fishId = renderer.fishAt(x, y);
    if (fishId && fishId !== store.pairingFishId) store.pickPartner(fishId);
    else if (!fishId) store.cancelPairing();
    return null;
  }

  const dropId = renderer.dropAt(x, y);
  if (dropId) {
    renderer.popDrop(dropId);
    store.collectDrop(dropId);
    sound.play('coin');
    return null;
  }

  if (store.mode !== 'look') store.touchMode();

  if (store.mode === 'clean') {
    sponge(renderer, { x, y }, { x, y });
    return { kind: 'sponge', last: { x, y } };
  }

  if (store.mode === 'feed' || store.mode === 'premium') {
    if (y >= SAND_Y) return null;
    const premium = store.mode === 'premium';
    if (premium && store.game.inventory.premiumFood <= 0) {
      store.addToast('Out of premium food 🌟');
      store.setMode('feed');
      return null;
    }
    const dropped = store.dropPellet(x, premium);
    if (dropped) sound.play('plop');
    if (dropped && premium && useGameStore.getState().game.inventory.premiumFood === 0) {
      store.addToast('That was your last premium food 🌟');
      store.setMode('feed');
    }
    // On tall screens a drag after the tap pans the view.
    if (renderer.canPan) return { kind: 'pan', lastClientX: clientX };
    return null;
  }

  const fishId = renderer.fishAt(x, y);
  if (fishId) {
    renderer.poke(fishId);
    sound.play('bubble');
    // Tapping the same fish again opens its full card; the first tap shows quick actions next to it.
    if (store.quickFishId === fishId) store.selectFish(fishId);
    else store.showQuickActions(fishId);
    return null;
  }

  const decorId = renderer.decorAt(x, y);
  if (decorId) {
    const placed = store.game.tanks.find((t) => t.id === store.game.activeTankId)?.decor.find((d) => d.id === decorId);
    const grabOffset = x - (placed?.x ?? x);
    // Already picked up (its card is open): drag it right away.
    if (decorId === store.selectedDecorId) return { kind: 'decor', id: decorId, grabOffset, startClientX: clientX, dragging: false };
    // Otherwise a tap is just a tap on the water; holding picks it up.
    store.selectFish(null);
    store.selectDecor(null);
    store.showQuickActions(null);
    return { kind: 'hold', id: decorId, grabOffset, startClientX: clientX, startClientY: clientY };
  }

  store.selectFish(null);
  store.selectDecor(null);
  store.showQuickActions(null);
  // Empty water: on tall screens, dragging pans the view.
  return renderer.canPan ? { kind: 'pan', lastClientX: clientX } : null;
}

export function TankView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const mode = useGameStore((s) => s.mode);
  /** The gesture in progress (sponge stroke or decor drag), if any. */
  const gestureRef = useRef<Gesture>(null);
  /** Pending long-press timer for a 'hold' gesture. */
  const holdTimerRef = useRef<number | null>(null);
  /** The "hold to move" tip shows once per visit, on the first short tap on decor. */
  const holdTipShownRef = useRef(false);

  const clearHold = () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const renderer = new Renderer(canvas, {
      getGame: () => useGameStore.getState().game,
      onEat: (fishId, pelletId) => useGameStore.getState().eatPellet(fishId, pelletId),
      getSelectedFishId: () => {
        const s = useGameStore.getState();
        return s.quickFishId ?? s.selectedFishId;
      },
      getSelectedDecorId: () => useGameStore.getState().selectedDecorId,
      getHudTarget: (icon) => {
        const el = document.querySelector(icon === 'pearl' ? '.hud-pearls .icon, .hud-pearls .hud-pearl' : '.hud-coins .icon, .hud-coins .hud-bar-icon');
        const r = el?.getBoundingClientRect();
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
      },
      onHudArrive: (icon) => window.dispatchEvent(new CustomEvent(HUD_BUMP_EVENT, { detail: icon })),
      getBreedingView,
    });
    rendererRef.current = renderer;
    // Dev-only handle for debugging/tests (stripped from production builds).
    if (import.meta.env.DEV) (window as unknown as { __renderer?: Renderer }).__renderer = renderer;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) renderer.resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(container);
    const rect = container.getBoundingClientRect();
    renderer.resize(rect.width, rect.height);
    renderer.start();
    // Tall screens show part of the tank: tell the player once that they can drag to look around.
    if (renderer.canPan) {
      try {
        if (!localStorage.getItem(PAN_TIP_KEY)) {
          localStorage.setItem(PAN_TIP_KEY, '1');
          window.setTimeout(() => useGameStore.getState().addToast('👆 Drag the water to look around the tank'), 1200);
        }
      } catch {
        // Storage unavailable: skip the tip.
      }
    }
    const unsubscribe = subscribeSimEvents((events) => {
      renderer.handleEvents(events);
      if (events.some((e) => e.type === 'eggLaid')) sound.play('chime');
      if (events.some((e) => e.type === 'hatched')) sound.play('bubble');
    });
    return () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      unsubscribe();
      observer.disconnect();
      renderer.stop();
      rendererRef.current = null;
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    clearHold();
    const gesture = handleTankPress(renderer, e.clientX, e.clientY);
    gestureRef.current = gesture;
    if (gesture) e.currentTarget.setPointerCapture(e.pointerId);
    if (gesture?.kind === 'hold') {
      const canvas = e.currentTarget;
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        if (gestureRef.current !== gesture) return;
        // Picked up: the card opens, the piece lifts, and dragging now moves it.
        useGameStore.getState().selectDecor(gesture.id);
        renderer.liftDecor(gesture.id);
        navigator.vibrate?.(15);
        sound.play('bubble');
        canvas.style.cursor = 'grabbing';
        gestureRef.current = { kind: 'decor', id: gesture.id, grabOffset: gesture.grabOffset, startClientX: gesture.startClientX, dragging: true };
      }, DECOR_LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const gesture = gestureRef.current;
    const point = renderer.toTank(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') renderer.setPointer(point);

    if (gesture?.kind === 'sponge') {
      if (useGameStore.getState().mode !== 'clean') return;
      sponge(renderer, gesture.last, point);
      gesture.last = point;
      return;
    }
    if (gesture?.kind === 'hold') {
      // Moving before the hold completes means the finger is looking around, not picking up.
      if (Math.hypot(e.clientX - gesture.startClientX, e.clientY - gesture.startClientY) < LONG_PRESS_SLOP_PX) return;
      clearHold();
      gestureRef.current = renderer.canPan ? { kind: 'pan', lastClientX: e.clientX } : null;
      return;
    }
    if (gesture?.kind === 'pan') {
      renderer.panBy(e.clientX - gesture.lastClientX);
      gesture.lastClientX = e.clientX;
      return;
    }
    if (gesture?.kind === 'decor') {
      if (!gesture.dragging && Math.abs(e.clientX - gesture.startClientX) < DRAG_THRESHOLD_PX) return;
      if (!gesture.dragging) renderer.liftDecor(gesture.id);
      gesture.dragging = true;
      e.currentTarget.style.cursor = 'grabbing';
      useGameStore.getState().moveDecor(gesture.id, point.x - gesture.grabOffset);
      return;
    }
    // Hover: decor glows and the cursor hints it can be grabbed (look mode only; other modes use their CSS cursors).
    const look = useGameStore.getState().mode === 'look';
    const hover = look && e.pointerType === 'mouse' && !renderer.fishAt(point.x, point.y) ? renderer.decorAt(point.x, point.y) : null;
    renderer.setHoverDecor(hover);
    // Only a picked-up piece can be grabbed straight away; others need a hold.
    e.currentTarget.style.cursor = !hover ? '' : hover === useGameStore.getState().selectedDecorId ? 'grab' : 'pointer';
  };

  const endGesture = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    clearHold();
    if (gesture?.kind === 'hold' && e.type === 'pointerup' && !holdTipShownRef.current) {
      holdTipShownRef.current = true;
      useGameStore.getState().addToast('Hold a decoration to move it ✋');
    }
    if (gesture?.kind === 'decor') {
      e.currentTarget.style.cursor = '';
      if (gesture.dragging) {
        rendererRef.current?.dropDecor(gesture.id);
        sound.play('plop');
      }
    }
    gestureRef.current = null;
  };

  return (
    <div className="tank" ref={containerRef} data-onboarding="tank">
      <canvas
        ref={canvasRef}
        className="tank-canvas"
        data-mode={mode}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onPointerLeave={() => {
          rendererRef.current?.setPointer(null);
          rendererRef.current?.setHoverDecor(null);
        }}
      />
      <DailyGift />
    </div>
  );
}
