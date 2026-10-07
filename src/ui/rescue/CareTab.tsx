// The "Care 💚" tab on a rescued animal's card: stage, story line, task checklist with "How?" hints, care items.
import { useState, type ReactNode } from 'react';
import { localDateKey } from '../../game/economy';
import { CARE_ITEM_IDS, CARE_ITEMS, activeCase, rescueTrust, stageOpen, taskTarget, taskValue } from '../../game/rescues/engine';
import { getRescue } from '../../game/rescues/registry';
import type { CareTask } from '../../game/rescues/types';
import type { Fish } from '../../game/types';
import { useGameStore } from '../../store/gameStore';
import { Button, ProgressBar } from '../kit';
import { CareIcon } from './CareIcon';

function Item({ task, done, value, onHow, hint, extra }: { task: CareTask; done: boolean; value: number; onHow: () => void; hint: string | null; extra?: ReactNode }) {
  const target = taskTarget(task);
  const counted = task.type === 'useItem' || task.type === 'pet' || task.type === 'ownSpecies' || (task.type === 'placeDecor' && target > 1);
  return (
    <li className={`care-task${done ? ' care-task-done' : ''}`}>
      <span className="care-check" aria-hidden="true">
        {done ? '✅' : '⬜'}
      </span>
      <span className="care-main">
        <span>
          {task.label}
          <span className="sr-only">{done ? ' (done)' : ''}</span>
        </span>
        {!done && counted && <span className="meta">{value}/{target}</span>}
        {!done && task.type === 'keepCleanliness' && (
          <ProgressBar label="Clean time" value={value} max={target} valueText={`${Math.floor(value / 60)}/${task.minutes} min`} />
        )}
        {hint && <span className="meta care-hint">{hint}</span>}
        {extra}
      </span>
      {!done && (
        <Button size="sm" variant="ghost" aria-expanded={hint !== null} onClick={onHow}>
          How?
        </Button>
      )}
    </li>
  );
}

export function CareTab({ fish }: { fish: Fish }) {
  const game = useGameStore((s) => s.game);
  const careItem = useGameStore((s) => s.careItem);
  const selectCareItem = useGameStore((s) => s.selectCareItem);
  const giveCareItem = useGameStore((s) => s.giveCareItem);
  const rescueInteract = useGameStore((s) => s.rescueInteract);
  const setCareHighlight = useGameStore((s) => s.setCareHighlight);
  const clock = useGameStore((s) => s.clock);
  const [how, setHow] = useState<number | null>(null);
  const caseId = fish.rescue?.caseId;
  const def = caseId ? getRescue(caseId) : undefined;
  const c = caseId ? game.rescue.cases[caseId] : undefined;
  if (!def || !c) return null;

  if (c.status === 'done') {
    return (
      <>
        <p className="lead">
          💚 {fish.name} is fully recovered, thanks to you. Dr. Fisher’s letters are in the 📬 Mailbox.
        </p>
      </>
    );
  }
  const today = localDateKey(new Date(clock()));
  const open = stageOpen(c, today);
  const stage = def.stages[c.stage];
  const resting = !open || !stage;
  const active = activeCase(game);
  const doneStages = Math.min(c.stage, def.stages.length);
  return (
    <>
      <p className="care-stage">
        <strong>
          Stage {Math.min(c.stage + (resting && c.stageDoneOn === today ? 0 : 1), def.stages.length)} of {def.stages.length}
        </strong>
        <span className="meta"> · {doneStages} done</span>
      </p>
      {def.trustMeter && <ProgressBar label="Trust" icon="🤍" value={rescueTrust(game, def, c) * 100} max={100} />}
      {resting ? (
        <p className="lead">
          {fish.name} needs a rest. <strong>Next stage tomorrow 🌙</strong>
        </p>
      ) : (
        <>
          <p className="lead">{stage.story}</p>
          <ul className="care-list">
            {stage.tasks.map((t, i) => {
              const done = active ? taskValue(game, def, c, i) >= taskTarget(t) : false;
              return (
                  <Item
                    key={i}
                    task={t}
                    done={done}
                    value={taskValue(game, def, c, i)}
                    hint={how === i ? t.hint : null}
                    extra={
                      t.type === 'interact' && t.button && !done ? (
                        <Button size="sm" variant="primary" onClick={() => rescueInteract(t.actionId, fish.id)}>
                          {t.button}
                        </Button>
                      ) : undefined
                    }
                    onHow={() => {
                      setHow(how === i ? null : i);
                      setCareHighlight(t.highlight && how !== i ? t.highlight : null);
                    }}
                  />
              );
            })}
          </ul>
          <h4>Care items</h4>
          <div className="care-items" role="group" aria-label="Care items">
            {CARE_ITEM_IDS.map((id) => {
              const n = game.rescue.careItems[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`tile care-item${careItem === id ? ' care-item-on' : ''}`}
                  aria-pressed={careItem === id}
                  aria-label={`${CARE_ITEMS[id].name}, ${n} left`}
                  onClick={() => selectCareItem(careItem === id ? null : id)}
                >
                  <CareIcon item={id} />
                  <span className="meta">
                    {CARE_ITEMS[id].name} ×{n}
                  </span>
                </button>
              );
            })}
          </div>
          {careItem ? (
            <Button variant="primary" block onClick={() => giveCareItem(fish.id)}>
              Give {CARE_ITEMS[careItem].name.toLowerCase()} to {fish.name}
            </Button>
          ) : (
            <p className="meta">Pick an item, then tap {fish.name} in the tank (or press the button).</p>
          )}
        </>
      )}
    </>
  );
}
