// Shown when this tab must not save: the save came from a newer version, or another tab is the one playing.
import { useEffect, useState } from 'react';
import { playHere } from '../store/gameStore';
import { useSaveLock } from '../store/saveLock';
import { ConfirmDialog } from './kit';

export function SaveLockPrompt() {
  const reason = useSaveLock((s) => s.reason);
  const [hidden, setHidden] = useState(false);

  // A dismissed prompt comes back whenever the player returns to this tab.
  useEffect(() => {
    const show = () => document.visibilityState === 'visible' && setHidden(false);
    document.addEventListener('visibilitychange', show);
    return () => document.removeEventListener('visibilitychange', show);
  }, []);
  useEffect(() => setHidden(false), [reason]);

  if (!reason || hidden) return null;
  if (reason === 'newer') {
    return (
      <ConfirmDialog
        title="Please refresh 🔄"
        body={<p>Your saved game was made by a newer version of Offishal Break. It's untouched and safe. Reload to open it; nothing is saved until you do.</p>}
        confirmLabel="Reload"
        cancelLabel="Not now"
        onConfirm={() => window.location.reload()}
        onCancel={() => setHidden(true)}
      />
    );
  }
  return (
    <ConfirmDialog
      title="Open in another tab 🐟"
      body={<p>Offishal Break is already open in another tab, and only one tab can save. Play here instead? The other tab will save first, so nothing is lost.</p>}
      confirmLabel="Play here"
      cancelLabel="Keep waiting"
      onConfirm={() => void playHere()}
      onCancel={() => setHidden(true)}
    />
  );
}
