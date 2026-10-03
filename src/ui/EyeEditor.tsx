// Dev tool: click a fish sprite to place its overlay eye. The new placement applies live to every fish
// of that species/stage and is copied to the clipboard, ready to paste into species.ts.
import { useEffect, useRef, useState } from 'react';
import type { SpeciesId, SpriteEye } from '../game/types';
import { setSpriteEye, spriteEye, spriteEyeSource, type SpriteArt } from '../render/drawFish';
import { fishSprite } from '../render/sprites';

const W = 196;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const eyeLine = (id: SpeciesId, art: SpriteArt, e: SpriteEye) => `${id} ${art}: { x: ${e.x}, y: ${e.y}, size: ${e.size} }`;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function EyeEditor({ speciesId, art }: { speciesId: SpeciesId; art: SpriteArt }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stage = art === 'baby' ? 'baby' : 'adult';
  const sprite = fishSprite(speciesId, stage);
  const [eye, setEye] = useState<SpriteEye>(() => spriteEye(speciesId, stage));
  const [note, setNote] = useState('');
  const h = sprite ? Math.round((W * sprite.h) / sprite.w) : 0;

  useEffect(() => {
    setEye(spriteEye(speciesId, stage));
    setNote('');
  }, [speciesId, stage]);

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
    ctx.beginPath();
    ctx.arc(eye.x * W, eye.y * h, (eye.size * h) / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff2a6a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ff2a6a';
    ctx.fillRect(eye.x * W - 1, eye.y * h - 1, 2, 2);
  }, [sprite, eye, h]);

  if (!sprite) return <div className="dev-label">No sprite loaded for this fish.</div>;

  const apply = async (next: SpriteEye) => {
    setEye(next);
    setSpriteEye(speciesId, art, next);
    setNote((await copy(eyeLine(speciesId, art, next))) ? 'Copied ✓' : 'Copy failed (see console)');
    console.info(eyeLine(speciesId, art, next));
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    void apply({ ...eye, x: round3((e.clientX - rect.left) / rect.width), y: round3((e.clientY - rect.top) / rect.height) });
  };

  return (
    <div className="eye-editor">
      <canvas ref={ref} style={{ width: W, height: h }} onClick={onClick} aria-label="Click to place the eye" />
      <label className="dev-row">
        Size {eye.size.toFixed(3)}
        <input
          type="range"
          min={0.05}
          max={0.4}
          step={0.005}
          value={eye.size}
          onChange={(e) => void apply({ ...eye, size: round3(Number(e.target.value)) })}
        />
      </label>
      <div className="dev-buttons">
        <button type="button" onClick={async () => setNote((await copy(spriteEyeSource())) ? 'Copied all ✓' : 'Copy failed')}>
          Copy all eyes
        </button>
        <span className="dev-label">{note}</span>
      </div>
    </div>
  );
}
