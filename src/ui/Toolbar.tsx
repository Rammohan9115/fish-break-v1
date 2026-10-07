// Bottom-right tool dock (spec order). Only a small "Tools" pill shows so the water is free; tap it (or press T)
// to slide the tools out. Picking a tool, tapping the tank or pressing Esc tucks them away again. While Feed/Clean
// is active the pill turns into a mode indicator whose ✕ leaves the mode. The open state is saved in settings.
import { useEffect, useMemo } from 'react';
import { breedingUnlocked } from '../game/breeding';
import { UNLOCK_LEVEL } from '../game/constants';
import { useGameStore, type ToolMode } from '../store/gameStore';
import { localDateKey } from '../game/economy';
import { careAvailable } from '../game/rescues/engine';
import { dailyPending } from '../game/dailyTasks';
import { useNow, useQuestStep } from './useBreeding';
import { Badge, LockedOverlay } from './kit';
import { miniSupport, toggleMini, useMiniTank, VIEW_ONLY_TIP } from '../mini/miniTank';

/** Modes that take over the pill while they are active. */
const MODE_PILL: Partial<Record<ToolMode, { icon: string; label: string }>> = {
  feed: { icon: '🍤', label: 'Feeding' },
  premium: { icon: '🌟', label: 'Feeding' },
  clean: { icon: '🧽', label: 'Cleaning' },
};

interface ToolButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  badge?: number;
  hidden?: boolean;
  /** Shown as locked (still tappable, to say when it unlocks). */
  locked?: boolean;
  /** Level that unlocks it (shown on the lock). */
  lockLevel?: number;
  /** The first-baby quest points here. */
  pulse?: boolean;
  title?: string;
  onClick: () => void;
  onboarding?: string;
}

function ToolButton({ icon, label, active = false, badge, hidden = false, locked = false, lockLevel, pulse = false, title, onClick, onboarding }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`tool${active ? ' tool-active' : ''}${locked ? ' tool-locked' : ''}${pulse ? ' quest-pulse' : ''}`}
      aria-pressed={active}
      title={title}
      tabIndex={hidden ? -1 : undefined}
      onClick={onClick}
      data-onboarding={onboarding}
    >
      <span className="tool-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tool-label">{label}</span>
      {badge !== undefined && (
        <Badge count className="tool-badge">
          {badge}
        </Badge>
      )}
      {locked && lockLevel !== undefined && (
        <span className="tool-lock">
          <LockedOverlay level={lockLevel} compact />
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
  const lastDailyGift = useGameStore((s) => s.game.lastDailyGift);
  const openBreeding = useGameStore((s) => s.openBreeding);
  const toolsOpen = useGameStore((s) => s.game.settings.toolsOpen ?? false);
  const setToolsOpen = useGameStore((s) => s.setToolsOpen);
  const unread = useGameStore((s) => s.game.mail.filter((l) => !l.read).length);
  const tasksLeft = useGameStore((s) => dailyPending(s.game));
  const careDot = useGameStore((s) => careAvailable(s.game, localDateKey(new Date(s.clock()))));
  const highlight = useGameStore((s) => s.careHighlight);
  const setCareHighlight = useGameStore((s) => s.setCareHighlight);
  const openRescue = useGameStore((s) => s.openRescue);
  const quest = useQuestStep();
  const now = useNow(60_000);
  const questTool = quest?.step === 'getPair' ? 'shop' : quest?.step === 'makeReady' ? 'feed' : null;

  const modePill = MODE_PILL[mode];
  // An active Feed/Clean mode keeps the tray shut so the tank is free.
  const open = toolsOpen && !modePill;
  const giftReady = onboardingStep !== 0 && lastDailyGift !== localDateKey(new Date(now));
  const showDot = !open && !modePill && (giftReady || nurseryCount > 0 || unread > 0);

  // The first tip points at the Feed button, so show the tools while it's up.
  useEffect(() => {
    if (onboardingStep === 0) setToolsOpen(true);
  }, [onboardingStep, setToolsOpen]);

  // Entering a mode (from anywhere) tucks the tray away, so leaving it doesn't pop the tray back open.
  useEffect(() => {
    if (modePill) setToolsOpen(false);
  }, [modePill, setToolsOpen]);

  // On phones a fish/decor card is a bottom sheet over the dock: opening the tools puts the card away first.
  const selectFish = useGameStore((s) => s.selectFish);
  useEffect(() => {
    if (open && window.matchMedia('(max-width: 640px)').matches) selectFish(null);
  }, [open, selectFish]);

  // Tapping the empty tank closes the tray; T toggles it (Esc is handled with the other dismissals in App).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (open && e.target instanceof Element && e.target.closest('canvas')) setToolsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 't' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      const st = useGameStore.getState();
      if (st.breakSession) return;
      st.setToolsOpen(!(st.game.settings.toolsOpen ?? false));
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setToolsOpen]);

  const miniAvailable = useMemo(() => miniSupport() !== null, []);
  const miniOpen = useMiniTank((s) => s.kind !== null);

  // A "How?" pointer fades on its own.
  useEffect(() => {
    if (!highlight) return;
    const t = window.setTimeout(() => setCareHighlight(null), 8000);
    return () => window.clearTimeout(t);
  }, [highlight, setCareHighlight]);

  const pick = (action: () => void) => {
    action();
    setToolsOpen(false);
  };
  const toggle = (target: ToolMode) => pick(() => setMode(mode === target ? 'look' : target));
  const togglePanel = (target: 'shop' | 'tanks' | 'break') => pick(() => openPanel(panel === target ? null : target, target === 'shop' ? 'fish' : undefined));

  return (
    <nav className={`toolbar dock ${open ? 'dock-open' : 'dock-closed'}`} aria-label="Tools">
      <div className="dock-tools" id="dock-tools" aria-hidden={!open}>
        <ToolButton icon="🍤" label="Feed" active={mode === 'feed'} hidden={!open} pulse={questTool === 'feed'} onClick={() => toggle('feed')} onboarding="feed" />
        <ToolButton icon="🌟" label="Premium" active={mode === 'premium'} badge={premiumFood} hidden={!open} onClick={() => toggle('premium')} />
        <ToolButton icon="🧽" label="Clean" active={mode === 'clean'} hidden={!open} pulse={highlight === 'clean'} onClick={() => toggle('clean')} />
        <ToolButton icon="🎨" label="Decorate" active={mode === 'decorate'} hidden={!open} pulse={highlight === 'decorate'} onClick={() => toggle('decorate')} />
        <ToolButton icon="🛒" label="Shop" active={panel === 'shop'} hidden={!open} pulse={questTool === 'shop'} onClick={() => togglePanel('shop')} />
        <ToolButton
          icon="💕"
          label="Breed"
          active={panel === 'breeding'}
          badge={nurseryCount > 0 ? nurseryCount : undefined}
          hidden={!open}
          locked={!breedingOpen}
          lockLevel={UNLOCK_LEVEL.breeding}
          onClick={() =>
            pick(() => (breedingOpen ? (panel === 'breeding' ? openPanel(null) : openBreeding()) : addToast(`💕 Breeding unlocks at Lv ${UNLOCK_LEVEL.breeding}`)))
          }
        />
        <ToolButton icon="🐟" label="My Fish" active={panel === 'myfish'} hidden={!open} onClick={() => pick(() => openPanel(panel === 'myfish' ? null : 'myfish'))} />
        <ToolButton icon="🩺" label="Rescue" active={panel === 'rescue'} hidden={!open} onClick={() => pick(() => (panel === 'rescue' ? openPanel(null) : openRescue(null)))} />
        <ToolButton icon="📬" label="Mail" active={panel === 'mail'} badge={unread > 0 ? unread : undefined} hidden={!open} onClick={() => pick(() => openPanel(panel === 'mail' ? null : 'mail'))} />
        <ToolButton icon="📋" label="Tasks" active={panel === 'tasks'} badge={tasksLeft > 0 ? tasksLeft : undefined} hidden={!open} onClick={() => pick(() => openPanel(panel === 'tasks' ? null : 'tasks'))} />
        <ToolButton icon="🏠" label="Tanks" active={panel === 'tanks'} hidden={!open} onClick={() => togglePanel('tanks')} />
        <ToolButton icon="☕" label="Break" active={panel === 'break'} hidden={!open} onClick={() => togglePanel('break')} />
        {miniAvailable && <ToolButton icon="🪟" label="Mini Tank" title={miniSupport() === 'video' ? VIEW_ONLY_TIP : undefined} active={miniOpen} hidden={!open} onClick={() => pick(toggleMini)} />}
      </div>
      {modePill ? (
        <button type="button" className="dock-pill dock-pill-mode" aria-label={`Stop ${modePill.label.toLowerCase()}`} onClick={() => setMode('look')}>
          <span aria-hidden="true">{modePill.icon}</span> {modePill.label} <span aria-hidden="true">✕</span>
        </button>
      ) : (
        <button
          type="button"
          className={`dock-pill${!open && questTool ? ' quest-pulse' : ''}`}
          aria-expanded={open}
          aria-controls="dock-tools"
          aria-label={open ? 'Hide tools' : 'Show tools'}
          onClick={() => setToolsOpen(!open)}
        >
          <span className="dock-arrow" aria-hidden="true">
            ◀
          </span>
          <span>Tools</span>
          {showDot && <span className="dock-dot" aria-hidden="true" />}
          {!open && !modePill && careDot && <span className="dock-care" role="img" aria-label="A care task is waiting">💚</span>}
        </button>
      )}
    </nav>
  );
}
