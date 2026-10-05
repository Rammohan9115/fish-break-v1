// Info card for the tapped fish, built to fit without scrolling: a compact header (thumbnail, editable name, species and
// stage, a ⋯ menu with Move and Sell) and three tabs: Status (slim hunger / mood / growth bars), Bond (level, progress,
// pets left, tricks) and Breeding (the checklist). Pair up lives in the footer. It is a Popover next to the fish for a
// mouse, a docked card for a finger on a wide screen, and a bottom sheet on a phone (see overlay/Card.tsx).
import { useCallback, useEffect, useRef, useState } from 'react';
import { BREEDING, FISH_NAME_MAX_LENGTH, FULL_HUNGER, HAPPINESS_STARVING_THRESHOLD, SAD_HAPPINESS, SECOND_MS, THEMES, UNLOCK_LEVEL } from '../game/constants';
import { breedingChecklist, breedingUnlocked, courtshipOf, type CheckKey } from '../game/breeding';
import { checkMoveFish, sellValue } from '../game/economy';
import { stageProgress } from '../game/sim';
import { getSpecies, getVariant } from '../game/species';
import type { Fish, GameState, Stage } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { formatClock, formatEta } from './format';
import { Badge, Button, ConfirmDialog, CurrencyTag, LockedOverlay, NameField, ProgressBar, Tabs } from './kit';
import { Card } from './overlay/Card';
import { FishPreview } from './Preview';
import { currentRenderer } from '../render/renderer';
import { useNow, useQuestStep } from './useBreeding';
import { BondSection, bondNameClass } from './BondSection';
import { bondName } from '../game/bond';

const STAGE_LABEL: Record<Stage, string> = { egg: 'Egg', baby: 'Baby', juvenile: 'Juvenile', adult: 'Adult' };

/** A word for each meter, so state never depends on color alone. */
function hungerWord(h: number): string {
  if (h >= FULL_HUNGER) return 'Full';
  if (h >= BREEDING.minHunger) return 'Fed';
  if (h >= HAPPINESS_STARVING_THRESHOLD) return 'Peckish';
  return 'Hungry';
}

function moodWord(h: number): { icon: string; word: string } {
  if (h >= BREEDING.minHappiness) return { icon: '😊', word: 'Happy' };
  if (h >= SAD_HAPPINESS) return { icon: '🙂', word: 'Okay' };
  return { icon: '😢', word: 'Sad' };
}

function Meters({ fish }: { fish: Fish }) {
  const mood = moodWord(fish.happiness);
  const now = Date.now();
  const progress = stageProgress(fish, now);
  const boostLeft = fish.boostUntil !== null ? Math.max(0, fish.boostUntil - now) : 0;
  let growth: string;
  if (!progress.nextStage) growth = 'Fully grown 🎉';
  else if (!progress.growing) growth = 'Paused: hungry';
  else growth = `${STAGE_LABEL[progress.nextStage]} in ${formatEta(progress.secondsRemaining ?? 0)}`;
  return (
    <div className="fishcard-meters fc-meters">
      <ProgressBar className="pbar-slim" label="Hunger" icon="🍤" tone="hunger" value={fish.hunger} valueText={hungerWord(fish.hunger)} />
      <ProgressBar className="pbar-slim" label="Mood" icon={mood.icon} tone="happy" value={fish.happiness} valueText={mood.word} />
      <ProgressBar className="pbar-slim" label="Growth" icon="🌱" tone="growth" value={progress.fraction * 100} valueText={growth} />
      {boostLeft > 0 && <Badge tone="gold">🌟 Growth boost: {Math.ceil(boostLeft / SECOND_MS)}s left</Badge>}
    </div>
  );
}

const CHECK_LABEL: Record<CheckKey, string> = { adult: 'Adult', happy: 'Happy', fed: 'Well fed', rested: 'Rested', partner: 'Partner' };

/** The Breeding tab: what the fish needs before it can pair (✅ done, ⏳ with a fix hint), or its courtship. */
function BreedingTab({ fish, game, flag }: { fish: Fish; game: GameState; flag: boolean }) {
  const now = useNow(1000);
  const openPanel = useGameStore((s) => s.openPanel);
  if (!breedingUnlocked(game)) {
    return (
      <div className="fishcard-breed-locked">
        💕 Breeding <LockedOverlay level={UNLOCK_LEVEL.breeding} compact />
      </div>
    );
  }
  const courtship = courtshipOf(game, fish.id);
  if (courtship) {
    const partnerId = courtship.fishIds.find((id) => id !== fish.id);
    const partner = game.fish.find((f) => f.id === partnerId);
    return (
      <section className="breed breed-love" aria-label="Breeding">
        <div className="breed-title">
          In love 💞 <span className="tabular">{formatClock(courtship.endsAt - now)}</span>
        </div>
        <span className="meta">{partner ? `Swimming with ${partner.name} — an egg is on its way!` : 'An egg is on its way!'}</span>
      </section>
    );
  }
  const list = breedingChecklist(game, fish, now);
  const firstMissing = list.lines.find((l) => !l.ok);
  return (
    <section className="breed" aria-label="Breeding">
      <div className="breed-title">{list.canPair ? 'Ready to pair 💕' : 'Breeding'}</div>
      <ul className="breed-list">
        {list.lines.map((l) => (
          <li key={l.key} className={`breed-line${l.ok ? ' breed-ok' : ''}${flag && l.key === firstMissing?.key ? ' breed-flag' : ''}`}>
            <span aria-hidden="true">{l.ok ? '✅' : '⏳'}</span>
            <span className="breed-label">
              {CHECK_LABEL[l.key]}
              <span className="sr-only">{l.ok ? ': done' : ': not yet'}</span>
            </span>
            {!l.ok && <span className="breed-hint">{l.hint}</span>}
            {l.action === 'buy' && (
              <Button size="sm" onClick={() => openPanel('shop', 'fish')}>
                Buy one
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Pair up, pinned in the footer. Tapped early, it shows the Breeding tab with the first missing line highlighted. */
function PairFooter({ fish, game, onEarly }: { fish: Fish; game: GameState; onEarly: () => void }) {
  const now = useNow(1000);
  const startPairing = useGameStore((s) => s.startPairing);
  const quest = useQuestStep();
  if (!breedingUnlocked(game) || courtshipOf(game, fish.id)) return null;
  const list = breedingChecklist(game, fish, now);
  const firstMissing = list.lines.find((l) => !l.ok);
  return (
    <Button
      variant="love"
      block
      pulse={quest?.step === 'pairUp' && list.canPair}
      disabledReason={firstMissing ? `${CHECK_LABEL[firstMissing.key]}: ${firstMissing.hint}` : null}
      onClick={() => startPairing(fish.id)}
      onPointerDown={() => !list.canPair && onEarly()}
    >
      Pair up 💕
    </Button>
  );
}

/** Buttons to move the fish into another tank (needs room and a suitable theme). */
function MoveTo({ fish, game, onDone }: { fish: Fish; game: GameState; onDone: () => void }) {
  const moveFish = useGameStore((s) => s.moveFish);
  const others = game.tanks.filter((t) => t.id !== fish.tankId);
  if (others.length === 0) return null;
  const species = getSpecies(fish.speciesId);
  return (
    <div className="fishcard-move">
      <span className="meta">Move to</span>
      {others.map((t) => {
        const error = checkMoveFish(game, fish.id, t.id);
        const why = error === 'full' ? `${t.name} is full` : error === 'theme' ? `${species.name} needs a ${THEMES[species.themeOnly ?? 'classic'].name} tank` : error ? 'Not possible right now' : null;
        return (
          <Button
            key={t.id}
            size="sm"
            block
            disabledReason={why}
            onClick={() => {
              moveFish(fish.id, t.id);
              onDone();
            }}
          >
            🏠 {t.name}
            {error === 'full' && ' (full)'}
          </Button>
        );
      })}
    </div>
  );
}

/** The ⋯ menu: move to another tank, and sell (with a confirm). Juveniles sell for 40%; babies can't be sold. */
function FishMenu({ fish, game }: { fish: Fish; game: GameState }) {
  const sellFish = useGameStore((s) => s.sellFish);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const value = sellValue(fish);
  const courting = courtshipOf(game, fish.id) !== null;

  // Close on a tap elsewhere or Esc.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  return (
    <div className="fc-menu-wrap" ref={ref}>
      <Button variant="icon" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </Button>
      {open && (
        <div className="fc-menu" role="menu" aria-label={`${fish.name}: more actions`}>
          {!courting && <MoveTo fish={fish} game={game} onDone={() => setOpen(false)} />}
          {value === null ? (
            <Button variant="ghost" size="sm" block disabledReason="Babies can't be sold. They need to grow up first 🐣">
              Sell
            </Button>
          ) : courting ? (
            <Button variant="ghost" size="sm" block disabledReason={`${fish.name} is in love 💞`}>
              Sell
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              block
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
            >
              Sell for <CurrencyTag currency="shells" amount={value} size="sm" />
            </Button>
          )}
        </div>
      )}
      {confirming && value !== null && (
        <ConfirmDialog
          title={fish.bondLevel >= 3 ? `${fish.name} is your ${bondName(fish.bondLevel)} 💕 — sell anyway?` : `Say goodbye to ${fish.name}?`}
          body={
            <p>
              {fish.name} will move to a new home and you get <CurrencyTag currency="shells" amount={value} />.
            </p>
          }
          confirmLabel="Sell"
          cancelLabel="Keep"
          tone="danger"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            sellFish(fish.id);
          }}
        />
      )}
    </div>
  );
}

type FishTab = 'status' | 'bond' | 'breed';

export function FishCard() {
  const fish = useGameStore((s) => s.game.fish.find((f) => f.id === s.selectedFishId) ?? null);
  const game = useGameStore((s) => s.game);
  const selectFish = useGameStore((s) => s.selectFish);
  const renameFish = useGameStore((s) => s.renameFish);
  const [tab, setTab] = useState<FishTab>('status');
  const [flag, setFlag] = useState(false);
  const fishId = fish?.id ?? null;

  // A different fish starts on its Status tab.
  useEffect(() => {
    setTab('status');
    setFlag(false);
  }, [fishId]);

  const anchor = useCallback(() => {
    if (!fishId) return null;
    const p = currentRenderer()?.fishScreenPoint(fishId);
    if (!p) return null;
    return { x: p.x - p.halfHeight * 1.5, y: p.y - p.halfHeight, w: p.halfHeight * 3, h: p.halfHeight * 2 };
  }, [fishId]);

  if (!fish) return null;
  const species = getSpecies(fish.speciesId);
  const variant = getVariant(fish.speciesId, fish.variant);
  const showPair = breedingUnlocked(game) && courtshipOf(game, fish.id) === null;

  return (
    <Card
      ariaLabel={`About ${fish.name}`}
      className="fishcard"
      anchor={anchor}
      onClose={() => selectFish(null)}
      onLost={() => selectFish(null)}
      scrollKey={`${fish.id}:${tab}`}
      title={
        <span className="fc-title">
          <span className="fc-thumb" aria-hidden="true">
            <FishPreview speciesId={fish.speciesId} variant={fish.variant} />
          </span>
          <span className="fc-title-text">
            <span className={bondNameClass(fish.bondLevel)}>
              <NameField key={fish.id} value={fish.name} maxLength={FISH_NAME_MAX_LENGTH} label="Fish name" onSave={(name) => renameFish(fish.id, name)} />
            </span>
            <span className="fc-meta">
              <span className="fishcard-swatch" style={{ background: variant.body, borderColor: variant.outline }} aria-hidden="true" />
              {species.name} · {STAGE_LABEL[fish.stage]}
              {fish.shiny ? ' · ✨ Shiny' : ''}
            </span>
          </span>
        </span>
      }
      headerExtra={<FishMenu fish={fish} game={game} />}
      tabs={
        <Tabs<FishTab>
          ariaLabel="Fish details"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'status', label: '📊 Status' },
            { id: 'bond', label: '💗 Bond' },
            { id: 'breed', label: '💕 Breed' },
          ]}
        />
      }
      footer={
        showPair ? (
          <PairFooter
            fish={fish}
            game={game}
            onEarly={() => {
              setTab('breed');
              setFlag(true);
            }}
          />
        ) : undefined
      }
    >
      {tab === 'status' && <Meters fish={fish} />}
      {tab === 'bond' && <BondSection fish={fish} />}
      {tab === 'breed' && <BreedingTab fish={fish} game={game} flag={flag} />}
    </Card>
  );
}
