// Break Mode: pick 3/5/10 minutes, then the tank goes fullscreen with all UI hidden except a
// soft circular timer and an optional breathing guide. Esc exits anytime.
import { useEffect, useState } from 'react';
import { BREAK_DEFAULT_MIN, BREAK_DURATIONS_MIN, BREAK_TIMER_TICK_MS, BREATHE_IN_MS, BREATHE_OUT_MS } from '../game/constants';
import { breakXpAvailable } from '../game/economy';
import { useGameStore, type BreakSession } from '../store/gameStore';
import { formatClock } from './format';
import { Badge, Button, Sheet, Switch, Tabs } from './kit';

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

/** True only if this break turned fullscreen on (so ending it doesn't kick a landscape player out of fullscreen). */
let breakOwnsFullscreen = false;

/** Fullscreen is a nice-to-have: ignore browsers/frames that refuse it. */
function enterFullscreen(): void {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  breakOwnsFullscreen = true;
  document.documentElement.requestFullscreen().catch(() => {
    breakOwnsFullscreen = false;
  });
}

function leaveFullscreen(): void {
  if (breakOwnsFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  breakOwnsFullscreen = false;
}

function BreakSetup() {
  const openPanel = useGameStore((s) => s.openPanel);
  const startBreak = useGameStore((s) => s.startBreak);
  const xpReady = useGameStore((s) => breakXpAvailable(s.game, Date.now()));
  const [minutes, setMinutes] = useState<number>(BREAK_DEFAULT_MIN);
  const [breathing, setBreathing] = useState(true);

  return (
    <Sheet title="☕ Take a break" size="sm" onClose={() => openPanel(null)}>
      <p className="lead">Just you and the fish. Everything else hides; press Esc or tap the timer to come back anytime.</p>
      <Tabs
        kind="radiogroup"
        ariaLabel="Break length"
        items={BREAK_DURATIONS_MIN.map((m) => ({ id: String(m), label: `${m} min` }))}
        value={String(minutes)}
        onChange={(m) => setMinutes(Number(m))}
      />
      <Switch checked={breathing} onChange={setBreathing}>
        Show a breathing guide
      </Switch>
      <p className="breaksetup-xp">
        {xpReady ? <Badge tone="gold">✨ Finish the break for +10 XP</Badge> : 'You’ve already earned break XP this hour. Enjoy the calm!'}
      </p>
      <Button
        variant="primary"
        size="lg"
        block
        data-autofocus
        onClick={() => {
          enterFullscreen();
          startBreak(minutes, breathing);
        }}
      >
        Start break
      </Button>
    </Sheet>
  );
}

function BreathingGuide() {
  const cycle = BREATHE_IN_MS + BREATHE_OUT_MS;
  return (
    // Keyframes in styles.css split the cycle 40/60 to match BREATHE_IN_MS / BREATHE_OUT_MS (4s / 6s).
    <div className="breathe" aria-live="off" style={{ ['--breathe-cycle' as string]: `${cycle}ms` }}>
      <span className="breathe-in">breathe in…</span>
      <span className="breathe-out">breathe out…</span>
    </div>
  );
}

function ActiveBreak({ session }: { session: BreakSession }) {
  const finishBreak = useGameStore((s) => s.finishBreak);
  const exitBreak = useGameStore((s) => s.exitBreak);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), BREAK_TIMER_TICK_MS);
    return () => window.clearInterval(handle);
  }, []);

  const remaining = session.startedAt + session.durationMs - now;
  useEffect(() => {
    if (remaining <= 0 && !session.result) finishBreak();
  }, [remaining, session.result, finishBreak]);

  // Leaving fullscreen (e.g. the browser eats Esc) ends the break too.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && breakOwnsFullscreen) {
        breakOwnsFullscreen = false;
        exitBreak();
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [exitBreak]);

  const exit = () => {
    leaveFullscreen();
    exitBreak();
  };

  if (session.result) {
    return (
      <Sheet title="Nice break. Back to it ✨" size="sm" layer="celebrate" plainHeader onClose={exit} className="break-end">
        {session.result.xp > 0 && (
          <p className="break-end-xp">
            <Badge tone="gold">+{session.result.xp} XP</Badge>
          </p>
        )}
        <Button variant="primary" size="lg" block onClick={exit} data-autofocus>
          Back to the tank
        </Button>
      </Sheet>
    );
  }

  const progress = Math.min(1, Math.max(0, 1 - remaining / session.durationMs));
  return (
    <div className="break-overlay">
      {session.breathing && <BreathingGuide />}
      <button type="button" className="break-timer" onClick={exit} aria-label={`${formatClock(remaining)} left. Click or press Esc to end the break`}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={RING_R} className="break-ring-track" />
          <circle cx="50" cy="50" r={RING_R} className="break-ring" strokeDasharray={RING_C} strokeDashoffset={RING_C * progress} />
        </svg>
        <span className="break-time">{formatClock(remaining)}</span>
      </button>
    </div>
  );
}

export function BreakMode() {
  const panel = useGameStore((s) => s.panel);
  const session = useGameStore((s) => s.breakSession);
  if (session) return <ActiveBreak session={session} />;
  if (panel === 'break') return <BreakSetup />;
  return null;
}
