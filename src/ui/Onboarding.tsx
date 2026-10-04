// Three gentle tips for new players: Feed → Watch them grow → Collect shells.
// Steps advance automatically when the player does the thing, or via "Got it".
import { useGameStore } from '../store/gameStore';
import { Button, Coachmark } from './kit';

interface StepDef {
  title: string;
  body: string;
  /** Where the bubble sits; 'toolbar' points down at the tools. */
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
    <Coachmark
      title={def.title}
      body={def.body}
      step={step + 1}
      total={STEPS.length}
      anchor={def.anchor}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={skip}>
            Skip tips
          </Button>
          <Button variant="gold" size="sm" onClick={() => complete(step)}>
            {step + 1 < STEPS.length ? 'Got it' : 'Done'}
          </Button>
        </>
      }
    />
  );
}
