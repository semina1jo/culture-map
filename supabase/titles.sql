-- 칭호 도감 (2026-11-28). 여러 번 실행해도 안전합니다. 기존 테이블·컬럼은 건드리지 않고 추가만 합니다.

-- 1) 리뷰에 받은 혜택과 방문 시각 입력 여부 저장
--    benefit_kind: null = 혜택 없음(정가), 'culture_day' 문화가 있는 날, 'gu' 구민 할인, 'student' 학생, 'age' 나이(청년·경로),
--                  'soldier' 장병, 'card' 카드·제휴, 'other' 기타
--    time_known: 방문 시각을 직접 적었는지 (안 적으면 12:00으로 저장되므로 시간대 칭호에서 뺀다)
alter table public.reviews add column if not exists benefit_kind text;
alter table public.reviews add column if not exists time_known boolean not null default false;
alter table public.reviews drop constraint if exists reviews_benefit_kind_check;
alter table public.reviews add constraint reviews_benefit_kind_check
  check (benefit_kind is null or benefit_kind in ('culture_day','gu','student','age','soldier','card','other'));

-- 2) 대표 칭호 공개 조회: 칭호는 user_profiles.extra_fields.titles 에 저장하고(본인만 읽기),
--    다른 사람에게는 user_id와 대표 칭호 이름만 돌려준다
create or replace function public.public_titles()
returns table (user_id uuid, rep_title text)
language sql stable security definer
set search_path = public
as $$
  select p.user_id, left(p.extra_fields->'titles'->>'rep_name', 30)
  from public.user_profiles p
  where coalesce(p.extra_fields->'titles'->>'rep_name', '') <> ''
$$;
revoke all on function public.public_titles() from public;
grant execute on function public.public_titles() to anon, authenticated;
