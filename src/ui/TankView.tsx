// Hosts the tank canvas and the renderer. React never draws fish; it only mounts the canvas
// and routes input: collect a drop > sponge (Clean) / drop food (Feed/Premium) > fish (tap, double-tap trick,
// hold to pet) > decor (hold to pick up, then drag). Keyboard: arrows pick a fish, hold Space to pet it.
import { useEffect, useRef } from 'react';
import {
  BOND,
  DECOR,
  DECOR_SIZE_SCALE,
  DECOR_SNAP_DIST,
  TANK_WIDTH,
  DECOR_LONG_PRESS_MS,
  DOUBLE_TAP_MS,
  DRAG_THRESHOLD_PX,
  LONG_PRESS_SLOP_PX,
  PAN_TIP_KEY,
  PET_HOLD_MS,
  PET_TIP_KEY,
  SAND_Y,
  XP,
} from '../game/constants';
import { playableTricks } from '../game/bond';
import { decorBox } from '../render/drawSprites';
import { snapX } from '../render/snap';
import type { PlacedDecor } from '../game/types';
import { dailyGiftAvailable, localDateKey } from '../game/economy';
import { algaeTouchedBySponge } from '../game/sim';
import { sound } from '../audio/sound';
import { breedingQuestStep, breedingUnlocked, compatiblePartners, isReadyToPair } from '../game/breeding';
import { Renderer, type BreedingView } from '../render/renderer';
import { subscribeBondEvents, subscribeSimEvents, useGameStore } from '../store/gameStore';
import { DailyGift } from './DailyGift';
import { HUD_BUMP_EVENT } from './Hud';

type Point = { x: number; y: number };

/** What a press in the tank started. */
type Gesture =
  | { kind: 'sponge'; last: Point }
  | { kind: 'decor'; id: string; grabOffset: number; startClientX: number; dragging: boolean; snap?: boolean }
  /** Dragging the shop's "Try it" ghost along its line. */
  | { kind: 'try'; grabOffset: number }
  /** A press on decor that isn't picked up yet: it only moves if held for DECOR_LONG_PRESS_MS. */
  | { kind: 'hold'; id: string; grabOffset: number; startClientX: number; startClientY: number }
  | { kind: 'pan'; lastClientX: number }
  /** A press on a fish: a tap on release, or petting once held for PET_HOLD_MS. */
  | { kind: 'press'; fishId: string; startClientX: number; startClientY: number }
  | { kind: 'pet'; fishId: string }
  | null;

/** The last fish tap (two quick taps on a Friendly+ fish play a trick). */
let lastTap: { fishId: string; at: number } | null = null;
/** Which trick a double-tap plays next, per fish (they take turns). */
const nextTrick = new Map<string, number>();

/** Two fingers landing (and lifting) within this long is a tap: undo in Decorate mode. */
const TWO_FINGER_TAP_MS = 300;

/** Decorate mode: line the dragged item up with the tank center or another item when close. */
function snapDecor(placedId: string, x: number): { x: number; guide: number | null } {
  const { game } = useGameStore.getState();
  const tank = game.tanks.find((t) => t.id === game.activeTankId);
  const me = tank?.decor.find((d) => d.id === placedId);
  if (!tank || !me) return { x, guide: null };
  const half = (d: PlacedDecor) => (decorBox(d.decorId)[0] * DECOR_SIZE_SCALE[d.size]) / 2;
  const line = DECOR[me.decorId].placement;
  const others = tank.decor.filter((d) => d.id !== placedId && DECOR[d.decorId].placement === line).map((d) => ({ x: d.x, half: half(d) }));
  return snapX(x, half(me), others, TANK_WIDTH / 2, DECOR_SNAP_DIST);
}

/** "Tip: press and hold to pet 💕", once, the first time a returning player taps a fish. */
function showPetTip(): void {
  if (useGameStore.getState().onboardingStep !== null) return;
  try {
    if (localStorage.getItem(PET_TIP_KEY)) return;
    localStorage.setItem(PET_TIP_KEY, '1');
  } catch {
    return;
  }
  useGameStore.getState().addToast('Tip: press and hold to pet 💕');
}

/** A tap on a fish (released before the pet hold): quick actions, the full card on a second tap, or a trick on a double-tap. */
function tapFish(fishId: string): void {
  const store = useGameStore.getState();
  const now = Date.now();
  const fish = store.game.fish.find((f) => f.id === fishId);
  const tricks = fish ? playableTricks(fish) : [];
  if (lastTap?.fishId === fishId && now - lastTap.at < DOUBLE_TAP_MS && tricks.length > 0) {
    lastTap = null;
    const i = nextTrick.get(fishId) ?? 0;
    // Try each trick in turn until one is off cooldown.
    for (let k = 0; k < tricks.length; k++) {
      const trick = tricks[(i + k) % tricks.length]!;
      if (store.playTrick(fishId, trick)) {
        nextTrick.set(fishId, (i + k + 1) % tricks.length);
        sound.play('bubble');
        break;
      }
    }
    return;
  }
  lastTap = { fishId, at: now };
  showPetTip();
  // Tapping the same fish again opens its full card; the first tap shows quick actions next to it.
  if (store.quickFishId === fishId) store.selectFish(fishId);
  else store.showQuickActions(fishId);
}

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

  // "Try it": the ghost follows the finger until Buy & Place or Cancel.
  if (store.tryDecor) return { kind: 'try', grabOffset: x - store.tryDecor.x };

  // Decorate mode: decor is grabbed straight away (no hold); fish are just scenery.
  if (store.mode === 'decorate') {
    const decorId = renderer.decorAt(x, y);
    if (decorId) {
      const placed = store.game.tanks.find((t) => t.id === store.game.activeTankId)?.decor.find((d) => d.id === decorId);
      store.selectDecor(decorId);
      return { kind: 'decor', id: decorId, grabOffset: x - (placed?.x ?? x), startClientX: clientX, dragging: false, snap: true };
    }
    store.selectDecor(null);
    return renderer.canPan ? { kind: 'pan', lastClientX: clientX } : null;
  }

  // Pairing mode: tap a glowing fish to choose it, anything else cancels.
  if (store.pairingFishId) {
    const fishId = renderer.fishAt(x, y);
    if (fishId && fishId !== store.pairingFishId) store.pickPartner(fishId);
    else if (!fishId) store.cancelPairing();
    return null;
  }

  // Hand-feeding: fish close to where the pellet drops earn a little bond when they eat it.
  const nearFish = () => renderer.fishNear(x, y, BOND.feedRadius);

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
    const dropped = store.dropPellet(x, premium, nearFish());
    if (dropped) sound.play('plop');
    if (dropped && premium && useGameStore.getState().game.inventory.premiumFood === 0) {
      store.addToast('That was your last premium food 🌟');
      store.setMode('feed');
    }
    // On tall screens a drag after the tap pans the view.
    if (renderer.canPan) return { kind: 'pan', lastClientX: clientX };
    return null;
  }

  const fishId = renderer.fishToPet(x, y);
  if (fishId) {
    renderer.poke(fishId);
    sound.play('bubble');
    // Decided on release (tap) or after the hold (pet).
    return { kind: 'press', fishId, startClientX: clientX, startClientY: clientY };
  }

  const decorId = renderer.decorAt(x, y);
  if (decorId) {
    const placed = store.game.tanks.find((t) => t.id === store.game.activeTankId)?.decor.find((d) => d.id === decorId);
    // The mailbox's flag is up when the daily gift is waiting: tapping it opens the gift.
    if (placed?.decorId === 'mailbox' && decorId !== store.selectedDecorId && dailyGiftAvailable(store.game, localDateKey(new Date()))) {
      const gift = store.claimDailyGift();
      if (gift) {
        sound.play('coin');
        store.addToast(`📬 Daily gift: +${gift.shells} 🐚 · +${gift.premiumFood} 🌟${gift.pearls > 0 ? ` · +${gift.pearls} ⚪` : ''}`);
        return null;
      }
    }
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
  // Curious+ fish nearby swim over to say hi.
  renderer.sayHi(x, y);
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
      getDecorView: () => {
        const s = useGameStore.getState();
        return { decorating: s.mode === 'decorate', tryDecor: s.tryDecor, stylePreview: s.stylePreview };
      },
      onPetComplete: (fishId) => {
        const result = useGameStore.getState().petFish(fishId);
        if (result) {
          sound.play('bloop');
          navigator.vibrate?.(12);
        }
        return result;
      },
      onPetProgress: (fishId, progress) =>
        useGameStore.getState().setPetProgress(progress === null ? null : { fishId, pct: Math.floor(progress * 10) * 10 }),
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
    const unsubscribeBond = subscribeBondEvents((e) => {
      if (e.type === 'levelUp') {
        renderer.celebrateBond(e.fishId, e.to);
        sound.play('chime');
      } else if (e.type === 'trick') {
        if (e.trick !== 'follow') renderer.playTrick(e.fishId, e.trick);
      } else if (e.type === 'follow') {
        renderer.setFollow(e.fishId, e.until);
      } else {
        renderer.greet(e.fishIds);
      }
    });
    return () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      unsubscribe();
      unsubscribeBond();
      observer.disconnect();
      renderer.stop();
      rendererRef.current = null;
    };
  }, []);

  /** Touches down right now (Decorate mode: a quick two-finger tap undoes). */
  const touchesRef = useRef(new Map<number, number>());
  const twoFingerRef = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (e.pointerType === 'touch') {
      const touches = touchesRef.current;
      touches.set(e.pointerId, performance.now());
      if (touches.size === 2 && useGameStore.getState().mode === 'decorate' && performance.now() - Math.min(...touches.values()) < TWO_FINGER_TAP_MS) {
        // A second finger: this is a two-finger tap, not a drag.
        twoFingerRef.current = performance.now();
        gestureRef.current = null;
        renderer.setSnapGuide(null);
        return;
      }
    }
    clearHold();
    const gesture = handleTankPress(renderer, e.clientX, e.clientY);
    gestureRef.current = gesture;
    if (gesture) e.currentTarget.setPointerCapture(e.pointerId);
    if (gesture?.kind === 'press') {
      const point = renderer.toTank(e.clientX, e.clientY);
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        if (gestureRef.current !== gesture) return;
        // Held: start petting (the quick actions step aside so the fish stays visible).
        if (!renderer.petStart(gesture.fishId, point)) return;
        useGameStore.getState().showQuickActions(null);
        navigator.vibrate?.(10);
        gestureRef.current = { kind: 'pet', fishId: gesture.fishId };
      }, PET_HOLD_MS);
    }
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
    if (gesture?.kind === 'pet') {
      renderer.petMove(point);
      return;
    }
    if (gesture?.kind === 'press') {
      if (Math.hypot(e.clientX - gesture.startClientX, e.clientY - gesture.startClientY) < LONG_PRESS_SLOP_PX) return;
      clearHold();
      // Moving before the hold completes: on tall screens the finger is looking around (pan); elsewhere
      // there's nothing to pan, so it's someone eagerly stroking the fish: start petting right away.
      if (renderer.canPan) {
        gestureRef.current = { kind: 'pan', lastClientX: e.clientX };
      } else if (renderer.petStart(gesture.fishId, point)) {
        useGameStore.getState().showQuickActions(null);
        gestureRef.current = { kind: 'pet', fishId: gesture.fishId };
      } else {
        gestureRef.current = null;
      }
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
    if (gesture?.kind === 'try') {
      useGameStore.getState().moveTry(point.x - gesture.grabOffset);
      return;
    }
    if (gesture?.kind === 'decor') {
      if (!gesture.dragging && Math.abs(e.clientX - gesture.startClientX) < DRAG_THRESHOLD_PX) return;
      if (!gesture.dragging) {
        renderer.liftDecor(gesture.id);
        // One undo step per drag.
        if (gesture.snap) useGameStore.getState().recordDecor();
      }
      gesture.dragging = true;
      e.currentTarget.style.cursor = 'grabbing';
      let x = point.x - gesture.grabOffset;
      if (gesture.snap) {
        const snapped = snapDecor(gesture.id, x);
        x = snapped.x;
        renderer.setSnapGuide(snapped.guide);
      }
      useGameStore.getState().moveDecor(gesture.id, x);
      return;
    }
    // Hover: decor glows and the cursor hints it can be grabbed (look mode only; other modes use their CSS cursors).
    const look = useGameStore.getState().mode === 'look';
    const hover = look && e.pointerType === 'mouse' && !renderer.fishAt(point.x, point.y) ? renderer.decorAt(point.x, point.y) : null;
    renderer.setHoverDecor(hover);
    // Only a picked-up piece can be grabbed straight away; others need a hold.
    e.currentTarget.style.cursor = !hover ? '' : hover === useGameStore.getState().selectedDecorId ? 'grab' : 'pointer';
  };

  /** Space is held down on a fish (keyboard petting). */
  const keyPetRef = useRef(false);

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    const store = useGameStore.getState();
    if (!renderer || store.mode !== 'look' || store.breakSession || store.pairingFishId) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Cycle through the fish in this tank.
      const ids = store.game.fish.filter((f) => f.tankId === store.game.activeTankId).map((f) => f.id);
      if (ids.length === 0) return;
      e.preventDefault();
      const current = ids.indexOf(store.quickFishId ?? store.selectedFishId ?? '');
      const step = e.key === 'ArrowRight' ? 1 : -1;
      const next = ids[(current + step + ids.length) % ids.length] ?? ids[0]!;
      if (current === -1 && step < 0) store.showQuickActions(ids[ids.length - 1]!);
      else store.showQuickActions(next);
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      const fishId = store.quickFishId ?? store.selectedFishId;
      if (e.repeat || keyPetRef.current || !fishId) return;
      keyPetRef.current = renderer.petStart(fishId, null);
    }
  };

  const onKeyUp = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key !== ' ' || !keyPetRef.current) return;
    keyPetRef.current = false;
    rendererRef.current?.petEnd();
  };

  const endGesture = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const touches = touchesRef.current;
    touches.delete(e.pointerId);
    const twoAt = twoFingerRef.current;
    if (twoAt !== null) {
      if (touches.size === 0) {
        twoFingerRef.current = null;
        if (e.type === 'pointerup' && performance.now() - twoAt < TWO_FINGER_TAP_MS * 2) useGameStore.getState().undoDecor();
      }
      return;
    }
    const gesture = gestureRef.current;
    clearHold();
    if (gesture?.kind === 'press' && e.type === 'pointerup') tapFish(gesture.fishId);
    if (gesture?.kind === 'pet') rendererRef.current?.petEnd();
    if (gesture?.kind === 'hold' && e.type === 'pointerup' && !holdTipShownRef.current) {
      holdTipShownRef.current = true;
      useGameStore.getState().addToast('Hold a decoration to move it ✋');
    }
    if (gesture?.kind === 'decor') {
      rendererRef.current?.setSnapGuide(null);
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
        tabIndex={0}
        aria-label="Fish tank. Arrow keys pick a fish, hold Space to pet it."
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          if (keyPetRef.current) rendererRef.current?.petEnd();
          keyPetRef.current = false;
        }}
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
