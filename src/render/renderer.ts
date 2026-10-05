// Canvas render loop. Reads game state every frame; fish positions live only here.
import {
  DECOR_BASE_OFFSET,
  DECOR_DROP_PUFFS,
  DECOR_LIFT_SMOOTHING,
  EGG_BURST_CHIPS,
  EGG_EAGER_MS,
  COURTSHIP_HEART_GAP_S,
  COURTSHIP_HEIGHT,
  COURTSHIP_LOOP_H,
  COURTSHIP_LOOP_S,
  COURTSHIP_LOOP_W,
  HATCH_SPIN_MS,
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
  DANCE_BPM,
  JELLY_CATCH_SLIDE_MS,
  JELLY_SHADOW_ALPHA,
  JELLY_SHADOW_SCALE,
  JELLY_CONTRACT_MS,
  JELLY_EXPAND_MS,
  PET_HITBOX_PAD,
} from '../game/constants';
import { getSpecies, getVariant, SHINY_OUTLINE, SHINY_SPARKLE } from '../game/species';
import type { BondLevel, Fish, GameState, Tank, ThemeId } from '../game/types';
import {
  createActor,
  heartPoint,
  isSad,
  jellyHappy,
  jellyTentacles,
  setSwimExtent,
  updateActor,
  type FishActor,
  type FoodTarget,
  type JellyZone,
} from './behavior';
import type { JellyDrawState } from './drawJelly';
import { jellySize } from './jellyMotion';
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
import type { Courtship, DecorId, Egg } from '../game/types';
import type { SimEvent } from '../game/sim';
import { drawDrop, drawPellet, Particles } from './particles';
import { BondFx, type PetOutcome } from './bondFx';
import type { TrickId } from '../game/bond';

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
  /** Breeding state to show (read once per frame). */
  getBreedingView?: () => BreedingView;
  /** A pet session's meter filled: the store pays out (or the fish is just content). Null if the fish is gone. */
  onPetComplete?: (fishId: string) => PetOutcome | null;
  /** The pet meter moved (0..1), or petting stopped (null). */
  onPetProgress?: (fishId: string, progress: number | null) => void;
}

/** What the tank shows for breeding. */
export interface BreedingView {
  /** Fish ready to pair (with a ready partner): a pulsing 💕 floats above them. */
  readyIds: Set<string>;
  /** Pairing mode: the chooser, and the partners that glow (everyone else fades). */
  pairing: { fishId: string; compatibleIds: Set<string> } | null;
  /** Courtships in the active tank (the pair swims a heart loop). */
  courtships: Courtship[];
  /** The first-baby quest points at this fish. */
  questFishId: string | null;
}

const NO_BREEDING: BreedingView = { readyIds: new Set(), pairing: null, courtships: [], questFishId: null };

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
  private readonly bond = new BondFx(this.particles);
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
  private breeding: BreedingView = NO_BREEDING;
  /** When each newborn arrived (it does a little happy spin). */
  private readonly spinAt = new Map<string, number>();
  /** Jelly tentacle areas this frame (fish steer around them), pooled; and per-jelly draw state. */
  private readonly jellyZones: JellyZone[] = [];
  private readonly jellyDraw = new Map<string, JellyDrawState>();
  /** Dance Mode: beat length in ms (jellies pulse on the beat), or null. */
  private beatMs: number | null = null;
  /** Seconds until the next floating heart, per courtship. */
  private readonly heartTimers = new Map<string, number>();
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

  /** A fish's position in client (viewport) pixels, plus its half height on screen; null if it isn't drawn. */
  fishScreenPoint(fishId: string): { x: number; y: number; halfHeight: number } | null {
    const actor = this.actors.get(fishId);
    const f = this.deps.getGame().fish.find((ff) => ff.id === fishId);
    if (!actor || !f) return null;
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (actor.x - this.camX) * this.scale,
      y: rect.top + (actor.y - this.camY) * this.scale,
      halfHeight: fishHalfHeight(f.speciesId, f.stage) * this.scale,
    };
  }

  /** Topmost fish under a tank-space point, or null. `pad` widens the hit area (tank units). */
  fishAt(x: number, y: number, pad = 0): string | null {
    const ids = [...this.actors.keys()].reverse();
    const fish = this.deps.getGame().fish;
    for (const id of ids) {
      const actor = this.actors.get(id)!;
      const f = fish.find((ff) => ff.id === id);
      if (!f) continue;
      const rx = FISH_ART[f.speciesId].mouthX * fishScale(f.stage) * 1.2 + pad;
      const ry = fishHalfHeight(f.speciesId, f.stage) * 1.1 + pad;
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
        // The egg settles where the pair danced; a little burst of hearts marks it.
        const egg = this.deps.getGame().eggs.find((g) => g.id === e.eggId);
        const x = egg ? this.eggPosition(egg) : null;
        if (x !== null) for (let i = 0; i < 3; i++) this.particles.spawnHeart(x + (i - 1) * 14, SAND_Y - 40 - i * 6);
        for (const id of e.parentIds) {
          const actor = this.actors.get(id);
          if (actor) actor.nextWanderAt = now + PAIR_LINGER_MS;
        }
      } else if (e.type === 'hatched') {
        const x = this.eggX.get(e.eggId) ?? this.hatchSpot(e.eggId);
        this.eggX.delete(e.eggId);
        if (e.destination === 'tank') {
          this.spawnAt.set(e.fishId, { x, y: SAND_Y - 24 });
          this.spinAt.set(e.fishId, now);
        }
        for (let i = 0; i < 8; i++) this.particles.spawnSparkle(x + (Math.random() - 0.5) * 30, SAND_Y - Math.random() * 24);
        this.particles.spawnChips(x, SAND_Y - 10, '#ffb347', EGG_BURST_CHIPS);
        if (e.shiny) {
          // A golden burst for a shiny baby.
          for (let i = 0; i < 18; i++) this.particles.spawnSparkle(x + (Math.random() - 0.5) * 70, SAND_Y - 10 - Math.random() * 70);
          this.particles.spawnChips(x, SAND_Y - 16, '#ffd84a', 10);
        }
      }
    }
  }

  /** Egg x on the sand: where it was laid (saved), else a stable spot derived from its id. Remembered for the hatch. */
  private eggPosition(egg: Egg): number {
    const x = egg.x !== undefined ? Math.min(TANK_WIDTH - EGG_EDGE_MARGIN, Math.max(EGG_EDGE_MARGIN, egg.x)) : this.hatchSpot(egg.id);
    this.eggX.set(egg.id, x);
    return x;
  }

  private hatchSpot(eggId: string): number {
    let h = 0;
    for (let i = 0; i < eggId.length; i++) h = (h * 31 + eggId.charCodeAt(i)) >>> 0;
    return EGG_EDGE_MARGIN + ((h % 1000) / 1000) * (TANK_WIDTH - 2 * EGG_EDGE_MARGIN);
  }

  /** Where a pair would court (and lay their egg): between them, on the sand. */
  pairSpot(aId: string, bId: string): number | undefined {
    const a = this.actors.get(aId);
    const b = this.actors.get(bId);
    if (!a || !b) return undefined;
    return Math.min(TANK_WIDTH - EGG_EDGE_MARGIN * 2, Math.max(EGG_EDGE_MARGIN * 2, (a.x + b.x) / 2));
  }

  /** Visual-only reaction to a click: every fish bounces, puffers also inflate. */
  poke(fishId: string): void {
    const actor = this.actors.get(fishId);
    if (!actor) return;
    const now = performance.now();
    actor.pokeAt = now;
    if (getSpecies(actor.speciesId).traits.includes('inflates')) actor.inflateUntil = now + PUFF_DURATION_MS;
    if (actor.jelly) {
      // Three quick happy pulses, a glow flash, bubbles and a heart.
      jellyHappy(actor.jelly, now);
      const f = this.deps.getGame().fish.find((ff) => ff.id === fishId);
      const { w, h } = jellySize(f?.stage ?? 'adult');
      for (let i = 0; i < 5; i++) this.particles.spawnBubble(actor.x + (Math.random() - 0.5) * w * 0.6, actor.y + h * 0.1 + Math.random() * h * 0.3, 1.5 + Math.random() * 2.5);
      this.particles.spawnHeart(actor.x, actor.y - h / 2 - 8);
    }
  }

  /** A generously sized fish hit test for pressing and petting (easy to grab on a phone). */
  fishToPet(x: number, y: number): string | null {
    return this.fishAt(x, y, PET_HITBOX_PAD);
  }

  /** Fish whose center is within `radius` of (x, y) in the active tank (hand-feeding bond). */
  fishNear(x: number, y: number, radius: number): string[] {
    const out: string[] = [];
    for (const [id, actor] of this.actors) if (Math.hypot(actor.x - x, actor.y - y) <= radius) out.push(id);
    return out;
  }

  /** Starts petting a fish; the pointer (tank units) defaults to just in front of it (keyboard). */
  petStart(fishId: string, point: { x: number; y: number } | null): boolean {
    const actor = this.actors.get(fishId);
    const f = this.deps.getGame().fish.find((ff) => ff.id === fishId);
    if (!actor || !f) return false;
    const p = point ?? { x: actor.x + (actor.facing >= 0 ? 1 : -1) * 30, y: actor.y };
    this.bond.start(f, p.x, p.y, performance.now());
    return true;
  }

  petMove(point: { x: number; y: number }): void {
    this.bond.move(point.x, point.y, performance.now());
  }

  /** Stops petting (an unfinished meter is lost; the fish wiggles and swims on). */
  petEnd(): void {
    const id = this.bond.end(this.actors, performance.now());
    if (id) this.deps.onPetProgress?.(id, null);
  }

  get pettingFishId(): string | null {
    return this.bond.pettingId;
  }

  /** Plays a trick animation (the store already checked unlocks and cooldowns). */
  playTrick(fishId: string, trick: Exclude<TrickId, 'follow'>): void {
    this.bond.playTrick(fishId, trick, this.deps.getGame().fish.find((f) => f.id === fishId), this.actors.get(fishId), performance.now());
  }

  /** Follow mode on (until a wall-clock time) or off (null). */
  setFollow(fishId: string, until: number | null): void {
    this.bond.setFollow(fishId, until);
  }

  /** Welcome back: these fish swim to the front and wiggle hello. */
  greet(fishIds: readonly string[]): void {
    this.bond.greet(fishIds, this.camX + this.viewW / 2, performance.now());
  }

  /** A tap on empty water: Curious+ fish nearby swim over. */
  sayHi(x: number, y: number): void {
    const game = this.deps.getGame();
    this.bond.sayHi(x, y, game.fish.filter((f) => f.tankId === game.activeTankId), this.actors, performance.now());
  }

  /** A bond level-up: a big heart burst and a demo of the new trick. */
  celebrateBond(fishId: string, level: BondLevel): void {
    const f = this.deps.getGame().fish.find((ff) => ff.id === fishId);
    if (f) this.bond.celebrate(f, this.actors.get(fishId), level, performance.now(), this.reducedMotion(this.deps.getGame()));
  }

  /** Dance Mode: jellies pulse on the beat (null/false stops). */
  setDance(on: boolean): void {
    this.beatMs = on ? 60_000 / DANCE_BPM : null;
  }

  get dancing(): boolean {
    return this.beatMs !== null;
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
    // Jellies face the viewer: they look a little down and toward where they drift.
    let tx = actor.jelly ? actor.x + actor.jelly.vx * 4 : actor.x + (actor.facing >= 0 ? 1 : -1) * 100;
    let ty = actor.jelly ? actor.y + 120 : actor.y + Math.sin(actor.heading) * 60;
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
        this.jellyDraw.delete(id);
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
      this.breeding = this.deps.getBreedingView?.() ?? NO_BREEDING;
      this.update(game, tank, t, dt);
      this.draw(game, tank, t, dt);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(game: GameState, tank: Tank, now: number, dt: number): void {
    const fish = game.fish.filter((f) => f.tankId === tank.id);
    this.syncActors(fish, now);
    const reduced = this.reducedMotion(game);

    let food: FoodTarget[] = tank.pellets.map((p) => ({ id: p.id, x: p.x, y: Math.min(pelletY(p, game), SAND_Y - FOOD_SAND_OFFSET), premium: p.premium }));
    const loops = this.courtshipTargets(reduced);
    const zones = this.updateJellyZones(fish);
    const current = this.currents.state.total;
    const beat = this.beatMs !== null ? Math.floor(now / this.beatMs) : null;
    const beatTempo = this.beatMs !== null ? this.beatMs / (JELLY_CONTRACT_MS + JELLY_EXPAND_MS) : 1;
    for (const f of fish) {
      const actor = this.actors.get(f.id)!;
      const mates = getSpecies(f.speciesId).traits.includes('schools')
        ? fish.filter((o) => o.speciesId === f.speciesId).map((o) => this.actors.get(o.id)!)
        : [];
      const eaten = updateActor(actor, {
        fish: f,
        now,
        dt,
        rng: Math.random,
        food,
        schoolmates: mates,
        courtship: loops.get(f.id),
        current,
        beat,
        beatTempo,
        reduced,
        jellies: zones,
        ...this.bond.steer(f.id, this.pointer, reduced),
      });
      this.updateGaze(actor, food, dt);
      if (eaten) {
        food = food.filter((p) => p.id !== eaten);
        this.deps.onEat(f.id, eaten);
        // A jelly gulps once the pellet has slid up into its bell.
        if (actor.jelly) actor.eatAt = now + JELLY_CATCH_SLIDE_MS;
      }
      if (actor.jelly?.caught && now - actor.jelly.caught.at >= JELLY_CATCH_SLIDE_MS) actor.jelly.caught = null;
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
    // Courting pairs swim in step (shared body-wave phase) and float hearts now and then.
    for (const c of this.breeding.courtships) {
      const a = this.actors.get(c.fishIds[0]);
      const b = this.actors.get(c.fishIds[1]);
      if (!a || !b) continue;
      b.phase = a.phase;
      const left = (this.heartTimers.get(c.id) ?? 0) - dt;
      if (left <= 0) {
        this.particles.spawnHeart((a.x + b.x) / 2 + (Math.random() - 0.5) * 16, Math.min(a.y, b.y) - 14);
        this.heartTimers.set(c.id, COURTSHIP_HEART_GAP_S * (reduced ? 3 : 1));
      } else {
        this.heartTimers.set(c.id, left);
      }
    }
    for (const id of this.heartTimers.keys()) if (!this.breeding.courtships.some((c) => c.id === id)) this.heartTimers.delete(id);
    for (const [id, at] of this.spinAt) if (now - at > HATCH_SPIN_MS) this.spinAt.delete(id);
    for (const [id, lift] of this.decorLift) {
      lift.v += (lift.target - lift.v) * Math.min(1, dt * DECOR_LIFT_SMOOTHING);
      if (lift.target === 0 && lift.v < 0.002) this.decorLift.delete(id);
    }
    const currentNow = this.currents.update(dt);
    this.day = dayLight(currentHour());
    this.fx.update(this.fxFrame(dt, now / SECOND_MS, reduced, tank));
    this.behaviors.update(dt, tank.decor, {
      current: currentNow,
      fish: fish.map((f) => this.actors.get(f.id)!).map((a) => ({ x: a.x, y: a.y })),
      particles: this.particles,
      reduced,
    });
    this.sandItems.update(tank.shells, now);
    // Food dropping in leaves a ripple ring on the surface.
    const ids = new Set(tank.pellets.map((p) => p.id));
    if (this.seenPellets) for (const p of tank.pellets) if (!this.seenPellets.has(p.id)) this.fx.ripple(p.x);
    this.seenPellets = ids;
    this.particles.update(dt, reduced, currentNow.total);
    this.updateBond(fish, now, dt, reduced);
  }

  /** Petting meter, hellos, tricks; pays out a completed pet session through the store. */
  private updateBond(fish: Fish[], now: number, dt: number, reduced: boolean): void {
    const done = this.bond.update(dt, now, fish, this.actors, this.pointer, reduced, (id, trick) => this.playTrick(id, trick));
    const petting = this.bond.pettingId;
    if (petting) this.deps.onPetProgress?.(petting, this.bond.progress);
    if (!done) return;
    const outcome = this.deps.onPetComplete?.(done);
    const actor = this.actors.get(done);
    const f = this.deps.getGame().fish.find((ff) => ff.id === done);
    if (!outcome || !actor || !f) return;
    this.bond.completed(actor, f, outcome, reduced);
    this.spinAt.set(done, now);
  }

  /** Fills the pooled tentacle zones for this tank's jellies (fish keep out of them). */
  private updateJellyZones(fish: Fish[]): JellyZone[] {
    let n = 0;
    for (const f of fish) {
      const actor = this.actors.get(f.id);
      if (!actor?.jelly) continue;
      const zone = this.jellyZones[n] ?? { x0: 0, x1: 0, y0: 0, y1: 0 };
      this.jellyZones[n] = jellyTentacles(actor, f, zone);
      n += 1;
    }
    this.jellyZones.length = n;
    return this.jellyZones;
  }

  /** The jelly's per-frame draw state (pooled per jelly). */
  private jellyState(actor: FishActor, now: number): JellyDrawState | undefined {
    const j = actor.jelly;
    if (!j) return undefined;
    let st = this.jellyDraw.get(actor.id);
    if (!st) {
      st = { sincePulse: Infinity, pulseStrength: 0, pulseTempo: 1, rise: 0, lean: 0, sinceFlash: Infinity, catch: null };
      this.jellyDraw.set(actor.id, st);
    }
    st.sincePulse = now - j.pulseAt;
    st.pulseStrength = j.pulseStrength;
    st.pulseTempo = j.pulseTempo;
    st.rise = j.rise;
    st.lean = j.lean;
    st.sinceFlash = now - j.flashAt;
    if (j.caught) {
      st.catch ??= { t: 0, dx: 0, dy: 0, premium: false };
      st.catch.t = Math.min(1, (now - j.caught.at) / JELLY_CATCH_SLIDE_MS);
      st.catch.dx = j.caught.dx;
      st.catch.dy = j.caught.dy;
      st.catch.premium = j.caught.premium;
    } else {
      st.catch = null;
    }
    return st;
  }

  /**
   * Where each courting fish should be on its heart loop right now: the pair traces mirror-image
   * halves, meeting at the top dip and the bottom point. Reduced motion: they float side by side.
   */
  private courtshipTargets(reduced: boolean): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    const wall = Date.now();
    for (const c of this.breeding.courtships) {
      const cy = SAND_Y - COURTSHIP_HEIGHT;
      if (reduced) {
        out.set(c.fishIds[0], { x: c.x - 26, y: cy });
        out.set(c.fishIds[1], { x: c.x + 26, y: cy });
        continue;
      }
      const u = ((wall - c.startedAt) / 1000 / COURTSHIP_LOOP_S) * Math.PI * 2;
      const p = heartPoint(u, COURTSHIP_LOOP_W * 2, COURTSHIP_LOOP_H * 2);
      out.set(c.fishIds[0], { x: c.x + p.x, y: cy + p.y });
      out.set(c.fishIds[1], { x: c.x - p.x, y: cy + p.y });
    }
    return out;
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
      if (actor.jelly) {
        // A jelly's shadow: very faint, large and blurry (it floats high and lets light through).
        const size = jellySize(f.stage).w * JELLY_SHADOW_SCALE * (1 + (1 - closeness) * 0.4);
        dropShadow(ctx, actor.x, SAND_Y + 8, size, size * 0.2, JELLY_SHADOW_ALPHA * (0.6 + 0.4 * closeness));
        continue;
      }
      const size = mouthOffset(f.speciesId, f.stage) * (1.1 + (1 - closeness) * 0.6);
      dropShadow(ctx, actor.x, SAND_Y + 8, size, size * 0.22, 0.12 + 0.28 * closeness);
    }
    // Pairing mode: the tank dims a little; compatible partners glow and bob, everyone else fades.
    const pairing = this.breeding.pairing;
    if (pairing) {
      ctx.save();
      ctx.fillStyle = 'rgba(12, 22, 60, 0.3)';
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
      ctx.restore();
    }
    const selectedId = this.deps.getSelectedFishId();
    for (const f of game.fish) {
      if (f.tankId !== tank.id) continue;
      const actor = this.actors.get(f.id);
      if (!actor) continue;
      const glowing = pairing?.compatibleIds.has(f.id) ?? false;
      const chooser = pairing?.fishId === f.id;
      const bob = glowing && !reduced ? Math.sin(timeSec * 4 + actor.phase) * 3 : 0;
      if (f.id === selectedId) this.drawSelection(actor, f, timeSec, px);
      if (glowing || chooser) this.drawSelection(actor, f, timeSec, px, chooser ? '#ffffff' : '#ff8fb8', bob);
      ctx.save();
      if (pairing && !glowing && !chooser) ctx.globalAlpha = 0.35;
      // A newborn's (or a just-petted fish's) happy spin: one full turn, easing out.
      const spinAt = this.spinAt.get(f.id);
      if (spinAt !== undefined && !reduced) {
        const t = Math.min(1, (now - spinAt) / HATCH_SPIN_MS);
        ctx.translate(actor.x, actor.y);
        ctx.rotate((1 - (1 - t) ** 3) * Math.PI * 2 * (actor.facing >= 0 ? -1 : 1));
        ctx.translate(-actor.x, -actor.y);
      }
      // Tricks, the greeting wiggle and petting flavor pose the fish around its center.
      const pose = this.bond.poseFor(f, actor, now, reduced);
      if (pose) {
        ctx.translate(actor.x + pose.dx, actor.y + pose.dy);
        ctx.rotate(pose.rot);
        ctx.scale(pose.scale, pose.scale);
        ctx.translate(-actor.x, -actor.y);
      }
      drawFish(ctx, actor.x, actor.y + bob, {
        speciesId: f.speciesId,
        variant: getVariant(f.speciesId, f.variant),
        shiny: f.shiny || this.bond.rainbow(f.id),
        stage: f.stage,
        facing: actor.facing,
        pitch: getSpecies(f.speciesId).traits.includes('walksOnSand') ? 0 : actor.tilt,
        phase: actor.phase,
        speedFrac: speedFraction(actor.speed, getSpecies(f.speciesId).speed),
        stretch: actor.stretch,
        eat: eatSquash(now - actor.eatAt),
        bounce: pokeBounce(now - actor.pokeAt),
        gaze: { x: actor.gazeX, y: actor.gazeY },
        blinking: now < actor.blinkUntil || this.bond.happyEyes(f.id),
        sad: isSad(f) && !this.bond.happyEyes(f.id),
        gloom: this.bond.happyEyes(f.id) ? 0 : actor.gloom,
        inflate: Math.max(puffAmount(actor, now), this.bond.minInflate(f)),
        glow: pal.glowFish ? getVariant(f.speciesId, f.variant).accent : null,
        px,
        dpr,
        wobbleAmp: (reduced ? REDUCED_WAVE : 1) * (pose?.wave ?? 1),
        time: timeSec,
        jelly: this.jellyState(actor, now),
      });
      ctx.restore();
    }
    for (const f of game.fish) {
      const actor = this.actors.get(f.id);
      if (actor?.indicator && f.tankId === tank.id) this.drawIndicator(actor, f, now, px);
    }
    this.drawBreedingMarkers(game.fish.filter((f) => f.tankId === tank.id), timeSec, reduced);
    for (const d of tank.decor) {
      if (decorLayer(d.decorId) === 'front' && decorSpriteSize(d.decorId)) this.drawDecorItem(d, tank, now, timeSec, px, grid, shadowShift, fx);
    }
    if (!picture) drawFrontPlants(ctx, pal, sceneTime, px, view);
    // Eggs and shell drops sit in front of everything on the sand, so they're never hidden behind decor or fish.
    const wallNow = Date.now();
    for (const egg of game.eggs) {
      if (egg.tankId === tank.id) this.drawEggItem(egg, wallNow, timeSec, px, grid, reduced);
    }
    for (const drop of tank.shells) {
      const lift = this.sandItems.lift(drop.id, now);
      if (!drawSandItem(ctx, drop.pearl ? 'pearl' : 'shell', drop.x, grid, { lift: -lift })) drawDrop(ctx, drop, px, timeSec);
      else if (lift === 0) this.sandItems.drawGlint(ctx, drop, timeSec, px);
    }
    // Scene-wide light: the theme's ambient tint (e.g. moonlit blue), then the time of day.
    this.drawSceneLight(tank.theme, view);
    const lights = Math.max(day.lights, THEME_ART[tank.theme].minLights);
    for (const d of tank.decor) this.behaviors.drawLights(ctx, d, tank.theme, grid.k, lights, timeSec);
    this.fx.drawSpecks(fx, 2);
    this.particles.drawRings(ctx, px);
    this.particles.drawStreaks(ctx, px);
    this.particles.drawHearts(ctx, px);
    this.particles.drawSparkles(ctx, px);
    this.bond.draw(ctx, this.actors, game.fish, px, timeSec, EMOJI_FONT);
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
    const x = this.eggPosition(egg);
    const wobble = reduced ? REDUCED_WOBBLE : 1;
    const progress = eggProgress(egg, wallNow);
    // In its last minute it wobbles faster and gives little hops, as if someone inside can't wait.
    const eager = Math.max(0, Math.min(1, 1 - (egg.hatchAt - wallNow) / EGG_EAGER_MS));
    const burst = eager > 0 || Math.sin(timeSec * 1.3 + x) > 0.2 ? 1 : 0.35;
    const angle = Math.sin(timeSec * (6 + progress * 6 + eager * 10) + x) * (0.04 + 0.22 * progress * progress + 0.08 * eager) * burst * wobble;
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

  /** Soft pulsing ring behind a fish: white dashes for the selected one, a pink glow for pairing partners. */
  private drawSelection(actor: FishActor, fish: Fish, timeSec: number, px: number, color = '#ffffff', dy = 0): void {
    const { ctx } = this;
    const rx = FISH_ART[fish.speciesId].mouthX * fishScale(fish.stage) * 1.35;
    const ry = fishHalfHeight(fish.speciesId, fish.stage) * 1.45;
    const pulse = 1 + Math.sin(timeSec * 4) * 0.05;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(actor.x, actor.y + dy, rx * pulse, ry * pulse, 0, 0, Math.PI * 2);
    if (color === '#ffffff') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fill();
      ctx.setLineDash([6 * px, 5 * px]);
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(actor.x, actor.y + dy, 0, actor.x, actor.y + dy, rx * pulse * 1.15);
      g.addColorStop(0, 'rgba(255, 170, 210, 0.45)');
      g.addColorStop(1, 'rgba(255, 140, 190, 0)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2.5 * px;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A pulsing 💕 above ready fish, and a bouncing 👇 over the fish the first-baby quest points at. */
  private drawBreedingMarkers(fish: Fish[], timeSec: number, reduced: boolean): void {
    const { ctx } = this;
    const { readyIds, pairing, questFishId } = this.breeding;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of fish) {
      const actor = this.actors.get(f.id);
      if (!actor) continue;
      const top = actor.y - fishHalfHeight(f.speciesId, f.stage) - 12;
      if (f.id === questFishId) {
        const hop = reduced ? 0 : Math.abs(Math.sin(timeSec * 3.2)) * 8;
        ctx.font = `22px ${EMOJI_FONT}`;
        ctx.fillText('👇', actor.x, top - 22 - hop);
      }
      if (!pairing && readyIds.has(f.id) && !actor.indicator) {
        const pulse = reduced ? 1 : 1 + Math.sin(timeSec * 3 + actor.phase) * 0.14;
        ctx.globalAlpha = 0.9;
        ctx.font = `${Math.round(14 * pulse)}px ${EMOJI_FONT}`;
        ctx.fillText('💕', actor.x, top - (reduced ? 0 : Math.sin(timeSec * 1.6 + actor.phase) * 2));
        ctx.globalAlpha = 1;
      }
    }
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
