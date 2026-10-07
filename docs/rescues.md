# Rescue Stories + Daily Tasks

Dr. Fisher runs a small aquatic rescue center and sends the player rescue cases (his pelican delivers the animal).
Pillars: cozy, no failure, nothing dies, progress never goes backward. Skipping days just pauses a story.

## Where things live
| What | Where |
|---|---|
| Case data (one file per rescue) | `src/game/rescues/<id>.ts` exporting `rescue: RescueDef` (types in `rescues/types.ts`) |
| Auto-registration | `rescues/registry.ts` (`import.meta.glob`; a new file appears on the Rescue Board by itself) |
| Engine (pure): take/pause/resume, tasks, one stage per day, completion | `rescues/engine.ts` |
| Starting values, `makeLetter`, welcome letter | `rescues/init.ts` |
| Daily tasks (pure), weekly chest | `src/game/dailyTasks.ts` |
| Events → rescue + daily | `src/game/events.ts` (`applyGameEvent`) |
| Store actions | `gameStore.ts` (`takeRescue`, `giveCareItem`, `rescueInteract`, `rerollTask`, `readLetter`, `dev.*`) |
| Visuals (bandage, cracks, eye stalks, sparkle-heal, pelican) | `render/rescueFx.ts`, hooked into `renderer.ts` `paintFish` / `drawRescueFx` |
| UI | `ui/rescue/` (RescueBoard, Mailbox, DailyTasks, CareTab, CareIcon); Care tab in `FishCard`; Rescue / Mail / Tasks buttons in `Toolbar` |
| Art | `public/assets-webp/{pelican,dr_fisher}.png`, `care/{soft_food,healing_moss,vitamin_flakes}.webp` (sliced from `car_items_sheet.png`) |

## Rules
- **One active rescue.** Taking another pauses the first: it keeps all progress, and its animal leaves the tank (`RescueCaseState.away`) with a letter. Resuming brings it back.
- **One stage per local day.** Finishing a stage sets `stageDoneOn`; progress is ignored until the next date. Tasks inside a stage can be done in any order.
- **Recovering animal** (`Fish.rescue.recovering`): not counted in capacity (`tankOccupancy`), can't be sold, moved or bred. On completion it becomes a normal fish with its `rewards.variant` (`rescueOnly` variants are never random or inherited), a 💚 Rescued badge, a journal entry and the completion letter.
- **Tasks** are judged from game events (`GameEvent`) or, for `placeDecor` / `ownSpecies` / `changeSubstrate` / `decorPresent`, from the current state. `keepCleanliness` counts live play seconds only (never offline). A short pet counts when released after ≥ 1 s; `maxSecondsPerPet` rejects long ones.
- **Care items** (`soft_food`, `healing_moss`, `vitamin_flakes`): shop (Food tab), daily-task rewards, starter kit (2 each, first rescue). Using one needs a task that still wants it (never wasted).
- **Daily tasks:** 3 per local day, seeded by date + level + active rescue; 1–2 are the rescue's care tasks (not rerollable). Rewards: shells, sometimes a pearl or care item. All 3 = +30 shells. No streaks. Weekly chest: all tasks done on 5 of the last 7 days (pearls, care items, 25% a pearl-priced decor), then the counter resets. 1 free reroll per day.
- **Save:** v9 adds `rescue`, `mail`, `journal`, `daily`; the v8→v9 migration queues the welcome letter.

## Adding a rescue
Create `rescues/<id>.ts` exporting `rescue`. Reuse the task types; add a species variant with `rescueOnly: true` for the reward. Special mechanics (trust meter, courage, color recovery…) go through `StageVisual` or new events in `events.ts`.

## Noodle (kuhli loach, "Too Shy to Shine")
- **Trust meter** (`RescueDef.trustMeter`): `rescueTrust` = share of all care tasks done (shown in the Care tab). `stageVisual` adds it to the visual as `trust`.
- **Burrow** (`StageVisual.burrow`, 0 out … 1 buried): stages 1–2 keep him in the sand (the renderer pins his critter mode to `buried`); `burrowAmount` (`render/rescueFx.ts`) makes him peek longer and slide out more often as trust rises, then rush back. Stage 3 is shy and only dips in occasionally; stage 4 swims freely.
- **Sit with him** (`SIT_ACTION`): hold the water within `SIT_RADIUS` of him, not on him, for `SIT_HOLD_MS`; hearts float up, then the `interact` event fires (`TankView` `startSit`).
- **Rewards:** `shadow_stripe` variant (`dark` tone, rescue-only), `perks.greets` (swims to the glass on every return from day one, `greeters` in `gameStore`).

## Cherry (cherry shrimp, "Lost Her Color")
- **Color recovery** (`RescueDef.colorRecovery`): `stageVisual` sets `desaturate = from × (1 − rescueRecovery)`, where recovery counts finished tasks plus the *partial* progress of the current stage's tasks, so color returns as soon as she's cared for (not per stage).
- **No overfeeding** (`noDissolve` task): counts live play seconds; a `pelletDissolved` sim event (emitted from `gameStore` tick) restarts the count. Corys eating landed pellets prevent the dissolve, so that counts as success.
- **The Colony** (`rewards.colony`): on completion, N eggs of her species (variant `cherry`) are added, hatching 20/40/60 min later through the normal egg rules (half-slot capacity, Nursery when full).
- **Reward:** `ruby` variant (rescue-only).

## Skipper (hatchetfish, "Afraid to Jump")
- **Courage zones** (`StageVisual.zone`, fractions of the water, 0 surface … 1 sand): stages 1–3 hold him low → mid → just under the surface; stage 4 has no zone (the normal surface strip). `renderer.holdZone` clamps target and position; `clampToZone` (`rescues/courage.ts`) is the pure rule.
- **Hops** (`StageVisual.hops`): `none` (stays down), `practice` (tiny hops, more often), `full`. Applied to the critter by `renderer.applyCourage` via `hopOn/hopGapMul/hopScale`.
- **Encourage** (`ENCOURAGE_ACTION`): 3 taps within 5 s in the water just above him = one encouragement (`addEncourageTap`, `isAboveTap`; handled in `TankView.courageTap`), with a wiggle and a small swim upward. Stage 2 needs 3, stage 3 needs 5.
- **First leap** (`FIRST_LEAP_ACTION`): while the task is wanted he jumps every ~5 s and a glowing ring above the water marks where to tap; it counts only while he is airborne (`renderer.leapTap`).
- **Rewards:** `sky_silver` variant (rescue-only), `perks.tricks: ['signature']` (Rainbow Splash now), `perks.hopRate: 2`.

## Professor Whiskers (cory, "The Lonely Elder")
- **Lonely mood** (`rescues/elder.ts`, `renderer.followFriends`): while recovering, no other cory within `LONELY_RADIUS` → a 🌧️ puff above him and a smaller posture; with friends near he follows the nearest one. `StageVisual.elder` adds the grey whisker highlights.
- **Glasses** (`perks.glasses`): drawn in code over the eye (`drawGlasses`) while recovering and forever after. He keeps his own colors: `rewards.variant` is optional.
- **Group bonus** (`perks.groupEatBonus`): `coryEatCooldownMs` in `sim.ts` shortens every cory's pellet cooldown by 25% while a recovered Professor is in the tank.
- **Tips** (`perks.tips`): tapping him shows a speech bubble with one of 20 tips (`TIPS`, `tipBubbles` in `rescueFx.ts`).
- **Letters:** every stage has one (4 + completion). `RescueStage.journal` adds a journal entry on completing a stage (stage 4: the group photo card, `{n}` = his cory friends).
- **Group photo:** the Care tab button fires `group_photo`.

## Dev tools
Dev panel → Rescues: start any rescue, complete stage, next day (fake clock via `store.dayShift`), care items, reset daily tasks.

## Known simplifications
- Noodle's Shadow Stripe is a darkened/muted salmon sprite; the amber stripes glow via the night-theme accent glow, not a separate stripe overlay.
- Pinch's "Stormshell" is a hue shift of the red crab sprite; no extra pearly sheen yet.
- The recovery corner is not enforced; the recovering animal moves like any crab (shy = drawn smaller).
- Cherry's stage 1 "translucent" look is grayscale only (no alpha fade).
- Skipper's Sky Silver is a hue-shifted pale silver; the iridescent sheen is only the sprite's own gloss.
- The Professor's group photo is a Care-tab button plus a 📸 journal entry; the corys don't line up on screen, and "shuffling together" is just following the nearest friend.
- The molting stage draws near-invisible with eye stalks rather than walking behind decor.
