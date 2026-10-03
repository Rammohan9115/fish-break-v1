// Bottom-center toasts that auto-dismiss.
import { useEffect } from 'react';
import { MAX_VISIBLE_TOASTS, TOAST_DURATION_MS } from '../game/constants';
import { useGameStore, type Toast } from '../store/gameStore';
import { RichText } from './Icon';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useGameStore((s) => s.dismissToast);
  useEffect(() => {
    const handle = window.setTimeout(() => dismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(handle);
  }, [toast.id, dismiss]);
  return (
    <div className="toast" role="status" onClick={() => dismiss(toast.id)}>
      <RichText text={toast.text} />
    </div>
  );
}

export function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.slice(-MAX_VISIBLE_TOASTS).map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
