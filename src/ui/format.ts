// Number and time formatting for every piece of UI text. Never print a raw float.

/** 1,250 · 12.5K · 3.4M. Exact up to 9,999 so small balances stay precise. */
export function formatCount(n: number): string {
  const v = Math.floor(n);
  const abs = Math.abs(v);
  if (abs < 10_000) return v.toLocaleString('en-US');
  const [div, unit] = abs < 1_000_000 ? [1_000, 'K'] : [1_000_000, 'M'];
  // Round on integers (12450 / 100 = 124.5 exactly) so float error never rounds down.
  const tenths = Math.round(v / (div / 10));
  const scaled = Math.abs(tenths) < 1000 ? tenths / 10 : Math.round(tenths / 10);
  return `${scaled}${unit}`;
}

/** A length of time in minutes, compact: "45m", "2h", "1h 40m". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** An ETA in seconds, friendly: "under a minute", "~7 min", "~1h 40m". */
export function formatEta(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const min = Math.round(seconds / 60);
  if (min < 60) return `~${min} min`;
  return `~${formatMinutes(min)}`;
}

/** m:ss (or h:mm:ss) for live countdowns. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
