-- 아이디(이메일) 찾기 (2026-11-17)
-- 닉네임 또는 이메일로 가입 정보를 찾는다. 이메일은 가려서 돌려주고, 가입 방법(이메일/구글)을 알려준다.
-- 비밀번호 재설정은 Supabase Auth 기본 기능(/auth/v1/recover)을 쓰므로 DB 작업이 필요 없다.
-- 여러 번 실행해도 안전합니다.

create or replace function public.find_account(p_query text)
returns table (masked_email text, method text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := btrim(coalesce(p_query, ''));
begin
  if char_length(q) < 2 or char_length(q) > 254 then
    return;
  end if;
  return query
  select
    -- 앞 2글자(짧으면 1글자)만 보이고 나머지는 *로 가린다: ab****@gmail.com
    left(split_part(u.email, '@', 1), case when char_length(split_part(u.email, '@', 1)) <= 3 then 1 else 2 end)
      || repeat('*', greatest(char_length(split_part(u.email, '@', 1)) - case when char_length(split_part(u.email, '@', 1)) <= 3 then 1 else 2 end, 2))
      || '@' || split_part(u.email, '@', 2),
    case
      when coalesce(u.encrypted_password, '') <> '' and coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb) ? 'google' then 'both'
      when coalesce(u.encrypted_password, '') <> '' then 'email'
      else 'google'
    end
  from auth.users u
  left join public.user_profiles p on p.user_id = u.id
  where u.email is not null
    and coalesce(u.is_anonymous, false) = false
    and case when position('@' in q) > 0 then lower(u.email) = lower(q) else p.nickname = q end
  limit 3;
end;
$$;

revoke all on function public.find_account(text) from public;
grant execute on function public.find_account(text) to anon, authenticated;
