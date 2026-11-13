# Supabase 연동 참고 자료

2026-11-06 확인. 익명 로그인은 이메일·비밀번호 없이 실제 auth.users 사용자를 생성한다. 데이터 API에서는 authenticated 역할이며 auth.uid() 기반 RLS가 적용된다. 세션을 지우거나 로그아웃하거나 다른 기기를 쓰면 해당 익명 계정으로 돌아갈 수 없으므로 세션 유지와 사용자 안내가 필요하다. 익명 로그인 남용 방지를 위해 공개 운영 전 CAPTCHA/Turnstile 및 가입 제한을 권장한다.

공식 자료: https://supabase.com/docs/guides/auth/auth-anonymous

브라우저에는 publishable 또는 legacy anon 공개 키를 사용한다. sb_publishable 키는 JWT가 아니므로 apikey 헤더에 넣고 Authorization에는 로그인 사용자의 access_token을 넣는다. secret/service_role 키는 RLS를 우회하므로 절대 브라우저·Git·사용자 문서로 보내지 않는다. 테이블 grant와 RLS 양쪽을 적용해야 한다.

공식 자료: https://supabase.com/docs/guides/getting-started/api-keys
