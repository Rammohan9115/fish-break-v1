// Pairing mode banner: "Pick a partner for Bubbles 💕" with a ✕ to cancel. The tank does the rest
// (it dims, compatible fish glow and bob, tapping one opens the confirm sheet).
import { useGameStore } from '../store/gameStore';
import { Banner } from './kit';

export function PairingBanner() {
  const fish = useGameStore((s) => s.game.fish.find((f) => f.id === s.pairingFishId) ?? null);
  const cancel = useGameStore((s) => s.cancelPairing);
  if (!fish) return null;
  return (
    <Banner tone="love" onClose={cancel} closeLabel="Cancel pairing" sub="Tap a glowing fish · tap the water to cancel">
      Pick a partner for {fish.name} 💕
    </Banner>
  );
}
