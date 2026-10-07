# Rescue Stories audit (vs rescue-stories.md, Prompts 1–5)

Audited after the balance pass (`259526b`). Nothing was fixed. Line numbers are approximate anchors.
✅ done · ⚠️ partial/simplified/unverified · ❌ not done.

## Gap list, most important first
1. **Stale care tasks after a same-day switch (bug, reproduced).** Taking Noodle after finishing Pinch gave 4 daily tasks (`care, care, care✓, care✓`). `addCareTasks` (dailyTasks.ts, end of file) keeps the previous rescue's care tasks. Daily tasks should always be 3, and an old rescue's care tasks should be dropped on pause/finish.
2. **`e2e/rescue.spec.ts` fails.** It clicks `.rescue-card` first and expects Pinch. The Board sorts by `estDays`, then id, so Cherry is first. Broken since the other 4 rescues were added, and I deployed `259526b` without noticing. Fix the test to pick Pinch by name.
3. **Other e2e failures (not rescue):** `decorate.spec.ts:4` (no "Decorate" heading), `phase4.spec.ts:50` (shop shows 3 columns on phone, expects 2), and `overlays.spec.ts` at 360×640 and 375×667 (timed out at 3.0 min). Likely pre-existing or caused by UI changes; not investigated.
4. **Reroll ignores my new rules.** `rerollTask` still offers `hatch` with no egg and ignores the kind cooldown (seen: rerolled into "Hatch an egg" at no eggs).
5. **I changed spec numbers without updating the spec.** Cherry's no-dissolve task is 15 min (spec: a whole day of no dissolves), Skipper stage 3 is ×4 (spec ×5), and only the day's first care task pays an item. rescue-stories.md and docs/rescues.md should match.
6. **Mailbox decor flag only reflects the daily gift** (renderer.ts ~1136 `giftReady`), not unread Dr. Fisher mail. Spec 4: "ties into the mailbox decor flag if present".
7. **No unit tests for:** Pinch (stages, rewards, perks), daily-task cooldown/weights/`careReward`, `addCareTasks`, pause/switch/resume across days, Rescue Board/Care tab/Tasks UI, rescue-only variant look, pelican delivery, color recovery (Cherry), trust effect on movement. E2E covers only one Pinch flow (currently failing).
8. **Spec asset paths:** portrait/pelican are in `public/assets-webp/` (not `public/assets/story/`). Fine, but undocumented there.
9. **Unverified:** the "notification budget" (Prompt 1 §7), the item-use animation (§6), re-reading letters for a Rescued case from the Board.

## Prompt 1
| § | Requirement | Status |
|---|---|---|
| 1 | Rescue = data, `rescues/<id>.ts`, registry auto-picks | ✅ registry.ts |
| 1 | Generic task types (10 + extra `noDissolve`) | ✅ types.ts |
| 1 | One stage/day | ✅ engine.ts:104 `stageOpen`; tested |
| 1 | One active rescue, pause/switch keeps progress, animal leaves with letter, confirm dialog | ✅ engine.ts:174/219, RescueBoard.tsx:56–63; tested; replayed live |
| 1 | Not counted in capacity; no sell/move/breed while recovering | ✅ sim.ts:141, economy.ts:120/501, breeding.ts:37 |
| 1 | Completion: normal fish, name, 💚 badge, variant, journal, letter | ✅ engine.ts advanceStage, FishCard.tsx:288 |
| 2 | Board with all cards, status, est. days, reward silhouette, case file, Take/Resume/Switch | ✅ RescueBoard.tsx; checked on mobile |
| 2 | Re-read letters of Rescued cases | ⚠️ not verified |
| 2 | Dr. Fisher portrait | ✅ public/assets-webp/dr_fisher.png |
| 3 | Bandage, cracks, desaturate, shy, hidden, sparkle-heal | ✅ rescueFx.ts, renderer.ts |
| 4 | Pelican delivery + letter | ✅ rescueFx.ts:37 (`PELICAN_MS`); seen in the run |
| 4 | Mailbox with unread badge, letters forever | ✅ Mailbox.tsx, Toolbar |
| 4 | Mailbox decor flag | ⚠️ gift only (gap 6) |
| 4 | Welcome letter for new + existing players, opens Board | ✅ init.ts:19, Mailbox.tsx:58; save.ts:125 |
| 5 | Care tab, stage line, checklist, How? hints, "next stage tomorrow" | ✅ CareTab.tsx |
| 5 | 💚 dot on collapsed Tools pill | ✅ Toolbar.tsx:198 |
| 6 | 3 items, shop entries, starter kit (2 each), daily rewards | ✅ engine.ts:9–15, Shop.tsx:307; kit seen (2/2/2) |
| 6 | Use animation | ⚠️ not verified |
| 7 | 3 tasks/day, 1–2 care tasks, general pool scaled by level | ✅ dailyTasks.ts; but see gap 1 |
| 7 | All-3 bonus, weekly chest 5/7, no streaks, 1 reroll | ✅ dailyTasks.ts; tested |
| 7 | Toast + ✓ | ✅ seen |
| 7 | Notification budget | ⚠️ not verified |
| 8 | Pinch story, 4 stages, tasks, letters, rewards (Stormshell, claw clap, +30% dig) | ✅ pinch.ts, species.ts:376 |
| 9 | Save bump + migration | ✅ save.ts:125; one migration test |
| 9 | Unit tests (listed items) | ✅ engine.test.ts mostly; no Pinch-specific tests |
| 9 | E2E full flow | ⚠️ one flow, currently failing; no completion step |
| 9 | Dev panel (start, complete stage, next day, items, reset daily) | ✅ DevPanel.tsx:58–77 |

## Prompts 2–5
| Story | Status |
|---|---|
| **Noodle** — data, 4 stages, tasks, trust meter, burrow visuals, sit-with-him, Shadow Stripe (species.ts:326), greets perk, tests | ✅ (noodle.ts, noodle.test.ts: trust, night feeding, sit) |
| **Cherry** — data, colorRecovery, no-overfeeding (as `noDissolve`, live), colony of 3 eggs, Ruby (species.ts:302), tests | ⚠️ task is 15 min of play, not "a day" (original and now); otherwise ✅ |
| **Skipper** — zones per stage, encourage, first_leap ring, Sky Silver (species.ts:351), jump trick via signature, hopRate 2, tests | ⚠️ encourage ×4 not ×5; "jump trick" is the generic `signature`; otherwise ✅ |
| **Professor Whiskers** — 4 letters, cory count excludes himself, lonely cloud (renderer.ts:837), glasses, group bonus (sim.ts:226), 20 tips (elder.ts:22), group photo journal card, tests | ✅ |

## TODOs / stubs / skipped tests
None found: grep for TODO, FIXME, stub, `.skip`, `.todo`, `xit` in rescues, dailyTasks, events, ui/rescue, rescueFx and rescue.spec found nothing real. Placeholder-art notes in the docs only.

## Test results
- `npm test`: 43 files, 699 tests, all pass.
- `npm run lint`, `tsc -b` and `npm run build`: pass.
- E2E: 34 passed; failed: rescue.spec, decorate.spec, phase4 "phone shows two columns", overlays @ 360×640 and @ 375×667.

## Live playthrough (Playwright, screenshots in `qa/rescues/`)
Welcome mail → Board → Pinch case file → take Pinch (pelican, starter kit 2/2/2) → Care tab → Tasks → four stages with fake clock (mail grew 2→5, journal entry on completion, items rewarded) → take Noodle → advance → switch to Skipper (Noodle paused 1/4, pause + arrival letters) → resume Noodle (stage kept) → daily tasks (pet task completed, reroll worked). No console errors. Broken: gap 1 (4 daily tasks after a switch) and gap 4 (reroll into a hatch task with no eggs). Screenshots were inspected for the Care tab, the Tasks panel and Noodle's tank; the rest were saved but not individually reviewed.
