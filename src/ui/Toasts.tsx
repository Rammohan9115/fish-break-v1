// Bottom-center toasts that auto-dismiss.
import { useEffect } from 'react';
import { MAX_VISIBLE_TOASTS, TOAST_DURATION_MS } from '../game/constants';
import { useGameStore, type Toast as ToastData } from '../store/gameStore';
import { Toast } from './kit';

function ToastItem({ toast }: { toast: ToastData }) {
  const dismiss = useGameStore((s) => s.dismissToast);
  useEffect(() => {
    const handle = window.setTimeout(() => dismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(handle);
  }, [toast.id, dismiss]);
  return <Toast text={toast.text} onDismiss={() => dismiss(toast.id)} />;
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
