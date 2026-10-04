// "Your first baby" quest: one line saying what to do next (the matching button or fish pulses).
import type { QuestStep } from '../game/breeding';
import { BREEDING_QUEST_REWARD } from '../game/constants';
import { useGameStore } from '../store/gameStore';
import { clock, useNow, useQuestStep } from './useBreeding';

const TEXT: Record<QuestStep, string> = {
  getPair: 'Raise two adults of the same species — buy a buddy in the Shop 🛒',
  makeReady: 'Feed 🍤 and clean 🧽 until a 💕 floats above them',
  tapFish: 'Tap a fish with a 💕 above it',
  pairUp: 'Tap Pair up 💕',
  pickPartner: 'Tap the glowing partner',
  confirm: 'Tap Start courtship 💕',
  wait: 'Love is in the water — your egg is on its way',
};

export function QuestBanner() {
  const quest = useQuestStep();
  const game = useGameStore((s) => s.game);
  const panel = useGameStore((s) => s.panel);
  const pairing = useGameStore((s) => s.pairingFishId !== null || s.pairSheet !== null);
  const now = useNow(1000);
  // The pairing banner and confirm sheet already say what to do.
  if (!quest || panel !== null || pairing) return null;
  let countdown: string | null = null;
  if (quest.step === 'wait') {
    const next = Math.min(...game.courtships.map((c) => c.endsAt), ...game.eggs.map((e) => e.hatchAt));
    if (Number.isFinite(next)) countdown = clock(next - now);
  }
  return (
    <div className="quest-banner" role="status">
      <span className="quest-title">🍼 Your first baby</span>
      <span>
        {TEXT[quest.step]}
        {countdown && <span className="breed-clock"> · {countdown}</span>}
      </span>
      <small>
        Reward: +{BREEDING_QUEST_REWARD.shells} 🐚 +{BREEDING_QUEST_REWARD.pearls} ⚪
      </small>
    </div>
  );
}
