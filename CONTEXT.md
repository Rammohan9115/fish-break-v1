# Fishbowl Break: Build Context

Read this before working on the project. It records what's built, where things live, where the code
departs from CLAUDE.md (the spec), and lessons learned the hard way. CLAUDE.md is still the source of truth for game rules.

## Status (as of 2026-10-02)
- **Done:** PROMPTS.md Phases 1–10 (scaffold, sim, store/save, renderer/art, feeding/FishCard/onboarding,
  economy/shop/levels, cleaning/daily gift, breeding, decor/themes/tanks, Break Mode/sound).
- **Partly done, Phase 12:** deployed to Vercel and the title is set. Still needed: favicon (cartoon fish SVG) and meta tags.
- **Not started, Phase 11 (polish + balance):** check 360px mobile layout, touch for feed/clean/decor drag,
  empty states, a **Settings menu with Reset game (confirm) and a reduced-motion toggle** (`settings.reducedMotion`
  exists, but nothing in the UI changes it), and `scripts/balance.ts` pacing sim. Targets: Lv5 by end of day 1, Lv8 by day 3.
- **Toolbar "My Fish 🐟"** still shows "coming soon". The spec lists it, but no phase prompt covers it.
- **Checks:** `npm test` passes 237 tests in 9 files, and `npm run build` passes. Local Node is 20.4, so Vite is pinned to 5 and Vitest to 2.
- **Repo:** https://github.com/Rammohan9115/fish-break-v1 (branch `main`).
- **Live:** https://fishbowl-break.vercel.app. Deploy with `npx vercel --prod --yes`; the CLI is already logged in and linked (`.vercel/`, which is gitignored).
  GitHub auto-deploy isn't connected (`npx vercel git connect`). The `.vercel` line in `.gitignore` may still be uncommitted.

## Art direction: NOW "Art Style" in CLAUDE.md (glossy chunky cartoon)
- **2026-10-02:** the user switched to the CLAUDE.md "Art Style" section (glossy, saturated, thick dark outlines, physical aquarium with frame, stand and room).
  **Implemented:**
  - **Shared glossy routine:** `paint.ts` `celShade(ctx, path, [x,y,w,h], colors, lw)` gives a saturated gradient (light top → dark bottom), a white
    `glossHighlight` at the top-left, and an outline at `lw × GLOSS_OUTLINE_SCALE` in a darker shade of the fill (never black).
    `dropShadow()` draws shadows on the sand. All decor, pebbles, shells and pellets use it.
  - **Fish:** glossy gradient bodies, big cartoon eyes, `FISH_CHUNK` 1.14 vertical stretch, `OUTLINE_PX` 3.4, `FISH_ART_SCALE` 1.45.
    Candy palettes in `species.ts` (variant `outline` = darker shade of `body`). Shadows on the sand under each fish (renderer).
  - **Depth layers:**
    - Back plants are baked, blurred (`ctx.filter`) and darker, in `bakeBackLayer`.
    - Fish are the middle layer.
    - `drawFrontPlants` draws after the fish, at the bottom corners.
  - **The aquarium as an object (CSS):** `.aquarium` > `.aquarium-frame` > `.tank`, plus `.aquarium-stand`; the reflection streak is `.tank::after`.
    The blurred room is `.app::before`. `--hud-h`/`--stand-h`/`--toolbar-h` reserve space, and Break Mode hides the furniture.
- **PNG fish sprites (2026-10-03):** `render/sprites.ts` preloads `public/assets/fish/*.PNG` (explicit `FISH_FILES` map, case-sensitive; short names
  angel/axo/clown; tetra baby is `tetrababy1.PNG` because `tetrababy.PNG` is a copy of the adult) behind `ui/LoadingScreen.tsx`. At load it strips
  baked-in checkerboard backgrounds (edge flood-fill), trims and downscales to `SPRITE_MAX_PX`. `drawFish` uses the sprite when present
  (strip-sliced sine body wave, squash & stretch, tilt, flip, puff, gold glow for shiny, night glow), else the code art. Sprites ignore color variants.
  Sprite size per species: `FISH_ART[...].spriteLen`, nose anchored at `mouthX`. Theme backgrounds: `public/assets/backgrounds/background<theme>.png`
  replace the baked back layer if present (drawn sand stays on top).

## Previous art direction (BotW; partly superseded: the drawFish structure and paint helpers remain)
- **The user changed the direction to Breath-of-the-Wild-inspired painterly cel shading.** Fish, tank, decor, scenery and sprites are done. Still in the old pastel style: the UI chrome (HUD, toolbar, cards, shop), eggs, and the page background around the tank.
- **`render/paint.ts`** is the shared toolkit: `mix`, `rgba`, `hashSeq`, `crescent`, `blobPath`, `celShade(ctx, path, w, h, colors, lw)`
  (base fill, two shadow crescents bottom-right, lit crescent top-left, rim, soft outline). Use it for any new art.
- **Tank layers (`drawTank.ts` + renderer):**
  - **Baked into offscreen canvases** per theme, size and DPR (`Renderer.drawBaked`):
    - `bakeBackLayer`: water, light pool, hazy ridges and rock spires, floor haze.
    - `bakeFrontLayer`: sand, dunes, grain, cel-shaded stones and moss, framing rocks.
  - **Drawn live:** god rays, background grass (`drawBackGrass`), caustics (drifting dashed filaments with a glow), surface shimmer,
    bubbler, theme scenery, then a per-theme `ambient` multiply tint after the fish (night = moonlit blue, pond = green).
    Night palette colors are deliberately brighter to compensate for that tint.
  - **Motes:** `Particles.drawMotes`.
  - **Performance:** 60fps with 20 fish at 2× DPR.
- **Decor (`drawDecor.ts`):** fern rosette, eelgrass, mossy boulder, ruined stone tower, iron-banded chest (gold glow and light shafts when open),
  and a wreck with barnacles. `DECOR_BOUNDS` is used for hit tests and previews.
- **Scenery (`drawScenery.ts`):** coral = branching coral, sea fans, brain and tube coral. Pond = lily pads seen from below, reeds, a sunken branch.
  Night = glow anemones and plankton.
- **The `drawFish.ts` pipeline:**
  - `bodyPath(profile)` returns a fill path plus an open outline (`edge`) that skips the tail root, so no seam shows.
  - `shadeBody` paints a countershaded gradient, patterns, scale arcs and brush dabs.
  - **Cel bands use `crescent(body, dx, dy)`:** body plus a shifted copy, filled with `'evenodd'`, so each band follows the contour.
    They give two shadow steps, a bounce-light crescent, a lit crescent along the back, a hot spot and a rim light.
  - The outline is soft and colored (alpha 0.7).
  - Fins are translucent gradients with rays (`paintFin`). Eyes have a golden iris (`eye`), and fish get gill covers and a mouth notch.
  - Shading tones come from each variant (`shadesFor`): cool blue-violet shadows, warm cream light.
- **Palettes in `species.ts` are natural and earthy.** Variant keys are unchanged, so saves still work.
- **`DEV_TOOLS_IN_PRODUCTION`** (constants.ts) is currently `true`, so the dev panel ships to production, collapsed. Set it to false to remove it.

## Layout and camera (full-bleed, FishVille-style)
- **The canvas fills the whole screen on every device.** There's no room, frame or stand anymore: the user rejected them and supplied FishVille reference shots.
  The HUD and tool dock float over the water.
- **Camera (`Renderer.resize`):**
  - **Wide screens** fit the world's height and extend scenery sideways.
  - **Tall screens** zoom to `PORTRAIT_ZOOM` × fit-width and pan horizontally (drag on empty water, or drag after a feed tap).
    The extra height goes mostly above the world (`EXTRA_HEIGHT_ABOVE`).
  - The world stays 1000×625 for the sim; `Extent` tells `drawTank` layers how far to paint.
  - Baked layers cover the full pannable extent, so panning never re-bakes.
  - `setSwimExtent` (behavior.ts) lets fish swim anywhere visible.
- **Input:** `TankView` must not reject points outside 0..1000 × 0..625 (that bug blocked taps in the extended water).
- **HUD (`Hud.tsx`):** green coin bar, blue pearl bar, round mute and fullscreen buttons, an XP bar with a star level badge, and a purple tank tag that opens Tanks.
- **Tool dock:** purple, bottom-right; full-width on phone portrait. CSS is in the "Full-bleed game layout" section at the end of `styles.css`, with phone portrait and landscape variants and `env(safe-area-inset-*)`.
- **Fullscreen:**
  - Phones held sideways go fullscreen on the first tap (`useLandscapeFullscreen`, `ui/fullscreen.ts`).
  - iPhone Safari has no element fullscreen, so `index.html` has web-app meta tags for Add-to-Home-Screen.
  - Break Mode only exits fullscreen if it entered it.
- **Pan tip:** shown once (localStorage `fishbowl-pan-tip-shown`).
- **iPhone address bar:** iPhone browsers have no element fullscreen API, so they can't hide the address bar. `IosInstallHint` shows once in landscape
  (localStorage `fishbowl-ios-install-hint-dismissed`) and explains Add to Home Screen. `public/manifest.webmanifest` (`display: fullscreen`)
  and `public/icon.svg` (also the favicon) let it install fullscreen on Android and iOS.
- **Eyes:** `EYE_SCALE` 2.05 / `EYE_SCALE_BEAD` 1.6 in drawFish.ts, with a colored iris ring, two sparkles, an upturned smile (downturned when sad),
  and a happy closed-eye arc when blinking.
- **Dev-only debugging handle:** `window.__renderer`.

## Auth & cloud save (Supabase, client-only)
- `src/lib/supabase.ts`: client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; `null` → local-only mode (no Account section in Settings).
- `supabase/migrations/001_saves.sql`: `saves` table (one row per user), RLS select/insert/update own row, trigger sets `updated_at = now()` on every write.
- `src/store/cloudSave.ts`: `CloudSync` engine behind a `CloudBackend` interface (Supabase in prod, `FakeBackend` in `cloudSave.test.ts`). `useCloudStore` {enabled, user, status, conflict}. `startCloudSync()` is called from App after `startGame()`.
  - Meta in localStorage `fishbowl-cloud-meta` = {userId, lastSyncedAt}. Login: no row → upload; same user and cloud updated_at ≠ lastSyncedAt → load cloud; first login on device with local progress (`hasProgress`) → CloudConflictModal.
  - Saves: 30s debounce on store changes plus on tab hidden; `updateIf(.eq('updated_at', lastKnown))`, so an empty result means another device wrote → load theirs. Unparseable cloud data → status 'error', never overwritten.
  - Logout: final save (5s cap), signOut, clear `fishbowl-save` and meta, fresh guest game.
- UI: ⚙️ HUD button → `Settings.tsx` (Save progress ☁️ login form, email + Log out, Reset game with confirm); `SyncIndicator.tsx` badge; Google button behind `AUTH_GOOGLE_ENABLED` (false).
- Magic links use the implicit flow (`detectSessionInUrl`), so a link opened in another browser still works; `#error_description` → toast.

## Departures from the spec (data model)
- **Save version is 3.** Migrations in `src/store/save.ts`, keyed by the version they upgrade from:
  - **1→2:** adds `feedXp`, adds `ownedThemes` (built from the themes the tanks use), and defaults `boostUntil` to null.
  - **2→3:** adds `lastBreakXpAt`.
- **`Fish.boostUntil: number|null`:** the premium 2× growth boost ends at this ms timestamp.
- **`GameState.feedXp {windowStart, earned}`:** the hourly 30-XP feeding cap. It's saved so reloads can't reset it.
- **`GameState.ownedThemes: ThemeId[]`:** a theme is bought once and can be applied to any tank.
- **`GameState.lastBreakXpAt: number|null`:** enforces Break XP at most once per hour.
- **`GameState.xp`** counts progress *within* the current level and resets to 0 on level-up. It is not lifetime XP.
- **Kept outside GameState:**
  - Onboarding progress lives in localStorage `fishbowl-onboarding`, as `"0"|"1"|"2"|"done"`. **Reset game must clear it.**
  - An egg's x on the sand is renderer-only. After a reload it uses a stable position derived from the egg id.

## Architecture map
**`src/game/`** is pure TypeScript: no DOM, deterministic given (state, dt, rng). Tests sit next to the code.
- **`constants.ts`:** every balance and tuning number, also tank space, behavior, render, sound, UI and save keys.
- **Tank space:** logical units 1000×625; sand top `SAND_Y`=560; the renderer scales this to pixels.
- **`types.ts`:** the data model; `Rng = () => number`.
- **`species.ts`:** `SPECIES`, `SPECIES_LIST`, `getVariant`, `randomVariantKey`, and shiny colors.
- **`levels.ts`:** `xpToNext`, `applyXp`, `grantXp(state, n)` (which pays `level*10` shells per level), and `UNLOCKS`/`unlocksAtLevel`.
- **`sim.ts`:**
  - `tick(state, dtMs, rng)` returns `{state, events: SimEvent[]}`. It uses structuredClone and sets now = `lastTickAt + dtMs`.
    Each tick hatches eggs, moves pellets (sink, land, dissolve after 60s with −3 cleanliness and an algae spot),
    decays cleanliness (algae at the 80/60/40/20 crossings, max 12), updates each fish (hunger, happiness drift, growth, stage, drops),
    runs a breeding check when crossing a 5-minute *clock* boundary, then applies XP.
  - `simulateOffline(state, now, rng?)` runs 60s steps capped at 8h and returns `{state, summary, events}`.
  - Also exported: `eatPellet` (pure), `createInitialState`, `createFish`, `createTank`, `stageProgress` (FishCard ETA),
    `algaeTouchedBySponge` (segment hit test), and the helpers `happinessTarget`, `driftHappiness`, `growthMultiplier`,
    `stageForGrowth`, `tankOccupancy` (eggs count).
- **`SimEvent` types:** `drop`, `autoCollect`, `stageUp`, `hatched{eggId}`, `eggLaid{parentIds}`, `algaeSpawned`, `pelletDissolved`, `levelUp`.
- **`breeding.ts`:** `canBreed`, `eligiblePairs`, `hasReadyPartner`, `runBreedingCheck` (25% per pair, parents' cooldowns start,
  needs a free slot), `offspringVariant` (45/45/10), `offspringShiny` (3% or 10%), `hatchMinutes`, `isBreedingCheckDue`.
- **`economy.ts`:**
  - Purchases return `Result = {ok,state,levelsGained} | {ok:false, reason: PurchaseError}`.
  - Buy/sell: `checkBuyFish`/`buyFish` (+5 XP), `sellValue`/`sellFish` (juvenile 40%, babies can't be sold), `buyPremiumFood`, `feedingXp`.
  - Decor: `buyDecor`/`sellDecor` (refund 50%), `pickDecorX`, `moveDecor`/`clampDecorX`.
  - Tanks: `capacityUpgradeCost`/`buyCapacityUpgrade`, `nextTankPurchase`/`buyTank`, `buyTheme`/`applyTheme` (theme-only species block),
    `checkMoveFish`/`moveFish`, `renameTank`.
  - Daily gift and breaks: `claimDailyGift`/`localDateKey`, `breakXpAvailable`/`completeBreak`.
- **`names.ts`:** `randomName(rng, exclude)`.
- **`testUtils.ts`:** `T0`, `seededRng`, `constRng`, `makeFish`, `makeTank`, `makeState`.

**`src/store/`**
- **`gameStore.ts`:** a single Zustand store, `useGameStore`.
  - **State:** `game`, `loaded`, `mode` ('look'|'feed'|'premium'|'clean'), `selectedFishId`, `selectedDecorId`, `onboardingStep`,
    `panel` ('shop'|'tanks'|'break'|null), `shopTab`, `breakSession`, `toasts`, `pendingLevelUps`, `lastPelletAt`.
  - **Actions:** each economy action is wrapped by `commitResult`, which shows a toast on failure using `PURCHASE_ERROR_TEXT`
    and queues level-ups (those show the LevelUpModal, not a toast).
  - **`advanceTo(now)`** runs 1s ticks. A gap of 60s or more uses `simulateOffline` plus the "While you were away" toast.
  - **Live events only:** breeding toasts and `subscribeSimEvents` listeners fire for live ticks, never for offline catch-up.
  - **`startGame(env)`** loads the save and onboarding, sets `loaded`, and starts the 1s interval and autosave.
    It returns a stop function that also saves.
  - **`dev.*`:** spawnFish, clearFish, setMood, setTheme, used by the dev panel.
- **`save.ts`:** `loadGame` (corrupt saves are backed up to `fishbowl-save-corrupt-<ts>` and the game starts fresh; returns `isNew`),
  `saveGame`, `migrate`, `isValidGameState`, `startAutosave` (every 10s, on visibilitychange→hidden, and on beforeunload),
  `formatOfflineSummary`, `loadOnboarding`/`saveOnboarding`. `testEnv.ts` provides fake storage/window/document.

**`src/render/`** (canvas only; fish positions live here and are never saved)
- **`renderer.ts`, the `Renderer` class:**
  - DPR resize, rAF loop.
  - Hit tests and coordinates: `toTank`, `fishAt`, `dropAt`, `decorAt`.
  - Effects: `popDrop`, `wipeEffect`, `suds`, `poke` (puffer inflate).
  - `handleEvents(SimEvent[])`: heart between the pair, egg x under the parents, hatchling spawns at its egg.
  - Draw order: water, rays, sand, bubbler, theme scenery, decor, eggs, drops, pellets, bubbles, fish, indicators,
    hearts, sparkles, pops, algae, glass.
  - Pellet y is extrapolated between sim ticks.
- **`behavior.ts`:** `createActor`/`updateActor` (steering with a turn-rate limit, edge avoidance, food seeking with wider
  bounds so fish can reach sand and surface, tetra schooling, axolotl band near the bottom, flip easing,
  blink and sad/hungry indicators), `swimBounds`, `mouthPoint`. It has tests.
- **Drawing modules:**
  - `drawFish.ts`: one function per species, plus the `FISH_ART` metadata.
  - `drawDecor.ts`: plus `DECOR_BOUNDS`, `chestOpenAmount`.
  - `drawEgg.ts`.
  - `drawTank.ts`: `THEME_PALETTES`, water, rays, sand, bubbler, algae, glass.
  - `drawScenery.ts`: coral, pond and night extras.
  - `particles.ts`: bubbles, sparkles, coin-pop text, hearts, pellet and drop sprites.

**`src/ui/`** (React; overlays only)
- **`App.tsx`:** mounts everything; during Break Mode it renders only TankView and BreakMode. It runs `useSoundSync` and the global Esc handler.
- **`TankView.tsx`:** owns the canvas and input gestures. Press priority: break (poke only) > collect drop > clean (sponge drag) >
  feed/premium (pellet) > fish select > decor (select + horizontal drag). Sound triggers live here.
- **The other components:** Hud (level/XP/shells/pearls/tank chip/mute), Toolbar, FishCard (name edit, meters, growth ETA, breeding status,
  Move to tank, sell with confirm), DecorCard, Shop (four tabs, `PriceTag`), TankSwitcher, LevelUpModal, DailyGift (DOM overlay
  inside the tank), Onboarding, Toasts (at most 3), BreakMode (setup + active + end), Preview (static canvas fish/decor).
- **`DevPanel.tsx`:** dev-only, lazy-loaded behind `import.meta.env.DEV`, so it's stripped from production. Phase 11 says to remove it from prod; that's already true.

**`src/audio/sound.ts`**
- `SoundEngine` with a `sound` singleton: `play('plop'|'coin'|'chime'|'squeak'|'bubble')`, `setMuted`, `unlock`, `setAmbience`.
- Muted by default, and no AudioContext is created until unmuted. Repeats are rate-limited.
- Ambience plays only during Break Mode. The engine accepts a fake audio context for tests.

## Lessons learned (don't repeat these)
- **React StrictMode runs `startGame` twice in dev.** The first cleanup saves the game, so on the second run `isNew` is false.
  That's why onboarding step 0 is saved to storage the moment a new player is detected.
- **The store starts with a placeholder `createInitialState()` before the save loads.** UI that depends on saved state must wait for `loaded` (the gift box does).
- **Audio levels:** the first version peaked at −14 to −28 dBFS, and the user heard nothing. A DynamicsCompressor squashed the short blips by
  another ~10 dB, so it was removed. Current peaks are −5 to −10 dBFS with master gain 0.9. Measure with
  `OfflineAudioContext` in headless Chrome before changing levels.
- **Audio unlock:** Safari/iOS only allow audio inside `click`/`touchend`/`keydown`, not `pointerdown`, and Safari has an
  `'interrupted'` state. `App.useSoundSync` unlocks on every gesture type (capture phase). `unlock()`/`play()` resume any
  non-running state, prime iOS with a silent buffer once, and set `navigator.audioSession.type='playback'` so iPhones play even
  with the silent switch on. Unmuting plays a coin pop as confirmation. Check what actually reaches the speakers by wrapping
  `AudioContext` in puppeteer (an AnalyserNode on destination) and clicking through the real UI.
- **Breeding checks are tied to the clock** (5-minute boundaries of absolute time). To test them live in a browser, shift `Date.now`.
- **A theme purchase can't always be applied** when a theme-only species lives in the tank. The toast says why, and the theme stays owned.
- **The toolbar must never cover the sand.** `.app` reserves `--toolbar-h` below the tank (92px, or 156px at ≤560px wide).
- **A fish flipping direction never shrinks below `MIN_FLIP_SCALE`;** otherwise it vanishes mid-turn.

## How work was verified
- **Unit tests:** Vitest for every sim, economy and store rule. Tests use `vi.useFakeTimers()` with `setSystemTime(T0)`.
  A store test resets state with `useGameStore.setState({toasts: []})` and then `loadState(makeState(...))`.
- **Visual and end-to-end checks:** puppeteer-core (installed in a session scratchpad, not the repo) drove system Chrome against
  `npx vite --port 5199`. Scripts import modules directly in the page: `await import('/src/store/gameStore.ts')`.
  This is how state is set up and inspected, and how screenshots are taken. Close the dev panel and press "Skip tips" first.

## Conventions
- **Every balance number lives in `constants.ts`/`species.ts`.** No `any`. Strict TypeScript, including `noUncheckedIndexedAccess`.
- **After each change:** `npm test` and `npm run build` must pass.
- **Commits:** the user commits themselves unless they ask. Keep commits on `main`, with attribution lines per the harness.
