// Petting, tricks, "say hi", follow mode and the welcome-back greeting: the renderer-side state and effects.
// Owned by the Renderer; it decides what each fish steers toward (pet / seek), how it's posed, and draws the
// heart-ring meter. Rewards are decided by the store (via onComplete); nothing here is saved.
import {
  FOLLOW_MS,
  GREET_MS,
  HELLO_COOLDOWN_MS,
  HELLO_LINGER_MS,
  HELLO_RADIUS,
  PET_HEART_GAP_S,
  SAND_Y,
  TRICK_DURATION_MS,
} from '../game/constants';
import { playableTricks, sessionsLeft, type TrickId } from '../game/bond';
import { getSpecies } from '../game/species';
import type { BondLevel, Fish } from '../game/types';
import { jellyHappy, swimBounds, type FishActor, type PetInput } from './behavior';
import { fishHalfHeight, mouthOffset } from './drawFish';
import { PetMeter, StrokeDetector, trickPose, trickVisual, type TrickPose, type TrickVisual } from './petting';
import { heartPath, RAINBOW, type Particles } from './particles';

type Ctx = CanvasRenderingContext2D;

/** What a completed pet session earned (from the store). */
export interface PetOutcome {
  rewarded: boolean;
}

interface Petting {
  fishId: string;
  /** Pointer in tank units. */
  x: number;
  y: number;
  meter: PetMeter;
  heartAcc: number;
  sparkleAcc: number;
  startedAt: number;
  /** The rewarded sessions were used up when this one started: show "😌 content" instead of the meter. */
  content: boolean;
  /** 0..1 eased stroking (drives the wiggle). */
  wiggle: number;
}

interface Trick {
  visual: TrickVisual;
  start: number;
  /** A one-shot effect (heart bubble, splash) already fired. */
  fired: number;
  /** Where the fish swims during hoop/zoom. */
  seek: { x: number; y: number } | null;
}

/** Axolotls roll onto their back while petted; this is how long the roll takes. */
const ROLL_MS = 450;
/** Petted jellies glow on this beat. */
const JELLY_GLOW_GAP_MS = 1200;
/** Sparkles at the pointer while petting (per second). */
const POINTER_SPARKLES_PER_SEC = 6;
/** Hearts in the burst when a session completes, and on a bond level-up. */
const SESSION_HEARTS = 8;
const LEVEL_UP_HEARTS = 16;
/** A bond level-up's trick demo starts after the burst. */
const DEMO_DELAY_MS = 700;
/** Greeting: fish line up in the middle of the water, this far apart. */
const GREET_SPACING = 70;
const GREET_Y_FRAC = 0.45;
/** How far ahead of the fish the Bubble Hoop appears, and how far the zoom dash goes. */
const HOOP_AHEAD = 80;
const ZOOM_AHEAD = 220;
/** The koi leaps until its middle reaches the water line (its top half breaks the surface). */
const LEAP_TOP_Y = 14;

export class BondFx {
  private pet: Petting | null = null;
  private readonly stroke = new StrokeDetector();
  private readonly tricks = new Map<string, Trick>();
  private readonly hello = new Map<string, { until: number; x: number; y: number }>();
  private readonly helloCooldown = new Map<string, number>();
  private follow: { fishId: string; until: number } | null = null;
  private readonly greeting = new Map<string, { until: number; x: number; y: number }>();
  private readonly demos: { fishId: string; at: number; trick: Exclude<TrickId, 'follow'> }[] = [];
  /** Where the player last touched the water (follow mode on phones, where there's no hover pointer). */
  private lastTouch: { x: number; y: number } | null = null;
  private readonly petInput: PetInput = { x: 0, y: 0, follow: true, wiggle: 0 };
  private readonly seekPoint = { x: 0, y: 0 };
  private readonly pose: TrickPose = { rot: 0, dx: 0, dy: 0, scale: 1, wave: 1 };

  constructor(private readonly particles: Particles) {}

  // -------------------------------------------------------------------------
  // Commands (from TankView / the store's bond events)
  // -------------------------------------------------------------------------

  /** Starts petting `fish` with the pointer at (x, y). */
  start(fish: Fish, x: number, y: number, now: number): void {
    this.pet = { fishId: fish.id, x, y, meter: new PetMeter(), heartAcc: 0, sparkleAcc: 0, startedAt: now, content: sessionsLeft(fish, Date.now()) === 0, wiggle: 0 };
    this.stroke.reset();
    this.stroke.move(x, now);
    this.lastTouch = { x, y };
  }

  move(x: number, y: number, now: number): void {
    this.lastTouch = { x, y };
    if (!this.pet) return;
    this.pet.x = x;
    this.pet.y = y;
    this.stroke.move(x, now);
  }

  /** Ends petting. An unfinished meter is simply lost; the fish gives a little wiggle. */
  end(actors: Map<string, FishActor>, now: number): string | null {
    const pet = this.pet;
    this.pet = null;
    if (!pet) return null;
    const actor = actors.get(pet.fishId);
    if (actor && pet.meter.progress > 0) actor.pokeAt = now;
    return pet.fishId;
  }

  get pettingId(): string | null {
    return this.pet?.fishId ?? null;
  }

  /** 0..1 meter progress of the current session (for the FishCard's live region). */
  get progress(): number {
    return this.pet?.meter.progress ?? 0;
  }

  playTrick(fishId: string, trick: Exclude<TrickId, 'follow'>, fish: Fish | undefined, actor: FishActor | undefined, now: number): void {
    if (!fish || !actor) return;
    const visual = trickVisual(trick, fish.speciesId);
    const t: Trick = { visual, start: now, fired: 0, seek: null };
    const side = actor.facing >= 0 ? 1 : -1;
    const b = swimBounds(fish.speciesId);
    const clampX = (x: number) => Math.min(b.maxX, Math.max(b.minX, x));
    if (visual === 'hoop') {
      const rx = clampX(actor.x + side * HOOP_AHEAD);
      this.particles.spawnRing(rx, actor.y, fishHalfHeight(fish.speciesId, fish.stage) * 2.4, TRICK_DURATION_MS / 1000 + 0.6);
      t.seek = { x: clampX(rx + side * HOOP_AHEAD), y: actor.y };
      actor.dartUntil = now + TRICK_DURATION_MS * 0.6;
    } else if (visual === 'zoom') {
      t.seek = { x: clampX(actor.x + side * ZOOM_AHEAD), y: actor.y };
      actor.dartUntil = now + TRICK_DURATION_MS * 0.8;
    } else if (visual === 'puffPop') {
      actor.inflateUntil = now + TRICK_DURATION_MS * 0.8;
    } else if (visual === 'rainbowGlow' && actor.jelly) {
      jellyHappy(actor.jelly, now);
    }
    this.tricks.set(fishId, t);
  }

  setFollow(fishId: string, until: number | null): void {
    if (until === null) {
      if (this.follow?.fishId === fishId) this.follow = null;
      return;
    }
    // `until` is wall-clock; convert to the renderer clock.
    this.follow = { fishId, until: performance.now() + Math.max(0, Math.min(FOLLOW_MS, until - Date.now())) };
  }

  /** Back after a while: these fish swim to the front glass and wiggle hello. */
  greet(fishIds: readonly string[], viewCenterX: number, now: number): void {
    fishIds.forEach((id, i) => {
      const offset = (i - (fishIds.length - 1) / 2) * GREET_SPACING;
      this.greeting.set(id, { until: now + GREET_MS, x: viewCenterX + offset, y: SAND_Y * GREET_Y_FRAC });
    });
  }

  /** A tap on empty water: Curious+ fish nearby swim over to say hi. */
  sayHi(x: number, y: number, fish: Fish[], actors: Map<string, FishActor>, now: number): void {
    this.lastTouch = { x, y };
    for (const f of fish) {
      const actor = actors.get(f.id);
      if (actor && f.bondLevel >= 1 && Math.hypot(actor.x - x, actor.y - y) < HELLO_RADIUS * 1.5) this.startHello(f.id, x, y, now);
    }
  }

  /** A bond level-up: a big heart burst, then a demo of the new trick. */
  celebrate(fish: Fish, actor: FishActor | undefined, level: BondLevel, now: number, reduced: boolean): void {
    if (!actor) return;
    const gold = level === 5;
    this.particles.spawnHeartBurst(actor.x, actor.y, reduced ? LEVEL_UP_HEARTS / 2 : LEVEL_UP_HEARTS, 140, gold);
    for (let i = 0; i < 8; i++) this.particles.spawnSparkle(actor.x + (Math.random() - 0.5) * 60, actor.y + (Math.random() - 0.5) * 40);
    const demo: Exclude<TrickId, 'follow'> | null = level === 2 ? 'spin' : level === 3 ? 'hoop' : level === 5 ? 'signature' : null;
    if (demo) this.demos.push({ fishId: fish.id, at: now + DEMO_DELAY_MS, trick: demo });
    else if (playableTricks(fish).length === 0) this.particles.spawnHeart(actor.x, actor.y - 30, 1.4, gold);
  }

  /** A completed session: a heart burst, a "+3 💕" (or "😌") pop and a tiny happy spin (the renderer spins it). */
  completed(actor: FishActor, fish: Fish, outcome: PetOutcome, reduced: boolean): void {
    const top = actor.y - fishHalfHeight(fish.speciesId, fish.stage) - 10;
    this.particles.spawnHeartBurst(actor.x, actor.y, reduced ? SESSION_HEARTS / 2 : SESSION_HEARTS, 110);
    this.particles.spawnPop(actor.x, top, outcome.rewarded ? '+3 💕' : '😌', outcome.rewarded ? '#e0457b' : '#5a8fd8');
    if (this.pet && this.pet.fishId === fish.id) this.pet.content = !outcome.rewarded || sessionsLeft(fish, Date.now()) <= 0;
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------

  /**
   * Advances the meter, hearts and sparkles, hover hellos, tricks and timers. Returns the id of a fish whose
   * pet session just completed (the caller asks the store for the reward), or null.
   */
  update(dtSec: number, now: number, fish: Fish[], actors: Map<string, FishActor>, pointer: { x: number; y: number } | null, reduced: boolean, playTrick: (fishId: string, trick: Exclude<TrickId, 'follow'>) => void): string | null {
    let completedId: string | null = null;
    const pet = this.pet;
    if (pet) {
      const actor = actors.get(pet.fishId);
      const f = fish.find((ff) => ff.id === pet.fishId);
      if (!actor || !f) {
        this.pet = null;
      } else {
        const stroking = this.stroke.stroking(now);
        pet.wiggle += ((stroking ? 1 : 0) - pet.wiggle) * Math.min(1, dtSec * 6);
        if (pet.meter.advance(dtSec * 1000, stroking)) completedId = pet.fishId;
        // Hearts float up from the fish; soft sparkles where the finger is.
        pet.heartAcc += dtSec;
        const gap = PET_HEART_GAP_S * (reduced ? 3 : 1);
        if (pet.heartAcc >= gap) {
          pet.heartAcc -= gap;
          this.particles.spawnHeart(actor.x + (Math.random() - 0.5) * 20, actor.y - fishHalfHeight(f.speciesId, f.stage) - 6, 0.8);
        }
        pet.sparkleAcc += dtSec * POINTER_SPARKLES_PER_SEC * (reduced ? 0.3 : 1);
        while (pet.sparkleAcc >= 1) {
          pet.sparkleAcc -= 1;
          this.particles.spawnSparkle(pet.x + (Math.random() - 0.5) * 22, pet.y + (Math.random() - 0.5) * 22, '#ffd1e3');
        }
        if (actor.jelly && now - actor.jelly.flashAt > JELLY_GLOW_GAP_MS) actor.jelly.flashAt = now;
      }
    }

    // Desktop hover: Curious+ fish swim over to say hi (now and then).
    if (pointer && !pet) {
      for (const f of fish) {
        if (f.bondLevel < 1) continue;
        const actor = actors.get(f.id);
        if (actor && Math.hypot(actor.x - pointer.x, actor.y - pointer.y) < HELLO_RADIUS) this.startHello(f.id, pointer.x, pointer.y, now);
      }
    }

    for (const [id, h] of this.hello) if (now >= h.until) this.hello.delete(id);
    for (const [id, g] of this.greeting) if (now >= g.until) this.greeting.delete(id);
    if (this.follow && now >= this.follow.until) this.follow = null;

    for (const [id, t] of this.tricks) {
      const actor = actors.get(id);
      const f = fish.find((ff) => ff.id === id);
      const p = (now - t.start) / TRICK_DURATION_MS;
      if (!actor || !f || p >= 1) {
        this.tricks.delete(id);
        continue;
      }
      this.trickEffects(t, p, actor, f, reduced);
    }

    for (let i = this.demos.length - 1; i >= 0; i--) {
      const d = this.demos[i]!;
      if (now < d.at) continue;
      this.demos.splice(i, 1);
      playTrick(d.fishId, d.trick);
    }
    return completedId;
  }

  /** Steering for this fish: being petted, or a point to swim toward (trick, follow, greeting, hello). */
  steer(fishId: string, pointer: { x: number; y: number } | null, reduced: boolean): { pet?: PetInput; seek?: { x: number; y: number } } {
    const pet = this.pet;
    if (pet && pet.fishId === fishId) {
      this.petInput.x = pet.x;
      this.petInput.y = pet.y;
      this.petInput.follow = !reduced;
      this.petInput.wiggle = reduced ? 0 : pet.wiggle;
      return { pet: this.petInput };
    }
    const trick = this.tricks.get(fishId);
    if (trick?.seek) return { seek: trick.seek };
    if (this.follow?.fishId === fishId) {
      const target = pointer ?? this.lastTouch;
      if (target) return { seek: this.at(target.x, target.y) };
    }
    const greet = this.greeting.get(fishId);
    if (greet) return { seek: this.at(greet.x, greet.y) };
    const hello = this.hello.get(fishId);
    if (hello) return { seek: this.at(hello.x, hello.y) };
    return {};
  }

  /**
   * How to pose the fish this frame (around its center): tricks, the greeting wiggle, petting flavor
   * (stroking wiggle, axolotl roll, betta fin fan). Null when at rest.
   */
  poseFor(fish: Fish, actor: FishActor, now: number, reduced: boolean): TrickPose | null {
    const trick = this.tricks.get(fish.id);
    if (trick) {
      const leap = trick.visual === 'leap' ? Math.max(0, actor.y - LEAP_TOP_Y) : 0;
      return trickPose(trick.visual, (now - trick.start) / TRICK_DURATION_MS, actor.facing, reduced, leap, this.pose);
    }
    const greet = this.greeting.get(fish.id);
    if (greet && Math.hypot(actor.x - greet.x, actor.y - greet.y) < 40) {
      const t = ((now % 1000) / 1000) * 0.999;
      trickPose('wiggle', t, actor.facing, reduced, 0, this.pose);
      this.pose.scale *= 1.1;
      return this.pose;
    }
    const pet = this.pet;
    if (pet && pet.fishId === fish.id) {
      const p = this.pose;
      p.rot = 0;
      p.dx = 0;
      p.dy = 0;
      p.scale = 1;
      p.wave = 1;
      const species = getSpecies(fish.speciesId);
      if (species.traits.includes('walksOnSand') && !reduced) {
        const roll = Math.min(1, (now - pet.startedAt) / ROLL_MS);
        p.rot = roll * Math.PI * (actor.facing >= 0 ? -1 : 1);
      } else if (!reduced) {
        p.rot = Math.sin(now / 90) * 0.12 * pet.wiggle;
      }
      if (species.traits.includes('bigFins')) p.wave = 2.5;
      return p;
    }
    return null;
  }

  /** Petted: happy closed eyes. */
  happyEyes(fishId: string): boolean {
    return this.pet?.fishId === fishId;
  }

  /** Petted puffers puff up a little. */
  minInflate(fish: Fish): number {
    return this.pet?.fishId === fish.id && getSpecies(fish.speciesId).traits.includes('inflates') ? 0.45 : 0;
  }

  /** The jelly's signature: a rainbow shimmer (drawn as shiny). */
  rainbow(fishId: string): boolean {
    return this.tricks.get(fishId)?.visual === 'rainbowGlow';
  }

  /** The heart-ring meter around the pointer, or "😌 content" above the fish once the hour's rewards are used. */
  draw(ctx: Ctx, actors: Map<string, FishActor>, fish: Fish[], px: number, timeSec: number, emojiFont: string): void {
    const pet = this.pet;
    if (!pet) return;
    if (pet.content) {
      const actor = actors.get(pet.fishId);
      const f = fish.find((ff) => ff.id === pet.fishId);
      if (!actor || !f) return;
      ctx.save();
      ctx.font = `800 15px Nunito, system-ui, sans-serif, ${emojiFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4 * px;
      ctx.strokeStyle = '#ffffff';
      const y = actor.y - fishHalfHeight(f.speciesId, f.stage) - 22 + Math.sin(timeSec * 2) * 2;
      ctx.strokeText('😌 content', actor.x, y);
      ctx.fillStyle = '#4b6fb3';
      ctx.fillText('😌 content', actor.x, y);
      ctx.restore();
      return;
    }
    const r = 26 * px;
    const p = pet.meter.progress;
    ctx.save();
    ctx.translate(pet.x, pet.y);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = 7 * px;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();
    if (p > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.lineWidth = 5 * px;
      ctx.strokeStyle = '#ff5d93';
      ctx.stroke();
      // A little heart riding the head of the arc.
      const a = -Math.PI / 2 + p * Math.PI * 2;
      ctx.save();
      ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
      ctx.scale(px * 0.9, px * 0.9);
      ctx.beginPath();
      heartPath(ctx, 1);
      ctx.fillStyle = '#ff5d93';
      ctx.fill();
      ctx.restore();
    }
    // A heart in the middle that beats faster as the meter fills.
    const beat = 1 + 0.12 * Math.sin(timeSec * (6 + p * 8));
    ctx.scale(px * 1.1 * beat, px * 1.1 * beat);
    ctx.beginPath();
    heartPath(ctx, 1);
    ctx.fillStyle = 'rgba(255, 143, 177, 0.9)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#d9577f';
    ctx.stroke();
    ctx.restore();
  }

  // -------------------------------------------------------------------------

  private startHello(fishId: string, x: number, y: number, now: number): void {
    if ((this.helloCooldown.get(fishId) ?? 0) > now || this.pet?.fishId === fishId) return;
    this.helloCooldown.set(fishId, now + HELLO_COOLDOWN_MS);
    this.hello.set(fishId, { until: now + HELLO_LINGER_MS, x, y });
  }

  /** Reuses one point object for seek targets (read immediately by the behavior update). */
  private at(x: number, y: number): { x: number; y: number } {
    this.seekPoint.x = x;
    this.seekPoint.y = y;
    return this.seekPoint;
  }

  /** One-shot and continuous effects while a trick plays (p = progress 0..1). */
  private trickEffects(t: Trick, p: number, actor: FishActor, fish: Fish, reduced: boolean): void {
    const side = actor.facing >= 0 ? 1 : -1;
    switch (t.visual) {
      case 'heartBubble':
        if (t.fired === 0 && p > 0.3) {
          t.fired = 1;
          const mouth = mouthOffset(fish.speciesId, fish.stage);
          this.particles.spawnRing(actor.x + side * (mouth + 18), actor.y - 6, 20, 2.2, true);
        }
        break;
      case 'rainbowTwirl':
        if (!reduced) this.particles.spawnSparkle(actor.x - side * mouthOffset(fish.speciesId, fish.stage), actor.y + (Math.random() - 0.5) * 10, RAINBOW[Math.floor(p * 30) % RAINBOW.length]);
        break;
      case 'zoom':
        if (!reduced && Math.random() < 0.6) this.particles.spawnStreak(actor.x - side * mouthOffset(fish.speciesId, fish.stage), actor.y + (Math.random() - 0.5) * 16, 40, side);
        break;
      case 'leap':
        // Splashes as it breaks the surface and as it dives back in.
        if ((t.fired === 0 && p > 0.3) || (t.fired === 1 && p > 0.75)) {
          t.fired += 1;
          this.particles.spawnChips(actor.x, 2, '#bfe9ff', reduced ? 4 : 10);
          for (let i = 0; i < 4; i++) this.particles.spawnBubble(actor.x + (Math.random() - 0.5) * 30, 14, 2 + Math.random() * 2);
        }
        break;
      case 'puffPop':
        if (t.fired === 0 && p > 0.85) {
          t.fired = 1;
          for (let i = 0; i < 6; i++) this.particles.spawnBubble(actor.x + (Math.random() - 0.5) * 30, actor.y + (Math.random() - 0.5) * 20, 2 + Math.random() * 2);
        }
        break;
      case 'rainbowGlow':
        if (!reduced && Math.random() < 0.4) this.particles.spawnSparkle(actor.x + (Math.random() - 0.5) * 50, actor.y + (Math.random() - 0.5) * 50, RAINBOW[Math.floor(Math.random() * RAINBOW.length)]);
        break;
      default:
        break;
    }
  }
}
