-- 2026-11-26 장소 등록 신청: 승인 후에도 신청자가 수정(지도에 바로 반영) + 보안 보강
-- 앞선 파일: supabase/partner-submissions.sql
--
-- 바뀌는 점
-- 1. 승인된 신청도 신청자가 고칠 수 있다. 고치면 심사 없이 지도(culture_events)에 바로 반영된다.
--    대신 바뀐 항목을 culture_submission_edits에 남기고 approved_edit_at에 시각을 적어, 관리자가 확인·내릴 수 있게 한다.
-- 2. 처음 신청할 때도 보호 트리거가 돈다: 상태·심사 칸·공개 이미지 주소는 서버가 정하고, 신청 계정 이메일은 로그인 계정에서 가져온다.
-- 3. 관리자가 본 뒤 신청자가 내용을 바꾸면 승인이 거부된다(applicant_updated_at 대조).
-- 4. 예시(is_demo) 신청도 대기 10건까지로 제한한다(전엔 제한 없음).
-- 5. 이미지 경로·주소는 본인 폴더 것만 받는다.

alter table public.culture_submissions
  add column if not exists applicant_updated_at timestamptz,
  add column if not exists approved_edit_at timestamptz;
update public.culture_submissions set applicant_updated_at = coalesce(applicant_updated_at, created_at);
alter table public.culture_submissions alter column applicant_updated_at set default now();

-- 승인 후 수정 이력 (관리자만 읽음, 트리거만 씀)
create table if not exists public.culture_submission_edits (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.culture_submissions(id) on delete cascade,
  user_id uuid,
  changes jsonb not null,           -- { 칸이름: { "before": 이전값, "after": 바뀐값 } }
  created_at timestamptz not null default now()
);
create index if not exists culture_submission_edits_sub on public.culture_submission_edits(submission_id, created_at desc);
alter table public.culture_submission_edits enable row level security;
revoke all on public.culture_submission_edits from anon, authenticated;
grant select on public.culture_submission_edits to authenticated;
drop policy if exists edits_admin_read on public.culture_submission_edits;
create policy edits_admin_read on public.culture_submission_edits for select to authenticated using (public.is_app_admin());

-- 신청자 수정 정책: 대기·반려에 더해 승인 건도 고칠 수 있다(상태는 트리거가 정한다)
drop policy if exists edit_own_pending_or_rejected on public.culture_submissions;
drop policy if exists edit_own on public.culture_submissions;
create policy edit_own on public.culture_submissions for update to authenticated
  using (user_id = (select auth.uid()) and status in ('대기','반려','승인'))
  with check (user_id = (select auth.uid()) and status in ('대기','승인'));

-- 보호 트리거: 신청·수정 모두
create or replace function public.culture_submissions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pub_prefix text := 'https://vlpfgeghgwttdxhbiube.supabase.co/storage/v1/object/public/report-photos/' || coalesce(me::text, '-') || '/';
begin
  if public.is_app_admin() then
    if tg_op = 'INSERT' and new.applicant_updated_at is null then new.applicant_updated_at := clock_timestamp(); end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := '대기'; new.admin_checks := '{}'::jsonb; new.reviewed_by := null; new.reviewed_at := null;
    new.event_id := null; new.reject_reason := null; new.reject_kind := null; new.image_url := null;
    new.approved_edit_at := null; new.created_at := now(); new.applicant_updated_at := clock_timestamp();
    new.contact_email := auth.jwt() ->> 'email';
    if new.image_path is not null and new.image_path not like me::text || '/%' then new.image_path := null; end if;
    return new;
  end if;

  -- UPDATE (신청자)
  new.user_id := old.user_id; new.is_demo := old.is_demo; new.created_at := old.created_at; new.contact_email := old.contact_email;
  new.applicant_updated_at := clock_timestamp();

  if old.status = '승인' then
    -- 승인 건: 상태·심사 기록은 그대로, 내용만 바뀐다(지도 반영은 아래 sync 트리거)
    new.status := '승인'; new.admin_checks := old.admin_checks; new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at;
    new.event_id := old.event_id; new.reject_reason := null; new.reject_kind := null;
    new.image_path := old.image_path;
    if new.image_url is distinct from old.image_url and (new.image_url is null or new.image_url not like pub_prefix || '%') then
      new.image_url := old.image_url;
    end if;
    new.approved_edit_at := now();
    return new;
  end if;

  -- 대기·반려 건: 다시 검사 대기
  new.admin_checks := '{}'::jsonb; new.reviewed_by := null; new.reviewed_at := null; new.event_id := null;
  new.reject_reason := null; new.reject_kind := null; new.status := '대기'; new.approved_edit_at := old.approved_edit_at;
  if new.image_path is not null and new.image_path is distinct from old.image_path and new.image_path not like me::text || '/%' then
    new.image_path := old.image_path;
  end if;
  if new.image_path is distinct from old.image_path then new.image_url := null; else new.image_url := old.image_url; end if;
  return new;
end $$;

drop trigger if exists culture_submissions_guard on public.culture_submissions;
create trigger culture_submissions_guard before insert or update on public.culture_submissions
  for each row execute function public.culture_submissions_guard();

-- 대기 제한: 일반 5건, 예시 10건 (관리자 제외)
create or replace function public.culture_submissions_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; cap int;
begin
  if new.status <> '대기' or public.is_app_admin() then return new; end if;
  if tg_op = 'UPDATE' and old.status = '대기' then return new; end if;
  cap := case when new.is_demo then 10 else 5 end;
  select count(*) into n from public.culture_submissions
    where user_id = new.user_id and status = '대기' and is_demo = new.is_demo and id <> new.id;
  if n >= cap then
    raise exception 'too_many_pending' using hint = format('검사 대기 중인 신청이 %s건이에요. 결과가 나온 뒤에 더 신청해 주세요.', cap);
  end if;
  return new;
end $$;
-- 트리거 순서: 이름순이라 guard → limit (guard가 status를 먼저 정한다)

-- 승인 건이 고쳐지면 지도 정보에 바로 반영하고 이력을 남긴다
create or replace function public.culture_submissions_sync_approved()
returns trigger language plpgsql security definer set search_path = public as $$
declare diff jsonb;
begin
  if not (old.status = '승인' and new.status = '승인' and new.event_id is not null) then return null; end if;

  update public.culture_events set
    title = new.title, category = new.category, raw_category = new.category, place = new.place, org_name = new.org_name,
    start_date = case when new.kind = '상설' then null else new.start_date end,
    end_date = case when new.kind = '상설' then null else new.end_date end,
    event_time = new.event_time, price = new.price,
    fee_text = coalesce(new.fee_text, case when new.price = 0 then '무료' else new.price || '원' end),
    lat = new.lat, lng = new.lng, image_url = new.image_url,
    homepage_url = coalesce(new.homepage_url, new.ticket_url), ticket_url = new.ticket_url,
    source = case when new.kind = '상설' then '상설 시설(장소 등록)' else '장소 등록' end,
    benefits = new.benefit_note, benefit_rules = new.benefit_rules, place_addr = new.place_addr,
    gu = substring(coalesce(new.place_addr, '') from '([가-힣]+구)'), description = new.description, updated_at = now()
  where id = new.event_id;

  if not public.is_app_admin() then
    select jsonb_object_agg(n.key, jsonb_build_object('before', o.value, 'after', n.value)) into diff
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value
      and n.key not in ('applicant_updated_at', 'approved_edit_at');
    if diff is not null then
      insert into public.culture_submission_edits(submission_id, user_id, changes) values (new.id, auth.uid(), diff);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists culture_submissions_sync_approved on public.culture_submissions;
create trigger culture_submissions_sync_approved after update on public.culture_submissions
  for each row execute function public.culture_submissions_sync_approved();

-- 트리거 함수는 API로 직접 부를 일이 없다
revoke execute on function public.culture_submissions_guard() from public, anon, authenticated;
revoke execute on function public.culture_submissions_limit() from public, anon, authenticated;
revoke execute on function public.culture_submissions_sync_approved() from public, anon, authenticated;

-- 승인 함수: 관리자가 본 시점(p_seen_at) 이후 신청자가 고쳤으면 거부
drop function if exists public.review_culture_submission(uuid, text, text, jsonb);
create or replace function public.review_culture_submission(p_id uuid, p_action text, p_reason text default null, p_checks jsonb default '{}'::jsonb, p_seen_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.culture_submissions; eid text;
begin
  if not public.is_app_admin() then raise exception 'admin_only'; end if;
  select * into s from public.culture_submissions where id = p_id for update;
  if s.id is null then raise exception 'not_found'; end if;
  if p_action = 'approve' and p_seen_at is not null and s.applicant_updated_at is distinct from p_seen_at then
    raise exception 'changed_since_view' using hint = '신청자가 방금 내용을 고쳤어요. 다시 확인해 주세요.';
  end if;
  eid := 'partner_' || replace(s.id::text, '-', '');

  if p_action = 'approve' then
    insert into public.culture_events(id,title,category,raw_category,place,org_name,start_date,end_date,event_time,price,fee_text,lat,lng,image_url,homepage_url,ticket_url,source,benefits,benefit_rules,place_addr,gu,description,is_demo,updated_at)
    values (eid, s.title, s.category, s.category, s.place, s.org_name,
      case when s.kind='상설' then null else s.start_date end, case when s.kind='상설' then null else s.end_date end,
      s.event_time, s.price, coalesce(s.fee_text, case when s.price=0 then '무료' else s.price || '원' end),
      s.lat, s.lng, s.image_url, coalesce(s.homepage_url, s.ticket_url), s.ticket_url,
      case when s.kind='상설' then '상설 시설(장소 등록)' else '장소 등록' end,
      s.benefit_note, s.benefit_rules, s.place_addr, substring(coalesce(s.place_addr,'') from '([가-힣]+구)'), s.description, s.is_demo, now())
    on conflict (id) do update set title=excluded.title, category=excluded.category, place=excluded.place, org_name=excluded.org_name,
      start_date=excluded.start_date, end_date=excluded.end_date, event_time=excluded.event_time, price=excluded.price, fee_text=excluded.fee_text,
      lat=excluded.lat, lng=excluded.lng, image_url=excluded.image_url, homepage_url=excluded.homepage_url, ticket_url=excluded.ticket_url,
      source=excluded.source, benefits=excluded.benefits, benefit_rules=excluded.benefit_rules, place_addr=excluded.place_addr, gu=excluded.gu,
      description=excluded.description, is_demo=excluded.is_demo, updated_at=now();
    update public.culture_submissions set status='승인', reject_reason=null, reject_kind=null, admin_checks=coalesce(p_checks,'{}'::jsonb), reviewed_by=auth.uid(), reviewed_at=now(), event_id=eid, approved_edit_at=null where id=s.id;
  elsif p_action in ('reject','unpublish') then
    delete from public.culture_events where id = eid;
    update public.culture_submissions set status='반려', reject_reason=nullif(trim(coalesce(p_reason,'')),''),
      reject_kind=case when p_action='unpublish' then '지도에서 내림' else '반려' end,
      admin_checks=coalesce(p_checks,'{}'::jsonb), reviewed_by=auth.uid(), reviewed_at=now(), event_id=null where id=s.id;
  else
    raise exception 'unknown_action';
  end if;
  return jsonb_build_object('ok', true, 'event_id', case when p_action='approve' then eid end);
end $$;
revoke execute on function public.review_culture_submission(uuid, text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.review_culture_submission(uuid, text, text, jsonb, timestamptz) to authenticated;
