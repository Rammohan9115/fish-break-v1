Do a full game UI/UX audit and fix pass for Fishbowl Break using established game UX principles.
The game is a cozy, stress-relief break game for working people: it must feel calm, clear, and
satisfying, and never confusing, cluttered, or naggy. Read CLAUDE.md first. Use the Playwright MCP to
run the game and take screenshots on mobile (390x844, 375x667, 844x390 landscape) and desktop
(1440x900). If window.__fishbowl test hooks don't exist yet, add them (dev only) so you can set up
any game state.

WORK IN 4 STAGES, stopping for my approval after each.

==================== STAGE 1: AUDIT (no code changes) ====================
Walk every screen and flow (first launch, onboarding, feeding, FishCard, shop, selling, cleaning, decor
placement, breeding, Nursery, tanks/upgrades, level-up, daily gift, Break Mode, music, settings, login)
and evaluate against these principles:

1. Clarity & hierarchy: is the most important thing on screen the most prominent? Can a new player
   tell what to do next within 3 seconds? Does the HUD show only what matters?
2. Feedback: does EVERY action respond instantly (visual + optional sound)? Look for silent taps,
   delayed responses, and missing success/failure states.
3. Affordance: does tappable stuff look tappable and decorative stuff look decorative? Are locked
   items clearly locked, with the reason?
4. Consistency: the same component, color, icon, wording, and animation for the same meaning
   everywhere (buttons, panels, currency, close buttons, confirm patterns).
5. Progressive disclosure: are features introduced when they unlock, not all at once? Is advanced
   info hidden until needed?
6. Ergonomics (Fitts's law + thumb zone): tap targets ≥ 44px, primary actions within thumb reach on
   mobile, no important controls in the top corners on phones, and enough spacing to prevent mis-taps.
7. Error prevention & recovery: confirms for destructive actions (sell, release, reset), undo where
   cheap (e.g. "Sold Bubbles · Undo" for 5s), and clear messages for "can't afford" or "tank full"
   with a path forward.
8. Readability: font sizes (min 14px body, 12px labels on mobile), contrast against busy
   backgrounds (WCAG AA), number formatting (1,250 / 12.5K), no truncated text.
9. Cognitive load: how many things are animating, badging, or asking for attention at once?
   Calm game = limited simultaneous notifications.
10. Respect & calm: no guilt mechanics, no red alarms for hungry fish, no nagging popups, and
    interruptions only at natural pauses.
11. Reward & pacing: are rewards celebrated proportionally (small = small pop, level-up = big moment)?
    Is it clear what the player is working toward next?
12. Onboarding & help: first-time hints, empty states that teach ("No decor yet — visit the Shop"),
    and help reachable from anywhere.
13. Accessibility: color-blind safety (never color alone; add icons/labels), reduced motion,
    keyboard support on desktop (Esc closes, Enter confirms, focus visible), and aria labels on UI.
14. State visibility: timers, cooldowns, capacity, and sync status visible where relevant without
    opening menus.
15. Performance feel: loading states, no layout shift, no jank when opening panels.

Output UX_AUDIT.md: for each issue, list the screen, principle violated, screenshot path
(qa/ux/), severity (critical/major/minor), and the proposed fix. End with a top-10 priority list.

==================== STAGE 2: DESIGN SYSTEM ====================
Before fixing individual screens, create a small design system so fixes stay consistent:
- src/ui/tokens.ts: colors (with AA-checked text pairs), spacing scale, radii, shadows, font sizes,
  z-index layers, motion durations/easings (and reduced-motion variants).
- Shared components: Button (primary/secondary/danger/icon, with press animation + disabled state
  that explains why), Panel/Sheet (bottom sheet on mobile, centered modal on desktop), CurrencyTag,
  ProgressBar, Badge, Toast, ConfirmDialog, EmptyState, Tooltip/Coachmark, LockedOverlay.
- One consistent close pattern (✕ top-right + tap outside + Esc + swipe down on mobile sheets).
- Migrate all existing screens to these components. No one-off styles.

==================== STAGE 3: FIXES ====================
Fix the audit issues in priority order. Required regardless of audit findings:
- Mobile layout: HUD compact at the top; toolbar in the bottom thumb zone with the 4 most-used
  actions visible and the rest in a "More" sheet; panels as bottom sheets; respect safe areas/notch.
- Contextual actions: tapping a fish shows quick actions (Feed, Pair, Info) near the fish instead of
  only a big card.
- Notification budget: max 1 toast at a time (queue the rest), and merge similar ones
  ("+3 shells" ×4 → "+12 shells").
- "What's next" hint: a small, dismissible goal chip (e.g. "Next: reach Lv 5 to unlock breeding · 40 XP")
  that is always visible but subtle.
- Every disabled button explains why on tap.
- Sell/release/reset get confirm or undo. A "can't afford" state shows how far away you are.
- Mode clarity: when Feed or Clean mode is active, show a clear mode indicator + cursor change +
  an easy exit (tap the mode again or ✕), and auto-exit after 20s idle.
- Color-blind check: hunger/happiness use icons + bars, not just red/green.

==================== STAGE 4: VERIFY & DOCUMENT ====================
- Re-screenshot every screen on all viewports; put before/after pairs in UX_AUDIT.md.
- Add Playwright e2e checks for: tap target sizes ≥ 44px, no element overflowing the viewport, no
  overlapping interactive elements, and modals closable via all close methods.
- Add a "UX Rules" section to CLAUDE.md summarizing the principles, tokens, components, and the
  notification budget, so every future feature follows them automatically.

Don't change game balance or mechanics, only presentation and interaction. Find root causes; don't
patch symptoms.
