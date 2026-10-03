# Fishbowl Break — Project Spec

> **Before working:** read `CONTEXT.md` for build status, architecture map, spec deviations (save v3 fields), and gotchas.

A cozy, cartoonish virtual fish tank in the browser. Players feed fish, watch them grow, breed them, earn shells, and unlock new species, decor, and tanks. It is built for working people taking 5-minute breaks: calm, cute, zero guilt.

## Design pillars (never violate these)
1. **Nothing dies.** Neglect makes fish sad and pauses growth. That's the worst outcome.
2. **Every visit feels rewarding,** even a 2-minute one.
3. **No punishment for absence.** No streak loss, no decay beyond the offline cap.
4. **Quiet by default.** Sound starts muted (people play at work).
5. **Cute over realistic.** Big eyes, round bodies, pastel colors, soft outlines.

## Tech stack
- Vite + React 18 + TypeScript (strict)
- Rendering: HTML Canvas 2D with a custom render loop (`requestAnimationFrame`). No game engine.
- React is used ONLY for UI overlays (HUD, shop, modals, toolbar), never for drawing fish.
- State: Zustand, persisted to localStorage via a custom save module (plus optional Supabase cloud saves, see below)
- Accounts & cloud saves: Supabase (`@supabase/supabase-js` used directly from the client; no custom backend)
- Tests: Vitest for all simulation logic
- Styling: plain CSS modules or a single `styles.css`; no UI library
- All art is drawn in code (Canvas paths). No external image assets.
- Sound: Web Audio API, synthesized (no audio files)

## Folder structure
```
src/
  game/            # Pure TS simulation. NO DOM, NO React imports.
    types.ts
    constants.ts   # All balance numbers live here
    species.ts
    levels.ts
    sim.ts         # tick(state, dtMs) and offline catch-up
    breeding.ts
    economy.ts
    names.ts       # Random cute fish names
  render/          # Canvas drawing + fish movement/animation
    renderer.ts
    drawFish.ts
    drawTank.ts
    behavior.ts    # Wander, chase food, flip direction
    particles.ts   # Bubbles, sparkles, food pellets
  ui/              # React components
    Hud.tsx
    Toolbar.tsx
    Shop.tsx
    FishCard.tsx
    TankSwitcher.tsx
    BreakMode.tsx
    Toasts.tsx
    LevelUpModal.tsx
    DailyGift.tsx
  store/
    gameStore.ts
    save.ts        # Versioned save + migrations
  audio/
    sound.ts
  App.tsx
  main.tsx
```

## Data model
```ts
type Stage = 'egg' | 'baby' | 'juvenile' | 'adult';

interface Fish {
  id: string;
  speciesId: SpeciesId;
  name: string;           // random cute name, editable
  variant: string;        // color variant key
  shiny: boolean;
  stage: Stage;
  growth: number;         // 0..species.growMinutes*60 (seconds of growth)
  hunger: number;         // 0..100 (100 = full)
  happiness: number;      // 0..100
  bornAt: number;
  lastBredAt: number | null;
  lastDropAt: number;
  tankId: string;
}

interface Egg { id: string; speciesId: SpeciesId; variant: string; shiny: boolean; tankId: string; hatchAt: number; }

interface Tank {
  id: string;
  name: string;
  theme: 'classic' | 'night' | 'coral' | 'pond';
  capacity: number;
  cleanliness: number;    // 0..100
  algaeSpots: { id: string; x: number; y: number; size: number }[];
  decor: { id: string; decorId: string; x: number }[];
  pellets: { id: string; x: number; y: number; vy: number; premium: boolean; landedAt: number | null }[];
  shells: { id: string; x: number; value: number; pearl: boolean }[]; // on the sand, click to collect
}

interface GameState {
  version: number;
  shells: number;
  pearls: number;
  xp: number;
  level: number;
  tanks: Tank[];
  activeTankId: string;
  fish: Fish[];
  eggs: Egg[];
  inventory: { premiumFood: number };
  lastTickAt: number;
  lastDailyGift: string | null; // 'YYYY-MM-DD' local date
  settings: { muted: boolean; reducedMotion: boolean };
  stats: { fed: number; hatched: number; cleaned: number };
}
```
Note: pellets, shells, and algae are part of saved state. Fish x/y positions and velocities are NOT saved; they live in the renderer only.

## Simulation rules (all numbers in `constants.ts`)
The sim runs on a 1-second fixed tick. Rendering is separate at 60fps.

**Hunger**
- Decreases by `species.hungerRate` per minute. Floors at 0.
- Each pellet eaten: +15 hunger (premium: +25). Capped at 100.
- Full fish (hunger ≥ 95) ignore food.
- Pellets that reach the sand and sit for 60s dissolve: -3 cleanliness and spawn a small algae spot.

**Happiness** drifts toward a target at 2 points per minute.
- Base target 50.
- +20 if hunger ≥ 40; -20 if hunger < 20
- +15 if cleanliness ≥ 60; -15 if cleanliness < 30
- +3 per decor item (max +15)
- -10 if tank is over 90% capacity
- Clamp 0..100

**Growth**
- Accumulates 1 growth-second per real second, multiplied by a happiness factor of `0.5 + happiness/100` (range 0.5×–1.5×).
- Growth stops completely when hunger < 20.
- Premium food gives a 3-minute 2× growth boost to the fish that eats it.
- Stages: baby → juvenile at 40% of `growMinutes`, juvenile → adult at 100%.
- Visual size: baby 0.45, juvenile 0.7, adult 1.0 scale.

**Cleanliness**
- Decreases by 0.5 per minute + 0.1 per minute per fish in the tank.
- When it drops below 80/60/40/20 thresholds, an algae spot spawns (max 12 spots).
- Wiping a spot in Clean mode: removes it, +6 cleanliness, +2 XP, sparkle effect.

**Shell drops (adults only)**
- Every `species.dropMinutes`, an adult drops a shell of `species.dropValue` onto the sand.
- 2% chance the drop is a pearl instead.
- Max 10 uncollected drops per tank (oldest are auto-collected at full value when the cap is exceeded).
- Click to collect: +value, +1 XP, coin-pop animation.

**Offline catch-up**
- On load, simulate elapsed time since `lastTickAt`, capped at 8 hours, in 60-second steps.
- Same rules as live. Nothing dies. Fish simply wait hungry.
- Show a "While you were away" toast summary (shells dropped, eggs hatched, fish grown).

## Species
| id | name | unlock lvl | cost | growMinutes | hungerRate/min | sell (adult) | dropMinutes | dropValue | notes |
|---|---|---|---|---|---|---|---|---|---|
| danio | Zippy Danio | 1 | 10 shells | 20 | 2.0 | 25 | 8 | 2 | fast, darts around |
| guppy | Guppy | 1 | 15 shells | 25 | 1.8 | 35 | 8 | 3 | flowy tail |
| goldfish | Goldfish | 3 | 40 shells | 45 | 1.5 | 80 | 10 | 5 | chubby, slow |
| tetra | Neon Tetra | 6 | 60 shells | 40 | 1.6 | 110 | 10 | 6 | glowing stripe, schools with other tetras |
| betta | Betta | 5 | 80 shells | 60 | 1.2 | 150 | 12 | 8 | big flowing fins |
| angelfish | Angelfish | 8 | 150 shells | 90 | 1.0 | 300 | 15 | 14 | tall triangular body |
| clownfish | Clownfish | 12 | 300 shells | 120 | 1.0 | 550 | 15 | 22 | coral theme only |
| puffer | Puffy | 15 | 5 pearls | 180 | 0.8 | 900 | 20 | 35 | inflates when clicked |
| axolotl | Axolotl | 18 | 10 pearls | 240 | 0.6 | 1500 | 25 | 50 | walks on the sand, smiles |
| koi | Koi | 20 | 15 pearls | 300 | 0.6 | 2500 | 30 | 80 | pond theme only |

Each species has 3–4 color variants (pastel palettes defined in `species.ts`) plus a rare shiny variant (sparkle overlay + golden outline).
Selling a juvenile gives 40% of the adult price. Babies cannot be sold.

## Levels & XP
- XP to next level: `round(40 * level^1.5)`
- XP sources: pellet eaten +1 (max 30 XP from feeding per hour), algae wiped +2, shell collected +1, fish bought +5, egg hatched +10, fish reaches adult +8, daily gift +5
- Level-up modal shows what just unlocked. Each level-up also gives `level * 10` shells.

Unlocks beyond species:
- L2: Premium food in shop (10 shells for 3)
- L3: Decor shop (plants, rocks)
- L5: Breeding
- L7: Tank capacity upgrade (+2 slots, 200 shells, repeatable 3×, cost ×2 each time)
- L8: Second tank (500 shells)
- L10: Night Glow theme (8 pearls)
- L12: Coral Reef theme (12 pearls)
- L14: Third tank (2000 shells)
- L20: Pond theme (20 pearls)

## Breeding (unlocks L5)
- Every 5 minutes, check each pair in the same tank: same species, both adults, both happiness ≥ 80, both hunger ≥ 50, both off cooldown (60 min since `lastBredAt`), tank has a free slot.
- 25% chance per eligible pair per check. Only one egg per pair per check.
- Egg hatches in `max(10, growMinutes / 4)` minutes. Eggs count toward capacity.
- Offspring variant: 45% parent A, 45% parent B, 10% random variant of that species.
- Shiny chance 3% (10% if a parent is shiny). Hatching a shiny gives +2 pearls.
- A little heart floats between the pair when an egg is laid.

## Decor
| decorId | name | unlock | cost |
|---|---|---|---|
| plant_small | Sprout | L3 | 20 shells |
| plant_tall | Tall Weed | L3 | 35 shells |
| rock | Smooth Rock | L3 | 25 shells |
| castle | Tiny Castle | L6 | 150 shells |
| chest | Treasure Chest | L9 | 250 shells (opens and puffs bubbles every ~30s) |
| shipwreck | Shipwreck | L13 | 6 pearls |
Decor sits on the sand and is placed by dragging horizontally. Max 8 decor items per tank. Sell back for 50%.

## Daily gift
Once per local calendar day, on first open: 20 shells + 3 premium food, with a 15% chance of +1 pearl. A gift box bobs in the tank and pops open on click. No streaks.

## Starting state
- 1 classic tank, capacity 6, cleanliness 100
- 2 baby danios with random variants and names
- 30 shells, 0 pearls, level 1
- Short onboarding: 3 tooltip bubbles (Feed → Watch them grow → Collect shells)

## UI
- The tank fills the viewport (max aspect ~16:10, letterboxed with a soft gradient).
- **Top HUD:** level badge + XP bar, shells, pearls, mute toggle
- **Bottom toolbar (big rounded buttons with emoji icons):** Feed 🍤, Premium 🌟 (shows count), Clean 🧽, Shop 🛒, My Fish 🐟, Tanks 🏠, Break ☕
- **Feed mode:** clicking in the water drops 1 pellet at that x position (max 1 pellet per 150ms).
- **Clean mode:** the cursor becomes a sponge; drag across algae to wipe.
- **Clicking a fish** opens a FishCard: name (editable), species, stage, hunger bar, happiness bar, growth progress, sell button.
- **Shop tabs:** Fish / Food / Decor / Tanks. Locked items are shown greyed out with "Unlocks at Lv X".
- **Toasts** appear bottom-center and auto-dismiss after 3s.
- Responsive down to 360px wide (toolbar wraps to 2 rows on mobile).

## Break Mode ☕
- Fullscreen tank, all UI hidden except a soft circular timer (5 min default; options 3/5/10).
- If sound is unmuted: gentle bubble ambience.
- Optional breathing guide: the text "breathe in… breathe out…" fades on a 4s/6s cycle.
- At the end: "Nice break. Back to it ✨" with a button to exit. Grants +10 XP once per hour.
- Esc exits anytime.

## Art Style
Bright, glossy, chunky cartoon, like classic Facebook-era aquarium games. This supersedes the "pastel colors" wording elsewhere in this file.
- Saturated candy colors, not pastels. Thick 3-4px dark outlines (a darker shade of the fill, never black).
- Every shape gets lighting: a radial/linear gradient fill (lighter top, darker bottom),
  a white glossy highlight ellipse at top-left, and a soft drop shadow on the sand.
- The tank is a physical object: show it as an aquarium with a rounded glass frame, a wooden stand,
  and a cozy blurred room wallpaper behind it. Add a glass reflection streak across the front.
- Water: vertical gradient (bright turquoise top → deep blue bottom), animated caustic light
  patterns rippling on the sand, swaying light rays, and floating dust specks for depth.
- Sand: warm gradient with colorful pebbles and a few shells; decor casts shadows.
- 3 depth layers: back plants (slightly blurred/darker), mid fish layer, front plants (overlap fish).
- Use the sprites in /public/assets/kenney-fish where available (exception to "all art is drawn in code"); draw everything else in code.

## Art direction
- Cartoon style: round bodies, oversized eyes with a white highlight, blink every 3–6s, 2px darker outline, soft pastel fills.
- Fish face their direction of travel (flip horizontally), with a gentle sine-wave body/tail wobble.
- Happy fish swim at normal speed. Sad fish (happiness < 30) swim slower, with a little droop and a rain-cloud emoji puff occasionally.
- Hungry fish (hunger < 20) occasionally show a tiny 🍤 thought bubble.
- Tank: gradient water, animated light rays, sand with pebbles, bubbles rising from a bubbler on the left.
- Themes change the palette: classic (blue), night (deep indigo + glowing fish outlines), coral (turquoise + coral decor), pond (green).
- Respect `prefers-reduced-motion`: fewer particles, no light rays.

## Fish behavior (render/behavior.ts)
- Each fish has a wander target. It picks a new random target in the water area every 3–8s or on arrival.
- Movement uses steering (seek with max speed + max turn rate) for smooth curves.
- When pellets exist and hunger < 95, the fish seeks the nearest pellet. Eating happens within an 8px radius.
- Fish keep away from tank edges and the sand. The axolotl is the exception and stays near the bottom.
- Tetras loosely school (cohesion toward other tetras).
- Speed per species defined in `species.ts`.

## Persistence
- Save to localStorage key `fishbowl-save` every 10s, on `visibilitychange`, and on `beforeunload`.
- Save includes `version`. `save.ts` has a `migrations` map for future changes.
- If the save is corrupt, back it up to `fishbowl-save-corrupt-<timestamp>` and start fresh with a toast.
- Settings menu has a "Reset game" option with a confirmation dialog.

## Conventions
- `src/game` must stay pure and deterministic given (state, dt, rng). Inject the RNG for tests.
- All balance numbers come from `constants.ts` / `species.ts`. No magic numbers in logic.
- Write Vitest tests for every sim rule (hunger, growth, happiness, breeding, offline catch-up, economy).
- Keep components small. No `any`.
- After each phase: `npm run build` and `npm test` must pass.

## Auth & Cloud Save
- **Guest play is the default.** Nobody is ever forced to log in; without Supabase env vars the game runs local-only.
- **Client-only Supabase.** The app is a static Vite build on Vercel. `src/lib/supabase.ts` reads `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` (the anon key is public by design; Row Level Security protects data). Keys live in `.env.local`
  (gitignored) and in Vercel env vars. Never commit keys.
- **Login:** a "Save progress ☁️" button in the Settings panel (HUD ⚙️) opens a cartoon login modal with an email magic link.
  A "Continue with Google" button (Supabase OAuth) sits above the email form, behind the `AUTH_GOOGLE_ENABLED` flag (on). Settings shows the logged-in email and Log out. The magic-link redirect
  is handled on load.
- **Table `saves`:** `user_id` uuid PK → `auth.users` (on delete cascade), `data` jsonb, `version` int, `updated_at` timestamptz
  (set by the server on every write). RLS: users can only select/insert/update their own row. SQL lives in `supabase/migrations/`.
- **Sync (`src/store/cloudSave.ts`):**
  - When logged in, load the cloud save on startup, then run the usual offline catch-up.
  - Save to the cloud debounced (every 30s while the state changes) and when the tab is hidden. localStorage stays as the cache and fallback.
  - First login with existing local progress: if the cloud is empty, upload local. If both exist, show a modal comparing them
    (level, shells, fish count, last played) and let the player pick one.
  - Cross-device conflicts: writes are conditional on the last known `updated_at`. If the cloud is newer than our last sync,
    reload the cloud data instead of overwriting it.
  - Log out: save once more, clear the local cache, start a fresh guest game.
  - A small HUD indicator shows ☁️✓ synced / ⟳ saving / ⚠ offline. Network calls never block gameplay.
  - Cloud data is validated with the same save version and migrations as local saves before it's loaded.

## Out of scope (for now)
Custom backend servers, multiplayer/visiting friends, payments, leaderboards.
