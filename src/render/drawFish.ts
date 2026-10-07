// Painterly, cel-shaded fish (Breath-of-the-Wild-inspired): naturalistic silhouettes, cool two-step
// shadows, warm highlight bands, soft rim light, translucent rayed fins, painted scale texture.
// Every species faces +x in its own design space; drawFish() handles position, flip, tilt and scale.
import {
  FISH_ART_SCALE,
  MIN_FLIP_SCALE,
  OUTLINE_PX,
  SAD_DROOP,
  SAD_TEAR_PERIOD_S,
  EYE_LOOK_RANGE,
  SAD_WAVE_DAMP,
  SPRITE_NIGHT_GLOW_PX,
  SPRITE_PUFF_X,
  SPRITE_PUFF_Y,
  EYE_HIGHLIGHT,
  EYE_PUPIL,
  SPRITE_SHINY_GLOW_PX,
  SPRITE_SIZE_BUCKET_PX,
  SPRITE_WAVE_STRIPS,
  STAGE_SCALE,
} from '../game/constants';
import { getSpecies, SHINY_OUTLINE, SHINY_SPARKLE } from '../game/species';
import type { FishVariant, SpeciesId, SpriteEye, Stage } from '../game/types';
import { bodyBob, pupilOffset, squashStretch, stripOffset, waveAmplitude } from './fishMotion';
import { fishSprite, huedSprite, samplePixels, type Sprite } from './sprites';
import { clawConfig, splitSprite, type ClawAngles, type SplitSprite } from './clawSplit';
import { drawJelly, type JellyDrawState } from './drawJelly';
import { COOL_SHADOW, glossHighlight, GLOSS_SATURATION, hashSeq, mix, RIM_LIGHT, rgba, saturate, WARM_LIGHT } from './paint';

/** Eye size multipliers (big, expressive cartoon eyes). */
const EYE_SCALE = 2.05;
const EYE_SCALE_BEAD = 1.6;

/** Vertical stretch for chunkier, rounder cartoon fish. */
const FISH_CHUNK = 1.14;

export interface FishDrawParams {
  speciesId: SpeciesId;
  variant: FishVariant;
  shiny: boolean;
  stage: Stage;
  /** -1 (facing left) .. 1 (facing right); passes through 0 while flipping. */
  facing: number;
  /** Nose-up/down angle in radians (positive = nose down). */
  pitch: number;
  /** Body-wave phase in radians; advances faster when swimming fast. */
  phase: number;
  /** Speed relative to the species' cruise speed (0 idle, 1 cruising, more when darting). */
  speedFrac: number;
  /** Acceleration stretch 0..1, eating squash 0..1, and click bounce (signed scale offset). */
  stretch: number;
  eat: number;
  bounce: number;
  /** Point the eyes look at, in tank units. */
  gaze: { x: number; y: number };
  blinking: boolean;
  sad: boolean;
  /** 0..1 eased sadness for sprites (heavy lid, worried brow, tear, limp body); defaults to `sad`. */
  gloom?: number;
  /** Puffer inflation 0..1. */
  inflate: number;
  /** Night theme glow color, or null. */
  glow: string | null;
  /** Crab claws: rotation of each claw about its wrist (radians), or absent for a still pose. */
  claws?: ClawAngles;
  /** Tank units per CSS pixel (so outlines stay ~2px on screen). */
  px: number;
  /** Device pixels per CSS pixel (shadowBlur ignores transforms). */
  dpr: number;
  /** 1 normally, smaller with reduced motion (scales the body wave, wobble and bob). */
  wobbleAmp: number;
  /** Seconds, for twinkles. */
  time: number;
  /** Jellyfish pulse/tentacle state (rest pose when absent). */
  jelly?: JellyDrawState;
}

/**
 * Per-species metadata in design units (before stage scale and FISH_ART_SCALE). `spriteLen` is the
 * PNG sprite's drawn length, tail tip to nose; the sprite's nose sits at `mouthX`.
 */
export const FISH_ART: Record<SpeciesId, { mouthX: number; halfHeight: number; spriteLen: number }> = {
  danio: { mouthX: 22, halfHeight: 10, spriteLen: 50 },
  guppy: { mouthX: 16, halfHeight: 13, spriteLen: 46 },
  goldfish: { mouthX: 20, halfHeight: 20, spriteLen: 50 },
  tetra: { mouthX: 18, halfHeight: 9, spriteLen: 44 },
  betta: { mouthX: 20, halfHeight: 22, spriteLen: 56 },
  angelfish: { mouthX: 18, halfHeight: 36, spriteLen: 62 },
  // Jelly: spriteLen is the width (it faces the viewer), mouthX half of it; see jellyMotion.jellySize.
  jellyfish: { mouthX: 24, halfHeight: 33, spriteLen: 48 },
  clownfish: { mouthX: 22, halfHeight: 13, spriteLen: 50 },
  puffer: { mouthX: 19, halfHeight: 19, spriteLen: 46 },
  axolotl: { mouthX: 31, halfHeight: 16, spriteLen: 72 },
  koi: { mouthX: 34, halfHeight: 14, spriteLen: 74 },
  cory: { mouthX: 20, halfHeight: 14, spriteLen: 46 },
  cherry_shrimp: { mouthX: 14, halfHeight: 10, spriteLen: 34 },
  kuhli_loach: { mouthX: 28, halfHeight: 8, spriteLen: 64 },
  hatchetfish: { mouthX: 17, halfHeight: 18, spriteLen: 42 },
  crab: { mouthX: 0, halfHeight: 16, spriteLen: 40 },
};

/** Some babies are drawn even smaller than the stage scale (baby cherry shrimp are very tiny). */
const BABY_SPECIES_SCALE: Partial<Record<SpeciesId, number>> = { cherry_shrimp: 0.7 };

/** Phone portrait zooms the scene but leaves the fish small; this multiplies every fish (art, hit areas, mouths) alike. */
let viewBoost = 1;
export function setFishViewBoost(boost: number): void {
  viewBoost = boost;
}

export function fishScale(stage: Stage): number {
  return STAGE_SCALE[stage] * FISH_ART_SCALE * viewBoost;
}

/** Distance from the fish center to its mouth, in tank units. */
export function mouthOffset(speciesId: SpeciesId, stage: Stage): number {
  return FISH_ART[speciesId].mouthX * fishScale(stage);
}

export function fishHalfHeight(speciesId: SpeciesId, stage: Stage): number {
  return FISH_ART[speciesId].halfHeight * fishScale(stage);
}

const PUPIL = '#0f1117';
const IRIS = '#c99b3f';

interface Shades {
  dorsal: string;
  flank: string;
  belly: string;
  shadow: string;
  highlight: string;
  fin: string;
  finEdge: string;
  accent: string;
  outline: string;
  iris: string;
}

const shadeCache = new Map<FishVariant, Shades>();

function shadesFor(v: FishVariant): Shades {
  const cached = shadeCache.get(v);
  if (cached) return cached;
  const sat = (c: string) => saturate(c, GLOSS_SATURATION * 1.15);
  const body = sat(v.body);
  const fin = sat(v.fin);
  const shades: Shades = {
    dorsal: mix(body, '#1a1030', 0.18),
    flank: body,
    belly: mix(sat(v.belly), '#ffffff', 0.15),
    shadow: mix(body, '#1a1030', 0.35),
    highlight: mix(body, '#ffffff', 0.45),
    fin,
    finEdge: mix(fin, '#1a1030', 0.5),
    accent: sat(v.accent),
    outline: mix(body, '#1a1030', 0.55),
    iris: mix(IRIS, body, 0.25),
  };
  shadeCache.set(v, shades);
  return shades;
}

// ---------------------------------------------------------------------------
// Painting context and shared building blocks
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

interface Paint {
  ctx: Ctx;
  sh: Shades;
  outline: string;
  lw: number;
  glow: string | null;
  glowBlur: number;
  eyeBoost: number;
  /** Tail swing angle (radians). */
  wob: number;
  p: FishDrawParams;
}

interface Bounds {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

interface Profile {
  nose: [number, number];
  /** Dorsal (top) peak height and its x. */
  top: number;
  topX: number;
  /** Ventral (bottom) depth and its x. */
  bottom: number;
  bottomX: number;
  /** Caudal peduncle (tail root) x and half-height. */
  pedX: number;
  ped: number;
}

interface BodyPaths {
  /** Closed shape for filling and clipping. */
  fill: Path2D;
  /** Open outline that skips the tail root, so no seam shows where the tail attaches. */
  edge: Path2D;
}

/** A naturalistic fish body: blunt nose, dorsal hump, belly curve, tapering to the tail root. */
function bodyPath(pr: Profile): BodyPaths {
  const [nx, ny] = pr.nose;
  const len = nx - pr.pedX;
  type Seg = [number, number, number, number, number, number];
  const top: [Seg, Seg] = [
    [nx, ny - pr.top * 0.55, pr.topX + len * 0.18, -pr.top, pr.topX, -pr.top],
    [pr.topX - len * 0.26, -pr.top, pr.pedX + len * 0.12, -pr.ped, pr.pedX, -pr.ped],
  ];
  const bottom: [Seg, Seg] = [
    [pr.pedX + len * 0.12, pr.ped, pr.bottomX - len * 0.26, pr.bottom, pr.bottomX, pr.bottom],
    [pr.bottomX + len * 0.2, pr.bottom, nx, ny + pr.bottom * 0.5, nx, ny],
  ];
  const fill = new Path2D();
  fill.moveTo(nx, ny);
  for (const seg of top) fill.bezierCurveTo(...seg);
  // Slightly rounded tail root instead of a straight cut.
  fill.quadraticCurveTo(pr.pedX - pr.ped * 0.45, 0, pr.pedX, pr.ped);
  for (const seg of bottom) fill.bezierCurveTo(...seg);
  fill.closePath();
  // Edge: tail root (top) → nose → tail root (bottom), the top curves reversed.
  const edge = new Path2D();
  edge.moveTo(pr.pedX, -pr.ped);
  edge.bezierCurveTo(top[1][2], top[1][3], top[1][0], top[1][1], top[0][4], top[0][5]);
  edge.bezierCurveTo(top[0][2], top[0][3], top[0][0], top[0][1], nx, ny);
  edge.bezierCurveTo(bottom[1][2], bottom[1][3], bottom[1][0], bottom[1][1], bottom[0][4], bottom[0][5]);
  edge.bezierCurveTo(bottom[0][2], bottom[0][3], bottom[0][0], bottom[0][1], pr.pedX, pr.ped);
  return { fill, edge };
}

function boundsOf(pr: Profile): Bounds {
  return { x0: pr.pedX, x1: pr.nose[0], top: -pr.top, bottom: pr.bottom };
}

/** Overlapping scale arcs, opening toward the tail. One path, two strokes (shade + sheen). */
function scales(c: Paint, b: Bounds, size: number, strength = 1): void {
  const { ctx } = c;
  const shade = new Path2D();
  const sheen = new Path2D();
  let row = 0;
  for (let y = b.top + size * 0.6; y < b.bottom; y += size * 0.78, row++) {
    const offset = row % 2 === 0 ? 0 : size * 0.55;
    for (let x = b.x0 + size * 1.4 + offset; x < b.x1 - size * 3.2; x += size * 1.1) {
      shade.moveTo(x + Math.cos(Math.PI * 0.62) * size, y + Math.sin(Math.PI * 0.62) * size);
      shade.arc(x, y, size, Math.PI * 0.62, Math.PI * 1.38);
      sheen.moveTo(x + 0.45 + Math.cos(Math.PI * 0.8) * size * 0.8, y + Math.sin(Math.PI * 0.8) * size * 0.8);
      sheen.arc(x + 0.45, y, size * 0.8, Math.PI * 0.8, Math.PI * 1.2);
    }
  }
  ctx.lineWidth = c.lw * 0.45;
  ctx.strokeStyle = rgba(c.sh.outline, 0.16 * strength);
  ctx.stroke(shade);
  ctx.strokeStyle = rgba(RIM_LIGHT, 0.14 * strength);
  ctx.stroke(sheen);
}

/**
 * Glossy cartoon body (CLAUDE.md "Art Style"): gradient light top → body → belly → darker bottom,
 * patterns, a faint scale sheen, a white gloss highlight at the top-left (toward the head), and a
 * thick outline in a darker shade of the body color.
 */
function shadeBody(
  c: Paint,
  body: Path2D | BodyPaths,
  b: Bounds,
  opts: { pattern?: () => void; scaleSize?: number; scaleStrength?: number; seed?: number } = {},
): void {
  const { ctx, sh } = c;
  const fill = body instanceof Path2D ? body : body.fill;
  const edge = body instanceof Path2D ? body : body.edge;
  const w = b.x1 - b.x0;
  const h = b.bottom - b.top;

  const base = ctx.createLinearGradient(0, b.top, 0, b.bottom);
  base.addColorStop(0, sh.highlight);
  base.addColorStop(0.35, sh.flank);
  base.addColorStop(0.72, mix(sh.flank, sh.belly, 0.55));
  base.addColorStop(1, mix(sh.belly, sh.shadow, 0.45));
  ctx.fillStyle = base;
  ctx.fill(fill);

  ctx.save();
  ctx.clip(fill);
  opts.pattern?.();
  if (opts.scaleSize) scales(c, b, opts.scaleSize, (opts.scaleStrength ?? 1) * 0.45);
  // Soft darker underside for roundness.
  const under = ctx.createLinearGradient(0, b.top + h * 0.55, 0, b.bottom);
  under.addColorStop(0, rgba(sh.shadow, 0));
  under.addColorStop(1, rgba(sh.shadow, 0.45));
  ctx.fillStyle = under;
  ctx.fillRect(b.x0 - 2, b.top + h * 0.55, w + 4, h);
  ctx.restore();

  // Gloss: big soft ellipse + crisp sparkle near the top, toward the head (screen top-left when facing left).
  glossHighlight(ctx, fill, [b.x0 + w * 0.32, b.top, w * 0.62, h * 0.9], 1);

  outlineStroke(c, edge);
}

function outlineStroke(c: Paint, path: Path2D, scale = 1): void {
  const { ctx } = c;
  if (c.glow) {
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = c.glowBlur;
  }
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = c.lw * scale;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(path);
  ctx.shadowBlur = 0;
}

/** Translucent fin: gradient fill from root to edge, faint rays, darker edge. */
function paintFin(
  c: Paint,
  path: Path2D,
  from: [number, number],
  to: [number, number],
  opts: { color?: string; opacity?: number; rays?: [number, number][]; edge?: string } = {},
): void {
  const { ctx } = c;
  const color = opts.color ?? c.sh.fin;
  const op = opts.opacity ?? 1;
  const g = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
  g.addColorStop(0, rgba(mix(color, '#1a1030', 0.12), 0.97 * op));
  g.addColorStop(0.6, rgba(color, 0.92 * op));
  g.addColorStop(1, rgba(mix(color, '#ffffff', 0.3), 0.85 * op));
  ctx.fillStyle = g;
  ctx.fill(path);
  if (opts.rays) {
    ctx.save();
    ctx.clip(path);
    ctx.beginPath();
    for (const [x, y] of opts.rays) {
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(c.sh.finEdge, 0.28 * op);
    ctx.lineWidth = c.lw * 0.4;
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = rgba(opts.edge ?? c.sh.finEdge, 0.95);
  ctx.lineWidth = c.lw * 0.75;
  ctx.lineJoin = 'round';
  ctx.stroke(path);
}

/** Ray endpoints spread along a segment. */
function raysAlong(a: [number, number], b: [number, number], n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

/** Runs `draw` translated to (x, y) and rotated by the tail wobble. */
function swinging(c: Paint, x: number, y: number, factor: number, draw: () => void): void {
  const { ctx } = c;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(c.wob * factor);
  draw();
  ctx.restore();
}

/**
 * Big, expressive glossy cartoon eye: large white eyeball with a thick outline, a colored iris ring,
 * a big dark pupil looking forward, and two sparkly highlights. (Bead eyes, e.g. axolotl, skip the white.)
 */
function eye(c: Paint, x: number, y: number, radius: number, opts: { iris?: string; bead?: boolean } = {}): void {
  const { ctx, sh } = c;
  const r = radius * c.eyeBoost * (opts.bead ? EYE_SCALE_BEAD : EYE_SCALE);
  if (c.p.blinking) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = sh.flank;
    ctx.fill();
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = c.lw * 0.6;
    ctx.stroke();
    // Happy closed eye: an upward arc.
    ctx.beginPath();
    ctx.arc(x, y + r * 0.25, r * 0.7, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = c.lw * 0.85;
    ctx.lineCap = 'round';
    ctx.stroke();
    return;
  }
  if (!opts.bead) {
    const white = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    white.addColorStop(0, '#ffffff');
    white.addColorStop(0.75, '#f4f7fc');
    white.addColorStop(1, '#cfd8ea');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = white;
    ctx.fill();
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = c.lw * 0.75;
    ctx.stroke();
  }
  // Pupil sits forward (toward the nose) so the fish looks where it's going.
  const ir = opts.bead ? r : r * 0.66;
  const ix = opts.bead ? x : x + r * 0.2;
  const iy = opts.bead ? y : y + r * 0.04;
  if (!opts.bead) {
    const irisColor = opts.iris ?? mix(sh.accent, '#1a1030', 0.25);
    const iris = ctx.createRadialGradient(ix, iy, ir * 0.35, ix, iy, ir);
    iris.addColorStop(0, mix(irisColor, '#ffffff', 0.25));
    iris.addColorStop(1, mix(irisColor, '#1a1030', 0.35));
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    ctx.fillStyle = iris;
    ctx.fill();
  }
  const pr = opts.bead ? r : ir * 0.62;
  const pupil = ctx.createRadialGradient(ix - pr * 0.3, iy - pr * 0.3, pr * 0.1, ix, iy, pr);
  pupil.addColorStop(0, '#3a3560');
  pupil.addColorStop(1, PUPIL);
  ctx.beginPath();
  ctx.arc(ix, iy, pr, 0, Math.PI * 2);
  ctx.fillStyle = pupil;
  ctx.fill();
  // Sparkles: a big shine top-left and a small one bottom-right.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(ix - ir * 0.32, iy - ir * 0.36, ir * 0.34, ir * 0.27, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ix + ir * 0.34, iy + ir * 0.32, ir * 0.13, 0, Math.PI * 2);
  ctx.fill();
  if (c.p.sad) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 1.02, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = sh.flank;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.2, y - r * 1.2);
    ctx.lineTo(x + r * 1.2, y - r * 1.2);
    ctx.lineTo(x + r * 1.2, y - r * 0.05);
    ctx.lineTo(x - r * 1.2, y - r * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.4);
    ctx.lineTo(x + r, y - r * 0.05);
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = c.lw * 0.7;
    ctx.stroke();
  }
}

/** Gill cover (operculum) arc behind the eye. */
function gill(c: Paint, x: number, top: number, bottom: number): void {
  const { ctx, sh } = c;
  const mid = (top + bottom) / 2;
  ctx.beginPath();
  ctx.moveTo(x + 1.2, top);
  ctx.quadraticCurveTo(x - 2.6, mid, x + 1.2, bottom);
  ctx.strokeStyle = rgba(sh.outline, 0.38);
  ctx.lineWidth = c.lw * 0.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 2, top + 0.6);
  ctx.quadraticCurveTo(x - 1.6, mid, x + 2, bottom - 0.6);
  ctx.strokeStyle = rgba(RIM_LIGHT, 0.22);
  ctx.lineWidth = c.lw * 0.45;
  ctx.stroke();
}

/** Small mouth notch at the nose. */
function mouth(c: Paint, nx: number, ny: number, size: number): void {
  const { ctx } = c;
  const w = size * 2.1;
  ctx.beginPath();
  if (c.p.sad) {
    // Small downturned mouth.
    ctx.moveTo(nx - w, ny + size * 1.2);
    ctx.quadraticCurveTo(nx - w * 0.5, ny + size * 0.25, nx - size * 0.1, ny + size * 0.9);
  } else {
    // Cheerful upturned smile curving back from the nose.
    ctx.moveTo(nx - size * 0.1, ny + size * 0.2);
    ctx.quadraticCurveTo(nx - w * 0.45, ny + size * 1.6, nx - w, ny + size * 0.35);
  }
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = c.lw * 0.7;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Pectoral fin that sculls with the swim phase, drawn over the body. */
function pectoral(c: Paint, x: number, y: number, len: number, height: number): void {
  const flap = Math.sin(c.p.phase * 1.4) * 0.35 * c.p.wobbleAmp;
  const { ctx } = c;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.35 + flap);
  const path = new Path2D();
  path.moveTo(0, 0);
  path.quadraticCurveTo(-len * 0.5, -height, -len, -height * 0.2);
  path.quadraticCurveTo(-len * 0.55, height * 0.6, 0, height * 0.35);
  path.closePath();
  paintFin(c, path, [0, 0], [-len, 0], { rays: raysAlong([-len, -height * 0.3], [-len * 0.6, height * 0.5], 4), opacity: 0.85 });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

function drawDanio(c: Paint): void {
  const { ctx, sh } = c;
  const pr: Profile = { nose: [22, 1], top: 7, topX: 3, bottom: 6.4, bottomX: 2, pedX: -17, ped: 2.3 };
  const b = boundsOf(pr);
  swinging(c, pr.pedX + 1, 0, 1, () => {
    const tail = new Path2D();
    tail.moveTo(1, -2.4);
    tail.quadraticCurveTo(-6, -4.5, -13, -9.5);
    tail.quadraticCurveTo(-9.5, -2, -9.8, 0);
    tail.quadraticCurveTo(-9.5, 2, -13, 9.5);
    tail.quadraticCurveTo(-6, 4.5, 1, 2.4);
    tail.closePath();
    paintFin(c, tail, [0, 0], [-13, 0], { rays: raysAlong([-13, -9], [-13, 9], 6) });
  });
  const dorsal = new Path2D();
  dorsal.moveTo(-2, -6.6);
  dorsal.quadraticCurveTo(-6, -12, -11.5, -9.6);
  dorsal.quadraticCurveTo(-10, -6, -9, -4.8);
  dorsal.closePath();
  paintFin(c, dorsal, [-3, -6], [-11, -10], { rays: raysAlong([-6, -11], [-11, -9.5], 3) });
  const anal = new Path2D();
  anal.moveTo(-1, 5.6);
  anal.quadraticCurveTo(-6, 10.5, -12, 8.4);
  anal.quadraticCurveTo(-10, 5, -9, 4.2);
  anal.closePath();
  paintFin(c, anal, [-2, 5], [-11, 9], { rays: raysAlong([-6, 10], [-11, 8.5], 3) });

  const body = bodyPath(pr);
  shadeBody(c, body, b, {
    scaleSize: 1.9,
    scaleStrength: 0.7,
    pattern: () => {
      // Zebra stripes: dark bands separated by pale golden lines, fading toward the head.
      const fade = ctx.createLinearGradient(b.x0, 0, b.x1, 0);
      fade.addColorStop(0, rgba(sh.accent, 0.95));
      fade.addColorStop(0.7, rgba(sh.accent, 0.85));
      fade.addColorStop(1, rgba(sh.accent, 0));
      ctx.fillStyle = fade;
      for (const [y, t] of [[-2.6, 1.3], [0.4, 1.5], [3.2, 1.1]] as const) {
        ctx.beginPath();
        ctx.moveTo(b.x0, y - t / 2 + 0.6);
        ctx.quadraticCurveTo(0, y - t / 2 - 0.4, 16, y - t / 2);
        ctx.lineTo(16, y + t / 2);
        ctx.quadraticCurveTo(0, y + t / 2 - 0.4, b.x0, y + t / 2 + 0.6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = rgba(WARM_LIGHT, 0.28);
      ctx.fillRect(b.x0, -1.4, 30, 0.7);
      ctx.fillRect(b.x0, 1.7, 30, 0.6);
    },
  });
  gill(c, 12.5, -4.4, 4.2);
  pectoral(c, 11, 3, 6, 2.2);
  eye(c, 16, -1.2, 2.4);
  mouth(c, 22, 1, 1.4);
}

function drawGuppy(c: Paint): void {
  const { ctx, sh } = c;
  const pr: Profile = { nose: [16, 1], top: 6.6, topX: 4, bottom: 7.2, bottomX: 4, pedX: -9, ped: 3 };
  const b = boundsOf(pr);
  swinging(c, pr.pedX + 1, 0, 1.15, () => {
    const ripple = Math.sin(c.p.phase * 1.5) * 2 * c.p.wobbleAmp;
    const tail = new Path2D();
    tail.moveTo(1, -2.8);
    tail.bezierCurveTo(-8, -10, -20, -16 + ripple, -27, -13);
    tail.quadraticCurveTo(-31 + ripple, 0, -27, 13);
    tail.bezierCurveTo(-20, 16 - ripple, -8, 10, 1, 2.8);
    tail.closePath();
    paintFin(c, tail, [0, 0], [-28, 0], { rays: raysAlong([-26, -13], [-26, 13], 9) });
    // Mosaic pattern on the tail.
    ctx.save();
    ctx.clip(tail);
    const rand = hashSeq(41);
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.ellipse(-8 - rand() * 18, (rand() - 0.5) * 22, 1 + rand() * 1.6, 0.8 + rand() * 1.2, rand(), 0, Math.PI * 2);
      ctx.fillStyle = rgba(sh.accent, 0.35 + rand() * 0.25);
      ctx.fill();
    }
    ctx.restore();
  });
  const dorsal = new Path2D();
  dorsal.moveTo(3, -6.3);
  dorsal.quadraticCurveTo(-3, -12, -11, -10);
  dorsal.quadraticCurveTo(-6, -7, -4, -5);
  dorsal.closePath();
  paintFin(c, dorsal, [2, -6], [-10, -10], { rays: raysAlong([-3, -11], [-10, -9.5], 4) });
  const body = bodyPath(pr);
  shadeBody(c, body, b, {
    scaleSize: 1.6,
    scaleStrength: 0.6,
    pattern: () => {
      // Colorful rear flank flush from the tail color.
      const g = ctx.createLinearGradient(b.x0, 0, 8, 0);
      g.addColorStop(0, rgba(sh.fin, 0.75));
      g.addColorStop(1, rgba(sh.fin, 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.x0, b.top, 20, b.bottom - b.top);
      ctx.beginPath();
      ctx.ellipse(-1, 1, 2.2, 1.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(sh.accent, 0.7);
      ctx.fill();
    },
  });
  gill(c, 8.5, -4.2, 4.6);
  pectoral(c, 7, 3, 5, 2);
  eye(c, 11, -1, 2.3);
  mouth(c, 16, 1, 1.2);
}

function drawGoldfish(c: Paint): void {
  const { ctx, sh } = c;
  const pr: Profile = { nose: [20, 2], top: 14, topX: 1, bottom: 12.5, bottomX: 0, pedX: -13, ped: 4 };
  const b = boundsOf(pr);
  swinging(c, pr.pedX + 1, 0, 1, () => {
    const r = Math.sin(c.p.phase * 1.2) * 2.5 * c.p.wobbleAmp;
    for (const dir of [-1, 1]) {
      const lobe = new Path2D();
      lobe.moveTo(1, dir * 1);
      lobe.bezierCurveTo(-6, dir * 7, -18, dir * (19 + r), -27, dir * (15 + r));
      lobe.quadraticCurveTo(-21, dir * 6, -12, dir * 0.5);
      lobe.closePath();
      paintFin(c, lobe, [0, 0], [-27, dir * 15], { rays: raysAlong([-27, dir * (15 + r)], [-14, dir * 1], 6), opacity: 0.9 });
    }
  });
  const dorsal = new Path2D();
  dorsal.moveTo(9, -12.8);
  dorsal.bezierCurveTo(4, -22 + Math.sin(c.p.phase) * 1.5, -6, -24, -11, -9.5);
  dorsal.closePath();
  paintFin(c, dorsal, [6, -12], [-6, -23], { rays: raysAlong([2, -22], [-10, -11], 5) });
  const pelvic = new Path2D();
  pelvic.moveTo(6, 11);
  pelvic.quadraticCurveTo(2, 18, -3, 17);
  pelvic.quadraticCurveTo(0, 13, 1, 11.5);
  pelvic.closePath();
  paintFin(c, pelvic, [5, 11], [-2, 17]);
  const body = bodyPath(pr);
  shadeBody(c, body, b, {
    scaleSize: 3.1,
    scaleStrength: 1.2,
    pattern: () => {
      const rand = hashSeq(7);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-8 + rand() * 18, -8 + rand() * 12, 3 + rand() * 3, 2 + rand() * 2.5, rand(), 0, Math.PI * 2);
        ctx.fillStyle = rgba(sh.accent, 0.22);
        ctx.fill();
      }
    },
  });
  gill(c, 11.5, -8, 7.5);
  pectoral(c, 9, 6, 7, 3);
  eye(c, 14, -3.4, 2.9);
  mouth(c, 20, 2, 1.6);
}

function drawTetra(c: Paint): void {
  const { ctx, sh } = c;
  const pr: Profile = { nose: [18, 0.5], top: 6.6, topX: 3, bottom: 6.2, bottomX: 3, pedX: -13, ped: 2.3 };
  const b = boundsOf(pr);
  swinging(c, pr.pedX + 1, 0, 1, () => {
    const tail = new Path2D();
    tail.moveTo(1, -2.2);
    tail.quadraticCurveTo(-5, -4, -11, -8);
    tail.quadraticCurveTo(-8, -1.5, -8.2, 0);
    tail.quadraticCurveTo(-8, 1.5, -11, 8);
    tail.quadraticCurveTo(-5, 4, 1, 2.2);
    tail.closePath();
    paintFin(c, tail, [0, 0], [-11, 0], { color: mix(sh.fin, sh.flank, 0.4), rays: raysAlong([-11, -7.5], [-11, 7.5], 5), opacity: 0.8 });
  });
  const dorsal = new Path2D();
  dorsal.moveTo(1, -6.2);
  dorsal.quadraticCurveTo(-2, -10.5, -6, -9);
  dorsal.quadraticCurveTo(-5, -6, -4, -5);
  dorsal.closePath();
  paintFin(c, dorsal, [0, -6], [-5, -9.5], { opacity: 0.7 });
  // adipose
  const adipose = new Path2D();
  adipose.ellipse(-10, -3.6, 1.6, 0.9, -0.3, 0, Math.PI * 2);
  paintFin(c, adipose, [-10, -3], [-10, -4.5], { opacity: 0.6 });
  const body = bodyPath(pr);
  shadeBody(c, body, b, {
    scaleSize: 1.5,
    scaleStrength: 0.5,
    pattern: () => {
      // Red lower rear.
      const red = ctx.createLinearGradient(4, 0, b.x0, 0);
      red.addColorStop(0, rgba(sh.fin, 0));
      red.addColorStop(0.35, rgba(sh.fin, 0.9));
      ctx.fillStyle = red;
      ctx.fillRect(b.x0, 0.6, 22, 8);
      // Iridescent glowing stripe.
      ctx.shadowColor = sh.accent;
      ctx.shadowBlur = 5 * c.p.dpr;
      const stripe = ctx.createLinearGradient(13, 0, b.x0, 0);
      stripe.addColorStop(0, rgba(sh.accent, 0.3));
      stripe.addColorStop(0.2, rgba(mix(sh.accent, '#ffffff', 0.2), 0.95));
      stripe.addColorStop(1, rgba(sh.accent, 0.85));
      ctx.fillStyle = stripe;
      ctx.beginPath();
      ctx.moveTo(13, -2.4);
      ctx.quadraticCurveTo(-2, -3.2, b.x0 - 1, -1.1);
      ctx.lineTo(b.x0 - 1, 0.5);
      ctx.quadraticCurveTo(-2, -0.5, 13, -0.5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    },
  });
  gill(c, 11, -4.2, 4);
  pectoral(c, 9, 2.6, 4.5, 1.8);
  eye(c, 13, -1, 2.4);
  mouth(c, 18, 0.5, 1.1);
}

function drawBetta(c: Paint): void {
  const { ctx, sh } = c;
  const pr: Profile = { nose: [20, 0], top: 7, topX: 7, bottom: 6.6, bottomX: 7, pedX: -6, ped: 4 };
  const b = boundsOf(pr);
  const ph = c.p.phase;
  swinging(c, pr.pedX + 1, 0, 0.8, () => {
    // Huge veil tail: layered translucent sheets with a rippling edge.
    for (const [scale, op] of [[1, 0.85], [0.78, 0.6]] as const) {
      const tail = new Path2D();
      tail.moveTo(1, -4.5);
      tail.bezierCurveTo(-10 * scale, -24 * scale, -28 * scale, -28 * scale, -38 * scale, -22 * scale);
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const y = (-22 + t * 44) * scale;
        const x = (-38 - Math.sin(t * Math.PI) * 9) * scale - Math.sin(ph * 1.4 + t * 6) * 2.4 * c.p.wobbleAmp;
        tail.lineTo(x, y);
      }
      tail.bezierCurveTo(-28 * scale, 28 * scale, -10 * scale, 24 * scale, 1, 4.5);
      tail.closePath();
      paintFin(c, tail, [0, 0], [-44 * scale, 0], {
        rays: Array.from({ length: 11 }, (_, i) => {
          const a = -0.75 + (i / 10) * 1.5;
          return [-46 * scale * Math.cos(a), 46 * scale * Math.sin(a)] as [number, number];
        }),
        opacity: op,
      });
    }
    // Iridescent sheen across the veil.
    ctx.beginPath();
    ctx.ellipse(-20, -6, 14, 5, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = rgba(sh.accent, 0.18);
    ctx.fill();
  });
  const dorsal = new Path2D();
  dorsal.moveTo(12, -6);
  dorsal.quadraticCurveTo(0, -16 + Math.sin(ph) * 2 * c.p.wobbleAmp, -14, -24);
  dorsal.quadraticCurveTo(-10, -12, -5, -5);
  dorsal.closePath();
  paintFin(c, dorsal, [8, -6], [-12, -22], { rays: raysAlong([-14, -24], [-5, -6], 6), opacity: 0.85 });
  const anal = new Path2D();
  anal.moveTo(12, 5.6);
  anal.quadraticCurveTo(0, 16 - Math.sin(ph) * 2 * c.p.wobbleAmp, -14, 22);
  anal.quadraticCurveTo(-10, 11, -5, 5);
  anal.closePath();
  paintFin(c, anal, [8, 6], [-12, 21], { rays: raysAlong([-14, 22], [-5, 6], 6), opacity: 0.85 });
  const body = bodyPath(pr);
  shadeBody(c, body, b, {
    scaleSize: 1.7,
    scaleStrength: 0.9,
    pattern: () => {
      ctx.fillStyle = rgba(sh.accent, 0.22);
      ctx.beginPath();
      ctx.ellipse(4, -2, 9, 2.4, -0.05, 0, Math.PI * 2);
      ctx.fill();
    },
  });
  gill(c, 13, -4.6, 4.4);
  pectoral(c, 11, 3, 5, 2.2);
  eye(c, 15.5, -1, 2.4, { iris: mix(sh.flank, '#e0c070', 0.5) });
  mouth(c, 20, 0, 1.2);
}

function drawAngelfish(c: Paint): void {
  const { ctx, sh } = c;
  const pr: Profile = { nose: [18, 2], top: 15, topX: 2, bottom: 15, bottomX: 2, pedX: -10, ped: 3 };
  const b = boundsOf(pr);
  const sway = Math.sin(c.p.phase) * 2 * c.p.wobbleAmp;
  // Tall trailing dorsal and anal fins.
  const dorsal = new Path2D();
  dorsal.moveTo(7, -13.5);
  dorsal.bezierCurveTo(0, -30, -10, -38, -20 + sway, -40);
  dorsal.quadraticCurveTo(-14, -22, -9, -4);
  dorsal.closePath();
  paintFin(c, dorsal, [3, -12], [-18, -38], { rays: raysAlong([-20, -40], [-9, -5], 7) });
  const anal = new Path2D();
  anal.moveTo(7, 13.5);
  anal.bezierCurveTo(0, 30, -10, 38, -20 - sway, 40);
  anal.quadraticCurveTo(-14, 22, -9, 4);
  anal.closePath();
  paintFin(c, anal, [3, 12], [-18, 38], { rays: raysAlong([-20, 40], [-9, 5], 7) });
  swinging(c, pr.pedX + 1, 0, 0.8, () => {
    const tail = new Path2D();
    tail.moveTo(1, -2.5);
    tail.quadraticCurveTo(-6, -9, -12, -11);
    tail.quadraticCurveTo(-16, -6, -14, 0);
    tail.quadraticCurveTo(-16, 6, -12, 11);
    tail.quadraticCurveTo(-6, 9, 1, 2.5);
    tail.closePath();
    paintFin(c, tail, [0, 0], [-14, 0], { rays: raysAlong([-12, -11], [-12, 11], 6) });
  });
  // Pelvic filaments.
  ctx.beginPath();
  ctx.moveTo(8, 12);
  ctx.quadraticCurveTo(6, 24, 2 - sway, 34);
  ctx.moveTo(9, 12.5);
  ctx.quadraticCurveTo(8, 22, 5 - sway, 30);
  ctx.strokeStyle = rgba(sh.finEdge, 0.7);
  ctx.lineWidth = c.lw * 0.8;
  ctx.stroke();
  const body = bodyPath(pr);
  shadeBody(c, body, b, {
    scaleSize: 1.8,
    scaleStrength: 0.7,
    pattern: () => {
      ctx.fillStyle = rgba(sh.accent, 0.78);
      for (const [x, w] of [[12, 2.2], [1, 3], [-8, 2.4]] as const) {
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + 1, b.top - 1);
        ctx.quadraticCurveTo(x - w / 2 - 1.2, 0, x - w / 2 + 1, b.bottom + 1);
        ctx.lineTo(x + w / 2 + 1, b.bottom + 1);
        ctx.quadraticCurveTo(x + w / 2 - 1.2, 0, x + w / 2 + 1, b.top - 1);
        ctx.closePath();
        ctx.fill();
      }
    },
  });
  gill(c, 11.5, -6, 7);
  pectoral(c, 8, 3, 5, 2.2);
  eye(c, 12.5, -2, 2.6);
  mouth(c, 18, 2, 1.3);
}

function drawClownfish(c: Paint): void {
  const { ctx, sh } = c;
  const pr: Profile = { nose: [22, 1.5], top: 9.5, topX: 3, bottom: 8.5, bottomX: 2, pedX: -15, ped: 4.2 };
  const b = boundsOf(pr);
  const darkEdge = sh.outline;
  swinging(c, pr.pedX + 1, 0, 0.9, () => {
    const tail = new Path2D();
    tail.moveTo(1, -3.8);
    tail.quadraticCurveTo(-7, -10, -11, -8);
    tail.quadraticCurveTo(-13, 0, -11, 8);
    tail.quadraticCurveTo(-7, 10, 1, 3.8);
    tail.closePath();
    paintFin(c, tail, [0, 0], [-12, 0], { rays: raysAlong([-11, -8], [-11, 8], 5), edge: darkEdge });
  });
  const dorsal = new Path2D();
  dorsal.moveTo(11, -8.6);
  dorsal.quadraticCurveTo(7, -15, 1, -10);
  dorsal.quadraticCurveTo(-5, -15.5, -12, -6.5);
  dorsal.closePath();
  paintFin(c, dorsal, [4, -9], [-4, -14], { edge: darkEdge, rays: raysAlong([7, -14], [-10, -9], 6) });
  const anal = new Path2D();
  anal.moveTo(0, 8.2);
  anal.quadraticCurveTo(-5, 14, -11, 6.2);
  anal.closePath();
  paintFin(c, anal, [-2, 8], [-6, 13], { edge: darkEdge });
  const body = bodyPath(pr);
  shadeBody(c, body, b, {
    scaleSize: 1.7,
    scaleStrength: 0.5,
    pattern: () => {
      for (const [x, w] of [[12, 3], [-1, 3.6], [-13, 2.4]] as const) {
        for (const [inset, color] of [[0, darkEdge], [0.9, sh.accent]] as const) {
          ctx.beginPath();
          ctx.moveTo(x - w / 2 - 1.1 + inset + 1.2, b.top - 1);
          ctx.quadraticCurveTo(x - w / 2 - 1.1 + inset - 1.6, 0, x - w / 2 - 1.1 + inset + 1.2, b.bottom + 1);
          ctx.lineTo(x + w / 2 + 1.1 - inset + 1.2, b.bottom + 1);
          ctx.quadraticCurveTo(x + w / 2 + 1.1 - inset - 1.6, 0, x + w / 2 + 1.1 - inset + 1.2, b.top - 1);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    },
  });
  gill(c, 10.5, -6.5, 6);
  pectoral(c, 8, 3.5, 6, 2.6);
  eye(c, 16.5, -1.6, 2.6);
  mouth(c, 22, 1.5, 1.4);
}

function drawPuffer(c: Paint): void {
  const { ctx, sh } = c;
  const inflate = c.p.inflate;
  const k = 1 + inflate * 0.38;
  const pr: Profile = { nose: [18 * k, 3], top: 15 * k, topX: -1, bottom: 14.5 * k, bottomX: -1, pedX: -16 * k, ped: 4 };
  const b = boundsOf(pr);
  swinging(c, pr.pedX + 1, 0, 1.3, () => {
    const tail = new Path2D();
    tail.moveTo(1, -3);
    tail.quadraticCurveTo(-5, -7, -8, -6);
    tail.quadraticCurveTo(-9.5, 0, -8, 6);
    tail.quadraticCurveTo(-5, 7, 1, 3);
    tail.closePath();
    paintFin(c, tail, [0, 0], [-8, 0], { rays: raysAlong([-8, -6], [-8, 6], 4) });
  });
  if (inflate > 0.05) {
    // Spines around the puffed body.
    ctx.beginPath();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const rx = (b.x1 - b.x0) / 2;
      const ry = (b.bottom - b.top) / 2;
      const cx = (b.x0 + b.x1) / 2;
      const len = 5 * inflate;
      ctx.moveTo(cx + Math.cos(a - 0.08) * rx * 0.96, Math.sin(a - 0.08) * ry * 0.96);
      ctx.lineTo(cx + Math.cos(a) * (rx + len), Math.sin(a) * (ry + len));
      ctx.lineTo(cx + Math.cos(a + 0.08) * rx * 0.96, Math.sin(a + 0.08) * ry * 0.96);
    }
    ctx.fillStyle = mix(sh.belly, sh.flank, 0.4);
    ctx.fill();
    ctx.strokeStyle = rgba(sh.outline, 0.7);
    ctx.lineWidth = c.lw * 0.55;
    ctx.stroke();
  }
  const body = bodyPath(pr);
  shadeBody(c, body, b, {
    scaleSize: 0,
    pattern: () => {
      // Pale belly, dark speckled back.
      ctx.beginPath();
      ctx.ellipse(1, b.bottom * 0.95, (b.x1 - b.x0) * 0.62, (b.bottom - b.top) * 0.36, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(sh.belly, 0.95);
      ctx.fill();
      const rand = hashSeq(23);
      for (let i = 0; i < 26; i++) {
        const x = b.x0 + (b.x1 - b.x0) * (0.12 + rand() * 0.76);
        const y = b.top + (b.bottom - b.top) * (0.08 + rand() * 0.45);
        ctx.beginPath();
        ctx.arc(x, y, (0.6 + rand() * 1.1) * k, 0, Math.PI * 2);
        ctx.fillStyle = rgba(sh.accent, 0.55);
        ctx.fill();
      }
    },
  });
  pectoral(c, 6 * k, 1, 5, 3);
  eye(c, 9 * k, -5.5 * k, 3.4);
  // Beak-like mouth.
  ctx.beginPath();
  ctx.ellipse(pr.nose[0] - 0.4, pr.nose[1] + 0.2, 1.4, inflate > 0.3 ? 1.6 : 0.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = mix(sh.belly, sh.outline, 0.25);
  ctx.fill();
  ctx.strokeStyle = rgba(sh.outline, 0.7);
  ctx.lineWidth = c.lw * 0.5;
  ctx.stroke();
}

function drawAxolotl(c: Paint): void {
  const { ctx, sh } = c;
  const walk = c.p.phase;
  // Tail fin.
  swinging(c, -14, 2, 0.6, () => {
    const tail = new Path2D();
    tail.moveTo(2, -6.5);
    tail.bezierCurveTo(-10, -12, -24, -7, -35, Math.sin(walk) * 2 * c.p.wobbleAmp);
    tail.bezierCurveTo(-24, 7, -10, 9, 2, 6);
    tail.closePath();
    const g = ctx.createLinearGradient(0, -8, 0, 8);
    g.addColorStop(0, rgba(sh.fin, 0.75));
    g.addColorStop(0.5, sh.flank);
    g.addColorStop(1, rgba(sh.fin, 0.75));
    ctx.fillStyle = g;
    ctx.fill(tail);
    ctx.save();
    ctx.clip(tail);
    ctx.fillStyle = rgba(sh.shadow, 0.25);
    ctx.fillRect(-40, 2, 45, 10);
    ctx.restore();
    outlineStroke(c, tail, 0.8);
  });
  const leg = (x: number, phaseOffset: number, far: boolean) => {
    const swing = Math.sin(walk + phaseOffset) * 0.5 * c.p.wobbleAmp;
    ctx.save();
    ctx.translate(x, 7);
    ctx.rotate(swing);
    const limb = new Path2D();
    limb.ellipse(0, 4, 2.3, 5, 0, 0, Math.PI * 2);
    limb.ellipse(1.6, 8.6, 2.8, 1.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = far ? mix(sh.flank, COOL_SHADOW, 0.25) : sh.flank;
    ctx.fill(limb);
    outlineStroke(c, limb, 0.7);
    ctx.restore();
  };
  leg(-6, Math.PI, true);
  leg(14, 0, true);
  const body = new Path2D();
  body.ellipse(0, 3, 18, 8, 0, 0, Math.PI * 2);
  shadeBody(c, body, { x0: -18, x1: 18, top: -5, bottom: 11 }, { scaleSize: 0, seed: 91 });
  leg(-9, 0, false);
  leg(11, Math.PI, false);
  // Feathery gills: three stalks with filaments, behind the head.
  const gillStalk = (angle: number, len: number) => {
    ctx.save();
    ctx.translate(14, -5);
    ctx.rotate(angle + Math.sin(walk * 0.8 + angle) * 0.08 * c.p.wobbleAmp);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.strokeStyle = mix(sh.accent, sh.outline, 0.2);
    ctx.lineWidth = c.lw * 1.6;
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const fx = len * (0.35 + i * 0.11);
      for (const side of [-1, 1]) {
        ctx.moveTo(fx, 0);
        ctx.quadraticCurveTo(fx + 1, side * 1.6, fx + 2.2, side * 3);
      }
    }
    ctx.strokeStyle = rgba(sh.accent, 0.85);
    ctx.lineWidth = c.lw * 0.7;
    ctx.stroke();
    ctx.restore();
  };
  gillStalk(-1.6, 15);
  gillStalk(-2.25, 17);
  gillStalk(-2.85, 15);
  const head = new Path2D();
  head.ellipse(20, 0, 13, 10.5, 0, 0, Math.PI * 2);
  shadeBody(c, head, { x0: 7, x1: 33, top: -10.5, bottom: 10.5 }, { scaleSize: 0, seed: 17 });
  // Natural pink flush under the skin (not a cartoon blush).
  ctx.beginPath();
  ctx.ellipse(21, 4, 6, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgba(sh.accent, 0.12);
  ctx.fill();
  eye(c, 26, -3.2, 1.9, { bead: true });
  // Wide, gentle mouth line.
  ctx.beginPath();
  ctx.moveTo(32.5, 1.5);
  ctx.quadraticCurveTo(28, c.p.sad ? 3 : 5.2, 22.5, 3.6);
  ctx.strokeStyle = rgba(sh.outline, 0.75);
  ctx.lineWidth = c.lw * 0.65;
  ctx.stroke();
}

function drawKoi(c: Paint): void {
  const { ctx, sh } = c;
  const pr: Profile = { nose: [34, 1], top: 11, topX: 8, bottom: 9.5, bottomX: 6, pedX: -25, ped: 4 };
  const b = boundsOf(pr);
  swinging(c, pr.pedX + 1, 0, 1, () => {
    const r = Math.sin(c.p.phase * 1.2) * 3 * c.p.wobbleAmp;
    const tail = new Path2D();
    tail.moveTo(1, -3.4);
    tail.bezierCurveTo(-6, -6, -14, -16 - r, -23, -15 - r);
    tail.quadraticCurveTo(-17, -1, -16, 0);
    tail.quadraticCurveTo(-17, 1, -23, 15 + r);
    tail.bezierCurveTo(-14, 16 + r, -6, 6, 1, 3.4);
    tail.closePath();
    paintFin(c, tail, [0, 0], [-23, 0], { rays: raysAlong([-23, -15], [-23, 15], 9) });
  });
  const dorsal = new Path2D();
  dorsal.moveTo(14, -10.3);
  dorsal.quadraticCurveTo(4, -17 + Math.sin(c.p.phase) * 1.5, -14, -7.5);
  dorsal.closePath();
  paintFin(c, dorsal, [8, -10], [-6, -14], { rays: raysAlong([10, -15], [-12, -8], 7) });
  const body = bodyPath(pr);
  shadeBody(c, body, b, {
    scaleSize: 2.4,
    scaleStrength: 1,
    pattern: () => {
      // Irregular painted patches (kohaku/sanke) or metallic sheen (ogon).
      const rand = hashSeq(5);
      ctx.fillStyle = rgba(sh.accent, 0.88);
      for (const [x, y, rx, ry] of [[20, -5, 8, 5], [3, -6, 9, 6], [-12, -3, 6, 4.5]] as const) {
        // Smooth organic blob: a closed curve through jittered points (midpoint quadratic smoothing).
        const pts: [number, number][] = [];
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const wobble = 0.75 + rand() * 0.45;
          pts.push([x + Math.cos(a) * rx * wobble, y + Math.sin(a) * ry * wobble]);
        }
        ctx.beginPath();
        const mid = (i: number): [number, number] => {
          const p0 = pts[i % pts.length]!;
          const p1 = pts[(i + 1) % pts.length]!;
          return [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        };
        const start = mid(0);
        ctx.moveTo(start[0], start[1]);
        for (let i = 1; i <= pts.length; i++) {
          const ctrl = pts[i % pts.length]!;
          const end = mid(i);
          ctx.quadraticCurveTo(ctrl[0], ctrl[1], end[0], end[1]);
        }
        ctx.closePath();
        ctx.fill();
      }
    },
  });
  // Large rounded pectoral fin with a pale edge.
  pectoral(c, 18, 5, 10, 4);
  // Barbels.
  ctx.beginPath();
  for (const dy of [0, 1.6]) {
    ctx.moveTo(32.5, 2.6 + dy);
    ctx.quadraticCurveTo(36, 4.5 + dy, 35 + Math.sin(c.p.phase + dy) * 0.8, 8.5 + dy);
  }
  ctx.strokeStyle = rgba(sh.outline, 0.8);
  ctx.lineWidth = c.lw * 0.6;
  ctx.stroke();
  gill(c, 22, -6.5, 6.5);
  eye(c, 27.5, -2.8, 2.1, { iris: '#3a3330' });
  mouth(c, 34, 1, 1.6);
}

/** Code-drawn art per species (the jellyfish has its own module, drawJelly.ts). */
const SPECIES_DRAW: Partial<Record<SpeciesId, (c: Paint) => void>> = {
  danio: drawDanio,
  guppy: drawGuppy,
  goldfish: drawGoldfish,
  tetra: drawTetra,
  betta: drawBetta,
  angelfish: drawAngelfish,
  clownfish: drawClownfish,
  puffer: drawPuffer,
  axolotl: drawAxolotl,
  koi: drawKoi,
};

function drawShinyGlints(c: Paint): void {
  const { ctx } = c;
  const art = FISH_ART[c.p.speciesId];
  const spots: [number, number, number][] = [
    [art.mouthX * 0.2, -art.halfHeight * 0.45, 0],
    [-art.mouthX * 0.35, art.halfHeight * 0.1, 2.1],
    [art.mouthX * 0.55, art.halfHeight * 0.35, 4.2],
  ];
  for (const [x, y, offset] of spots) {
    const tw = (Math.sin(c.p.time * 3 + offset) + 1) / 2;
    if (tw < 0.25) continue;
    drawStar(ctx, x, y, 2.6 * tw, SHINY_SPARKLE, SHINY_OUTLINE, c.lw * 0.5);
  }
}

/** 4-point twinkle star. */
export function drawStar(ctx: Ctx, x: number, y: number, r: number, fill: string, stroke: string | null, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Draws a fish centered at (x, y) in tank units: the PNG sprite if loaded, else the code-drawn art. */
export function drawFish(ctx: Ctx, x: number, y: number, p: FishDrawParams): void {
  if (p.speciesId === 'jellyfish') {
    drawJelly(ctx, x, y, p);
    return;
  }
  const sprite = fishSprite(p.speciesId, p.stage);
  if (sprite) {
    const hued = huedSprite(sprite, p.variant.hue ?? 0, p.variant.dark ?? 0);
    const cfg = clawConfig(p.speciesId, spriteArtFor(p.stage));
    const split = cfg ? splitSprite(hued, cfg) : null;
    drawSpriteFish(ctx, x, y, p, split ? split.body : hued, split);
    return;
  }
  const scale = fishScale(p.stage);
  const dir = p.facing >= 0 ? 1 : -1;
  const tilt = (p.pitch + (p.sad ? SAD_DROOP : 0)) * dir;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // Squash through the flip but never to zero width, so a turning fish never vanishes.
  const flipX = dir * Math.max(MIN_FLIP_SCALE, Math.abs(p.facing));
  // Chunky cartoon proportions: a little taller/rounder than the natural silhouettes.
  ctx.scale(flipX * scale, scale * FISH_CHUNK);

  const paint: Paint = {
    ctx,
    sh: shadesFor(p.variant),
    outline: p.shiny ? SHINY_OUTLINE : p.variant.outline,
    lw: (OUTLINE_PX * p.px) / scale,
    glow: p.glow,
    glowBlur: 8 * p.dpr,
    eyeBoost: p.stage === 'baby' ? 1.18 : p.stage === 'juvenile' ? 1.08 : 1,
    wob: Math.sin(p.phase) * 0.3 * p.wobbleAmp,
    p,
  };
  (SPECIES_DRAW[p.speciesId] ?? drawGoldfish)(paint);
  if (p.shiny) drawShinyGlints(paint);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Sprite fish
// ---------------------------------------------------------------------------

export type SpriteArt = 'adult' | 'baby';

/** Babies have their own sprite; juveniles reuse the adult art. */
export function spriteArtFor(stage: Stage): SpriteArt {
  return stage === 'baby' ? 'baby' : 'adult';
}

/** Eye placements set live from the dev panel (they win over species.ts until reload). */
const eyeOverrides = new Map<string, SpriteEye>();

export function spriteEye(speciesId: SpeciesId, stage: Stage): SpriteEye {
  const art = spriteArtFor(stage);
  return eyeOverrides.get(`${speciesId}:${art}`) ?? getSpecies(speciesId).eye[art];
}

export function setSpriteEye(speciesId: SpeciesId, art: SpriteArt, eye: SpriteEye): void {
  eyeOverrides.set(`${speciesId}:${art}`, eye);
}

/** Every eye currently in use (overrides applied), as `species.ts` source lines, for the dev panel's copy button. */
export function spriteEyeSource(): string {
  const fmt = (e: SpriteEye) => `{ x: ${e.x}, y: ${e.y}, size: ${e.size}${e.twinX !== undefined ? `, twinX: ${e.twinX}` : ''} }`;
  return (Object.keys(FISH_ART) as SpeciesId[])
    .map((id) => `${id}: eye: { adult: ${fmt(spriteEye(id, 'adult'))}, baby: ${fmt(spriteEye(id, 'baby'))} },`)
    .join('\n');
}

/** A sprite pre-scaled to an on-screen width, with its strip boundaries (whole pixels, so strips copy 1:1 without seams). */
interface ScaledSprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** n + 1 x boundaries for the n wave strips. */
  edges: number[];
}

/** A few sizes per sprite (zoom and stage change rarely); oldest is dropped first. */
const SCALED_PER_SPRITE = 6;
const scaledCache = new WeakMap<Sprite, Map<number, ScaledSprite>>();

function scaledSprite(s: Sprite, width: number): ScaledSprite | null {
  const w = Math.max(SPRITE_SIZE_BUCKET_PX, Math.ceil(width / SPRITE_SIZE_BUCKET_PX) * SPRITE_SIZE_BUCKET_PX);
  let sizes = scaledCache.get(s);
  if (!sizes) {
    sizes = new Map();
    scaledCache.set(s, sizes);
  }
  const hit = sizes.get(w);
  if (hit) return hit;
  const h = Math.max(1, Math.round((w * s.h) / s.w));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.imageSmoothingQuality = 'high';
  c.drawImage(s.canvas, 0, 0, w, h);
  const n = SPRITE_WAVE_STRIPS;
  const entry: ScaledSprite = { canvas, w, h, edges: Array.from({ length: n + 1 }, (_, i) => Math.round((i * w) / n)) };
  if (sizes.size >= SCALED_PER_SPRITE) {
    const oldest = sizes.keys().next().value;
    if (oldest !== undefined) sizes.delete(oldest);
  }
  sizes.set(w, entry);
  return entry;
}

/** Reused offscreen canvas where the sprite is bent into its swimming wave (grows, never shrinks). */
let waveCanvas: HTMLCanvasElement | null = null;

function waveScratch(w: number, h: number): CanvasRenderingContext2D | null {
  waveCanvas ??= document.createElement('canvas');
  if (waveCanvas.width < w) waveCanvas.width = w;
  if (waveCanvas.height < h) waveCanvas.height = h;
  const c = waveCanvas.getContext('2d');
  c?.clearRect(0, 0, w, h);
  return c;
}

/**
 * Bends a pre-scaled sprite into a travelling sine wave (rigid head, tail swinging most) by copying
 * its strips into the scratch canvas with vertical offsets. `amp` is in pixels. Returns the padding.
 */
function bendSprite(sc: ScaledSprite, amp: number, phase: number, fullBody: boolean): number | null {
  const pad = Math.ceil(Math.abs(amp)) + 2;
  const c = waveScratch(sc.w, sc.h + pad * 2);
  if (!c) return null;
  const n = sc.edges.length - 1;
  for (let i = 0; i < n; i++) {
    const x0 = sc.edges[i]!;
    const x1 = sc.edges[i + 1]!;
    if (x1 <= x0) continue;
    c.drawImage(sc.canvas, x0, 0, x1 - x0, sc.h, x0, pad + stripOffset(i, n, phase, amp, fullBody), x1 - x0, sc.h);
  }
  return pad;
}

function drawSpriteFish(ctx: Ctx, x: number, y: number, p: FishDrawParams, s: Sprite, split: SplitSprite | null = null): void {
  const scale = fishScale(p.stage);
  const art = FISH_ART[p.speciesId];
  const motion = getSpecies(p.speciesId).motion;
  const baby = p.stage === 'baby';
  const sm = baby ? (BABY_SPECIES_SCALE[p.speciesId] ?? 1) : 1;
  const len = art.spriteLen * scale * sm;
  const ht = (len * s.h) / s.w;
  const left = art.mouthX * scale * sm - len;
  const dir = p.facing >= 0 ? 1 : -1;
  const bob = bodyBob(motion.gait, baby, p.time, p.phase, p.speedFrac);
  const gloom = p.gloom ?? (p.sad ? 1 : 0);
  const tilt = (p.pitch + SAD_DROOP * gloom + bob.rock * p.wobbleAmp) * dir;
  const flipX = dir * Math.max(MIN_FLIP_SCALE, Math.abs(p.facing));
  // Squash & stretch (acceleration, gulps, click bounce) plus the puffer's inflation.
  const ss = squashStretch(p.stretch, p.eat, p.bounce);
  const sx = ss.sx * (1 + SPRITE_PUFF_X * p.inflate);
  const sy = ss.sy * (1 + SPRITE_PUFF_Y * p.inflate);

  // Bend at the resolution the sprite appears on screen (device pixels per tank unit). Squash/stretch is
  // left out so the cached size stays stable from frame to frame; it only rescales the final blit slightly.
  const sc = scaledSprite(s, (len * p.dpr) / p.px);
  const ampFrac = waveAmplitude(motion, p.speedFrac, baby, p.wobbleAmp) * (1 - p.inflate) * (1 - SAD_WAVE_DAMP * gloom);

  ctx.save();
  ctx.translate(x, y + bob.dy * ht * p.wobbleAmp);
  ctx.rotate(tilt);
  ctx.scale(flipX * sx, sy);
  if (sc) {
    let img: CanvasImageSource = sc.canvas;
    let pad = 0;
    const amp = ampFrac * sc.h;
    if (amp > 0.05) {
      const bent = bendSprite(sc, amp, p.phase, motion.fullBody === true);
      if (bent !== null && waveCanvas) {
        img = waveCanvas;
        pad = bent;
      }
    }
    const padT = (pad / sc.h) * ht;
    const blit = () => ctx.drawImage(img, 0, 0, sc.w, sc.h + pad * 2, left, -ht / 2 - padT, len, ht + padT * 2);
    if (p.glow) {
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = SPRITE_NIGHT_GLOW_PX * p.dpr;
      blit();
    }
    if (p.shiny) {
      // Golden outline: a tight gold glow, stacked so it reads as a rim.
      ctx.shadowColor = SHINY_OUTLINE;
      ctx.shadowBlur = SPRITE_SHINY_GLOW_PX * p.dpr;
      blit();
      blit();
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    blit();
    if (split) drawClaws(ctx, split, p.claws, left, ht, len, s);
  } else {
    ctx.drawImage(s.canvas, left, -ht / 2, len, ht);
  }
  drawSpriteEyes(ctx, p, s, { left, len, ht, x, y, tilt, flipX }, gloom);
  if (p.shiny) drawSpriteGlints(ctx, left, len, ht, scale, p);
  ctx.restore();
}

/** The crab's claws, each rotated about its wrist pivot on top of the (claw-less) body. */
function drawClaws(ctx: Ctx, split: SplitSprite, angles: ClawAngles | undefined, left: number, ht: number, len: number, s: Sprite): void {
  const kx = len / s.w;
  const ky = ht / s.h;
  for (const claw of split.claws) {
    ctx.save();
    ctx.translate(left + claw.pivotX * kx, -ht / 2 + claw.pivotY * ky);
    ctx.rotate(angles ? angles[claw.side] : 0);
    ctx.drawImage(claw.canvas, (claw.x - claw.pivotX) * kx, (claw.y - claw.pivotY) * ky, claw.canvas.width * kx, claw.canvas.height * ky);
    ctx.restore();
  }
}

/** Lid color for a blink: the sprite's skin just around the eye (brighter half of a ring of samples), cached. */
const lidCache = new WeakMap<Sprite, Map<string, string>>();

function lidColor(s: Sprite, eye: SpriteEye): string {
  const key = `${eye.x},${eye.y},${eye.size}`;
  let byEye = lidCache.get(s);
  if (!byEye) {
    byEye = new Map();
    lidCache.set(s, byEye);
  }
  const hit = byEye.get(key);
  if (hit) return hit;
  const r = (eye.size / 2) * 1.35;
  const ring: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ring.push([eye.x + (Math.cos(a) * r * s.h) / s.w, eye.y + Math.sin(a) * r]);
  }
  const lum = (c: number[]) => c[0]! * 0.3 + c[1]! * 0.59 + c[2]! * 0.11;
  const skin = samplePixels(s, ring)
    .filter((c) => c[3] > 200)
    .sort((a, b) => lum(b) - lum(a));
  const top = skin.slice(0, Math.max(1, Math.ceil(skin.length / 2)));
  const avg = (ch: number) => Math.round(top.reduce((sum, c) => sum + c[ch]!, 0) / top.length);
  const color = top.length ? `rgb(${avg(0)},${avg(1)},${avg(2)})` : '#f2c48a';
  byEye.set(key, color);
  return color;
}

const EYE_LINE = 'rgba(34, 22, 40, 0.9)';
const EYE_IRIS_LIGHT = '#8a5426';
const EYE_IRIS_DARK = '#3a1d0c';

type EyeFrame = { left: number; len: number; ht: number; x: number; y: number; tilt: number; flipX: number };

/** The sprite's living eye(s): one for side-on fish, two for a front-facing face (`twinX`). */
export function drawSpriteEyes(ctx: Ctx, p: FishDrawParams, s: Sprite, f: EyeFrame, gloom: number): void {
  const eye = spriteEye(p.speciesId, p.stage);
  drawSpriteEye(ctx, p, s, f, gloom, eye, eye.x);
  if (eye.twinX !== undefined) drawSpriteEye(ctx, p, s, f, gloom, eye, eye.twinX);
}

/**
 * A living cartoon eye drawn over the sprite's own at `eyeX`: it blinks and its pupil follows `p.gaze`.
 * Called inside the fish transform (local space, art facing +x).
 */
function drawSpriteEye(ctx: Ctx, p: FishDrawParams, s: Sprite, f: EyeFrame, gloom: number, eye: SpriteEye, eyeX: number): void {
  const ex = f.left + eyeX * f.len;
  const ey = (eye.y - 0.5) * f.ht;
  const r = (eye.size * f.ht) / 2;
  const side = f.flipX >= 0 ? 1 : -1;

  ctx.save();
  ctx.translate(ex, ey);
  if (p.blinking) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
    ctx.fillStyle = lidColor(s, eye);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -r * 0.35, r * 0.85, Math.PI * 0.2, Math.PI * 0.8);
    ctx.strokeStyle = EYE_LINE;
    ctx.lineWidth = Math.max(r * 0.2, p.px);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Gaze: target direction in the fish's local frame (undo the tilt, then the flip).
  const gx = p.gaze.x - (f.x + ex * f.flipX);
  const gy = p.gaze.y - (f.y + ey);
  const cos = Math.cos(-f.tilt);
  const sin = Math.sin(-f.tilt);
  const raw = pupilOffset((gx * cos - gy * sin) * side, gx * sin + gy * cos, r * 8);
  // A sad fish looks down at the sand.
  const look = { x: raw.x * (1 - 0.6 * gloom), y: raw.y + (EYE_LOOK_RANGE - raw.y) * 0.8 * gloom };

  const sclera = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
  sclera.addColorStop(0, '#ffffff');
  sclera.addColorStop(1, '#dfe6f2');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = sclera;
  ctx.fill();
  ctx.lineWidth = Math.max(r * 0.12, p.px);
  ctx.strokeStyle = EYE_LINE;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  const ir = r * EYE_PUPIL;
  const px = look.x * r;
  const py = look.y * r;
  const iris = ctx.createRadialGradient(px, py - ir * 0.3, ir * 0.1, px, py, ir);
  iris.addColorStop(0, EYE_IRIS_LIGHT);
  iris.addColorStop(1, EYE_IRIS_DARK);
  ctx.beginPath();
  ctx.arc(px, py, ir, 0, Math.PI * 2);
  ctx.fillStyle = iris;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px, py, ir * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = PUPIL;
  ctx.fill();
  if (gloom > 0.01) drawSadLid(ctx, r, gloom, lidColor(s, eye), p.px);
  ctx.restore();

  // Highlights stay put (lit from the upper left on screen) while the pupil moves.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-r * 0.3 * side, -r * 0.32, r * EYE_HIGHLIGHT, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.24 * side, r * 0.26, r * EYE_HIGHLIGHT * 0.45, 0, Math.PI * 2);
  ctx.fill();
  if (gloom > 0.01) drawSadBrowAndTear(ctx, r, gloom, p);
  ctx.restore();
}

/**
 * Heavy upper lid for a sad eye (inside the eye clip): it hangs lower at the back corner than at the
 * front, so the eye reads as droopy. Local space: +x is toward the nose.
 */
function drawSadLid(ctx: Ctx, r: number, gloom: number, skin: string, px: number): void {
  const back = -r * (0.75 - 0.75 * gloom);
  const front = -r * (0.95 - 0.5 * gloom);
  ctx.beginPath();
  ctx.moveTo(-r * 1.2, -r * 1.2);
  ctx.lineTo(r * 1.2, -r * 1.2);
  ctx.lineTo(r * 1.2, front);
  ctx.quadraticCurveTo(0, (back + front) / 2 + r * 0.12 * gloom, -r * 1.2, back);
  ctx.closePath();
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 1.2, front);
  ctx.quadraticCurveTo(0, (back + front) / 2 + r * 0.12 * gloom, -r * 1.2, back);
  ctx.strokeStyle = EYE_LINE;
  ctx.globalAlpha = Math.min(1, gloom * 1.5);
  ctx.lineWidth = Math.max(r * 0.16, px);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Worried brow (raised toward the nose) and, every few seconds, a tear that wells up and rolls away. */
function drawSadBrowAndTear(ctx: Ctx, r: number, gloom: number, p: FishDrawParams): void {
  ctx.save();
  ctx.globalAlpha = Math.min(1, gloom * 1.4);
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, -r * 1.2);
  ctx.quadraticCurveTo(-r * 0.1, -r * 1.35, r * 0.8, -r * 1.75);
  ctx.strokeStyle = EYE_LINE;
  ctx.lineWidth = Math.max(r * 0.2, p.px * 1.2);
  ctx.lineCap = 'round';
  ctx.stroke();

  const t = ((p.time + p.phase) / SAD_TEAR_PERIOD_S) % 1;
  if (gloom > 0.6 && t < 0.45) {
    const u = t / 0.45;
    const well = Math.min(1, u / 0.3);
    const fall = Math.max(0, (u - 0.3) / 0.7);
    const tr = r * 0.32 * well;
    const ty = r * 0.95 + fall * r * 1.8;
    ctx.globalAlpha = (1 - fall) * gloom;
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, ty - tr * 1.6);
    ctx.quadraticCurveTo(-r * 0.15 + tr * 1.1, ty - tr * 0.2, -r * 0.15, ty + tr);
    ctx.quadraticCurveTo(-r * 0.15 - tr * 1.1, ty - tr * 0.2, -r * 0.15, ty - tr * 1.6);
    ctx.fillStyle = '#8fd8ff';
    ctx.fill();
    ctx.strokeStyle = '#3a8fc8';
    ctx.lineWidth = Math.max(r * 0.08, p.px * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-r * 0.22, ty - tr * 0.2, tr * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();
}

/** Shiny sparkle overlay for sprites: three twinkling stars spread over the body. */
function drawSpriteGlints(ctx: Ctx, left: number, len: number, ht: number, scale: number, p: FishDrawParams): void {
  const spots: [number, number, number][] = [
    [0.68, -0.22, 0],
    [0.4, 0.08, 2.1],
    [0.82, 0.18, 4.2],
  ];
  for (const [u, v, offset] of spots) {
    const tw = (Math.sin(p.time * 3 + offset) + 1) / 2;
    if (tw < 0.25) continue;
    drawStar(ctx, left + u * len, v * ht, 3.8 * scale * tw, SHINY_SPARKLE, SHINY_OUTLINE, p.px);
  }
}
