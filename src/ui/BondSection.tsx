// FishCard "Bond" section: heart badge + level, progress to the next unlock, pets left this hour, and the
// Tricks row. Bond never goes down, so nothing here ever warns or nags.
import { BOND, MINUTE_MS, SECOND_MS } from '../game/constants';
import { bondName, nextBondLevel, nextSessionAt, sessionsLeft, trickLabel, TRICKS, type TrickId } from '../game/bond';
import type { BondLevel, Fish } from '../game/types';
import { trickKey, useGameStore } from '../store/gameStore';
import { Badge, Button, ProgressBar } from './kit';
import { useNow } from './useBreeding';

/** A heart + the bond level's name. Soulmates get a golden heart. */
export function BondBadge({ level, compact = false }: { level: BondLevel; compact?: boolean }) {
  const soulmate = level === 5;
  return (
    <Badge tone={soulmate ? 'gold' : level >= 3 ? 'love' : 'neutral'} className={`bond-badge${soulmate ? ' bond-badge-soulmate' : ''}`}>
      <span aria-hidden="true">{soulmate ? '💛' : level === 0 ? '🤍' : '💗'}</span>
      {compact ? <span className="sr-only">Bond: </span> : null}
      {bondName(level)}
    </Badge>
  );
}

/** The name class for the Soulmate glow (FishCard title and lists). */
export function bondNameClass(level: BondLevel): string {
  return level === 5 ? 'bond-soulmate' : '';
}

function PetsLeft({ fish, now }: { fish: Fish; now: number }) {
  const left = sessionsLeft(fish, now);
  if (left === 0) {
    const next = nextSessionAt(fish, now);
    const mins = next ? Math.max(1, Math.ceil((next - now) / MINUTE_MS)) : null;
    return (
      <span className="bond-pets meta">
        😌 Content{mins ? ` · pets count again in ${mins} min` : ''}
      </span>
    );
  }
  return (
    <span className="bond-pets meta" aria-label={`${left} of ${BOND.sessionsPerHour} rewarded pets left this hour`}>
      <span aria-hidden="true">
        {Array.from({ length: BOND.sessionsPerHour }, (_, i) => (
          <span key={i} className={i < left ? 'bond-heart-on' : 'bond-heart-off'}>
            ♥
          </span>
        ))}
      </span>{' '}
      pets left this hour
    </span>
  );
}

function Tricks({ fish, now }: { fish: Fish; now: number }) {
  const cooldowns = useGameStore((s) => s.trickCooldowns);
  const follow = useGameStore((s) => s.follow);
  const playTrick = useGameStore((s) => s.playTrick);
  const toggleFollow = useGameStore((s) => s.toggleFollow);
  return (
    <div className="bond-tricks" role="group" aria-label="Tricks">
      {TRICKS.map((t) => {
        const { label, icon } = trickLabel(t.id, fish.speciesId);
        const locked = fish.bondLevel < t.level;
        if (t.id === 'follow') {
          const on = follow?.fishId === fish.id && follow.until > now;
          return (
            <Button key={t.id} size="sm" variant={on ? 'love' : 'secondary'} aria-pressed={on} disabledReason={locked ? `Unlocks at ${bondName(t.level)}` : null} onClick={() => toggleFollow(fish.id)}>
              {locked ? '🔒' : icon} {on ? `Following · ${Math.ceil((follow!.until - now) / SECOND_MS)}s` : label}
              {locked && <span className="bond-trick-lvl"> · {bondName(t.level)}</span>}
            </Button>
          );
        }
        const ready = cooldowns[trickKey(fish.id, t.id)] ?? 0;
        const wait = ready > now ? Math.ceil((ready - now) / SECOND_MS) : 0;
        const reason = locked ? `Unlocks at ${bondName(t.level)}` : wait > 0 ? `Again in ${wait}s` : null;
        return (
          <Button key={t.id} size="sm" disabledReason={reason} onClick={() => playTrick(fish.id, t.id as Exclude<TrickId, 'follow'>)}>
            {locked ? '🔒' : icon} {label}
            {locked && <span className="bond-trick-lvl"> · {bondName(t.level)}</span>}
          </Button>
        );
      })}
    </div>
  );
}

export function BondSection({ fish }: { fish: Fish }) {
  const now = useNow(1000);
  const pet = useGameStore((s) => (s.petProgress?.fishId === fish.id ? s.petProgress.pct : null));
  const next = nextBondLevel(fish);
  return (
    <section className="bond" aria-label="Bond">
      <div className="bond-head">
        <span className="bond-title">Bond</span>
        <BondBadge level={fish.bondLevel} />
        <PetsLeft fish={fish} now={now} />
      </div>
      {next ? (
        <ProgressBar
          label={`Next: ${next.unlock.replace(/^Trick: /, '')} at ${next.name}`}
          icon="💕"
          tone="happy"
          value={next.fraction * 100}
          valueText={`${formatPoints(next.toGo)} 💕 to go`}
        />
      ) : (
        <p className="meta">Soulmates forever 💛 Every trick unlocked.</p>
      )}
      <p className="sr-only" aria-live="polite">
        {pet !== null ? `Petting ${fish.name}: ${pet}%` : ''}
      </p>
      {fish.bondLevel === 0 && <p className="meta bond-hint">Press and hold {fish.name} in the tank to pet them 💕</p>}
      <Tricks fish={fish} now={now} />
    </section>
  );
}

function formatPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
