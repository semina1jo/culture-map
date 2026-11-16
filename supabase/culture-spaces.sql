-- 2026-11-16: 서울시 문화공간 정보 연동 (sync-culture-spaces)
-- 1) 문화 종류에 '무료 공간'(도서관 등) 추가. 기존 값은 그대로 두고 허용 범위만 넓힌다.
alter table public.culture_events drop constraint if exists culture_events_category_check;
alter table public.culture_events add constraint culture_events_category_check
  check (category in ('전시','공연','체험','축제','무료 공간'));

-- 2) 매일 새벽 5:20(KST) 자동 실행. <anon키>는 Project Settings > API 의 anon key
-- select cron.schedule('sync-culture-spaces-daily', '20 20 * * *', $$
--   select net.http_post(
--     url := 'https://vlpfgeghgwttdxhbiube.supabase.co/functions/v1/sync-culture-spaces',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon키>'),
--     body := '{"libraries": true}'::jsonb, timeout_milliseconds := 120000);
-- $$);

-- 2026-11-16: KOPIS 공연예술통합전산망 (sync-culture-kopis) 캐시 테이블. 수집 함수(서버 키)만 사용
create table if not exists public.kopis_facility (
  mt10id text primary key, name text, lat double precision, lng double precision, addr text, gu text,
  checked_at timestamptz not null default now()
);
create table if not exists public.kopis_skip (
  mt20id text primary key, reason text, checked_at timestamptz not null default now()
);
alter table public.kopis_facility enable row level security;
alter table public.kopis_skip enable row level security;
-- 매일 05:30(KST) 실행: cron 'sync-culture-kopis-daily' ('30 20 * * *'). Secret KOPIS_API_KEY 필요

-- 2026-11-16: 기록 탭 메모·사진·갈 날짜·영수증을 계정에 저장 (전엔 기기 localStorage에만)
create table if not exists public.diary_entries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('note','plan','receipt')),
  key text not null, date text, memo text, photo_url text, data jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);
alter table public.diary_entries enable row level security;
create policy diary_own_select on public.diary_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy diary_own_insert on public.diary_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy diary_own_update on public.diary_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy diary_own_delete on public.diary_entries for delete to authenticated using ((select auth.uid()) = user_id);
