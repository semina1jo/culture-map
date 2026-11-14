-- 2026-11-14 적용 완료(Supabase MCP). 알림 '관심 지역'용 자치구 컬럼 (추가만)
alter table public.culture_events add column if not exists gu text;
update public.culture_events
  set gu = substring(place_addr from '서울(?:특별시|시)?\s*([가-힣]{1,4}구)')
  where gu is null and place_addr is not null;
