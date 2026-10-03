// Canvas render loop. Reads game state every frame; fish positions live only here.
import {
  BACKGROUND_SAND_OVERLAP,
  DECOR_BASE_OFFSET,
  EGG_EDGE_MARGIN,
  PAIR_LINGER_MS,
  DROP_HIT_RADIUS,
  EXTRA_HEIGHT_ABOVE,
  FOOD_SAND_OFFSET,
  MAX_FRAME_DT_SEC,
  PUFF_ATTACK_MS,
  PUFF_DURATION_MS,
  PUFF_RELEASE_MS,
  PORTRAIT_ZOOM,
  REDUCED_WOBBLE,
  SAND_Y,
  SECOND_MS,
  SHINY_SPARKLES_PER_SEC,
  TANK_HEIGHT,
  TANK_WIDTH,
} from '../game/constants';
import { getSpecies, getVariant } from '../game/species';
import type { Fish, GameState, Tank, ThemeId } from '../game/types';
import { createActor, isSad, pitchOf, setSwimExtent, updateActor, type FishActor, type FoodTarget } from './behavior';
import { drawFish, fishHalfHeight, FISH_ART, fishScale, mouthOffset } from './drawFish';
import { dropShadow } from './paint';
import {
  bakeBackLayer,
  bakeFrontLayer,
  drawAlgae,
  drawBubbler,
  drawCaustics,
  drawFrontPlants,
  drawGlass,
  drawLightRays,
  drawSurface,
  THEME_PALETTES,
  type Extent,
  type ThemePalette,
  WORLD_EXTENT,
} from './drawTank';
import { chestOpenAmount, DECOR_BOUNDS, drawDecor } from './drawDecor';
import { drawThemeScenery } from './drawScenery';
import { drawEgg } from './drawEgg';
import { themeBackground } from './sprites';
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

/** Draws an image scaled to cover the box (cropping the overflow), anchored to the box's bottom center. */
function drawCover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * k;
  const dh = img.naturalHeight * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + h - dh, dw, dh);
}

function puffAmount(actor: FishActor, now: number): number {
  if (actor.inflateUntil <= 0) return 0;
  const start = actor.inflateUntil - PUFF_DURATION_MS;
  if (now < start) return 0;
  if (now < start + PUFF_ATTACK_MS) return (now - start) / PUFF_ATTACK_MS;
  if (now < actor.inflateUntil) return 1;
  return Math.max(0, 1 - (now - actor.inflateUntil) / PUFF_RELEASE_MS);
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
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
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
    const baseY = SAND_Y + DECOR_BASE_OFFSET;
    for (let i = tank.decor.length - 1; i >= 0; i--) {
      const d = tank.decor[i]!;
      const [w, h] = DECOR_BOUNDS[d.decorId];
      if (Math.abs(x - d.x) <= w / 2 && y <= baseY && y >= baseY - h) return d.id;
    }
    return null;
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
    const text = drop.pearl ? `+${drop.value} ⚪` : `+${drop.value} 🐚`;
    this.particles.spawnPop(drop.x, SAND_Y - 4, text, drop.pearl ? '#8a6be0' : '#e07a5f');
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

  /** Visual-only reaction to a click (puffers inflate). */
  poke(fishId: string): void {
    const actor = this.actors.get(fishId);
    if (actor && getSpecies(actor.speciesId).traits.includes('inflates')) actor.inflateUntil = performance.now() + PUFF_DURATION_MS;
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
    const dt = Math.min(MAX_FRAME_DT_SEC, Math.max(0, (t - this.last) / SECOND_MS));
    this.last = t;
    const game = this.deps.getGame();
    const tank = game.tanks.find((tk) => tk.id === game.activeTankId) ?? game.tanks[0];
    if (tank) {
      this.update(game, tank, t, dt);
      this.draw(game, tank, t);
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
      if (d.decorId !== 'chest') continue;
      const open = chestOpenAmount(now, d.x);
      if (open > 0.3 && !this.openChests.has(d.id)) {
        this.openChests.add(d.id);
        const puffs = reduced ? 2 : 7;
        for (let i = 0; i < puffs; i++) this.particles.spawnBubble(d.x + (Math.random() - 0.5) * 30, SAND_Y - 20 - Math.random() * 10, 2 + Math.random() * 3);
      } else if (open === 0) {
        this.openChests.delete(d.id);
      }
    }
    this.particles.update(dt, reduced);
  }

  private draw(game: GameState, tank: Tank, now: number): void {
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
    this.drawBaked('back', tank.theme, pal, px);
    if (!reduced) drawLightRays(ctx, pal, timeSec, view);
    this.drawBaked('front', tank.theme, pal, px);
    drawCaustics(ctx, pal, sceneTime, px, view);
    drawSurface(ctx, pal, sceneTime, px, view);
    drawBubbler(ctx, px);
    drawThemeScenery(ctx, tank.theme, timeSec, px, reduced);
    const selectedDecor = this.deps.getSelectedDecorId();
    for (const d of tank.decor) {
      if (d.id === selectedDecor) this.drawDecorSelection(d.decorId, d.x, timeSec, px);
      drawDecor(ctx, d.decorId, d.x, SAND_Y + DECOR_BASE_OFFSET, now, px);
    }
    const wallNow = Date.now();
    for (const egg of game.eggs) {
      if (egg.tankId === tank.id) drawEgg(ctx, egg, this.eggPosition(egg.id), wallNow, timeSec, px, reduced ? REDUCED_WOBBLE : 1);
    }
    for (const drop of tank.shells) drawDrop(ctx, drop, px, timeSec);
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
        pitch: getSpecies(f.speciesId).traits.includes('walksOnSand') ? 0 : pitchOf(actor),
        phase: actor.phase,
        blinking: now < actor.blinkUntil,
        sad: isSad(f),
        inflate: puffAmount(actor, now),
        glow: pal.glowFish ? getVariant(f.speciesId, f.variant).accent : null,
        px,
        dpr,
        wobbleAmp: reduced ? REDUCED_WOBBLE : 1,
        time: timeSec,
      });
    }
    for (const f of game.fish) {
      const actor = this.actors.get(f.id);
      if (actor?.indicator && f.tankId === tank.id) this.drawIndicator(actor, f, now, px);
    }
    drawFrontPlants(ctx, pal, sceneTime, px, view);
    // Scene-wide ambient light (e.g. moonlit blue at night) so decor and fish share the theme's lighting.
    if (pal.ambient) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = pal.ambient.alpha;
      ctx.fillStyle = pal.ambient.color;
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
      ctx.restore();
    }
    this.particles.drawMotes(ctx, pal.mote, timeSec);
    this.particles.drawHearts(ctx, px);
    this.particles.drawSparkles(ctx, px);
    this.particles.drawPops(ctx, px);
    drawAlgae(ctx, pal, tank.algaeSpots);
    drawGlass(ctx, view);
    ctx.restore();
  }

  /** Dashed glow box behind the selected decor, with ◀ ▶ drag hints. */
  private drawDecorSelection(decorId: keyof typeof DECOR_BOUNDS, x: number, timeSec: number, px: number): void {
    const { ctx } = this;
    const [w, h] = DECOR_BOUNDS[decorId];
    const baseY = SAND_Y + DECOR_BASE_OFFSET;
    const pad = 8 + Math.sin(timeSec * 4) * 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - pad, baseY - h - pad, w + pad * 2, h + pad, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
    ctx.setLineDash([6 * px, 5 * px]);
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.stroke();
    ctx.setLineDash([]);
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
    const picture = which === 'back' ? themeBackground(theme) : null;
    const key = `${which}:${theme}:${picture ? 'img' : 'drawn'}:${ext.x0.toFixed(1)},${ext.x1.toFixed(1)},${ext.y0.toFixed(1)},${ext.y1.toFixed(1)}:${this.scale.toFixed(4)}:${this.dpr}`;
    let layer = which === 'back' ? this.backLayer : this.frontLayer;
    if (!layer || layer.key !== key) {
      const canvas = document.createElement('canvas');
      const k = this.scale * this.dpr;
      canvas.width = Math.max(1, Math.round((ext.x1 - ext.x0) * k));
      canvas.height = Math.max(1, Math.round((ext.y1 - ext.y0) * k));
      const bctx = canvas.getContext('2d');
      if (bctx) {
        bctx.setTransform(k, 0, 0, k, -ext.x0 * k, -ext.y0 * k);
        if (picture) drawCover(bctx, picture, ext.x0, ext.y0, ext.x1 - ext.x0, SAND_Y + BACKGROUND_SAND_OVERLAP - ext.y0);
        else if (which === 'back') bakeBackLayer(bctx, pal, ext, px);
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
