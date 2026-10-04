// The one slot under the HUD. Priority: the active tool mode (with ✕ and a 20s idle exit) > the
// "Your first baby" quest step > the "What's next" goal (dismissible until the next level).
// Pairing mode has its own banner, so this slot stays empty then.
import { useEffect, useState } from 'react';
import { BREEDING_QUEST_REWARD, GOAL_DISMISSED_KEY, MODE_IDLE_EXIT_MS, SECOND_MS } from '../game/constants';
import type { QuestStep } from '../game/breeding';
import { nextUnlock, xpToNext } from '../game/levels';
import { useGameStore } from '../store/gameStore';
import { formatClock, formatCount } from './format';
import { RichText } from './Icon';
import { Banner } from './kit';
import { useNow, useQuestStep } from './useBreeding';

const QUEST_TEXT: Record<QuestStep, string> = {
  getPair: 'Raise two adults of the same species — buy a buddy in the Shop 🛒',
  makeReady: 'Feed 🍤 and clean 🧽 until a 💕 floats above them',
  tapFish: 'Tap a fish with a 💕 above it',
  pairUp: 'Tap Pair 💕',
  pickPartner: 'Tap the glowing partner',
  confirm: 'Tap Start courtship 💕',
  wait: 'Love is in the water — your egg is on its way',
};

/** Feed / Premium / Clean: what to do, how to stop, and a quiet exit after 20s without a tap. */
function ModeBanner() {
  const mode = useGameStore((s) => s.mode);
  const setMode = useGameStore((s) => s.setMode);
  const premiumLeft = useGameStore((s) => s.game.inventory.premiumFood);
  const algae = useGameStore((s) => s.game.tanks.find((t) => t.id === s.game.activeTankId)?.algaeSpots.length ?? 0);

  useEffect(() => {
    if (mode === 'look') return undefined;
    const id = window.setInterval(() => {
      const s = useGameStore.getState();
      if (s.mode !== 'look' && Date.now() - s.modeTouchedAt > MODE_IDLE_EXIT_MS) s.setMode('look');
    }, SECOND_MS);
    return () => window.clearInterval(id);
  }, [mode]);

  if (mode === 'look') return null;
  const exit = () => setMode('look');
  if (mode === 'clean') {
    return (
      <Banner onClose={exit} closeLabel="Stop cleaning" sub={algae > 0 ? `${algae} spot${algae === 1 ? '' : 's'} left · tap 🧽 again or ✕ to stop` : 'All clean ✨'}>
        🧽 Cleaning: drag over the green spots
      </Banner>
    );
  }
  return (
    <Banner onClose={exit} closeLabel="Stop feeding" sub={mode === 'premium' ? `${premiumLeft} premium left · ✕ to stop` : 'Tap the tool again or ✕ to stop'}>
      {mode === 'premium' ? '🌟 Premium food: tap the water' : '🍤 Feeding: tap the water to drop a pellet'}
    </Banner>
  );
}

function readDismissed(): number | null {
  try {
    const v = localStorage.getItem(GOAL_DISMISSED_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

/** "Next: Lv 5 unlocks Breeding · 40 XP to go". Dismissed per level. */
function GoalChip() {
  const level = useGameStore((s) => s.game.level);
  const xp = useGameStore((s) => s.game.xp);
  const [dismissedAt, setDismissedAt] = useState(readDismissed);
  const next = nextUnlock(level);
  if (!next || dismissedAt === level) return null;
  const first = next.unlocks[0];
  if (!first) return null;
  const what = first.label.replace(/\s*\(.*\)$/, '');
  const toGo = formatCount(Math.max(0, xpToNext(level) - xp));
  const sub = next.level === level + 1 ? `${toGo} XP to go` : `Lv ${level + 1} in ${toGo} XP`;
  const dismiss = () => {
    setDismissedAt(level);
    try {
      localStorage.setItem(GOAL_DISMISSED_KEY, String(level));
    } catch {
      // Not critical.
    }
  };
  return (
    <Banner className="goal-chip" onClose={dismiss} closeLabel="Hide goal" sub={sub}>
      ⭐ Next: Lv {next.level} unlocks {what}
    </Banner>
  );
}

function QuestChip({ step }: { step: QuestStep }) {
  const game = useGameStore((s) => s.game);
  const now = useNow(1000);
  let countdown: string | null = null;
  if (step === 'wait') {
    const next = Math.min(...game.courtships.map((c) => c.endsAt), ...game.eggs.map((e) => e.hatchAt));
    if (Number.isFinite(next)) countdown = formatClock(next - now);
  }
  return (
    <Banner tone="love" sub={<RichText text={`🍼 Your first baby · reward +${BREEDING_QUEST_REWARD.shells} 🐚 +${BREEDING_QUEST_REWARD.pearls} ⚪`} />}>
      {QUEST_TEXT[step]}
      {countdown && <span className="tabular"> · {countdown}</span>}
    </Banner>
  );
}

export function TopChip() {
  const mode = useGameStore((s) => s.mode);
  const busy = useGameStore((s) => s.panel !== null || s.pairingFishId !== null || s.pairSheet !== null || s.onboardingStep === 0);
  const quest = useQuestStep();
  if (mode !== 'look') return <ModeBanner />;
  if (busy) return null;
  if (quest) return <QuestChip step={quest.step} />;
  return <GoalChip />;
}
