-- 2026-11-14 적용 완료(Supabase MCP). 컬처맵 리뷰: 방문 일시·함께한 사람·좋았던 점·사진 (컬럼 추가만)
alter table public.reviews add column if not exists visited_at timestamptz;
alter table public.reviews add column if not exists companions text[];
alter table public.reviews add column if not exists highlights text[];
alter table public.reviews add column if not exists photo_url text;
-- 상황 투표 값 확장(기존 값 유지 + 데이트·아이·부모님·반려동물)
alter table public.situation_votes drop constraint if exists situation_votes_situation_check;
alter table public.situation_votes add constraint situation_votes_situation_check
  check (situation = any (array['quick','weekend','rain','solo','quiet','photo','together','date','kids','parents','pet']));
