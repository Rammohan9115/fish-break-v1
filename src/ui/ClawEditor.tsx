// Dev tool: set a crab's claw regions and wrist pivots. Click the sprite to move the selected claw's pivot; the sliders
// set how far the claw region reaches. Applies live and is copied to the clipboard (paste into render/clawSplit.ts).
import { useEffect, useRef, useState } from 'react';
import type { SpeciesId } from '../game/types';
import { clawConfig, clawConfigSource, setClawConfig, type ClawArt, type ClawConfig, type ClawRegion } from '../render/clawSplit';
import { fishSprite } from '../render/sprites';

const W = 196;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ClawEditor({ speciesId, art }: { speciesId: SpeciesId; art: ClawArt }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprite = fishSprite(speciesId, art === 'baby' ? 'baby' : 'adult');
  const [cfg, setCfg] = useState<ClawConfig | null>(() => clawConfig(speciesId, art));
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [note, setNote] = useState('');
  const h = sprite ? Math.round((W * sprite.h) / sprite.w) : 0;

  useEffect(() => {
    setCfg(clawConfig(speciesId, art));
    setNote('');
  }, [speciesId, art]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !sprite || !cfg) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, h);
    ctx.drawImage(sprite.canvas, 0, 0, W, h);
    for (const s of ['left', 'right'] as const) {
      const r = cfg[s];
      ctx.strokeStyle = s === side ? '#ff2a6a' : 'rgba(255,42,106,0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x0 * W, r.y0 * h, (r.x1 - r.x0) * W, (r.y1 - r.y0) * h);
      ctx.fillStyle = '#ff2a6a';
      ctx.beginPath();
      ctx.arc(r.px * W, r.py * h, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [sprite, cfg, h, side]);

  if (!sprite || !cfg) return <div className="dev-label">This species has no claws to set.</div>;

  const apply = async (next: ClawConfig) => {
    setCfg(next);
    setClawConfig(speciesId, art, next);
    setNote((await copy(clawConfigSource())) ? 'Copied ✓' : 'Copy failed (see console)');
    console.info(clawConfigSource());
  };
  const patch = (p: Partial<ClawRegion>) => void apply({ ...cfg, [side]: { ...cfg[side], ...p } });
  const r = cfg[side];

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    patch({ px: round3((e.clientX - rect.left) / rect.width), py: round3((e.clientY - rect.top) / rect.height) });
  };

  return (
    <div className="eye-editor">
      <canvas ref={ref} style={{ width: W, height: h }} onClick={onClick} aria-label="Click to place the claw's wrist pivot" />
      <div className="dev-buttons">
        <button type="button" aria-pressed={side === 'left'} onClick={() => setSide('left')}>
          Left claw
        </button>
        <button type="button" aria-pressed={side === 'right'} onClick={() => setSide('right')}>
          Right claw
        </button>
      </div>
      <label className="dev-row">
        Reach across {(side === 'left' ? r.x1 : 1 - r.x0).toFixed(2)}
        <input
          type="range"
          min={0.1}
          max={0.5}
          step={0.005}
          value={side === 'left' ? r.x1 : 1 - r.x0}
          onChange={(e) => patch(side === 'left' ? { x1: round3(Number(e.target.value)) } : { x0: round3(1 - Number(e.target.value)) })}
        />
      </label>
      <label className="dev-row">
        Reach down {r.y1.toFixed(2)}
        <input type="range" min={0.2} max={0.7} step={0.005} value={r.y1} onChange={(e) => patch({ y1: round3(Number(e.target.value)) })} />
      </label>
      <div className="dev-buttons">
        <button type="button" onClick={async () => setNote((await copy(clawConfigSource())) ? 'Copied all ✓' : 'Copy failed')}>
          Copy all claws
        </button>
        <span className="dev-label">{note}</span>
      </div>
    </div>
  );
}
