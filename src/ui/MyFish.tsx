// My Fish: every fish across tanks (and the Nursery), with its bond. Sort by bond, name or species;
// tap a fish to jump to its tank and open its card.
import { useState } from 'react';
import { getSpecies, getVariant } from '../game/species';
import type { Fish, GameState, Stage } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { BondBadge, bondNameClass } from './BondSection';
import { EmptyState, Sheet, Tabs } from './kit';

type SortBy = 'bond' | 'name' | 'species';

const STAGE_LABEL: Record<Stage, string> = { egg: 'Egg', baby: 'Baby', juvenile: 'Juvenile', adult: 'Adult' };

const SORTS: Record<SortBy, (a: Fish, b: Fish) => number> = {
  bond: (a, b) => b.bondPoints - a.bondPoints || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  species: (a, b) => getSpecies(a.speciesId).name.localeCompare(getSpecies(b.speciesId).name) || a.name.localeCompare(b.name),
};

function Row({ fish, onOpen }: { fish: Fish; onOpen?: () => void }) {
  const v = getVariant(fish.speciesId, fish.variant);
  const body = (
    <>
      <span className="fishcard-swatch breed-swatch" style={{ background: v.body, borderColor: v.outline }} aria-hidden="true" />
      <span className="myfish-main">
        <strong className={bondNameClass(fish.bondLevel)}>{fish.name}</strong>
        <span className="meta">
          {getSpecies(fish.speciesId).name} · {STAGE_LABEL[fish.stage]}
          {fish.shiny ? ' · ✨' : ''}
        </span>
      </span>
      <BondBadge level={fish.bondLevel} compact />
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button type="button" className="tile myfish-row" onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className="tile myfish-row">{body}</div>
      )}
    </li>
  );
}

function Groups({ game, sortBy }: { game: GameState; sortBy: SortBy }) {
  const switchTank = useGameStore((s) => s.switchTank);
  const selectFish = useGameStore((s) => s.selectFish);
  const openPanel = useGameStore((s) => s.openPanel);
  const openBreeding = useGameStore((s) => s.openBreeding);
  const open = (fish: Fish) => {
    openPanel(null);
    if (fish.tankId !== game.activeTankId) switchTank(fish.tankId);
    selectFish(fish.id);
  };
  return (
    <>
      {game.tanks.map((t) => {
        const list = game.fish.filter((f) => f.tankId === t.id).sort(SORTS[sortBy]);
        if (list.length === 0) return null;
        return (
          <section key={t.id} className="myfish-group" aria-label={t.name}>
            <h3 className="myfish-tank">
              🏠 {t.name} <span className="meta">· {list.length}</span>
            </h3>
            <ul className="breed-rows">
              {list.map((f) => (
                <Row key={f.id} fish={f} onOpen={() => open(f)} />
              ))}
            </ul>
          </section>
        );
      })}
      {game.nursery.length > 0 && (
        <section className="myfish-group" aria-label="Nursery">
          <h3 className="myfish-tank">
            🍼 Nursery <span className="meta">· napping</span>
          </h3>
          <ul className="breed-rows">
            {[...game.nursery].sort(SORTS[sortBy]).map((f) => (
              <Row key={f.id} fish={f} onOpen={() => openBreeding('nursery')} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function MyFish() {
  const panel = useGameStore((s) => s.panel);
  const game = useGameStore((s) => s.game);
  const openPanel = useGameStore((s) => s.openPanel);
  const [sortBy, setSortBy] = useState<SortBy>('bond');
  if (panel !== 'myfish') return null;
  const empty = game.fish.length === 0 && game.nursery.length === 0;
  return (
    <Sheet title="🐟 My Fish" onClose={() => openPanel(null)} className="myfish" scrollKey={sortBy}>
      {empty ? (
        <EmptyState icon="🐟" title="No fish yet" body="Visit the shop to adopt your first fish." />
      ) : (
        <>
          <Tabs
            kind="radiogroup"
            ariaLabel="Sort by"
            value={sortBy}
            onChange={setSortBy}
            items={[
              { id: 'bond', label: '💕 Bond' },
              { id: 'name', label: '🔤 Name' },
              { id: 'species', label: '🐠 Species' },
            ]}
          />
          <Groups game={game} sortBy={sortBy} />
        </>
      )}
    </Sheet>
  );
}
