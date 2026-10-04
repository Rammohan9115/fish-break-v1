// Pairing mode banner: "Pick a partner for Bubbles 💕" with a ✕ to cancel. The tank does the rest
// (it dims, compatible fish glow and bob, tapping one opens the confirm sheet).
import { useGameStore } from '../store/gameStore';

export function PairingBanner() {
  const fish = useGameStore((s) => s.game.fish.find((f) => f.id === s.pairingFishId) ?? null);
  const cancel = useGameStore((s) => s.cancelPairing);
  if (!fish) return null;
  return (
    <div className="pair-banner" role="status">
      <span>
        Pick a partner for <strong>{fish.name}</strong> 💕
      </span>
      <small>Tap a glowing fish · tap the water to cancel</small>
      <button type="button" className="pair-banner-x" onClick={cancel} aria-label="Cancel pairing">
        ✕
      </button>
    </div>
  );
}
