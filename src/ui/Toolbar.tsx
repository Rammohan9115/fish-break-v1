// Bottom-right tool dock (spec order). It stays tucked behind a single handle button so the water is free;
// tap the handle (or swipe left/up on it) to slide the tools out, and picking a tool tucks them away again.
// Unbuilt features show a "coming soon" toast.
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { breedingUnlocked } from '../game/breeding';
import { UNLOCK_LEVEL } from '../game/constants';
import { useGameStore, type ToolMode } from '../store/gameStore';
import { useQuestStep } from './useBreeding';

/** How far (px) a drag must travel to count as a swipe. */
const SWIPE_PX = 30;

const MODE_ICONS: Partial<Record<ToolMode, { icon: string; label: string }>> = {
  feed: { icon: '🍤', label: 'Feed' },
  premium: { icon: '🌟', label: 'Premium' },
  clean: { icon: '🧽', label: 'Clean' },
};

interface ToolButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  badge?: number;
  hidden?: boolean;
  /** Shown as locked (still tappable, to say when it unlocks). */
  locked?: boolean;
  /** The first-baby quest points here. */
  pulse?: boolean;
  onClick: () => void;
  onboarding?: string;
}

function ToolButton({ icon, label, active = false, badge, hidden = false, locked = false, pulse = false, onClick, onboarding }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`tool${active ? ' tool-active' : ''}${locked ? ' tool-locked' : ''}${pulse ? ' quest-pulse' : ''}`}
      aria-pressed={active}
      tabIndex={hidden ? -1 : undefined}
      onClick={onClick}
      data-onboarding={onboarding}
    >
      <span className="tool-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tool-label">{label}</span>
      {badge !== undefined && <span className="tool-badge">{badge}</span>}
      {locked && (
        <span className="tool-lock" aria-label="locked">
          🔒
        </span>
      )}
    </button>
  );
}

export function Toolbar() {
  const mode = useGameStore((s) => s.mode);
  const premiumFood = useGameStore((s) => s.game.inventory.premiumFood);
  const setMode = useGameStore((s) => s.setMode);
  const addToast = useGameStore((s) => s.addToast);
  const panel = useGameStore((s) => s.panel);
  const openPanel = useGameStore((s) => s.openPanel);
  const onboardingStep = useGameStore((s) => s.onboardingStep);
  const breedingOpen = useGameStore((s) => breedingUnlocked(s.game));
  const nurseryCount = useGameStore((s) => s.game.nursery.length);
  const openBreeding = useGameStore((s) => s.openBreeding);
  const quest = useQuestStep();
  const questTool = quest?.step === 'getPair' ? 'shop' : quest?.step === 'makeReady' ? 'feed' : null;
  const [open, setOpen] = useState(onboardingStep === 0);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  // The first tip points at the Feed button, so show the tools while it's up.
  useEffect(() => {
    if (onboardingStep === 0) setOpen(true);
  }, [onboardingStep]);

  const pick = (action: () => void) => {
    action();
    setOpen(false);
  };
  const toggle = (target: ToolMode) => pick(() => setMode(mode === target ? 'look' : target));
  const togglePanel = (target: 'shop' | 'tanks' | 'break') => pick(() => openPanel(panel === target ? null : target, target === 'shop' ? 'fish' : undefined));
  const soon = (icon: string, label: string) => pick(() => addToast(`${icon} ${label}: coming soon!`));

  const onPointerDown = (e: ReactPointerEvent) => {
    swipeStart.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    swiped.current = true;
    // Left/up pulls the tools out; right/down tucks them away.
    setOpen(Math.abs(dx) > Math.abs(dy) ? dx < 0 : dy < 0);
  };
  // A swipe that ends on a button shouldn't also press it.
  const onClickCapture = (e: ReactMouseEvent) => {
    if (!swiped.current) return;
    swiped.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const activeMode = MODE_ICONS[mode];
  const handleIcon = open ? '✖️' : (activeMode?.icon ?? '🧰');
  const handleLabel = open ? 'Hide' : (activeMode?.label ?? 'Tools');

  return (
    <nav
      className={`toolbar dock ${open ? 'dock-open' : 'dock-closed'}`}
      aria-label="Tools"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipeStart.current = null)}
      onClickCapture={onClickCapture}
    >
      <div className="dock-tools" id="dock-tools" aria-hidden={!open}>
        <ToolButton icon="🍤" label="Feed" active={mode === 'feed'} hidden={!open} pulse={questTool === 'feed'} onClick={() => toggle('feed')} onboarding="feed" />
        <ToolButton icon="🌟" label="Premium" active={mode === 'premium'} badge={premiumFood} hidden={!open} onClick={() => toggle('premium')} />
        <ToolButton icon="🧽" label="Clean" active={mode === 'clean'} hidden={!open} onClick={() => toggle('clean')} />
        <ToolButton icon="🛒" label="Shop" active={panel === 'shop'} hidden={!open} pulse={questTool === 'shop'} onClick={() => togglePanel('shop')} />
        <ToolButton
          icon="💕"
          label="Breed"
          active={panel === 'breeding'}
          badge={nurseryCount > 0 ? nurseryCount : undefined}
          hidden={!open}
          locked={!breedingOpen}
          onClick={() =>
            pick(() => (breedingOpen ? (panel === 'breeding' ? openPanel(null) : openBreeding()) : addToast(`💕 Breeding unlocks at Lv ${UNLOCK_LEVEL.breeding}`)))
          }
        />
        <ToolButton icon="🐟" label="My Fish" hidden={!open} onClick={() => soon('🐟', 'My Fish')} />
        <ToolButton icon="🏠" label="Tanks" active={panel === 'tanks'} hidden={!open} onClick={() => togglePanel('tanks')} />
        <ToolButton icon="☕" label="Break" active={panel === 'break'} hidden={!open} onClick={() => togglePanel('break')} />
      </div>
      <button
        type="button"
        className={`tool dock-handle${!open && activeMode ? ' tool-active' : ''}${!open && questTool ? ' quest-pulse' : ''}`}
        aria-expanded={open}
        aria-controls="dock-tools"
        aria-label={open ? 'Hide tools' : 'Show tools'}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="tool-icon" aria-hidden="true">
          {handleIcon}
        </span>
        <span className="tool-label">{handleLabel}</span>
      </button>
    </nav>
  );
}
