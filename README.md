# 컬처맵 (culture-map, 임시 이름)

서울 대학가 자취생을 위한 가성비 문화 혜택 지도. 거지맵 확장안(`semina1jo/poormap`)의 문화 탭을 분사해 독립 서비스로 만든 저장소입니다.

## 범위
- 문화 행사(서울시 문화행사 정보, 한눈에 보는 문화정보) + 상설 무료·저가 박물관·미술관
- 만 원 이하 표시, '내 혜택 적용' 시 혜택가로 만 원 이하가 되는 행사 추가 표시
- 제보 · 리뷰 · 찜 · 알림 · 방문 인증 · 티끌
- 현장 상태 확인: 없어졌어요 / 정보와 맞아요 / 정보가 달라요

거지맵에서 가져오지 않은 것: 식당·기타 탭, 거지방, 쿠폰장터(핫딜), 쇼핑적립, 심판대, 랭킹, CSV 가져오기

## 구조
- `index.html`: 앱 화면과 로직 전체
- `src/services/dataService.js`: Supabase 연동(인증, 리뷰, 제보, 찜 등)
- `src/services/maps.js`: 구글 지도
- `supabase/`: DB 스키마 SQL, 문화 데이터 수집 함수(sync-culture-events, sync-culture-portal)

## 데이터베이스
거지맵과 같은 Supabase 프로젝트 `poormap`(vlpfgeghgwttdxhbiube)을 함께 씁니다.
- 새 기능은 **테이블·컬럼 추가만** 합니다. 기존 테이블을 지우거나 이름을 바꾸지 않습니다(옛 거지맵 데모가 깨지지 않게).
- 거지방·쿠폰·식당(places) 데이터는 이 앱에서 읽지 않을 뿐 DB에는 그대로 둡니다.

## 배포 (Vercel)
환경변수 3개: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_MAPS_API_KEY`
- Build Command: `npm run build` / Output Directory: `dist`

새 주소를 쓰려면 다음에도 그 주소를 추가해야 합니다.
- Supabase › Authentication › URL Configuration › Redirect URLs
- Google Cloud › OAuth 클라이언트 › 승인된 JavaScript 원본
- (웹사이트 제한을 걸었다면) Google Maps API 키의 허용 웹사이트

## 로컬 실행
`npm run dev` → http://localhost:3000
