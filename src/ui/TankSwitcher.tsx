// Tanks panel: every tank at a glance, switch between them, rename, and buy the next tank.
import { useState } from 'react';
import { CAPACITY_UPGRADE, MAX_DECOR_PER_TANK, TANK_NAME_MAX_LENGTH, THEMES } from '../game/constants';
import { checkBuyTank, nextTankPurchase } from '../game/economy';
import { tankOccupancy } from '../game/sim';
import type { GameState, Tank } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { PriceTag } from './Shop';

function TankName({ tank }: { tank: Tank }) {
  const renameTank = useGameStore((s) => s.renameTank);
  const [draft, setDraft] = useState(tank.name);
  return (
    <input
      className="fishcard-name tankcard-name"
      value={draft}
      maxLength={TANK_NAME_MAX_LENGTH}
      aria-label="Tank name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (draft.trim() ? renameTank(tank.id, draft) : setDraft(tank.name))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

function TankCard({ tank, game }: { tank: Tank; game: GameState }) {
  const switchTank = useGameStore((s) => s.switchTank);
  const openPanel = useGameStore((s) => s.openPanel);
  const active = tank.id === game.activeTankId;
  const eggs = game.eggs.filter((e) => e.tankId === tank.id).length;
  const drops = tank.shells.length;

  return (
    <li className={`tankcard${active ? ' tankcard-active' : ''}`}>
      <span className={`shop-swatch theme-${tank.theme}`} aria-hidden="true" />
      <div className="tankcard-info">
        <TankName key={tank.id} tank={tank} />
        <div className="fishcard-sub">
          {THEMES[tank.theme].name} · 🐟 {tankOccupancy(game, tank.id)}/{tank.capacity}
          {eggs > 0 ? ` · 🥚 ${eggs}` : ''} · {tank.upgrades}/{CAPACITY_UPGRADE.maxPurchases} upgrades
        </div>
        <div className="fishcard-sub">
          🪴 {tank.decor.length}/{MAX_DECOR_PER_TANK} decor · 🧽 {Math.round(tank.cleanliness)}% clean
          {drops > 0 && ` · 🐚 ${drops} to collect`}
        </div>
      </div>
      {active ? (
        <span className="shop-here">Viewing</span>
      ) : (
        <button
          type="button"
          className="shop-buy tankcard-go"
          onClick={() => {
            switchTank(tank.id);
            openPanel(null);
          }}
        >
          Go
        </button>
      )}
    </li>
  );
}

export function TankSwitcher() {
  const panel = useGameStore((s) => s.panel);
  const game = useGameStore((s) => s.game);
  const openPanel = useGameStore((s) => s.openPanel);
  const buyTank = useGameStore((s) => s.buyTank);
  if (panel !== 'tanks') return null;

  const next = nextTankPurchase(game);
  const error = checkBuyTank(game);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && openPanel(null)}>
      <section className="shop tankswitcher" role="dialog" aria-modal="true" aria-label="Your tanks">
        <header className="shop-head">
          <h2>Your tanks</h2>
          <button type="button" className="fishcard-close" onClick={() => openPanel(null)} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="shop-body">
          <ul className="tankcards">
            {game.tanks.map((t) => (
              <TankCard key={t.id} tank={t} game={game} />
            ))}
          </ul>
          {next && (
            <div className="tankswitcher-buy">
              <span>
                {game.tanks.length === 1 ? 'Second' : 'Third'} tank <PriceTag price={next.price} />
              </span>
              {error === 'locked' ? (
                <span className="shop-lock">🔒 Unlocks at Lv {next.unlockLevel}</span>
              ) : (
                <button type="button" className="shop-buy tankcard-go" disabled={error !== null} onClick={() => buyTank() && openPanel(null)}>
                  {error === 'cost' ? 'Need more shells' : 'Buy'}
                </button>
              )}
            </div>
          )}
          <button type="button" className="shop-small tankswitcher-shop" onClick={() => openPanel('shop', 'tanks')}>
            🛒 Capacity upgrades &amp; themes
          </button>
        </div>
      </section>
    </div>
  );
}
