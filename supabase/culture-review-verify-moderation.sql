-- 2026-11-26 적용 완료(Supabase MCP, migration: culture_review_verify_moderation)
-- 가문의 영광: 리뷰 사진 방문 확인 + 이상 징후 관리자 검토 (컬럼·함수 추가)
--  reviews.verify_level : 'ticket'(티켓·예매 내역 사진을 올림 = 방문 인증) | 'photo'(사진 촬영 시각·위치가 행사와 맞음 = 현장 사진) | null
--  reviews.verify_meta  : { photo_check: match|time|mismatch|none, taken_at, distance_m, why, ticket_path(비공개 저장소 partner-proofs) }
--  reviews.mod_status   : null(미검토) | 'ok'(문제없음) | 'hidden'(관리자 숨김) | 'auto_hidden'(서로 다른 3명 신고 → 자동 숨김, 검토 대기)
--  숨긴 리뷰는 본인·관리자만 읽을 수 있다(public_read 정책 교체). 일반 사용자는 mod_* 칸을 바꿀 수 없다(트리거)
--  admin_review_alerts(): 신고 / 같은 계정 24시간 5개 이상 / 같은 장소 1시간 5개 이상 / 다른 계정과 같은 문장 /
--                         가입 1시간 안 작성 / 사진 촬영 정보 불일치 를 찾아 관리자에게 보여 준다
--  admin_moderate_review(id, 'hide'|'ok', reason)
-- 전체 SQL은 Supabase 마이그레이션 기록(culture_review_verify_moderation)에 있다. 아래는 같은 내용이다.
alter table public.reviews add column if not exists verify_level text;
alter table public.reviews add column if not exists verify_meta jsonb;
alter table public.reviews add column if not exists mod_status text;
alter table public.reviews add column if not exists mod_reason text;
alter table public.reviews add column if not exists mod_at timestamptz;
alter table public.reviews add column if not exists mod_by uuid;
