// Three gentle tooltip bubbles for new players: Feed → Watch them grow → Collect shells.
// Steps advance automatically when the player does the thing, or via "Got it".
import { useGameStore } from '../store/gameStore';

interface StepDef {
  title: string;
  body: string;
  /** Where the bubble sits; 'toolbar' points down at the Feed button. */
  anchor: 'toolbar' | 'center' | 'sand';
}

const STEPS: StepDef[] = [
  { title: 'Feed 🍤', body: 'Tap Feed, then tap the water to drop a pellet. Your fish will swim over for a snack!', anchor: 'toolbar' },
  { title: 'Watch them grow 🌱', body: 'Fed, happy fish grow up over time. Tap a fish to see how it’s doing.', anchor: 'center' },
  { title: 'Collect shells 🐚', body: 'Grown-up fish drop shells on the sand. Tap them to collect, then spend them in the shop.', anchor: 'sand' },
];

export function Onboarding() {
  const step = useGameStore((s) => s.onboardingStep);
  const complete = useGameStore((s) => s.completeOnboardingStep);
  const skip = useGameStore((s) => s.skipOnboarding);
  if (step === null) return null;
  const def = STEPS[step];
  if (!def) return null;

  return (
    <div className={`onboarding onboarding-${def.anchor}`} role="dialog" aria-label="Tip">
      <div className="onboarding-progress">
        Tip {step + 1} of {STEPS.length}
      </div>
      <strong className="onboarding-title">{def.title}</strong>
      <p className="onboarding-body">{def.body}</p>
      <div className="onboarding-actions">
        <button type="button" className="onboarding-skip" onClick={skip}>
          Skip tips
        </button>
        <button type="button" className="onboarding-next" onClick={() => complete(step)}>
          {step + 1 < STEPS.length ? 'Got it' : 'Done'}
        </button>
      </div>
    </div>
  );
}
