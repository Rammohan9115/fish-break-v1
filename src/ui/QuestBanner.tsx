// "Your first baby" quest: one line saying what to do next (the matching button or fish pulses).
import type { QuestStep } from '../game/breeding';
import { BREEDING_QUEST_REWARD } from '../game/constants';
import { useGameStore } from '../store/gameStore';
import { formatClock } from './format';
import { RichText } from './Icon';
import { Banner } from './kit';
import { useNow, useQuestStep } from './useBreeding';

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
    if (Number.isFinite(next)) countdown = formatClock(next - now);
  }
  return (
    <Banner tone="love" className="quest-banner" sub={<RichText text={`🍼 Your first baby · reward +${BREEDING_QUEST_REWARD.shells} 🐚 +${BREEDING_QUEST_REWARD.pearls} ⚪`} />}>
      {TEXT[quest.step]}
      {countdown && <span className="tabular"> · {countdown}</span>}
    </Banner>
  );
}
