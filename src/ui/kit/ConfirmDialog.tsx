// Confirmation for anything destructive or costly (sell, rehome, reset). Enter confirms; Esc / outside / ✕ cancel.
// Danger dialogs focus the safe choice first.
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Sheet } from './Sheet';

export interface ConfirmDialogProps {
  title: string;
  body?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'love';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Cancel', tone = 'primary', onConfirm, onCancel }: ConfirmDialogProps) {
  const danger = tone === 'danger';
  return (
    <Sheet title={title} onClose={onCancel} size="sm" layer="confirm" role="alertdialog" className="confirm">
      <div
        onKeyDown={(e) => {
          // Enter confirms unless a button has focus (it then activates itself).
          if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) onConfirm();
        }}
      >
        {body && <div className="confirm-body">{body}</div>}
        <div className="confirm-actions">
          <Button variant="secondary" onClick={onCancel} data-autofocus={danger ? true : undefined}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} data-autofocus={danger ? undefined : true}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
