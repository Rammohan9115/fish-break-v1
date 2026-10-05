// Card: the info card for a thing in the tank (a fish, a decor piece). Same content on every screen, three shells:
//  - a mouse on a wide screen: a Popover anchored to the thing (follows it, arrow, flips and shifts to stay in view);
//  - a finger on a wide screen (tablet, landscape phone): docked on the right like a panel, the tank stays visible;
//  - a narrow screen: a non-modal bottom sheet over the lower half, the tank stays visible above it.
import type { ReactNode } from 'react';
import { OverlayFrame } from './OverlayFrame';
import { Panel } from './Panel';
import { Popover } from './Popover';
import type { Box } from './rules';
import { useOverlayVariant } from './useScreenEnv';

/** A card holds still until its fish has swum this far (px), so its buttons don't slide away under the pointer. */
const CARD_STICKINESS = 160;

export interface CardProps {
  title: ReactNode;
  onClose: () => void;
  /** The thing's box in viewport px (null when gone), for the popover. */
  anchor: () => Box | null;
  /** Called when the anchor disappears (the fish was sold, the piece removed). */
  onLost?: () => void;
  tabs?: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  ariaLabel: string;
  scrollKey?: string;
}

export function Card({ title, onClose, anchor, onLost, tabs, footer, headerExtra, children, className = '', ariaLabel, scrollKey }: CardProps) {
  const variant = useOverlayVariant('card');
  if (variant === 'popover') {
    return (
      <Popover anchor={anchor} onLost={onLost} onClose={onClose} prefer="top" stickiness={CARD_STICKINESS} className="ov-popover-card" ariaLabel={ariaLabel}>
        <section className={`sheet ov-card ${className}`} aria-label={ariaLabel}>
          <OverlayFrame title={title} onClose={onClose} headerExtra={headerExtra} tabs={tabs} footer={footer} scrollKey={scrollKey}>
            {children}
          </OverlayFrame>
        </section>
      </Popover>
    );
  }
  return (
    <Panel title={title} onClose={onClose} headerExtra={headerExtra} tabs={tabs} footer={footer} ariaLabel={ariaLabel} className={`ov-card ${className}`} modal={false} snap="half" shiftScene={false} layout="dock" scrollKey={scrollKey}>
      {children}
    </Panel>
  );
}
