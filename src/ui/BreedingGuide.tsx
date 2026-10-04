// The breeding guide: four swipeable cartoon cards. Shown once when breeding unlocks (or after the
// update for players already past Lv 5), and any time from "How breeding works".
import { useRef, useState, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { FishPreview } from './Preview';

interface Card {
  title: string;
  body: string;
  art: ReactNode;
}

const CARDS: Card[] = [
  {
    title: 'Raise two adults of the same species',
    body: 'Babies grow up when they’re fed and happy. You need two grown-ups of one kind.',
    art: (
      <div className="guide-art guide-duo">
        <FishPreview speciesId="goldfish" variant="classic" />
        <span className="guide-plus">+</span>
        <FishPreview speciesId="goldfish" variant="lemon" />
      </div>
    ),
  },
  {
    title: 'Keep them happy and fed',
    body: 'Feed them, keep the tank clean, add decor. When a fish is ready, a 💕 floats above it.',
    art: (
      <div className="guide-art guide-ready">
        <span className="guide-float">💕</span>
        <FishPreview speciesId="guppy" />
        <span className="guide-chips">
          <span>🍤 fed</span>
          <span>😊 happy</span>
        </span>
      </div>
    ),
  },
  {
    title: 'Tap a fish → Pair up → pick its partner',
    body: 'Its card shows a checklist. When everything is ✅, tap Pair up 💕, then tap the glowing partner.',
    art: (
      <div className="guide-art guide-tap">
        <span className="guide-button">Pair up 💕</span>
        <span className="guide-finger" aria-hidden="true">
          👆
        </span>
      </div>
    ),
  },
  {
    title: 'Wait for the egg to hatch into a baby!',
    body: 'They swim a little love loop, lay an egg, and a few minutes later a baby pops out. Full tank? It naps in the Nursery.',
    art: (
      <div className="guide-art guide-hatch">
        <span>🥚</span>
        <span className="guide-arrow">→</span>
        <span>🐣</span>
      </div>
    ),
  },
];

export function BreedingGuide() {
  const open = useGameStore((s) => s.guideOpen);
  const close = useGameStore((s) => s.closeGuide);
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  /** The card a button scroll is heading to (scroll events in between don't move the dots). */
  const target = useRef<number | null>(null);
  if (!open) return null;

  const go = (i: number) => {
    const el = track.current;
    const next = Math.max(0, Math.min(CARDS.length - 1, i));
    setIndex(next);
    target.current = next;
    el?.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };
  const last = index === CARDS.length - 1;

  return (
    <div className="modal-backdrop">
      <section className="shop guide" role="dialog" aria-modal="true" aria-label="How breeding works">
        <header className="shop-head">
          <h2>How breeding works 💕</h2>
          <button type="button" className="fishcard-close" onClick={close} aria-label="Close guide">
            ✕
          </button>
        </header>
        <div
          className="guide-track"
          ref={track}
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
            if (target.current !== null) {
              if (Math.abs(el.scrollLeft - target.current * el.clientWidth) < 2) target.current = null;
              return;
            }
            if (i !== index) setIndex(i);
          }}
        >
          {CARDS.map((c, i) => (
            <article key={c.title} className="guide-card" aria-hidden={i !== index}>
              {c.art}
              <div className="guide-step">Step {i + 1}</div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
        <div className="guide-foot">
          <div className="guide-dots">
            {CARDS.map((c, i) => (
              <button key={c.title} type="button" className={`guide-dot${i === index ? ' guide-dot-on' : ''}`} onClick={() => go(i)} aria-label={`Step ${i + 1}`} />
            ))}
          </div>
          <div className="guide-buttons">
            {index > 0 && (
              <button type="button" className="shop-small" onClick={() => go(index - 1)}>
                Back
              </button>
            )}
            <button type="button" className="shop-buy" onClick={() => (last ? close() : go(index + 1))}>
              {last ? 'Let’s go! 💕' : 'Next'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
