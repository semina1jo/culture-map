-- 상황 투표에 장소 성격 태그 4개(solo·quiet·photo·together) 추가
-- situation-votes.sql을 이미 실행했다면 이것만 SQL Editor에서 한 번 실행
alter table public.situation_votes drop constraint if exists situation_votes_situation_check;
alter table public.situation_votes add constraint situation_votes_situation_check
  check (situation in ('quick', 'weekend', 'rain', 'solo', 'quiet', 'photo', 'together'));
