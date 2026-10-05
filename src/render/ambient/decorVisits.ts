// Fish visiting decor: now and then an idle fish swims through a gap (the broken arch, the bubble curtain)
// or hovers at a favorite spot (clownfish love anemones). It only nudges the wander target (`seek`), so
// food, courtship and petting always win. Renderer-only; nothing is saved.
import { DECOR_VISIT_GAP, DECOR_VISIT_HOVER_MS, DECOR_VISIT_THROUGH_MS, DECOR_VISIT_FAVORITE_GAP } from '../../game/constants';
import { getSpecies } from '../../game/species';
import type { Fish } from '../../game/types';
import type { FishActor } from '../behavior';
import type { DecorAttractor } from './decorBehaviors';

interface Visit {
  x: number;
  y: number;
  until: number;
  /** Swimming through: once at the gap, carry on to this x on the other side. */
  exitX: number | null;
}

/** Close enough to the gap to carry on through it (tank units). */
const ARRIVED = 22;
/** How far past the gap a fish swims. */
const THROUGH_DISTANCE = 140;
/** Hovering fish bob around the spot by this much. */
const HOVER_WOBBLE = 10;

const between = (rng: () => number, [a, b]: readonly [number, number]) => a + rng() * (b - a);

export class DecorVisits {
  private readonly visits = new Map<string, Visit>();
  private nextAt = 0;
  private nextFavoriteAt = 0;
  private readonly point = { x: 0, y: 0 };

  constructor(private readonly rng: () => number = Math.random) {}

  update(now: number, attractors: readonly DecorAttractor[], fish: readonly Fish[], actors: Map<string, FishActor>, busy: (fishId: string) => boolean): void {
    for (const [id, v] of this.visits) {
      const actor = actors.get(id);
      if (!actor || now >= v.until || busy(id)) {
        this.visits.delete(id);
        continue;
      }
      if (v.exitX !== null && Math.hypot(actor.x - v.x, actor.y - v.y) < ARRIVED) {
        v.x = v.exitX;
        v.exitX = null;
      }
    }
    if (attractors.length === 0) return;
    // Favorites first: a species that loves a spot (clownfish → anemone) visits often.
    if (now >= this.nextFavoriteAt) {
      this.nextFavoriteAt = now + between(this.rng, DECOR_VISIT_FAVORITE_GAP);
      for (const a of attractors) {
        if (!a.species) continue;
        const f = this.pick(fish, actors, busy, (ff) => ff.speciesId === a.species);
        if (f) this.start(f.id, a, actors.get(f.id)!, now);
      }
    }
    if (now >= this.nextAt) {
      this.nextAt = now + between(this.rng, DECOR_VISIT_GAP);
      const a = attractors[Math.floor(this.rng() * attractors.length)]!;
      const f = this.pick(fish, actors, busy, (ff) => !a.species || ff.speciesId === a.species || a.kind === 'through');
      if (f) this.start(f.id, a, actors.get(f.id)!, now);
    }
  }

  /** Where this fish is heading for its visit (shared point; read immediately), or undefined. */
  seek(fishId: string, now: number): { x: number; y: number } | undefined {
    const v = this.visits.get(fishId);
    if (!v) return undefined;
    this.point.x = v.x;
    this.point.y = v.y + (v.exitX === null ? Math.sin(now / 700) * HOVER_WOBBLE * 0.3 : 0);
    return this.point;
  }

  private start(fishId: string, a: DecorAttractor, actor: FishActor, now: number): void {
    const through = a.kind === 'through';
    const dir = actor.x < a.x ? 1 : -1;
    this.visits.set(fishId, {
      x: a.x,
      y: a.y + (through ? 0 : (this.rng() - 0.5) * HOVER_WOBBLE),
      until: now + (through ? DECOR_VISIT_THROUGH_MS : DECOR_VISIT_HOVER_MS),
      exitX: through ? a.x + dir * THROUGH_DISTANCE : null,
    });
  }

  /** A random idle swimmer (no jellies, no sand-walkers) matching `ok`. */
  private pick(fish: readonly Fish[], actors: Map<string, FishActor>, busy: (fishId: string) => boolean, ok: (f: Fish) => boolean): Fish | null {
    const candidates = fish.filter((f) => {
      if (this.visits.has(f.id) || busy(f.id) || !actors.has(f.id) || !ok(f)) return false;
      const traits = getSpecies(f.speciesId).traits;
      return !traits.includes('jelly') && !traits.includes('walksOnSand');
    });
    return candidates.length > 0 ? candidates[Math.floor(this.rng() * candidates.length)]! : null;
  }
}
