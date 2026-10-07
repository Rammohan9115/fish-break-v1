# To do later (owner actions)

Things only the project owner can do (accounts, dashboards, secrets). Tick them off as they're done.

## Analytics
- [ ] Get the PostHog project API key: sign up at eu.posthog.com (EU Cloud) → create a project → Project settings → **Project API key** (`phc_…`).
- [ ] Add it to Vercel as `VITE_ANALYTICS_KEY` (Production): dashboard → Settings → Environment Variables, or `npx vercel env add VITE_ANALYTICS_KEY production`. (US cloud only: also set `VITE_ANALYTICS_HOST=https://us.i.posthog.com`.)
- [ ] Redeploy (the key is baked in at build time).
- [ ] Check PostHog → Activity → Live events shows `session_start`, `feed`, etc., and that Settings → Privacy shows the "Share anonymous usage stats" switch.

## Accounts and sign-in
- [ ] Deploy the delete-account Edge Function: `supabase functions deploy delete-account`.
- [ ] Add `{{ .Token }}` to the Supabase magic-link email template so the 6-digit code appears.
- [ ] Run `supabase/migrations/002_saves_size_limit.sql` in the Supabase SQL editor.

## Legal
- [ ] Fill in the art section of `CREDITS.md` (who made the fish, backgrounds and decor, the tool used, and the license or terms).
- [ ] Add the Supabase region to `public/privacy.html` if you want it stated.
