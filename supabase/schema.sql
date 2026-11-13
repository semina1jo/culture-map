-- 거지맵 컨셉 데모: Supabase 실제 연결 스키마
-- 최초 설치용. 기존 테이블이 있는 프로젝트는 변경분 migration으로 적용한다.
-- 서버 키가 필요하지 않도록 공개 읽기와 작성자별 쓰기를 분리한다.
create extension if not exists pgcrypto;

create table if not exists public.cultural_events (
  id text primary key,
  codename text, guname text, title text not null, date text, place text,
  org_name text, use_trgt text, use_fee text, is_free text, main_img text,
  strtdate date, end_date date, org_link text, hmpg_addr text,
  lat numeric, lot numeric, price_min integer, price_label text, genre4 text,
  is_sample boolean not null default false,
  source text not null default '사용자 제보',
  user_id uuid references auth.users(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint cultural_events_coords check ((lat is null and lot is null) or (lat between 37 and 38 and lot between 126 and 128))
);
create table if not exists public.event_benefits (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  event_id text not null references public.cultural_events(id) on delete cascade,
  type text not null check (type in ('ageMax','ageMin','student','gu','soldier','disabled','merit','income','multi')),
  value jsonb, price_after integer not null check (price_after >= 0),
  label text not null, auto_extracted boolean not null default false,
  user_id uuid references auth.users(id) on delete cascade
);
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth date, student_type text check (student_type in ('univ','school','none')),
  gu text, soldier boolean not null default false,
  interest_genres text[] not null default '{}',
  tikkle integer not null default 1240,
  demo_mode boolean not null default true,
  noti_settings jsonb not null default '{}'::jsonb,
  extra_fields jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.places (
  id text primary key,
  category text not null check (category in ('식당','기타')),
  subcategory text, name text not null,
  price integer not null check (price between 0 and 10000),
  ref_price integer check (ref_price is null or ref_price >= 0),
  address text, lat numeric, lng numeric, hours text, note text, source text,
  is_sample boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint places_coords check ((lat is null and lng is null) or (lat between 37 and 38 and lng between 126 and 128))
);
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('event','place')),
  target_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);
create table if not exists public.reports (
  id text primary key, tab text not null check (tab in ('문화','기타','식당')),
  name text not null, genre text, subcategory text,
  price integer check (price between 0 and 10000),
  ref_price integer check (ref_price is null or ref_price >= 0),
  start_date date, end_date date, address text, lat numeric, lng numeric,
  photo_url text, source_url text,
  status text not null default '심판중' check (status in ('심판중','통과','종료')),
  yes integer not null default 0, ended integer not null default 0, wrong integer not null default 0,
  user_id uuid not null references auth.users(id) on delete cascade,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.report_votes (
  id uuid primary key default gen_random_uuid(),
  report_id text not null references public.reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('yes','ended','wrong')),
  created_at timestamptz not null default now(),
  unique (report_id, user_id)
);
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  visit_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  verified_at timestamptz not null default now(),
  demo_mode boolean not null default false,
  distance_m numeric,
  unique (user_id, event_id, visit_date)
);
create table if not exists public.tikkle_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null, reason text not null,
  kind text not null default 'activity', target_id text,
  date date not null default ((now() at time zone 'Asia/Seoul')::date),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.saved (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('event','place')),
  target_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null, type text not null, text text not null, target_id text,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists reviews_target_idx on public.reviews(target_type,target_id,created_at desc);
create index if not exists votes_report_idx on public.report_votes(report_id);
create index if not exists reports_user_idx on public.reports(user_id);
create index if not exists benefits_event_idx on public.event_benefits(event_id);
create index if not exists ledger_user_idx on public.tikkle_ledger(user_id);
create index if not exists events_user_idx on public.cultural_events(user_id);
create index if not exists places_user_idx on public.places(user_id);

-- 공개 데이터는 누구나 읽을 수 있다. 편집은 작성자만 가능하다.
do $$
declare t text;
begin
  foreach t in array array['cultural_events','event_benefits','places','reviews','reports','report_votes'] loop
    execute format('alter table public.%I enable row level security',t);
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='public_read') then
      execute format('create policy public_read on public.%I for select to anon, authenticated using (true)',t);
    end if;
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='own_insert') then
      execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',t);
    end if;
  end loop;
  foreach t in array array['cultural_events','event_benefits','places','reviews'] loop
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='own_update') then
      execute format('create policy own_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
    end if;
  end loop;
  foreach t in array array['user_profiles','visits','tikkle_ledger','saved','notifications'] loop
    execute format('alter table public.%I enable row level security',t);
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='own_all') then
      execute format('create policy own_all on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
    end if;
  end loop;
end $$;
grant select on public.cultural_events,public.event_benefits,public.places,public.reviews,public.reports,public.report_votes to anon,authenticated;
grant insert on public.cultural_events,public.event_benefits,public.places,public.reviews,public.reports,public.report_votes to authenticated;
grant update on public.cultural_events,public.event_benefits,public.places,public.reviews to authenticated;
grant select,insert,update,delete on public.user_profiles,public.visits,public.tikkle_ledger,public.saved,public.notifications to authenticated;

-- 투표 집계는 서버 트리거가 수행한다. 브라우저에서 남의 제보를 변경할 수 없다.
create or replace function public.update_report_totals() returns trigger
language plpgsql security definer set search_path = public as $$
declare y integer; e integer; w integer;
begin
  select count(*) filter(where vote='yes'),count(*) filter(where vote='ended'),count(*) filter(where vote='wrong')
    into y,e,w from public.report_votes where report_id=new.report_id;
  update public.reports set yes=y,ended=e,wrong=w,
    status=case when created_at + interval '7 days' < now() then '종료' when y>=3 and y>e+w then '통과' else '심판중' end
    where id=new.report_id;
  return new;
end $$;
revoke all on function public.update_report_totals() from public,anon,authenticated;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='report_vote_totals') then
    create trigger report_vote_totals after insert on public.report_votes for each row execute function public.update_report_totals();
  end if;
end $$;

-- 일일 방문·티끌을 한 트랜잭션으로 기록한다. 중복 방문 보상은 0이다.
create or replace function public.record_visit(p_event_id text,p_demo_mode boolean default false,p_distance_m numeric default 0)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid(); v public.visits; l public.tikkle_ledger; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not p_demo_mode and (p_distance_m is null or p_distance_m > 200 or p_distance_m < 0) then raise exception 'outside_visit_radius'; end if;
  insert into public.visits(user_id,event_id,visit_date,demo_mode,distance_m)
    values(uid,p_event_id,today,p_demo_mode,p_distance_m) on conflict(user_id,event_id,visit_date) do nothing returning * into v;
  if v.id is null then return jsonb_build_object('reward',0,'already',true); end if;
  insert into public.tikkle_ledger(user_id,amount,reason,kind,target_id,date,metadata)
    values(uid,100,'문화 방문 인증','culture_visit',p_event_id,today,jsonb_build_object('distance_m',p_distance_m,'simulated',p_demo_mode)) returning * into l;
  return jsonb_build_object('reward',100,'already',false,'visit',to_jsonb(v),'ledger',to_jsonb(l));
end $$;
revoke all on function public.record_visit(text,boolean,numeric) from public;
grant execute on function public.record_visit(text,boolean,numeric) to authenticated;

-- 제보 사진은 작성자 경로에만 업로드하고 공개 제보의 사진만 공개 읽기한다.
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='geojimap_photos_read') then
    create policy geojimap_photos_read on storage.objects for select to anon,authenticated using(bucket_id='report-photos');
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='geojimap_photos_insert') then
    create policy geojimap_photos_insert on storage.objects for insert to authenticated with check(bucket_id='report-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
  end if;
end $$;
