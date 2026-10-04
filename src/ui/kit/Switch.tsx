// On/off switch with its label (the whole row is the tap target).
import type { ReactNode } from 'react';

export function Switch({ checked, onChange, children, hint }: { checked: boolean; onChange: (on: boolean) => void; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="switch">
      <span className="switch-text">
        <span className="switch-label">{children}</span>
        {hint && <span className="switch-hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </label>
  );
}
