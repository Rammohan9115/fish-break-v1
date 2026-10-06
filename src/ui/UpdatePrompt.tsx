// "New version" prompt from the service worker. Asks first: updating reloads the page.
import { usePwaStore } from '../pwa';
import { ConfirmDialog } from './kit';

export function UpdatePrompt() {
  const needRefresh = usePwaStore((s) => s.needRefresh);
  const dismiss = usePwaStore((s) => s.dismiss);
  const update = usePwaStore((s) => s.update);
  if (!needRefresh) return null;
  return (
    <ConfirmDialog
      title="New version ready ✨"
      body={<p>A fresh version of Offishal Break is ready. Your fish and progress are saved; the page will reload.</p>}
      confirmLabel="Update now"
      cancelLabel="Later"
      onConfirm={update}
      onCancel={dismiss}
    />
  );
}
