-- Fishbowl Break: cloud saves. Paste into Supabase → SQL Editor → Run.
-- One row per user; RLS ensures each user can only read/write their own row.

create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  version    int         not null,
  updated_at timestamptz not null default now()
);

-- updated_at is always set by the server (the client uses it for cross-device conflict checks).
create or replace function public.saves_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saves_touch_updated_at on public.saves;
create trigger saves_touch_updated_at
  before insert or update on public.saves
  for each row execute function public.saves_touch_updated_at();

alter table public.saves enable row level security;

drop policy if exists "saves: select own" on public.saves;
create policy "saves: select own" on public.saves
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "saves: insert own" on public.saves;
create policy "saves: insert own" on public.saves
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "saves: update own" on public.saves;
create policy "saves: update own" on public.saves
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
