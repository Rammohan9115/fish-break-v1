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
- Fonts are self-hosted via @fontsource (Nunito Variable, Fredoka); no Google Fonts requests.
- Rendering: HTML Canvas 2D with a custom render loop (`requestAnimationFrame`). No game engine.
- React is used ONLY for UI overlays (HUD, shop, modals, toolbar), never for drawing fish.
- State: Zustand, persisted to localStorage via a custom save module (plus optional Supabase cloud saves, see below)
- Accounts & cloud saves: Supabase (`@supabase/supabase-js` used directly from the client; no custom backend)
- Tests: Vitest for all simulation logic (`npm test`); Playwright end-to-end flows in `e2e/` (`npm run test:e2e`, uses the dev server). Lint: `npm run lint`. CI (`.github/workflows/ci.yml`) runs tsc, lint, tests, build and e2e on every push.
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
  bondPoints: number;     // only ever goes up (see Petting & Bond)
  bondLevel: 0 | 1 | 2 | 3 | 4 | 5;
  petLog: number[];       // timestamps of rewarded pet sessions in the last hour
  lastPettedAt: number | null;
  feedBondLog: number[];  // timestamps of hand-feeding bond grants in the last hour
}

interface Egg { id: string; speciesId: SpeciesId; variant: string; shiny: boolean; tankId: string; hatchAt: number; x?: number; startBond?: number; } // x: where it was laid; startBond: the baby's starting bond

interface Courtship { id: string; tankId: string; fishIds: [string, string]; startedAt: number; endsAt: number; x: number; }

interface Tank {
  id: string;
  name: string;
  theme: 'classic' | 'night' | 'coral' | 'pond';
  capacity: number;       // base (10 / 12 / 15 by purchase order) + 3 per upgrade
  upgrades: number;       // capacity upgrades bought (0..5)
  cleanliness: number;    // 0..100
  algaeSpots: { id: string; x: number; y: number; size: number }[];
  decor: { id: string; decorId: string; x: number; flipped: boolean; size: 'S' | 'M' | 'L'; z: number /* 0 far … 1 near, 0.5 = sand line (sand items only) */ }[];
  style: { frame; substrate; lighting; lightingColor; water; bubbler; nameplate: boolean }; // STYLE_OPTIONS ids
  layoutPresets: ({ name: string; items: Omit<PlacedDecor, 'id'>[] } | null)[];  // 3 slots
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
  courtships: Courtship[];
  nursery: Fish[];        // napping babies that hatched into a full tank (tankId '')
  breedingQuest: { guideSeen: boolean; status: 'off' | 'active' | 'done' };
  inventory: { premiumFood: number };
  lastTickAt: number;
  lastDailyGift: string | null; // 'YYYY-MM-DD' local date
  settings: { muted: boolean; reducedMotion: boolean };
  stats: { fed: number; hatched: number; cleaned: number };
  decorInventory: Partial<Record<DecorId, number>>; // the decor box: owned, not placed
  ownedStyles: string[];  // bought tank style options (free ones aren't listed)
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
- Decor rewards variety: +3 per different item, +1 per duplicate (max +20), plus +5 per active collection set (see Decor)
- -10 if the tank holds more than 90% of its capacity in hatched fish (eggs don't count)
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
- Below 60 the tank always has at least `ceil((60 − cleanliness) / 6)` spots (topped up at most one per sim minute), so wiping them all always brings it back to 60.
- Wiping a spot in Clean mode: removes it, +6 cleanliness, +2 XP, sparkle effect.

**Shell drops (adults only)**
- Every `species.dropMinutes`, an adult drops a shell of `species.dropValue` onto the sand.
- 2% chance the drop is a pearl instead.
- Max 20 uncollected drops per tank. When the cap is exceeded the oldest is auto-collected at 50% of its value while the game is open, and lost during offline catch-up.
- Click to collect: +value, +1 XP, coin-pop animation. Drops are sized by how big they look on screen (about 40 px wide: ≈ 2× on phones, ≈ 1.4× on desktop; `dropDrawWidth` in `render/dropSize.ts`), glow and bob gently, and the tap area is centred on the sprite and at least 44 px across on every screen (`dropHitTest`: the nearest centre wins among overlaps). New drops pick the roomiest spot so shells don't pile up.

**Offline catch-up**
- On load, simulate elapsed time since `lastTickAt`, capped at 8 hours, in 60-second steps.
- Same rules as live. Nothing dies. Fish simply wait hungry.
- Show a "While you were away" toast summary (shells waiting on the sand, eggs hatched, fish grown).

## Species
| id | name | unlock lvl | cost | growMinutes | hungerRate/min | sell (adult) | dropMinutes | dropValue | notes |
|---|---|---|---|---|---|---|---|---|---|
| danio | Zippy Danio | 1 | 10 shells | 20 | 2.0 | 25 | 8 | 2 | fast, darts around |
| guppy | Guppy | 1 | 15 shells | 25 | 1.8 | 35 | 8 | 3 | flowy tail |
| goldfish | Goldfish | 3 | 40 shells | 45 | 1.5 | 80 | 10 | 5 | chubby, slow |
| tetra | Neon Tetra | 6 | 60 shells | 40 | 1.6 | 110 | 10 | 6 | glowing stripe, schools with other tetras |
| betta | Betta | 5 | 80 shells | 60 | 1.2 | 150 | 12 | 8 | big flowing fins |
| angelfish | Angelfish | 8 | 150 shells | 90 | 1.0 | 300 | 15 | 14 | tall triangular body |
| jellyfish | Jelly | 10 | 400 shells | 100 | 0.9 | 700 | 18 | 25 | pulses through the water, catches food with its tentacles |
| clownfish | Clownfish | 12 | 300 shells | 120 | 1.0 | 550 | 15 | 22 | coral theme only |
| puffer | Puffy | 15 | 5 pearls | 180 | 0.8 | 900 | 20 | 35 | inflates when clicked |
| axolotl | Axolotl | 18 | 10 pearls | 240 | 0.6 | 1500 | 25 | 50 | walks on the sand, smiles |
| koi | Koi | 20 | 15 pearls | 300 | 0.6 | 2500 | 30 | 80 | pond theme only |

Each species has 3–4 color variants (pastel palettes defined in `species.ts`) plus a rare shiny variant (sparkle overlay + golden outline).
Selling a juvenile gives 40% of the adult price. Babies cannot be sold.

**Jellyfish (Jelly)** has 5 variants (pink, sky blue, lavender, peach, mint), all made in code by hue-rotating one pink
sprite (`variant.hue`). Its shiny is a slow rainbow shimmer instead of the gold outline. It breeds like every other species.
Movement is unlike fish: no horizontal flip and no tilt toward the velocity. Every 1.5–3s the bell contracts, which
pushes it up (and a little toward its goal). Between pulses it drifts slowly, sinks gently and is carried by the current. It stays in the upper ~2/3 of the
tank, never touches the sand, and wobbles ±5°. It's a passive feeder: it drifts toward nearby pellets, and any pellet touching
its tentacles (below `bellSplitY`) is caught, slides up and is eaten. Fish steer around its tentacles. Tap it for 3 happy pulses,
a glow flash, bubbles and a heart. On the night theme it glows (brighter on each pulse) with a faint halo.

## Levels & XP
- XP to next level: `round(30 * level^1.5)`
- XP sources: pellet eaten +1 (max 30 XP from feeding per hour), algae wiped +2, shell collected +1, fish bought +5, egg hatched +10, fish reaches adult +8, daily gift +5
- Level-up modal shows what just unlocked. Each level-up also gives `level * 10` shells.

Unlocks beyond species:
- L2: Premium food in shop (10 shells for 3)
- L4: Tank capacity upgrade (+3 slots, 150 shells, up to 5× per tank, cost ×1.6 each time: 150 / 240 / 384 / 614 / 983)
- L5: Breeding (guide + "Your first baby" quest)
- L8: Second tank (500 shells, capacity 12)
- L10: Night Glow theme (8 pearls)
- L12: Coral Reef theme (12 pearls)
- L14: Third tank (2000 shells, capacity 15)
- L20: Pond theme (20 pearls)

## Breeding (unlocks L5): player-driven, never random
No hidden rolls decide whether breeding works. The player picks two ready fish and the egg is guaranteed;
randomness only affects the baby's color and shiny chance.

**Readiness** (both fish): adult, same species, same tank, happiness ≥ 70, hunger ≥ 40, not on cooldown
(30 min after breeding), not already courting.
- Ready fish show a small pulsing 💕 above them in the tank.
- The FishCard has a **Breeding** checklist, each line ✅ or ❌ with a fix hint:
  - Adult: "Grows up in 12 min"
  - Happy: "Happiness 55/70 — clean the tank or add decor"
  - Well fed: "Feed a few pellets"
  - Rested: "Ready again in 18 min" (live)
  - Partner: "Needs another adult Goldfish" with a "Buy one" shortcut
- **Pair up 💕** is enabled only when every line is ✅. Tapping it while disabled shakes it gently and highlights the first ❌.

**Pairing flow**
- Pair up enters pairing mode: the tank dims slightly, compatible ready fish glow and bob, other fish fade, and a banner reads "Pick a partner for Bubbles 💕". Tap a glowing fish to choose it; tap empty water or ✕ to cancel.
- A confirm sheet shows both fish, the possible baby colors with % chances, the shiny chance and the hatch time, and warns (without blocking) if the tank is full. The button is **Start courtship 💕**.
- Courtship lasts 60s: the pair swims a slow heart-shaped loop with floating hearts and synced body waves. Both FishCards show "In love 💞 0:42", and courting fish can't be sold or moved.
- At the end, one egg is laid on the sand at their spot (soft chime) and both parents start the 30-min cooldown. Courtship continues offline.

**Eggs**
- Hatch in `max(5, growMinutes / 6)` minutes. Eggs don't count toward capacity.
- The egg wobbles faster in its last minute, then cracks with a sparkle, and the baby does a tiny happy spin.
- Offspring variant: 45% parent A, 45% parent B, 10% random variant of that species.
- Shiny chance 3% (10% if a parent is shiny). A shiny hatch gives +2 pearls, a golden burst and a "✨ Shiny! ✨" toast.

**Nursery** (breeding is never blocked by a full tank)
- If the tank is full when an egg hatches, the baby goes to the Nursery with a toast: "Baby moved to the Nursery — make room or upgrade your tank."
- The Nursery holds at most 12 babies. If it's full too, a ready egg waits unhatched (never lost; a toast and a Breeding panel note say so) until there's room.
- Nursery babies nap: no growth, no hunger. From the Nursery, move a baby to any tank with room (theme-only species need their theme), or rehome it for 20% of the adult price (the only time a baby can be sold).

**Breeding panel** (💕 toolbar button, locked with "Unlocks at Lv 5" before then)
- "Ready to pair", grouped by species, with one-tap Pair up.
- "Almost ready", showing what each fish is missing.
- Active courtships and eggs with countdowns, the Nursery tab, and a "How breeding works" link.

**Guide + quest:** at Lv 5 (or once after updating, for players already past it):
- A 4-card swipeable guide:
  1. Raise two adults of the same species
  2. Keep them happy and fed (look for the 💕)
  3. Tap a fish → Pair up → pick its partner
  4. Wait for the egg to hatch into a baby!
- Then the "Your first baby" quest highlights the next action at each step, and rewards 50 shells + 1 pearl on the first hatch.

## Decor
**No decor is ever locked by player level.** Everything can be bought at any level, limited only by price (and the October event).
No "Unlocks at Lv X" labels for decor. Theme level gates (Night/Coral/Pond) stay.

| decorId | name | collection | cost | placement | behaviors |
|---|---|---|---|---|---|
| plant_small | Sprout | Classic | 20 shells | sand | sway |
| plant_tall | Tall Weed | Classic | 35 shells | sand | sway |
| rock | Smooth Rock | Classic | 25 shells | sand | bubble stream, sheen |
| castle | Tiny Castle | Classic | 150 shells | sand | flag, window glow, doorway fish |
| chest | Treasure Chest | Classic | 250 shells | sand | opens and puffs bubbles every ~30s |
| shipwreck | Shipwreck | Classic | 6 pearls | sand | rocking, bubble trail, lanterns |
| moss_ball | Moss Ball | Nature | 15 shells | sand | rolls gently with the current |
| driftwood | Driftwood | Nature | 60 shells | sand | — |
| flower_plant | Flower Plant | Nature | 50 shells | sand | sway; flowers glow softly at night |
| coral_branch | Coral Branch | Nature | 120 shells | sand | glints |
| anemone | Anemone | Nature | 150 shells | sand | sway; clownfish love to hover in it |
| sea_fan | Sea Fan | Nature | 130 shells | sand | slow sway |
| lily_pad | Lily Pad | Nature | 40 shells | surface | bobs, soft shadow below |
| column | Old Column | Ancient Ruins | 180 shells | sand | sheen |
| sunken_vase | Sunken Vase | Ancient Ruins | 200 shells | sand | bubbles from its mouth |
| broken_arch | Broken Arch | Ancient Ruins | 260 shells | sand | fish swim through the gap |
| stone_head | Stone Head | Ancient Ruins | 6 pearls | sand | blows a bubble ring every ~40s |
| bench | Park Bench | Cozy Village | 60 shells | sand | — |
| mailbox | Mailbox | Cozy Village | 70 shells | sand | flag up when the daily gift is ready; tap it to open the gift |
| lantern | Lantern | Cozy Village | 90 shells | sand | warm glow + halo at night |
| tiny_cottage | Tiny Cottage | Cozy Village | 300 shells | sand | windows glow at night, chimney bubbles, a fish peeks out |
| rubber_duck | Rubber Duck | Playful | 30 shells | surface | bobs and slowly turns |
| diver | Diver | Playful | 100 shells | sand | bubble stream from the helmet |
| volcano_bubbler | Bubble Volcano | Playful | 220 shells | sand | calm bubbling, big burst every ~45s |
| bubble_wall_base | Bubble Curtain | Playful | 150 shells | sand | code-drawn bubble curtain; fish swim through it |
| toy_submarine | Toy Submarine | Playful | 5 pearls | mid-water | drifts side to side, spinning propeller |
| pumpkin | Jack-o'-Lantern | Halloween | 80 shells | sand | glows orange at night |
| spooky_tree | Spooky Tree | Halloween | 120 shells | sand | gentle sway |

- **Placement:** sand items stand somewhere between the far and near parts of the sand (depth `z`), surface items float just below the HUD band at the top of the view, and mid-water items drift at ~40% depth.
  Sand items are dragged sideways **and up/down**: dragging up pushes a piece back (smaller, hazier, higher, with a fainter shadow), down pulls it
  forward (bigger, crisper, lower). `z` runs 0 (far) … 1 (near); 0.5 is the original sand line (it magnets there), so older tanks look unchanged.
  Pieces with `z ≥ 0.7` draw over the fish, the rest behind them, each group far → near; only pieces at `z ≤ 0.65` attract fish (arch, anemone…).
  Geometry lives in `depthGeometry` (`src/game/decor.ts`; constants `DECOR_Z`). Surface and mid-water pieces ignore depth. Up to **15 placed items per tank, +3 per capacity upgrade**. Buying with a full tank puts the piece in the decor box. Sell back for 50% (from the tank or the box).
- **Art:** the collection sprites are cut from sheets in `public/assets/elements/` (`nature`, `ruins`, `village`, `playful`, `halloween`.PNG) by the `rect` in `DECOR_ART`.
- **Halloween is an October event** (local date): buyable only in October. Owned pieces stay forever and keep working.

**Decorate mode 🎨** (toolbar, or the DecorCard's "🎨 Decorate"; never times out)
- Fish fade to 50%, decor gets an edit outline, and the banner shows `🪸 9/15 · ↶ ↷ · ✕`.
- **Shelf** (no side bar: the tank stays full size; a slim strip above the dock, folding to 55 % opacity while a piece is selected):
  - **Box tiles**: drag a piece into the water, or tap it to drop it in the middle. **📦 Box** opens a window to sell boxed pieces.
  - **💾 Layouts** (window): 3 slots per tank. Save the current layout, or apply one. Applying puts everything in the box first, then places the layout's pieces; pieces you no longer own are skipped and counted in a toast.
  - **✨ Style** (window): Tank Style, see below.
- **Pieces:** a press drags straight away. Snap guides line a piece up with the tank center or another piece's center or edges (6 units).
  The selected piece gets a floating toolbar: ⇋ Flip · Far/Mid/Near (sand pieces; ↑/↓ also nudge depth) · S/M/L (0.8/1.0/1.2) · 📦 To box · Sell.
- **Undo/redo** (last 20 steps, this session): the banner buttons, Ctrl/Cmd+Z (Shift to redo), or a two-finger tap on touch. Selling clears the history, because money can't be undone.
- **Try it** (shop): a ghost of the piece in the tank. Drag it, then **Buy & Place** or cancel.

**Tank styles** (code-drawn; no level gates; owned styles work on every tank; tap to preview live, then Use or Buy):

| Category | Options (free ones marked) |
|---|---|
| Frame (slim bezel at the screen edges) | Classic Glass (free), Warm Wood (free), Bamboo 120, Pastel Pink 150, Retro Chrome 200, Night Neon 4 pearls (glowing edge) |
| Substrate (drawn over the picture's sand) | Golden Sand (free, the picture's own sand), White Sand (free), Black Gravel 150 (sparkles), Pastel Pebbles 180, Glow Gravel 5 pearls (glows at night) |
| Lighting (soft tint over the scene) | Natural (free), Warm Sunset (free), Cool Moonlight 100, Tropical 100, Soft Pink 100, Custom color 3 pearls |
| Water | Crystal (free), Lagoon Blue (free), Emerald 120, Twilight 160 |
| Bubbler | Classic (free), Off (free), Bubble Curtain 120, Heart Bubbles 200 |

The nameplate (an engraved plaque on the bezel's bottom edge showing the tank name) can be switched off per tank.

**Dev panel → Decor:** "Give all decor + styles" and "Halloween event: forced on" (pretends it's October, not saved).

**Collections & set bonuses**
- 3 *different* items from one collection in a tank (both pieces for Halloween, which has only 2) activate its set bonus: +5 happiness for that tank's fish, plus an ambient effect:
  - Nature: drifting pollen
  - Ruins: slow sand motes in the light
  - Cozy Village: fireflies at night
  - Playful: rainbow bubbles
  - Halloween: cute little ghosts at night
- The shop groups decor by collection, with progress (owned/total), a ✓ when complete, the set status for the current tank, and what each piece would add to happiness.

## Petting & Bond
Press and hold a fish to pet it. Petting builds a **bond** that unlocks tricks and small perks. It's a fidget toy for
stress relief, so it must always feel soft and rewarding.
- **Pillars:** bond NEVER decreases (no decay, no guilt, no "your fish misses you"). Rewards cap; the joy doesn't.
  Every pet gets instant feedback.
- **Levels** (`BOND.levels`): 0 Stranger (0) · 1 Curious (15) · 2 Friendly (45) · 3 Buddy (100) · 4 Best Friend (180) · 5 Soulmate (300).
- **Sources:**
  - A completed pet session gives +3 bond, +5 happiness and +1 XP.
  - A fish eating a pellet the player dropped within 80 units of it gives +0.2 bond (max +2 per fish per rolling hour).
- **Cap:** 2 rewarded sessions per fish per rolling hour. After that, petting plays every animation and gives +2 happiness,
  but no bond or XP, and the fish shows "😌 content" instead of the meter.
- **Babies** of two Buddy+ parents start at Curious (15). The egg stores it as `startBond`.
- **Gesture:**
  - Hold ~250ms on a fish in look mode to pet; the hitbox is +12 units. A quick tap keeps its behavior (quick actions, then the FishCard).
  - Dragging before the hold completes pans on tall screens; elsewhere it starts petting.
  - Petting is off in Feed, Clean, decor drag, pairing and Break.
- **While holding:**
  - The fish stops, faces the pointer and drifts after it slowly (never leaving the water).
  - It leans in with a slower body wave and happy closed "^ ^" eyes.
  - Hearts float up every ~0.5s, and sparkles appear at the pointer.
  - A heart-ring meter at the pointer fills in 3s. Stroking (back and forth) fills it 50% faster and makes the fish wiggle.
- **When the meter fills:** a heart burst, a "+3 💕" pop, a happy spin and a soft "bloop". Keep holding for the next session.
  Releasing early loses the partial meter (no penalty) and the fish wiggles.
- **Species flavor:** the puffer puffs a little; the axolotl rolls onto its back; the jelly pulses slowly and glows; the betta fans its fins.
- **Keyboard:** Tab focuses the tank, ←/→ pick a fish, and holding Space pets it.
- **Tricks & perks:**
  - Curious: says hi (swims over when the cursor hovers near, or when you tap the water nearby).
  - Friendly: Spin.
  - Buddy: Bubble Hoop.
  - Best Friend: Follow mode (30s) and +10% shell drops (rounded up).
  - Soulmate: the species signature, a golden heart badge and a name glow.
  - Signatures: goldfish heart bubble · guppy rainbow twirl · danio/tetra zoom dash · betta fin fan · angelfish loop-de-loop ·
    clownfish wiggle dance · puffer puff-spin-pop · axolotl backflip · koi leap and splash · jelly rainbow glow.
  - Play tricks from the FishCard Tricks row (locked tricks show the level needed) or by double-tapping the fish (it cycles through tricks).
    Each trick has a 5s cooldown and gives no rewards.
- **Greeting:** after 30+ minutes away, Friendly+ fish swim to the front and wiggle.
- **UI:**
  - The FishCard Bond section: badge, progress to the next unlock, pets left this hour, a live % for screen readers, and Tricks.
  - Level-up: a big heart burst, a toast ("Bubbles is now your Buddy! 🎉 New trick: Bubble Hoop") and a trick demo.
  - My Fish lists every fish with its bond and can sort by bond.
  - The sell/rehome confirm for a Buddy+ fish names the bond neutrally.
  - The first fish tap after the update shows "Tip: press and hold to pet 💕" once.
- **Reduced motion:** no follow drift, fewer hearts, and tricks become simple scale pulses.
- **Performance:** heart/sparkle/ring particles are pooled, so nothing is allocated per frame.

## Daily gift
Once per local calendar day, on first open: 20 shells + 3 premium food, with a 15% chance of +1 pearl. A gift box bobs in the tank and pops open on click. No streaks.

## Starting state
- 1 classic tank, capacity 10, cleanliness 100
- 2 baby danios with random variants and names
- 30 shells, 0 pearls, level 1
- Short onboarding: 4 tooltip bubbles (Feed → Watch them grow → Collect shells → Pet your fish)

## UI
- The tank fills the viewport (max aspect ~16:10, letterboxed with a soft gradient).
- **Top HUD:** level badge + XP bar, shells, pearls, mute toggle
- **Bottom toolbar (big rounded buttons with emoji icons):** Feed 🍤, Premium 🌟 (shows count), Clean 🧽, Decorate 🎨, Shop 🛒 (Fish / Food / Decor / Styles / Tanks), Breeding 💕, My Fish 🐟, Tanks 🏠, Break ☕
- **Capacity** shows as "🐟 7/10" on the HUD tank tag and in the tank switcher, with an "Upgrade" shortcut once a tank is 80%+ full.
- **Feed mode:** clicking in the water drops 1 pellet at that x position (max 1 pellet per 150ms).
- **Clean mode:** the cursor becomes a sponge; drag across algae to wipe.
- **Clicking a fish** opens a FishCard: name (editable), species, stage, hunger bar, happiness bar, growth progress, bond + tricks, breeding checklist + Pair up, sell button.
- **My Fish 🐟** lists every fish by tank (plus the Nursery) with its bond, sortable by bond / name / species. Tap a row to open that fish.
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
Bright, glossy, chunky cartoon, like classic casual aquarium games. This supersedes the "pastel colors" wording elsewhere in this file.
- Saturated candy colors, not pastels. Thick 3-4px dark outlines (a darker shade of the fill, never black).
- Every shape gets lighting: a radial/linear gradient fill (lighter top, darker bottom),
  a white glossy highlight ellipse at top-left, and a soft drop shadow on the sand.
- The tank is a physical object: show it as an aquarium with a rounded glass frame, a wooden stand,
  and a cozy blurred room wallpaper behind it. Add a glass reflection streak across the front.
- Water: vertical gradient (bright turquoise top → deep blue bottom), animated caustic light
  patterns rippling on the sand, swaying light rays, and floating dust specks for depth.
- Sand: warm gradient with colorful pebbles and a few shells; decor casts shadows.
- 3 depth layers: back plants (slightly blurred/darker), mid fish layer, front plants (overlap fish).
- Sprites (exception to "all art is drawn in code"): original PNGs live in `art-src/` (not shipped). `npm run build:assets` (scripts/build-assets.ts, sharp) turns them into pre-cleaned, trimmed WebP in `public/assets-webp/` (fish ≤512px, backgrounds 1600px wide, one file per decor item and icon). Commit the output; re-run it whenever art-src or `DECOR_ART` rects change. Draw everything else in code.

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
- If the save is corrupt, back it up to `fishbowl-save-corrupt-<timestamp>` and start fresh with a toast. Only the newest 2 backups are kept, and Settings offers "Restore backup".
- A save written by a *newer* version is not corrupt: it is left untouched, saving is locked, and the player is asked to reload.
- Only one tab saves (Web Lock `fishbowl-leader-tab`). Other tabs show "Open in another tab — Play here?"; Play here makes the leader save first, then takes over. If storage is full, one toast says so.
- The app is a PWA (vite-plugin-pwa): the shell and sprites are precached, so it starts offline, and a new version asks before reloading. Icons come from `npm run build:icons`.
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
- **Login (PKCE):** the magic-link redirect carries a one-time `?code=` that is exchanged on load; opening the link in another browser can't work, so after sending the link the form also takes the 6-digit code from the same email (the Supabase email template must include `{{ .Token }}`). A "Save progress ☁️" button in the Settings panel (HUD ⚙️) opens a cartoon login modal with an email magic link.
  A "Continue with Google" button (Supabase OAuth) sits above the email form, behind the `AUTH_GOOGLE_ENABLED` flag (on). Settings shows the logged-in email and Log out. The magic-link redirect
  is handled on load.
- **Table `saves`:** `user_id` uuid PK → `auth.users` (on delete cascade), `data` jsonb, `version` int, `updated_at` timestamptz
  (set by the server on every write). RLS: users can only select/insert/update their own row. SQL lives in `supabase/migrations/`.
- **Sync (`src/store/cloudSave.ts`):**
  - When logged in, load the cloud save on startup, then run the usual offline catch-up.
  - Save to the cloud debounced (every 10s while the state changes), when the tab is hidden and on `pagehide`. Nothing is written while the save is locked (newer version / another tab leads). localStorage stays as the cache and fallback.
  - First login with existing local progress: if the cloud is empty, upload local. If both exist, show a modal comparing them
    (level, shells, fish count, last played) and let the player pick one.
  - Cross-device conflicts: writes are conditional on the last known `updated_at`. If the cloud is newer than our last sync,
    show the same compare modal as the first login and let the player choose; nothing is overwritten silently.
  - Log out: save once more; only if that push is confirmed, clear the local cache and start a fresh guest game. If it can't be confirmed (offline), warn and let the player cancel or log out anyway.
  - A small HUD indicator shows ☁️✓ synced / ⟳ saving / ⚠ offline. Network calls never block gameplay.
  - Cloud data is validated with the same save version and migrations as local saves before it's loaded.

- **Delete account:** Settings → "Delete my account & data" calls the `delete-account` Edge Function (service role, caller identified by their JWT; cascades to `saves`). The game on the device is kept and the player carries on as a guest.
- **Analytics:** `src/lib/analytics.ts` (PostHog EU capture API, no SDK, no cookies, anonymous random id, honors Do Not Track, opt-out in Settings). It only runs when `VITE_ANALYTICS_KEY` is set. Events are detected from store diffs in `store/analyticsWiring.ts`; never send names, emails or ids.

## UX Rules
These keep the interface calm on every screen. `src/ui/kit/index.ts` points here.
1. **One thing at a time.** The first run shows only the onboarding tip: the goal chip, daily gift, pan tip and toasts wait until it is done. Nothing stacks on top of anything else.
2. **Nothing overlaps, on any screen.** Banners, toasts, tips and cards sit in the space between the HUD and the dock. Never hard-code those offsets: `useLayoutVars` measures them into `--hud-stack` and `--dock-h` (the CSS values are only first-paint fallbacks). Cards docked at the right (≥ 641px) push top banners into the free space beside them.
3. **Check it at 320×568, 375×667, 390×844, 844×390 (landscape), 768×1024 and 1366×768** before shipping a UI change. `node scripts/audit/layout.mjs` (dev server running) reports overlaps, off-screen elements and clipped text; its screenshots are the proof.
4. **Tap targets are at least 44px** (`--tap-min`) and text is at least 12px. A small visual (like a ✕ or a dot) gets an invisible 44px hit area.
5. **Frequent actions are one tap.** Feed stays visible next to the Tools handle; everything else lives in the tucked-away dock.
6. **Destructive actions confirm, and sales can be undone.** Selling a fish or decor shows a 6-second Undo toast (the money is taken back, nothing else is lost). Reset and delete-account use a confirm dialog.
7. **Never rely on colour or sound alone.** Meters have icon + word; every action has a visible label; accessible names start with the visible text.
8. **Everything works without a mouse.** Arrow keys pick fish and nudge decor (Shift = bigger steps), Space pets, Esc closes the top layer.
9. **Quiet and kind.** Sound starts muted, no streaks, no guilt, motion respects `prefers-reduced-motion`.

## Overlay system (`src/ui/overlay/`)
One responsive system for every popup, panel and card (Phases 1–4).
- **Variants, picked by size and input, never by user agent** (`pickVariant` in `overlay/rules.ts`, live via `useOverlayVariant`):
  **Dialog** (confirmations, celebrations: centred, `clamp(280px, 92vw, 400px)`, always fits without scrolling),
  **Window** (browse/manage panels: Shop, My Fish, Breeding, Tanks, Settings: a big centred window, up to 94 % × 88 % of the screen
  (lg 1120 / md 820 / sm 560 px wide), **frosted glass** (translucent + blur) over a soft scrim so the scene glows through, like a game menu),
  **Sheet** (the same panels on narrow screens < 600 px: bottom sheet, snap 40/60/92 %, drag handle, swipe down to close, also frosted),
  **SidePanel** (`layout="dock"`: only for docked cards; Decorate has no side bar: docked right, `clamp(320px, 30vw, 440px)`; the tank, HUD,
  dock, banners and toasts make room through `--panel-w`, so fish stay visible and playable),
  **Popover** (cards for things in the tank on a wide screen with a mouse: anchored to the fish / decor piece, follows it, arrow, flips and shifts to stay in the free area). `overlay/Card` picks: Popover (mouse, wide) → docked card (finger, wide: tank NOT shifted) → non-modal bottom sheet (narrow). Quick actions and the decor toolbar are small Popovers (no arrow).
- **Structure for all** (`OverlayFrame`): sticky Header (title + ✕, optional pinned `tabs` row) → Body (the ONLY scrolling region,
  `overscroll-behavior: contain`) → sticky Footer (primary actions). Never nest scrollers.
- **Infrastructure:** overlays render into `OverlayRoot` (a portal inside `.app`); a modal overlay makes the rest of the app `inert`;
  `overlayStore` decides what Esc closes (dialog > panel > popover, newest first); `useVisualViewportVars` publishes `--vvh`/`--vv-top`/`--kb`
  so overlays follow the visual viewport and stay above the on-screen keyboard; heights use `100dvh` (with a `100vh` fallback), never raw `100vh`.
  One side panel at a time (opening a panel puts a fish/decor card away, and vice versa).
- **Fit budget:** FishCard (tabs Status / Bond / Breeding, ⋯ menu for Move and Sell, Pair up pinned in the footer), DecorCard, quick actions, the decor toolbar, every Dialog, the coachmark and the try-it banner never scroll on any of the 19 screens.
- **Density modes** (by available space, `pickDensity`): compact (< 400 px wide or < 700 px tall, which includes 150–200 % zoom), regular, spacious (≥ 1600 px wide).
  `useDensity` sets `data-density`, the spacing/type variables (`densityVars`: body always 14–18 px, labels ≥ 12 px) and `--ui-zoom` (the HUD and dock grow up to 1.35× on big screens). A tighter density must never shrink a target below 44 px (`.chip` has a min width).
- **Shop:** items are an auto-fill grid (`minmax(140px, 1fr)`: 2 columns on a phone, 3–5 on desktop); a card's note clamps to 2 lines and **Details** opens a Dialog with the facts and a Buy button (`ShopItem` `details` prop).
- **Toasts:** one at a time; bottom-left on a desktop (away from the right-hand panel); on a phone while a modal sheet or dialog is open they move to the top, above the scrim.
- **Desktop polish:** pointer cursors, hover states, a two-tone focus ring (visible on the purple headers too), icon-only buttons get a tooltip from their `aria-label`; Esc closes and Enter confirms.
- **Use the kit:** `<Sheet>` / `<ConfirmDialog>` pick the right primitive (`kind="dialog"` for dialogs, default panel). Put tabs/filters in `tabs`, actions in `footer`.
  z-index values are only the `--z-*` tokens (`tokens.ts`); no literals.
- **Every new overlay must be added to `e2e/overlays/registry.js` (and to `enforced.js` once it passes).** `e2e/overlays.spec.ts` opens every
  registered overlay on 19 screens (phones, tablets, desktops, and 125/150/200 % zoom) and fails when one is outside the viewport, scrolls while it
  has a fit budget, has a hidden header/footer, has targets under 44 px (touch) / 32 px (mouse) or overlapping, text under 12 px or clipped, or (for a docked panel) leaves
  < 55 % of the tank beside it. Browse windows are big on purpose; they only have to fit the screen. `node scripts/audit/overlays.mjs` + `node scripts/audit/overlay-report.mjs` write `qa/overlays/REPORT.md`.

## Out of scope (for now)
Custom backend servers, multiplayer/visiting friends, payments, leaderboards.
