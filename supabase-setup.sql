-- Habit tracker cloud sync: one JSONB row per user.
-- Run this once in the Supabase dashboard → SQL Editor.

create table if not exists public.habit_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.habit_data enable row level security;

drop policy if exists "Users manage own habit data" on public.habit_data;
create policy "Users manage own habit data"
  on public.habit_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
