# Fishbowl Break: Health Assessment

**Date:** 2026-10-05 · **Build:** `main` @ 18d0aab · **Type:** audit only (no game code changed)

**Method**
- **Tooling:** `npm run build`, `npm test`, `npx tsc --noEmit`, `npm outdated`, and Lighthouse 12 on the production build (`vite preview`).
- **Playwright** (library, driving system Chrome):
  - 17 game states at 4 viewports, giving 68 screenshots in `qa/assessment/` (named `<viewport>-<nn>-<state>.png`).
  - A DOM sweep for tap targets and text sizes, written to `qa/assessment/report.json`.
  - Heavy-tank FPS, CPU-throttled mobile, and a 30-simulated-minute memory run.
- **Balance:** a 30-day casual-player simulation (a throwaway script, since deleted) using the real `src/game` rules.
- **Code reading:** by hand.

**Tools that were skipped**
- **Playwright MCP:** installed, but not loaded in this session (MCP tools load on restart). I used the Playwright library from scripts instead, with the same engine and screenshots.
- **`npm run test:e2e`:** there's no such script, and no E2E suite exists.
- **Balance script:** `scripts/balance.ts` doesn't exist (Phase 11 never ran), so I wrote one under `scripts/audit/` and deleted it afterwards.
- **Lighthouse PWA category:** removed in Lighthouse 12, so the PWA checks were done by hand (section 9).

---

## Executive summary

| Area | Score | Why |
|---|---|---|
| 1. Bugs & correctness | **6/10** | No console errors across 68 states and 447 passing tests. But cleaning has a real dead end (tanks get stuck at 0% clean with nothing to wipe), and two open tabs overwrite each other. |
| 2. Save & sync integrity | **6/10** | Migrations v1→v6 are complete and tested, and RLS is solid. Logging out while offline deletes unsynced progress; cross-device conflicts silently discard the losing device's work; a newer-version save is treated as "corrupt". |
| 3. Game design & balance | **3/10** | Auto-collecting drops past the 10-drop cap makes income effectively unlimited (1.84M shells and 3,890 pearls in a month, against ~60k collected by hand). Bond reaches Soulmate on day 2. The Nursery grows without limit (542 babies a month). |
| 4. UX & UI | **6/10** | Cohesive kit and clear feedback. Landscape has overlapping UI, the Dev button covers content, the new decor UI has sub-44px targets, and the main UI font (Nunito) is never loaded. |
| 5. Performance | **4/10** | Runtime is fine (60fps on a throttled phone, no leaks). Loading is not: 43 MB on first load, Lighthouse Performance 41, TBT 6.6s, usable at 11.5s. |
| 6. Code quality | **7/10** | Strict TS, no `any`, no TODOs, good test density on game logic. But there's no lint or CI, some game rules live in the store, four files exceed 1,000 lines, and the cloud-sync tests can't run on the pinned Node 20. |
| 7. Security & privacy | **6/10** | RLS is correct, no secrets in the repo, React escapes names. But the dev panel (spawn fish, give all decor) ships to players and cloud-saves the result; there's no account deletion; auth uses the implicit flow; Google Fonts loads without consent. |
| 8. Accessibility | **7/10** | Lighthouse a11y 91, reduced-motion support, aria-labels, keyboard petting. Contrast and label-name mismatches flagged; the new filter chips, undo/redo and close buttons are under 44px. |
| 9. Launch readiness | **3/10** | Manifest and privacy page exist. No service worker or offline mode, no update flow, no analytics, no account deletion, no Sign in with Apple, a 43 MB download, and the dev panel is in production. |

## Top 10 priorities

| # | Issue | Area | Impact | Effort |
|---|---|---|---|---|
| 1 | **Ship sprites as pre-sized WebP (≤512 px) and preload only what the first screen needs.** 43 MB → ~3 MB; fixes LCP/TBT/TTI (PERF-1, PERF-2). | Perf / Launch | High | M |
| 2 | **Remove the dev panel from production** (`DEV_TOOLS_IN_PRODUCTION = true`): anyone can give themselves everything, and cloud sync keeps it (SEC-1). | Security | High | S |
| 3 | **Stop auto-collecting overflow drops at full value**, at least offline. That one rule produces ~97% of all income (BAL-1). | Balance | High | S |
| 4 | **Fix the cleaning dead end:** cleanliness reaches 0 with no algae to wipe, and Clean mode refuses to open (BUG-1). | Gameplay | High | S |
| 5 | **Logout must never delete unsynced progress:** only clear the local save after a confirmed push, otherwise warn (SYNC-1). | Save | High | S |
| 6 | **Single-writer across tabs** (BroadcastChannel/`storage` event lock) so two tabs don't overwrite each other's progress (SYNC-3). | Save | High | M |
| 7 | **Cap the Nursery** (and pause hatching when it's full) so saves don't grow without limit: 217 KB after a month and climbing (BAL-4). | Balance / Save | Med | S |
| 8 | **PWA basics:** service worker (precache the app shell + sprites), offline start, update prompt, PNG icons (192/512 + maskable) (LAUNCH-1/2). | Launch | High | M |
| 9 | **Analytics + account deletion** before any wider launch: D1/D7 retention, feature use, and a "Delete my account & data" flow (LAUNCH-3, SEC-3). | Launch | High | M |
| 10 | **Pacing:** slow bond (Soulmate on day 2 → about a week), and ease the early XP curve so Lv5 lands on day 1 as the spec targets (BAL-2, BAL-3). | Balance | Med | S |

---

## 1. Bugs & correctness

| ID | Issue | Evidence | Impact | Effort | Fix |
|---|---|---|---|---|---|
| BUG-1 | **Cleaning dead end.** Algae only spawns when cleanliness *crosses* 80/60/40/20 (`sim.ts:152` `thresholdsCrossed`), and a wipe adds only +6 (`ALGAE_WIPE_CLEANLINESS`). After the spots are wiped, cleanliness keeps decaying to 0, no new spots appear, and `setMode('clean')` refuses with "✨ Sparkling clean! Nothing to wipe" (`gameStore.ts:646`). Fish keep the −15 dirty penalty forever. | Balance sim, month 1: all 3 tanks at **0% clean with 0 algae**, average happiness 40. | High | S | Option A: while cleanliness < 60, keep at least `ceil((60 − c)/6)` spots present, spawning one per minute while below. Option B: a wipe restores `(100 − c)/spots` so wiping everything returns the tank to 100%. Either way Clean mode should open whenever cleanliness < 100. Add a sim test "after wiping all spots, cleanliness ≥ 60". |
| BUG-2 | **Two tabs overwrite each other.** Each tab runs its own 1s sim and autosaves every 10s (`save.ts:311`); whichever saves last wins, so collected shells or purchases in the other tab disappear. | Code reading: no `BroadcastChannel`/`storage` listener anywhere. | High | M | Use `navigator.locks` or BroadcastChannel to elect a leader tab; the others show "Fishbowl is open in another tab" with a "Play here" button that hands over the lock. |
| BUG-3 | A save written by a newer version (e.g. after a rollback deploy) is treated as **corrupt**: backed up and replaced with a fresh game (`save.ts:218-225`, `migrate` throws on `version > SAVE_VERSION`). | Code reading. | Med | S | Distinguish "too new" from "corrupt": keep the save untouched, play a read-only or fresh session, and toast "Please refresh to update". |
| BUG-4 | Corrupt-save backups (`fishbowl-save-corrupt-<ts>`) are never cleaned up, so they accumulate and eat localStorage quota. There's also no restore path. | `save.ts:224`; no cleanup code. | Low | S | Keep the newest 2 and offer "Restore backup" in Settings. |
| BUG-5 | `saveGame` swallows quota errors silently (`save.ts` `saveGame` catch), so a full storage means progress quietly stops saving. | Code reading. | Med | S | Track the failure, toast once ("Couldn't save — storage full"), and fall back to trimming old backups. |
| BUG-6 | "Music/Dance Mode" exists only as a dev renderer flag (`renderer.setDance`). Players have no music or Dance Mode; the audit prompt and CONTEXT treat it as a feature. | `grep Dance src/ui` → only DevPanel. | Low | — | Decide: ship it (toolbar toggle + synth loop) or drop it from the docs. |
| BUG-7 | A cloud load mid-session (`applyGame` → `loadState`) replaces the game while the player may be decorating, petting or in a modal. Mode, selection and the undo history are reset without explanation beyond a toast. | `cloudSave.ts:410-414`. | Low | S | Defer `applyGame` until the player is in look mode, or show a "Newer progress found — load it?" banner. |

No console errors or page errors in any of the 68 captured states (`qa/assessment/report.json` → `errors` all empty).

## 2. Save data & sync integrity

| ID | Issue | Evidence | Impact | Effort | Fix |
|---|---|---|---|---|---|
| SYNC-1 | **Logout loses unsynced progress.** `logout()` races the final push against 5s, then *always* removes `fishbowl-save` and starts a fresh game, even if the push failed (offline). | `cloudSave.ts:351-372`. | High | S | Only clear local data after the push succeeds; otherwise show "You're offline — log out anyway and lose N minutes of progress?" |
| SYNC-2 | **Cross-device conflict = the loser's progress is discarded.** On a conditional-write miss, the device loads the other device's save and its own unsynced changes are dropped, with only a toast. | `cloudSave.ts:326-333`. | Med | M | Merge the additive parts (currency, inventory, fish ids not present on the other side), or show the same compare modal used at first login. |
| SYNC-3 | Two tabs (see BUG-2) also both push to the cloud, each conflicting with the other. | Code reading. | High | M | Same leader-tab fix. |
| SYNC-4 | Saves on tab hide use a normal fetch (supabase-js). On mobile the page is often frozen before it completes, so the last ~30s may never reach the cloud. | `cloudSave.ts` `onVisibility`. | Med | S | Also push on `pagehide` and shorten the debounce to 10s while dirty; localStorage still has it, so it's recovered on next open. |
| SYNC-5 | Save size grows without limit through the Nursery (BAL-4): 217 KB at month 1 in the sim, heading for the localStorage limit (~5 MB) in months, and stored as uncapped `jsonb`. | Sim output. | Med | S | Cap the Nursery; also enforce a payload cap server-side (`check (octet_length(data::text) < 1000000)`). |
| SYNC-6 | Migrations are complete for v1→v6 and each has a test (`save.test.ts`). ✓ | — | — | — | Keep the "one test per migration" rule. |
| SYNC-7 | `cloudSave.test.ts` **can't run on the pinned Node 20** when `.env.local` has keys ("native WebSocket not found"), so sync logic is effectively untested locally. | `npx vitest run src/store/cloudSave.test.ts`. | Med | S | Mock `../lib/supabase` in that test file (it only needs `FakeBackend`), or move to Node 22 (also unblocks Vite/Vitest upgrades). |

## 3. Game design & balance

Simulated player: 5 minutes every hour, 09:00–16:00 (8 sessions), workdays only. Each session they claim the gift, collect drops, wipe algae, feed everything to near-full by hand, pet one favorite fish (rewarded cap), breed any ready pair, and spend: fill the tank (priciest affordable species, in pairs), one new decor piece, capacity upgrades at 80%, new tanks when allowed.

**Current rules**

| when | level (xp) | shells | pearls | fish | tanks | decor | sets | best bond | hatched |
|---|---|---|---|---|---|---|---|---|---|
| Day 1 | 4 (194/320) | 3,072 | 19 | 16 (3 species) | 1 | 6 | 0 | 3 | 0 |
| Day 2 | 6 | 13,788 | 71 | 25 | 1 | 14 | 2 | 5 | 0 |
| Day 3 | 7 | 30,576 | 164 | 25 | 1 | 15 | 3 | 5 | 6 |
| Week 1 | 8 | 81,564 | 384 | 46 | 2 | 20 | 3 | 5 | 18 |
| Week 2 | 11 | 402,581 | 1,198 | 52 | 2 | 30 | 6 | 5 | 64 |
| Month 1 | 17 | **1,840,065** | **3,890** | 82 | 3 | 45 | 9 | 5 | 544 |

Of the income, only **59,839 shells were collected by hand**. The rest is `autoCollect` of overflow drops at full value (`sim.ts:234`), mostly overnight within the 8h offline cap.

**Variant: overflow drops are lost instead of auto-collected**

| when | level | shells | pearls | fish | tanks | decor | sets | best bond | hatched |
|---|---|---|---|---|---|---|---|---|---|
| Day 1 | 4 | 0 | 3 | 13 | 1 | 3 | 0 | 3 | 0 |
| Day 2 | 5 | 76 | 8 | 13 | 1 | 11 | 1 | 5 | 0 |
| Week 1 | 7 | 452 | 23 | 19 | 1 | 15 | 3 | 5 | 1 |
| Week 2 | 11 | 1,687 | 53 | 49 | 2 | 30 | 6 | 5 | 25 |
| Month 1 | 17 | 24,190 | 185 | 79 | 3 | 45 | 9 | 5 | 545 |

**Milestones (current rules):**
- First purchase: session 1.
- Bond: Curious at session 2, Friendly (first trick) at session 4, Buddy at session 6, **Soulmate on day 2**.
- First decor: session 3.
- First collection set: day 2.
- Lv5: day 2 (spec target: day 1).
- First courtship and hatch: day 3.
- Lv8 / second tank: day 5 (the variant is slower: day 8–9; spec target: day 3).
- Lv10: day 9. Lv15: day 24.

**XP by source over the month:** collect 6,979 · feed 5,012 (capped 30/h) · pet 504 · algae **28** (cleaning contributes nothing, see BUG-1).

| ID | Issue | Evidence | Impact | Effort | Recommended change (exact values) |
|---|---|---|---|---|---|
| BAL-1 | **Runaway economy** from full-value auto-collect of overflow drops. Shells become meaningless by day 2, pearls by week 1. | Tables above. | High | S | Add `AUTO_COLLECT_FRACTION_OFFLINE = 0` (offline overflow is lost) and `AUTO_COLLECT_FRACTION_ONLINE = 0.5`, and raise `MAX_DROPS_PER_TANK` 10 → **20** so a 1-hour gap still keeps everything. Expect ~25–40k shells/month. |
| BAL-2 | **Bond is too fast:** Soulmate (160) on day 2 by petting one fish 3×/hour. | Milestones. | Med | S | `BOND.levels = [0, 15, 45, 100, 180, 300]` and `BOND.sessionsPerHour = 2`, giving Buddy on day 2 and Soulmate in ~5 play-days for one favorite fish. |
| BAL-3 | **Early levels lag the spec targets:** Lv5 on day 2 (target day 1), Lv8 on day 5–8 (target day 3). | Milestones. | Med | S | `XP_CURVE_BASE` 40 → **30**. That puts the cumulative XP for Lv5 at 511 (day 1 in the sim) and for Lv8 at 1,843 (~day 3). |
| BAL-4 | **The Nursery is unbounded:** any ready pair keeps laying eggs, so babies pile up (542/month) and the save grows. | Sim: Nursery 542, save 217 KB. | Med | S | `NURSERY_MAX = 12`. When it's full, eggs wait unhatched with "Nursery is full — make room" (nothing dies, nothing is lost). |
| BAL-5 | **Pearls are too plentiful** even after the BAL-1 fix (185/month against 5–20-pearl prices): koi, the theme and every pearl style within weeks. | Variant table. | Low | S | Keep `DROP_PEARL_CHANCE = 0.02`, but cap pearl drops at `PEARL_DROPS_PER_DAY = 3`. |
| BAL-6 | **Decor without level locks is fine for pacing:** with the BAL-1 fix it takes days to afford sets (first set on day 2, 3 sets by week 1). | Variant table. | — | — | No change. Decor stays a healthy shell sink. |
| BAL-7 | Level-up shells (`level × 10`) and the daily gift (20 shells) are irrelevant under the current economy, but become meaningful after BAL-1. | Tables. | Low | — | Re-check after BAL-1. |
| BAL-8 | **Clear next goal:** the goal chip always shows the next unlock until Lv20, then nothing. There's no long-term goal after Lv20 (collections, Soulmates and tanks aren't surfaced). | `TopChip.tsx` `GoalChip` returns null when `nextUnlock` is null. | Low | M | After Lv20, rotate goals: "Complete the Ruins collection 2/4", "Make a Soulmate", "Breed a shiny". |

## 4. UX & UI

There's no "UX Rules" section in CLAUDE.md, although `ui/kit/index.ts:1` says "see UX Rules in CLAUDE.md". This was reviewed against the design pillars and the `UX_AUDIT.md` principles.

| ID | Issue | Evidence | Impact | Effort | Fix |
|---|---|---|---|---|---|
| UX-1 | **Landscape overlaps:** the goal chip sits on top of the FishCard header; the Decorate item toolbar sits on top of the tray. | `qa/assessment/land-06-fishcard.png`, `land-09-decorate.png` | Med | S | Hide the goal chip while a sheet is open (TopChip's `busy` ignores `selectedFishId`); clamp `DecorToolbar` so it never intersects `.sheet-inline`. |
| UX-2 | **The Dev button is visible to players** and overlaps the FishCard, toasts and the pan tip on small phones. | `m375-06-fishcard.png`, `m375-01-first-launch.png` | High | S | See SEC-1. |
| UX-3 | **The UI font Nunito is never loaded** (only Fredoka is in `index.html`), so all body text, and canvas text like "+3 💕", falls back to system-ui. | `index.html:15`; `tokens.ts:80`; `styles.css:15` | Med | S | Self-host Nunito and Fredoka (woff2, `font-display: swap`), which also fixes PRIV-2. |
| UX-4 | **Sub-44px targets in the new decor UI:** filter chips 36px tall, undo/redo 36×32, the tray fold 36×32, S/M/L 36×40; also the compact banner ✕ ("Done decorating", "Stop feeding") at 28×28. | `qa/assessment/report.json` → `smallTargets` | Med | S | Set `min-height: var(--tap-min)` on `.chip`, `.mini-btn`, `.size-btn`, `.tray-fold`, and give the compact banner close button a 44px hit area (padding or `::after`). |
| UX-5 | **Phone portrait:** on 375×667 the fish are tiny (~40px) and the scene is mostly empty water between the HUD and the sand. The shop's 4 filter rows push the items below the fold. | `m375-02-idle-midgame.png`, `m390-07-shop-decor.png` | Med | M | Raise `PORTRAIT_ZOOM`, or scale fish ×1.2 in portrait. Collapse the filters into one "Filter ▾" button with a count. |
| UX-6 | **First 5 minutes:** onboarding, the goal chip, the gift box, the pan tip and the tools dock all appear together. Feeding hides behind "Tools" (two taps). Petting, Decorate and My Fish are only discoverable via tips. | `m390-01-first-launch.png`, `m375-01-first-launch.png` | Med | M | Keep only the onboarding bubble on screen until step 1 is done (gate the goal chip, gift and pan tip behind `onboardingStep === null`). Pin a permanent Feed button next to Tools. |
| UX-7 | "New" badge text is 11px (below the 12px floor). | `report.json` → `tinyText` | Low | S | 12px. |
| UX-8 | The **frame bezel and nameplate** sit under the dock and toasts at bottom center. On phones the nameplate is mostly hidden by the dock. | `m390-02-idle-midgame.png` (bottom) | Low | S | Move the nameplate to the bottom-left corner of the bezel, or hide it when the dock is open. |
| UX-9 | Selling and selling back have a confirm but **no undo** (UX_AUDIT F5/S7 proposed a 5s undo toast). | `FishCard.tsx` SellButton | Low | M | Implement the planned undo toast pattern (the store supports toast actions). |

## 5. Performance

| Metric | Value |
|---|---|
| Lighthouse (production build, mobile preset) | **Performance 41** · Accessibility 91 · Best Practices 100 |
| FCP / LCP / Speed Index / TTI | 3.0s / 5.0s / 6.1s / **11.5s** |
| Total Blocking Time | **6,600 ms** (main-thread work 10.6s; JS bootup 9.4s) |
| Total payload | **43.4 MB** (WebP alone would save 34.5 MB) |
| JS bundle | `index` 719 KB (226 KB gzip) · `DevPanel` 12.7 KB · CSS 58 KB |
| Heavy tank, desktop 1440×900 at DPR 2 (20 fish, 6 jellies, 15 decor, night, Dance Mode, glow gravel, neon, curtain) | update+draw **13.4 ms CPU/frame**; rAF 56 fps; worst frame 350 ms (first bake) |
| Heavy tank, 390×844 at DPR 3, 4× CPU throttle | update+draw 9.8 ms; rAF 60 fps |
| Memory, 30 simulated minutes + 1 real minute, heavy tank | JS heap 7.6 → 9.5 MB and flat after 10 min; DOM nodes 315; listeners 228, stable → **no leak** |

| ID | Issue | Evidence | Impact | Effort | Fix |
|---|---|---|---|---|---|
| PERF-1 | **43 MB of PNG sprites downloaded on every first load.** Fish are 1254×1254 PNGs at ~2 MB each (`public/assets/fish` = 30 MB) but are downscaled to `SPRITE_MAX_PX = 512` at load. Theme backgrounds are 1672×941 PNGs (~1.7 MB each); the decor sheets total 8.5 MB. | Lighthouse `total-byte-weight`, `modern-image-formats`; `du -sh public/assets/*` | High | M | Offline build step (sharp): fish → 512 px WebP q85 (~40–80 KB each), backgrounds → WebP at 1600 px (~150 KB), decor sheets → individual 512 px WebPs. Expect ~3 MB total. |
| PERF-2 | **Main thread blocked ~6.6s** by loading and *cleaning* every sprite at startup (`removeIslands`, `erodeAlpha`, `defringe` over full-size pixels in `assets.ts`/`sprites.ts`), behind the loading screen. | Lighthouse TBT/bootup | High | M | Do the cleanup offline in the build step (above), then just `decode()` the images. Load only the current theme's background and the species/decor in the save first; lazy-load the rest. |
| PERF-3 | **Desktop at DPR 2 spends 13.4 ms/frame** with a heavy tank, leaving little headroom on weaker laptops. | perf run | Med | M | Cap the canvas backing at DPR 1.5 on large viewports (or when `quality` drops); skip per-firefly `createRadialGradient` (cache a glow sprite) in `setEffects`/`drawLights`. |
| PERF-4 | The first heavy frame hitches 350 ms (baking substrate and background layers). | perf run (worst frame) | Low | S | Bake on idle (`requestIdleCallback`) before showing the tank, or bake progressively. |
| PERF-5 | Unused assets ship: `fish/guppybaby1.PNG` (1.8 MB) and `fish/tetrababy.PNG` (a duplicate of the adult, 0.9 MB). | `grep` for file references | Low | S | Delete them. |
| PERF-6 | 137 KB of unused JS in the main chunk; `supabase-js` is always loaded even for guests. | Lighthouse `unused-javascript` | Low | S | Lazy-import `lib/supabase` + `cloudSave` when env vars exist and the player opens Settings or has a session. |
| PERF-7 | The Google Fonts stylesheet is render-blocking (~1.2s). | Lighthouse `render-blocking-resources` | Low | S | Self-host the fonts (UX-3). |

Battery: rAF stops in hidden tabs. The 1s sim interval keeps running throttled; `advanceTo` catches up in bulk, which is fine. No audio context is created until unmuted ✓.

## 6. Code quality & architecture

| ID | Issue | Evidence | Impact | Effort | Fix |
|---|---|---|---|---|---|
| CODE-1 | **Some game rules live in the store, not `src/game`:** drop collection (`collectDrop`), algae wiping (`wipeAlgae` cleanliness math), and the hand-feed bond check. They're untestable without the store and easy to diverge from. | `gameStore.ts` ~580–620 | Med | S | Move to `economy.collectDrop` / `sim.wipeAlgae` pure functions with tests; the store just commits them. |
| CODE-2 | **No ESLint/Prettier config and no CI.** Nothing stops a regression from reaching `main` → Vercel. | No `eslint.config.*`, no `.github/` | Med | S | Add eslint (typescript-eslint + react-hooks) and a GitHub Action that runs `tsc`, `vitest` and `build` on push. |
| CODE-3 | Oversized files: `drawFish.ts` 1,564 lines, `renderer.ts` 1,335, `gameStore.ts` 1,129, `constants.ts` 936. | `wc -l` | Low | M | Split the store into slices (bond, decor, breeding, economy); split `renderer.ts` into passes (tank, fish, overlays). |
| CODE-4 | **Magic numbers outside `constants.ts`** in newer modules (allowed by the local-const pattern, but against the CLAUDE.md rule). | e.g. `bondFx.ts` (`HOOP_AHEAD`, `ZOOM_AHEAD`, `ROLL_MS`), `setEffects.ts` (`COUNT`, `SPAWN_GAP`), `TankFrame.tsx` (`WIDTH`, `RADIUS`) | Low | S | Either move them to constants or relax the rule in CLAUDE.md to "balance numbers in constants; visual tuning may be local, named consts". |
| CODE-5 | **Test gaps:** no tests for `TankView` gestures (tap/hold/pet/double-tap/two-finger), `bondFx`, `decorVisits`, `setEffects`, `DecorBehaviors` new behaviors, or any React component. No E2E suite. Cloud tests can't run (SYNC-7). | Test file list | Med | M | Add a Playwright E2E suite (`npm run test:e2e`) covering the flows used in this audit; unit-test gesture classification by extracting it from `TankView`. |
| CODE-6 | **Outdated toolchain:** Vite 5 (latest 8), Vitest 2 (5), React 18 (19), TypeScript 5.6 (7), `@vitejs/plugin-react` 4 (6). These are pinned because local Node is 20.4. | `npm outdated` | Low | M | Move to Node 22 LTS, then upgrade Vite/Vitest; React 19 later. |
| CODE-7 | `src/game` purity: ✓ no DOM, React or render imports, and time/RNG are injected (only `createInitialState` defaults to `Date.now`/`Math.random`). `constants.ts` holds localStorage key *names* (strings only; fine). | grep | — | — | — |
| CODE-8 | No `any`, no `ts-ignore`, no TODO/FIXME. ✓ `tsc --noEmit` is clean. | grep, tsc | — | — | — |

**CLAUDE.md drift:**
- **"UX Rules" section:** referenced by `ui/kit/index.ts:1`, but it doesn't exist in CLAUDE.md.
- **Kenney sprites:** "Use the sprites in /public/assets/kenney-fish" (that folder doesn't exist; sprites are in `public/assets/fish`).
- **Toasts:** "Toasts… at most 3" vs `MAX_VISIBLE_TOASTS = 1` with a queue.
- **Art Style:** describes "a wooden stand and cozy blurred room wallpaper" (removed; the view is full-bleed with an optional bezel).
- **Persistence:** "Settings menu has Reset game" ✓. But "Save includes version… migrations" is now v6 ✓.
- **Folder structure:** omits `render/ambient/`, `bondFx`, `drawSubstrate`, `ui/kit`, `lib/`, `store/cloudSave`.
- **CONTEXT.md contradicts itself:** "DevPanel… stripped from production" (line ~235) vs "ships to production" (line ~96).

## 7. Security & privacy

| ID | Issue | Evidence | Impact | Effort | Fix |
|---|---|---|---|---|---|
| SEC-1 | **The dev panel ships to production** (`DEV_TOOLS_IN_PRODUCTION = true`). Any player can spawn fish, set bond, give all decor and styles, force events, and cloud sync persists it. It's also visible clutter (UX-2). | `constants.ts:422`; `App.tsx:37`; `dist` contains the `DevPanel` chunk | High | S | Set it to `false`, or gate it behind `?dev` + localStorage. Since the save is client-trusted anyway, the main reason is UX, plus future leaderboards. |
| SEC-2 | **RLS is correct:** select/insert/update are limited to `auth.uid() = user_id`, there's no delete, and `updated_at` is set by a server trigger. ✓ Saves are client-trusted (fine for single-player; never build leaderboards on them). There's no payload size limit (SYNC-5). | `supabase/migrations/001_saves.sql` | Low | S | Add `check (octet_length(data::text) < 1000000)`. |
| SEC-3 | **No account deletion.** Required by Apple (5.1.1(v)) and GDPR. `auth.users` cascade-deletes `saves`, but the client can't delete an auth user. | No code path | High | M | A Supabase Edge Function `delete-account` (service role, verifies the JWT, `auth.admin.deleteUser`) plus a Settings button with a confirm. |
| SEC-4 | **Auth uses the implicit flow** (`detectSessionInUrl`, tokens in the URL hash). Supabase recommends PKCE for browser apps. | `lib/supabase.ts`; CONTEXT "implicit flow" | Low | S | `flowType: 'pkce'`. Keep the cross-browser magic link by using an OTP code entry as the fallback. |
| SEC-5 | **XSS:** fish and tank names are rendered through React (escaped) or canvas `fillText` and the SVG text node (safe). No `innerHTML`/`dangerouslySetInnerHTML`. ✓ | grep | — | — | — |
| SEC-6 | Secrets: `.env*` is gitignored and only `.env.example` is tracked; the anon key is public by design. ✓ Dev hooks `__fishbowl`/`__renderer` are absent from the production bundle. ✓ | `git ls-files`, `grep dist` | — | — | — |
| PRIV-1 | **Stored data:** the email address (Supabase Auth), the save blob (user-chosen fish and tank names, play timestamps, progress), and localStorage on the device. No analytics or third-party trackers. | Code reading | — | — | The privacy policy (`public/privacy.html`, dated Oct 3) should list: email and auth provider (Google), what the save contains, the Supabase region and processor, retention, how to delete (SEC-3), and Google Fonts. |
| PRIV-2 | **Google Fonts are loaded from Google without consent:** the IP address goes to Google (an EU GDPR concern, as in the German LG München ruling). | `index.html:13-15` | Med | S | Self-host the fonts (UX-3). |

## 8. Accessibility

| ID | Issue | Evidence | Impact | Effort | Fix |
|---|---|---|---|---|---|
| A11Y-1 | **Contrast failures** flagged by Lighthouse (`color-contrast`). Likely candidates: white text on the light-blue HUD bars, the goal chip sub-line, and the `.meta` text on `--color-surface-alt` in the Bond section. | Lighthouse a11y 91 | Med | S | Run axe in E2E and add the failing pairs to `TEXT_PAIRS` in `tokens.test.ts`. |
| A11Y-2 | **Accessible names don't match visible labels** (`label-content-name-mismatch`), e.g. the tank tag "My Tank 2/10" vs aria-label "My Tank. Open tanks", and the tray "Box (2)" vs the title "Decor box". | Lighthouse, `report.json` | Low | S | Start each aria-label with the visible text. |
| A11Y-3 | **Tap targets under 44px** (UX-4) and `target-size` failures. | `report.json` | Med | S | See UX-4. |
| A11Y-4 | The canvas is focusable with arrow keys and Space for petting ✓, but feeding, cleaning and decor dragging have **no keyboard path**. Decorate only offers the toolbar buttons (no keyboard move). | `TankView.tsx` `onKeyDown` | Low | M | Arrows nudge the selected decor by 10 units in Decorate mode; F drops a pellet at the selected fish. |
| A11Y-5 | Reduced motion is honored in the renderer, behaviors, set effects and the neon frame ✓. Color is never the only signal on meters ✓ (icon + word). | Code reading | — | — | — |

## 9. Launch readiness (PWA first, app stores later)

| ID | Issue | Evidence | Impact | Effort | Fix |
|---|---|---|---|---|---|
| LAUNCH-1 | **No service worker:** no offline start, no install-time caching of the 43 MB (soon ~3 MB) of art, no update flow. | No `serviceWorker` in `src`/`index.html` | High | M | `vite-plugin-pwa` (injectManifest): precache the shell and WebP sprites, cache-first for `/assets`, and a "New version — tap to update" toast via `registerSW({ onNeedRefresh })`. |
| LAUNCH-2 | **Manifest icons:** only an SVG with `purpose: "any maskable"`. Android and iOS install needs 192/512 PNGs and a separate maskable icon. `display: fullscreen` hides the status bar on Android, which is fine but unusual; `standalone` is safer for iOS. | `public/manifest.webmanifest` | Med | S | Add `icon-192.png`, `icon-512.png` and `icon-maskable-512.png`, plus an `apple-touch-icon` 180 px. |
| LAUNCH-3 | **No analytics:** D1/D7 retention, session length and feature use (petting, decorate, breeding) can't be measured. | grep | High | M | A privacy-friendly option (PostHog EU or Plausible) with ~12 events: `session_start`, `onboarding_step`, `feed`, `pet_complete`, `bond_level`, `buy_*`, `decorate_open`, `breed_start`, `hatch`, `level_up`, `login`, `cloud_conflict`. Opt-out in Settings. |
| LAUNCH-4 | **Capacitor blockers for later:** Sign in with Apple (required on iOS if Google sign-in is offered), account deletion (SEC-3), push notifications (none; optional), a privacy policy URL ✓, `env(safe-area-inset-*)` ✓, storage (localStorage can be cleared by iOS, so use Capacitor Preferences), and audio unlock ✓. Magic-link redirects need deep links / universal links. | Code reading | Med | L | Plan: the Apple provider in Supabase, a deep-link scheme, and a storage adapter behind `SaveStorage`. |
| LAUNCH-5 | **Legal/IP:** code comments reference "FishVille-style" (`drawTank.ts:17,155`), and CLAUDE.md says "like classic Facebook-era aquarium games" and "Kenney sprites". None of that is user-facing. But there's no `LICENSE` or credits file: the sprite and background provenance (AI-generated? Kenney CC0?) and the fonts (Fredoka/Nunito are OFL) aren't recorded. | grep; no `LICENSE*`/`CREDITS*` | Med | S | Add `CREDITS.md` (sources and licenses for every asset family and font, plus the AI-generation tool's terms), an in-game "About & credits" in Settings, and remove third-party game names from comments. |
| LAUNCH-6 | **The production build includes the dev panel** (SEC-1). | — | High | S | — |

---

## Quick wins (high impact, small effort)

1. **The dev panel:** `DEV_TOOLS_IN_PRODUCTION = false` (SEC-1, UX-2).
2. **The economy:** no full-value auto-collect offline; `MAX_DROPS_PER_TANK` 20 (BAL-1).
3. **The cleaning dead end:** fix it and let Clean mode open below 100% (BUG-1).
4. **Logout:** only clear local data after a successful push (SYNC-1).
5. **The Nursery:** cap at 12 (BAL-4, SYNC-5).
6. **Bond pacing and XP curve:** constants change (BAL-2, BAL-3).
7. **Fonts:** self-host Nunito + Fredoka (UX-3, PRIV-2, PERF-7).
8. **Tap targets:** 44 px on chips, undo/redo, S/M/L, the fold, the compact ✕ (UX-4/A11Y-3).
9. **Landscape:** hide the goal chip when a sheet is open, and clamp the decor toolbar (UX-1).
10. **Unused sprites:** delete the 2 (PERF-5).
11. **Cloud tests:** mock `lib/supabase` so the cloud tests run (SYNC-7).
12. **CI:** a GitHub Action running tsc + vitest + build (CODE-2).

---

## Suggested roadmap

Each batch is sized for one Claude Code session. The prompts are ready to paste.

### Batch 1: Stop the bleeding (safety, economy, cleaning) ✅ Done 2026-10-05
_SEC-1, BAL-1..4, BUG-1 and SYNC-1 fixed with tests (468 passing). Clean mode opens whenever there are spots; below 60% cleanliness there always are, between 60 and 100 there may be none, so it still says "nothing to wipe" there._
```
Read CLAUDE.md, CONTEXT.md and ASSESSMENT.md. Fix these items from ASSESSMENT.md, with Vitest tests for each,
then run npm test + npm run build:
- SEC-1: set DEV_TOOLS_IN_PRODUCTION=false; dev panel only in dev or with ?dev=1 (remembered in localStorage).
- BAL-1: overflow drops beyond MAX_DROPS_PER_TANK are no longer auto-collected at full value offline
  (AUTO_COLLECT_FRACTION_OFFLINE=0, AUTO_COLLECT_FRACTION_ONLINE=0.5); MAX_DROPS_PER_TANK 10→20.
  Offline summary must stay honest about what was kept.
- BUG-1: cleaning dead end. While cleanliness < 60 keep ceil((60-c)/6) algae spots present (spawn at most one per
  sim minute); Clean mode opens whenever cleanliness < 100. Test: after wiping every spot, cleanliness climbs ≥ 60.
- BAL-4: NURSERY_MAX=12; when full, eggs wait unhatched (no loss) with a toast + Breeding panel note.
- BAL-2/BAL-3: BOND.levels=[0,15,45,100,180,300], BOND.sessionsPerHour=2, XP_CURVE_BASE=30 (update tests/docs).
- SYNC-1: logout only clears local save after a confirmed cloud push; otherwise a confirm dialog explains the risk.
Update CLAUDE.md (rules) and CONTEXT.md.
```

### Batch 2: Load fast (assets and fonts) ✅ Done 2026-10-05
_PERF-1/2/5/6/7, UX-3, PRIV-2 and SYNC-7 fixed. Lighthouse Performance 41 → 95, payload 43.4 → 2.6 MB, LCP 5.0 → 2.6s, TBT 6.6s → 0, TTI 11.5 → 2.7s._
```
Read CLAUDE.md, CONTEXT.md and ASSESSMENT.md (PERF-1, PERF-2, PERF-5, PERF-6, PERF-7, UX-3, PRIV-2).
- Add scripts/build-assets.ts (sharp, devDependency) that converts public/assets to WebP: fish → 512px max side,
  backgrounds → 1600px wide, decor sheets → one 512px WebP per DECOR_ART rect, already trimmed/defringed with the
  same cleanup the runtime does today. Output to public/assets-webp; keep sources out of dist.
- Point artConfig/sprites at the WebP files; runtime cleanup becomes a no-op for pre-cleaned files.
- Preload only the active theme background + species/decor present in the save; lazy-load the rest after first paint.
- Delete unused fish/guppybaby1.PNG and fish/tetrababy.PNG.
- Self-host Nunito + Fredoka (woff2, font-display: swap); remove Google Fonts links.
- Lazy-load supabase-js only when cloud saves are configured and used.
Measure before/after with Lighthouse on `vite preview` and report payload, LCP, TBT, TTI.
```

### Batch 3: PWA and sync robustness ✅ Done 2026-10-05
_LAUNCH-1/2, BUG-2..5, SYNC-2..5 and SYNC-7 fixed with tests (491 passing). Offline start and the two-tab handover were verified in Chrome. The size-limit migration (`002_saves_size_limit.sql`) still has to be run in Supabase._
```
Read CLAUDE.md, CONTEXT.md and ASSESSMENT.md (LAUNCH-1, LAUNCH-2, BUG-2, SYNC-2..5, SYNC-7, BUG-3..5).
- vite-plugin-pwa: precache shell + WebP assets, offline start, "New version — tap to update" toast.
- PNG icons 192/512 + maskable + apple-touch-icon; manifest display: standalone.
- Leader-tab lock (navigator.locks or BroadcastChannel); other tabs show "Open in another tab — play here?".
- Cross-device conflict: show the compare modal instead of silently loading the other device's save.
- Push on pagehide too; 10s debounce while dirty.
- Newer-version saves: keep untouched, ask to refresh. Keep only 2 corrupt backups; "Restore backup" in Settings.
- Toast once when localStorage quota fails. Server-side jsonb size check (new migration).
- Make cloudSave.test.ts run on Node 20 by mocking ../lib/supabase.
Tests for every change.
```

### Batch 4: UX polish and accessibility ✅ Done 2026-10-05
_UX-1, 4..9, A11Y-1..4 and BAL-8 done. Layout audit (11 viewports × 13 states): genuine overlap kinds 7 → 1 (a phone's bottom-sheet card over the tucked dock, by design), no off-screen or clipped elements. Lighthouse accessibility 91 → 100. 528 unit + 12 e2e tests pass._
```
Read CLAUDE.md, CONTEXT.md and ASSESSMENT.md (UX-1, UX-4..9, A11Y-1..4, BAL-8).
Use Playwright MCP at 390x844, 375x667, 844x390 and 1440x900 to verify every fix with screenshots in qa/.
- Landscape overlaps (goal chip vs sheets, decor toolbar vs tray).
- 44px targets everywhere (chips, undo/redo, S/M/L, tray fold, compact banner ✕); 12px minimum text.
- First 5 minutes: only the onboarding bubble until step 1 is done; a permanent Feed button beside Tools.
- Portrait: larger fish (PORTRAIT_ZOOM or ×1.2 fish scale); shop filters collapse into one Filter button.
- Nameplate moves to the bezel's bottom-left; sell undo toast (5s).
- Fix Lighthouse contrast + label-name mismatches; arrow-key decor nudging in Decorate mode.
- After Lv20, rotating long-term goals in the goal chip.
Add the missing "UX Rules" section to CLAUDE.md.
```

### Batch 5: Launch plumbing (analytics, account, legal, CI) ✅ Done 2026-10-05 (needs owner actions, see below)
_LAUNCH-3/5, SEC-3/4, CODE-1/2/5, PRIV-1 done: 515 unit tests + 8 e2e pass, lint clean. Owner actions: deploy the `delete-account` function, add `{{ .Token }}` to the Supabase magic-link email template, run migration 002, set `VITE_ANALYTICS_KEY` in Vercel to enable analytics, fill the art section of CREDITS.md._
```
Read CLAUDE.md, CONTEXT.md and ASSESSMENT.md (LAUNCH-3..5, SEC-3, SEC-4, CODE-1, CODE-2, CODE-5, PRIV-1).
- Privacy-friendly analytics (PostHog EU or Plausible) with the ~12 events listed in LAUNCH-3, opt-out in Settings.
- "Delete my account & data": Supabase Edge Function using the service role + Settings flow with confirm.
- Supabase auth flowType 'pkce' with OTP-code fallback for cross-browser magic links.
- CREDITS.md + Settings → About & credits; remove third-party game names from comments.
- Update public/privacy.html (data, processors, retention, deletion, analytics).
- Move collectDrop/wipeAlgae rules into src/game with tests; ESLint + a GitHub Action running tsc/vitest/build.
- Add `npm run test:e2e` (Playwright) covering onboarding, feeding, petting, Decorate, breeding, login stub.
```
