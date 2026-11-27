-- 칭호 도감 (2026-11-28). 여러 번 실행해도 안전합니다. 기존 테이블·컬럼은 건드리지 않고 추가만 합니다.

-- 1) (변경됨: 아래 3번 참고) 리뷰에 받은 혜택과 방문 시각 입력 여부 저장
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

-- 3) (2026-11-28 변경) 받은 혜택은 프라이버시 때문에 공개 리뷰 표에서 빼고, 본인만 읽는 표에 둔다
create table if not exists public.review_benefits (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  benefit_kind text not null check (benefit_kind in ('culture_day','gu','student','age','soldier','card','other')),
  updated_at timestamptz not null default now()
);
create index if not exists review_benefits_user_idx on public.review_benefits(user_id);
alter table public.review_benefits enable row level security;
drop policy if exists review_benefits_own_select on public.review_benefits;
create policy review_benefits_own_select on public.review_benefits for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists review_benefits_own_insert on public.review_benefits;
create policy review_benefits_own_insert on public.review_benefits for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.reviews r where r.id = review_id and r.user_id = (select auth.uid())));
drop policy if exists review_benefits_own_update on public.review_benefits;
create policy review_benefits_own_update on public.review_benefits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists review_benefits_own_delete on public.review_benefits;
create policy review_benefits_own_delete on public.review_benefits for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.review_benefits from anon;
grant select, insert, update, delete on public.review_benefits to authenticated;
-- 1번에서 만든 공개 칸은 지운다 (만든 당일, 저장된 값 0건 확인 후)
alter table public.reviews drop constraint if exists reviews_benefit_kind_check;
alter table public.reviews drop column if exists benefit_kind;
