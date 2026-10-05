-- Fishbowl Break: cap the size of a cloud save (a real save is well under 300 KB; this stops runaway or abusive writes).
-- Paste into Supabase → SQL Editor → Run. NOT VALID skips re-checking old rows; new and updated rows are checked.
alter table public.saves
  drop constraint if exists saves_data_size_limit;
alter table public.saves
  add constraint saves_data_size_limit check (octet_length(data::text) < 1000000) not valid;
