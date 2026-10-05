// Tank Style frame: a slim bezel hugging the screen edges with a rounded inner edge (the view stays
// full-bleed), plus an engraved nameplate with the tank's name on its bottom edge. Drawn as one SVG
// shape (outer rect minus inner rounded rect) so every skin gets a real gradient and a glossy edge.
// Purely decorative: it never takes taps.
import { useEffect, useState } from 'react';
import { DEFAULT_TANK_STYLE } from '../game/constants';
import { useGameStore } from '../store/gameStore';

/** Bezel width and inner corner radius (CSS px); a little slimmer on phones. */
const WIDTH = { wide: 10, narrow: 7 } as const;
const RADIUS = 18;
const NARROW_PX = 560;

interface Skin {
  stops: [number, string][];
  /** Inner edge line (glossy highlight or neon tube). */
  edge: string;
  /** Outer shade line. */
  shade: string;
  /** Bamboo: segment joints along the bezel. */
  joints?: boolean;
}

const SKINS: Record<string, Skin> = {
  glass: { stops: [[0, 'rgba(234, 248, 255, 0.85)'], [1, 'rgba(120, 190, 230, 0.75)']], edge: 'rgba(255, 255, 255, 0.95)', shade: 'rgba(40, 90, 140, 0.55)' },
  wood: { stops: [[0, '#d39a62'], [0.5, '#a8693a'], [1, '#6e4122']], edge: 'rgba(255, 222, 180, 0.8)', shade: '#4a2a14' },
  bamboo: { stops: [[0, '#e6d28a'], [1, '#a9903f']], edge: 'rgba(255, 250, 210, 0.85)', shade: '#6b5a22', joints: true },
  chrome: { stops: [[0, '#ffffff'], [0.35, '#b8c0cf'], [0.55, '#f4f6fa'], [1, '#8b94a6']], edge: 'rgba(255, 255, 255, 1)', shade: '#5b6375' },
  pink: { stops: [[0, '#ffe0ee'], [1, '#ff9fc6']], edge: 'rgba(255, 255, 255, 0.95)', shade: '#d9487d' },
  neon: { stops: [[0, '#2a1b5e'], [1, '#160d38']], edge: '#ff4fd8', shade: '#3ff0ff' },
};

function useWindowSize(): { w: number; h: number } {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** The inner rounded rectangle (the window onto the tank). */
function innerPath(w: number, h: number, b: number, r: number): string {
  return `M${b + r} ${b}H${w - b - r}A${r} ${r} 0 0 1 ${w - b} ${b + r}V${h - b - r}A${r} ${r} 0 0 1 ${w - b - r} ${h - b}H${b + r}A${r} ${r} 0 0 1 ${b} ${h - b - r}V${b + r}A${r} ${r} 0 0 1 ${b + r} ${b}Z`;
}

export function TankFrame() {
  const tank = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId));
  const preview = useGameStore((s) => s.stylePreview);
  const onBreak = useGameStore((s) => s.breakSession !== null);
  const { w, h } = useWindowSize();
  if (!tank) return null;
  const style = { ...(tank.style ?? DEFAULT_TANK_STYLE), ...preview };
  const key = style.frame.replace('frame:', '');
  const skin = SKINS[key] ?? SKINS.glass!;
  const b = w <= NARROW_PX ? WIDTH.narrow : WIDTH.wide;
  const inner = innerPath(w, h, b, RADIUS);
  const joints: number[] = [];
  if (skin.joints) for (let x = 60; x < w - 30; x += 90) joints.push(x);
  return (
    <div className={`tank-frame frame-${key}`} aria-hidden="true">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id="frame-fill" x1="0" y1="0" x2="0" y2="1">
            {skin.stops.map(([o, c]) => (
              <stop key={o} offset={o} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
        <path d={`M0 0H${w}V${h}H0Z ${inner}`} fillRule="evenodd" fill="url(#frame-fill)" />
        {joints.map((x) => (
          <g key={x} stroke={skin.shade} strokeWidth={1.5} opacity={0.7}>
            <line x1={x} y1={0} x2={x} y2={b} />
            <line x1={x} y1={h - b} x2={x} y2={h} />
          </g>
        ))}
        <rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} fill="none" stroke={skin.shade} strokeWidth={1.5} />
        <path className="frame-edge" d={inner} fill="none" stroke={skin.edge} strokeWidth={key === 'neon' ? 2.5 : 1.5} />
      </svg>
      {style.nameplate && !onBreak && <span className="nameplate">{tank.name}</span>}
    </div>
  );
}
