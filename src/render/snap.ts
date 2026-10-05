// Decorate-mode snapping: a dragged item's center or edges line up with the tank center or other items'
// centers/edges when close. Pure; unit-tested.

export interface SnapTarget {
  x: number;
  /** Half the item's width (tank units). */
  half: number;
}

/**
 * Snaps a dragged item at `x` (half-width `half`) to the closest guide within `dist`: the tank center, or another
 * item's center or edges (matched center-to-center and edge-to-edge). Returns the x to use and the guide line, or
 * null for no snap.
 */
export function snapX(x: number, half: number, others: readonly SnapTarget[], center: number, dist: number): { x: number; guide: number | null } {
  let best = { x, guide: null as number | null, d: dist + 1e-9 };
  const consider = (candidateX: number, guide: number) => {
    const d = Math.abs(candidateX - x);
    if (d <= best.d) best = { x: candidateX, guide, d };
  };
  consider(center, center);
  for (const o of others) {
    consider(o.x, o.x);
    // Left edges together, right edges together.
    consider(o.x - o.half + half, o.x - o.half);
    consider(o.x + o.half - half, o.x + o.half);
  }
  return best.guide === null ? { x, guide: null } : { x: best.x, guide: best.guide };
}
