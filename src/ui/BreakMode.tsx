// Break Mode: pick 3/5/10 minutes, then the tank goes fullscreen with all UI hidden except a
// soft circular timer and an optional breathing guide. Esc exits anytime.
import { useEffect, useState } from 'react';
import { BREAK_DEFAULT_MIN, BREAK_DURATIONS_MIN, BREAK_TIMER_TICK_MS, BREATHE_IN_MS, BREATHE_OUT_MS, SECOND_MS } from '../game/constants';
import { breakXpAvailable } from '../game/economy';
import { useGameStore, type BreakSession } from '../store/gameStore';

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / SECOND_MS));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

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
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && openPanel(null)}>
      <section className="shop breaksetup" role="dialog" aria-modal="true" aria-label="Take a break">
        <header className="shop-head">
          <h2>☕ Take a break</h2>
          <button type="button" className="fishcard-close" onClick={() => openPanel(null)} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="shop-body">
          <p className="shop-sub">Just you and the fish. Everything else hides; press Esc to come back anytime.</p>
          <div className="breaksetup-durations" role="radiogroup" aria-label="Break length">
            {BREAK_DURATIONS_MIN.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} className={`shop-tab${minutes === m ? ' shop-tab-active' : ''}`} onClick={() => setMinutes(m)}>
                {m} min
              </button>
            ))}
          </div>
          <label className="breaksetup-toggle">
            <input type="checkbox" checked={breathing} onChange={(e) => setBreathing(e.target.checked)} />
            Show a breathing guide
          </label>
          <p className="breaksetup-xp">{xpReady ? '✨ Finish the break for +10 XP' : 'You’ve already earned break XP this hour. Enjoy the calm!'}</p>
          <button
            type="button"
            className="shop-buy"
            onClick={() => {
              enterFullscreen();
              startBreak(minutes, breathing);
            }}
          >
            Start break
          </button>
        </div>
      </section>
    </div>
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
      <div className="break-overlay">
        <div className="break-end" role="dialog" aria-label="Break finished">
          <strong>Nice break. Back to it ✨</strong>
          {session.result.xp > 0 && <span className="gift-xp">+{session.result.xp} XP</span>}
          <button type="button" className="shop-buy" onClick={exit} autoFocus>
            Back to the tank
          </button>
        </div>
      </div>
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
