// Info card for the clicked fish: editable name, species, stage, hunger/happiness, growth.
import { useEffect, useState } from 'react';
import { FISH_NAME_MAX_LENGTH, SECOND_MS } from '../game/constants';
import { BREEDING, MINUTE_MS, THEMES } from '../game/constants';
import { breedCooldownLeft, breedingUnlocked, canBreed, hasReadyPartner } from '../game/breeding';
import { checkMoveFish, sellValue } from '../game/economy';
import { tankOccupancy } from '../game/sim';
import { stageProgress } from '../game/sim';
import type { GameState } from '../game/types';
import { getSpecies, getVariant } from '../game/species';
import type { Fish, Stage } from '../game/types';
import { useGameStore } from '../store/gameStore';

const STAGE_LABEL: Record<Stage, string> = { egg: 'Egg', baby: 'Baby', juvenile: 'Juvenile', adult: 'Adult' };

function formatEta(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const min = Math.round(seconds / 60);
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="meter-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className="meter-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function NameField({ fish }: { fish: Fish }) {
  const renameFish = useGameStore((s) => s.renameFish);
  const [draft, setDraft] = useState(fish.name);
  useEffect(() => setDraft(fish.name), [fish.name]);
  const commit = () => {
    if (draft.trim()) renameFish(fish.id, draft);
    else setDraft(fish.name);
  };
  return (
    <input
      className="fishcard-name"
      value={draft}
      maxLength={FISH_NAME_MAX_LENGTH}
      aria-label="Fish name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(fish.name);
          e.stopPropagation();
        }
      }}
    />
  );
}

function GrowthInfo({ fish }: { fish: Fish }) {
  const now = Date.now();
  const progress = stageProgress(fish, now);
  const boostLeft = fish.boostUntil !== null ? Math.max(0, fish.boostUntil - now) : 0;
  let caption: string;
  if (!progress.nextStage) caption = 'Fully grown 🎉';
  else if (!progress.growing) caption = 'Too hungry to grow 🍤';
  else caption = `${STAGE_LABEL[progress.nextStage]} in ${formatEta(progress.secondsRemaining ?? 0)}`;

  return (
    <div className="meter">
      <div className="meter-head">
        <span>Growth</span>
        <span>{caption}</span>
      </div>
      <div className="meter-track" role="progressbar" aria-label="Growth" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.fraction * 100)}>
        <div className="meter-fill" style={{ width: `${progress.fraction * 100}%`, background: 'linear-gradient(90deg, #b7e4ff, #7cc8f2)' }} />
      </div>
      {boostLeft > 0 && <div className="fishcard-boost">🌟 Growth boost: {Math.ceil(boostLeft / SECOND_MS)}s left</div>}
    </div>
  );
}

/** Breeding status line (from Lv 5, adults only). */
function BreedingStatus({ fish, game }: { fish: Fish; game: GameState }) {
  if (!breedingUnlocked(game) || fish.stage !== 'adult') return null;
  const now = Date.now();
  if (canBreed(fish, now)) {
    const tank = game.tanks.find((t) => t.id === fish.tankId);
    let detail: string | null = null;
    if (!hasReadyPartner(game, fish, now)) detail = `Needs a happy ${getSpecies(fish.speciesId).name} partner`;
    else if (tank && tankOccupancy(game, tank.id) >= tank.capacity) detail = 'Needs a free spot in the tank';
    return (
      <div className="fishcard-breed fishcard-breed-ready">
        Ready to breed 💕{detail && <small>{detail}</small>}
      </div>
    );
  }
  const cooldown = breedCooldownLeft(fish, now);
  if (cooldown > 0) {
    return <div className="fishcard-breed">💤 Resting after laying an egg · {Math.ceil(cooldown / MINUTE_MS)} min</div>;
  }
  const needs: string[] = [];
  if (fish.happiness < BREEDING.minHappiness) needs.push('happier');
  if (fish.hunger < BREEDING.minHunger) needs.push('well fed');
  return <div className="fishcard-breed">To breed, needs to be {needs.join(' and ')}</div>;
}

/** Buttons to move the fish into another tank (needs room and a suitable theme). */
function MoveTo({ fish, game }: { fish: Fish; game: GameState }) {
  const moveFish = useGameStore((s) => s.moveFish);
  const others = game.tanks.filter((t) => t.id !== fish.tankId);
  if (others.length === 0) return null;
  return (
    <div className="fishcard-move">
      <span>Move to</span>
      {others.map((t) => {
        const error = checkMoveFish(game, fish.id, t.id);
        const why = error === 'full' ? 'That tank is full' : error === 'theme' ? `${getSpecies(fish.speciesId).name} needs a ${THEMES[getSpecies(fish.speciesId).themeOnly ?? 'classic'].name} tank` : undefined;
        return (
          <button key={t.id} type="button" className="shop-small" disabled={error !== null} title={why} onClick={() => moveFish(fish.id, t.id)}>
            🏠 {t.name}
            {error === 'full' && ' (full)'}
          </button>
        );
      })}
    </div>
  );
}

/** Sell with a confirm step. Juveniles sell for 40%; babies can't be sold. */
function SellButton({ fish }: { fish: Fish }) {
  const sellFish = useGameStore((s) => s.sellFish);
  const [confirming, setConfirming] = useState(false);
  const value = sellValue(fish);
  if (value === null) {
    return <div className="fishcard-sell-note">Babies can't be sold yet 🐣</div>;
  }
  if (!confirming) {
    return (
      <button type="button" className="fishcard-sell" onClick={() => setConfirming(true)}>
        Sell for {value} 🐚
      </button>
    );
  }
  return (
    <div className="fishcard-confirm">
      <span>Say goodbye to {fish.name}?</span>
      <button type="button" className="shop-small" onClick={() => setConfirming(false)}>
        Keep
      </button>
      <button type="button" className="fishcard-sell" onClick={() => sellFish(fish.id)}>
        Sell
      </button>
    </div>
  );
}

export function FishCard() {
  const fish = useGameStore((s) => s.game.fish.find((f) => f.id === s.selectedFishId) ?? null);
  const game = useGameStore((s) => s.game);
  const selectFish = useGameStore((s) => s.selectFish);

  if (!fish) return null;
  const species = getSpecies(fish.speciesId);
  const variant = getVariant(fish.speciesId, fish.variant);

  return (
    <aside className="fishcard" aria-label={`About ${fish.name}`}>
      <button type="button" className="fishcard-close" onClick={() => selectFish(null)} aria-label="Close">
        ✕
      </button>
      <div className="fishcard-head">
        <span className="fishcard-swatch" style={{ background: variant.body, borderColor: variant.outline }} aria-hidden="true" />
        <div>
          <NameField key={fish.id} fish={fish} />
          <div className="fishcard-sub">
            {species.name} · {variant.name}
            {fish.shiny && <span className="fishcard-shiny"> ✨ Shiny</span>}
          </div>
        </div>
      </div>
      <div className="fishcard-stage">{STAGE_LABEL[fish.stage]}</div>
      <Meter label="Hunger" value={fish.hunger} color="linear-gradient(90deg, #ffd59e, #ffb26b)" />
      <Meter label="Happiness" value={fish.happiness} color="linear-gradient(90deg, #ffc2d6, #ff8fb1)" />
      <GrowthInfo fish={fish} />
      <BreedingStatus fish={fish} game={game} />
      <MoveTo fish={fish} game={game} />
      <SellButton key={fish.id} fish={fish} />
    </aside>
  );
}
