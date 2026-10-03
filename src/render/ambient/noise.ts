// Smooth 1D value noise for slow, organic drifts (currents, sway timing). Pure and deterministic.

function hash(n: number, seed: number): number {
  let h = (Math.imul(n | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** Value noise in −1..1, smooth (C¹) in x; one unit of x ≈ one bump. */
export function noise1D(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}

/** Two octaves of noise, still in −1..1. */
export function fbm1D(x: number, seed = 0): number {
  return (noise1D(x, seed) * 2 + noise1D(x * 2.3 + 17.1, seed + 1)) / 3;
}

export const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
