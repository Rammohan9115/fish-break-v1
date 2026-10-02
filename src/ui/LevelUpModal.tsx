// Celebrates each level-up (one at a time) and lists what just unlocked.
import { useEffect } from 'react';
import { sound } from '../audio/sound';
import { levelUpReward, unlocksAtLevel, type Unlock } from '../game/levels';
import type { DecorId, SpeciesId } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { DecorPreview, FishPreview } from './Preview';

const KIND_ICON: Record<Unlock['kind'], string> = {
  species: '🐟',
  decor: '🪴',
  feature: '✨',
  theme: '🎨',
  tank: '🏠',
};

function UnlockArt({ unlock }: { unlock: Unlock }) {
  if (unlock.kind === 'species') return <FishPreview speciesId={unlock.id as SpeciesId} />;
  if (unlock.kind === 'decor') return <DecorPreview decorId={unlock.id as DecorId} />;
  return <span className="shop-emoji">{KIND_ICON[unlock.kind]}</span>;
}

export function LevelUpModal() {
  const level = useGameStore((s) => s.pendingLevelUps[0]);
  const dismiss = useGameStore((s) => s.dismissLevelUp);
  useEffect(() => {
    if (level !== undefined) sound.play('chime');
  }, [level]);
  if (level === undefined) return null;
  const unlocks = unlocksAtLevel(level);

  return (
    <div className="modal-backdrop levelup-backdrop">
      <section className="levelup" role="dialog" aria-modal="true" aria-labelledby="levelup-title">
        <div className="levelup-burst" aria-hidden="true">
          🎉
        </div>
        <h2 id="levelup-title">Level {level}!</h2>
        <p className="levelup-reward">+{levelUpReward(level)} 🐚</p>
        {unlocks.length > 0 ? (
          <>
            <h3 className="shop-heading">New unlocks</h3>
            <ul className="levelup-unlocks">
              {unlocks.map((u) => (
                <li key={`${u.kind}-${u.id}`}>
                  <UnlockArt unlock={u} />
                  <span>{u.label}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="levelup-none">Keep caring for your fish. More surprises ahead!</p>
        )}
        <button type="button" className="onboarding-next levelup-ok" onClick={dismiss} autoFocus>
          Yay!
        </button>
      </section>
    </div>
  );
}
