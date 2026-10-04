// First login with progress on both sides: compare the two saves and let the player pick one.
import { useState } from 'react';
import { resolveCloudConflict, summarize, useCloudStore, type SaveSummary } from '../store/cloudSave';
import { formatCount } from './format';
import { Button, CurrencyTag, Sheet } from './kit';

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SaveColumn({ title, icon, s, onPick, busy }: { title: string; icon: string; s: SaveSummary; onPick: () => void; busy: boolean }) {
  return (
    <div className="tile conflict-col">
      <div className="conflict-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <dl>
        <dt>Level</dt>
        <dd>{s.level}</dd>
        <dt>Shells</dt>
        <dd>
          <CurrencyTag currency="shells" amount={s.shells} size="sm" />
        </dd>
        <dt>Pearls</dt>
        <dd>
          <CurrencyTag currency="pearls" amount={s.pearls} size="sm" />
        </dd>
        <dt>Fish</dt>
        <dd>🐟 {formatCount(s.fish)}</dd>
        <dt>Last played</dt>
        <dd>{formatWhen(s.lastPlayed)}</dd>
      </dl>
      <Button variant="primary" block busy={busy} onClick={onPick}>
        Keep this one
      </Button>
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
    // No ✕: the player has to pick one (nothing is lost until they do).
    <Sheet title="Two tanks found!" layer="confirm" className="conflict">
      <p className="lead conflict-lead">This browser and your cloud account both have progress. Which one would you like to keep? The other one will be replaced.</p>
      <div className="conflict-cols">
        <SaveColumn title="This device" icon="📱" s={summarize(conflict.local)} onPick={() => pick('local')} busy={busy} />
        <SaveColumn title="Cloud" icon="☁️" s={summarize(conflict.cloud)} onPick={() => pick('cloud')} busy={busy} />
      </div>
    </Sheet>
  );
}
