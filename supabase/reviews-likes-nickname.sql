-- 별점 리뷰·좋아요·신고·닉네임 중복 금지 (2026-11-07)
-- 여러 번 실행해도 안전합니다.

-- 1) 별점만 남기는 리뷰를 허용 (리뷰 글은 선택, 최대 1000자)
alter table public.reviews alter column text drop not null;
alter table public.reviews drop constraint if exists reviews_text_check;
alter table public.reviews drop constraint if exists reviews_text_len;
alter table public.reviews add constraint reviews_text_len check (text is null or char_length(text) <= 1000);

-- 2) 닉네임 중복 금지 (대소문자 무시)
create unique index if not exists user_profiles_nickname_unique
  on public.user_profiles (lower(nickname)) where nickname is not null;

-- 3) 공개 닉네임 조회: 다른 정보 없이 user_id와 닉네임만 돌려준다.
--    리뷰·제보에 항상 '지금' 닉네임을 표시하기 위해 사용 (닉네임을 바꾸면 예전 글에도 바로 반영)
create or replace function public.public_nicknames()
returns table (user_id uuid, nickname text)
language sql stable security definer
set search_path = public
as $$ select p.user_id, p.nickname from public.user_profiles p where p.nickname is not null $$;
revoke all on function public.public_nicknames() from public;
grant execute on function public.public_nicknames() to anon, authenticated;

-- 4) 리뷰 좋아요 (한 사람이 리뷰 하나에 1번, 다시 누르면 취소)
create table if not exists public.review_likes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (review_id, user_id)
);
create index if not exists review_likes_user_idx on public.review_likes(user_id);
alter table public.review_likes enable row level security;
drop policy if exists review_likes_read on public.review_likes;
create policy review_likes_read on public.review_likes for select to anon, authenticated using (true);
drop policy if exists review_likes_insert on public.review_likes;
create policy review_likes_insert on public.review_likes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists review_likes_delete on public.review_likes;
create policy review_likes_delete on public.review_likes for delete to authenticated using ((select auth.uid()) = user_id);
grant select on public.review_likes to anon, authenticated;
grant insert, delete on public.review_likes to authenticated;

-- 5) 리뷰 신고 (본인 신고 내역만 보임, 한 리뷰에 1번)
create table if not exists public.review_flags (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('허위 정보','광고·홍보','욕설·비방','기타')),
  created_at timestamptz not null default now(),
  unique (review_id, user_id)
);
create index if not exists review_flags_user_idx on public.review_flags(user_id);
alter table public.review_flags enable row level security;
drop policy if exists review_flags_own_read on public.review_flags;
create policy review_flags_own_read on public.review_flags for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists review_flags_insert on public.review_flags;
create policy review_flags_insert on public.review_flags for insert to authenticated with check ((select auth.uid()) = user_id);
grant select, insert on public.review_flags to authenticated;
