// The Rescue Board: every case as a card; tap one for the case file (Dr. Fisher's letter, what care involves, Take / Resume).
import { useState } from 'react';
import { caseStatus, pausingOther, type CaseStatus } from '../../game/rescues/engine';
import { getRescue, RESCUES } from '../../game/rescues/registry';
import type { RescueDef } from '../../game/rescues/types';
import { getSpecies, getVariant } from '../../game/species';
import { useGameStore } from '../../store/gameStore';
import { FishPreview } from '../Preview';
import { Badge, Button, ConfirmDialog, Sheet } from '../kit';
import { DrFisher } from './CareIcon';

const STATUS_LABEL: Record<CaseStatus, string> = { available: 'Available', active: 'In care 💚', paused: 'Paused ⏸', done: 'Rescued ✅' };

function useStatus(def: RescueDef) {
  const game = useGameStore((s) => s.game);
  const status = caseStatus(game, def.id);
  const c = game.rescue.cases[def.id];
  const stage = c ? Math.min(c.stage, def.stages.length) : 0;
  return { status, stage, game };
}

function CaseCard({ def, onOpen }: { def: RescueDef; onOpen: () => void }) {
  const { status, stage } = useStatus(def);
  const done = status === 'done';
  return (
    <button type="button" className={`tile rescue-card rescue-${status}`} onClick={onOpen} aria-label={`${def.name}: ${def.title}. ${STATUS_LABEL[status]}`}>
      <span className={`rescue-sprite${status === 'available' ? ' rescue-dim' : ''}`}>
        <FishPreview speciesId={def.speciesId} variant="red" />
      </span>
      <strong>
        {def.name} <span className="meta">— {def.title}</span>
      </strong>
      <span className="meta rescue-summary">{def.summary}</span>
      <span className="rescue-row">
        <Badge tone={status === 'done' ? 'good' : status === 'available' ? 'neutral' : 'love'}>
          {STATUS_LABEL[status]}
          {status === 'active' || status === 'paused' ? ` · ${stage}/${def.stages.length}` : ''}
        </Badge>
        <span className="meta">~{def.estDays} days</span>
      </span>
      <span className="rescue-reward" aria-label={done ? `Reward: ${getVariant(def.speciesId, def.rewards.variant ?? 'default').name}` : 'Reward: a secret variant'}>
        <span className={done ? '' : 'rescue-silhouette'}>
          <FishPreview speciesId={def.speciesId} variant={def.rewards.variant ?? 'default'} />
        </span>
        <span className="meta">{done ? getVariant(def.speciesId, def.rewards.variant ?? 'default').name : '?'}</span>
      </span>
    </button>
  );
}

function CaseFile({ def, onBack }: { def: RescueDef; onBack: () => void }) {
  const { status, stage, game } = useStatus(def);
  const takeRescue = useGameStore((s) => s.takeRescue);
  const selectFish = useGameStore((s) => s.selectFish);
  const openPanel = useGameStore((s) => s.openPanel);
  const [confirm, setConfirm] = useState(false);
  const other = pausingOther(game, def.id) ? getRescue(game.rescue.activeId!) : undefined;
  const letters = game.mail.filter((l) => l.caseId === def.id).reverse();
  const go = () => {
    setConfirm(false);
    takeRescue(def.id);
  };
  const act = () => (other ? setConfirm(true) : go());
  const fishId = game.rescue.cases[def.id]?.fishId;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← All cases
      </Button>
      <div className="rescue-file">
        <DrFisher size={72} />
        <div>
          <h3>
            {def.name} <span className="meta">— {def.title}</span>
          </h3>
          <p className="meta">
            {getSpecies(def.speciesId).name} · ~{def.estDays} days · {STATUS_LABEL[status]}
            {status === 'active' || status === 'paused' ? ` · stage ${stage}/${def.stages.length}` : ''}
          </p>
        </div>
      </div>
      <div className="letter">
        <strong>{def.intro.title}</strong>
        <p>{def.intro.body}</p>
      </div>
      <p className="lead">
        <strong>Care involves:</strong> {def.careNote} One stage a day, a few minutes each. Skip days whenever you like. Nothing is ever lost.
      </p>
      {status === 'done' && letters.length > 1 && (
        <>
          <h4>Letters</h4>
          {letters.map((l) => (
            <div className="letter" key={l.id}>
              <strong>{l.title}</strong>
              <p>{l.body}</p>
            </div>
          ))}
        </>
      )}
      {status === 'available' && (
        <Button variant="primary" block onClick={act}>
          Take this rescue 💚
        </Button>
      )}
      {status === 'paused' && (
        <Button variant="primary" block onClick={act}>
          {other ? 'Switch to this rescue' : 'Resume 💚'}
        </Button>
      )}
      {status === 'active' && fishId && (
        <Button
          variant="primary"
          block
          onClick={() => {
            openPanel(null);
            selectFish(fishId);
          }}
        >
          Open {def.name}’s Care tab 💚
        </Button>
      )}
      {status === 'available' && other && <p className="meta">You’re caring for {other.name}. Taking this one pauses him; his progress is kept.</p>}
      {confirm && other && (
        <ConfirmDialog
          title={`Switch to ${def.name}?`}
          body={
            <p>
              {other.name} will go back to Dr. Fisher’s center while you help {def.name}. He keeps all his progress, and comes back when you resume him.
            </p>
          }
          confirmLabel="Switch"
          cancelLabel="Not now"
          onCancel={() => setConfirm(false)}
          onConfirm={go}
        />
      )}
    </>
  );
}

export function RescueBoard() {
  const panel = useGameStore((s) => s.panel);
  const caseId = useGameStore((s) => s.rescueCaseId);
  const openRescue = useGameStore((s) => s.openRescue);
  const openPanel = useGameStore((s) => s.openPanel);
  if (panel !== 'rescue') return null;
  const def = caseId ? getRescue(caseId) : undefined;
  return (
    <Sheet title="🩺 Rescue Center" onClose={() => openPanel(null)} className="rescue-board" scrollKey={caseId ?? 'board'}>
      {def ? (
        <CaseFile def={def} onBack={() => openRescue(null)} />
      ) : (
        <>
          <p className="lead">Dr. Fisher’s rescue cases. Pick one, help them heal, and they’re yours.</p>
          <div className="rescue-grid">
            {RESCUES.map((r) => (
              <CaseCard key={r.id} def={r} onOpen={() => openRescue(r.id)} />
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
