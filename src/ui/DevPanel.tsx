// Dev/art-preview panel. Loaded lazily; shown in production while DEV_TOOLS_IN_PRODUCTION is true.
import { useState } from 'react';
import { SPECIES, SPECIES_LIST } from '../game/species';
import type { BondLevel, SpeciesId, ThemeId } from '../game/types';
import { BOND } from '../game/constants';
import { useGameStore } from '../store/gameStore';
import { ClawEditor } from './ClawEditor';
import { hasClaws } from '../render/clawSplit';
import { EyeEditor } from './EyeEditor';
import { sandLineY, setSandLineY } from '../render/artConfig';
import { QUALITY_LEVELS } from '../render/ambient/quality';
import { currentRenderer } from '../render/renderer';
import { LidEditor } from './LidEditor';
import { BellSplitEditor } from './BellSplitEditor';

type SpawnStage = 'baby' | 'juvenile' | 'adult';
const STAGES: SpawnStage[] = ['baby', 'juvenile', 'adult'];
const THEMES: ThemeId[] = ['classic', 'night', 'coral', 'pond'];

/** Bond: set any fish's bond level, reset the hourly pet caps, replay the welcome-back greeting. */
function BondTools() {
  const dev = useGameStore((s) => s.dev);
  const game = useGameStore((s) => s.game);
  const fish = game.fish.filter((f) => f.tankId === game.activeTankId);
  const selected = useGameStore((s) => s.quickFishId ?? s.selectedFishId);
  const eventForced = useGameStore((s) => s.eventForced);
  const [picked, setPicked] = useState('');
  const target = fish.find((f) => f.id === (picked || selected)) ?? fish[0];
  return (
    <>
      <div className="dev-label">Bond</div>
      <label className="dev-row">
        <span>Fish</span>
        <select value={target?.id ?? ''} onChange={(e) => setPicked(e.target.value)}>
          {fish.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({SPECIES[f.speciesId].name}) · {BOND.names[f.bondLevel]} {Math.round(f.bondPoints * 10) / 10}
            </option>
          ))}
        </select>
      </label>
      <div className="dev-buttons">
        {BOND.names.map((name, level) => (
          <button key={name} type="button" disabled={!target} onClick={() => target && dev.setBondLevel(target.id, level as BondLevel)}>
            {level} {name}
          </button>
        ))}
      </div>
      <div className="dev-buttons">
        <button type="button" onClick={dev.resetPetCaps}>
          ♻️ Reset pet caps
        </button>
        <button type="button" onClick={dev.greet}>
          👋 Play greeting
        </button>
      </div>
      <div className="dev-label">Decor</div>
      <div className="dev-buttons">
        <button type="button" onClick={dev.giveAllDecor}>
          🎁 Give all decor + styles
        </button>
        <button type="button" onClick={() => dev.forceEvent(!eventForced)}>
          🎃 Halloween event: {eventForced ? 'forced on' : 'by date'}
        </button>
      </div>
    </>
  );
}

export default function DevPanel() {
  const dev = useGameStore((s) => s.dev);
  const dropPellet = useGameStore((s) => s.dropPellet);
  const [open, setOpen] = useState(false);
  const [speciesId, setSpeciesId] = useState<SpeciesId>('danio');
  const [stage, setStage] = useState<SpawnStage>('adult');
  const [variant, setVariant] = useState<string>('');
  const [shiny, setShiny] = useState(false);

  const species = SPECIES[speciesId];
  const theme = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId)?.theme ?? 'classic');
  // The override lives outside React; bump this to re-render after changing it.
  const [, setSandTick] = useState(0);
  const sandLine = sandLineY(theme);

  const spawn = () => dev.spawnFish({ speciesId, stage, variant: variant || undefined, shiny });
  const spawnAllSpecies = () => SPECIES_LIST.forEach((s) => dev.spawnFish({ speciesId: s.id, stage }));
  const spawnAllVariants = () => species.variants.forEach((v) => dev.spawnFish({ speciesId, stage, variant: v.key, shiny }));
  const spawnAllStages = () => STAGES.forEach((st) => dev.spawnFish({ speciesId, stage: st, variant: variant || undefined, shiny }));
  const feed = () => {
    // Bypass the 150ms rate limit by spacing drops.
    for (let i = 0; i < 6; i++) setTimeout(() => dropPellet(150 + Math.random() * 700), i * 160);
  };

  if (!open) {
    return (
      <button type="button" className="dev-toggle" onClick={() => setOpen(true)}>
        🛠 Dev
      </button>
    );
  }

  return (
    <aside className="dev-panel" aria-label="Developer panel">
      <div className="dev-row dev-head">
        <strong>🛠 Art preview</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close dev panel">
          ✕
        </button>
      </div>
      <label className="dev-row">
        Species
        <select
          value={speciesId}
          onChange={(e) => {
            setSpeciesId(e.target.value as SpeciesId);
            setVariant('');
          }}
        >
          {SPECIES_LIST.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="dev-row">
        Stage
        <select value={stage} onChange={(e) => setStage(e.target.value as SpawnStage)}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="dev-row">
        Variant
        <select value={variant} onChange={(e) => setVariant(e.target.value)}>
          <option value="">random</option>
          {species.variants.map((v) => (
            <option key={v.key} value={v.key}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label className="dev-row">
        <span>Shiny</span>
        <input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} />
      </label>
      <div className="dev-buttons">
        <button type="button" onClick={spawn}>
          Spawn
        </button>
        <button type="button" onClick={spawnAllVariants}>
          All variants
        </button>
        <button type="button" onClick={spawnAllStages}>
          All stages
        </button>
        <button type="button" onClick={spawnAllSpecies}>
          Every species
        </button>
        <button type="button" onClick={feed}>
          Drop food
        </button>
        <button type="button" onClick={dev.clearFish}>
          Clear tank
        </button>
      </div>
      <div className="dev-label">Mood (all fish in tank)</div>
      <div className="dev-buttons">
        <button type="button" onClick={() => dev.setMood({ hunger: 80, happiness: 90 })}>
          😊 Happy
        </button>
        <button type="button" onClick={() => dev.setMood({ happiness: 10 })}>
          🌧 Sad
        </button>
        <button type="button" onClick={() => dev.setMood({ hunger: 5 })}>
          🍤 Hungry
        </button>
      </div>
      <div className="dev-label">Breeding</div>
      <div className="dev-buttons">
        <button type="button" onClick={dev.makeReady}>
          💕 Make ready
        </button>
        <button type="button" onClick={dev.finishCourtships}>
          ⏩ Finish courtship
        </button>
        <button type="button" onClick={dev.hatchEggsNow}>
          🐣 Hatch eggs now
        </button>
        <button type="button" onClick={dev.fillTank}>
          🐟 Fill tank
        </button>
      </div>
      <BondTools />
      <div className="dev-label">Theme</div>
      <div className="dev-buttons">
        {THEMES.map((t) => (
          <button key={t} type="button" onClick={() => dev.setTheme(t)}>
            {t}
          </button>
        ))}
      </div>
      <label className="dev-row dev-slider">
        <span>
          Sand line ({theme}): {sandLine.toFixed(1)}%
        </span>
        <input
          type="range"
          min={60}
          max={98}
          step={0.5}
          value={sandLine}
          onChange={(e) => {
            setSandLineY(theme, Number(e.target.value));
            setSandTick((n) => n + 1);
          }}
        />
      </label>
      <div className="dev-label">Copy the % into THEME_ART.sandLineY (render/artConfig.ts) to keep it.</div>
      <LivingTankControls />
      <div className="dev-label">Chest lid: click to set the cut line / hinge</div>
      <LidEditor />
      <div className="dev-label">Sprite eye ({stage === 'baby' ? 'baby' : 'adult/juvenile'}): click the eye</div>
      <EyeEditor speciesId={speciesId} art={stage === 'baby' ? 'baby' : 'adult'} />
      {hasClaws(speciesId) && (
        <>
          <div className="dev-label">Claws ({stage === 'baby' ? 'baby' : 'adult/juvenile'}): click the wrist pivot, set the reach</div>
          <ClawEditor speciesId={speciesId} art={stage === 'baby' ? 'baby' : 'adult'} />
        </>
      )}
      {species.bellSplitY && (
        <>
          <div className="dev-label">Bell split ({stage === 'baby' ? 'baby' : 'adult/juvenile'}): click where the bell ends</div>
          <BellSplitEditor speciesId={speciesId} art={stage === 'baby' ? 'baby' : 'adult'} />
        </>
      )}
      <div className="dev-label">Tip: click a fish to make it bounce (Puffy inflates, Jelly does happy pulses).</div>
    </aside>
  );
}

const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

/** Time of day scrub, current gust, distant school, and the effect quality switch. */
function LivingTankControls() {
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  const renderer = currentRenderer();
  const hour = renderer?.hourOverride ?? null;
  const quality = renderer?.quality;
  return (
    <>
      <div className="dev-label">Living tank</div>
      <label className="dev-row dev-slider">
        <span>Time of day: {hour === null ? 'live clock' : fmtHour(hour)}</span>
        <input
          type="range"
          min={0}
          max={23.99}
          step={0.05}
          value={hour ?? new Date().getHours() + new Date().getMinutes() / 60}
          onChange={(e) => {
            renderer?.setHour(Number(e.target.value));
            refresh();
          }}
        />
      </label>
      <div className="dev-buttons">
        {[7.5, 13, 18.5, 23].map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => {
              renderer?.setHour(h);
              refresh();
            }}
          >
            {fmtHour(h)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            renderer?.setHour(null);
            refresh();
          }}
        >
          Live
        </button>
      </div>
      <div className="dev-buttons">
        <button type="button" onClick={() => useGameStore.getState().dev.spawnPlaneDemo()}>
          🐚 Plane demo
        </button>
        <button type="button" onClick={() => renderer?.forceGust()}>
          🌊 Gust
        </button>
        <button type="button" onClick={() => renderer?.forceSchool()}>
          🐟 Far school
        </button>
        <button
          type="button"
          onClick={() => {
            renderer?.setDance(!renderer.dancing);
            refresh();
          }}
        >
          {renderer?.dancing ? '⏹ Stop dance' : '💃 Dance Mode'}
        </button>
      </div>
      <div className="dev-label">
        Quality: {quality ? `${quality.level}${quality.overridden ? ' (pinned)' : ' (auto)'}` : '–'}
      </div>
      <div className="dev-buttons">
        <button
          type="button"
          onClick={() => {
            renderer?.setQuality(null);
            refresh();
          }}
        >
          Auto
        </button>
        {QUALITY_LEVELS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              renderer?.setQuality(q);
              refresh();
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </>
  );
}
