// Top HUD in the classic aquarium-game style, floating over the water:
// coin + pearl bars (left), XP bar with a star level badge (center), tank name tag (right),
// and round icon buttons (mute, fullscreen, settings) plus the cloud-sync badge under the coins.
import { useEffect, useState } from 'react';
import { sound } from '../audio/sound';
import { CAPACITY_WARN_FRACTION, UNLOCK_LEVEL } from '../game/constants';
import { capacityUpgradeCost } from '../game/economy';
import { xpToNext } from '../game/levels';
import { tankOccupancy } from '../game/sim';
import { useGameStore } from '../store/gameStore';
import { fullscreenSupported, toggleFullscreen } from './fullscreen';
import { SyncBadge } from './SyncIndicator';
import { Icon } from './Icon';

/** Window event fired when a collected shell/pearl lands on its counter (detail: 'shell' | 'pearl'). */
export const HUD_BUMP_EVENT = 'fishbowl-hud-bump';

/** Bumps a counter briefly whenever a collected icon arrives at it. */
function useBump(kind: 'shell' | 'pearl'): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    const onBump = (e: Event) => {
      if ((e as CustomEvent<string>).detail === kind) setN((v) => v + 1);
    };
    window.addEventListener(HUD_BUMP_EVENT, onBump);
    return () => window.removeEventListener(HUD_BUMP_EVENT, onBump);
  }, [kind]);
  // Alternate two identical animations so every arrival restarts it.
  return n === 0 ? '' : n % 2 ? ' hud-bump-a' : ' hud-bump-b';
}

export function Hud() {
  const level = useGameStore((s) => s.game.level);
  const xp = useGameStore((s) => s.game.xp);
  const shells = useGameStore((s) => s.game.shells);
  const pearls = useGameStore((s) => s.game.pearls);
  const muted = useGameStore((s) => s.game.settings.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const tankName = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId)?.name ?? '');
  const tankCount = useGameStore((s) => s.game.tanks.length);
  const capUsed = useGameStore((s) => tankOccupancy(s.game, s.game.activeTankId));
  const capMax = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId)?.capacity ?? 0);
  const canUpgrade = useGameStore((s) => {
    const tank = s.game.tanks.find((t) => t.id === s.game.activeTankId);
    return !!tank && s.game.level >= UNLOCK_LEVEL.capacityUpgrade && capacityUpgradeCost(tank) !== null;
  });
  const capacity = capMax > 0 ? { used: capUsed, max: capMax, crowded: capUsed >= capMax * CAPACITY_WARN_FRACTION, canUpgrade } : null;
  const openPanel = useGameStore((s) => s.openPanel);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const shellBump = useBump('shell');
  const pearlBump = useBump('pearl');

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
        <div className={`hud-bar hud-coins${shellBump}`} title="Shells">
          <Icon id="shell" className="hud-bar-icon" />
          <strong>{shells.toLocaleString()}</strong>
        </div>
        <div className={`hud-bar hud-pearls${pearlBump}`} title="Pearls">
          <Icon id="pearl" className="hud-pearl-icon" />
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

      <div className="hud-right">
      <button type="button" className="hud-tank" onClick={() => openPanel('tanks')} aria-label={`${tankName}. Open tanks`}>
        <span className="hud-tank-name">{tankName}</span>
        {capacity && (
          <span className={`hud-cap${capacity.used >= capacity.max ? ' hud-cap-full' : ''}`} aria-label={`${capacity.used} of ${capacity.max} spots`}>
            🐟 {capacity.used}/{capacity.max}
          </span>
        )}
        <span className="hud-tank-icon" aria-hidden="true">
          🐠{tankCount > 1 && <small>{tankCount}</small>}
        </span>
      </button>
      {capacity?.crowded && capacity.canUpgrade && (
        <button type="button" className="hud-upgrade" onClick={() => openPanel('shop', 'tanks')}>
          ⬆️ Upgrade
        </button>
      )}
      </div>
    </header>
  );
}
