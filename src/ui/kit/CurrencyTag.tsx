// Shells / pearls amount with its icon, formatted (1,250 / 12.5K). `short` marks a price you can't afford yet.
import { formatCount } from '../format';
import { Icon } from '../Icon';

export type Currency = 'shells' | 'pearls';

export function CurrencyTag({ currency, amount, short = false, size = 'md', className = '' }: { currency: Currency; amount: number; short?: boolean; size?: 'sm' | 'md'; className?: string }) {
  const id = currency === 'shells' ? 'shell' : 'pearl';
  return (
    <span className={`ctag ctag-${size}${short ? ' ctag-short' : ''} ${className}`}>
      <Icon id={id} className="ctag-icon" label={currency} />
      {formatCount(amount)}
    </span>
  );
}
