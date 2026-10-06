// Tanks panel: every tank at a glance, switch between them, rename, and buy the next tank.
import { CAPACITY_UPGRADE, COLLECTIONS, TANK_NAME_MAX_LENGTH, THEMES } from '../game/constants';
import { activeSets, maxDecor } from '../game/decor';
import { checkBuyTank, nextTankPurchase } from '../game/economy';
import { displayOccupancy, tankOccupancy } from '../game/sim';
import type { GameState, Tank } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { formatCount } from './format';
import { Badge, Button, LockedOverlay, NameField, Sheet } from './kit';
import { PriceTag } from './Shop';

function TankCard({ tank, game }: { tank: Tank; game: GameState }) {
  const switchTank = useGameStore((s) => s.switchTank);
  const renameTank = useGameStore((s) => s.renameTank);
  const openPanel = useGameStore((s) => s.openPanel);
  const active = tank.id === game.activeTankId;
  const eggs = game.eggs.filter((e) => e.tankId === tank.id).length;
  const drops = tank.shells.length;

  return (
    <li className={`tile tankcard${active ? ' tankcard-active' : ''}`}>
      <span className={`shop-swatch theme-${tank.theme}`} aria-hidden="true" />
      <div className="tankcard-info">
        <NameField key={tank.id} value={tank.name} maxLength={TANK_NAME_MAX_LENGTH} label="Tank name" size="md" onSave={(name) => renameTank(tank.id, name)} />
        <div className="meta">
          {THEMES[tank.theme].name} · 🐟 {displayOccupancy(tankOccupancy(game, tank.id))}/{tank.capacity}
          {eggs > 0 ? ` · 🥚 ${eggs}` : ''} · {tank.upgrades}/{CAPACITY_UPGRADE.maxPurchases} upgrades
        </div>
        <div className="meta">
          🪸 {tank.decor.length}/{maxDecor(tank)} decor · 🧽 {Math.round(tank.cleanliness)}% clean
          {drops > 0 && ` · 🐚 ${formatCount(drops)} to collect`}
        </div>
        {activeSets(tank).length > 0 && (
          <div className="meta">
            ✨ Set bonus: {activeSets(tank).map((c) => `${COLLECTIONS[c].icon} ${COLLECTIONS[c].name}`).join(' · ')}
          </div>
        )}
      </div>
      {active ? (
        <Badge tone="brand">Viewing</Badge>
      ) : (
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            switchTank(tank.id);
            openPanel(null);
          }}
        >
          Go
        </Button>
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
  const need = next && error === 'cost' ? next.price.amount - (next.price.currency === 'shells' ? game.shells : game.pearls) : 0;

  return (
    <Sheet title="Your tanks" onClose={() => openPanel(null)}>
      <ul className="tankcards">
        {game.tanks.map((t) => (
          <TankCard key={t.id} tank={t} game={game} />
        ))}
      </ul>
      {next && (
        <div className="tankswitcher-buy">
          <span>
            {game.tanks.length === 1 ? 'Second' : 'Third'} tank <PriceTag price={next.price} short={error === 'cost'} />
          </span>
          {error === 'locked' ? (
            <LockedOverlay level={next.unlockLevel} />
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabledReason={error === 'cost' ? 'Collect shells from the sand, or wait for the daily gift 🎁' : error ? 'Not available right now' : null}
              onClick={() => buyTank() && openPanel(null)}
            >
              {error === 'cost' ? `Need ${formatCount(need)} more 🐚` : 'Buy'}
            </Button>
          )}
        </div>
      )}
      <div className="shop-more">
        <Button size="sm" onClick={() => openPanel('shop', 'tanks')}>
          🛒 Capacity upgrades &amp; themes
        </Button>
      </div>
    </Sheet>
  );
}
