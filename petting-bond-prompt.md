Add a Petting + Bond system to Fishbowl Break. Players press and hold a fish to pet it, building a bond
over time that unlocks cute tricks and small perks. This is a core "stress relief" fidget feature, so it
must feel soft, tactile, and rewarding. Read CLAUDE.md first (follow the UX Rules, design-system
components, and tokens if they exist), then add a "Petting & Bond" section describing this design.
Use plan mode and show me the plan before coding.

DESIGN PILLARS
- Bond NEVER decreases. No guilt, no decay, no "your fish misses you" pressure.
- Petting is always fun even after rewards are capped (rewards cap; the joy doesn't).
- Every pet gives instant, satisfying feedback.

1. DATA & RULES (src/game/bond.ts, pure + tested)
- Add to Fish: bondPoints (number), bondLevel (0–5), petLog (timestamps of rewarded pet sessions),
  lastPettedAt. Bump the save version and add a migration (existing fish start at 0).
- Bond levels (thresholds in constants.ts):
  0 Stranger (0) · 1 Curious (10) · 2 Friendly (30) · 3 Buddy (60) · 4 Best Friend (100) · 5 Soulmate (160)
- Bond sources:
  - Completed pet session: +3 bond, +5 happiness, +1 player XP
  - A fish eating a pellet you dropped within 80px of it: +0.2 bond (max +2/hour per fish)
- Rewarded pet sessions are capped at 3 per fish per rolling hour. After that, petting still plays all
  animations and gives +2 happiness, but no bond/XP, and the fish shows "😌 content" instead of the meter.
- Babies hatched from two parents who are both Buddy+ start at Curious (10 points).

2. PETTING INTERACTION
- Gesture: press and hold on a fish (mouse down or touch long-press, ~250ms) to start petting.
  A quick tap keeps its existing behavior (quick actions / FishCard). Disable petting in Feed/Clean/decor
  edit modes. Make the fish hitbox generous (+12px) so it's easy to grab on mobile.
- While holding:
  - The fish stops swimming, turns to face the finger/cursor, and gently follows it if you drag slowly
    (it never leaves the water area).
  - It leans into the touch: a slight tilt toward the pointer, a slower dreamy body wave, and its eyes
    switch to happy closed "^ ^" arcs (via the eye overlay system).
  - Small hearts float up every ~0.5s; soft sparkles where the pointer is.
  - Stroking (moving the pointer back and forth) fills the meter 50% faster and makes the fish wiggle happily.
  - A heart-ring meter around the pointer fills over 3 seconds.
- Completing the meter: a heart burst + "+3 💕" pop, a tiny happy spin, and a soft "bloop" sound if
  unmuted. You can keep holding to start the next session (respecting the cap).
- Releasing early: the fish gives a little wiggle and resumes swimming; the partial meter is lost
  (no penalty).
- Species flavor while petted: puffer puffs up slightly; axolotl rolls onto its back on the sand;
  jellyfish pulses slowly and glows; betta fans its fins.
- Keyboard (desktop): select a fish with Tab/click, then hold Space to pet.

3. TRICKS & PERKS (unlocked by bond level)
- Lv1 Curious: when your cursor hovers near (desktop) or you tap the water nearby (mobile), the fish
  swims over to say hi.
- Lv2 Friendly: Trick "Spin" (a quick 360° twirl).
- Lv3 Buddy: Trick "Bubble Hoop" (blows a bubble ring and swims through it).
- Lv4 Best Friend: Follow mode toggle (the fish follows your cursor/finger for 30s); its shell drops
  are worth +10%.
- Lv5 Soulmate: a species signature trick, a golden heart badge, and a soft name glow in FishCard and
  lists. Signature tricks:
  goldfish: blows a heart-shaped bubble · guppy: tail twirl with a rainbow trail · danio/tetra: zoom
  dash with speed lines · betta: dramatic fin fan display · angelfish: elegant loop-de-loop ·
  clownfish: happy wiggle dance · puffer: puff + spin + pop back · axolotl: backflip on the sand ·
  koi: leaps above the water surface with a splash · jellyfish: rainbow glow pulse
- Trigger tricks from the FishCard "Tricks" row (buttons; locked ones show the level needed) or by
  double-tapping the fish. Each trick has a 5s cooldown. Tricks are purely for fun (no rewards), so
  they can be spammed with the cooldown.
- Greeting: when the player returns after 30+ min away, Friendly+ fish swim to the front glass and
  wiggle for a few seconds. Warm, not guilt-y.

4. UI
- FishCard "Bond" section: a heart badge with the level name, a progress bar to the next level, the next
  unlock preview ("Next: Bubble Hoop at Buddy · 12 💕 to go"), sessions left this hour (3 small hearts),
  and the Tricks row.
- Bond level-up moment: a big heart burst around the fish, a toast "Bubbles is now your Buddy! 🎉 New
  trick: Bubble Hoop", and a trick demo plays once automatically.
- My Fish list: show a heart badge/level per fish and allow sorting by bond.
- Selling or releasing a Buddy+ fish: the confirm dialog mentions the bond level neutrally ("Bubbles is
  your Best Friend 💕 — sell anyway?"). Use the existing undo pattern.
- Discoverability: the first time a player taps a fish after this update, show a coachmark: "Tip: press
  and hold to pet 💕". Add a "Pet your fish" step to the onboarding for new players.
- Respect the notification budget (merge/queue toasts).

5. ACCESSIBILITY & PERFORMANCE
- Reduced motion: no follow drift, fewer hearts, tricks become simple scale pulses.
- The pet meter also shows a numeric % for screen readers (aria-live on the FishCard progress).
- No per-frame allocations for hearts/sparkles (pool particles). Hold 60fps while petting with 20 fish.

6. TESTS
- Unit (Vitest): bond thresholds, session cap with a rolling hour, the pellet-bond cap, baby
  starting bond, migration, and that bond never decreases (including offline catch-up).
- E2E (Playwright, if set up): long-press a fish → meter completes → bond increases; quick tap still
  opens quick actions; the cap shows the "content" state; a trick button plays and respects cooldown.

When done, give me dev panel controls to set any fish's bond level and reset pet caps, plus a short
manual test checklist for mobile and desktop.
