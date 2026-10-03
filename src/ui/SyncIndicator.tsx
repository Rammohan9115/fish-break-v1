// Small cloud-sync status (☁️✓ synced / ⟳ saving / ⚠ offline). Hidden for guests.
import { useCloudStore, type SyncStatus } from '../store/cloudSave';

const LABELS: Record<Exclude<SyncStatus, 'off'>, { icon: string; text: string }> = {
  synced: { icon: '☁️✓', text: 'Synced' },
  saving: { icon: '⟳', text: 'Saving…' },
  offline: { icon: '⚠', text: 'Offline, will retry' },
  error: { icon: '⚠', text: 'Cloud save unavailable' },
  conflict: { icon: '⚠', text: 'Choose a save' },
};

export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const status = useCloudStore((s) => s.status);
  const user = useCloudStore((s) => s.user);
  if (!user || status === 'off') return null;
  const { icon, text } = LABELS[status];
  return (
    <span className={`sync-badge sync-${status}${compact ? ' sync-compact' : ''}`} title={text} role="status" aria-label={text}>
      <span className={status === 'saving' ? 'sync-spin' : undefined} aria-hidden="true">
        {icon}
      </span>
      {!compact && <span>{text}</span>}
    </span>
  );
}
