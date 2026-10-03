// First login with progress on both sides: compare the two saves and let the player pick one.
import { useState } from 'react';
import { resolveCloudConflict, summarize, useCloudStore, type SaveSummary } from '../store/cloudSave';

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SaveColumn({ title, icon, s, onPick, busy }: { title: string; icon: string; s: SaveSummary; onPick: () => void; busy: boolean }) {
  return (
    <div className="conflict-col">
      <div className="conflict-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <dl>
        <dt>Level</dt>
        <dd>{s.level}</dd>
        <dt>Shells</dt>
        <dd>🐚 {s.shells.toLocaleString()}</dd>
        <dt>Pearls</dt>
        <dd>{s.pearls.toLocaleString()}</dd>
        <dt>Fish</dt>
        <dd>🐟 {s.fish}</dd>
        <dt>Last played</dt>
        <dd>{formatWhen(s.lastPlayed)}</dd>
      </dl>
      <button type="button" className="shop-buy" onClick={onPick} disabled={busy}>
        Keep this one
      </button>
    </div>
  );
}

export function CloudConflictModal() {
  const conflict = useCloudStore((s) => s.conflict);
  const [busy, setBusy] = useState(false);
  if (!conflict) return null;
  const pick = (choice: 'local' | 'cloud') => {
    setBusy(true);
    void resolveCloudConflict(choice).finally(() => setBusy(false));
  };
  return (
    <div className="modal-backdrop conflict-backdrop">
      <section className="shop conflict" role="dialog" aria-modal="true" aria-label="Choose which save to keep">
        <header className="shop-head">
          <h2>Two tanks found!</h2>
        </header>
        <div className="shop-body">
          <p className="conflict-lead">This browser and your cloud account both have progress. Which one would you like to keep? The other one will be replaced.</p>
          <div className="conflict-cols">
            <SaveColumn title="This device" icon="📱" s={summarize(conflict.local)} onPick={() => pick('local')} busy={busy} />
            <SaveColumn title="Cloud" icon="☁️" s={summarize(conflict.cloud)} onPick={() => pick('cloud')} busy={busy} />
          </div>
        </div>
      </section>
    </div>
  );
}
