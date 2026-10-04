// Shared hooks for the breeding UI: a ticking clock for countdowns, and the first-baby quest's
// current step (what to highlight next).
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
  const selectedFishId = useGameStore((s) => s.selectedFishId);
  const pairingFishId = useGameStore((s) => s.pairingFishId);
  const sheetOpen = useGameStore((s) => s.pairSheet !== null);
  const now = useNow(2000);
  return breedingQuestStep(game, { selectedFishId, pairingFishId, sheetOpen }, now);
}

/** m:ss for countdowns. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
