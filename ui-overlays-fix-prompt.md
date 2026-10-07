Popups, modals, panels, and cards are not well sized on ANY device. On mobile they're too big and
cards need scrolling; on desktop they're also off (oversized/undersized, awkward placement, covering
the tank). Previous fixes were patched screen by screen and keep regressing. Fix this at the SYSTEM
level with one responsive overlay system for all screen sizes, enforced by automated tests. Read
CLAUDE.md (UX Rules, tokens, components) first. Use the Playwright MCP to verify everything visually.
Use plan mode and show me the plan before coding.

TARGET VIEWPORTS (all must pass)
Phones: 360x640, 375x667 (iPhone SE), 390x844, 430x932, landscape 844x390 and 667x375
Tablets: 820x1180 portrait, 1180x820 landscape
Laptops/desktops: 1280x720, 1366x768, 1440x900, 1920x1080, 2560x1440
Browser zoom on desktop: 1366x768 and 1920x1080 at 125%, 150%, and 200% (common Windows display scaling)
Live window resizing on desktop must also reflow correctly, without needing a reload.

STEP 1 — INVENTORY & ROOT CAUSES (report before coding)
- List EVERY overlay: FishCard, quick actions, Shop (all tabs), Try-it preview, Breeding panel, pair
  confirm, breeding guide cards, Nursery, Decorate tray + item toolbar, Tank Style tab, LevelUp, bond
  level-up, Daily gift, Settings, Login/cloud-merge modal, ConfirmDialog, What's new, Feedback, Break
  Mode controls, music widget, coachmarks, tooltips, toasts, and any others you find.
- For each one at each target viewport, measure: size vs viewport, whether it scrolls, whether anything
  is clipped/off-screen, how much of the tank it covers, the smallest tap/click target, and the font
  size. Screenshot to qa/overlays/before/.
- Identify root causes (fixed px sizes, raw 100vh, nested scroll, no max-width on large screens,
  desktop-first or mobile-first only layouts, too much content per card, components not using shared
  primitives). Output a table.

STEP 2 — ONE OVERLAY SYSTEM (src/ui/overlay/)
Rebuild all overlays on four primitives and delete one-off modal styles:
- Sheet (phones, portrait): bottom sheet, full width, with snap points (peek ~40%, half 60%, full 92%).
  Height uses 100dvh minus safe-area insets (with a 100vh fallback; never raw 100vh). Drag handle, swipe
  down to close.
- SidePanel (phone landscape, tablets, AND desktop for big panels): docks right, width
  clamp(320px, 30vw, 440px), full height within safe areas, so the tank stays visible and playable
  beside it. On desktop, the tank area shrinks/shifts so the panel doesn't cover the fish.
  Used for: Shop, My Fish, Breeding panel, Nursery, Settings, Tank Style, What's new.
- Popover (desktop/tablet with a mouse): anchored near the thing clicked, with a smart flip/shift to
  stay on screen and an arrow pointing at the target. Used for: FishCard, quick actions, decor item
  toolbar, tooltips. On phones these become Sheets automatically.
- Dialog (confirmations/celebrations everywhere): centered, width clamp(280px, 92vw, 400px), must ALWAYS
  fit without scrolling. Used for: ConfirmDialog, LevelUp, bond level-up, Daily gift, pair confirm,
  login.
- Auto-pick the variant with a useOverlayVariant hook based on viewport size AND input type
  (pointer: coarse vs fine), with container/media queries. Never pick by user agent.
- Fixed structure for all: sticky Header (title + ✕) → Body (the ONLY scrollable region,
  overscroll-behavior: contain) → sticky Footer (primary actions always visible). No nested scrolling.
  Scroll lock behind modal overlays without layout jump (account for the desktop scrollbar width).
- Only one SidePanel open at a time; opening another replaces it. Dialogs stack above panels. Define a
  z-index layer system in tokens.
- Keyboard-aware on mobile: inputs stay above the on-screen keyboard (visualViewport).

STEP 3 — SIZING, DENSITY & CONTENT DESIGN
- Density modes driven by available space (not device name):
  compact (< 400px wide or < 700px tall), regular, and spacious (≥ 1600px wide). Spacing, type, and
  icon sizes come from tokens per mode, with type via clamp() (body min 14px, labels min 12px; never
  larger than 18px body on huge screens).
- Max widths everywhere: no overlay or card stretches edge to edge on large screens. Content line
  length max ~65 characters.
- HUD and toolbar scale with density: on large desktops they don't become tiny or huge. The toolbar
  stays a centered compact bar with a max width.
- Desktop polish: hover states on all interactive elements, a visible focus ring for keyboard use, a
  pointer cursor on clickables, tooltips on icon-only buttons, Esc to close, and Enter to confirm.
- Fit budget (NO scrolling) at 375x667 AND at 1366x768 @ 150% zoom:
  FishCard, quick actions, all Dialogs, LevelUp, bond level-up, Daily gift, pair confirm, coachmarks,
  breeding guide cards, decor item toolbar.
  Naturally long lists (Shop items, My Fish, Breeding lists, Nursery, Tank Style options, What's new)
  may scroll, but ONLY inside the Body with the header and footer pinned.
- Redesign FishCard for the budget: a compact header row (sprite thumbnail, name, species, stage badge,
  "⋯" menu with Sell) + three tabs (Status / Bond / Breeding). Status = hunger, happiness, and growth
  as slim icon bars. Bond = level badge, progress, sessions left, and a Tricks row. Breeding = the
  compact checklist, with Pair up in the footer.
- Shop: a responsive grid of compact item cards (auto-fill, min card width ~140px, so 2 columns on
  phones and 3–5 on desktop). Item details open in a Dialog. Tabs scroll horizontally when needed.
- Long text → 2 lines + "More". Secondary info goes behind tabs/accordions.
- Toasts: max 1 visible, positioned above the toolbar, never covering an open panel's footer actions;
  on desktop, in the bottom-left corner away from the SidePanel.

STEP 4 — ENFORCE WITH TESTS (so it never regresses)
Add Playwright tests (tests/e2e/overlays.spec.ts) that open EVERY overlay at EVERY target viewport and
zoom level (use window.__fishbowl hooks to create the needed state) and assert:
- The overlay is fully inside the viewport and safe areas.
- Fit-budget overlays: Body scrollHeight <= clientHeight.
- Only the Body scrolls; Header and Footer are visible.
- Interactive elements ≥ 44x44px on touch viewports (≥ 32x32px on fine-pointer desktop) and none
  overlap.
- On desktop, SidePanels leave at least 55% of the tank width visible.
- Font size minimums are met; no truncated text without an ellipsis/More affordance.
- Closing works via ✕, Esc, backdrop click, and swipe down (sheets).
- Resizing from 1440x900 to 390x844 with a panel open switches the variant correctly without breaking.
Add these to `npm run test:e2e` and the definition of done in CLAUDE.md.

STEP 5 — VERIFY
- Re-screenshot every overlay at every viewport into qa/overlays/after/ and write qa/overlays/REPORT.md
  with before/after pairs and a pass/fail grid (overlay × viewport).
- Update the CLAUDE.md UX Rules with: the four primitives and when to use each, the structure, density
  modes, fit budget list, z-index layers, and "every new overlay must be added to overlays.spec.ts".

Don't change game mechanics. Find root causes; don't patch individual symptoms. All tests must pass
before you report done.
