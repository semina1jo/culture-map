-- 상황 필터 고도화: 방문 인증 때 '어울리는 상황' 투표를 모은다
-- Supabase > SQL Editor 에서 한 번 실행하면 된다. 실행 전에는 투표가 각자 기기에만 저장된다.
create table if not exists public.situation_votes (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  situation text not null check (situation in ('quick', 'weekend', 'rain', 'solo', 'quiet', 'photo', 'together')),
  created_at timestamptz not null default now(),
  unique (event_id, user_id, situation)
);
create index if not exists situation_votes_event_idx on public.situation_votes (event_id);

alter table public.situation_votes enable row level security;
-- 집계를 위해 누구나 읽기 가능, 쓰기·삭제는 본인 것만
drop policy if exists "situation_votes read" on public.situation_votes;
create policy "situation_votes read" on public.situation_votes for select using (true);
drop policy if exists "situation_votes insert own" on public.situation_votes;
create policy "situation_votes insert own" on public.situation_votes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "situation_votes delete own" on public.situation_votes;
create policy "situation_votes delete own" on public.situation_votes for delete to authenticated using (user_id = auth.uid());
