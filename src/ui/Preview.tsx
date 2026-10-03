// Small static canvas previews of fish and decor for the shop and level-up modal.
import { useEffect, useRef } from 'react';
import { FISH_ART_SCALE } from '../game/constants';
import { getVariant, SPECIES } from '../game/species';
import type { DecorId, SpeciesId } from '../game/types';
import { DECOR_BOUNDS, drawDecor } from '../render/drawDecor';
import { drawFish, FISH_ART } from '../render/drawFish';

const W = 110;
const H = 80;

function useCanvas(draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    draw(ctx);
  }, deps);
  return ref;
}

export function FishPreview({ speciesId, variant }: { speciesId: SpeciesId; variant?: string }) {
  const ref = useCanvas(
    (ctx) => {
      const art = FISH_ART[speciesId];
      // Fit the adult fish (body + tail) into the preview box.
      const w = art.mouthX * 2.6 * FISH_ART_SCALE;
      const h = art.halfHeight * 2.3 * FISH_ART_SCALE;
      const k = Math.min(1, (W - 8) / w, (H - 8) / h);
      ctx.translate(W / 2 + art.mouthX * 0.25 * k, H / 2);
      ctx.scale(k, k);
      drawFish(ctx, 0, 0, {
        speciesId,
        variant: getVariant(speciesId, variant ?? SPECIES[speciesId].variants[0]!.key),
        shiny: false,
        stage: 'adult',
        facing: 1,
        pitch: 0,
        phase: 0.8,
        speedFrac: 0,
        stretch: 0,
        eat: 0,
        bounce: 0,
        gaze: { x: 100, y: 0 },
        blinking: false,
        sad: false,
        inflate: 0,
        glow: null,
        px: 1 / k,
        dpr: window.devicePixelRatio || 1,
        wobbleAmp: 1,
        time: 0,
      });
    },
    [speciesId, variant],
  );
  return <canvas ref={ref} className="preview" style={{ width: W, height: H }} aria-hidden="true" />;
}

export function DecorPreview({ decorId }: { decorId: DecorId }) {
  const ref = useCanvas(
    (ctx) => {
      const [w, h] = DECOR_BOUNDS[decorId];
      const k = Math.min(1, (W - 10) / w, (H - 10) / h);
      ctx.translate(W / 2, H - 6);
      ctx.scale(k, k);
      drawDecor(ctx, decorId, 0, 0, 0, 1 / k);
    },
    [decorId],
  );
  return <canvas ref={ref} className="preview" style={{ width: W, height: H }} aria-hidden="true" />;
}
