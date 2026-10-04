// Empty list that teaches: what goes here and how to get some.
import type { ReactNode } from 'react';

export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <strong className="empty-title">{title}</strong>
      {body && <p className="empty-body">{body}</p>}
      {action}
    </div>
  );
}
