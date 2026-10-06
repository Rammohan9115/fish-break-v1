// Shop with Fish / Food / Decor / Tanks tabs. Locked items show 🔒 "Unlocks at Lv X"; items you can't
// afford say how far away you are; every blocked Buy explains why on tap.
import { useEffect, useState, type ReactNode } from "react";
import {
  CAPACITY_UPGRADE,
  COLLECTION_LIST,
  COLLECTIONS,
  DECOR_SEEN_KEY,
  DECOR,
  DECOR_LIST,
  PREMIUM_FOOD_PACK,
  SET_BONUS_ITEMS,
  THEMES,
  UNLOCK_LEVEL,
} from "../game/constants";
import {
  maxDecor,
  activeSets,
  collectionInSeason,
  collectionProgress,
  decorHappinessGain,
  setBonusNeeds,
  setProgress,
} from "../game/decor";
import * as economy from "../game/economy";
import { displayOccupancy, tankOccupancy } from "../game/sim";
import { SPECIES_LIST } from "../game/species";
import type {
  CollectionDef,
  CollectionId,
  DecorDef,
  DecorPlacement,
  GameState,
  Price,
  Tank,
  ThemeId,
} from "../game/types";
import { StylePicker } from "./StylePicker";
import { sound } from "../audio/sound";
import { eventClock, useGameStore, type ShopTab } from "../store/gameStore";
import { formatCount, formatMinutes } from "./format";
import { DecorPreview, FishPreview } from "./Preview";
import { RichText } from "./Icon";
import {
  Badge,
  Button,
  ConfirmDialog,
  CurrencyTag,
  EmptyState,
  LockedOverlay,
  Sheet,
  Tabs,
  type TabItem,
} from "./kit";

const TABS: TabItem<ShopTab>[] = [
  { id: "fish", label: "🐟 Fish" },
  { id: "food", label: "🍤 Food" },
  { id: "decor", label: "🪴 Decor" },
  { id: "styles", label: "✨ Styles" },
  { id: "tanks", label: "🏠 Tanks" },
];

/** A price tag (kept as a named export for the other panels). */
export function PriceTag({
  price,
  short = false,
}: {
  price: Price;
  short?: boolean;
}) {
  return (
    <CurrencyTag
      currency={price.currency}
      amount={price.amount}
      short={short}
    />
  );
}

/** How many more shells/pearls the player needs for `price` (0 when affordable). */
function shortfall(game: GameState, price: Price | null): number {
  if (!price) return 0;
  return Math.max(
    0,
    price.amount - (price.currency === "shells" ? game.shells : game.pearls),
  );
}

/** Button text + tap explanation for a blocked purchase. */
function blocked(
  error: economy.PurchaseError,
  price: Price | null,
  game: GameState,
): { label: string; reason: string } {
  switch (error) {
    case "cost": {
      const need = shortfall(game, price);
      const unit = price?.currency === "pearls" ? "⚪" : "🐚";
      return {
        label: `Need ${formatCount(need)} more ${unit}`,
        reason: "Collect shells from the sand, or wait for the daily gift 🎁",
      };
    }
    case "full":
      return {
        label: "Tank is full",
        reason: "Make room, or get a bigger tank in Tanks 🏠",
      };
    case "max":
      return {
        label: "Maxed out",
        reason: "You already have the most you can get",
      };
    case "owned":
      return { label: "Owned", reason: "Already yours" };
    case "event":
      return {
        label: "Back next October 🎃",
        reason:
          "Halloween decor is only in the shop during October. Pieces you own stay forever.",
      };
    default:
      return { label: "Unavailable", reason: "Not available right now" };
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
  /** Extra controls under Buy (e.g. "Try it"). */
  extra?: ReactNode;
  /** A small badge over the art (e.g. "New"). */
  badge?: ReactNode;
  /** Facts shown in the item-details dialog (opened from "Details"); [label, value] rows plus optional free text. */
  details?: { facts: [string, ReactNode][]; text?: ReactNode };
}

function ShopItem({
  title,
  art,
  price,
  unlockLevel,
  error,
  game,
  blockedOverride,
  buyLabel = "Buy",
  note,
  onBuy,
  extra,
  badge,
  details,
}: ItemProps) {
  const [open, setOpen] = useState(false);
  const locked = error === "locked";
  const block =
    error && !locked ? (blockedOverride ?? blocked(error, price, game)) : null;
  return (
    <div className={`tile shop-item${locked ? " shop-item-locked" : ""}`}>
      <div className="shop-art">
        {locked ? (
          <LockedOverlay level={unlockLevel}>{art}</LockedOverlay>
        ) : (
          art
        )}
        {badge && <span className="shop-badge">{badge}</span>}
      </div>
      <div className="shop-title">{title}</div>
      {note && <div className="shop-note">{note}</div>}
      {details && (
        <button type="button" className="shop-more" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          Details
        </button>
      )}
      {price && <PriceTag price={price} short={error === "cost"} />}
      {!locked && (
        <Button
          variant="primary"
          size="sm"
          block
          disabledReason={block?.reason}
          onClick={() => onBuy() && sound.play("coin")}
        >
          {block ? block.label : buyLabel}
        </Button>
      )}
      {extra}
      {open && details && (
        <Sheet
          kind="dialog"
          title={title}
          onClose={() => setOpen(false)}
          className="shop-details"
          footer={
            locked ? (
              <Button block onClick={() => setOpen(false)}>
                Close
              </Button>
            ) : (
              <Button
                variant="primary"
                block
                disabledReason={block?.reason}
                onClick={() => {
                  if (onBuy()) {
                    sound.play("coin");
                    setOpen(false);
                  }
                }}
              >
                {block ? block.label : buyLabel}
                {price && !block && (
                  <>
                    {" · "}
                    <PriceTag price={price} />
                  </>
                )}
              </Button>
            )
          }
        >
          <div className="shop-details-art">{art}</div>
          <dl className="shop-facts">
            {details.facts.map(([label, value]) => (
              <div key={label} className="shop-fact">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {details.text && <p className="shop-details-text">{details.text}</p>}
        </Sheet>
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
        Buying for <strong>{tank.name}</strong> · 🐟{" "}
        {displayOccupancy(tankOccupancy(game, tank.id))}/{tank.capacity}
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
              blockedOverride={
                error === "theme" && theme
                  ? {
                      label: `Needs ${theme}`,
                      reason: `Lives only in a ${theme} tank`,
                    }
                  : undefined
              }
              note={
                <RichText
                  text={`Grows in ${formatMinutes(s.growMinutes)} · drops ${s.dropValue} 🐚${s.special ? ` · Special: ${s.special}` : ""}`}
                />
              }
              details={{
                facts: [
                  ["Grows up in", formatMinutes(s.growMinutes)],
                  ["Drops", <RichText key="d" text={`${s.dropValue} 🐚 every ${formatMinutes(s.dropMinutes)}`} />],
                  ["Sells for", <RichText key="s" text={`${s.sellPrice} 🐚 as an adult`} />],
                  ...(s.special ? ([["Special", s.special]] as [string, ReactNode][]) : []),
                  ["Unlocks at", `Lv ${s.unlockLevel}`],
                  ...(theme ? ([["Lives in", `${theme} tanks only`]] as [string, ReactNode][]) : []),
                ],
                text: s.traits.length > 0 ? s.traits.join(" · ") : undefined,
              }}
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
        You have <strong>{game.inventory.premiumFood}</strong> premium food.
        Premium pellets fill +25 hunger and give a 3-minute 2× growth boost.
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
    return (
      <EmptyState
        icon="🪴"
        title="No decor yet"
        body="Pick something above. Each piece makes your fish a little happier."
      />
    );
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
              You'll get back{" "}
              <PriceTag price={economy.decorRefund(placed.decorId)} /> (half its
              price).
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

/** One decor item in the shop: price, what it adds to this tank's happiness, and Buy. */
function DecorItem({
  d,
  game,
  tank,
  isNew,
}: {
  d: DecorDef;
  game: GameState;
  tank: Tank;
  isNew: boolean;
}) {
  const buyDecor = useGameStore((s) => s.buyDecor);
  const startTry = useGameStore((s) => s.startTry);
  const error = economy.checkBuyDecor(game, d.id, eventClock());
  const gain = decorHappinessGain(tank, d.id);
  const full = tank.decor.length >= maxDecor(tank);
  const boxed = game.decorInventory[d.id] ?? 0;
  return (
    <ShopItem
      badge={isNew ? "New" : boxed > 0 ? `📦 ${boxed}` : undefined}
      extra={
        error === null && (
          <Button
            size="sm"
            variant="ghost"
            block
            disabledReason={
              full
                ? "This tank is full of decor — Buy puts it in your decor box"
                : null
            }
            onClick={() => startTry(d.id)}
          >
            👀 Try it
          </Button>
        )
      }
      title={d.name}
      art={<DecorPreview decorId={d.id} />}
      price={d.cost}
      unlockLevel={0}
      error={error}
      game={game}
      note={gain > 0 ? `+${gain} 😊 in ${tank.name}` : undefined}
      details={{
        facts: [
          ["Collection", d.collection ? `${COLLECTIONS[d.collection].icon} ${COLLECTIONS[d.collection].name}` : "🪸 Classic"],
          ["Goes", d.placement === "sand" ? "On the sand" : d.placement === "surface" ? "At the surface" : "Mid-water"],
          ["Happiness", gain > 0 ? `+${gain} 😊 in ${tank.name}` : "No more than the pieces you already have"],
          ["Sells back for", <PriceTag key="r" price={economy.decorRefund(d.id)} />],
        ],
      }}
      onBuy={() => buyDecor(d.id)}
    />
  );
}

/** A collection's header: progress, a ✓ when complete, the set bonus in this tank, and the event tag. */
function CollectionHeader({
  c,
  game,
  tank,
}: {
  c: CollectionDef;
  game: GameState;
  tank: Tank;
}) {
  const { owned, total } = collectionProgress(game, c.id);
  const inTank = setProgress(tank, c.id);
  const active = activeSets(tank).includes(c.id);
  return (
    <div className="collection-head">
      <h3 className="section-title">
        <span aria-hidden="true">{c.icon}</span> {c.name}
      </h3>
      <span className="meta">
        {owned}/{total} collected
      </span>
      {owned === total && <Badge tone="gold">✓ Complete</Badge>}
      {c.event === "october" && <Badge tone="love">🎃 October event</Badge>}
      {active ? (
        <Badge tone="good">✨ Set bonus active in {tank.name}</Badge>
      ) : (
        <span className="meta collection-hint">
          {Math.min(inTank, setBonusNeeds(c.id))}/{setBonusNeeds(c.id)}{" "}
          different in {tank.name} for the set bonus
        </span>
      )}
    </div>
  );
}

type CollectionFilter = "all" | CollectionId | "classic";
type PlacementFilter = "all" | DecorPlacement;
type PriceFilter = "all" | "low" | "mid" | "high" | "pearls";
type OwnedFilter = "all" | "owned" | "notOwned";

const PRICE_TEST: Record<PriceFilter, (p: Price) => boolean> = {
  all: () => true,
  low: (p) => p.currency === "shells" && p.amount <= 50,
  mid: (p) => p.currency === "shells" && p.amount > 50 && p.amount <= 150,
  high: (p) => p.currency === "shells" && p.amount > 150,
  pearls: (p) => p.currency === "pearls",
};

/** Decor the player has already seen in the shop (UI convenience, per browser). */
function readSeen(): Set<string> {
  try {
    return new Set(
      JSON.parse(localStorage.getItem(DECOR_SEEN_KEY) ?? "[]") as string[],
    );
  } catch {
    return new Set();
  }
}

function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="filter-row" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`chip${value === o.id ? " chip-on" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DecorTab({ game }: { game: GameState }) {
  const tank = game.tanks.find((t) => t.id === game.activeTankId)!;
  useGameStore((s) => s.eventForced);
  const now = new Date(eventClock());
  const [collection, setCollection] = useState<CollectionFilter>("all");
  const [placement, setPlacement] = useState<PlacementFilter>("all");
  const [price, setPrice] = useState<PriceFilter>("all");
  const [owned, setOwned] = useState<OwnedFilter>("all");
  // Only the collection row is always shown; where / price / owned fold into one "More filters" button so the items stay on screen.
  const [moreOpen, setMoreOpen] = useState(false);
  const activeMore = [placement, price, owned].filter(
    (f) => f !== "all",
  ).length;
  // "New" = not seen before this visit; everything shown now counts as seen next time.
  const [seen] = useState(readSeen);
  useEffect(() => {
    try {
      localStorage.setItem(
        DECOR_SEEN_KEY,
        JSON.stringify(DECOR_LIST.map((d) => d.id)),
      );
    } catch {
      // Not critical.
    }
  }, []);
  const ownedIds = new Set<string>([
    ...game.tanks.flatMap((t) => t.decor.map((d) => d.decorId)),
    ...Object.keys(game.decorInventory),
  ]);
  const keep = (d: DecorDef) =>
    (placement === "all" || d.placement === placement) &&
    PRICE_TEST[price](d.cost) &&
    (owned === "all" || (owned === "owned") === ownedIds.has(d.id));
  const showCollection = (id: CollectionFilter) =>
    collection === "all" || collection === id;
  const classic = DECOR_LIST.filter((d) => d.collection === null && keep(d));
  return (
    <>
      <p className="lead">
        Different pieces make fish happier than duplicates, and{" "}
        {SET_BONUS_ITEMS} different pieces from one collection unlock its set
        bonus. 🪸 {tank.decor.length}/{maxDecor(tank)} in {tank.name}.
      </p>
      <div className="filters">
        <FilterChips<CollectionFilter>
          label="Collection"
          value={collection}
          onChange={setCollection}
          options={[
            { id: "all", label: "All" },
            ...COLLECTION_LIST.map((c) => ({
              id: c.id,
              label: `${c.icon} ${c.name}`,
            })),
            { id: "classic", label: "🪸 Classic" },
          ]}
        />
        <button
          type="button"
          className={`chip filters-more${activeMore > 0 ? " chip-on" : ""}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
        >
          ⚙️ More filters{activeMore > 0 ? ` (${activeMore})` : ""}{" "}
          {moreOpen ? "▴" : "▾"}
        </button>
        {moreOpen && (
          <>
            <FilterChips<PlacementFilter>
              label="Where it goes"
              value={placement}
              onChange={setPlacement}
              options={[
                { id: "all", label: "Anywhere" },
                { id: "sand", label: "🏖️ Sand" },
                { id: "surface", label: "🌊 Surface" },
                { id: "mid", label: "🫧 Mid-water" },
              ]}
            />
            <FilterChips<PriceFilter>
              label="Price"
              value={price}
              onChange={setPrice}
              options={[
                { id: "all", label: "Any price" },
                { id: "low", label: "≤ 50 🐚" },
                { id: "mid", label: "51–150 🐚" },
                { id: "high", label: "150+ 🐚" },
                { id: "pearls", label: "⚪ Pearls" },
              ]}
            />
            <FilterChips<OwnedFilter>
              label="Owned"
              value={owned}
              onChange={setOwned}
              options={[
                { id: "all", label: "All" },
                { id: "owned", label: "Owned" },
                { id: "notOwned", label: "Not owned" },
              ]}
            />
          </>
        )}
      </div>
      {COLLECTION_LIST.map((c) => {
        if (!showCollection(c.id)) return null;
        const items = DECOR_LIST.filter(
          (d) => d.collection === c.id && keep(d),
        );
        if (items.length === 0) return null;
        // Out of season, event items only show if you own some (so the collection can still be completed later).
        if (
          !collectionInSeason(c, now) &&
          collectionProgress(game, c.id).owned === 0
        )
          return null;
        return (
          <section key={c.id} className="collection" aria-label={c.name}>
            <CollectionHeader c={c} game={game} tank={tank} />
            <div className="shop-grid">
              {items.map((d) => (
                <DecorItem
                  key={d.id}
                  d={d}
                  game={game}
                  tank={tank}
                  isNew={!seen.has(d.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
      {showCollection("classic") && classic.length > 0 && (
        <section className="collection" aria-label="Classic">
          <div className="collection-head">
            <h3 className="section-title">🪸 Classic</h3>
          </div>
          <div className="shop-grid">
            {classic.map((d) => (
              <DecorItem
                key={d.id}
                d={d}
                game={game}
                tank={tank}
                isNew={!seen.has(d.id)}
              />
            ))}
          </div>
        </section>
      )}
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
          note={`${tank.name}: 🐟 ${displayOccupancy(tankOccupancy(game, tank.id))}/${tank.capacity} · ${economy.capacityUpgradesBought(tank)}/${CAPACITY_UPGRADE.maxPurchases} upgrades`}
          onBuy={store.buyCapacityUpgrade}
        />
        <ShopItem
          title={
            nextTank
              ? game.tanks.length === 1
                ? "Second tank"
                : "Third tank"
              : "All tanks owned"
          }
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
              error={
                owned
                  ? inUse
                    ? "owned"
                    : null
                  : economy.checkBuyTheme(game, id)
              }
              game={game}
              blockedOverride={
                inUse
                  ? {
                      label: "In use",
                      reason: `${tank.name} already uses this theme`,
                    }
                  : undefined
              }
              buyLabel={owned ? "Use here" : "Buy"}
              onBuy={() => (owned ? store.applyTheme(id) : store.buyTheme(id))}
            />
          );
        })}
      </div>
      <div className="shop-more">
        <Button size="sm" onClick={() => store.openPanel("tanks")}>
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
  if (panel !== "shop") return null;

  return (
    <Sheet
      title="Shop"
      size="lg"
      onClose={() => openPanel(null)}
      scrollKey={tab}
      className="shop"
      tabs={<Tabs items={TABS} value={tab} onChange={(t) => openPanel("shop", t)} ariaLabel="Shop sections" />}
      headerExtra={
        <span className="shop-wallet" aria-label="Your wallet">
          <CurrencyTag currency="shells" amount={game.shells} />
          <CurrencyTag currency="pearls" amount={game.pearls} />
        </span>
      }
    >
      {tab === "fish" && <FishTab game={game} />}
      {tab === "food" && <FoodTab game={game} />}
      {tab === "decor" && <DecorTab game={game} />}
      {tab === "styles" && (
        <>
          <p className="lead">
            Make {game.tanks.find((t) => t.id === game.activeTankId)?.name}{" "}
            yours. Tap an option to preview it; styles you buy work on every
            tank.
          </p>
          <StylePicker />
        </>
      )}
      {tab === "tanks" && <TanksTab game={game} />}
    </Sheet>
  );
}
