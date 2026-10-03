// Dev/art-preview panel. Loaded lazily; shown in production while DEV_TOOLS_IN_PRODUCTION is true.
import { useState } from 'react';
import { SPECIES, SPECIES_LIST } from '../game/species';
import type { SpeciesId, ThemeId } from '../game/types';
import { useGameStore } from '../store/gameStore';

type SpawnStage = 'baby' | 'juvenile' | 'adult';
const STAGES: SpawnStage[] = ['baby', 'juvenile', 'adult'];
const THEMES: ThemeId[] = ['classic', 'night', 'coral', 'pond'];

export default function DevPanel() {
  const dev = useGameStore((s) => s.dev);
  const dropPellet = useGameStore((s) => s.dropPellet);
  const [open, setOpen] = useState(false);
  const [speciesId, setSpeciesId] = useState<SpeciesId>('danio');
  const [stage, setStage] = useState<SpawnStage>('adult');
  const [variant, setVariant] = useState<string>('');
  const [shiny, setShiny] = useState(false);

  const species = SPECIES[speciesId];

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
      <div className="dev-label">Theme</div>
      <div className="dev-buttons">
        {THEMES.map((t) => (
          <button key={t} type="button" onClick={() => dev.setTheme(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="dev-label">Tip: click a Puffy to make it inflate.</div>
    </aside>
  );
}
