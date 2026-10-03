// Dev tool: set the chest lid's cut line and hinge by clicking the sprite. Changes apply live to every
// chest and the config line is copied, ready to paste into artConfig.ts (DECOR_ART.chest.anchors.lid).
import { useEffect, useRef, useState } from 'react';
import { lidConfig, setLidConfig, type LidConfig } from '../render/artConfig';
import { decorSprite } from '../render/assets';

const W = 196;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const lidLine = (l: LidConfig) => `lid: { line: ${l.line}, hinge: [${l.hinge[0]}, ${l.hinge[1]}], closeDeg: ${l.closeDeg} },`;

export function LidEditor() {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprite = decorSprite('chest');
  const [lid, setLid] = useState<LidConfig | null>(() => lidConfig('chest'));
  const [mode, setMode] = useState<'line' | 'hinge'>('line');
  const [note, setNote] = useState('');
  const h = sprite ? Math.round((W * sprite.h) / sprite.w) : 0;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !sprite || !lid) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, h);
    ctx.drawImage(sprite.canvas, 0, 0, W, h);
    ctx.fillStyle = 'rgba(255, 42, 106, 0.18)';
    ctx.fillRect(0, 0, W, lid.line * h);
    ctx.strokeStyle = '#ff2a6a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, lid.line * h);
    ctx.lineTo(W, lid.line * h);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(lid.hinge[0] * W, lid.hinge[1] * h, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe14a';
    ctx.fill();
    ctx.stroke();
  }, [sprite, lid, h]);

  if (!sprite || !lid) return <div className="dev-label">No chest sprite loaded.</div>;

  const apply = async (next: LidConfig) => {
    setLid(next);
    setLidConfig('chest', next);
    console.info(lidLine(next));
    try {
      await navigator.clipboard.writeText(lidLine(next));
      setNote('Copied ✓');
    } catch {
      setNote('Logged to console');
    }
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const u = round3((e.clientX - rect.left) / rect.width);
    const v = round3((e.clientY - rect.top) / rect.height);
    void apply(mode === 'line' ? { ...lid, line: v } : { ...lid, hinge: [u, v] });
  };

  return (
    <div className="eye-editor">
      <div className="dev-buttons">
        <button type="button" aria-pressed={mode === 'line'} onClick={() => setMode('line')}>
          {mode === 'line' ? '● ' : ''}Lid line
        </button>
        <button type="button" aria-pressed={mode === 'hinge'} onClick={() => setMode('hinge')}>
          {mode === 'hinge' ? '● ' : ''}Hinge
        </button>
      </div>
      <canvas ref={ref} style={{ width: W, height: h }} onClick={onClick} aria-label={`Click to set the ${mode}`} />
      <label className="dev-row">
        Closed {lid.closeDeg}°
        <input type="range" min={-30} max={30} step={1} value={lid.closeDeg} onChange={(e) => void apply({ ...lid, closeDeg: Number(e.target.value) })} />
      </label>
      <span className="dev-label">{note}</span>
    </div>
  );
}
