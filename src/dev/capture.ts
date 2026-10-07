// Trailer capture mode: dev-only hooks on `window.__fishbowl.capture`. main.tsx imports this inside `import.meta.env.DEV`, so it
// is stripped from production builds. The recorder (scripts/trailer/record.ts) injects scripts/trailer/inject.js first, which owns
// the virtual clock (`window.__vclock`) and the seeded RNG; this module adds everything scene scripts need on top of it:
//   prepare()   hide dev UI, force high quality, mute, soft custom pointer
//   load()      build a game state from a small spec (fish, decor, theme, level…)
//   place()     put a fish where the shot needs it
//   pointer     scripted taps / press-and-hold / drags along eased paths (synthetic pointer events, in virtual time)
//   camera      slow push-ins / pans on the tank canvas (CSS transform; the HUD stays put)
//   events      shell drops, level-up, egg hatch, courtship, rescue stage complete…
//   step(ms)    advance virtual time (timers, animation frames, CSS animations) by exactly `ms`
import type { Renderer } from '../render/renderer';
import type { FishActor } from '../render/behavior';
import type { useGameStore as UseGameStore } from '../store/gameStore';
import type * as TestUtils from '../game/testUtils';
import { startCourtship } from '../game/breeding';
import { planeConfig } from '../game/decor';
import { SAND_Y } from '../game/constants';
import type { DecorId, Fish, GameState, PlacedDecor, SpeciesId, Stage, ThemeId } from '../game/types';

type Store = typeof UseGameStore;
type Utils = typeof TestUtils;
type Ease = 'linear' | 'inOut' | 'out' | 'in';
interface VClock {
  now: number;
  hooks: Array<(ms: number, t: number) => void>;
  step(ms: number): Promise<void>;
  run(ms: number, dt?: number): Promise<void>;
  realWait(ms: number): Promise<void>;
}

export interface FishSpec {
  species: SpeciesId;
  stage?: Exclude<Stage, 'egg'>;
  variant?: string;
  shiny?: boolean;
  name?: string;
  bond?: number;
  hunger?: number;
  happiness?: number;
  /** Tank units; omit to let it wander from wherever the renderer spawns it. */
  x?: number;
  y?: number;
}
export interface DecorSpec {
  id: DecorId;
  x: number;
  z?: number;
  size?: 'S' | 'M' | 'L';
  flipped?: boolean;
}
export interface SceneSpec {
  fish?: FishSpec[];
  decor?: DecorSpec[];
  theme?: ThemeId;
  level?: number;
  shells?: number;
  pearls?: number;
  xp?: number;
  /** Tank style ids (frame, substrate, lighting, water, bubbler). */
  style?: Partial<Record<'frame' | 'substrate' | 'lighting' | 'water' | 'bubbler', string>>;
  /** Hour of day 0..24 (null = follow the clock). */
  hour?: number | null;
  /** Free decor box contents. */
  box?: DecorId[];
  eggs?: { species: SpeciesId; variant?: string; shiny?: boolean; x: number; hatchInMs: number }[];
}

type PointerStep =
  | { type: 'move'; to: Target; ms: number; ease?: Ease }
  | { type: 'down' }
  | { type: 'up' }
  | { type: 'wait'; ms: number }
  | { type: 'hide' }
  | { type: 'show' };
/** A point in tank units, or a fish (follows it as it swims). */
type Target = { x: number; y: number } | { fish: string; dx?: number; dy?: number };

const EASE: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function installCapture(deps: { store: Store; utils: Utils; renderer: () => Renderer | null }) {
  const { store, utils } = deps;
  const vclock = (): VClock => (window as unknown as { __vclock: VClock }).__vclock;
  const R = () => {
    const r = deps.renderer();
    if (!r) throw new Error('renderer not ready');
    return r;
  };
  const canvas = () => document.querySelector<HTMLCanvasElement>('canvas.tank-canvas, .tank canvas, canvas')!;
  const actorOf = (id: string) => (R() as unknown as { actors: Map<string, FishActor> }).actors.get(id);
  const byName = (name: string): Fish | undefined => store.getState().game.fish.find((f) => f.name === name);

  // ---------------------------------------------------------------- prepare
  let cursorEl: HTMLDivElement | null = null;
  const setCss = () => {
    if (document.getElementById('capture-style')) return;
    const style = document.createElement('style');
    style.id = 'capture-style';
    style.textContent = `
      *, *::before, *::after { cursor: none !important; caret-color: transparent; }
      .dev-panel, .dev-toggle, .sync-indicator, vite-error-overlay, .goal-chip, .coachmark, .toasts { display: none !important; }
      html.cap-hide-ui .app > :not(.tank):not(.tank-wrap):not(canvas):not(.cap-keep) { visibility: hidden !important; }
      html.cap-hide-hud .hud { visibility: hidden !important; }
      html.cap-hide-dock .toolbar, html.cap-hide-dock .dock, html.cap-hide-dock .tool-dock { visibility: hidden !important; }
      #capture-cursor { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none; transition: none; }
      #capture-cursor .dot { position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; border-radius: 50%;
        background: radial-gradient(circle at 40% 34%, rgba(255,255,255,.98), rgba(226,240,255,.7) 58%, rgba(170,205,245,.5));
        border: 3px solid #fff; box-shadow: 0 5px 16px rgba(8,30,60,.45), 0 0 0 2px rgba(40,80,130,.35), inset 0 -5px 8px rgba(90,140,200,.35);
        transform: scale(var(--press, 1)); }
      #capture-cursor .ring { position: absolute; left: -34px; top: -34px; width: 68px; height: 68px; border-radius: 50%;
        border: 3px solid rgba(255,255,255,.75); opacity: var(--ring, 0); transform: scale(var(--ringScale, .6)); }
    `;
    document.head.appendChild(style);
  };

  const prepare = (opts: { quality?: 'high' } = {}) => {
    setCss();
    if (!cursorEl) {
      cursorEl = document.createElement('div');
      cursorEl.id = 'capture-cursor';
      cursorEl.innerHTML = '<div class="ring"></div><div class="dot"></div>';
      cursorEl.style.display = 'none';
      document.body.appendChild(cursorEl);
    }
    const c = canvas();
    // Synthetic pointer ids have no real pointer behind them: capturing would throw and abort the game's handler.
    c.setPointerCapture = () => undefined;
    c.releasePointerCapture = () => undefined;
    store.setState({ onboardingStep: null });
    R().setQuality(opts.quality ?? 'high');
    return true;
  };

  // ---------------------------------------------------------------- state
  let seq = 0;
  const load = (spec: SceneSpec) => {
    const now = Date.now();
    const fish: Fish[] = (spec.fish ?? []).map((f) => {
      seq += 1;
      const base = utils.makeFish({
        speciesId: f.species,
        stage: f.stage ?? 'adult',
        growth: f.stage === 'baby' ? 0 : f.stage === 'juvenile' ? 99 : 99999,
        hunger: f.hunger ?? 80,
        happiness: f.happiness ?? 92,
        bornAt: now - 1e7,
        lastDropAt: now,
        lastBredAt: null,
        shiny: f.shiny ?? false,
        ...(f.variant ? { variant: f.variant } : {}),
        ...(f.name ? { name: f.name } : {}),
        ...(f.bond != null ? { bondPoints: f.bond } : {}),
      });
      return { ...base, id: `cap-${seq}-${f.species}`, tankId: 'tank-1' };
    });
    const placed: PlacedDecor[] = (spec.decor ?? []).map((d, i) => ({
      id: `cd${i}-${d.id}`,
      decorId: d.id,
      x: d.x,
      flipped: d.flipped ?? false,
      size: d.size ?? 'M',
      z: d.z ?? 0.5,
    }));
    const eggs = (spec.eggs ?? []).map((e, i) => ({
      id: `cap-egg-${i}`,
      speciesId: e.species,
      variant: e.variant ?? 'orange',
      shiny: e.shiny ?? false,
      tankId: 'tank-1',
      hatchAt: now + e.hatchInMs,
      x: e.x,
    }));
    const tank = { name: 'Sunny Bowl', capacity: 40, theme: spec.theme ?? 'classic', decor: placed, ...(spec.style ? { style: { ...utils.makeTank().style, ...spec.style } } : {}) };
    const state = utils.makeState({
      fish,
      tank: tank as never,
      overrides: {
        level: spec.level ?? 12,
        xp: spec.xp ?? 0,
        shells: spec.shells ?? 1240,
        pearls: spec.pearls ?? 7,
        lastTickAt: now,
        lastDailyGift: new Date().toISOString().slice(0, 10),
        eggs: eggs as never,
        decorInventory: Object.fromEntries((spec.box ?? []).map((d) => [d, 1])),
        ownedStyles: [],
      } as Partial<GameState>,
    });
    store.getState().loadState(state);
    store.setState({ onboardingStep: null, mode: 'look', panel: null, selectedFishId: null, toasts: [] } as never);
    R().setHour(spec.hour === undefined ? 12 : spec.hour);
    // Put fish where the shot wants them (the renderer made their actors on its next frame).
    return fish.map((f, i) => ({ id: f.id, name: f.name, spec: spec.fish![i]! }));
  };

  /** After the renderer has spawned actors (one step), pin start positions for fish that asked for them. */
  const settle = (specs: { id: string; spec: FishSpec }[]) => {
    for (const { id, spec } of specs) {
      if (spec.x == null) continue;
      place(id, spec.x, spec.y ?? 300);
    }
  };
  const place = (idOrName: string, x: number, y: number, facing?: 1 | -1) => {
    const f = store.getState().game.fish.find((q) => q.id === idOrName || q.name === idOrName);
    const a = f && actorOf(f.id);
    if (!a) return false;
    a.x = x;
    a.y = y;
    a.targetX = x + (facing ?? 1) * 120;
    a.targetY = y;
    if (facing) {
      a.facing = facing;
      a.heading = facing > 0 ? 0 : Math.PI;
    }
    return true;
  };
  const setHour = (h: number | null) => R().setHour(h);
  /** Keep a fish swimming toward a point (the end-card fish that "swims across"). */
  const swimming = new Map<string, { x: number; y: number }>();
  const swimTo = (name: string, x: number, y: number) => {
    const f = byName(name);
    if (f) swimming.set(f.id, { x, y });
  };
  const setTheme = (t: ThemeId) => store.getState().dev.setTheme(t);
  const quality = (q: 'low' | 'medium' | 'high' | null) => R().setQuality(q);

  // ---------------------------------------------------------------- UI visibility
  const ui = {
    all: (visible: boolean) => document.documentElement.classList.toggle('cap-hide-ui', !visible),
    hud: (visible: boolean) => document.documentElement.classList.toggle('cap-hide-hud', !visible),
    dock: (visible: boolean) => document.documentElement.classList.toggle('cap-hide-dock', !visible),
  };

  // ---------------------------------------------------------------- camera
  const cam = { z: 1, fx: 0.5, fy: 0.5 };
  const applyCam = () => {
    const c = canvas();
    const w = c.offsetWidth;
    const h = c.offsetHeight;
    const tx = cam.fx * w * (1 - cam.z);
    const ty = cam.fy * h * (1 - cam.z);
    c.style.transformOrigin = '0 0';
    c.style.transform = cam.z === 1 ? '' : `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${cam.z.toFixed(5)})`;
  };
  let camTween: { from: typeof cam; to: typeof cam; t: number; ms: number; ease: Ease } | null = null;
  const camera = {
    set: (z: number, fx = 0.5, fy = 0.5) => {
      camTween = null;
      Object.assign(cam, { z, fx, fy });
      applyCam();
    },
    /** Glide to zoom `z` about the viewport point (fx, fy) (fractions 0..1). */
    to: (z: number, fx: number, fy: number, ms: number, ease: Ease = 'inOut') => {
      camTween = { from: { ...cam }, to: { z, fx, fy }, t: 0, ms: Math.max(1, ms), ease };
    },
    /** Focus a fish (viewport fractions at this moment). */
    focusFish: (name: string, z: number, ms: number, ease: Ease = 'inOut') => {
      const f = byName(name);
      const p = f && R().fishScreenPoint(f.id);
      if (!p) return false;
      const c = canvas();
      const rect = c.getBoundingClientRect();
      const fx = clamp01((p.x - rect.left) / (c.offsetWidth * cam.z) + 0);
      const fy = clamp01((p.y - rect.top) / (c.offsetHeight * cam.z) + 0);
      camera.to(z, fx, fy, ms, ease);
      return true;
    },
    get state() {
      return { ...cam };
    },
  };

  // ---------------------------------------------------------------- pointer
  let cur = { cx: -999, cy: -999 };
  let pressed = false;
  let queue: PointerStep[] = [];
  let active: { step: PointerStep; t: number; from?: { cx: number; cy: number } } | null = null;
  let shown = false;
  let ringT = 0;

  const resolve = (t: Target): { cx: number; cy: number } => {
    if ('fish' in t) {
      const f = byName(t.fish);
      const p = f && R().fishScreenPoint(f.id);
      if (!p) return { ...cur };
      return { cx: p.x + (t.dx ?? 0), cy: p.y + (t.dy ?? 0) };
    }
    const p = R().tankToClient(t.x, t.y);
    return { cx: p.x, cy: p.y };
  };
  const fire = (type: 'pointerdown' | 'pointermove' | 'pointerup') => {
    canvas().dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : pressed || type === 'pointerdown' ? 1 : 0,
        clientX: cur.cx,
        clientY: cur.cy,
      }),
    );
  };
  const drawCursor = () => {
    if (!cursorEl) return;
    cursorEl.style.display = shown ? 'block' : 'none';
    const c = canvas();
    const rect = c.getBoundingClientRect();
    const z = c.offsetWidth ? rect.width / c.offsetWidth : 1;
    // Events are aimed through the canvas' own (transformed) rect; the picture is zoomed by z around its left/top.
    const vx = rect.left + (cur.cx - rect.left) * z;
    const vy = rect.top + (cur.cy - rect.top) * z;
    cursorEl.style.transform = `translate(${vx.toFixed(1)}px, ${vy.toFixed(1)}px)`;
    cursorEl.style.setProperty('--press', pressed ? '0.74' : '1');
    cursorEl.style.setProperty('--ring', pressed ? String(0.55 * (1 - (ringT % 700) / 700)) : '0');
    cursorEl.style.setProperty('--ringScale', String(0.55 + ((ringT % 700) / 700) * 0.7));
  };

  const advancePointer = (ms: number) => {
    let left = ms;
    while (left > 0) {
      if (!active) {
        const next = queue.shift();
        if (!next) break;
        active = { step: next, t: 0 };
        if (next.type === 'move') active.from = { ...cur };
        if (next.type === 'down') {
          shown = true;
          pressed = true;
          ringT = 0;
          fire('pointerdown');
          active = null;
          continue;
        }
        if (next.type === 'up') {
          fire('pointerup');
          pressed = false;
          active = null;
          continue;
        }
        if (next.type === 'hide' || next.type === 'show') {
          shown = next.type === 'show';
          active = null;
          continue;
        }
      }
      const s = active!.step;
      const dur = s.type === 'move' || s.type === 'wait' ? s.ms : 0;
      const use = Math.min(left, dur - active!.t);
      active!.t += use;
      left -= use;
      if (s.type === 'move') {
        if (active!.t <= use && !shown) {
          // First move of the session: appear at the start point.
          shown = true;
        }
        const k = EASE[s.ease ?? 'inOut'](clamp01(active!.t / s.ms));
        const to = resolve(s.to);
        const from = active!.from!;
        if (cur.cx === -999) cur = { ...to };
        cur = { cx: from.cx + (to.cx - from.cx) * k, cy: from.cy + (to.cy - from.cy) * k };
        fire('pointermove');
      }
      if (active!.t >= dur) active = null;
    }
    if (pressed) ringT += ms;
  };
  /** Places the pointer instantly (no events), e.g. before the first move of a scene. */
  const jumpTo = (to: Target) => {
    cur = resolve(to);
    shown = true;
    drawCursor();
  };
  const pointer = {
    jumpTo,
    run: (steps: PointerStep[]) => {
      queue.push(...steps);
    },
    clear: () => {
      queue = [];
      active = null;
      if (pressed) {
        fire('pointerup');
        pressed = false;
      }
    },
    move: (to: Target, ms: number, ease: Ease = 'inOut') => queue.push({ type: 'move', to, ms, ease }),
    tap: (to: Target, travelMs = 450) => queue.push({ type: 'move', to, ms: travelMs }, { type: 'down' }, { type: 'wait', ms: 70 }, { type: 'up' }),
    /** Press, hold for `holdMs` (optionally stroking back and forth by `stroke` px), release. */
    hold: (to: Target, holdMs: number, travelMs = 450, stroke = 0) => {
      queue.push({ type: 'move', to, ms: travelMs }, { type: 'down' });
      if (stroke > 0 && 'fish' in to) {
        const strokes = Math.max(1, Math.round(holdMs / 700));
        for (let i = 0; i < strokes; i++) {
          queue.push({ type: 'move', to: { ...to, dx: stroke * (i % 2 ? -1 : 1) }, ms: holdMs / strokes });
        }
      } else queue.push({ type: 'wait', ms: holdMs });
      queue.push({ type: 'up' });
    },
    /** Press at `from`, glide to `to`, release (decor dragging). Holds first so the game's long-press lifts the piece. */
    drag: (from: Target, to: Target, ms: number, travelMs = 400, holdMs = 480) =>
      queue.push({ type: 'move', to: from, ms: travelMs }, { type: 'down' }, { type: 'wait', ms: holdMs }, { type: 'move', to, ms }, { type: 'wait', ms: 120 }, { type: 'up' }),
    hide: () => queue.push({ type: 'hide' }),
    show: () => queue.push({ type: 'show' }),
    get busy() {
      return active !== null || queue.length > 0;
    },
  };

  // ---------------------------------------------------------------- events
  /** Runs exactly one sim tick at the current virtual time (so a scripted moment lands on an exact frame). */
  const forceTick = () => {
    const now = Date.now();
    store.setState((s) => ({ game: { ...s.game, lastTickAt: now - 1000 } }));
    store.getState().advanceTo(now);
  };
  const events = {
    /** Shells on all three sand planes (value 3 each; `pearl` index becomes a pearl). */
    shellDrop: (xs: number[] = [170, 360, 520, 700, 860], planes: ('back' | 'mid' | 'front')[] = ['back', 'mid', 'front', 'mid', 'back'], pearl = -1) =>
      store.setState((s) => ({
        game: {
          ...s.game,
          tanks: s.game.tanks.map((t) =>
            t.id !== s.game.activeTankId
              ? t
              : { ...t, shells: xs.map((x, i) => ({ id: `cap-shell-${i}`, x, plane: planes[i % planes.length], value: i === pearl ? 1 : 3, pearl: i === pearl })) as never },
          ),
        },
      })),
    levelUp: (level: number) => {
      store.setState((s) => ({ game: { ...s.game, level }, pendingLevelUps: [...s.pendingLevelUps, level] }));
      confetti();
    },
    feedMode: (on: boolean) => store.getState().setMode(on ? 'feed' : 'look'),
    mode: (m: 'look' | 'feed' | 'decorate') => store.getState().setMode(m),
    /** Start a courtship between two named fish; it ends (egg laid) `endsInMs` from now. */
    courtship: (a: string, b: string, x: number, endsInMs: number) => {
      const fa = byName(a);
      const fb = byName(b);
      if (!fa || !fb) return false;
      const now = Date.now();
      const r = startCourtship(store.getState().game, fa.id, fb.id, now, x);
      const next = r.ok ? r.state : null;
      if (!next) return false;
      store.setState({ game: { ...next, courtships: next.courtships.map((c) => ({ ...c, endsAt: now + endsInMs })) } });
      return true;
    },
    /** Run the 1s sim tick right now (so a scripted moment lands on an exact frame). */
    tick: () => forceTick(),
    /** End courtships now and lay the eggs. */
    layEggs: () => {
      store.getState().dev.finishCourtships();
      forceTick();
    },
    hatchEggsNow: () => {
      store.getState().dev.hatchEggsNow();
      forceTick();
    },
    placeFromBox: (id: DecorId, x: number, z?: number) => store.getState().placeFromBox(id, x, z),
    rescueTake: (id: string) => {
      store.getState().dev.giveCareItems();
      store.getState().dev.startRescue(id);
    },
    careItem: (item: 'soft_food' | 'healing_moss' | 'vitamin_flakes', fishName?: string) => {
      const g = store.getState();
      const f = fishName ? byName(fishName) : g.game.fish.find((q) => q.rescue);
      if (!f) return false;
      g.selectCareItem(item);
      return g.giveCareItem(f.id);
    },
    rescueStageComplete: () => store.getState().dev.completeRescueStage(),
    toast: (text: string) => store.getState().addToast(text),
    dayAdvance: () => store.getState().dev.advanceDay(),
    playTrick: (name: string, trick: 'spin' | 'hoop' | 'signature') => {
      const f = byName(name);
      if (f) R().playTrick(f.id, trick as never);
    },
  };


  // ---------------------------------------------------------------- overlays: captions, end card, mock work screen
  type Layout = 'wide' | 'tall';
  const overlayCss = () => {
    if (document.getElementById('capture-overlay-style')) return;
    const st = document.createElement('style');
    st.id = 'capture-overlay-style';
    st.textContent = `
      #cap-caption { position: fixed; left: 50%; z-index: 2147483000; pointer-events: none; text-align: center; white-space: pre-wrap;
        font-family: 'Fredoka', 'Nunito Variable', sans-serif; font-weight: 700; color: #fff; line-height: 1.08; letter-spacing: .01em;
        -webkit-text-stroke: var(--cap-stroke, 12px) rgba(16, 52, 96, .88); paint-order: stroke fill;
        filter: drop-shadow(0 6px 10px rgba(6, 30, 70, .45)); transform: translateX(-50%); }
      #cap-caption.wide { bottom: 8.5%; font-size: 76px; --cap-stroke: 13px; max-width: 94%; white-space: nowrap; }
      #cap-caption.wide.top { bottom: auto; top: 15%; }
      #cap-caption.tall { top: 25%; font-size: 80px; --cap-stroke: 14px; max-width: 90%; }
      #cap-caption .in { display: inline-block; animation: capPop 380ms cubic-bezier(.2,.9,.3,1.2) both; }
      #cap-caption .out { display: inline-block; animation: capOut 180ms ease-in both; }
      .cap-dip { position: fixed; inset: 0; z-index: 2147481000; pointer-events: none; background: #06163a; opacity: 0; animation: capDip var(--dip, 700ms) ease-in-out both; }
      @keyframes capDip { 0% { opacity: 0 } 50% { opacity: .92 } 100% { opacity: 0 } }
      .cap-confetti { position: fixed; left: 50%; top: 52%; z-index: 2147482500; pointer-events: none; }
      .cap-confetti i { position: absolute; left: 0; top: 0; opacity: 0; animation: capConf 1900ms cubic-bezier(.15,.7,.3,1) forwards; }
      @keyframes capConf { 0% { transform: translate(0,0) rotate(0); opacity: 1 } 55% { opacity: 1 } 100% { transform: translate(var(--dx), calc(var(--dy) + 520px)) rotate(var(--rot)); opacity: 0 } }
      @keyframes capPop { 0% { transform: scale(.55) translateY(26px); opacity: 0 } 55% { transform: scale(1.09) translateY(-4px); opacity: 1 } 100% { transform: scale(1) translateY(0); opacity: 1 } }
      @keyframes capOut { to { transform: scale(.94) translateY(8px); opacity: 0 } }

      #cap-end { position: fixed; inset: 0; z-index: 2147482000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.2vmin;
        font-family: 'Fredoka', sans-serif; color: #fff; pointer-events: none; background: radial-gradient(ellipse at 50% 45%, rgba(10,60,110,.05), rgba(6,40,90,.55)); animation: capFade 600ms ease both; }
      #cap-end .logo { width: 17vmin; height: 17vmin; border-radius: 22%; box-shadow: 0 1.4vmin 4vmin rgba(4,30,70,.45); animation: capDrop 700ms cubic-bezier(.2,.9,.3,1.25) 150ms both; }
      #cap-end h1 { margin: 0; font-size: 12.5vmin; font-weight: 700; letter-spacing: .01em; -webkit-text-stroke: 1.4vmin rgba(14,50,98,.9); paint-order: stroke fill;
        filter: drop-shadow(0 .8vmin 1.2vmin rgba(4,30,70,.5)); animation: capDrop 700ms cubic-bezier(.2,.9,.3,1.25) 300ms both; }
      #cap-end .pill { font-size: 4.3vmin; font-weight: 600; padding: 1.2vmin 3.6vmin; border-radius: 99px; background: rgba(255,255,255,.95); color: #12508f;
        box-shadow: 0 .8vmin 2.4vmin rgba(4,30,70,.35); animation: capDrop 600ms cubic-bezier(.2,.9,.3,1.2) 700ms both; }
      #cap-end .url { font-size: 4.4vmin; font-weight: 600; -webkit-text-stroke: .9vmin rgba(14,50,98,.85); paint-order: stroke fill; animation: capDrop 600ms ease 1000ms both; }
      @keyframes capFade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes capDrop { from { transform: translateY(3vmin) scale(.9); opacity: 0 } to { transform: none; opacity: 1 } }
      .cap-blur .tank canvas { filter: blur(5px) saturate(1.1) brightness(.96); transition: filter 600ms ease; }

      #cap-desktop { position: fixed; inset: 0; z-index: 1; visibility: visible !important; background: #e9edf2; font-family: 'Nunito Variable', system-ui, sans-serif; color: #2b3340; overflow: hidden; }
      #cap-desktop .bar { height: 54px; background: #f7f8fa; border-bottom: 1px solid #d5dae1; display: flex; align-items: center; gap: 18px; padding: 0 22px; font-size: 21px; }
      #cap-desktop .dot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; margin-right: 6px; }
      #cap-desktop .title { font-weight: 800; font-size: 22px; }
      #cap-desktop .menu { height: 46px; background: #fff; border-bottom: 1px solid #d5dae1; display: flex; align-items: center; gap: 28px; padding: 0 24px; font-size: 19px; color: #4a5565; }
      #cap-desktop .fx { height: 44px; background: #fff; border-bottom: 1px solid #d5dae1; display: flex; align-items: center; padding: 0 18px; font-size: 19px; color: #5b6676; gap: 16px; }
      #cap-desktop .fx b { background: #eef1f5; padding: 4px 22px; border-radius: 6px; }
      #cap-desktop table { border-collapse: collapse; width: 100%; font-size: 19px; background: #fff; table-layout: fixed; }
      #cap-desktop th { background: #f1f3f6; color: #6a7585; font-weight: 700; border: 1px solid #dde1e7; height: 38px; }
      #cap-desktop td { border: 1px solid #e6e9ee; height: 38px; padding: 0 12px; white-space: nowrap; overflow: hidden; }
      #cap-desktop td.n { text-align: right; font-variant-numeric: tabular-nums; }
      #cap-desktop td.h { background: #eaf1fb; font-weight: 800; color: #2d4e83; }
      #cap-desktop td.rn { background: #f1f3f6; color: #6a7585; text-align: center; font-weight: 700; width: 56px; padding: 0; }
      #cap-desktop td.sel { outline: 3px solid #3a7be0; outline-offset: -3px; background: #f4f8ff; animation: capCell 2.4s steps(1) infinite; }
      #cap-desktop td.g { color: #1d8a55; } #cap-desktop td.r { color: #c4473a; }
      @keyframes capCell { 0% { outline-color: #3a7be0 } 50% { outline-color: transparent } }
      .cap-mini .tank { position: fixed !important; inset: auto !important; width: var(--mw) !important; height: var(--mh) !important; right: var(--mr) !important; bottom: var(--mb) !important;
        border-radius: 22px !important; overflow: hidden; z-index: 5; box-shadow: 0 18px 50px rgba(10,25,50,.45), 0 0 0 3px rgba(255,255,255,.9), 0 0 0 5px rgba(60,90,130,.35) !important;
        animation: capFloat 3.2s ease-in-out infinite; }
      .cap-mini .tank-frame { display: none !important; }
      @keyframes capFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-9px) } }
      #cap-minibar { visibility: visible !important; position: fixed; z-index: 6; height: 40px; width: var(--mw); right: var(--mr); bottom: calc(var(--mb) + var(--mh)); border-radius: 22px 22px 0 0; background: rgba(247,248,250,.97);
        display: flex; align-items: center; padding: 0 16px; gap: 8px; font: 700 19px 'Fredoka', sans-serif; color: #3b4a60; animation: capFloat 3.2s ease-in-out infinite; }
    `;
    document.head.appendChild(st);
  };

  /** Capture-only flourish for the level-up shot: the game has no confetti of its own. */
  const confetti = () => {
    overlayCss();
    const host = document.createElement('div');
    host.className = 'cap-confetti';
    const colors = ['#ff6b8b', '#ffd23f', '#5ce1e6', '#8e7dff', '#7bdc6a', '#ff9f43'];
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('i');
      const ang = (-90 + (Math.random() - 0.5) * 150) * (Math.PI / 180);
      const dist = 280 + Math.random() * 520;
      p.style.cssText = `--dx:${(Math.cos(ang) * dist).toFixed(0)}px;--dy:${(Math.sin(ang) * dist).toFixed(0)}px;--rot:${Math.round(Math.random() * 900 - 450)}deg;background:${colors[i % colors.length]};` +
        `width:${8 + Math.random() * 10}px;height:${12 + Math.random() * 12}px;animation-delay:${Math.round(Math.random() * 120)}ms;border-radius:${Math.random() < 0.3 ? '50%' : '3px'}`;
      host.appendChild(p);
    }
    document.body.appendChild(host);
    window.setTimeout(() => host.remove(), 2600);
  };

  /** A quick dip to dark (time passing); `peak` callback fires at the darkest moment. */
  const dip = (ms: number, atPeak: () => void) => {
    overlayCss();
    const el = document.createElement('div');
    el.className = 'cap-dip';
    el.style.setProperty('--dip', `${ms}ms`);
    document.body.appendChild(el);
    window.setTimeout(atPeak, ms / 2);
    window.setTimeout(() => el.remove(), ms + 50);
  };

  const caption = {
    show: (text: string, layout: Layout, pos: 'bottom' | 'top' = 'bottom') => {
      overlayCss();
      caption.hide(true);
      const el = document.createElement('div');
      el.id = 'cap-caption';
      el.className = `${layout}${pos === 'top' ? ' top' : ''}`;
      el.innerHTML = `<span class="in">${text}</span>`;
      document.body.appendChild(el);
    },
    hide: (instant = false) => {
      const el = document.getElementById('cap-caption');
      if (!el) return;
      if (instant) el.remove();
      else el.firstElementChild?.setAttribute('class', 'out');
    },
  };

  const endCard = {
    show: (opts: { name: string; url: string; tagline: string }) => {
      overlayCss();
      document.documentElement.classList.add('cap-blur', 'cap-hide-ui');
      document.getElementById('cap-end')?.remove();
      const el = document.createElement('div');
      el.id = 'cap-end';
      el.innerHTML = `<img class="logo" src="/icon.svg" alt=""><h1>${opts.name}</h1><div class="pill">${opts.tagline}</div><div class="url">${opts.url}</div>`;
      document.body.appendChild(el);
    },
    hide: () => {
      document.getElementById('cap-end')?.remove();
      document.documentElement.classList.remove('cap-blur');
    },
  };

  /** A made-up spreadsheet "work screen" with the live tank floating on top as a Mini Tank window. */
  const workScreen = {
    show: (layout: Layout) => {
      overlayCss();
      workScreen.hide();
      const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const head = ['Region', 'Owner', 'Q1', 'Q2', 'Q3', 'Q4', 'Total', 'Δ YoY', 'Status', 'Notes'];
      const owners = ['Maya', 'Jon', 'Priya', 'Leo', 'Sam', 'Ava', 'Noor', 'Kai', 'Zoe', 'Ben', 'Iris', 'Theo'];
      const regions = ['North', 'South', 'East', 'West', 'Central', 'Coastal', 'Metro', 'Valley', 'Harbor', 'Summit', 'Prairie', 'Island'];
      const status = ['On track', 'Review', 'On track', 'Behind', 'On track', 'Review'];
      const rows: string[] = [];
      for (let r = 0; r < 70; r++) {
        const q = [0, 1, 2, 3].map((i) => 40 + ((r * 37 + i * 53) % 90));
        const tot = q.reduce((a, b) => a + b, 0);
        const d = ((r * 7) % 19) - 6;
        const cells = [
          `<td class="rn">${r + 2}</td>`,
          `<td>${regions[r % 12]}</td>`,
          `<td>${owners[(r * 5) % 12]}</td>`,
          ...q.map((v, i) => `<td class="n${r === 5 && i === 1 ? ' sel' : ''}">${v}k</td>`),
          `<td class="n"><b>${tot}k</b></td>`,
          `<td class="n ${d >= 0 ? 'g' : 'r'}">${d >= 0 ? '+' : ''}${d}%</td>`,
          `<td>${status[r % 6]}</td>`,
          `<td>${r % 4 === 0 ? 'Follow up Friday' : ''}</td>`,
        ];
        rows.push(`<tr>${cells.join('')}</tr>`);
      }
      const el = document.createElement('div');
      el.id = 'cap-desktop';
      el.innerHTML = `
        <div class="bar"><span><i class="dot" style="background:#ff6b5f"></i><i class="dot" style="background:#ffc13b"></i><i class="dot" style="background:#2fd16a"></i></span><span class="title">Q3 Planning – Budget Tracker</span><span style="color:#7a8697">Saved</span></div>
        <div class="menu"><span>File</span><span>Edit</span><span>View</span><span>Insert</span><span>Format</span><span>Data</span><span>Tools</span><span>Help</span></div>
        <div class="fx"><b>C7</b><span>=SUM(C2:C6)</span></div>
        <table><thead><tr><th style="width:56px"></th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>
        <tr><td class="rn">1</td>${head.map((h) => `<td class="h">${h}</td>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
      el.classList.add('cap-keep');
      (document.querySelector('.app') ?? document.body).prepend(el);
      const wide = layout === 'wide';
      const root = document.documentElement;
      root.style.setProperty('--mw', wide ? '620px' : '470px');
      root.style.setProperty('--mh', wide ? '400px' : '620px');
      root.style.setProperty('--mr', wide ? '56px' : '305px');
      root.style.setProperty('--mb', wide ? '52px' : '150px');
      const bar = document.createElement('div');
      bar.id = 'cap-minibar';
      bar.className = 'cap-keep';
      bar.innerHTML = '<span style="font-size:22px">🐠</span><span>Mini Tank</span><span style="margin-left:auto;font-size:15px;color:#7a8aa0">always on top</span>';
      (document.querySelector('.app') ?? document.body).appendChild(bar);
      root.classList.add('cap-mini', 'cap-hide-ui');
    },
    hide: () => {
      document.getElementById('cap-desktop')?.remove();
      document.getElementById('cap-minibar')?.remove();
      document.documentElement.classList.remove('cap-mini');
    },
  };

  // ---------------------------------------------------------------- panning (portrait: the view is a slice of the tank)
  let panTween: { from: number; to: number; t: number; ms: number; ease: Ease } | null = null;
  const rr = () => R() as unknown as { camX: number; panMin: number; panMax: number };
  const pan = {
    /** Center the view on where most fish are right now (keeps portrait shots from framing empty water). */
    toCrowd: (ms = 0) => {
      const actors = [...(R() as unknown as { actors: Map<string, FishActor> }).actors.values()];
      if (!actors.length) return;
      pan.to(actors.reduce((a, f) => a + f.x, 0) / actors.length, ms);
    },
    /** Center the view on tank x (instantly, or glide over `ms`). */
    to: (x: number, ms = 0, ease: Ease = 'inOut') => {
      const r = rr();
      const target = Math.min(r.panMax, Math.max(r.panMin, x - (R() as unknown as { viewW: number }).viewW / 2));
      if (ms <= 0) {
        r.camX = target;
        panTween = null;
      } else panTween = { from: r.camX, to: target, t: 0, ms, ease };
    },
  };


  /** Where to tap the n-th shell/pearl on the sand (tank units, a little above its base so the tap lands on the sprite). */
  const dropTarget = (n: number) => {
    const g = store.getState().game;
    const tank = g.tanks.find((t) => t.id === g.activeTankId);
    const d = tank?.shells[n];
    if (!tank || !d) return null;
    const plane = planeConfig(tank.theme, (d as { plane?: 'back' | 'mid' | 'front' }).plane ?? 'mid');
    return { x: d.x, y: SAND_Y + plane.dy - 22 / (R() as unknown as { scale: number }).scale };
  };
  let hourTween: { from: number; to: number; t: number; ms: number; ease: Ease } | null = null;
  const hour = {
    to: (h: number, ms: number, ease: Ease = 'inOut') => {
      hourTween = { from: R().hourOverride ?? 12, to: h, t: 0, ms: Math.max(1, ms), ease };
    },
  };
  /** Makes the next ~`ms` of RNG draws tiny (a guaranteed shiny / parent-colour roll for one hatch). */
  let luckyUntil = 0;
  const realRandom = Math.random;
  const lucky = (ms: number) => {
    luckyUntil = t + ms;
    Math.random = () => (t < luckyUntil ? 0.004 : realRandom());
  };

  // ---------------------------------------------------------------- virtual time glue
  let t = 0;
  vclock().hooks.push((ms) => {
    t += ms;
    if (camTween) {
      camTween.t += ms;
      const k = EASE[camTween.ease](clamp01(camTween.t / camTween.ms));
      cam.z = camTween.from.z + (camTween.to.z - camTween.from.z) * k;
      cam.fx = camTween.from.fx + (camTween.to.fx - camTween.from.fx) * k;
      cam.fy = camTween.from.fy + (camTween.to.fy - camTween.from.fy) * k;
      applyCam();
      if (camTween.t >= camTween.ms) camTween = null;
    }
    if (hourTween) {
      hourTween.t += ms;
      R().setHour(hourTween.from + (hourTween.to - hourTween.from) * EASE[hourTween.ease](clamp01(hourTween.t / hourTween.ms)));
      if (hourTween.t >= hourTween.ms) hourTween = null;
    }
    if (panTween) {
      panTween.t += ms;
      rr().camX = panTween.from + (panTween.to - panTween.from) * EASE[panTween.ease](clamp01(panTween.t / panTween.ms));
      if (panTween.t >= panTween.ms) panTween = null;
    }
    for (const [id, to] of swimming) {
      const a = actorOf(id);
      if (!a) continue;
      a.targetX = to.x;
      a.targetY = to.y;
      a.nextWanderAt = 1e12;
    }
    advancePointer(ms);
    drawCursor();
  });

  const api = {
    prepare,
    load,
    settle,
    place,
    setHour,
    swimTo,
    setTheme,
    quality,
    ui,
    camera,
    pan,
    hour,
    dip,
    lucky,
    dropTarget,
    caption,
    endCard,
    workScreen,
    pointer,
    events,
    byName,
    step: (ms: number) => vclock().step(ms),
    run: (ms: number, dt?: number) => vclock().run(ms, dt),
    get time() {
      return t;
    },
    get busy() {
      return pointer.busy;
    },
  };
  return api;
}

export type CaptureApi = ReturnType<typeof installCapture>;
