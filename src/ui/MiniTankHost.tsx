// Mini Tank UI: the 🪟 button (Tools tray and Settings), the "P" shortcut, and the slim controls that appear over the floating tank.
// The controls are a React portal into the floating window's document, so they share the game's store and styles.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { subscribeSimEvents, useGameStore } from '../store/gameStore';
import { closeMini, miniSupport, openInGame, syncMiniTokens, toggleMini, useMiniTank, VIEW_ONLY_TIP } from '../mini/miniTank';
import { formatCount } from './format';

/** The 🪟 Mini Tank button. Renders nothing where neither floating-window API exists. */
export function MiniTankButton({ className = 'btn btn-sm', onToggle }: { className?: string; onToggle?: () => void }) {
  const support = useMemo(miniSupport, []);
  const floating = useMiniTank((s) => s.kind !== null);
  if (!support) return null;
  return (
    <button
      type="button"
      className={className}
      aria-pressed={floating}
      title={support === 'video' ? VIEW_ONLY_TIP : 'Float the tank over your other apps (P)'}
      onClick={() => {
        toggleMini();
        onToggle?.();
      }}
    >
      🪟 Mini Tank
    </button>
  );
}

/** Mounted once in the app: the P shortcut, token sync, and the portal into the floating window. */
export function MiniTankHost() {
  const host = useMiniTank((s) => s.host);
  const display = useGameStore((s) => s.game.settings.display);
  const reduced = useGameStore((s) => s.game.settings.reducedMotion);

  useEffect(() => {
    if (!miniSupport()) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'p' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      if (useGameStore.getState().breakSession) return;
      e.preventDefault();
      toggleMini();
    };
    window.addEventListener('keydown', onKey);
    // Refreshing or leaving the page takes the floating window with it.
    window.addEventListener('pagehide', closeMini);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', closeMini);
    };
  }, []);

  useEffect(() => syncMiniTokens(), [display, reduced, host]);

  return host ? createPortal(<MiniOverlay win={host.ownerDocument.defaultView ?? window} />, host) : null;
}

interface Chip {
  id: number;
  text: string;
}

/** Tiny, short-lived notices: shells collected and eggs hatched (nothing else is shown in the floating window). */
function useChips(win: Window): Chip[] {
  const [chips, setChips] = useState<Chip[]>([]);
  useEffect(() => {
    let next = 0;
    const add = (text: string) => {
      const id = next++;
      setChips((c) => [...c.slice(-2), { id, text }]);
      win.setTimeout(() => setChips((c) => c.filter((x) => x.id !== id)), 1600);
    };
    const offStore = useGameStore.subscribe((s, prev) => {
      const gained = s.game.shells - prev.game.shells;
      if (gained > 0) add(`+${formatCount(gained)} 🐚`);
    });
    const offSim = subscribeSimEvents((events) => {
      if (events.some((e) => e.type === 'hatched')) add('🐣 Hatched!');
    });
    return () => {
      offStore();
      offSim();
    };
  }, [win]);
  return chips;
}

function MiniOverlay({ win }: { win: Window }) {
  const shells = useGameStore((s) => s.game.shells);
  const feeding = useGameStore((s) => s.mode === 'feed');
  const muted = useGameStore((s) => s.game.settings.muted);
  const setMode = useGameStore((s) => s.setMode);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const hint = useMiniTank((s) => s.hint);
  const chips = useChips(win);
  return (
    <>
      <div className="mini-bar" role="toolbar" aria-label="Mini tank controls">
        <span className="mini-shells" aria-label={`${shells} shells`}>
          <span className="mini-shell-icon" aria-hidden="true">
            🐚
          </span>
          <span className="tabular">{formatCount(shells)}</span>
        </span>
        <button type="button" className={`mini-ctl mini-feed${feeding ? ' mini-on' : ''}`} aria-pressed={feeding} onClick={() => setMode(feeding ? 'look' : 'feed')}>
          🍤 Feed
        </button>
        <button type="button" className="mini-ctl" aria-pressed={!muted} aria-label={muted ? 'Sound off' : 'Sound on'} onClick={toggleMute}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button type="button" className="mini-ctl mini-back" onClick={closeMini}>
          ↩ Back to game
        </button>
      </div>
      {hint && (
        <button type="button" className="mini-hint" onClick={openInGame}>
          {hint.text}
        </button>
      )}
      <div className="mini-chips" aria-live="polite">
        {chips.map((c) => (
          <span key={c.id} className="mini-chip">
            {c.text}
          </span>
        ))}
      </div>
    </>
  );
}
