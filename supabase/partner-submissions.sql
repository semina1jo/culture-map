-- 2026-11-19: 관계자 등록 → 관리자 심사 → 지도에 정식 등록
-- 원칙: 기존 테이블은 지우거나 이름을 바꾸지 않고, 새 테이블·컬럼만 추가한다.

-- 1) 관리자 목록. 행 추가는 SQL Editor에서 직접 한다.
--    insert into public.app_admins(user_id, email) select id, email from auth.users where email = '관리자이메일';
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to anon, authenticated;

-- 2) 관계자 등록 신청
create table if not exists public.culture_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('행사','상설')),
  -- 관계자 정보
  contact_name text not null check (length(contact_name) between 1 and 40),
  contact_phone text,
  contact_email text not null,
  org_name text not null check (length(org_name) between 1 and 60),
  role text not null check (role in ('운영자','기획자','작가','기타')),
  proof_type text not null check (proof_type in ('사업자등록번호','기관 이메일','공식 SNS·홈페이지','대관 확인서')),
  proof_value text,
  proof_file_path text,
  -- 등록할 정보
  title text not null check (length(title) between 1 and 80),
  category text not null check (category in ('전시','공연','체험','축제','무료 공간')),
  place text not null,
  place_addr text,
  lat double precision not null check (lat between 33 and 39),
  lng double precision not null check (lng between 124 and 132),
  start_date date,
  end_date date,
  event_time text,
  price integer not null check (price between 0 and 1000000),
  fee_text text,
  benefit_rules jsonb not null default '[]'::jsonb,
  benefit_note text,
  ticket_url text,
  homepage_url text,
  description text check (description is null or length(description) <= 500),
  image_url text,
  -- 심사
  status text not null default '대기' check (status in ('대기','승인','반려')),
  reject_reason text,
  admin_checks jsonb not null default '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  event_id text,
  created_at timestamptz not null default now(),
  check (kind = '상설' or (start_date is not null and end_date is not null and end_date >= start_date))
);
create index if not exists culture_submissions_status_idx on public.culture_submissions(status, created_at desc);
create index if not exists culture_submissions_user_idx on public.culture_submissions(user_id);
alter table public.culture_submissions enable row level security;

do $$ begin
  -- 신청: 로그인한(게스트 아님) 사용자가 자기 이름으로, '대기' 상태로만
  if not exists(select 1 from pg_policies where tablename='culture_submissions' and policyname='submit_own') then
    create policy submit_own on public.culture_submissions for insert to authenticated
      with check (user_id = (select auth.uid()) and status = '대기' and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);
  end if;
  -- 조회: 본인 신청 또는 관리자
  if not exists(select 1 from pg_policies where tablename='culture_submissions' and policyname='read_own_or_admin') then
    create policy read_own_or_admin on public.culture_submissions for select to authenticated
      using (user_id = (select auth.uid()) or public.is_app_admin());
  end if;
end $$;
grant select, insert on public.culture_submissions to authenticated;
-- 상태 변경은 아래 심사 함수로만 한다(직접 update 권한 없음)

-- 3) 지도 데이터에 소개 문구 칸 추가
alter table public.culture_events add column if not exists description text;

-- 4) 심사: approve(지도에 등록) / reject(반려) / unpublish(지도에서 내리고 반려)
create or replace function public.review_culture_submission(p_id uuid, p_action text, p_reason text default null, p_checks jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.culture_submissions; eid text;
begin
  if not public.is_app_admin() then raise exception 'admin_only'; end if;
  select * into s from public.culture_submissions where id = p_id for update;
  if s.id is null then raise exception 'not_found'; end if;
  eid := 'partner_' || replace(s.id::text, '-', '');

  if p_action = 'approve' then
    insert into public.culture_events(id,title,category,raw_category,place,org_name,start_date,end_date,event_time,price,fee_text,lat,lng,image_url,homepage_url,ticket_url,source,benefits,benefit_rules,place_addr,gu,description,updated_at)
    values (eid, s.title, s.category, s.category, s.place, s.org_name,
      case when s.kind='상설' then null else s.start_date end, case when s.kind='상설' then null else s.end_date end,
      s.event_time, s.price, coalesce(s.fee_text, case when s.price=0 then '무료' else s.price || '원' end),
      s.lat, s.lng, s.image_url, coalesce(s.homepage_url, s.ticket_url), s.ticket_url,
      case when s.kind='상설' then '상설 시설(관계자 등록)' else '관계자 등록' end,
      s.benefit_note, s.benefit_rules, s.place_addr, substring(coalesce(s.place_addr,'') from '([가-힣]+구)'), s.description, now())
    on conflict (id) do update set title=excluded.title, category=excluded.category, place=excluded.place, org_name=excluded.org_name,
      start_date=excluded.start_date, end_date=excluded.end_date, event_time=excluded.event_time, price=excluded.price, fee_text=excluded.fee_text,
      lat=excluded.lat, lng=excluded.lng, image_url=excluded.image_url, homepage_url=excluded.homepage_url, ticket_url=excluded.ticket_url,
      source=excluded.source, benefits=excluded.benefits, benefit_rules=excluded.benefit_rules, place_addr=excluded.place_addr, gu=excluded.gu,
      description=excluded.description, updated_at=now();
    update public.culture_submissions set status='승인', reject_reason=null, admin_checks=coalesce(p_checks,'{}'::jsonb), reviewed_by=auth.uid(), reviewed_at=now(), event_id=eid where id=s.id;
  elsif p_action in ('reject','unpublish') then
    delete from public.culture_events where id = eid;
    update public.culture_submissions set status='반려', reject_reason=nullif(trim(coalesce(p_reason,'')),''), admin_checks=coalesce(p_checks,'{}'::jsonb), reviewed_by=auth.uid(), reviewed_at=now(), event_id=null where id=s.id;
  else
    raise exception 'unknown_action';
  end if;
  return jsonb_build_object('ok', true, 'event_id', case when p_action='approve' then eid end);
end $$;
revoke all on function public.review_culture_submission(uuid,text,text,jsonb) from public, anon;
grant execute on function public.review_culture_submission(uuid,text,text,jsonb) to authenticated;

-- 5) 증빙 파일(사업자등록증·대관 확인서)은 비공개 저장소. 본인 폴더에만 올리고, 본인·관리자만 열람
insert into storage.buckets (id, name, public) values ('partner-proofs','partner-proofs', false) on conflict (id) do nothing;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='partner_proofs_insert') then
    create policy partner_proofs_insert on storage.objects for insert to authenticated
      with check (bucket_id='partner-proofs' and (storage.foldername(name))[1]=(select auth.uid())::text);
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='partner_proofs_read') then
    create policy partner_proofs_read on storage.objects for select to authenticated
      using (bucket_id='partner-proofs' and ((storage.foldername(name))[1]=(select auth.uid())::text or public.is_app_admin()));
  end if;
end $$;
