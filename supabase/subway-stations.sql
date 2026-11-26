-- 2026-11-27 적용됨(마이그레이션 subway_stations): 장소 상세 '가까운 역' 표시용
-- 채우기: sync-subway-stations 함수 호출(본문 {"dry":true}면 저장 없이 확인만). 역이 바뀔 때만 다시 돌리면 됨
create table if not exists public.subway_stations (
  id text primary key,          -- BLDN_ID
  name text not null,           -- BLDN_NM
  line text not null,           -- ROUTE (철도 구간 이름. 앱에서 승객용 노선 이름으로 바꿈)
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);
alter table public.subway_stations enable row level security;
create policy subway_stations_read on public.subway_stations for select to anon, authenticated using (true);
grant select on public.subway_stations to anon, authenticated;
