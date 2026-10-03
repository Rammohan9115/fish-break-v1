// Top HUD in the classic aquarium-game style, floating over the water:
// coin + pearl bars (left), XP bar with a star level badge (center), tank name tag (right),
// and round icon buttons (mute, fullscreen, settings) plus the cloud-sync badge under the coins.
import { useEffect, useState } from 'react';
import { sound } from '../audio/sound';
import { xpToNext } from '../game/levels';
import { useGameStore } from '../store/gameStore';
import { fullscreenSupported, toggleFullscreen } from './fullscreen';
import { SyncBadge } from './SyncIndicator';

export function Hud() {
  const level = useGameStore((s) => s.game.level);
  const xp = useGameStore((s) => s.game.xp);
  const shells = useGameStore((s) => s.game.shells);
  const pearls = useGameStore((s) => s.game.pearls);
  const muted = useGameStore((s) => s.game.settings.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const tankName = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId)?.name ?? '');
  const tankCount = useGameStore((s) => s.game.tanks.length);
  const openPanel = useGameStore((s) => s.openPanel);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const needed = xpToNext(level);
  const pct = Math.min(100, (xp / needed) * 100);

  return (
    <header className="hud" aria-label="Game status">
      <div className="hud-left">
        <div className="hud-bar hud-coins" title="Shells">
          <span className="hud-bar-icon" aria-hidden="true">
            🐚
          </span>
          <strong>{shells.toLocaleString()}</strong>
        </div>
        <div className="hud-bar hud-pearls" title="Pearls">
          <span className="hud-pearl" aria-hidden="true" />
          <strong>{pearls.toLocaleString()}</strong>
        </div>
        <div className="hud-icons">
          <button
            type="button"
            className="hud-round"
            onClick={() => {
              toggleMute();
              if (muted) sound.play('coin');
            }}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          {fullscreenSupported() && (
            <button type="button" className="hud-round" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Go fullscreen'}>
              {isFullscreen ? '⤡' : '⤢'}
            </button>
          )}
          <button type="button" className="hud-round" onClick={() => openPanel('settings')} aria-label="Settings">
            ⚙️
          </button>
          <SyncBadge compact />
        </div>
      </div>

      <div className="hud-xpwrap" title={`Level ${level}`}>
        <div className="hud-xpbar" role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuemax={needed} aria-valuenow={Math.floor(xp)}>
          <div className="hud-xpfill" style={{ width: `${pct}%` }} />
          <span className="hud-xptext">
            {Math.floor(xp).toLocaleString()} / {needed.toLocaleString()}
          </span>
        </div>
        <div className="hud-star" aria-label={`Level ${level}`}>
          <span>{level}</span>
        </div>
      </div>

      <button type="button" className="hud-tank" onClick={() => openPanel('tanks')} aria-label={`${tankName}. Open tanks`}>
        <span className="hud-tank-name">{tankName}</span>
        <span className="hud-tank-icon" aria-hidden="true">
          🐠{tankCount > 1 && <small>{tankCount}</small>}
        </span>
      </button>
    </header>
  );
}
