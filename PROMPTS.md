# Fishbowl Break — Claude Code Build Guide

## 0. One-time setup
```bash
# Node 20+ required
npm install -g @anthropic-ai/claude-code
mkdir fishbowl-break && cd fishbowl-break
git init
# Put CLAUDE.md in this folder (project root)
claude
```

**Token-saving workflow for every phase:**
1. Run `/clear` before starting each phase. CLAUDE.md is auto-loaded, so context isn't lost.
2. Press **Shift+Tab** to enter plan mode, paste the prompt, review the plan, then approve.
3. When it's done, test it yourself using the "Done when" list.
4. Commit: `git add -A && git commit -m "phase X"`

---

## Phase 1 — Scaffold
```
Read CLAUDE.md. Scaffold the project: Vite + React + TypeScript (strict), Zustand, Vitest.
Create the full folder structure from the spec with empty/stub files.
Fully implement src/game/types.ts, constants.ts, species.ts, levels.ts, and names.ts exactly
per the spec tables (all species, decor, unlock levels, XP formula, starting state).
App.tsx should render a placeholder full-viewport tank div and an empty HUD.
Add npm scripts: dev, build, test. No gameplay yet.
```
**Done when:** `npm run dev` shows a page, and `npm run build` and `npm test` pass.

## Phase 2 — Simulation core
```
Implement src/game/sim.ts per CLAUDE.md: a pure tick(state, dtMs, rng) covering hunger,
happiness drift, growth with happiness multiplier and the hunger<20 stop, stage transitions,
cleanliness decay, algae spawning thresholds, pellet dissolving, and adult shell/pearl drops
with the 10-drop cap. Add simulateOffline(state, now) capped at 8h in 60s steps that
returns a summary. Add createInitialState(). Write thorough Vitest tests for every rule.
No rendering.
```
**Done when:** all tests pass and cover each rule in the spec.

## Phase 3 — Store + game loop
```
Implement src/store/gameStore.ts (Zustand) holding GameState with actions: dropPellet,
eatPellet, collectDrop, wipeAlgae, renameFish. Run a 1-second fixed tick calling sim.tick.
Implement save.ts: versioned localStorage save every 10s, on visibilitychange, and on
beforeunload, with corrupt-save backup, migrations map, and offline catch-up on load
with a "While you were away" summary. Wire the HUD to show level, XP bar, shells, pearls.
```
**Done when:** the HUD shows real numbers, a refresh keeps state, and the offline summary appears after closing the tab for a few minutes.

## Phase 4 — Tank renderer + fish
```
Implement src/render per CLAUDE.md art direction: canvas sized to the tank with devicePixelRatio
handling, gradient water, light rays, sand with pebbles, bubbler with rising bubbles.
Implement drawFish.ts with a distinct cute cartoon shape for EVERY species (round bodies,
big eyes with highlight, blinking, outlines, variant palettes, shiny sparkle). Scale by stage.
Implement behavior.ts: steering-based wander, flipping to face direction, sine tail wobble,
species speeds, edge avoidance, axolotl near bottom, tetra schooling, sad/hungry indicators.
Fish positions live only in the renderer. Respect prefers-reduced-motion.
Add a temporary dev panel (only in dev mode) to spawn any species/stage so I can preview all art.
```
**Done when:** every species looks distinct and cute and swims smoothly at 60fps.

## Phase 5 — Feeding + interaction
```
Build Toolbar.tsx with all buttons from the spec (unbuilt features can show "coming soon").
Implement Feed mode: click drops a pellet (rate-limited), pellets sink and land on sand,
fish with hunger<95 chase the nearest pellet and eat it within 8px (call store.eatPellet).
Premium food button uses inventory and applies the growth boost.
Clicking a fish opens FishCard.tsx with editable name, species, stage, hunger/happiness bars,
and growth progress. Add Toasts.tsx and the 3-step onboarding tooltips for new players.
```
**Done when:** you can feed fish, watch them chase food, and see stats update in the card.

## Phase 6 — Economy + levels
```
Implement src/game/economy.ts and the Shop.tsx with Fish/Food/Decor/Tanks tabs.
Locked items show greyed out with "Unlocks at Lv X". Buying a fish adds a baby
(capacity checked). Selling from FishCard follows the spec (juvenile 40%, babies can't sell).
Shell drops render on the sand with a coin-pop animation on click. Implement all XP sources
including the hourly feeding XP cap, level-ups with shell rewards, and LevelUpModal.tsx
listing what just unlocked. Add tests for economy and leveling.
```
**Done when:** the full loop works: feed → grow → collect → buy → level up.

## Phase 7 — Cleaning + daily gift
```
Implement Clean mode: sponge cursor, drag across algae spots to wipe them with a sparkle
effect, giving cleanliness and XP per the spec. Algae spots render as soft green blobs on the glass.
Implement DailyGift.tsx: a gift box bobs in the tank once per local day and pops open on
click with the spec rewards. No streaks.
```
**Done when:** wiping algae feels satisfying and the gift only appears once per day.

## Phase 8 — Breeding
```
Implement src/game/breeding.ts per CLAUDE.md (5-min checks, eligibility, 25% chance,
cooldowns, eggs counting toward capacity, hatch timing, variant inheritance, shiny odds,
pearl reward). Eggs render on the sand with a little wobble before hatching.
Show a floating heart between the pair when an egg is laid, plus a toast on hatch.
FishCard shows "Ready to breed 💕" when eligible. Write tests for all breeding rules.
```
**Done when:** two happy adults produce eggs that hatch into babies.

## Phase 9 — Decor, themes, multiple tanks
```
Implement decor per the spec: buy from the shop, drag horizontally on the sand to place,
max 8 per tank, sell back for 50%, happiness bonus. Draw every decor item in cartoon style
(the chest opens and puffs bubbles). Implement tank themes (classic, night, coral, pond)
with palette changes and species restrictions (clownfish = coral, koi = pond).
Implement capacity upgrades and 2nd/3rd tank purchases with TankSwitcher.tsx.
Fish can be moved between tanks from FishCard.
```
**Done when:** you can decorate, switch themes, and manage multiple tanks.

## Phase 10 — Break Mode + sound
```
Implement BreakMode.tsx per the spec: fullscreen tank, UI hidden, circular timer (3/5/10 min),
optional breathing guide, end message, +10 XP once per hour, Esc to exit.
Implement src/audio/sound.ts with Web Audio synthesized sounds: soft bubble ambience,
pellet plop, coin pop, level-up chime, wipe squeak. Muted by default; the mute toggle is saved.
```
**Done when:** Break Mode feels calm, and sounds are subtle and never play until unmuted.

## Phase 11 — Polish + balance
```
Do a polish pass: mobile responsiveness down to 360px, toolbar wraps, touch support for
feeding/cleaning/dragging decor, smooth modal/toast animations, empty states, and a settings
menu with Reset game (confirmation). Remove the dev panel from production builds.
Then write a balance simulation script (scripts/balance.ts) that simulates a player checking in
for 5 minutes every hour over 3 days and prints level/shells progression. Tell me if
pacing feels off versus: level 5 by end of day 1, level 8 by day 3.
```
**Done when:** it plays well on your phone and pacing matches the targets (tweak constants.ts if not).

## Phase 12 — Deploy (optional)
```
Prepare the project for deployment on Vercel: a production build check, a correct base path,
favicon (a cartoon fish SVG), page title "Fishbowl Break", and meta tags. Give me the exact deploy steps.
```

---

## When something breaks
```
Bug: [what you did] → [what happened] → [what you expected].
Find the root cause before fixing. Add a test if it's sim logic. Don't refactor unrelated code.
```

## When you want to tweak the feel
```
Adjust [growth speed / shell income / fish speed / etc] to feel [faster/slower/calmer].
Change only constants.ts / species.ts values and tell me what you changed.
```
