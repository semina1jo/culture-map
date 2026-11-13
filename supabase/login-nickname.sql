-- 로그인·닉네임·리뷰 별점 추가 (2026-11-07)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.

-- 1) 내 닉네임 저장 칸
alter table public.user_profiles add column if not exists nickname text;

-- 2) 리뷰에 작성자 닉네임과 별점(1~5, 선택) 저장 칸
alter table public.reviews add column if not exists nickname text;
alter table public.reviews add column if not exists rating smallint;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_rating_range') then
    alter table public.reviews add constraint reviews_rating_range check (rating is null or rating between 1 and 5);
  end if;
end $$;

-- 3) 닉네임 길이 제한 (앱과 같은 2~12자)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_profiles_nickname_len') then
    alter table public.user_profiles add constraint user_profiles_nickname_len check (nickname is null or char_length(nickname) between 2 and 12);
  end if;
end $$;

-- 확인용: 아래 두 줄 결과에 nickname, rating 칸이 보이면 성공
-- select column_name from information_schema.columns where table_name = 'user_profiles' and column_name = 'nickname';
-- select column_name from information_schema.columns where table_name = 'reviews' and column_name in ('nickname','rating');
