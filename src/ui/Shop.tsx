// Shop overlay with Fish / Food / Decor / Tanks tabs. Locked items are greyed with "Unlocks at Lv X".
import type { ReactNode } from 'react';
import { CAPACITY_UPGRADE, DECOR, DECOR_LIST, MAX_DECOR_PER_TANK, PREMIUM_FOOD_PACK, THEMES, UNLOCK_LEVEL } from '../game/constants';
import * as economy from '../game/economy';
import { tankOccupancy } from '../game/sim';
import { SPECIES_LIST } from '../game/species';
import type { GameState, Price, ThemeId } from '../game/types';
import { sound } from '../audio/sound';
import { useGameStore, type ShopTab } from '../store/gameStore';
import { DecorPreview, FishPreview } from './Preview';
import { Icon, RichText } from './Icon';

const TABS: { id: ShopTab; label: string }[] = [
  { id: 'fish', label: '🐟 Fish' },
  { id: 'food', label: '🍤 Food' },
  { id: 'decor', label: '🪴 Decor' },
  { id: 'tanks', label: '🏠 Tanks' },
];

export function PriceTag({ price }: { price: Price }) {
  return (
    <span className="price">
      {price.currency === 'shells' ? <Icon id="shell" className="icon-inline" label="shells" /> : <Icon id="pearl" className="icon-inline" label="pearls" />}{' '}
      {price.amount.toLocaleString()}
    </span>
  );
}

interface ItemProps {
  title: string;
  art: ReactNode;
  price: Price | null;
  unlockLevel: number;
  error: economy.PurchaseError | null;
  /** Text shown on the button when buying is blocked for a non-lock reason. */
  blockedText?: string;
  buyLabel?: string;
  note?: ReactNode;
  /** Returns true on success (plays the coin sound). */
  onBuy: () => boolean | void;
}

function blockedLabel(error: economy.PurchaseError, price: Price | null): string {
  switch (error) {
    case 'cost':
      return price?.currency === 'pearls' ? 'Need more pearls' : 'Need more shells';
    case 'full':
      return 'Tank is full';
    case 'max':
      return 'Maxed out';
    case 'owned':
      return 'Owned';
    default:
      return 'Unavailable';
  }
}

function ShopItem({ title, art, price, unlockLevel, error, blockedText, buyLabel = 'Buy', note, onBuy }: ItemProps) {
  const locked = error === 'locked';
  return (
    <div className={`shop-item${locked ? ' shop-item-locked' : ''}`}>
      <div className="shop-art">{art}</div>
      <div className="shop-title">{title}</div>
      {note && <div className="shop-note">{note}</div>}
      {price && <PriceTag price={price} />}
      {locked ? (
        <div className="shop-lock">🔒 Unlocks at Lv {unlockLevel}</div>
      ) : (
        <button type="button" className="shop-buy" disabled={error !== null} onClick={() => onBuy() && sound.play('coin')}>
          {error ? (blockedText ?? blockedLabel(error, price)) : buyLabel}
        </button>
      )}
    </div>
  );
}

function FishTab({ game }: { game: GameState }) {
  const buyFish = useGameStore((s) => s.buyFish);
  const tank = game.tanks.find((t) => t.id === game.activeTankId)!;
  return (
    <>
      <p className="shop-sub">
        Buying for <strong>{tank.name}</strong> · 🐟 {tankOccupancy(game, tank.id)}/{tank.capacity}
      </p>
      <div className="shop-grid">
        {SPECIES_LIST.map((s) => {
          const error = economy.checkBuyFish(game, s.id);
          return (
            <ShopItem
              key={s.id}
              title={s.name}
              art={<FishPreview speciesId={s.id} />}
              price={s.cost}
              unlockLevel={s.unlockLevel}
              error={error}
              blockedText={error === 'theme' && s.themeOnly ? `Needs ${THEMES[s.themeOnly].name}` : undefined}
              note={<RichText text={`Grows in ${s.growMinutes >= 60 ? `${s.growMinutes / 60}h` : `${s.growMinutes}m`} · drops ${s.dropValue} 🐚`} />}
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
      <p className="shop-sub">You have {game.inventory.premiumFood} premium food. Premium pellets fill +25 hunger and give a 3-minute 2× growth boost.</p>
      <div className="shop-grid">
        <ShopItem
          title={`Premium food ×${PREMIUM_FOOD_PACK.count}`}
          art={<span className="shop-emoji">🌟</span>}
          price={PREMIUM_FOOD_PACK.price}
          unlockLevel={UNLOCK_LEVEL.premiumFood}
          error={economy.checkBuyPremiumFood(game)}
          onBuy={buyPremiumFood}
        />
      </div>
    </>
  );
}

function DecorTab({ game }: { game: GameState }) {
  const buyDecor = useGameStore((s) => s.buyDecor);
  const sellDecor = useGameStore((s) => s.sellDecor);
  const tank = game.tanks.find((t) => t.id === game.activeTankId)!;
  return (
    <>
      <p className="shop-sub">
        Each item makes fish a little happier. {tank.decor.length}/{MAX_DECOR_PER_TANK} in {tank.name}.
      </p>
      <div className="shop-grid">
        {DECOR_LIST.map((d) => (
          <ShopItem
            key={d.id}
            title={d.name}
            art={<DecorPreview decorId={d.id} />}
            price={d.cost}
            unlockLevel={Math.max(UNLOCK_LEVEL.decorShop, d.unlockLevel)}
            error={economy.checkBuyDecor(game, d.id)}
            onBuy={() => buyDecor(d.id)}
          />
        ))}
      </div>
      {tank.decor.length > 0 && (
        <>
          <h3 className="shop-heading">In this tank</h3>
          <ul className="shop-list">
            {tank.decor.map((placed) => (
              <li key={placed.id}>
                <span>{DECOR[placed.decorId].name}</span>
                <button type="button" className="shop-small" onClick={() => sellDecor(tank.id, placed.id)}>
                  Sell back <PriceTag price={economy.decorRefund(placed.decorId)} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
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
          note={`${tank.name}: 🐟 ${tankOccupancy(game, tank.id)}/${tank.capacity} · ${economy.capacityUpgradesBought(tank)}/${CAPACITY_UPGRADE.maxPurchases} upgrades`}
          onBuy={store.buyCapacityUpgrade}
        />
        <ShopItem
          title={nextTank ? (game.tanks.length === 1 ? 'Second tank' : 'Third tank') : 'All tanks owned'}
          art={<span className="shop-emoji">🏠</span>}
          price={nextTank?.price ?? null}
          unlockLevel={nextTank?.unlockLevel ?? 0}
          error={economy.checkBuyTank(game)}
          onBuy={store.buyTank}
        />
        {themeIds.map((id) => {
          const theme = THEMES[id];
          const owned = game.ownedThemes.includes(id);
          const inUse = tank.theme === id;
          if (owned) {
            return (
              <ShopItem
                key={id}
                title={`${theme.name} theme`}
                art={<span className={`shop-swatch theme-${id}`} />}
                price={null}
                unlockLevel={theme.unlockLevel}
                error={inUse ? 'owned' : null}
                blockedText="In use"
                buyLabel="Use here"
                onBuy={() => store.applyTheme(id)}
              />
            );
          }
          return (
            <ShopItem
              key={id}
              title={`${theme.name} theme`}
              art={<span className={`shop-swatch theme-${id}`} />}
              price={theme.price}
              unlockLevel={theme.unlockLevel}
              error={economy.checkBuyTheme(game, id)}
              onBuy={() => store.buyTheme(id)}
            />
          );
        })}
      </div>
      <button type="button" className="shop-small tankswitcher-shop" onClick={() => store.openPanel('tanks')}>
        🏠 Switch &amp; rename tanks
      </button>
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
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && openPanel(null)}>
      <section className="shop" role="dialog" aria-modal="true" aria-label="Shop">
        <header className="shop-head">
          <h2>Shop</h2>
          <span className="shop-wallet">
            <PriceTag price={{ currency: 'shells', amount: game.shells }} />
            <PriceTag price={{ currency: 'pearls', amount: game.pearls }} />
          </span>
          <button type="button" className="fishcard-close" onClick={() => openPanel(null)} aria-label="Close shop">
            ✕
          </button>
        </header>
        <nav className="shop-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`shop-tab${tab === t.id ? ' shop-tab-active' : ''}`} onClick={() => openPanel('shop', t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="shop-body">
          {tab === 'fish' && <FishTab game={game} />}
          {tab === 'food' && <FoodTab game={game} />}
          {tab === 'decor' && <DecorTab game={game} />}
          {tab === 'tanks' && <TanksTab game={game} />}
        </div>
      </section>
    </div>
  );
}
