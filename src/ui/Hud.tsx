// Top HUD: level badge + XP bar, shells, pearls, mute toggle.
import { xpToNext } from '../game/levels';
import { useGameStore } from '../store/gameStore';

export function Hud() {
  const level = useGameStore((s) => s.game.level);
  const xp = useGameStore((s) => s.game.xp);
  const shells = useGameStore((s) => s.game.shells);
  const pearls = useGameStore((s) => s.game.pearls);
  const muted = useGameStore((s) => s.game.settings.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const tankCount = useGameStore((s) => s.game.tanks.length);
  const tankName = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId)?.name ?? '');
  const openPanel = useGameStore((s) => s.openPanel);

  const needed = xpToNext(level);
  const pct = Math.min(100, (xp / needed) * 100);

  return (
    <header className="hud" aria-label="Game status">
      <div className="hud-group">
        <div className="hud-level" title={`Level ${level}`}>
          <span className="hud-level-badge">Lv {level}</span>
          <div className="hud-xp" role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuemax={needed} aria-valuenow={Math.floor(xp)}>
            <div className="hud-xp-fill" style={{ width: `${pct}%` }} />
            <span className="hud-xp-text">
              {Math.floor(xp)} / {needed} XP
            </span>
          </div>
        </div>
      </div>
      <div className="hud-group">
        {tankCount > 1 && (
          <button type="button" className="hud-pill hud-button" onClick={() => openPanel('tanks')} aria-label={`Viewing ${tankName}. Switch tanks`}>
            🏠 {tankName}
          </button>
        )}
        <span className="hud-pill" title="Shells">
          🐚 <strong>{shells.toLocaleString()}</strong>
        </span>
        <span className="hud-pill" title="Pearls">
          <span className="hud-pearl" aria-hidden="true" /> <strong>{pearls.toLocaleString()}</strong>
        </span>
        <button type="button" className="hud-pill hud-button" onClick={toggleMute} aria-label={muted ? 'Unmute sound' : 'Mute sound'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </header>
  );
}
