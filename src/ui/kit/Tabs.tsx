// Segmented tabs (equal width, 44px, never cut off). ←/→ move between tabs. As a `radiogroup` it's a
// segmented choice (e.g. break length) instead of tab navigation.
import type { ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Plain-text name for screen readers when the label has emoji/badges. */
  title?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  kind = 'tablist',
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  kind?: 'tablist' | 'radiogroup';
}) {
  const radio = kind === 'radiogroup';
  const move = (dir: number) => {
    const i = items.findIndex((t) => t.id === value);
    const next = items[(i + dir + items.length) % items.length];
    if (next) onChange(next.id);
  };
  return (
    <div
      className="tabs"
      role={kind}
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') move(1);
        if (e.key === 'ArrowLeft') move(-1);
      }}
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role={radio ? 'radio' : 'tab'}
          aria-selected={radio ? undefined : t.id === value}
          aria-checked={radio ? t.id === value : undefined}
          aria-label={t.title}
          tabIndex={t.id === value ? 0 : -1}
          className={`tab${t.id === value ? ' tab-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
