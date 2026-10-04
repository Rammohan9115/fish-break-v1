# Fishbowl Break: UX Audit (Stage 1)

**Date:** 2026-10-04 · **Build:** `main` @ a1b8792 (+ dev-only `window.__fishbowl` test hook in `src/main.tsx`)

**Method.** Headless Chrome via puppeteer-core (the Playwright MCP isn't connected in this session), driven by
`window.__fishbowl.store` to set up each state. Four viewports: phone 390×844 (`m390`), small phone 375×667 (`m375`),
phone landscape 844×390 (`land`), desktop 1440×900 (`desk`). That gives 39 states per viewport, 156 screenshots in `qa/ux/before/`,
named `<viewport>-<nn>-<state>.png`. A DOM sweep measured every interactive element's box and every text node's font size
(`qa/ux/before/report.json`). WCAG contrast was computed from the CSS colors.

Severity: **critical** = blocks or misleads a player, or breaks a design pillar · **major** = noticeable friction on a common path ·
**minor** = polish.

---

## 1. Global chrome: HUD, tool dock, toasts

| ID | Screen | Principle | Screenshot | Sev | Issue | Proposed fix |
|---|---|---|---|---|---|---|
| G1 | Tool dock (all) | 6 Ergonomics, 1 Clarity | `m390-03-idle`, `m390-04-dock-open` | **critical** | Every action sits behind one "Tools" handle, so Feed (the core verb) takes 2 taps and is invisible at rest. Opened, the dock is 9 buttons, each **34×52px** on 390 and **32×52** on 375 (below 44px wide), with labels at **9px** (8.5px landscape). | A bottom bar that's always visible, with the 4 most-used actions (Feed, Clean, Shop, Breed/My Fish), each ≥ 56px, labels ≥ 12px. The rest (Premium, Tanks, Break, My Fish) go in a **More** bottom sheet. Desktop keeps a single labeled row. |
| G2 | Tool dock | 2 Feedback, 14 State | `m390-05-feed-mode`, `m390-11-clean-mode` | **critical** | The only sign of Feed or Clean mode is the collapsed handle swapping its icon to 🍤/🧽. There's no banner or ✕, and nothing explains how to leave. Modes never time out, so a later tap on the water still drops a pellet. | A mode pill at the top of the thumb zone ("🍤 Feeding: tap the water · ✕"), a mode-specific cursor, tapping the tool again exits, and auto-exit after 20s idle. |
| G3 | HUD | 6 Ergonomics | `m390-03-idle` | **major** | Mute, fullscreen and settings are **30×30px** round buttons in the top-left corner of phones (hard to reach, easy to miss). | Move fullscreen and mute into Settings (mute stays one tap via a Settings toggle plus the HUD on desktop). On phones keep one ⚙️ button ≥ 44px. |
| G4 | HUD | 8 Readability | `m390-07-midgame` | **major** | XP text is **10px** on phones. "40 / 588" doesn't say what it's for or what comes next. | XP label ≥ 12px. Pair it with the "What's next" goal chip (see N1). |
| G5 | HUD tank tag | 3 Affordance | `m390-03-idle` | minor | The purple tag ("🐟 2/10" + fish icon) opens Tanks but doesn't look like a button. On phones the tank name is dropped, so the tag is just a number. | Give it the shared icon-button style and add a chevron (`›`). |
| G6 | HUD Upgrade chip | 6 Ergonomics, 10 Calm | `m390-33-tank-full` | minor | The "⬆️ Upgrade" chip is 88×**30**px. A full tank turns the counter pink/red (an alarm color). | Height ≥ 44. Use a neutral "full" style (amber + 🏠 icon), not red. |
| G7 | Toasts | 9 Cognitive load | `m390-27-toasts` | **major** | Up to 3 toasts stack at once, and identical ones aren't merged (`+5 🐚` twice). They sit mid-screen over the sand and fish. | Show one toast at a time and queue the rest. Merge same-kind toasts within 1.5s ("+5 🐚" ×4 → "+20 🐚"). Fixed position above the toolbar. |
| G8 | First launch | 9 Cognitive load, 12 Onboarding | `m390-01-first-launch`, `m375-01-first-launch` | **critical** | On the first screen the onboarding tip, the "Drag the water to look around" toast, the open dock and the bobbing gift all compete. **The pan-tip toast covers the tip's "Got it" button** on 390 and 375. | One interruption at a time: delay the pan tip until onboarding finishes, and hide the gift until tip 1 is done. Toasts never overlap the coachmark (shared layer and z-index tokens). |
| G9 | Dev panel | 4 Consistency | `m390-01-first-launch` | **major** | The "🛠 Dev" button ships to production (`DEV_TOOLS_IN_PRODUCTION = true`). It overlaps the onboarding tip and toasts at bottom-left. | Set it to `false`, or put it behind `?dev`. It must never appear for players. |
| G10 | "My Fish" | 2 Feedback, 3 Affordance | `m390-04-dock-open` | **major** | It's a full-size toolbar button that only toasts "coming soon" (a dead end). | Hide it until it's built (out of scope here), or ship a minimal fish list. **Recommend hiding it** (no new mechanics). |
| G11 | Locked Breed tool | 3 Affordance | `m390-04-dock-open` | minor | The 🔒 badge overlaps the label ("Breed" becomes "Bree🔒"). Tapping shows a toast; fine, but it's easy to miss. | Use a LockedOverlay component that shows the lock and "Lv 5" under the icon. |

## 2. FishCard & selling

| ID | Screen | Principle | Screenshot | Sev | Issue | Proposed fix |
|---|---|---|---|---|---|---|
| F1 | FishCard | 1 Hierarchy, 6 Ergonomics | `m390-08-fishcard`, `m375-08-fishcard` | **major** | The card covers ~60% of the phone screen and must scroll on 375. Tapping a fish always opens the big card, even for a quick feed. | Tapping a fish shows **quick actions** next to it (Feed · Pair 💕 · Info). Info opens the card as a bottom sheet. |
| F2 | FishCard meters | 13 A11y (color-blind) | `m390-08-fishcard` | **major** | Hunger and happiness bars differ only by color (orange/pink) and a tiny label. There's no icon or state word. | Icon + bar + word: 🍤 Hunger "Full", 😊 Happy "Happy" / "Sad". |
| F3 | FishCard breeding list | 1 Clarity, 9 Load | `m390-08b-fishcard-scrolled` | minor | ✅ lines repeat themselves ("Well fed · Well fed", "Rested · Rested"). The section takes ~40% of the card even when it's all done. | Show hints only on ❌ lines. When every line is ✅, collapse to "Ready to pair 💕". |
| F4 | FishCard (baby) | 10 Calm | `m390-10-fishcard-baby` | minor | Red ❌ marks on a baby read as failures, though "still growing" is normal. | Use neutral ⏳/○ for not-yet, with the hint text. Save the warning color for actionable items. |
| F5 | Sell | 7 Error recovery | `m390-09-sell-confirm` | **major** | The inline confirm is small: "Keep" and "Sell" are 28px pills right next to each other, and there's no undo. | Use a ConfirmDialog (sheet) that shows the price, plus a 5s **"Sold Bubbles · Undo"** toast. |
| F6 | FishCard name | 3 Affordance | `m390-08-fishcard` | minor | The name is an input styled as plain text, with no ✏️ hint. The field is 30px tall. | Show a pencil icon on hover/focus and make the target ≥ 44px. |
| F7 | FishCard close | 6, 4 Consistency | all | **major** | ✕ buttons are **28×28** everywhere. Tapping outside or swiping down doesn't close the FishCard or DecorCard (only Esc and ✕ do). | One close pattern: a 44px ✕, tap outside, Esc, and swipe down on sheets. |
| F8 | FishCard (landscape) | 15 Layout | `land-08-fishcard` | **major** | In 844×390 the card is taller than the screen. Its ✕ and name end up off-screen (the DOM sweep flagged `Close` and `Fish name` as offscreen). | A height-capped, scrollable sheet with a sticky header. |

## 3. Shop, economy, decor

| ID | Screen | Principle | Screenshot | Sev | Issue | Proposed fix |
|---|---|---|---|---|---|---|
| S1 | Shop tabs | 6, 8 | `m390-13-shop-fish` | **major** | On phones the 4th tab is cut off ("🏠 Ta…" overflows) and tab hit areas are **18–22px** tall. | Equal-width segmented tabs, ≥ 44px, labels that wrap or are icon-over-text. |
| S2 | Shop can't afford | 7, 11 | `m390-14-shop-cant-afford` | **major** | "Need more shells" doesn't say how many, so there's no path forward. The text wraps to 2 lines in the button. | "Need 20 more 🐚", with a tiny progress bar toward the price. |
| S3 | Shop fish note | 8 Formatting | `land-14-shop-cant-afford` | **critical** | **The Jelly shows "Grows in 1.66666666666667h"** (raw float). | A shared `formatDuration` (`1h 40m`), used everywhere times appear. |
| S4 | Shop item text | 8 Readability | `m390-13-shop-fish` | minor | The species note is **11px** `#7a8b9b` on white (**3.5:1**, fails AA). | ≥ 12px, using a text token checked to ≥ 4.5:1. |
| S5 | Locked items | 8 Contrast | `m390-13-shop-fish` | minor | "Unlocks at Lv 8" is `#6f7c8c` on grey (3.9:1), and the item is faded. | A LockedOverlay with an AA-checked label. |
| S6 | Shop layout | 4 Consistency, 15 | `m390-13-shop-food` vs `-fish` | **major** | Panel height and position jump between tabs (Food is a short card halfway down, Fish fills the screen). Scroll position carries over between tabs (`land-14`). | Panels become bottom sheets with a fixed height on mobile. Reset scroll when the tab changes. |
| S7 | Decor sell-back | 7 Error prevention | `m390-12-decorcard`, `m390-13-shop-decor` | **major** | "Sell back" in the DecorCard and the "In this tank" list sells at once, with no confirm or undo. | Undo toast (5s), the same pattern as F5. |
| S8 | Decor tab | 12 Empty state | `m390-13-shop-decor` | minor | No empty state for "In this tank". Placement ("drag along the sand") is only explained after selecting an item. | Empty state "No decor yet — pick one above". After buying: a coachmark "Drag it along the sand". |
| S9 | Buy feedback | 2 Feedback | (code) `Shop.tsx` | minor | A successful purchase plays a coin sound only (muted by default), so there's no visible success state. | Button press animation plus a "✓ Added to My Tank" toast (merged by the budget). |

## 4. Modes: feeding, cleaning, decor placement

| ID | Screen | Principle | Screenshot | Sev | Issue | Proposed fix |
|---|---|---|---|---|---|---|
| M1 | Feed / Premium | 2, 14 | `m390-05-feed-mode` | **critical** | See G2. Also, Premium mode silently falls back to Feed when food runs out (only a toast). | A mode pill shows "🌟 Premium ×2 left". |
| M2 | Clean | 2, 12 | `m390-11-clean-mode` | **major** | In Clean mode the cursor is a sponge on desktop, but phones get no change and no hint to drag. A "Sparkling clean" toast fires when there's nothing to wipe, yet the mode still turns on. | The mode pill reads "🧽 Drag over green spots". If there's no algae, show the toast and don't enter the mode. |
| M3 | Decor drag | 3 Affordance | `m390-12-decorcard` | minor | There's no visual handle on the decor itself. The hint lives only in the card. | A ↔ hint chip above the selected decor. |

## 5. Breeding, Nursery, Quest

| ID | Screen | Principle | Screenshot | Sev | Issue | Proposed fix |
|---|---|---|---|---|---|---|
| B1 | Quest banner | 6, 9 | `m390-20-quest-ready`, `m390-22-fishcard-breeding` | **major** | The quest banner sits at the top center and **collides with the HUD icon row** on 390/375. It stays up during most flows, alongside toasts and pairing hints. | Merge it into the "What's next" goal chip (one slot, one message). |
| B2 | Pairing banner | 6 | `m390-23-pairing-mode` | minor | It overlaps the ⚙️ button, and its ✕ sits in the top area. | Put it in the shared mode-pill slot (the same place as Feed/Clean) with a 44px ✕. |
| B3 | Pair sheet odds | 8 Layout | `m390-24-pair-sheet` | minor | The baby-color grid misaligns (the 3rd row's % floats under the 2nd column). | A single-column list: swatch · name · %. |
| B4 | Nursery | 6, 7 | `m390-26-nursery` | minor | Move/Rehome pills are ~28px tall, and the Rehome confirm is inline and tiny. | Shared Button (secondary) plus ConfirmDialog for Rehome. |
| B5 | Breeding guide | 13 Keyboard | `m390-19-breeding-guide` | minor | No arrow-key navigation, and Enter doesn't advance. | ←/→ and Enter move through the cards. |

## 6. Rewards & pacing

| ID | Screen | Principle | Screenshot | Sev | Issue | Proposed fix |
|---|---|---|---|---|---|---|
| R1 | Daily gift | 9, 10 | `m390-31-break-active`, `m390-32-break-end` | **critical** | **The gift reveal card renders on top of Break Mode** (it lives inside TankView, so it isn't hidden). It overlaps the breathing text and the end dialog, which breaks "all UI hidden". | Render DailyGift with the other overlays (hidden on break), or hide it while a break is active. |
| R2 | Daily gift | 9 | `m390-01-first-launch` | minor | On first launch the gift competes with onboarding (see G8). | Gift appears after tip 1. |
| R3 | Level-up | 11 | `m390-18-levelup` | minor | Good proportional moment. Missing: what to aim for next. | Add a "Next: Lv 6 unlocks Neon Tetra" footer. |
| R4 | No goal | 11 Pacing | all | **major** | Nothing on screen says what the player is working toward. | The "What's next" goal chip (N1). |
| R5 | Shell collect | 2 | (code) | minor | Coin pop + HUD bump: good. A burst of "+N" toasts (auto-collect, offline) is unmerged (G7). | Toast merge. |

## 7. Settings, login, Break Mode

| ID | Screen | Principle | Screenshot | Sev | Issue | Proposed fix |
|---|---|---|---|---|---|---|
| T1 | Settings | 12, 13 | `m390-16-settings` | **major** | No sound toggle, no **reduced-motion toggle** (`settings.reducedMotion` exists but nothing sets it), and no "How to play" or help link. "Reset game" is a tiny 26px pill. | Sections: Sound (mute), Motion (reduce), Help (replay tips, How breeding works), Account, Danger zone (Reset, full-size danger button). |
| T2 | Reset confirm | 7 | `m390-16b-settings-reset` | minor | The inline confirm uses two equal pills, so "Yes, reset" isn't visually dangerous enough and isn't separated. | ConfirmDialog, danger variant, with focus on "Keep playing". |
| T3 | Login (landscape) | 15 | `land-17-login` | **major** | The sheet is taller than 390px, so "Maybe later" and the privacy link are cut off with no visible scroll cue. | Height-capped sheet with an internal scroll (shared Sheet). |
| T4 | Break setup | 4 | `m390-30-break-setup` | minor | Duration chips reuse shop-tab styling, and the checkbox is a native 16px box. | Segmented control + toggle components. |
| T5 | Break active | 9 | `m390-31-break-active` | minor | The breathing text has low contrast over bright water (it's faint white). | Soft dark pill behind the text. |

## 8. Cross-cutting

| ID | Area | Principle | Evidence | Sev | Issue | Proposed fix |
|---|---|---|---|---|---|---|
| X1 | Styles | 4 Consistency | `styles.css`: 3,218 lines, **320 hex literals**, 15 ad-hoc z-indexes | **major** | There are 5+ button looks (`shop-buy`, `shop-small`, `fishcard-sell`, `breed-pair`, `onboarding-next`, `tool`) and 3 close-button sizes. | Stage 2 design system (tokens + shared components). |
| X2 | Focus | 13 A11y | only 3 `:focus-visible` rules | **major** | Most buttons show no keyboard focus ring. Modals don't trap focus or return it on close. | A global focus-visible ring token. Sheet/Dialog trap and restore focus. |
| X3 | Keyboard | 13 | `App.tsx` | minor | Esc works, but Enter doesn't confirm dialogs, and there are no shortcuts for modes. | Enter = primary action in a ConfirmDialog. Optional desktop shortcuts F/C. |
| X4 | Contrast | 8 | computed | **major** | Several secondary text colors fail AA 4.5:1: `#8a96a3` on cream **2.9** (onboarding "Skip tips"), `#c48a00` on white **3.0** (shiny label), `#7a8b9b` **3.5**, `#6f8293` **4.0**, `#8a7a99` **3.9** (quest reward), `#3f8a5f` on pink **3.8** (✅ hints). | Text tokens `--text-muted` ≥ 4.5:1 on every surface they're used on. |
| X5 | Number formatting | 8 | `Shop.tsx:97` | **critical** (with S3) | No shared formatter. HUD shows "12,450" (good), but there's no compact form for big values and durations are raw. | `format.ts`: `formatCount` (1,250 / 12.5K), `formatDuration`. |
| X6 | Safe areas | 6 | CSS | minor | The HUD and dock use `env(safe-area-inset-*)` already. Panels (`.modal-backdrop`) don't. | The Sheet component pads by the safe-area insets. |
| X7 | Disabled reasons | 7 | `Shop.tsx` (`disabled`) | **major** | Native `disabled` buttons swallow taps, so a player tapping "Need more shells" gets nothing. FishCard "Move to" disabled reasons are only in a `title` tooltip (invisible on touch). | Button `disabledReason` prop: the button stays focusable, and a tap shakes it and shows the reason. |

---

## Top-10 priority list

1. **G1 + G2 + M1: thumb-zone toolbar and mode clarity.** Keep 4 primary tools always visible (≥ 56px) with a More sheet. Add a mode pill with ✕, tap-again-to-exit and a 20s idle auto-exit. This fixes the core loop's 2-tap feed and invisible modes.
2. **R1: the gift reveal leaks into Break Mode.** This breaks the "all UI hidden" promise. It's a one-line fix once overlays share a layer.
3. **S3 / X5: raw float "1.66666666666667h" in the Shop.** Add a shared `formatDuration`/`formatCount`.
4. **G8 + G9: the first-launch pile-up.** The pan-tip toast covers the tip's "Got it", and the Dev button ships to players. Fix with one interruption at a time and dev tools off in prod.
5. **G7: notification budget.** One toast at a time, merged duplicates, a fixed slot above the toolbar.
6. **F5 + S7 + T2 + X7: error prevention.** ConfirmDialog/Undo for sell, decor sell-back, rehome and reset. Disabled buttons explain why on tap. "Need 20 more 🐚".
7. **F1 + F7 + F8: FishCard.** Quick actions near the fish. The card becomes a capped bottom sheet. One close pattern (44px ✕, outside, Esc, swipe down).
8. **R4 + B1: the "What's next" goal chip.** It replaces the colliding quest banner and gives players a reason to come back.
9. **X1 + X4 + G3/G4/S1: design system and readability.** Tokens with AA-checked text pairs, ≥ 44px targets, ≥ 12px labels, and shop tabs that fit at 375px.
10. **T1 + F2 + X2: accessibility.** Reduced-motion and sound toggles in Settings, icon+word meters for color-blind players, focus-visible ring with focus trap/restore.

## Notes for Stage 2–3
- No mechanics or balance change is needed for any item above. Hiding "My Fish" (G10) removes an unbuilt button and adds nothing.
- The screenshot script lives in the session scratchpad. It'll move into `e2e/` with the Playwright checks in Stage 4.
