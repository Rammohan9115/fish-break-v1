// The 💕 Breeding panel. Pairs: who's ready (one-tap Pair up), who's almost ready and what they need,
// courtships and eggs with countdowns, and the guide link. Nursery: napping babies to move or rehome.
import { useState } from 'react';
import { compatiblePartners, isCourting, isReadyToPair, notReadyReasons } from '../game/breeding';
import { checkMoveFromNursery, rehomeValue } from '../game/economy';
import { getSpecies, getVariant } from '../game/species';
import type { Fish, GameState } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';
import { clock, useNow } from './useBreeding';

function Swatch({ fish }: { fish: Fish }) {
  const v = getVariant(fish.speciesId, fish.variant);
  return <span className="fishcard-swatch breed-swatch" style={{ background: v.body, borderColor: v.outline }} aria-hidden="true" />;
}

const tankName = (game: GameState, id: string) => game.tanks.find((t) => t.id === id)?.name ?? 'a tank';

/** Ready fish grouped by tank + species (only groups where a pair is possible). */
function readyGroups(game: GameState, now: number): Fish[][] {
  const groups = new Map<string, Fish[]>();
  for (const f of game.fish) {
    if (!isReadyToPair(game, f, now) || compatiblePartners(game, f, now).length === 0) continue;
    const key = `${f.tankId}:${f.speciesId}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups.values()];
}

function PairsTab({ game, now }: { game: GameState; now: number }) {
  const startPairing = useGameStore((s) => s.startPairing);
  const switchTank = useGameStore((s) => s.switchTank);
  const openGuide = useGameStore((s) => s.openGuide);
  const groups = readyGroups(game, now);
  const almost = game.fish.filter((f) => f.stage !== 'baby' && !isCourting(game, f.id) && !isReadyToPair(game, f, now)).slice(0, 8);
  const lonely = game.fish.filter((f) => isReadyToPair(game, f, now) && compatiblePartners(game, f, now).length === 0).slice(0, 4);

  const pairUp = (group: Fish[]) => {
    const [a, b] = group;
    if (!a) return;
    if (a.tankId !== game.activeTankId) switchTank(a.tankId);
    // Exactly two: straight to the confirm sheet. More: pick the partner in the tank.
    if (group.length === 2 && b) startPairing(a.id, b.id);
    else startPairing(a.id);
  };

  return (
    <>
      <h3 className="breed-h">Ready to pair</h3>
      {groups.length === 0 ? (
        <p className="breed-empty">No pairs ready yet. Two happy, well-fed adults of the same species show a 💕.</p>
      ) : (
        <ul className="breed-rows">
          {groups.map((g) => (
            <li key={`${g[0]!.tankId}${g[0]!.speciesId}`} className="breed-row">
              <div className="breed-row-main">
                <strong>{getSpecies(g[0]!.speciesId).name}</strong>
                <span className="breed-names">
                  {g.map((f) => (
                    <span key={f.id}>
                      <Swatch fish={f} /> {f.name}
                    </span>
                  ))}
                </span>
                <small>in {tankName(game, g[0]!.tankId)}</small>
              </div>
              <button type="button" className="breed-pair breed-pair-small" onClick={() => pairUp(g)}>
                Pair up 💕
              </button>
            </li>
          ))}
        </ul>
      )}

      {(almost.length > 0 || lonely.length > 0) && (
        <>
          <h3 className="breed-h">Almost ready</h3>
          <ul className="breed-rows">
            {lonely.map((f) => (
              <li key={f.id} className="breed-row breed-row-soft">
                <Swatch fish={f} />
                <span>
                  <strong>{f.name}</strong> is ready — needs another adult {getSpecies(f.speciesId).name} in {tankName(game, f.tankId)}
                </span>
              </li>
            ))}
            {almost.map((f) => (
              <li key={f.id} className="breed-row breed-row-soft">
                <Swatch fish={f} />
                <span>
                  <strong>{f.name}</strong> · {notReadyReasons(f, now).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {(game.courtships.length > 0 || game.eggs.length > 0) && (
        <>
          <h3 className="breed-h">Love is in the water</h3>
          <ul className="breed-rows">
            {game.courtships.map((c) => {
              const [a, b] = c.fishIds.map((id) => game.fish.find((f) => f.id === id));
              return (
                <li key={c.id} className="breed-row breed-row-soft">
                  <span aria-hidden="true">💞</span>
                  <span>
                    <strong>{a?.name}</strong> & <strong>{b?.name}</strong> courting · egg in <span className="breed-clock">{clock(c.endsAt - now)}</span>
                  </span>
                </li>
              );
            })}
            {game.eggs.map((e) => (
              <li key={e.id} className="breed-row breed-row-soft">
                <span aria-hidden="true">🥚</span>
                <span>
                  {getSpecies(e.speciesId).name} egg in {tankName(game, e.tankId)} · hatches in <span className="breed-clock">{clock(e.hatchAt - now)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="breed-link" onClick={openGuide}>
        📖 How breeding works
      </button>
    </>
  );
}

function NurseryBaby({ baby, game }: { baby: Fish; game: GameState }) {
  const moveFromNursery = useGameStore((s) => s.moveFromNursery);
  const rehomeBaby = useGameStore((s) => s.rehomeBaby);
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="breed-row nursery-row">
      <div className="breed-row-main">
        <span>
          <Swatch fish={baby} /> <strong>{baby.name}</strong> 💤
        </span>
        <small>
          Baby {getSpecies(baby.speciesId).name}
          {baby.shiny ? ' ✨' : ''} · napping
        </small>
      </div>
      <div className="nursery-actions">
        {game.tanks.map((t) => {
          const error = checkMoveFromNursery(game, baby.id, t.id);
          return (
            <button key={t.id} type="button" className="shop-small" disabled={error !== null} onClick={() => moveFromNursery(baby.id, t.id)}>
              🏠 {t.name}
              {error === 'full' ? ' (full)' : error === 'theme' ? ' (wrong theme)' : ''}
            </button>
          );
        })}
        {confirming ? (
          <span className="fishcard-confirm">
            <button type="button" className="shop-small" onClick={() => setConfirming(false)}>
              Keep
            </button>
            <button type="button" className="fishcard-sell" onClick={() => rehomeBaby(baby.id)}>
              Rehome
            </button>
          </span>
        ) : (
          <button type="button" className="shop-small" onClick={() => setConfirming(true)}>
            Rehome +{rehomeValue(baby)} <Icon id="shell" className="icon-inline" />
          </button>
        )}
      </div>
    </li>
  );
}

export function BreedingPanel() {
  const panel = useGameStore((s) => s.panel);
  const tab = useGameStore((s) => s.breedingTab);
  const game = useGameStore((s) => s.game);
  const openPanel = useGameStore((s) => s.openPanel);
  const openBreeding = useGameStore((s) => s.openBreeding);
  const now = useNow(1000);
  if (panel !== 'breeding') return null;

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && openPanel(null)}>
      <section className="shop breed-panel" role="dialog" aria-modal="true" aria-label="Breeding">
        <header className="shop-head">
          <h2>Breeding 💕</h2>
          <button type="button" className="fishcard-close" onClick={() => openPanel(null)} aria-label="Close">
            ✕
          </button>
        </header>
        <nav className="shop-tabs" aria-label="Breeding sections">
          <button type="button" className={`shop-tab${tab === 'pairs' ? ' shop-tab-active' : ''}`} onClick={() => openBreeding('pairs')}>
            💕 Pairs
          </button>
          <button type="button" className={`shop-tab${tab === 'nursery' ? ' shop-tab-active' : ''}`} onClick={() => openBreeding('nursery')}>
            🍼 Nursery{game.nursery.length > 0 ? ` (${game.nursery.length})` : ''}
          </button>
        </nav>
        <div className="shop-body">
          {tab === 'pairs' ? (
            <PairsTab game={game} now={now} />
          ) : game.nursery.length === 0 ? (
            <p className="breed-empty">The Nursery is empty. Babies that hatch into a full tank nap here until there’s room.</p>
          ) : (
            <ul className="breed-rows">
              {game.nursery.map((b) => (
                <NurseryBaby key={b.id} baby={b} game={game} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
