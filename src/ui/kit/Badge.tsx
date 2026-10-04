// Small pill for counts and states ("3", "Adult", "Viewing", "In use").
import type { ReactNode } from 'react';

export type BadgeTone = 'brand' | 'love' | 'gold' | 'good' | 'neutral';

export function Badge({ children, tone = 'neutral', count = false, className = '' }: { children: ReactNode; tone?: BadgeTone; count?: boolean; className?: string }) {
  return <span className={`badge badge-${tone}${count ? ' badge-count' : ''} ${className}`}>{children}</span>;
}
