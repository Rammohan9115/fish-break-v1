// Canvas render loop. Reads game state every frame; fish positions live only here.
import {
  DECOR_BASE_OFFSET,
  DECOR_DROP_PUFFS,
  DECOR_LIFT_SMOOTHING,
  EGG_BURST_CHIPS,
  RAY_SPEED,
  SHADOW_SHIFT,
  EGG_EDGE_MARGIN,
  PAIR_LINGER_MS,
  DROP_HIT_RADIUS,
  EXTRA_HEIGHT_ABOVE,
  EYE_CURSOR_RANGE,
  GAZE_SMOOTHING,
  FOOD_SAND_OFFSET,
  MAX_FRAME_DT_SEC,
  PUFF_ATTACK_MS,
  PUFF_DURATION_MS,
  PUFF_RELEASE_MS,
  PORTRAIT_ZOOM,
  REDUCED_WAVE,
  REDUCED_WOBBLE,
  SAND_Y,
  SECOND_MS,
  SHINY_SPARKLES_PER_SEC,
  TANK_HEIGHT,
  TANK_WIDTH,
} from '../game/constants';
import { getSpecies, getVariant, SHINY_OUTLINE, SHINY_SPARKLE } from '../game/species';
import type { Fish, GameState, Tank, ThemeId } from '../game/types';
import { createActor, isSad, setSwimExtent, updateActor, type FishActor, type FoodTarget } from './behavior';
import { drawFish, drawStar, fishHalfHeight, FISH_ART, fishScale, mouthOffset } from './drawFish';
import { eatSquash, pokeBounce, speedFraction } from './fishMotion';
import { dropShadow } from './paint';
import {
  bakeBackLayer,
  bakeFrontLayer,
  drawAlgae,
  drawBubbler,
  drawFrontPlants,
  drawGlass,
  THEME_PALETTES,
  type Extent,
  type ThemePalette,
  WORLD_EXTENT,
} from './drawTank';
import { chestOpenAmount, drawDecor } from './drawDecor';
import { drawThemeScenery } from './drawScenery';
import { drawEgg, eggProgress } from './drawEgg';
import { iconSprite } from './assets';
import { ThemeBackground } from './background';
import { decorBox, decorLayer, decorSpriteSize, drawIconAt, drawSandItem, dropSquash, type PixelGrid } from './drawSprites';
import { THEME_ART, type IconId } from './artConfig';
import { BackgroundFx, type FxFrame } from './ambient/backgroundFx';
import { Currents } from './ambient/currents';
import { currentHour, dayLight, getHourOverride, setHourOverride, type DayLight } from './ambient/dayCycle';
import { DecorBehaviors } from './ambient/decorBehaviors';
import { QualityManager, type QualityLevel } from './ambient/quality';
import { SandItems } from './ambient/sandItems';
import type { DecorId } from '../game/types';
import type { SimEvent } from '../game/sim';
import { drawDrop, drawPellet, Particles } from './particles';

type Ctx = CanvasRenderingContext2D;

export interface RendererDeps {
  getGame: () => GameState;
  onEat: (fishId: string, pelletId: string) => void;
  /** Fish to highlight (the open FishCard), if any. */
  getSelectedFishId: () => string | null;
  /** Decor to highlight (the open decor card), if any. */
  getSelectedDecorId: () => string | null;
  /** Where a HUD counter's icon is on screen (client px), so collected drops can fly to it. */
  getHudTarget?: (icon: IconId) => { x: number; y: number } | null;
  /** A collected drop reached its HUD counter (the counter bumps). */
  onHudArrive?: (icon: IconId) => void;
}

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** An offscreen canvas holding a static layer rendered at the current scale and DPR. */
interface BakedLayer {
  key: string;
  canvas: HTMLCanvasElement;
}

/** Where a pellet is right now, extrapolated between 1s sim ticks. */
function pelletY(p: Tank['pellets'][number], game: GameState): number {
  if (p.landedAt !== null) return p.y;
  const since = Math.max(0, Date.now() - game.lastTickAt) / SECOND_MS;
  return Math.min(SAND_Y, p.y + p.vy * since);
}

function puffAmount(actor: FishActor, now: number): number {
  if (actor.inflateUntil <= 0) return 0;
  const start = actor.inflateUntil - PUFF_DURATION_MS;
  if (now < start) return 0;
  if (now < start + PUFF_ATTACK_MS) return (now - start) / PUFF_ATTACK_MS;
  if (now < actor.inflateUntil) return 1;
  return Math.max(0, 1 - (now - actor.inflateUntil) / PUFF_RELEASE_MS);
}

let activeRenderer: Renderer | null = null;

/** The renderer currently drawing the tank (dev tools reach the living-tank controls through it). */
export function currentRenderer(): Renderer | null {
  return activeRenderer;
}

export class Renderer {
  private readonly ctx: Ctx;
  private readonly actors = new Map<string, FishActor>();
  private readonly particles = new Particles();
  /** Static background (water, distant ridges) and foreground (sand, stones), re-baked on theme/size change. */
  private backLayer: BakedLayer | null = null;
  private frontLayer: BakedLayer | null = null;
  private readonly sparkleAcc = new Map<string, number>();
  /** Chests currently open (so each opening puffs bubbles once). */
  private readonly openChests = new Set<string>();
  /** Where each egg rests on the sand (under its parents when we saw it laid). */
  private readonly eggX = new Map<string, number>();
  /** Spawn points for fish that just hatched (consumed when their actor is created). */
  private readonly spawnAt = new Map<string, { x: number; y: number }>();
  private readonly motionQuery: MediaQueryList | null;
  /** Theme picture (cover + parallax); the drawn water and sand are the fallback. */
  private readonly background = new ThemeBackground();
  /** Decor under the cursor (edit-mode glow), set by TankView. */
  private hoverDecorId: string | null = null;
  /** Eased lift (0..1) of decor being dragged, and when each piece was last set down (drop bounce). */
  private readonly decorLift = new Map<string, { v: number; target: number }>();
  private readonly decorDropAt = new Map<string, number>();
  /** The living tank: effect quality, the water current, background life, decor behaviors, sand items. */
  readonly quality = new QualityManager();
  private readonly currents = new Currents();
  private readonly fx = new BackgroundFx();
  private readonly behaviors = new DecorBehaviors();
  private readonly sandItems = new SandItems();
  /** Pellets already seen (a new one makes a ripple ring at the surface). */
  private seenPellets: Set<string> | null = null;
  private day: DayLight = dayLight(12);
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private scale = 1;
  /** Camera: tank-space x of the view's left edge, and y of its top edge. */
  private camX = 0;
  private camY = 0;
  private viewW = TANK_WIDTH;
  private panMin = 0;
  private panMax = 0;
  /** The cursor in tank units while it's over the tank (fish eyes follow it), else null. */
  private pointer: { x: number; y: number } | null = null;
  /** Everything that can ever be on screen at this size (baked layers cover it all, so panning never re-bakes). */
  private extent: Extent = { ...WORLD_EXTENT };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly deps: RendererDeps,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  }

  /**
   * Call when the container's CSS size changes. The view always fills the canvas (no letterbox):
   * wide screens fit the world's height and extend scenery sideways; tall screens zoom in (pan
   * sideways) and extend the water upward. Handles devicePixelRatio.
   */
  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(cssWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * this.dpr));
    const fitH = cssHeight / TANK_HEIGHT;
    const fitW = cssWidth / TANK_WIDTH;
    const wide = cssWidth / cssHeight >= TANK_WIDTH / TANK_HEIGHT;
    this.scale = wide ? fitH : Math.min(fitH, fitW * PORTRAIT_ZOOM);
    const vw = cssWidth / this.scale;
    const vh = cssHeight / this.scale;
    this.viewW = vw;
    this.camY = -(vh - TANK_HEIGHT) * EXTRA_HEIGHT_ABOVE;
    if (vw >= TANK_WIDTH) {
      this.panMin = this.panMax = (TANK_WIDTH - vw) / 2;
    } else {
      this.panMin = 0;
      this.panMax = TANK_WIDTH - vw;
    }
    // Start centered (re-centers on rotation/resize).
    this.camX = vw < TANK_WIDTH ? (TANK_WIDTH - vw) / 2 : this.panMin;
    this.extent = {
      x0: Math.min(0, this.panMin),
      x1: Math.max(TANK_WIDTH, this.panMax + vw),
      y0: this.camY,
      y1: this.camY + vh,
    };
    setSwimExtent(this.extent.x0, this.extent.x1, this.extent.y0);
  }

  /** True when the view is narrower than the tank (portrait), so dragging pans. */
  get canPan(): boolean {
    return this.panMax > this.panMin;
  }

  /** Pans the camera by a CSS-pixel drag delta. */
  panBy(dxCss: number): void {
    if (!this.canPan) return;
    this.camX = Math.min(this.panMax, Math.max(this.panMin, this.camX - dxCss / this.scale));
  }

  /** The tank-space rectangle currently on screen. */
  private get view(): Extent {
    return { x0: this.camX, x1: this.camX + this.viewW, y0: this.extent.y0, y1: this.extent.y1 };
  }

  start(): void {
    activeRenderer = this;
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.background.dispose();
    if (activeRenderer === this) activeRenderer = null;
  }

  /** Converts a client (mouse) point to tank units. */
  toTank(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / this.scale + this.camX,
      y: (clientY - rect.top) / this.scale + this.camY,
    };
  }

  /** Topmost fish under a tank-space point, or null. */
  fishAt(x: number, y: number): string | null {
    const ids = [...this.actors.keys()].reverse();
    const fish = this.deps.getGame().fish;
    for (const id of ids) {
      const actor = this.actors.get(id)!;
      const f = fish.find((ff) => ff.id === id);
      if (!f) continue;
      const rx = FISH_ART[f.speciesId].mouthX * fishScale(f.stage) * 1.2;
      const ry = fishHalfHeight(f.speciesId, f.stage) * 1.1;
      if (((x - actor.x) / rx) ** 2 + ((y - actor.y) / ry) ** 2 <= 1) return id;
    }
    return null;
  }

  /** Topmost placed decor (active tank) under a tank-space point, or null. */
  decorAt(x: number, y: number): string | null {
    const game = this.deps.getGame();
    const tank = game.tanks.find((t) => t.id === game.activeTankId);
    if (!tank) return null;
    for (let i = tank.decor.length - 1; i >= 0; i--) {
      const d = tank.decor[i]!;
      const [w, h] = decorBox(d.decorId);
      const baseY = this.decorBaseY(d.decorId);
      if (Math.abs(x - d.x) <= w / 2 && y <= baseY && y >= baseY - h) return d.id;
    }
    return null;
  }

  /** Where a decor item's base sits: sprites rest on the sand line, the drawn art slightly below it. */
  private decorBaseY(decorId: DecorId): number {
    return decorSpriteSize(decorId) ? SAND_Y : SAND_Y + DECOR_BASE_OFFSET;
  }

  /** Decor under the cursor (look mode) gets a soft outline glow; null clears it. */
  setHoverDecor(decorId: string | null): void {
    this.hoverDecorId = decorId;
  }

  /** Dragging decor: it lifts off the sand. */
  liftDecor(decorId: string): void {
    const lift = this.decorLift.get(decorId);
    if (lift) lift.target = 1;
    else this.decorLift.set(decorId, { v: 0, target: 1 });
  }

  /** Setting decor down: it settles with a squash bounce and kicks up a little sand. */
  dropDecor(decorId: string): void {
    const lift = this.decorLift.get(decorId);
    if (lift) lift.target = 0;
    this.decorDropAt.set(decorId, performance.now());
    const game = this.deps.getGame();
    const tank = game.tanks.find((t) => t.id === game.activeTankId);
    const placed = tank?.decor.find((d) => d.id === decorId);
    if (placed) this.particles.spawnSandPuff(placed.x, SAND_Y, decorBox(placed.decorId)[0], DECOR_DROP_PUFFS);
  }

  /** Uncollected shell/pearl drop under a tank-space point, or null. */
  dropAt(x: number, y: number): string | null {
    const game = this.deps.getGame();
    const tank = game.tanks.find((t) => t.id === game.activeTankId);
    if (!tank) return null;
    for (let i = tank.shells.length - 1; i >= 0; i--) {
      const drop = tank.shells[i]!;
      if (Math.hypot(x - drop.x, y - (SAND_Y + 6)) <= DROP_HIT_RADIUS) return drop.id;
    }
    return null;
  }

  /** Coin-pop animation at a drop's position. Call before collecting it. */
  popDrop(dropId: string): void {
    const game = this.deps.getGame();
    const drop = game.tanks.flatMap((t) => t.shells).find((d) => d.id === dropId);
    if (!drop) return;
    const icon = drop.pearl ? 'pearl' : 'shell';
    const color = drop.pearl ? '#8a6be0' : '#e07a5f';
    const target = this.deps.getHudTarget?.(icon);
    if (target && iconSprite(icon)) this.sandItems.fly(icon, { x: drop.x, y: SAND_Y - 8 }, this.toTank(target.x, target.y), performance.now());
    if (iconSprite(icon)) this.particles.spawnPop(drop.x, SAND_Y - 4, `+${drop.value}`, color, icon);
    else this.particles.spawnPop(drop.x, SAND_Y - 4, drop.pearl ? `+${drop.value} ⚪` : `+${drop.value} 🐚`, color);
  }

  /** Sparkle burst + "+XP" pop where an algae spot was wiped. Call before removing it. */
  wipeEffect(spotId: string, xp: number): void {
    const game = this.deps.getGame();
    const spot = game.tanks.flatMap((t) => t.algaeSpots).find((a) => a.id === spotId);
    if (!spot) return;
    const cx = spot.x + spot.size / 2;
    const cy = spot.y + spot.size / 2;
    for (let i = 0; i < 6; i++) this.particles.spawnSparkle(cx + (Math.random() - 0.5) * spot.size * 1.6, cy + (Math.random() - 0.5) * spot.size * 1.6);
    this.particles.spawnPop(cx, cy - 6, `+${xp} XP`, '#2f9e74');
  }

  /** A few soapy bubbles along the sponge path. */
  suds(x: number, y: number): void {
    if (Math.random() < 0.35) this.particles.spawnBubble(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 10, 1.2 + Math.random() * 2);
  }

  /** Reacts to live sim events: hearts between a pair laying an egg, hatchlings popping out of their egg. */
  handleEvents(events: SimEvent[]): void {
    const now = performance.now();
    for (const e of events) {
      if (e.type === 'eggLaid') {
        const a = this.actors.get(e.parentIds[0]);
        const b = this.actors.get(e.parentIds[1]);
        if (!a || !b) continue;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        this.particles.spawnHeart(mx, my - 8);
        this.eggX.set(e.eggId, Math.min(TANK_WIDTH - EGG_EDGE_MARGIN, Math.max(EGG_EDGE_MARGIN, mx)));
        // The happy pair drifts together for a moment.
        for (const actor of [a, b]) {
          actor.targetX = mx;
          actor.targetY = my;
          actor.nextWanderAt = now + PAIR_LINGER_MS;
        }
      } else if (e.type === 'hatched') {
        const x = this.eggPosition(e.eggId);
        this.spawnAt.set(e.fishId, { x, y: SAND_Y - 24 });
        this.eggX.delete(e.eggId);
        for (let i = 0; i < 8; i++) this.particles.spawnSparkle(x + (Math.random() - 0.5) * 30, SAND_Y - Math.random() * 24);
        this.particles.spawnChips(x, SAND_Y - 10, '#ffb347', EGG_BURST_CHIPS);
      }
    }
  }

  /** Egg x on the sand: remembered from when it was laid, else a stable spot derived from its id. */
  private eggPosition(eggId: string): number {
    const known = this.eggX.get(eggId);
    if (known !== undefined) return known;
    let h = 0;
    for (let i = 0; i < eggId.length; i++) h = (h * 31 + eggId.charCodeAt(i)) >>> 0;
    const x = EGG_EDGE_MARGIN + (h % 1000) / 1000 * (TANK_WIDTH - 2 * EGG_EDGE_MARGIN);
    this.eggX.set(eggId, x);
    return x;
  }

  /** Visual-only reaction to a click: every fish bounces, puffers also inflate. */
  poke(fishId: string): void {
    const actor = this.actors.get(fishId);
    if (!actor) return;
    const now = performance.now();
    actor.pokeAt = now;
    if (getSpecies(actor.speciesId).traits.includes('inflates')) actor.inflateUntil = now + PUFF_DURATION_MS;
  }

  /** Dev: a gust of current now. */
  forceGust(): void {
    this.currents.forceGust();
  }

  /** Dev: a distant school crosses now. */
  forceSchool(): void {
    this.fx.forceSchool({ ext: this.extent, view: this.view });
  }

  /** Dev: scrub the time of day (null = follow the clock). */
  setHour(hour: number | null): void {
    setHourOverride(hour);
  }

  get hourOverride(): number | null {
    return getHourOverride();
  }

  /** Dev/fidget: pop a chest open now. */
  openChest(placedId: string): void {
    this.behaviors.openNow(placedId);
  }

  /** Dev: pin the effect quality (null = automatic). */
  setQuality(level: QualityLevel | null): void {
    this.quality.setOverride(level);
  }

  /** Where the cursor is (tank units), or null when it leaves; fish eyes follow it. */
  setPointer(point: { x: number; y: number } | null): void {
    this.pointer = point;
  }

  /** Eases a fish's gaze toward the nearest pellet, else a nearby cursor, else straight ahead. */
  private updateGaze(actor: FishActor, food: FoodTarget[], dt: number): void {
    let tx = actor.x + (actor.facing >= 0 ? 1 : -1) * 100;
    let ty = actor.y + Math.sin(actor.heading) * 60;
    let best = Infinity;
    for (const p of food) {
      const d = Math.hypot(p.x - actor.x, p.y - actor.y);
      if (d < best) {
        best = d;
        tx = p.x;
        ty = p.y;
      }
    }
    if (best === Infinity && this.pointer && Math.hypot(this.pointer.x - actor.x, this.pointer.y - actor.y) < EYE_CURSOR_RANGE) {
      tx = this.pointer.x;
      ty = this.pointer.y;
    }
    const k = Math.min(1, dt * GAZE_SMOOTHING);
    actor.gazeX += (tx - actor.gazeX) * k;
    actor.gazeY += (ty - actor.gazeY) * k;
  }

  private reducedMotion(game: GameState): boolean {
    return game.settings.reducedMotion || (this.motionQuery?.matches ?? false);
  }

  private syncActors(fish: Fish[], now: number): void {
    const ids = new Set(fish.map((f) => f.id));
    for (const id of this.actors.keys()) {
      if (!ids.has(id)) {
        this.actors.delete(id);
        this.sparkleAcc.delete(id);
      }
    }
    for (const f of fish) {
      if (!this.actors.has(f.id)) {
        this.actors.set(f.id, createActor(f, Math.random, now, this.spawnAt.get(f.id)));
        this.spawnAt.delete(f.id);
      }
    }
  }

  private frame = (t: number): void => {
    this.quality.sample(t - this.last, t);
    const dt = Math.min(MAX_FRAME_DT_SEC, Math.max(0, (t - this.last) / SECOND_MS));
    this.last = t;
    const game = this.deps.getGame();
    const tank = game.tanks.find((tk) => tk.id === game.activeTankId) ?? game.tanks[0];
    if (tank) {
      this.update(game, tank, t, dt);
      this.draw(game, tank, t, dt);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(game: GameState, tank: Tank, now: number, dt: number): void {
    const fish = game.fish.filter((f) => f.tankId === tank.id);
    this.syncActors(fish, now);
    const reduced = this.reducedMotion(game);

    let food: FoodTarget[] = tank.pellets.map((p) => ({ id: p.id, x: p.x, y: Math.min(pelletY(p, game), SAND_Y - FOOD_SAND_OFFSET) }));
    for (const f of fish) {
      const actor = this.actors.get(f.id)!;
      const mates = getSpecies(f.speciesId).traits.includes('schools')
        ? fish.filter((o) => o.speciesId === f.speciesId).map((o) => this.actors.get(o.id)!)
        : [];
      const eaten = updateActor(actor, { fish: f, now, dt, rng: Math.random, food, schoolmates: mates });
      this.updateGaze(actor, food, dt);
      if (eaten) {
        food = food.filter((p) => p.id !== eaten);
        this.deps.onEat(f.id, eaten);
      }
      if (f.shiny) {
        const acc = (this.sparkleAcc.get(f.id) ?? 0) + dt * SHINY_SPARKLES_PER_SEC * (reduced ? 0.4 : 1);
        const spawn = Math.floor(acc);
        this.sparkleAcc.set(f.id, acc - spawn);
        const hh = fishHalfHeight(f.speciesId, f.stage);
        for (let i = 0; i < spawn; i++) {
          this.particles.spawnSparkle(actor.x + (Math.random() - 0.5) * hh * 3, actor.y + (Math.random() - 0.5) * hh * 2);
        }
      }
    }
    for (const d of tank.decor) {
      // Sprite chests run the lidOpen behavior; this is the drawn chest's puff.
      if (d.decorId !== 'chest' || decorSpriteSize(d.decorId)) continue;
      const open = chestOpenAmount(now, d.x);
      if (open > 0.3 && !this.openChests.has(d.id)) {
        this.openChests.add(d.id);
        const puffs = reduced ? 2 : 7;
        for (let i = 0; i < puffs; i++) this.particles.spawnBubble(d.x + (Math.random() - 0.5) * 30, SAND_Y - 20 - Math.random() * 10, 2 + Math.random() * 3);
      } else if (open === 0) {
        this.openChests.delete(d.id);
      }
    }
    for (const [id, lift] of this.decorLift) {
      lift.v += (lift.target - lift.v) * Math.min(1, dt * DECOR_LIFT_SMOOTHING);
      if (lift.target === 0 && lift.v < 0.002) this.decorLift.delete(id);
    }
    const current = this.currents.update(dt);
    this.day = dayLight(currentHour());
    this.fx.update(this.fxFrame(dt, now / SECOND_MS, reduced, tank));
    this.behaviors.update(dt, tank.decor, {
      current,
      fish: fish.map((f) => this.actors.get(f.id)!).map((a) => ({ x: a.x, y: a.y })),
      particles: this.particles,
      reduced,
    });
    this.sandItems.update(tank.shells, now);
    // Food dropping in leaves a ripple ring on the surface.
    const ids = new Set(tank.pellets.map((p) => p.id));
    if (this.seenPellets) for (const p of tank.pellets) if (!this.seenPellets.has(p.id)) this.fx.ripple(p.x);
    this.seenPellets = ids;
    this.particles.update(dt, reduced, current.total);
  }

  /** Everything the background effects need this frame. */
  private fxFrame(dt: number, timeSec: number, reduced: boolean, tank: Tank): FxFrame {
    return {
      ctx: this.ctx,
      view: this.view,
      ext: this.extent,
      k: this.scale * this.dpr,
      camY: this.camY,
      dt,
      timeSec,
      preset: this.quality.preset(reduced),
      reduced,
      current: this.currents.state,
      day: this.day,
      pal: THEME_PALETTES[tank.theme],
    };
  }

  private draw(game: GameState, tank: Tank, now: number, dt: number): void {
    const { ctx, dpr } = this;
    const pal = THEME_PALETTES[tank.theme];
    const reduced = this.reducedMotion(game);
    const timeSec = now / SECOND_MS;
    const px = 1 / this.scale;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, -this.camX * this.scale * dpr, -this.camY * this.scale * dpr);
    const view = this.view;
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.clip();

    const sceneTime = reduced ? 0 : timeSec;
    const grid: PixelGrid = { k: this.scale * dpr, camX: this.camX, camY: this.camY, dpr };
    const fx = this.fxFrame(dt, timeSec, reduced, tank);
    const day = this.day;
    const pointerFrac = this.pointer ? (this.pointer.x - (view.x0 + view.x1) / 2) / ((view.x1 - view.x0) / 2) : null;
    const picture = this.background.draw(ctx, tank.theme, this.extent, view, grid, pointerFrac, dt, sceneTime, reduced, fx.preset.warpStrips);
    if (!picture) {
      this.drawBaked('back', tank.theme, pal, px);
      this.drawBaked('front', tank.theme, pal, px);
    }
    // Far layer: distant school and the farthest specks, then light shafts and the floor's caustics.
    this.fx.drawSchool(fx);
    this.fx.drawSpecks(fx, 0);
    this.fx.drawRays(fx);
    this.fx.drawCaustics(fx);
    this.fx.drawSurface(fx, px);
    drawBubbler(ctx, px);
    // The pictures already paint their own coral, lily pads and glow plants.
    if (!picture) drawThemeScenery(ctx, tank.theme, timeSec, px, reduced);
    // Shadows slide gently with the sun angle and the swaying rays.
    const shadowShift = (-day.sunX + Math.sin(timeSec * RAY_SPEED) * 0.25) * SHADOW_SHIFT;
    for (const d of tank.decor) {
      if (decorLayer(d.decorId) === 'back' || !decorSpriteSize(d.decorId)) this.drawDecorItem(d, tank, now, timeSec, px, grid, shadowShift, fx);
    }
    const wallNow = Date.now();
    for (const egg of game.eggs) {
      if (egg.tankId === tank.id) this.drawEggItem(egg, wallNow, timeSec, px, grid, reduced);
    }
    for (const drop of tank.shells) {
      const lift = this.sandItems.lift(drop.id, now);
      if (!drawSandItem(ctx, drop.pearl ? 'pearl' : 'shell', drop.x, grid, { lift: -lift })) drawDrop(ctx, drop, px, timeSec);
      else if (lift === 0) this.sandItems.drawGlint(ctx, drop, timeSec, px);
    }
    this.particles.drawSandPuffs(ctx, pal.sandLight);
    this.fx.drawSpecks(fx, 1);
    for (const p of tank.pellets) drawPellet(ctx, p.x, Math.min(pelletY(p, game), SAND_Y - 1), p.premium, px, timeSec);
    this.particles.drawBubbles(ctx, px);

    // Soft shadows on the sand under each fish: darker and tighter the closer the fish swims to the floor.
    for (const f of game.fish) {
      if (f.tankId !== tank.id) continue;
      const actor = this.actors.get(f.id);
      if (!actor) continue;
      const height = Math.max(0, SAND_Y - actor.y);
      const closeness = 1 - Math.min(1, height / 420);
      const size = mouthOffset(f.speciesId, f.stage) * (1.1 + (1 - closeness) * 0.6);
      dropShadow(ctx, actor.x, SAND_Y + 8, size, size * 0.22, 0.12 + 0.28 * closeness);
    }
    const selectedId = this.deps.getSelectedFishId();
    for (const f of game.fish) {
      if (f.tankId !== tank.id) continue;
      const actor = this.actors.get(f.id);
      if (!actor) continue;
      if (f.id === selectedId) this.drawSelection(actor, f, timeSec, px);
      drawFish(ctx, actor.x, actor.y, {
        speciesId: f.speciesId,
        variant: getVariant(f.speciesId, f.variant),
        shiny: f.shiny,
        stage: f.stage,
        facing: actor.facing,
        pitch: getSpecies(f.speciesId).traits.includes('walksOnSand') ? 0 : actor.tilt,
        phase: actor.phase,
        speedFrac: speedFraction(actor.speed, getSpecies(f.speciesId).speed),
        stretch: actor.stretch,
        eat: eatSquash(now - actor.eatAt),
        bounce: pokeBounce(now - actor.pokeAt),
        gaze: { x: actor.gazeX, y: actor.gazeY },
        blinking: now < actor.blinkUntil,
        sad: isSad(f),
        inflate: puffAmount(actor, now),
        glow: pal.glowFish ? getVariant(f.speciesId, f.variant).accent : null,
        px,
        dpr,
        wobbleAmp: reduced ? REDUCED_WAVE : 1,
        time: timeSec,
      });
    }
    for (const f of game.fish) {
      const actor = this.actors.get(f.id);
      if (actor?.indicator && f.tankId === tank.id) this.drawIndicator(actor, f, now, px);
    }
    for (const d of tank.decor) {
      if (decorLayer(d.decorId) === 'front' && decorSpriteSize(d.decorId)) this.drawDecorItem(d, tank, now, timeSec, px, grid, shadowShift, fx);
    }
    if (!picture) drawFrontPlants(ctx, pal, sceneTime, px, view);
    // Scene-wide light: the theme's ambient tint (e.g. moonlit blue), then the time of day.
    this.drawSceneLight(tank.theme, view);
    const lights = Math.max(day.lights, THEME_ART[tank.theme].minLights);
    for (const d of tank.decor) this.behaviors.drawLights(ctx, d, tank.theme, grid.k, lights, timeSec);
    this.fx.drawSpecks(fx, 2);
    this.particles.drawHearts(ctx, px);
    this.particles.drawSparkles(ctx, px);
    this.particles.drawChips(ctx, px);
    const paintIcon = (icon: IconId, x: number, y: number, size: number) => drawIconAt(ctx, icon, x, y, size, grid.k);
    this.particles.drawPops(ctx, px, paintIcon);
    drawAlgae(ctx, pal, tank.algaeSpots);
    drawGlass(ctx, view);
    this.sandItems.drawFlights(ctx, now, paintIcon, (icon) => this.deps.onHudArrive?.(icon));
    ctx.restore();
  }

  /** The theme's ambient tint and the time-of-day tint + warm haze, over the whole scene. */
  private drawSceneLight(theme: ThemeId, view: Extent): void {
    const { ctx, day } = this;
    const pal = THEME_PALETTES[theme];
    const fill = () => ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.save();
    if (pal.ambient) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = pal.ambient.alpha;
      ctx.fillStyle = pal.ambient.color;
      fill();
    }
    const strength = THEME_ART[theme].dayTint;
    if (day.tintAlpha > 0.005) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = day.tintAlpha * strength;
      ctx.fillStyle = day.tint;
      fill();
    }
    if (day.glowAlpha > 0.005) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = day.glowAlpha * strength;
      ctx.fillStyle = day.glow;
      fill();
    }
    ctx.restore();
  }

  /** One decor item: the sprite (with edit-mode glow, lift and drop bounce) or the drawn art. */
  private drawDecorItem(d: Tank['decor'][number], tank: Tank, now: number, timeSec: number, px: number, grid: PixelGrid, shadowShift: number, fx: FxFrame): void {
    const selected = d.id === this.deps.getSelectedDecorId();
    const lift = this.decorLift.get(d.id)?.v ?? 0;
    const glow = selected ? 0.75 + 0.25 * Math.sin(timeSec * 3) : d.id === this.hoverDecorId ? 0.6 : 0;
    const drawn = this.behaviors.draw(this.ctx, d, {
      theme: tank.theme,
      grid,
      lift,
      squash: dropSquash(now - (this.decorDropAt.get(d.id) ?? -Infinity)),
      glow,
      shadowShift,
      timeSec,
      preset: fx.preset,
    });
    if (selected) this.drawDecorSelection(d.decorId, d.x, timeSec, px, drawn);
    if (!drawn) drawDecor(this.ctx, d.decorId, d.x, SAND_Y + DECOR_BASE_OFFSET, now, px);
  }

  /** An egg on the sand, rocking more as hatching nears: the egg sprite, or the drawn egg. */
  private drawEggItem(egg: GameState['eggs'][number], wallNow: number, timeSec: number, px: number, grid: PixelGrid, reduced: boolean): void {
    const x = this.eggPosition(egg.id);
    const wobble = reduced ? REDUCED_WOBBLE : 1;
    const progress = eggProgress(egg, wallNow);
    const burst = Math.sin(timeSec * 1.3 + x) > 0.2 ? 1 : 0.35;
    const angle = Math.sin(timeSec * (6 + progress * 6) + x) * (0.04 + 0.22 * progress * progress) * burst * wobble;
    // In the last stretch it gives little hops, as if something inside is eager to come out.
    const eager = Math.max(0, (progress - 0.85) / 0.15);
    const hop = -Math.max(0, Math.sin(timeSec * 5 + x)) * 2.5 * eager * burst * wobble;
    if (!drawSandItem(this.ctx, 'egg', x, grid, { angle, lift: hop, scale: 1 + eager * 0.04 * Math.sin(timeSec * 10) })) {
      drawEgg(this.ctx, egg, x, wallNow, timeSec, px, wobble);
      return;
    }
    if (egg.shiny) {
      const tw = (Math.sin(timeSec * 4 + x) + 1) / 2;
      drawStar(this.ctx, x + 12, SAND_Y - 22, 3.5 * tw, SHINY_SPARKLE, SHINY_OUTLINE, 0.6 * px);
    }
  }

  /** Behind the selected decor: a dashed box for the drawn art (sprites glow instead), plus ◀ ▶ drag hints. */
  private drawDecorSelection(decorId: DecorId, x: number, timeSec: number, px: number, sprite: boolean): void {
    const { ctx } = this;
    const [w, h] = decorBox(decorId);
    const baseY = this.decorBaseY(decorId);
    const pad = 8 + Math.sin(timeSec * 4) * 2;
    ctx.save();
    if (!sprite) {
      ctx.beginPath();
      ctx.roundRect(x - w / 2 - pad, baseY - h - pad, w + pad * 2, h + pad, 12);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.setLineDash([6 * px, 5 * px]);
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = '700 14px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀', x - w / 2 - pad - 10, baseY - h / 2);
    ctx.fillText('▶', x + w / 2 + pad + 10, baseY - h / 2);
    ctx.restore();
  }

  /** Soft pulsing ring behind the selected fish. */
  private drawSelection(actor: FishActor, fish: Fish, timeSec: number, px: number): void {
    const { ctx } = this;
    const rx = FISH_ART[fish.speciesId].mouthX * fishScale(fish.stage) * 1.35;
    const ry = fishHalfHeight(fish.speciesId, fish.stage) * 1.45;
    const pulse = 1 + Math.sin(timeSec * 4) * 0.05;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(actor.x, actor.y, rx * pulse, ry * pulse, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
    ctx.setLineDash([6 * px, 5 * px]);
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.stroke();
    ctx.restore();
  }

  /** Draws a static layer from its cache, (re)baking it when theme, size or DPR changed. */
  private drawBaked(which: 'back' | 'front', theme: ThemeId, pal: ThemePalette, px: number): void {
    const ext = this.extent;
    const key = `${which}:${theme}:${ext.x0.toFixed(1)},${ext.x1.toFixed(1)},${ext.y0.toFixed(1)},${ext.y1.toFixed(1)}:${this.scale.toFixed(4)}:${this.dpr}`;
    let layer = which === 'back' ? this.backLayer : this.frontLayer;
    if (!layer || layer.key !== key) {
      const canvas = document.createElement('canvas');
      const k = this.scale * this.dpr;
      canvas.width = Math.max(1, Math.round((ext.x1 - ext.x0) * k));
      canvas.height = Math.max(1, Math.round((ext.y1 - ext.y0) * k));
      const bctx = canvas.getContext('2d');
      if (bctx) {
        bctx.setTransform(k, 0, 0, k, -ext.x0 * k, -ext.y0 * k);
        if (which === 'back') bakeBackLayer(bctx, pal, ext, px);
        else bakeFrontLayer(bctx, pal, px, ext);
      }
      layer = { key, canvas };
      if (which === 'back') this.backLayer = layer;
      else this.frontLayer = layer;
    }
    this.ctx.drawImage(layer.canvas, ext.x0, ext.y0, ext.x1 - ext.x0, ext.y1 - ext.y0);
  }

  private drawIndicator(actor: FishActor, fish: Fish, now: number, px: number): void {
    const ind = actor.indicator;
    if (!ind) return;
    const { ctx } = this;
    const t = (now - ind.start) / (ind.until - ind.start);
    const alpha = Math.min(1, t / 0.15, (1 - t) / 0.25);
    const top = actor.y - fishHalfHeight(fish.speciesId, fish.stage) - 6;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (ind.kind === 'hungry') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#a9c4d8';
      ctx.lineWidth = 1.5 * px;
      const bubbles: [number, number, number][] = [
        [actor.x + 4, top, 1.8],
        [actor.x + 8, top - 6, 2.8],
        [actor.x + 18, top - 19, 11],
      ];
      for (const [x, y, r] of bubbles) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.font = `13px ${EMOJI_FONT}`;
      ctx.fillText('🍤', actor.x + 18, top - 18);
    } else {
      ctx.font = `16px ${EMOJI_FONT}`;
      ctx.fillText('🌧️', actor.x, top - 10 - t * 6);
    }
    ctx.restore();
  }
}
