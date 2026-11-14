-- 2026-11-14 적용 완료(Supabase MCP). 컬처맵 전용 방문 인증: 티끌 원장 기록 없이 방문만 남긴다.
-- 기존 record_visit은 거지맵용으로 그대로 둔다(공유 DB, 추가만 원칙).
create or replace function public.culture_record_visit(p_event_id text,p_demo_mode boolean default false,p_distance_m numeric default 0)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid(); v public.visits; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not p_demo_mode and (p_distance_m is null or p_distance_m > 200 or p_distance_m < 0) then raise exception 'outside_visit_radius'; end if;
  insert into public.visits(user_id,event_id,visit_date,demo_mode,distance_m)
    values(uid,p_event_id,today,p_demo_mode,p_distance_m) on conflict(user_id,event_id,visit_date) do nothing returning * into v;
  if v.id is null then return jsonb_build_object('already',true); end if;
  return jsonb_build_object('already',false,'visit',to_jsonb(v));
end $$;
revoke all on function public.culture_record_visit(text,boolean,numeric) from public;
grant execute on function public.culture_record_visit(text,boolean,numeric) to authenticated;
