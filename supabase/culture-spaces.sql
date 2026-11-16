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
