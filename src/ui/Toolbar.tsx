// Bottom toolbar: big rounded emoji buttons (spec order). Unbuilt features show a "coming soon" toast.
import { useGameStore, type ToolMode } from '../store/gameStore';

interface ToolButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
  onboarding?: string;
}

function ToolButton({ icon, label, active = false, badge, onClick, onboarding }: ToolButtonProps) {
  return (
    <button type="button" className={`tool${active ? ' tool-active' : ''}`} aria-pressed={active} onClick={onClick} data-onboarding={onboarding}>
      <span className="tool-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tool-label">{label}</span>
      {badge !== undefined && <span className="tool-badge">{badge}</span>}
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

  const toggle = (target: ToolMode) => setMode(mode === target ? 'look' : target);
  const soon = (icon: string, label: string) => addToast(`${icon} ${label}: coming soon!`);

  return (
    <nav className="toolbar" aria-label="Tools">
      <ToolButton icon="🍤" label="Feed" active={mode === 'feed'} onClick={() => toggle('feed')} onboarding="feed" />
      <ToolButton icon="🌟" label="Premium" active={mode === 'premium'} badge={premiumFood} onClick={() => toggle('premium')} />
      <ToolButton icon="🧽" label="Clean" active={mode === 'clean'} onClick={() => toggle('clean')} />
      <ToolButton icon="🛒" label="Shop" active={panel === 'shop'} onClick={() => openPanel(panel === 'shop' ? null : 'shop', 'fish')} />
      <ToolButton icon="🐟" label="My Fish" onClick={() => soon('🐟', 'My Fish')} />
      <ToolButton icon="🏠" label="Tanks" active={panel === 'tanks'} onClick={() => openPanel(panel === 'tanks' ? null : 'tanks')} />
      <ToolButton icon="☕" label="Break" active={panel === 'break'} onClick={() => openPanel(panel === 'break' ? null : 'break')} />
    </nav>
  );
}
