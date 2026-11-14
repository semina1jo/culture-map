-- 2026-11-15 적용 완료(Supabase MCP). 내 리뷰 삭제 허용 (정책 추가만). 좋아요·신고는 FK on delete cascade로 함께 지워짐
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reviews' and policyname='own_delete') then
    create policy own_delete on public.reviews for delete using ((select auth.uid()) = user_id);
  end if;
end $$;
grant delete on public.reviews to authenticated;
