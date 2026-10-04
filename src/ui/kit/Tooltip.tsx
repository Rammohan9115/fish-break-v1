// Small speech bubble above its (position: relative) parent. Used for "why is this blocked" and short hints.
export function Tooltip({ text, placement = 'top' }: { text: string; placement?: 'top' | 'bottom' }) {
  return (
    <span className={`tooltip tooltip-${placement}`} role="status">
      {text}
    </span>
  );
}

/** Coachmark: a tip bubble that points at something (onboarding, first-time hints). */
export function Coachmark({
  title,
  body,
  step,
  total,
  anchor,
  actions,
}: {
  title: string;
  body: string;
  step?: number;
  total?: number;
  /** Where it sits: above the toolbar, mid-tank, or just above the sand. */
  anchor: 'toolbar' | 'center' | 'sand';
  actions?: React.ReactNode;
}) {
  return (
    <div className={`coachmark coachmark-${anchor}`} role="dialog" aria-label={title}>
      {step !== undefined && total !== undefined && (
        <div className="coachmark-step">
          Tip {step} of {total}
        </div>
      )}
      <strong className="coachmark-title">{title}</strong>
      <p className="coachmark-body">{body}</p>
      {actions && <div className="coachmark-actions">{actions}</div>}
    </div>
  );
}
