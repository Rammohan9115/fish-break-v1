// Shared hooks for the breeding UI: a ticking `now` for countdowns (format with format.formatClock), and the
// first-baby quest's current step (what to highlight next).
import { useEffect, useState } from 'react';
import { breedingQuestStep, type QuestStep } from '../game/breeding';
import { useGameStore } from '../store/gameStore';

/** Date.now(), refreshed every `ms` (for live countdowns and readiness). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** The quest step to highlight right now, or null. */
export function useQuestStep(): { step: QuestStep; fishId: string | null } | null {
  const game = useGameStore((s) => s.game);
  const selectedFishId = useGameStore((s) => s.quickFishId ?? s.selectedFishId);
  const pairingFishId = useGameStore((s) => s.pairingFishId);
  const sheetOpen = useGameStore((s) => s.pairSheet !== null);
  const now = useNow(2000);
  return breedingQuestStep(game, { selectedFishId, pairingFishId, sheetOpen }, now);
}
