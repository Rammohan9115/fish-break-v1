// Dev tool: click a jellyfish sprite to set where its bell ends and its tentacles start (bellSplitY).
// The new split applies live to every jelly of that stage and is copied to the clipboard, ready to
// paste into species.ts.
import { useEffect, useRef, useState } from 'react';
import type { SpeciesId } from '../game/types';
import { bellSplitY, setBellSplitY } from '../render/jellyMotion';
import { fishSprite } from '../render/sprites';

const W = 160;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function BellSplitEditor({ speciesId, art }: { speciesId: SpeciesId; art: 'adult' | 'baby' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprite = fishSprite(speciesId, art);
  const [split, setSplit] = useState(() => bellSplitY(speciesId, art));
  const [note, setNote] = useState('');
  const h = sprite ? Math.round((W * sprite.h) / sprite.w) : 0;

  useEffect(() => {
    setSplit(bellSplitY(speciesId, art));
    setNote('');
  }, [speciesId, art]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !sprite) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, h);
    ctx.drawImage(sprite.canvas, 0, 0, W, h);
    // Bell above the line (tinted), tentacles below.
    ctx.fillStyle = 'rgba(255, 220, 80, 0.18)';
    ctx.fillRect(0, 0, W, split * h);
    ctx.beginPath();
    ctx.moveTo(0, split * h);
    ctx.lineTo(W, split * h);
    ctx.strokeStyle = '#ff2a6a';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
  }, [sprite, split, h]);

  if (!sprite) return <div className="dev-label">No sprite loaded for this jelly.</div>;

  const onClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const next = round3((e.clientY - rect.top) / rect.height);
    setSplit(next);
    setBellSplitY(speciesId, art, next);
    const line = `${speciesId} bellSplitY ${art}: ${next}`;
    console.info(line);
    try {
      await navigator.clipboard.writeText(line);
      setNote('Copied ✓');
    } catch {
      setNote('Copy failed (see console)');
    }
  };

  return (
    <div className="eye-editor">
      <canvas ref={ref} style={{ width: W, height: h }} onClick={(e) => void onClick(e)} aria-label="Click where the bell ends" />
      <div className="dev-label">
        bellSplitY {art}: {split.toFixed(3)} {note}
      </div>
    </div>
  );
}
