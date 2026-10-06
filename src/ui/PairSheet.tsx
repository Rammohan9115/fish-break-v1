// Confirm sheet for a chosen pair: both fish, the possible baby colors with their chances, the shiny
// chance and hatch time, and a gentle (non-blocking) warning when the tank is full.
import { babyColorOdds, hatchMinutes, shinyChance } from '../game/breeding';
import { BREEDING } from '../game/constants';
import { tankHasRoom } from '../game/sim';
import { getSpecies, getVariant } from '../game/species';
import { currentRenderer } from '../render/renderer';
import { useGameStore } from '../store/gameStore';
import { FishPreview } from './Preview';
import { useQuestStep } from './useBreeding';
import { Badge, Button, Sheet } from './kit';

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function PairSheet() {
  const sheet = useGameStore((s) => s.pairSheet);
  const game = useGameStore((s) => s.game);
  const cancel = useGameStore((s) => s.cancelPairing);
  const confirm = useGameStore((s) => s.confirmCourtship);
  const quest = useQuestStep();
  if (!sheet) return null;
  const a = game.fish.find((f) => f.id === sheet.aId);
  const b = game.fish.find((f) => f.id === sheet.bId);
  if (!a || !b) return null;
  const species = getSpecies(a.speciesId);
  const tank = game.tanks.find((t) => t.id === a.tankId);
  const full = tank ? !tankHasRoom(game, tank, a.speciesId) : false;
  const odds = babyColorOdds(a, b);
  const shiny = shinyChance(a, b);
  const mins = hatchMinutes(a.speciesId);

  return (
    <Sheet kind="dialog"
      title="A perfect match? 💕"
      size="sm"
      onClose={cancel}
      footer={
        <Button variant="love" size="lg" block pulse={quest?.step === 'confirm'} data-autofocus onClick={() => confirm(currentRenderer()?.pairSpot(a.id, b.id))}>
          Start courtship 💕
        </Button>
      }
    >
      <div className="pair-duo">
        {[a, b].map((f, i) => (
          <div key={f.id} className="pair-fish">
            <FishPreview speciesId={f.speciesId} variant={f.variant} />
            <strong>{f.name}</strong>
            <span className="meta">
              {getVariant(f.speciesId, f.variant).name}
              {f.shiny ? ' ✨' : ''}
            </span>
            {i === 0 && (
              <span className="pair-heart" aria-hidden="true">
                💕
              </span>
            )}
          </div>
        ))}
      </div>
      <h3 className="section-title">Baby colors</h3>
      <ul className="pair-odds">
        {odds.map((o) => {
          const v = getVariant(a.speciesId, o.variant);
          return (
            <li key={o.variant}>
              <span className="pair-swatch" style={{ background: v.body, borderColor: v.outline }} aria-hidden="true" />
              <span>{v.name}</span>
              <strong>{pct(o.chance)}</strong>
            </li>
          );
        })}
      </ul>
      <div className="pair-facts">
        <Badge tone="gold">✨ Shiny chance {pct(shiny)}</Badge>
        <Badge tone="brand">
          🥚 Hatches {mins} min after a {BREEDING.courtshipMs / 1000}s courtship
        </Badge>
      </div>
      {full && <div className="note-warn">🏠 {tank?.name} is full — the {species.name} baby will nap in the Nursery until there’s room.</div>}
    </Sheet>
  );
}
