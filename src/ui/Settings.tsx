// Settings panel: cloud account (Save progress ☁️ / logged-in email + Log out) and Reset game.
import { useState } from 'react';
import { AUTH_GOOGLE_ENABLED } from '../game/constants';
import { createInitialState } from '../game/sim';
import { logOut, sendMagicLink, signInWithGoogle, useCloudStore } from '../store/cloudSave';
import { useGameStore } from '../store/gameStore';
import { saveGame } from '../store/save';
import { SyncBadge } from './SyncIndicator';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('That email looks a little off 🐟');
      return;
    }
    setError(null);
    setState('sending');
    const result = await sendMagicLink(trimmed);
    if (result.ok) setState('sent');
    else {
      setState('idle');
      setError(result.message);
    }
  };

  if (state === 'sent') {
    return (
      <div className="login">
        <div className="login-icon" aria-hidden="true">
          📬
        </div>
        <h3>Check your inbox!</h3>
        <p>
          We sent a magic link to <strong>{email.trim()}</strong>. Tap it on this device and your fish will be saved to the cloud.
        </p>
        <button type="button" className="shop-small" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  return (
    <form
      className="login"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="login-icon" aria-hidden="true">
        ☁️
      </div>
      <h3>Save your progress</h3>
      <p>Keep your fish safe and play on any device. No password: we'll email you a magic link.</p>
      <input
        className="login-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Email address"
        autoFocus
      />
      {error && <p className="login-error">{error}</p>}
      <button type="submit" className="shop-buy login-submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send magic link ✨'}
      </button>
      {AUTH_GOOGLE_ENABLED && (
        <button type="button" className="shop-small login-google" onClick={() => void signInWithGoogle()}>
          Continue with Google
        </button>
      )}
      <button type="button" className="login-back" onClick={onBack}>
        Maybe later
      </button>
    </form>
  );
}

function ResetGame() {
  const [confirming, setConfirming] = useState(false);
  const openPanel = useGameStore((s) => s.openPanel);
  const reset = () => {
    const fresh = createInitialState(Date.now());
    useGameStore.getState().loadState(fresh);
    saveGame(fresh, window.localStorage);
    useGameStore.getState().addToast('Fresh tank, fresh start 🐟');
    openPanel(null);
  };
  if (!confirming) {
    return (
      <button type="button" className="shop-small settings-danger" onClick={() => setConfirming(true)}>
        Reset game
      </button>
    );
  }
  return (
    <div className="settings-confirm" role="alertdialog" aria-label="Confirm reset">
      <p>Start over with a brand-new tank? All your fish, shells and levels will be gone.</p>
      <div className="settings-row">
        <button type="button" className="shop-small" onClick={() => setConfirming(false)}>
          Keep playing
        </button>
        <button type="button" className="shop-small settings-danger" onClick={reset}>
          Yes, reset
        </button>
      </div>
    </div>
  );
}

export function Settings() {
  const open = useGameStore((s) => s.panel === 'settings');
  const openPanel = useGameStore((s) => s.openPanel);
  const enabled = useCloudStore((s) => s.enabled);
  const user = useCloudStore((s) => s.user);
  const [view, setView] = useState<'main' | 'login'>('main');
  const [loggingOut, setLoggingOut] = useState(false);

  if (!open) return null;
  const close = () => {
    setView('main');
    openPanel(null);
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section className="shop settings" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="shop-head">
          <h2>{view === 'login' ? 'Cloud save' : 'Settings'}</h2>
          <button type="button" className="fishcard-close" onClick={close} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="shop-body">
          {view === 'login' && !user ? (
            <LoginForm onBack={() => setView('main')} />
          ) : (
            <>
              {enabled && (
                <div className="settings-section">
                  <h3>Account</h3>
                  {user ? (
                    <>
                      <p className="settings-email">
                        Signed in as <strong>{user.email ?? 'your account'}</strong>
                      </p>
                      <SyncBadge />
                      <button
                        type="button"
                        className="shop-small"
                        disabled={loggingOut}
                        onClick={() => {
                          setLoggingOut(true);
                          void logOut().finally(() => {
                            setLoggingOut(false);
                            openPanel(null);
                          });
                        }}
                      >
                        {loggingOut ? 'Saving…' : 'Log out'}
                      </button>
                    </>
                  ) : (
                    <>
                      <p>You're playing as a guest. Your fish live only in this browser.</p>
                      <button type="button" className="shop-buy" onClick={() => setView('login')}>
                        Save progress ☁️
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="settings-section">
                <h3>Game</h3>
                <ResetGame />
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
