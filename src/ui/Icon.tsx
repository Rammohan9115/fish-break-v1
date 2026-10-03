// Currency icons in the DOM UI: the cleaned shell/pearl sprites, falling back to the emoji (or the
// little CSS pearl) when the sprite didn't load.
import { Fragment } from 'react';
import { iconUrl } from '../render/assets';

type CurrencyIcon = 'shell' | 'pearl';

export function Icon({ id, className = '', label }: { id: CurrencyIcon; className?: string; label?: string }) {
  const url = iconUrl(id);
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  if (url) return <img className={`icon icon-${id} ${className}`} src={url} alt={label ?? ''} aria-hidden={label ? undefined : true} draggable={false} />;
  if (id === 'pearl') return <span className={`hud-pearl ${className}`} {...a11y} />;
  return (
    <span className={className} {...a11y}>
      🐚
    </span>
  );
}

const TOKENS: Record<string, CurrencyIcon> = { '🐚': 'shell', '⚪': 'pearl' };

/** Text with the 🐚 / ⚪ emoji swapped for the icon sprites (toasts, rewards). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(🐚|⚪)/u);
  return (
    <>
      {parts.map((part, i) => {
        const icon = TOKENS[part];
        return icon ? <Icon key={i} id={icon} className="icon-inline" /> : <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
