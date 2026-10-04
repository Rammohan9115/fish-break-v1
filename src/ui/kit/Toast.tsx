// One toast: a short message, optionally with an action ("Undo").
import { RichText } from '../Icon';
import { Button } from './Button';

export function Toast({ text, actionLabel, onAction, onDismiss }: { text: string; actionLabel?: string; onAction?: () => void; onDismiss: () => void }) {
  return (
    <div className="toast" role="status" onClick={onDismiss}>
      <span className="toast-text">
        <RichText text={text} />
      </span>
      {actionLabel && onAction && (
        <Button
          variant="ghost"
          size="sm"
          className="toast-action"
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
