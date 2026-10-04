// Once per local calendar day a gift box bobs in the tank; clicking pops it open with the rewards.
// No streaks: missing a day costs nothing.
import { useEffect, useState } from 'react';
import { GIFT_BOX_POSITION, GIFT_DAY_CHECK_MS, GIFT_REVEAL_MS, XP } from '../game/constants';
import { localDateKey, type DailyGiftContents } from '../game/economy';
import { sound } from '../audio/sound';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';
import { Badge } from './kit';

function GiftBoxArt({ open }: { open: boolean }) {
  return (
    <svg className="gift-art" viewBox="0 0 64 64" aria-hidden="true">
      {/* box */}
      <rect x="10" y="28" width="44" height="30" rx="5" fill="#ffc2d6" stroke="#d9708f" strokeWidth="2.5" />
      <rect x="28" y="28" width="8" height="30" fill="#fff2a8" stroke="#d9a520" strokeWidth="2" />
      {/* lid + bow (flies off when open) */}
      <g className={open ? 'gift-lid gift-lid-open' : 'gift-lid'}>
        <rect x="6" y="19" width="52" height="11" rx="4" fill="#ffd3e0" stroke="#d9708f" strokeWidth="2.5" />
        <rect x="28" y="19" width="8" height="11" fill="#fff2a8" stroke="#d9a520" strokeWidth="2" />
        <path d="M32 19 C 22 6, 12 12, 22 19 Z" fill="#fff2a8" stroke="#d9a520" strokeWidth="2" strokeLinejoin="round" />
        <path d="M32 19 C 42 6, 52 12, 42 19 Z" fill="#fff2a8" stroke="#d9a520" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="32" cy="18" r="3.5" fill="#ffe066" stroke="#d9a520" strokeWidth="2" />
      </g>
      {/* little shine */}
      <ellipse cx="18" cy="36" rx="3" ry="5" fill="#ffffff" opacity="0.6" />
    </svg>
  );
}

function Reveal({ gift }: { gift: DailyGiftContents }) {
  return (
    <div className="gift-reveal" role="status">
      <strong>🎁 Daily gift!</strong>
      <span>
        +{gift.shells} <Icon id="shell" className="icon-inline" /> shells
      </span>
      <span>+{gift.premiumFood} 🌟 premium food</span>
      {gift.pearls > 0 && (
        <span className="gift-pearl">
          +{gift.pearls} <Icon id="pearl" className="icon-inline" /> pearl!
        </span>
      )}
      <Badge tone="gold">+{XP.dailyGift} XP</Badge>
      <small>See you tomorrow ✨</small>
    </div>
  );
}

export function DailyGift() {
  const loaded = useGameStore((s) => s.loaded);
  const lastDailyGift = useGameStore((s) => s.game.lastDailyGift);
  const claimDailyGift = useGameStore((s) => s.claimDailyGift);
  const [today, setToday] = useState(() => localDateKey(new Date()));
  const [reveal, setReveal] = useState<DailyGiftContents | null>(null);

  // Notice midnight so a new gift appears for players who leave the tab open.
  useEffect(() => {
    const handle = window.setInterval(() => setToday(localDateKey(new Date())), GIFT_DAY_CHECK_MS);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    if (!reveal) return;
    const handle = window.setTimeout(() => setReveal(null), GIFT_REVEAL_MS);
    return () => window.clearTimeout(handle);
  }, [reveal]);

  // Wait until the first tip is done, and stay out of Break Mode (everything hides there).
  const quiet = useGameStore((s) => s.onboardingStep === 0 || s.breakSession !== null);
  const available = loaded && lastDailyGift !== today;
  if (quiet || (!available && !reveal)) return null;

  const style = { left: `${GIFT_BOX_POSITION.x * 100}%`, top: `${GIFT_BOX_POSITION.y * 100}%` };
  return (
    <div className="gift" style={style}>
      {reveal ? (
        <>
          <div className="gift-box gift-box-open">
            <GiftBoxArt open />
          </div>
          <Reveal gift={reveal} />
        </>
      ) : (
        <button type="button" className="gift-box gift-bob" aria-label="Open your daily gift" onClick={() => {
            const gift = claimDailyGift();
            if (gift) sound.play('coin');
            setReveal(gift);
          }}>
          <GiftBoxArt open={false} />
          <span className="gift-hint">Tap me!</span>
        </button>
      )}
    </div>
  );
}
