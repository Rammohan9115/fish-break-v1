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
- **Toolbar "My Fish 🐟"** opens `ui/MyFish.tsx` (built with Petting & Bond, 2026-10-04). The toolbar also has 🎨 Decorate.
- **Checks:** `npm test` passes 416 tests (as of 2026-10-04) (`cloudSave.test.ts` fails to load under Node 20 when `.env.local` has Supabase keys: no native WebSocket), and `npm run build` passes. Local Node is 20.4, so Vite is pinned to 5 and Vitest to 2.
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
  Sprite size per species: `FISH_ART[...].spriteLen`, nose anchored at `mouthX`.
- **Sprite procedural animation (2026-10-03):** math lives in `render/fishMotion.ts` (pure, tested). Per-species `motion`
  {waveAmp, waveSpeed, gait 'swim'|'bob'|'walk'} and `eye` {adult, baby: {x, y, size}} (normalized to the *trimmed* sprite) are in `species.ts`.
  - Body wave: 20 strips, rigid front 30%, amplitude and speed scale with `speedFrac`; babies wave faster and bob; reduced motion keeps 30% (`REDUCED_WAVE`).
  - Strips are copied from a cached pre-scaled sprite (`scaledSprite`, widths bucketed by `SPRITE_SIZE_BUCKET_PX`). **Never key that cache on
    squash/stretch scale:** it changes every frame, thrashes the cache and dropped 24 fish to ~27fps.
  - Turning: `actor.turnStart/turnFrom`, eased 1→0→-1 over `TURN_MS`, speed dips mid-turn. `actor.tilt` is smoothed, ±20°.
  - `actor.stretch` (acceleration), `eatAt` (gulp squash), `pokeAt` (click bounce, all species via `renderer.poke`).
  - Living eyes are drawn over the sprite's own eye (`drawSpriteEye`); blink fills with skin color sampled around the eye; pupils follow
    the nearest pellet, else the mouse (`renderer.setPointer`, from TankView), else straight ahead.
  - Dev panel → "Sprite eye" (`ui/EyeEditor.tsx`): click the sprite to place the eye; it applies live and copies to the clipboard. Theme backgrounds: `public/assets/backgrounds/background<theme>.png`
  replace the baked back layer if present (drawn sand stays on top).

## Jellyfish (2026-10-04)
- **Species `jellyfish` ("Jelly", L10, 400 shells)**, trait `jelly`, gait `pulse`. Sprites are `public/assets/fish/jellyfish.png` / `jellyfish_baby.png`
  (lowercase `.png`). Variants are hue rotations of the pink sprite (`FishVariant.hue`, `sprites.huedSprite`/`hueRotatePixels`, cached per hue).
- **Config:** `SpeciesDef.bellSplitY {adult, baby}` (fraction of the trimmed sprite height). `SpriteEye.twinX` draws a second eye for front-facing faces (`drawSpriteEyes`).
  Live overrides: `jellyMotion.setBellSplitY`. Dev panel → "Bell split" (`ui/BellSplitEditor.tsx`). In the eye editor, shift-click places the twin eye.
- **Math:** `render/jellyMotion.ts` (pure, tested): `bellPulse` (contract to 0.85×1.1, expand with overshoot, `tempo` scales the duration),
  `tentacleOffset` (sway + after-pulse ripple travelling down + lean, envelope 0 at the split), `tentacleShape` (rise stretch / drift spread),
  `tentacleBox`/`inBox` (the catch area), `jellySize` (`JELLY_DESIGN_W` × `JELLY_ASPECT`; behavior can't read sprites).
- **Drawing:** `render/drawJelly.ts`. Per scaled copy (cached, with a baked inner glow), the tentacles are drawn first as `JELLY_TENTACLE_STRIPS`
  horizontal strips into one reused scratch canvas, then the bell (squash about its center; the tentacle tops follow its bottom edge). The result is blitted at
  `JELLY_ALPHA` with the night glow, the halo (cached sprite, `lighter`) and the shiny rainbow band (`source-atop`). Code-art fallback: `drawCodeJelly`.
  `drawFish` dispatches `speciesId === 'jellyfish'` there; `SPECIES_DRAW` excludes it.
- **Movement:** `behavior.updateJelly` (`actor.jelly` state: velocity, pulse timing, happy pulses, rise/lean, caught pellet, dance beat).
  `swimBounds` for jellies = upper `JELLY_MAX_Y_FRAC` of the water. `jellyFloorY` hard-clamps the center so the tips stay off the sand.
  Fish get `jellyAvoidance` from `BehaviorInput.jellies` (pooled zones in the renderer).
- **Renderer:** passes `current` (last frame's `currents.state.total`), `beat`/`beatTempo` (Dance Mode), and `reduced`. A catch calls `onEat` at once;
  the pellet slide-up is visual only (`JELLY_CATCH_SLIDE_MS`, and the gulp squash happens at the end). `poke` → `jellyHappy` + bubbles + heart.
- **Dance Mode** didn't exist before this. It is only a renderer flag for now (`renderer.setDance`, dev panel "💃 Dance Mode", `DANCE_BPM`), with no player-facing UI yet.
- **Perf:** 6 jellies + 20 fish at 60fps in headful Chrome at DPR 2; about 0.6ms CPU per frame for update+draw either way.

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
- UI: ⚙️ HUD button → `Settings.tsx` (Save progress ☁️ login form, email + Log out, Reset game with confirm); `SyncIndicator.tsx` badge; Google button behind `AUTH_GOOGLE_ENABLED` (true; needs the Google provider enabled in Supabase).
- Magic links use the implicit flow (`detectSessionInUrl`), so a link opened in another browser still works; `#error_description` → toast.

## Departures from the spec (data model)
- **Save version is 6.** Migrations in `src/store/save.ts`, keyed by the version they upgrade from:
  - **1→2:** adds `feedXp`, adds `ownedThemes` (built from the themes the tanks use), and defaults `boostUntil` to null.
  - **2→3:** adds `lastBreakXpAt`.
  - **3→4 (breeding overhaul):** each tank gets `upgrades` (old `round((capacity − 6) / 2)`, max 3) and `capacity = base[i] + 3 × upgrades`
    (base 10 / 12 / 15 by tank order). Adds `courtships: []`, `nursery: []`, and `breedingQuest` (`status: 'active'` for Lv5+, so they
    see the guide and quest once). Fish and eggs pass through untouched.
  - **5→6 (decor customization):** placed decor gets `flipped: false, size: 'M', depth: 'back'`; each tank gets `style` (DEFAULT_TANK_STYLE)
    and `layoutPresets: [null, null, null]`; `decorInventory: {}`, `ownedStyles: []`.
  - **4→5 (petting & bond):** every fish and Nursery baby gets `bondPoints: 0, bondLevel: 0, petLog: [], lastPettedAt: null, feedBondLog: []`.
- **`Fish.boostUntil: number|null`:** the premium 2× growth boost ends at this ms timestamp.
- **`GameState.feedXp {windowStart, earned}`:** the hourly 30-XP feeding cap. It's saved so reloads can't reset it.
- **`GameState.ownedThemes: ThemeId[]`:** a theme is bought once and can be applied to any tank.
- **`GameState.lastBreakXpAt: number|null`:** enforces Break XP at most once per hour.
- **v4 breeding fields (also in CLAUDE.md):** `Tank.upgrades`, `Egg.x` (where it was laid, so offline laying survives a reload),
  `GameState.courtships` (`{ fishIds, startedAt, endsAt, x }`), `GameState.nursery` (napping babies, `tankId: ''`, the sim never
  touches them), and `GameState.breedingQuest` (`{ guideSeen, status: 'off' | 'active' | 'done' }`).
- **`GameState.xp`** counts progress *within* the current level and resets to 0 on level-up. It is not lifetime XP.
- **Kept outside GameState:**
  - Onboarding progress lives in localStorage `fishbowl-onboarding`, as `"0"|"1"|"2"|"done"`. **Reset game must clear it.**
  - Eggs laid before v4 have no `x`; the renderer derives a stable spot from the egg id.

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
    completes courtships whose 60s ended (guaranteed egg), then applies XP.
  - `simulateOffline(state, now, rng?)` runs 60s steps capped at 8h and returns `{state, summary, events}`.
  - Also exported: `eatPellet` (pure), `createInitialState`, `createFish`, `createTank`, `stageProgress` (FishCard ETA),
    `algaeTouchedBySponge` (segment hit test), and the helpers `happinessTarget`, `driftHappiness`, `growthMultiplier`,
    `stageForGrowth`, `tankOccupancy` (hatched fish only).
- **`SimEvent` types:** `drop`, `autoCollect`, `stageUp`, `hatched{eggId, destination: 'tank'|'nursery'}`, `eggLaid{parentIds}`,
  `questComplete`, `algaeSpawned`, `pelletDissolved`, `levelUp`.
- **`breeding.ts` (player-driven, no dice for *whether*):**
  - Readiness: `canBreed` (adult, happiness ≥ 70, hunger ≥ 40, 30-min cooldown), `isReadyToPair` (+ not courting), `compatiblePartners`.
  - `breedingChecklist` → the FishCard's 5 ✅/❌ lines with hints; `notReadyReasons` for the panel.
  - `checkCourtship` / `startCourtship` (60s); `completeCourtships` runs inside `tick` (so it also completes offline) and lays a
    guaranteed egg at the courtship's `x` with `hatchAt = endsAt + hatchMinutes` (max(5, growMinutes/6)).
  - `offspringVariant` (45/45/10), `shinyChance`/`offspringShiny` (3% / 10%), `babyColorOdds` for the confirm sheet.
  - `breedingQuestStep(state, ui)` drives the "Your first baby" highlights. The reward itself is paid in `sim.hatchEggs`.
- **Capacity:** `tankOccupancy` counts hatched fish only (eggs and the Nursery don't take room). `hatchEggs` sends the baby to
  `state.nursery` when the tank is full. Upgrades: +3, max 5, `round(150 × 1.6ⁿ)`, unlock L4 (`economy.upgradeCostAt`, `baseCapacity`).
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
  - Draw order: water, rays, sand, bubbler, theme scenery, decor (all `layer: 'back'`, behind fish), pellets, bubbles, fish, indicators,
    front plants, then eggs and shell drops (always in front so they're never hidden), hearts, sparkles, pops, algae, glass.
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
  feed/premium (pellet) > fish select > decor. A tap on decor never moves it: hold `DECOR_LONG_PRESS_MS` to pick it up
  (selects it, opens DecorCard, lifts), then drag; the selected piece drags straight away. Moving before the hold completes pans instead. Sound triggers live here.
- **The other components:** Hud (level/XP/shells/pearls/tank chip/mute), Toolbar, FishCard (name edit, meters, growth ETA, breeding status,
  Move to tank, sell with confirm), DecorCard, Shop (four tabs, `PriceTag`), TankSwitcher, LevelUpModal, DailyGift (DOM overlay
  inside the tank), Onboarding, Toasts (at most 3), BreakMode (setup + active + end), Preview (static canvas fish/decor).
- **`DevPanel.tsx`:** dev-only, lazy-loaded behind `import.meta.env.DEV`, so it's stripped from production. Phase 11 says to remove it from prod; that's already true.

**`src/audio/sound.ts`**
- `SoundEngine` with a `sound` singleton: `play('plop'|'coin'|'chime'|'squeak'|'bubble')`, `setMuted`, `unlock`, `setAmbience`.
- Muted by default, and no AudioContext is created until unmuted. Repeats are rate-limited.
- Ambience plays only during Break Mode. The engine accepts a fake audio context for tests.

## Decor collections (Stage A of decor-customization.md, 2026-10-04)
- **Catalog:** `DECOR` in constants has `collection` and `placement` (sand/surface/mid) and no `unlockLevel`. Decor is never level-gated: `UNLOCK_LEVEL.decorShop` is gone, as are the decor entries in `UNLOCKS`.
  `COLLECTIONS` lists the collections; Halloween has `event: 'october'`.
- **Rules (`game/decor.ts`, tested):** `decorAvailable` (October event, `PurchaseError 'event'`), `activeSets` (3 different items, or all of a smaller collection),
  `decorHappiness` (+3 unique, +1 duplicate, cap 20, +5 per set; used by `sim.happinessTarget`), `decorHappinessGain`, `collectionProgress`, `setProgress`.
- **Sprite sheets:** `DECOR_ART[id].rect` cuts the item out of `public/assets/elements/<collection>.PNG`. `assets.ts` loads each file once and crops before `cleanSprite`.
  The alpha-0 pixels in the nature/playful sheets carry colored "glow" data, which is invisible and harmless.
- **New behaviors (`decorBehaviors.ts`):** roll, nightGlow (`anchors.glows`), sparkle, bob, spin, bubbleRing (`particles.spawnRing`), giftFlag, eruption, curtain, drift, propeller.
  - `DecorBehaviors.restY` (placement), `motion` (bob/drift/roll/spin offsets, also used by hit tests) and `attractors`.
  - `surfaceTop` and `giftReady` are set by the renderer each frame.
- **Decor visits (`ambient/decorVisits.ts`):** idle fish get a `seek` through the arch or curtain, or hover at an anemone (clownfish favor it). Food, courtship and petting win.
- **Set effects (`ambient/setEffects.ts`):** a pooled particle set per active collection, drawn after the decor lights.
- **Mailbox:** tapping it while the daily gift is waiting claims the gift (TankView), shown as a toast.
- **Verified:** all 22 items day and night in headless Chrome. With 8 decor, 20 fish and a set effect, update+draw takes ~3ms per frame.

## Decorate mode & tank styles (Stage B, 2026-10-04, save v6)
- **Rules (`economy.ts`, tested in `customize.test.ts`):**
  - `buyDecor` sends overflow to the box (`boxed: true`). Also `buyAndPlaceDecor` (Try it), `placeFromBox`, `storeDecor`, `updateDecor`, `sellBoxedDecor`.
  - `savePreset` and `applyPreset`, which returns `skipped`.
  - Styles: `ownsStyle`, `checkBuyStyle`/`buyStyle`/`applyStyle`, `setTankStyleExtras`.
  - `decor.ts`: `maxDecor` (15 + 3/upgrade), `newPlaced`, `boxCount`. `STYLE_OPTIONS`, `STYLE_CATEGORIES` and `DEFAULT_TANK_STYLE` are in constants.
- **Store:**
  - `mode: 'decorate'`.
  - `decorHistory` (undo/redo snapshots of `{tank decor, decorInventory}`, 20 max). `recordDecor` runs before changes, and TankView calls it at drag start.
    Selling clears the history; leaving Decorate mode clears it too.
  - `tryDecor` with `startTry`/`moveTry`/`confirmTry`/`cancelTry`, `stylePreview`, `trayTab`. `ShopTab` gained `'styles'`.
- **Renderer:**
  - `getDecorView` (decorating, tryDecor, stylePreview).
  - Decorate mode: fish alpha 0.5 and a 0.4 edit glow on all decor.
  - Drawing: the `__try` ghost at alpha 0.65, front-depth sand decor drawn after the fish (`isFront`), `setSnapGuide`, and `decorScreenPoint` (toolbar placement).
  - `DecorBehaviors.pointAt` maps anchors through size/flip/motion. Draw scales by `DECOR_SIZE_SCALE` and flips.
- **Styles:**
  - `render/drawSubstrate.ts`: a `SubstrateLayer` baked per substrate × k × extent, plus glow-gravel specks after the scene light. Also `drawWaterTint` (before the fish) and `drawLightingTint` (after the scene light), both soft-light.
  - `Particles.bubbler` covers classic/off/curtain/hearts (heart bubbles).
  - `ui/TankFrame.tsx`: an SVG bezel (outer rect minus inner rounded rect, per-skin gradient) plus the nameplate, at layer `--z-frame` (10).
- **UI:**
  - `DecorTray` (Box/Layouts/Tank Style; folds on phones), `DecorToolbar` (floating), `StylePicker` (shared with the shop's Styles tab).
  - The Decorate/Try banners live in `TopChip`.
  - Shop decor filters, a "New" badge (localStorage `fishbowl-decor-seen`), and 👀 Try it.
  - Snapping: `render/snap.ts` (`snapX`, tested).

## Decor customization: Stage C (2026-10-04)
- **Performance:** measured on a 390×844 viewport at DPR 3 with a 4× CPU throttle.
  - 20 fish with 0 decor: ~8.0 ms/frame. With 15 behavior decor, a substrate and a frame: ~7.3 ms/frame (no measurable decor cost).
  - Static work is already cached: scaled decor copies (`scaledSprite`), the substrate (`SubstrateLayer`, re-baked only on substrate/size change), and the frame (a DOM SVG, re-rendered only on resize/style).
  - A separate "static decor layer" was skipped: no measurable gain, and most decor animates.
- **Dev panel → Decor:**
  - "🎁 Give all decor + styles": one of every piece into the box, plus every paid style.
  - "🎃 Halloween event: by date / forced on": store `eventForced`, read through `eventClock()` by the shop and decor purchases.
- **E2E:** Playwright isn't set up, so puppeteer-core scripts (kept outside the repo) covered the flow: Decorate mode → place from tray → flip/front/size → undo/redo →
  drag + snap → save/apply preset → frame/substrate/lighting/water → Try it → Buy & Place, phone layout, and perf.

## Petting & Bond (2026-10-04, save v5)
- **Rules, `game/bond.ts` (pure, tested in `bond.test.ts`):**
  - `completePetSession` (+3 bond, +5 happiness, +1 XP; capped to 3 per rolling hour via `petLog`, then +2 happiness only).
  - `grantFeedBond` (+0.2, max +2/hour via `feedBondLog`), `startBondFor` (both parents Buddy+ → 10, stored on `Egg.startBond`).
  - `bondDropValue` (Best Friend+ → `ceil(×1.1)`, used by `sim.addDrop`), `TRICKS`/`SIGNATURE_TRICKS`, `nextBondLevel`.
  - Bond is only ever added (`addBond` takes the max). The sim never touches it otherwise.
- **Store:**
  - `petFish`, `playTrick` (5s `trickCooldowns`, transient), `toggleFollow` (`follow`, transient), `setPetProgress` (FishCard aria-live).
  - `dropPellet(x, premium, nearFishIds)` fills a module-level `nearPellets` map (not saved); `eatPellet` grants feed bond from it.
  - `subscribeBondEvents` emits `levelUp | trick | follow | greet` (greet when `advanceTo`'s offline path or `startGame` sees ≥30 min away).
  - Dev: `setBondLevel`, `resetPetCaps`, `greet` (dev panel → Bond).
- **Renderer:**
  - `render/bondFx.ts` (`BondFx`, owned by the Renderer): petting meter/hearts/sparkles, hellos, follow, greeting, trick effects, level-up burst + demo.
  - `render/petting.ts` (pure, tested): `PetMeter`, `StrokeDetector` (ring buffer), `trickPose`/`trickVisual`.
  - `behavior.ts`: `BehaviorInput.pet` (`updatePetted`: settle, face the pointer, lean, drift) and `seek` (overrides wander; food still wins).
    For jellies both act like a courtship target.
  - Renderer API: `fishToPet` (+`PET_HITBOX_PAD`), `fishNear`, `petStart/petMove/petEnd`, `playTrick`, `setFollow`, `greet`, `sayHi`,
    `celebrateBond`. Deps `onPetComplete` / `onPetProgress`.
  - Eyes use the existing happy blink arc (`blinking || petting`).
- **Particles are pooled** (`Pool<T>` with in-place compaction). New: `spawnHeartBurst`, gold hearts, `spawnRing` (hoop / heart bubble),
  `spawnStreak`, colored sparkles (`RAINBOW`).
- **Input (`TankView`):** a fish press is a `press` gesture; after `PET_HOLD_MS` it becomes `pet`. The tap fires on release.
  A double-tap within `DOUBLE_TAP_MS` on a Friendly+ fish cycles its tricks. The canvas is focusable: ←/→ pick a fish, hold Space to pet.
  The pet tip shows once (`fishbowl-pet-tip-shown`).
- **UI:** `ui/BondSection.tsx` (`BondBadge`, `bondNameClass` for the Soulmate glow), `ui/MyFish.tsx` (panel `'myfish'`). Onboarding step 4 is "Pet your fish".
- **Sound:** `bloop` (soft two-note rise) on a completed session.
- **Verified:** headless-Chrome E2E (long press, early release, stroking, cap → content, trick cooldown, double-tap, keyboard,
  My Fish, sell wording). With 20 fish while petting: ~2ms update+draw per frame.

## Breeding UI map (v4)
- Store UI state: `pairingFishId` (pairing mode), `pairSheet` (confirm), `breedingTab`, `guideOpen`; actions `startPairing`,
  `pickPartner`, `cancelPairing`, `confirmCourtship(x)`, `moveFromNursery`, `rehomeBaby`, `openBreeding`, `openGuide`/`closeGuide`.
  The guide opens after the Lv5 modal (`dismissLevelUp`) or on load for Lv5+ players with `guideSeen: false`.
- UI: `FishCard` Breeding section, `PairingBanner`, `PairSheet`, `BreedingPanel` (Pairs/Nursery), `BreedingGuide`, `QuestBanner`,
  shared hooks in `ui/useBreeding.ts`; toolbar 💕 Breed (locked before Lv5); HUD "🐟 7/10" + Upgrade at ≥80%.
- Renderer: `getBreedingView` (from TankView) → 💕 markers, pairing dim/fade/glow, courtship heart loop (`behavior.heartPoint`,
  mirror halves, shared wave phase, floating hearts), 👇 quest arrow, egg at `egg.x`, newborn spin, shiny gold burst.
- Dev panel → Breeding: Make ready, Finish courtship, Hatch eggs now, Fill tank.

- **Tool-mode banners** (Feed/Premium/Clean) use `Banner compact`: a slim pill under the XP bar so the tank stays visible.

## Lessons learned (don't repeat these)
- **Breeding checks are no longer clock-based** (the old "shift Date.now" trick is obsolete): use the dev buttons, or set
  `courtships[].endsAt` / `eggs[].hatchAt` to now and call `advanceTo`.
- **Vite HMR can leave two copies of a module in the page** (edited files reload under `?t=` URLs). A dev-console `import()` may then talk
  to a stale copy: reach live state through `window.__renderer` / its deps, or reload after edits.
- **Synthetic browser checks:** in a background tab, rAF only fires around screenshots, so run `renderer.update/draw` by hand
  for animation checks. Resizing clears the canvas while the loop is stopped.
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
