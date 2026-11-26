-- 2026-11-27 적용됨(마이그레이션 diary_private_bucket): 기록 탭 '나만의 기록' 사진 전용 비공개 저장소
-- 본인만 읽기·올리기·지우기. 관리자도 볼 수 없음. 앱은 'dp:경로'로 저장하고 서명 주소(6시간)로 보여줌
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diary-private', 'diary-private', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
create policy diary_private_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'diary-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy diary_private_read on storage.objects for select to authenticated
  using (bucket_id = 'diary-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy diary_private_delete on storage.objects for delete to authenticated
  using (bucket_id = 'diary-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
