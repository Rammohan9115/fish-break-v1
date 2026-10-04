// Settings panel: cloud account (Save progress ☁️ / logged-in email + Log out) and Reset game.
import { useState } from 'react';
import { AUTH_GOOGLE_ENABLED } from '../game/constants';
import { createInitialState } from '../game/sim';
import { logOut, sendMagicLink, signInWithGoogle, useCloudStore } from '../store/cloudSave';
import { useGameStore } from '../store/gameStore';
import { saveGame } from '../store/save';
import { SyncBadge } from './SyncIndicator';
import { breedingUnlocked } from '../game/breeding';
import { sound } from '../audio/sound';
import { fullscreenSupported, toggleFullscreen } from './fullscreen';
import { Button, ConfirmDialog, Sheet, Switch } from './kit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GoogleLogo() {
  return (
    <svg className="login-google-logo" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function LoginForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'redirecting'>('idle');
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

  const google = async () => {
    setError(null);
    setState('redirecting');
    const result = await signInWithGoogle();
    // On success the browser navigates away to Google; only failures land back here.
    if (!result.ok) {
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
        <Button onClick={onBack}>Back</Button>
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
      <p>Keep your fish safe and play on any device.</p>
      {AUTH_GOOGLE_ENABLED && (
        <>
          <Button block busy={state !== 'idle'} onClick={() => void google()}>
            <GoogleLogo />
            {state === 'redirecting' ? 'Opening Google…' : 'Continue with Google'}
          </Button>
          <div className="login-or" aria-hidden="true">
            or get a magic link by email
          </div>
        </>
      )}
      <input
        className="login-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Email address"
        autoFocus={!AUTH_GOOGLE_ENABLED}
      />
      {error && <p className="login-error">{error}</p>}
      <Button type="submit" variant="primary" block busy={state !== 'idle'}>
        {state === 'sending' ? 'Sending…' : 'Send magic link ✨'}
      </Button>
      <Button variant="ghost" onClick={onBack}>
        Maybe later
      </Button>
      <a className="login-privacy" href="/privacy.html" target="_blank" rel="noopener">
        Privacy policy
      </a>
    </form>
  );
}

/** Sound, motion and fullscreen. On phones these are the only place for sound and fullscreen. */
function Preferences() {
  const muted = useGameStore((s) => s.game.settings.muted);
  const reduced = useGameStore((s) => s.game.settings.reducedMotion);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const setReducedMotion = useGameStore((s) => s.setReducedMotion);
  return (
    <section className="settings-section settings-prefs">
      <h3 className="section-title">Preferences</h3>
      <Switch
        checked={!muted}
        hint="Off by default, for playing at work"
        onChange={(on) => {
          toggleMute();
          if (on) sound.play('coin');
        }}
      >
        🔊 Sound
      </Switch>
      <Switch checked={reduced} hint="Fewer bubbles and effects, gentler animations" onChange={setReducedMotion}>
        🌙 Reduce motion
      </Switch>
      {fullscreenSupported() && (
        <Button size="sm" onClick={toggleFullscreen}>
          ⤢ Toggle fullscreen
        </Button>
      )}
    </section>
  );
}

/** Help that's reachable from anywhere: replay the first tips, open the breeding guide. */
function Help() {
  const replayTips = useGameStore((s) => s.replayTips);
  const openGuide = useGameStore((s) => s.openGuide);
  const canBreed = useGameStore((s) => breedingUnlocked(s.game));
  const openPanel = useGameStore((s) => s.openPanel);
  return (
    <section className="settings-section">
      <h3 className="section-title">Help</h3>
      <div className="settings-row">
        <Button size="sm" onClick={replayTips}>
          💡 Replay the tips
        </Button>
        {canBreed && (
          <Button
            size="sm"
            onClick={() => {
              openPanel(null);
              openGuide();
            }}
          >
            📖 How breeding works
          </Button>
        )}
      </div>
    </section>
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
  return (
    <>
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Reset game…
      </Button>
      {confirming && (
        <ConfirmDialog
          title="Start over?"
          body={<p>You'll get a brand-new tank. All your fish, shells and levels will be gone for good.</p>}
          confirmLabel="Yes, reset"
          cancelLabel="Keep playing"
          tone="danger"
          onCancel={() => setConfirming(false)}
          onConfirm={reset}
        />
      )}
    </>
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
    <Sheet title={view === 'login' ? 'Cloud save' : 'Settings'} size="sm" onClose={close} className="settings">
      {view === 'login' && !user ? (
        <LoginForm onBack={() => setView('main')} />
      ) : (
        <>
          {enabled && (
            <section className="settings-section">
              <h3 className="section-title">Account</h3>
              {user ? (
                <>
                  <p className="lead">
                    Signed in as <strong>{user.email ?? 'your account'}</strong>
                  </p>
                  <SyncBadge />
                  <Button
                    busy={loggingOut}
                    onClick={() => {
                      setLoggingOut(true);
                      void logOut().finally(() => {
                        setLoggingOut(false);
                        openPanel(null);
                      });
                    }}
                  >
                    {loggingOut ? 'Saving…' : 'Log out'}
                  </Button>
                </>
              ) : (
                <>
                  <p className="lead">You're playing as a guest. Your fish live only in this browser.</p>
                  <Button variant="primary" block onClick={() => setView('login')}>
                    Save progress ☁️
                  </Button>
                </>
              )}
            </section>
          )}
          <Preferences />
          <Help />
          <section className="settings-section">
            <h3 className="section-title">Game</h3>
            <ResetGame />
          </section>
        </>
      )}
    </Sheet>
  );
}
