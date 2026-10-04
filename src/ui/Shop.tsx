// Shop with Fish / Food / Decor / Tanks tabs. Locked items show 🔒 "Unlocks at Lv X"; items you can't
// afford say how far away you are; every blocked Buy explains why on tap.
import { useState, type ReactNode } from 'react';
import { CAPACITY_UPGRADE, DECOR, DECOR_LIST, MAX_DECOR_PER_TANK, PREMIUM_FOOD_PACK, THEMES, UNLOCK_LEVEL } from '../game/constants';
import * as economy from '../game/economy';
import { tankOccupancy } from '../game/sim';
import { SPECIES_LIST } from '../game/species';
import type { GameState, Price, ThemeId } from '../game/types';
import { sound } from '../audio/sound';
import { useGameStore, type ShopTab } from '../store/gameStore';
import { formatCount, formatMinutes } from './format';
import { DecorPreview, FishPreview } from './Preview';
import { RichText } from './Icon';
import { Button, ConfirmDialog, CurrencyTag, EmptyState, LockedOverlay, Sheet, Tabs, type TabItem } from './kit';

const TABS: TabItem<ShopTab>[] = [
  { id: 'fish', label: '🐟 Fish' },
  { id: 'food', label: '🍤 Food' },
  { id: 'decor', label: '🪴 Decor' },
  { id: 'tanks', label: '🏠 Tanks' },
];

/** A price tag (kept as a named export for the other panels). */
export function PriceTag({ price, short = false }: { price: Price; short?: boolean }) {
  return <CurrencyTag currency={price.currency} amount={price.amount} short={short} />;
}

/** How many more shells/pearls the player needs for `price` (0 when affordable). */
function shortfall(game: GameState, price: Price | null): number {
  if (!price) return 0;
  return Math.max(0, price.amount - (price.currency === 'shells' ? game.shells : game.pearls));
}

/** Button text + tap explanation for a blocked purchase. */
function blocked(error: economy.PurchaseError, price: Price | null, game: GameState): { label: string; reason: string } {
  switch (error) {
    case 'cost': {
      const need = shortfall(game, price);
      const unit = price?.currency === 'pearls' ? '⚪' : '🐚';
      return { label: `Need ${formatCount(need)} more ${unit}`, reason: 'Collect shells from the sand, or wait for the daily gift 🎁' };
    }
    case 'full':
      return { label: 'Tank is full', reason: 'Make room, or get a bigger tank in Tanks 🏠' };
    case 'max':
      return { label: 'Maxed out', reason: 'You already have the most you can get' };
    case 'owned':
      return { label: 'Owned', reason: 'Already yours' };
    default:
      return { label: 'Unavailable', reason: 'Not available right now' };
  }
}

interface ItemProps {
  title: string;
  art: ReactNode;
  price: Price | null;
  unlockLevel: number;
  error: economy.PurchaseError | null;
  game: GameState;
  /** Overrides the blocked label/reason (e.g. theme-only species). */
  blockedOverride?: { label: string; reason: string };
  buyLabel?: string;
  note?: ReactNode;
  /** Returns true on success (plays the coin sound). */
  onBuy: () => boolean | void;
}

function ShopItem({ title, art, price, unlockLevel, error, game, blockedOverride, buyLabel = 'Buy', note, onBuy }: ItemProps) {
  const locked = error === 'locked';
  const block = error && !locked ? (blockedOverride ?? blocked(error, price, game)) : null;
  return (
    <div className={`tile shop-item${locked ? ' shop-item-locked' : ''}`}>
      <div className="shop-art">{locked ? <LockedOverlay level={unlockLevel}>{art}</LockedOverlay> : art}</div>
      <div className="shop-title">{title}</div>
      {note && <div className="shop-note">{note}</div>}
      {price && <PriceTag price={price} short={error === 'cost'} />}
      {!locked && (
        <Button variant="primary" size="sm" block disabledReason={block?.reason} onClick={() => onBuy() && sound.play('coin')}>
          {block ? block.label : buyLabel}
        </Button>
      )}
    </div>
  );
}

function FishTab({ game }: { game: GameState }) {
  const buyFish = useGameStore((s) => s.buyFish);
  const tank = game.tanks.find((t) => t.id === game.activeTankId)!;
  return (
    <>
      <p className="lead">
        Buying for <strong>{tank.name}</strong> · 🐟 {tankOccupancy(game, tank.id)}/{tank.capacity}
      </p>
      <div className="shop-grid">
        {SPECIES_LIST.map((s) => {
          const error = economy.checkBuyFish(game, s.id);
          const theme = s.themeOnly ? THEMES[s.themeOnly].name : null;
          return (
            <ShopItem
              key={s.id}
              title={s.name}
              art={<FishPreview speciesId={s.id} />}
              price={s.cost}
              unlockLevel={s.unlockLevel}
              error={error}
              game={game}
              blockedOverride={error === 'theme' && theme ? { label: `Needs ${theme}`, reason: `Lives only in a ${theme} tank` } : undefined}
              note={<RichText text={`Grows in ${formatMinutes(s.growMinutes)} · drops ${s.dropValue} 🐚`} />}
              onBuy={() => buyFish(s.id)}
            />
          );
        })}
      </div>
    </>
  );
}

function FoodTab({ game }: { game: GameState }) {
  const buyPremiumFood = useGameStore((s) => s.buyPremiumFood);
  return (
    <>
      <p className="lead">
        You have <strong>{game.inventory.premiumFood}</strong> premium food. Premium pellets fill +25 hunger and give a 3-minute 2× growth boost.
      </p>
      <div className="shop-grid">
        <ShopItem
          title={`Premium food ×${PREMIUM_FOOD_PACK.count}`}
          art={<span className="shop-emoji">🌟</span>}
          price={PREMIUM_FOOD_PACK.price}
          unlockLevel={UNLOCK_LEVEL.premiumFood}
          error={economy.checkBuyPremiumFood(game)}
          game={game}
          onBuy={buyPremiumFood}
        />
      </div>
    </>
  );
}

function PlacedDecor({ game }: { game: GameState }) {
  const sellDecor = useGameStore((s) => s.sellDecor);
  const tank = game.tanks.find((t) => t.id === game.activeTankId)!;
  const [selling, setSelling] = useState<string | null>(null);
  const placed = tank.decor.find((d) => d.id === selling);
  if (tank.decor.length === 0) {
    return <EmptyState icon="🪴" title="No decor yet" body="Pick something above. Each piece makes your fish a little happier." />;
  }
  return (
    <>
      <ul className="shop-list">
        {tank.decor.map((d) => (
          <li key={d.id} className="tile">
            <span>{DECOR[d.decorId].name}</span>
            <Button size="sm" onClick={() => setSelling(d.id)}>
              Sell back <PriceTag price={economy.decorRefund(d.decorId)} />
            </Button>
          </li>
        ))}
      </ul>
      {placed && (
        <ConfirmDialog
          title={`Sell ${DECOR[placed.decorId].name}?`}
          body={
            <p>
              You'll get back <PriceTag price={economy.decorRefund(placed.decorId)} /> (half its price).
            </p>
          }
          confirmLabel="Sell back"
          cancelLabel="Keep it"
          tone="danger"
          onCancel={() => setSelling(null)}
          onConfirm={() => {
            sellDecor(tank.id, placed.id);
            setSelling(null);
          }}
        />
      )}
    </>
  );
}

function DecorTab({ game }: { game: GameState }) {
  const buyDecor = useGameStore((s) => s.buyDecor);
  const tank = game.tanks.find((t) => t.id === game.activeTankId)!;
  return (
    <>
      <p className="lead">
        Each item makes fish a little happier. {tank.decor.length}/{MAX_DECOR_PER_TANK} in {tank.name}.
      </p>
      <div className="shop-grid">
        {DECOR_LIST.map((d) => {
          const error = economy.checkBuyDecor(game, d.id);
          return (
            <ShopItem
              key={d.id}
              title={d.name}
              art={<DecorPreview decorId={d.id} />}
              price={d.cost}
              unlockLevel={Math.max(UNLOCK_LEVEL.decorShop, d.unlockLevel)}
              error={error}
              game={game}
              blockedOverride={error === 'full' ? { label: 'Tank is full', reason: `Up to ${MAX_DECOR_PER_TANK} decor per tank. Sell one back to make space.` } : undefined}
              onBuy={() => buyDecor(d.id)}
            />
          );
        })}
      </div>
      <h3 className="section-title">In this tank</h3>
      <PlacedDecor game={game} />
    </>
  );
}

function TanksTab({ game }: { game: GameState }) {
  const store = useGameStore();
  const tank = game.tanks.find((t) => t.id === game.activeTankId)!;
  const upgradeCost = economy.capacityUpgradeCost(tank);
  const nextTank = economy.nextTankPurchase(game);
  const themeIds = Object.keys(THEMES) as ThemeId[];

  return (
    <>
      <div className="shop-grid">
        <ShopItem
          title={`Bigger tank (+${CAPACITY_UPGRADE.slots})`}
          art={<span className="shop-emoji">📐</span>}
          price={upgradeCost}
          unlockLevel={UNLOCK_LEVEL.capacityUpgrade}
          error={economy.checkCapacityUpgrade(game)}
          game={game}
          note={`${tank.name}: 🐟 ${tankOccupancy(game, tank.id)}/${tank.capacity} · ${economy.capacityUpgradesBought(tank)}/${CAPACITY_UPGRADE.maxPurchases} upgrades`}
          onBuy={store.buyCapacityUpgrade}
        />
        <ShopItem
          title={nextTank ? (game.tanks.length === 1 ? 'Second tank' : 'Third tank') : 'All tanks owned'}
          art={<span className="shop-emoji">🏠</span>}
          price={nextTank?.price ?? null}
          unlockLevel={nextTank?.unlockLevel ?? 0}
          error={economy.checkBuyTank(game)}
          game={game}
          onBuy={store.buyTank}
        />
        {themeIds.map((id) => {
          const theme = THEMES[id];
          const owned = game.ownedThemes.includes(id);
          const inUse = tank.theme === id;
          return (
            <ShopItem
              key={id}
              title={`${theme.name} theme`}
              art={<span className={`shop-swatch theme-${id}`} />}
              price={owned ? null : theme.price}
              unlockLevel={theme.unlockLevel}
              error={owned ? (inUse ? 'owned' : null) : economy.checkBuyTheme(game, id)}
              game={game}
              blockedOverride={inUse ? { label: 'In use', reason: `${tank.name} already uses this theme` } : undefined}
              buyLabel={owned ? 'Use here' : 'Buy'}
              onBuy={() => (owned ? store.applyTheme(id) : store.buyTheme(id))}
            />
          );
        })}
      </div>
      <div className="shop-more">
        <Button size="sm" onClick={() => store.openPanel('tanks')}>
          🏠 Switch &amp; rename tanks
        </Button>
      </div>
    </>
  );
}

export function Shop() {
  const panel = useGameStore((s) => s.panel);
  const tab = useGameStore((s) => s.shopTab);
  const game = useGameStore((s) => s.game);
  const openPanel = useGameStore((s) => s.openPanel);
  if (panel !== 'shop') return null;

  return (
    <Sheet
      title="Shop"
      size="lg"
      onClose={() => openPanel(null)}
      scrollKey={tab}
      className="shop"
      headerExtra={
        <span className="shop-wallet" aria-label="Your wallet">
          <CurrencyTag currency="shells" amount={game.shells} />
          <CurrencyTag currency="pearls" amount={game.pearls} />
        </span>
      }
    >
      <Tabs items={TABS} value={tab} onChange={(t) => openPanel('shop', t)} ariaLabel="Shop sections" />
      {tab === 'fish' && <FishTab game={game} />}
      {tab === 'food' && <FoodTab game={game} />}
      {tab === 'decor' && <DecorTab game={game} />}
      {tab === 'tanks' && <TanksTab game={game} />}
    </Sheet>
  );
}
