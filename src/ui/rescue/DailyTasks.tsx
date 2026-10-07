// Today's 3 tasks: progress, rewards, one free reroll, and the weekly chest progress. No streaks.
import { ensureDaily, taskLabel, WEEKLY_CHEST } from '../../game/dailyTasks';
import { CARE_ITEMS } from '../../game/rescues/engine';
import { useGameStore } from '../../store/gameStore';
import { Button, ProgressBar, Sheet } from '../kit';
import { CareIcon } from './CareIcon';

export function DailyTasks() {
  const panel = useGameStore((s) => s.panel);
  const game = useGameStore((s) => s.game);
  const openPanel = useGameStore((s) => s.openPanel);
  const rerollTask = useGameStore((s) => s.rerollTask);
  const clock = useGameStore((s) => s.clock);
  if (panel !== 'tasks') return null;
  const today = ensureDaily(game, clock()).daily;
  const days = today.fullDays.length;
  return (
    <Sheet title="📋 Daily tasks" onClose={() => openPanel(null)} className="tasks" size="md">
      <ul className="task-list">
        {today.tasks.map((t) => (
          <li className={`tile task${t.done ? ' task-done' : ''}`} key={t.id}>
            <span className="task-main">
              <strong>
                {t.done ? '✓ ' : ''}
                {taskLabel(t)}
              </strong>
              {t.care ? <span className="meta">💚 Care task · can’t be rerolled</span> : null}
              {!t.care && !t.done && <ProgressBar value={t.progress} max={t.target} label="Progress" valueText={`${t.progress}/${t.target}`} />}
              <span className="meta task-reward">
                +{t.reward.shells} 🐚{t.reward.pearls ? ` +${t.reward.pearls} ⚪` : ''}
                {t.reward.item ? (
                  <>
                    {' '}
                    +1 <CareIcon item={t.reward.item} size={18} /> {CARE_ITEMS[t.reward.item].name}
                  </>
                ) : null}
              </span>
            </span>
            {!t.care && !t.done && (
              <Button size="sm" variant="ghost" disabledReason={today.rerolled ? 'You used today’s free reroll.' : null} onClick={() => rerollTask(t.id)}>
                🎲 Reroll
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="lead">
        All three today: +30 🐚. Weekly chest 🎁: finish all tasks on {WEEKLY_CHEST.days} of the last {WEEKLY_CHEST.window} days. <strong>{days}/{WEEKLY_CHEST.days}</strong> so far. Miss a day and nothing is lost.
      </p>
    </Sheet>
  );
}
