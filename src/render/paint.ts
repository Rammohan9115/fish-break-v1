// Shared painterly toolkit (BotW-style): color mixing, deterministic noise, smooth blobs, and
// contour-following cel shading via the "body minus shifted body" crescent trick.

export type RGB = [number, number, number];

/** Cool shadow tone and warm light: shadows lean blue-violet, light leans sunlit cream. */
export const COOL_SHADOW = '#22304f';
export const WARM_LIGHT = '#fff3d6';
export const RIM_LIGHT = '#fffbea';

export function toRgb(color: string): RGB {
  const h = color.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear mix of two hex colors (t=0 → a, t=1 → b). */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function rgba(color: string, alpha: number): string {
  const [r, g, b] = toRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Deterministic pseudo-random sequence (stable across frames). */
export function hashSeq(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The part of `shape` NOT covered by `shape` shifted by (dx, dy): a crescent hugging the contour. Fill with 'evenodd'. */
export function crescent(shape: Path2D, dx: number, dy: number): Path2D {
  const p = new Path2D();
  p.addPath(shape);
  p.addPath(shape, new DOMMatrix().translateSelf(dx, dy));
  return p;
}

/** Smooth closed blob through jittered points around an ellipse (midpoint quadratic smoothing). */
export function blobPath(cx: number, cy: number, rx: number, ry: number, rand: () => number, points = 9, jitter = 0.3): Path2D {
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 1 - jitter / 2 + rand() * jitter;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  const mid = (i: number): [number, number] => {
    const p0 = pts[i % points]!;
    const p1 = pts[(i + 1) % points]!;
    return [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  };
  const path = new Path2D();
  const start = mid(0);
  path.moveTo(start[0], start[1]);
  for (let i = 1; i <= points; i++) {
    const ctrl = pts[i % points]!;
    const end = mid(i);
    path.quadraticCurveTo(ctrl[0], ctrl[1], end[0], end[1]);
  }
  path.closePath();
  return path;
}

/** Boosts (amount > 1) or reduces saturation of a hex color, keeping lightness. */
export function saturate(color: string, amount: number): string {
  const [r, g, b] = toRgb(color).map((v) => v / 255) as RGB;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return color;
  const d = max - min;
  let sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  sat = Math.min(1, sat * amount);
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const p = 2 * l - q;
  const hue = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return toHex([hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255]);
}

/** Glossy-cartoon art style: how much to boost saturation and how thick outlines are vs. the caller's line width. */
export const GLOSS_SATURATION = 1.35;
export const GLOSS_OUTLINE_SCALE = 2.3;

export interface CelColors {
  base: string;
  /** Top of the gradient (defaults to base lightened). */
  light?: string;
  /** Bottom of the gradient (defaults to base darkened). */
  shadow?: string;
  /** Outline color (defaults to a darker shade of base, never black). */
  outline?: string;
}

/** Axis-aligned box [x, y, w, h] (top-left corner and size) in the shape's own coordinates. */
export type Box = [number, number, number, number];

/**
 * Glossy chunky-cartoon shading for any solid shape (CLAUDE.md "Art Style"): saturated gradient
 * fill (light top → dark bottom), a white gloss ellipse at the top-left, and a thick outline in a
 * darker shade of the fill (never black). `box` is the shape's bounding box.
 */
export function celShade(
  ctx: CanvasRenderingContext2D,
  shape: Path2D,
  [bx, by, bw, bh]: Box,
  colors: CelColors,
  lw: number,
  outlineAlpha = 0.95,
): void {
  const base = saturate(colors.base, GLOSS_SATURATION);
  const light = colors.light ? saturate(colors.light, GLOSS_SATURATION) : mix(base, '#ffffff', 0.38);
  const dark = colors.shadow ? saturate(colors.shadow, GLOSS_SATURATION) : mix(base, '#1a1030', 0.32);
  const outline = colors.outline ? saturate(colors.outline, GLOSS_SATURATION) : mix(base, '#1a1030', 0.55);
  const g = ctx.createLinearGradient(0, by, 0, by + bh);
  g.addColorStop(0, light);
  g.addColorStop(0.5, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill(shape);
  glossHighlight(ctx, shape, [bx, by, bw, bh]);
  ctx.strokeStyle = rgba(outline, outlineAlpha);
  ctx.lineWidth = lw * GLOSS_OUTLINE_SCALE;
  ctx.lineJoin = 'round';
  ctx.stroke(shape);
}

/** White glossy highlight at the top-left of a box, clipped to the shape. */
export function glossHighlight(ctx: CanvasRenderingContext2D, shape: Path2D, [bx, by, bw, bh]: Box, strength = 1): void {
  const gx = bx + bw * 0.34;
  const gy = by + bh * 0.27;
  const rx = bw * 0.22;
  const ry = bh * 0.13;
  ctx.save();
  ctx.clip(shape);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * strength})`;
  ctx.beginPath();
  ctx.ellipse(gx, gy, rx, ry, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * strength})`;
  ctx.beginPath();
  ctx.ellipse(gx - rx * 0.35, gy - ry * 0.1, rx * 0.28, ry * 0.4, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Soft elliptical drop shadow (e.g. under objects on the sand). */
export function dropShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = 0.35): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(30, 20, 60, ${alpha})`);
  g.addColorStop(1, 'rgba(30, 20, 60, 0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
