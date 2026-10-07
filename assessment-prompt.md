Do a complete health assessment of Fishbowl Break: code, gameplay, performance, UX, security, and launch
readiness. This is an AUDIT ONLY. Do NOT change any game code. The output is a prioritized improvement
plan I'll work through later. Read CLAUDE.md first, then the whole codebase.

Use these tools where available (skip gracefully if one isn't set up, and tell me):
- Playwright MCP: run the game on mobile (390x844, 375x667, 844x390 landscape) and desktop (1440x900)
  and take screenshots into qa/assessment/. Use window.__fishbowl dev hooks to set up any state.
- `npx lighthouse` on the production build (performance, accessibility, best practices, PWA).
- `npm run build` (report bundle size per chunk), `npm test`, `npm run test:e2e`, `npx tsc --noEmit`,
  and the balance simulation script if it exists.
- You may write throwaway analysis scripts in scripts/audit/ (delete them at the end).

ASSESS THESE AREAS

1. Bugs & correctness
- Play every feature end to end: onboarding, feeding, growth, shop/economy, selling, cleaning, decor &
  Decorate mode, tank styles, breeding + Nursery, petting/bond/tricks, jellyfish, level-ups, daily
  gift, Break Mode, music/Dance Mode, login + cloud sync, offline catch-up, multiple tanks.
- Look for console errors, broken states, stuck modes, race conditions, timers that drift, and
  anything that breaks after a refresh or offline period.
- Edge cases: full tank, 0 shells, max level, many fish, rapid tapping, tab hidden for hours, two
  devices on the same account.

2. Save data & sync integrity
- Can any action lose fish, currency, or decor? Are migrations complete and tested for every version?
- Cloud sync conflicts, logout/login switching, corrupt save handling, localStorage quota limits.

3. Game design & balance
- Run or extend the balance simulation: progression for a casual player (5 min every hour, workdays)
  over 1 day, 1 week, and 1 month.
- Check: time to first purchase, first breed, first bond level, first collection set; whether shells
  become meaningless or too scarce; whether decor (no level locks) makes progression too fast; dead
  or useless features; any grindy walls.
- Does every session (even 2 minutes) end with something rewarding? Is there always a clear next goal?

4. UX & UI
- Check against the "UX Rules" in CLAUDE.md (if present): clarity, feedback, consistency, tap targets,
  readability, notification budget, calm tone, discoverability of features (petting, Decorate mode,
  breeding).
- Mobile layout problems, safe areas, overlapping UI, panels that don't fit, confusing flows.
- First-time player experience: what will confuse someone in their first 5 minutes?

5. Performance
- FPS and frame time with a realistic heavy tank (20 fish, 6 jellies, 15 decor, all effects, night,
  Dance Mode) on desktop and on a throttled mobile profile (4x CPU slowdown).
- Memory over a 30-minute session (leaks from particles, listeners, audio nodes, images).
- Load time, bundle size, image sizes and formats (should sprites be WebP? are any oversized?), and
  battery-heavy work when idle or when the tab is hidden.

6. Code quality & architecture
- Is src/game still pure and testable? Any game logic leaked into render/UI?
- Duplication, dead code, unused assets, magic numbers outside constants, oversized files/components,
  inconsistent patterns, `any` types, TODOs, outdated dependencies.
- Test coverage gaps on the sim, economy, breeding, bond, and migrations.
- Does CLAUDE.md still match reality? List any drift.

7. Security & privacy
- Supabase: RLS policies correct? Can a user read/write another user's save? Keys or secrets exposed?
- Dev hooks/panels excluded from the production build? Any XSS risk from user-entered names?
- What personal data is stored, and what a privacy policy would need to say.

8. Accessibility
- Contrast, color-blind safety, reduced motion, keyboard navigation, focus states, aria labels,
  readable font sizes.

9. Launch readiness (PWA first, app stores later)
- What's missing for a solid PWA: manifest, icons, service worker/offline, install prompt, update flow.
- Analytics: what's tracked today vs what's needed to measure retention (D1/D7) and feature usage.
- What would block a Capacitor build for Android/iOS later (Sign in with Apple, account deletion,
  privacy policy, notifications, safe areas, storage).
- Legal/IP: anything referencing other games' trademarks, asset licensing notes, missing
  credits/licenses for music and fonts.

OUTPUT: ASSESSMENT.md
- Executive summary: overall health score per area (1–10) with one line of reasoning each.
- Top 10 priorities: the highest-impact items across all areas.
- Full issue list as a table per area: ID, issue, evidence (file:line or screenshot path), impact
  (high/med/low), effort (S/M/L), and the recommended fix.
- Quick wins: a list of items that are high impact + small effort.
- Suggested roadmap: group everything into 3–5 batches, ordered, each sized to fit one Claude Code
  session, with a ready-to-paste prompt for each batch.
- Balance report: progression tables/charts from the simulation, plus recommended constant changes
  (with exact values).

Be specific and evidence-based: every issue must point to code, a screenshot, a metric, or a
reproduction step. No vague advice. Don't fix anything. Stop after writing the report and give me
the executive summary + top 10 in chat.
