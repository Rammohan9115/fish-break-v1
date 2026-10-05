// Tank Style: frame, substrate, lighting, water and bubbler for the active tank, with a live preview.
// Tapping an option previews it in the tank; "Use" applies an owned/free one, "Buy" buys and applies it.
// Owned styles work on every tank. No level gates. Used in Decorate mode and the shop's Styles tab.
import { useEffect, useState } from 'react';
import { STYLE_CATEGORIES, STYLE_OPTIONS } from '../game/constants';
import { checkBuyStyle, ownsStyle } from '../game/economy';
import type { StyleCategory, StyleOption, TankStyle } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { Button, CurrencyTag, Switch, Tabs } from './kit';

/** A small swatch hinting at each option's look. */
const SWATCH: Record<string, string> = {
  'frame:glass': 'linear-gradient(135deg, #eaf8ff, #9fd3ef)',
  'frame:wood': 'linear-gradient(135deg, #c98b55, #7a4a26)',
  'frame:bamboo': 'repeating-linear-gradient(90deg, #d9c27a 0 10px, #b39a4f 10px 12px)',
  'frame:chrome': 'linear-gradient(135deg, #f4f6fa, #9aa3b5 50%, #e8ecf3)',
  'frame:pink': 'linear-gradient(135deg, #ffd1e4, #ff9fc6)',
  'frame:neon': 'linear-gradient(135deg, #2a1b5e, #ff3fd0 60%, #3ff0ff)',
  'substrate:golden': 'linear-gradient(#f7d58f, #e1b064)',
  'substrate:white': 'linear-gradient(#fffaf0, #e9e0cf)',
  'substrate:gravel': 'radial-gradient(circle at 30% 30%, #5d6276 20%, #2a2c36 70%)',
  'substrate:pebbles': 'radial-gradient(circle at 25% 35%, #ffc2d6 18%, transparent 20%), radial-gradient(circle at 70% 60%, #bfe3ff 18%, transparent 20%), #fff1e6',
  'substrate:glow': 'radial-gradient(circle at 40% 40%, #78ffdc 10%, #2b2f52 45%)',
  'lighting:natural': 'linear-gradient(#fffbe8, #bfe6ff)',
  'lighting:sunset': 'linear-gradient(#ffc27a, #ff7f50)',
  'lighting:moon': 'linear-gradient(#cfd9ff, #6f95ff)',
  'lighting:tropical': 'linear-gradient(#b8fff0, #34e0c0)',
  'lighting:pink': 'linear-gradient(#ffd6ec, #ff8fc8)',
  'lighting:custom': 'conic-gradient(#ff6b8b, #ffe066, #7ee081, #5ec8ff, #a98bff, #ff6b8b)',
  'water:crystal': 'linear-gradient(#bff0ff, #3fb6e8)',
  'water:lagoon': 'linear-gradient(#7fe0ff, #1fb8ff)',
  'water:emerald': 'linear-gradient(#7ff0c8, #14c08c)',
  'water:twilight': 'linear-gradient(#9b86ff, #3b2a8a)',
  'bubbler:classic': 'radial-gradient(circle at 50% 40%, #ffffff 20%, #9fd3ef 22%, #3fb6e8 60%)',
  'bubbler:off': 'linear-gradient(#e2edf6, #cfe0ec)',
  'bubbler:curtain': 'radial-gradient(circle at 25% 50%, #fff 12%, transparent 14%), radial-gradient(circle at 60% 30%, #fff 12%, transparent 14%), #3fb6e8',
  'bubbler:hearts': 'radial-gradient(circle at 50% 50%, #ffd1e4 30%, #ff8fc8 60%)',
};

function OptionTile({ opt, current, previewing, onPick }: { opt: StyleOption; current: boolean; previewing: boolean; onPick: () => void }) {
  const game = useGameStore((s) => s.game);
  const owned = ownsStyle(game, opt.id);
  return (
    <button type="button" className={`style-tile${current ? ' style-tile-on' : ''}${previewing ? ' style-tile-preview' : ''}`} aria-pressed={current} onClick={onPick}>
      <span className="style-swatch" style={{ background: SWATCH[opt.id] ?? '#ccc' }} aria-hidden="true" />
      <span className="style-name">{opt.name}</span>
      <span className="style-price meta">{current ? 'In use' : owned ? (opt.price ? 'Owned' : 'Free') : <CurrencyTag currency={opt.price!.currency} amount={opt.price!.amount} size="sm" />}</span>
    </button>
  );
}

export function StylePicker() {
  const game = useGameStore((s) => s.game);
  const preview = useGameStore((s) => s.stylePreview);
  const previewStyle = useGameStore((s) => s.previewStyle);
  const applyStyle = useGameStore((s) => s.applyStyle);
  const buyStyle = useGameStore((s) => s.buyStyle);
  const setExtras = useGameStore((s) => s.setStyleExtras);
  const [category, setCategory] = useState<StyleCategory>('frame');
  const tank = game.tanks.find((t) => t.id === game.activeTankId)!;

  // Leaving the picker drops any preview that wasn't applied.
  useEffect(() => () => previewStyle(null), [previewStyle]);

  const pending = preview?.[category] as string | undefined;
  const pendingOpt = pending ? STYLE_OPTIONS.find((o) => o.id === pending) : undefined;
  const options = STYLE_OPTIONS.filter((o) => o.category === category);
  const pick = (opt: StyleOption) => {
    if (opt.id === tank.style[category]) previewStyle(null);
    else previewStyle({ [category]: opt.id } as Partial<TankStyle>);
  };
  const error = pendingOpt && !ownsStyle(game, pendingOpt.id) ? checkBuyStyle(game, pendingOpt.id) : null;

  return (
    <div className="style-picker">
      <Tabs
        ariaLabel="Style category"
        kind="radiogroup"
        value={category}
        onChange={(c) => {
          setCategory(c);
          previewStyle(null);
        }}
        items={STYLE_CATEGORIES.map((c) => ({ id: c.id, label: `${c.icon} ${c.name}`, title: c.name }))}
      />
      <div className="style-grid">
        {options.map((o) => (
          <OptionTile key={o.id} opt={o} current={tank.style[category] === o.id} previewing={pending === o.id} onPick={() => pick(o)} />
        ))}
      </div>
      {category === 'lighting' && (tank.style.lighting === 'lighting:custom' || pending === 'lighting:custom') && (
        <label className="style-color">
          <span>Custom color</span>
          <input type="color" value={tank.style.lightingColor} onChange={(e) => setExtras({ lightingColor: e.target.value })} />
        </label>
      )}
      {category === 'frame' && (
        <Switch checked={tank.style.nameplate} onChange={(on) => setExtras({ nameplate: on })} hint={`Show “${tank.name}” on the frame`}>
          Nameplate
        </Switch>
      )}
      {pendingOpt && (
        <div className="style-actions">
          <span className="meta">Previewing {pendingOpt.name}</span>
          <Button size="sm" variant="ghost" onClick={() => previewStyle(null)}>
            Cancel
          </Button>
          {ownsStyle(game, pendingOpt.id) ? (
            <Button size="sm" variant="primary" onClick={() => applyStyle(pendingOpt.id)}>
              Use it
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabledReason={error === 'cost' ? 'Not enough yet — collect shells from the sand 🐚' : null} onClick={() => buyStyle(pendingOpt.id)}>
              Buy · <CurrencyTag currency={pendingOpt.price!.currency} amount={pendingOpt.price!.amount} size="sm" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
