// Notification budget: one toast at a time above the toolbar; the rest wait their turn (the store merges
// duplicates and "+N" amounts). Each toast auto-dismisses; tapping it dismisses early.
import { useEffect } from 'react';
import { MAX_VISIBLE_TOASTS, TOAST_DURATION_MS } from '../game/constants';
import { useGameStore, type Toast as ToastData } from '../store/gameStore';
import { Toast } from './kit';

function ToastItem({ toast }: { toast: ToastData }) {
  const dismiss = useGameStore((s) => s.dismissToast);
  // A merged duplicate bumps `rev`, which restarts the timer.
  useEffect(() => {
    const handle = window.setTimeout(() => dismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(handle);
  }, [toast.id, toast.rev, dismiss]);
  return <Toast key={toast.rev} text={toast.text} onDismiss={() => dismiss(toast.id)} />;
}

export function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  // Hold toasts while the very first tip is up, so the first screen asks for one thing only.
  const tipUp = useGameStore((s) => s.onboardingStep === 0);
  return (
    <div className="toasts" aria-live="polite">
      {!tipUp && toasts.slice(0, MAX_VISIBLE_TOASTS).map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
