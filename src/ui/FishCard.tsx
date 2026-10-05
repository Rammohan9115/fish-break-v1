// Info card for the tapped fish: editable name, species, stage, hunger/happiness (icon + word + bar),
// growth, bond (pets, tricks), breeding checklist + Pair up, move and sell (with a confirm).
import { useState } from 'react';
import { BREEDING, FISH_NAME_MAX_LENGTH, FULL_HUNGER, HAPPINESS_STARVING_THRESHOLD, SAD_HAPPINESS, SECOND_MS, THEMES, UNLOCK_LEVEL } from '../game/constants';
import { breedingChecklist, breedingUnlocked, courtshipOf, type CheckKey } from '../game/breeding';
import { checkMoveFish, sellValue } from '../game/economy';
import { stageProgress } from '../game/sim';
import { getSpecies, getVariant } from '../game/species';
import type { Fish, GameState, Stage } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { formatClock, formatEta } from './format';
import { Badge, Button, ConfirmDialog, CurrencyTag, LockedOverlay, NameField, ProgressBar, Sheet } from './kit';
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
    <div className="fishcard-meters">
      <ProgressBar label="Hunger" icon="🍤" tone="hunger" value={fish.hunger} valueText={`${hungerWord(fish.hunger)} · ${Math.round(fish.hunger)}%`} />
      <ProgressBar label="Mood" icon={mood.icon} tone="happy" value={fish.happiness} valueText={`${mood.word} · ${Math.round(fish.happiness)}%`} />
      <ProgressBar label="Growth" icon="🌱" tone="growth" value={progress.fraction * 100} valueText={growth} />
      {boostLeft > 0 && <Badge tone="gold">🌟 Growth boost: {Math.ceil(boostLeft / SECOND_MS)}s left</Badge>}
    </div>
  );
}

const CHECK_LABEL: Record<CheckKey, string> = { adult: 'Adult', happy: 'Happy', fed: 'Well fed', rested: 'Rested', partner: 'Partner' };

/** Breeding: ✅ when met, ⏳ with a fix hint when not, and Pair up (explains what's missing when tapped early). */
function BreedingSection({ fish, game }: { fish: Fish; game: GameState }) {
  const now = useNow(1000);
  const startPairing = useGameStore((s) => s.startPairing);
  const openPanel = useGameStore((s) => s.openPanel);
  const quest = useQuestStep();
  const [flag, setFlag] = useState(false);

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
  const missing = list.lines.filter((l) => !l.ok);
  const firstMissing = missing[0];
  return (
    <section className="breed" aria-label="Breeding">
      <div className="breed-title">{list.canPair ? 'Ready to pair 💕' : 'Breeding'}</div>
      {!list.canPair && (
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
      )}
      <Button
        variant="love"
        block
        pulse={quest?.step === 'pairUp' && list.canPair}
        disabledReason={firstMissing ? `${CHECK_LABEL[firstMissing.key]}: ${firstMissing.hint}` : null}
        onClick={() => startPairing(fish.id)}
        onPointerDown={() => !list.canPair && setFlag(true)}
      >
        Pair up 💕
      </Button>
    </section>
  );
}

/** Buttons to move the fish into another tank (needs room and a suitable theme). */
function MoveTo({ fish, game }: { fish: Fish; game: GameState }) {
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
          <Button key={t.id} size="sm" disabledReason={why} onClick={() => moveFish(fish.id, t.id)}>
            🏠 {t.name}
            {error === 'full' && ' (full)'}
          </Button>
        );
      })}
    </div>
  );
}

/** Sell with a confirm dialog. Juveniles sell for 40%; babies can't be sold. */
function SellButton({ fish }: { fish: Fish }) {
  const sellFish = useGameStore((s) => s.sellFish);
  const [confirming, setConfirming] = useState(false);
  const value = sellValue(fish);
  if (value === null) {
    return (
      <Button variant="ghost" size="sm" disabledReason="Babies can't be sold. They need to grow up first 🐣" className="fishcard-sell">
        Sell
      </Button>
    );
  }
  return (
    <>
      <Button variant="danger" size="sm" className="fishcard-sell" onClick={() => setConfirming(true)}>
        Sell for <CurrencyTag currency="shells" amount={value} size="sm" />
      </Button>
      {confirming && (
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
    </>
  );
}

export function FishCard() {
  const fish = useGameStore((s) => s.game.fish.find((f) => f.id === s.selectedFishId) ?? null);
  const game = useGameStore((s) => s.game);
  const selectFish = useGameStore((s) => s.selectFish);
  const renameFish = useGameStore((s) => s.renameFish);

  if (!fish) return null;
  const courting = courtshipOf(game, fish.id) !== null;
  const species = getSpecies(fish.speciesId);
  const variant = getVariant(fish.speciesId, fish.variant);

  return (
    <Sheet
      inline
      ariaLabel={`About ${fish.name}`}
      title={
        <span className={bondNameClass(fish.bondLevel)}>
          <NameField key={fish.id} value={fish.name} maxLength={FISH_NAME_MAX_LENGTH} label="Fish name" onSave={(name) => renameFish(fish.id, name)} />
        </span>
      }
      onClose={() => selectFish(null)}
      className="fishcard"
    >
      <div className="fishcard-sub">
        <span className="fishcard-swatch" style={{ background: variant.body, borderColor: variant.outline }} aria-hidden="true" />
        <span className="meta">
          {species.name} · {variant.name}
        </span>
        <Badge tone="brand">{STAGE_LABEL[fish.stage]}</Badge>
        {fish.shiny && <Badge tone="gold">✨ Shiny</Badge>}
      </div>
      <Meters fish={fish} />
      <BondSection fish={fish} />
      <BreedingSection fish={fish} game={game} />
      {!courting && (
        <div className="fishcard-foot">
          <MoveTo fish={fish} game={game} />
          <SellButton key={fish.id} fish={fish} />
        </div>
      )}
    </Sheet>
  );
}
