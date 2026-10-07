# Rescue Stories + Daily Tasks — Build Guide
#use minial tokens please

**Prerequisite:** the 5 starter species (cory, cherry_shrimp, kuhli_loach, hatchetfish, crab) must already
be implemented (`starter-species.md`).

**How to run:** one prompt per session. `/clear` → plan mode → paste → test → commit. Play each story
using the dev controls before moving on to the next.

**Story setup:** Dr. Fisher runs a small aquatic wildlife rescue center. He sends you rescue cases
(delivered by his pelican mail carrier). You pick which animal to help from his Rescue Board, one at a time.

---

## Part A — Optional image prompts (do these before Prompt 1)
Upload your goldfish sprite as the style reference. Save to `public/assets/story/`. If you skip these,
Prompt 1 draws simple placeholder versions in code.

**pelican.png**
```
Subject: a friendly cartoon pelican mail carrier wearing a tiny blue postal cap and a small satchel,
holding a letter in its beak, kind eyes. Cute glossy cartoon game sprite, casual mobile/Facebook
aquarium game style matching the reference: chunky rounded proportions, thick dark outline (darker shade
of each color, not black), vibrant candy colors, gradient shading, white glossy highlight top-left. Side
view facing LEFT, full body, flying pose with wings spread. Opaque colors. Plain transparent background,
no shadow, no text. 1024x1024.
```

**dr_fisher.png** (portrait for letters and the Rescue Board)
```
Subject: a portrait of Dr. Fisher, a kind, enthusiastic aquatic wildlife rescuer in his 40s, with messy
brown hair, a short friendly beard, round glasses, a big warm smile, wearing a teal rescue-center vest
with a small fish-and-heart patch, and a pencil behind his ear. From the shoulders up. Cute glossy
cartoon game style matching the reference: rounded shapes, thick dark outline (darker shade of each
color, not black), soft vibrant colors, gradient shading. Front view, centered. Opaque colors. Plain
transparent background, no text. 1024x1024.
```

**care_items_sheet.png** (slice with the existing slice script → soft_food.png, healing_moss.png, vitamin_flakes.png)
```
A sprite sheet of 3 separate cute glossy cartoon game item icons side by side with LARGE empty space
between them, not touching: 1) a small round jar of soft fish food with a heart label, 2) a glowing
green clump of healing moss with tiny sparkles, 3) a little shaker of colorful vitamin flakes. Casual
mobile/Facebook game style matching the reference: chunky rounded shapes, thick dark outlines (darker
shade of each color, not black), vibrant candy colors, gradient shading, white glossy highlight
top-left. Front view. Plain transparent background, no shadows, no text, no labels.
```

---

## Prompt 1 — Rescue system + Rescue Board + daily tasks + Pinch (pilot story)
```
Build a data-driven Rescue Stories system with a Rescue Board and Daily Tasks, then implement the first
story (Pinch the Crab) as the pilot. Read CLAUDE.md first; follow the UX Rules, overlay primitives,
tokens, save migrations, and existing species/bond/decor systems. Add docs/rescues.md describing the
system, and link it from CLAUDE.md. Show me the plan before coding.

STORY SETUP: Dr. Fisher runs a small aquatic wildlife rescue center. He's kind, enthusiastic, a little
goofy, and he LOVES animals. He sends the player rescue cases, delivered by his pelican mail carrier.
All letters are from Dr. Fisher (1–4 short lines, warm and lightly funny, signed "— Dr. Fisher 🩺🐟").

DESIGN PILLARS: cozy, no failure, nothing dies, progress never goes backward, and each care step takes
1–2 minutes. Skipping days just pauses the story.

1. RESCUE FRAMEWORK (src/game/rescues/, pure + tested)
- A rescue is DATA: rescues/<id>.ts with id, species, rescue name, story title, a short case summary for
  the board, intro letter, a visual-state per stage, stages (each with 2–3 care tasks + a short story
  line), completion letter, and rewards (unique variant id, items, journal entry).
- Generic care task types (reusable by all stories): placeDecor(decorIds or category), useItem(itemId,
  count), keepCleanliness(min, minutes), pet(count, maxSecondsPerPet), feedAtTime(timeOfDay),
  breakModeMinutes(n), changeSubstrate(substrateId), ownSpecies(speciesId, count), interact(actionId,
  count) for story-specific actions, and decorPresent(decorId). Tasks are evaluated from game events.
- Pacing: max ONE stage completed per local calendar day (the next stage unlocks the next day), so each
  story spans 3–5 days. Stage tasks can be done in any order.
- ONE active rescue at a time. The player chooses which (see the Rescue Board). Switching: the player
  may pause the active rescue to start a different one; the paused rescue keeps all its progress, and
  the animal goes back to Dr. Fisher's center (it leaves the tank, with a letter) until resumed. Show a
  confirm dialog explaining this.
- The rescued animal doesn't count toward tank capacity while recovering (it's in a "recovery corner"
  of the current tank). It counts normally after completion.
- It can't be sold, moved, or bred until recovered.
- On completion: it becomes a normal fish with its rescue name, a 💚 "Rescued" badge, and its unique
  variant (only obtainable via rescue); it also gets a journal entry and Dr. Fisher's completion letter.

2. RESCUE BOARD (🩺 "Rescue Center" in Tools)
- Shows ALL rescue cases as cards from the start, in a grid: animal silhouette/sprite (desaturated if
  not started), name + story title ("Pinch — The Storm Survivor"), a one-line case summary, estimated
  days, a preview of the reward variant (silhouette + "?" until rescued), and a status: Available /
  In care 💚 (with stage x/y) / Paused ⏸ (with stage x/y) / Rescued ✅.
- Tapping a card opens the case file: Dr. Fisher's portrait, intro letter, what care will involve
  (general, no spoilers), and the button "Take this rescue 💚" (or "Resume" / "Switch to this rescue").
- Rescued cases can be reopened to re-read their letters.
- Data-driven: new stories appear automatically when added to rescues/.
- Dr. Fisher's portrait from public/assets/story/dr_fisher.png, or a code-drawn placeholder.

3. VISUAL STATES (code overlays on existing sprites, no new sprites needed)
- A shared overlay system for stage visuals: bandage (on a configurable anchor point), cracks overlay,
  desaturation amount, shy posture (smaller scale, hides near decor, slower), and a sparkle-heal effect
  when a stage completes. Each rescue stage picks its visuals.

4. ARRIVAL & LETTERS
- When a rescue is taken/resumed, the pelican mail carrier (public/assets/story/pelican.png or a
  code-drawn placeholder) flies across the tank and gently lowers the animal into the recovery corner,
  plus a letter.
- Mailbox (📬 in Tools with an unread badge; it also ties into the mailbox decor flag if present): all
  letters from Dr. Fisher, with his portrait. Letters stay readable forever.
- Existing and new players get a welcome letter from Dr. Fisher introducing himself and the Rescue
  Center, with a button that opens the Rescue Board.

5. CARE PLAN UI
- A FishCard tab "Care 💚" for the rescued animal: stage progress ("Stage 2 of 4"), the stage's story
  line, a care-task checklist with ✅/progress and a "How?" hint per task that highlights the relevant
  button/item, and "Next stage tomorrow 🌙" once the stage is done.
- A small 💚 dot on the collapsed Tools pill when a care task is available.

6. CARE ITEMS
- Items: soft_food, healing_moss, vitamin_flakes (icons from public/assets/story/ or emoji placeholders).
  Inventory + cheap shop entries (Food tab) + rewards from daily tasks. Taking a rescue for the first
  time also gives a small starter care kit (2 of each).
- Using an item: select it, then tap the rescued animal (or the tank) with a little use animation.

7. DAILY TASKS
- 3 tasks per day (local date). If a rescue is active, 1–2 of them are its current care tasks; the rest
  come from a general pool (collect N shells, pet N fish, feed N pellets, clean N algae, place a decor,
  hatch an egg, spend N minutes in Break Mode, raise a fish's bond, etc.), scaled to the player's level.
- Rewards per task: shells, sometimes pearls or care items. Completing all 3 gives a small bonus.
- NO streaks. Weekly chest: complete all daily tasks on any 5 of the last 7 days → a weekly chest
  (pearls + rare decor chance + care items).
- 1 free reroll per day for general tasks (care tasks can't be rerolled).
- UI: "📋 Tasks" in Tools with a badge; a compact list; completion pops a small toast and a ✓
  animation. Respect the notification budget.

8. PINCH THE CRAB — "The Storm Survivor" (rescues/pinch.ts)
- Case summary: "Washed up after a storm with a cracked shell and a hurt claw."
- Intro letter from Dr. Fisher: the little crab was found on the beach after last night's storm, with a
  cracked shell and a sore claw, and he's a bit grumpy (Dr. Fisher thinks he's just scared). He needs a
  quiet home to heal.
- Visuals: stage 1 = cracks + bandaged right claw + shy; stage 2 = cracks + bandage, less shy;
  stage 3 = "molting" (hidden behind decor for the day, only eye stalks peeking); stage 4 = new shiny
  shell (sparkle-heal), no bandage.
- Stage 1: placeDecor(any rock/cave/driftwood as a hideout) · useItem(soft_food, 2)
- Stage 2: keepCleanliness(70, 10 min of active play) · pet(2, maxSecondsPerPet: 3) ("he's shy, keep it short")
- Stage 3: interact("leave_him_be": open his Care tab and tap "Let him rest") · useItem(healing_moss, 1)
- Stage 4: pet(3) · useItem(vitamin_flakes, 1)
- Rewards: Pinch with the "Stormshell" variant (a deep coral-red shell with a pearly sheen, via code
  color shift), the claw-clap trick unlocked early, +30% shell-dig chance for Pinch, and a journal entry.

9. SAVE, TESTS, DEV TOOLS
- Bump the save version and migrate (empty rescue state, empty mailbox, daily task state, welcome
  letter queued).
- Unit tests: task evaluation per task type, the one-stage-per-day rule across midnight, the
  offline/no-failure behavior, one-active-rescue enforcement, pause/switch/resume keeping progress,
  daily task generation (seeded), reroll, weekly chest 5-of-7 logic, and the migration.
- E2E: open the Rescue Board → take Pinch → care tab → complete stage 1 → next-day unlock (fake clock)
  → switch to another rescue and back (progress kept) → completion.
- Dev panel: start any rescue, complete the current stage, advance the day, give care items, reset
  daily tasks.
```

---

## Prompt 2 — Noodle the Kuhli Loach: "Too Shy to Shine"
```
Add a rescue story using the existing rescue framework (read docs/rescues.md). Only add data + the small
special mechanics below; don't change the framework unless needed (if so, explain why first). It must
appear on the Rescue Board automatically.

rescues/noodle.ts — Noodle the Kuhli Loach, "Too Shy to Shine"
- Case summary: "Rescued from an overcrowded pet store tank, too scared to leave the sand."
- Intro letter from Dr. Fisher: Noodle came from a pet store tank that was way too crowded; he's
  sweet but so scared he won't come out of the sand. Dr. Fisher thinks a calm tank and a patient friend
  will change that.
- Special mechanic "trust meter": while in care, Noodle stays burrowed with only his head peeking. Each
  completed task raises trust; higher trust = he peeks longer and occasionally slides out, then
  rushes back.
- Visuals: stage 1 = fully burrowed, eyes only; stage 2 = head + neck out; stage 3 = out briefly, shy
  posture; stage 4 = swims freely (sparkle-heal).
- Stage 1: placeDecor(2 plants, for cover) · feedAtTime(night)
- Stage 2: breakModeMinutes(3) ("he likes your quiet company") · keepCleanliness(65, 10 min)
- Stage 3: interact("sit_with_him": press and hold near (not on) his burrow for 5s; hearts appear) ·
  useItem(soft_food, 1)
- Stage 4: pet(2) · feedAtTime(night)
- Rewards: Noodle with the "Shadow Stripe" variant (deep charcoal with glowing amber stripes at night),
  greets you at the glass on every return (like Friendly bond) from day one, and a journal entry.
- Tests for the trust meter and night feeding.
```

---

## Prompt 3 — Cherry the Shrimp: "Lost Her Color"
```
Add a rescue story using the existing rescue framework (read docs/rescues.md). Only add data + the
special mechanics below. It must appear on the Rescue Board automatically.

rescues/cherry.ts — Cherry the Shrimp, "Lost Her Color"
- Case summary: "So stressed she's lost all her color."
- Intro letter from Dr. Fisher: this little shrimp arrived almost see-through from stress. Clean water and
  some calm should bring her color back. He can't wait to see it.
- Special mechanic "color recovery": her desaturation decreases smoothly as tasks complete (not just per
  stage), so players see progress immediately.
- Visuals: stage 1 = almost white/translucent; stage 2 = pale pink; stage 3 = pink; stage 4 = bright ruby
  red (sparkle-heal).
- Stage 1: keepCleanliness(75, 10 min) · placeDecor(moss_ball)
- Stage 2: interact("no_overfeeding": a day where no pellets dissolve on the sand, shown as a live
  checkbox; corys eating landed pellets count as success) · useItem(vitamin_flakes, 1)
- Stage 3: ownSpecies(cory, 1) ("corys keep the sand clean for her") · useItem(healing_moss, 1)
- Stage 4: keepCleanliness(80, 10 min) · pet(2)
- Completion bonus: "The Colony." Cherry lays a clutch, and 3 baby cherry shrimp hatch over the next
  hour (they use the half-slot capacity rule; if no space, they go to the Nursery).
- Rewards: Cherry with the "Ruby" variant (deep glossy red with a sparkle), the colony, and a journal entry.
- Tests for the no-overfeeding tracking and colony spawning.
```

---

## Prompt 4 — Skipper the Hatchetfish: "Afraid to Jump"
```
Add a rescue story using the existing rescue framework (read docs/rescues.md). Only add data + the
special mechanics below. It must appear on the Rescue Board automatically.

rescues/skipper.ts — Skipper the Hatchetfish, "Afraid to Jump"
- Case summary: "Jumped out of a pond and landed in a puddle. Now he's scared of the surface."
- Intro letter from Dr. Fisher: his pelican found this little guy flopping in a puddle after he jumped
  out of a pond. Hatchetfish LOVE the surface, but Skipper won't go near it anymore.
- Special mechanic "courage": while in care, Skipper stays mid-water, below the surface zone. The custom
  "encourage" interaction: tap the water just above him 3 times within 5s → he swims up a bit with a
  determined wiggle. Each stage raises how high he'll go.
- Visuals: stage 1 = low and shy; stage 2 = mid-water; stage 3 = just under the surface with tiny
  practice hops; stage 4 = full surface zone and a big leap (sparkle-heal + rainbow splash).
- Stage 1: placeDecor(lily_pad) ("shade makes the surface feel safe") · useItem(soft_food, 1)
- Stage 2: interact("encourage", 3)
- Stage 3: interact("encourage", 5) · keepCleanliness(65, 10 min)
- Stage 4: interact("first_leap": a short guided moment where the player taps a glowing ring above the
  water as he jumps) · pet(2)
- Rewards: Skipper with the "Sky Silver" variant (silver with a soft sky-blue iridescent sheen), the jump
  trick unlocked immediately, his hops are 2x more frequent, and a journal entry.
- Tests for encourage counting and zone limits per stage.
```

---

## Prompt 5 — Professor Whiskers the Cory: "The Lonely Elder"
```
Add a rescue story using the existing rescue framework (read docs/rescues.md). Only add data + the
special mechanics below. It must appear on the Rescue Board automatically. This one reveals more about
Dr. Fisher, so its letters matter most.

rescues/professor_whiskers.ts — Professor Whiskers the Cory, "The Lonely Elder"
- Case summary: "The rescue center's oldest resident. He just needs friends."
- Intro letter from Dr. Fisher: Professor Whiskers was one of the very first animals he ever rescued,
  back when the center was just a tank in his garage. He's lived at the center for years, but corys
  are happiest in groups, and he's been alone too long. Dr. Fisher trusts you with him.
- Special mechanic "lonely mood": shown as a small rain-cloud puff when no other cory is near him; with
  friends nearby, he follows them, and they shuffle together as a group.
- Visuals: older look via code (slightly desaturated, a few "grey" whisker highlights drawn as an
  overlay, tiny round glasses overlay — cute, not sad); lonely posture until friends arrive.
- Stage 1: ownSpecies(cory, 1) (buy or breed one; it counts any cory besides him) · pet(1)
- Stage 2: changeSubstrate(golden_sand or white_sand) ("he grew up on soft sand") · useItem(soft_food, 1)
- Stage 3: ownSpecies(cory, 2) · keepCleanliness(70, 10 min)
- Stage 4: pet(3) · interact("group_photo": a short moment where the group lines up and a polaroid-style
  card is added to the journal)
- Each stage completion unlocks a short letter from Dr. Fisher about how the rescue center started
  (4 letters total, 2–4 lines each, warm and a little funny, hinting at a future mystery: "a strange
  glowing creature some fishermen keep reporting near the old pier").
- Rewards: Professor Whiskers (no special color variant: his reward is the glasses accessory overlay,
  which stays), a group bonus (each cory in the tank eats landed pellets 25% faster while he's present),
  occasional tips in a small speech bubble when tapped (pulled from a list of 20 short gameplay tips),
  and a journal entry.
- Tests for the cory-count condition (excluding himself), the group bonus, and letter unlocks.
```

---

## Prompt 6 (optional) — Balance & polish pass
```
Review the rescue stories and daily tasks together as a player would. Using the dev tools and fake
clock, run through all 5 rescues back to back (in a few different orders, including pausing and
switching) and report: total days, time per day, any task that's confusing or too slow, item supply vs
demand (do daily tasks give enough care items?), and daily task variety over 14 simulated days. Propose
exact config changes, then apply them after I approve. Verify the Rescue Board, mailbox, Care tab, and
Tasks UI on mobile + desktop with Playwright screenshots.
```
