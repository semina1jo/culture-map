/* ===== 칭호 도감 탭 (2026-11-27) =====
   - 기본 칭호: 문화 종류 6개 × 5단계(입문자~마스터). 무료 공간은 서로 다른 장소 수로 센다
   - 도전 칭호 44개: 기획 문서 '가문의 영광 · 칭호 전체 목록 (검토용)' 기준
   - 판정은 기록(리뷰를 남긴 방문)으로 한다. 인증 없는 리뷰도 센다
   - 같은 곳을 다시 간 것도 리뷰마다 한 번으로 센다(기록 탭은 한 달에 한 번만 보여 준다)
   - 대표 칭호·처음 연 날짜·오문완 공유 횟수는 계정(user_profiles.extra_fields.titles)에 저장하고, 이 기기에도 같이 둔다
   - 다른 사람 리뷰의 대표 칭호는 public_titles()로 받아 온다 (dataService.titleOf)
   - index.html 안쪽 스크립트의 전역(S, allRecordEntries, findAny, sheet 등)을 그대로 쓴다 */
(function () {
  const REP_KEY = "gamun-rep-title-v1", SEEN_KEY = "gamun-title-seen-v1", SHARE_KEY = "gamun-omw-shares-v1", CEL_KEY = "gamun-title-celebrated-v1";
  const TIERS = ["입문자", "탐험가", "애호가", "전문가", "마스터"];
  const TIER_AT = { 전시: [1, 5, 15, 30, 50], 공연: [1, 3, 8, 15, 30], 체험: [1, 3, 8, 15, 25], 축제: [1, 2, 5, 10, 20], 팝업: [1, 3, 8, 15, 30], "무료 공간": [1, 3, 8, 15, 25] };
  const SOFT = { 전시: "#E6EEF9", 공연: "#F9E6EA", 체험: "#FBF0DB", 축제: "#E2F2EA", 팝업: "#EEE8F8", "무료 공간": "#EFF4E3" };
  const DARK = { 전시: "#2F5C9E", 공연: "#A13A55", 체험: "#8A5A00", 축제: "#1F6B49", 팝업: "#5B3FA0", "무료 공간": "#4F6420" };
  const THEMES = [["all", "전체"], ["save", "가성비"], ["genre", "장르"], ["steady", "꾸준함"], ["space", "공간·기록"], ["own", "막차·수요일"]];
  const DG = { theme: "all", subsAsked: false };

  const ICON = {
    coin: '<circle cx="12" cy="12" r="8"/><path d="M9 12h6"/>',
    stack: '<ellipse cx="12" cy="7" rx="6.5" ry="2.5"/><path d="M5.5 7v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V7M5.5 12v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>',
    door: '<path d="M6 20.5V4.5h9l3 2v14"/><path d="M4 20.5h16M12.5 12.5v1"/>',
    tag: '<path d="M3.5 12.5V4.5h8l9 9-8 8-9-9Z"/><circle cx="8" cy="8.5" r="1.4"/>',
    wallet: '<rect x="3.5" y="6.5" width="17" height="12" rx="3"/><path d="M15.5 12.5h2M3.5 9.5h17"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    grid: '<rect x="4.5" y="4.5" width="6" height="6" rx="1.5"/><rect x="13.5" y="4.5" width="6" height="6" rx="1.5"/><rect x="4.5" y="13.5" width="6" height="6" rx="1.5"/><rect x="13.5" y="13.5" width="6" height="6" rx="1.5"/>',
    spark: '<path d="M12 3.5 14 10l6.5 2-6.5 2-2 6.5-2-6.5-6.5-2L10 10Z"/>',
    film: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M8 5v14M16 5v14M4 9.5h4M16 9.5h4M4 14.5h4M16 14.5h4"/>',
    book: '<path d="M4.5 5.5c2.5-1 5-1 7.5.5v13c-2.5-1.5-5-1.5-7.5-.5Z"/><path d="M19.5 5.5c-2.5-1-5-1-7.5.5v13c2.5-1.5 5-1.5 7.5-.5Z"/>',
    bag: '<path d="M5.5 8.5h13l-1 11h-11Z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"/>',
    flag: '<path d="M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11"/>',
    crown: '<path d="M4 17.5 5 8l4.5 4L12 6l2.5 6L19 8l1 9.5Z"/><path d="M4 20h16"/>',
    week: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M9 3.5v3.5M15 3.5v3.5"/>',
    repeat: '<path d="M17 3.5 20 6.5l-3 3"/><path d="M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5 4 17.5l3-3"/><path d="M20 12.5v1a4 4 0 0 1-4 4H4"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-13 0 9-5 14-13 14"/><path d="M5 19 13 11"/>',
    home: '<path d="M4.5 11 12 5l7.5 6v8h-15Z"/><path d="M10 19v-4.5h4V19"/>',
    pin: '<path d="M12 20.5s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10Z"/><circle cx="12" cy="10.5" r="2"/>',
    route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
    person: '<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/>',
    heart: '<path d="M12 19s-7-4.3-7-9.4A3.6 3.6 0 0 1 12 7.4a3.6 3.6 0 0 1 7 2.2C19 14.7 12 19 12 19Z"/>',
    duo: '<circle cx="9" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 19.5c.6-3 2.8-5 5.5-5s4.9 2 5.5 5M15 14.6c2.6-.3 4.7 1.4 5.5 4.4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    pen: '<path d="M4.5 19.5 5.5 15 15 5.5l3.5 3.5L9 18.5Z"/><path d="M13 7.5l3.5 3.5"/>',
    clock: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M9.5 3.5h5"/>',
    bolt: '<path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12Z"/>',
    gamun: '<path d="M12 21.6C8 17 5.6 14.4 5.6 10.8a6.4 6.4 0 0 1 12.8 0c0 3.6-2.4 6.2-6.4 10.8Z"/><path d="M9 4l1.2 1.6L12 3l1.8 2.6L15 4l-.4 2.6H9.4Z"/><circle cx="10" cy="10.8" r=".5"/><circle cx="14" cy="10.8" r=".5"/><path d="M10.2 13q1.8 1.4 3.6 0"/>', // 앱 로고 캐릭터(왕관 쓴 핀)
    coin0: '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="2.6" ry="4"/>',
    magnify: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8.2 10.6l1.6 1.6 3-3"/>',
    dooropen: '<path d="M4 20.5h16M6.5 20.5v-17h11v17"/><path d="M6.5 3.5l6.5 2.2v15.3"/><circle cx="11" cy="12.5" r=".7"/>',
    plate: '<circle cx="15" cy="12.5" r="5.5"/><circle cx="15" cy="12.5" r="2.5"/><path d="M4 4v4.5a1.5 1.5 0 0 0 3 0V4M5.5 10v10"/>',
    firework: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/><circle cx="12" cy="12" r="1.3"/>',
    ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4Z"/><path d="M14.5 7.5v1.5M14.5 11.25v1.5M14.5 15v1.5"/>',
    drop: '<path d="M12 3.5s-6 6.8-6 10.5a6 6 0 0 0 12 0c0-3.7-6-10.5-6-10.5Z"/><path d="M9.3 14.3a2.7 2.7 0 0 0 2.7 2.7"/>',
    brush: '<rect x="5" y="3.5" width="14" height="10" rx="1.5"/><path d="M9.5 13.5 7.5 20.5M14.5 13.5l2 7"/><circle cx="9.5" cy="7.3" r="1.3"/><path d="M7.5 11.5c2-2.2 3.8-2.6 5.5-1.3 1-.8 2-.9 3 0"/>',
    calcheck: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M9 3.5v3.5M15 3.5v3.5M9 14.8l2 2 4-4"/>',
    calwed: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M9 3.5v3.5M15 3.5v3.5"/><rect x="10.5" y="12.5" width="3" height="3.5" rx=".8"/>',
    calwedall: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M9 3.5v3.5M15 3.5v3.5"/><path d="M12 12.5v4.5"/><path d="M8 12.5v.01M16 12.5v.01M8 16.5v.01M16 16.5v.01"/>',
    stampcard: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><circle cx="7.5" cy="10" r="1.6"/><circle cx="12" cy="10" r="1.6"/><circle cx="16.5" cy="10" r="1.6"/><circle cx="7.5" cy="14.5" r="1.6"/><path d="M11 14.5h2M15.5 14.5h2"/>',
    peak: '<path d="M3 20l6.5-10 3.5 5 2.5-3.5L21 20Z"/><path d="M9.5 10V3.5l4.5 1.6-4.5 1.6"/>',
    sunrise: '<path d="M3 17.5h18M6.5 17.5a5.5 5.5 0 0 1 11 0M12 5v3M5.6 8.6l1.8 1.8M18.4 8.6l-1.8 1.8M8 20.5h8"/>',
    megaphone: '<path d="M4 10v4h3l8.5 4.5v-13L7 10Z"/><path d="M7 14l1 5h2.5l-1-4.5M18.5 9.5a3.5 3.5 0 0 1 0 5"/>',
    bubble1: '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6.5A1.5 1.5 0 0 1 5 5Z"/><path d="M10.8 9.2l1.7-1.2v5.5"/>',
    map: '<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2Z"/><path d="M9 4.5v13M15 6.5v13"/>',
    idcard: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="9" cy="10.8" r="2"/><path d="M6 15.5c.5-1.4 1.6-2.2 3-2.2s2.5.8 3 2.2M14.5 10h3M14.5 13h3"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0"/>',
  };
  const svg = (k, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICON[k] || ICON.spark}</svg>`;

  /* ---------- 칭호 배지 · 시안 A '에나멜 핀' (2026-11-28) ----------
     모양 = 테마(가성비 동전 · 장르 육각형 · 꾸준함 방패 · 공간·기록 우표 · 막차·수요일 아치, 문화 종류별 칭호는 원)
     재질 = 등급(★ 백랍 · ★★ 은 · ★★★ 금). 문화 종류별 칭호는 1·2단계 백랍 → 3단계 은 → 4·5단계 금,
     2단계부터 안쪽 점선, 3단계 왼쪽 월계수, 4단계 양쪽, 5단계 왕관 + 홀로그램. 아래 점 5개 = 단계
     잠긴 칭호: 회색 점선 + 바깥 고리가 진행도 / 숨은 칭호: 모양 + '?' → 열리면 남색 특별판 */
  const GICON = {
    전시: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M7 16l3.5-4 2.5 3 2-2 2 3"/><circle cx="15.5" cy="9" r="1.2"/>',
    공연: '<rect x="9.5" y="3.5" width="5" height="9" rx="2.5"/><path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20M9 20h6"/>',
    체험: '<path d="M12 4a8 8 0 1 0 0 16c1.2 0 1.6-1 1-2-.7-1.3.2-2.5 1.6-2.5H17a3 3 0 0 0 3-3C20 7.6 16.4 4 12 4Z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.6" r="1"/><circle cx="15" cy="8.4" r="1"/>',
    축제: '<path d="M3 5c6 3 12 3 18 0"/><path d="M5.5 6.3l1.2 5 2.6-4ZM10.6 7.6l1.4 5 1.4-5ZM14.7 7.3l2.6 4 1.2-5Z"/>',
    팝업: ICON.bag,
    "무료 공간": ICON.book,
  };
  const SHAPE = {
    circle: "M50 7a43 43 0 1 1 0 86a43 43 0 1 1 0-86Z",
    hex: "M43.9 7.5Q50.0 4.0 56.1 7.5L83.8 23.5Q89.8 27.0 89.8 34.0L89.8 66.0Q89.8 73.0 83.8 76.5L56.1 92.5Q50.0 96.0 43.9 92.5L16.2 76.5Q10.2 73.0 10.2 66.0L10.2 34.0Q10.2 27.0 16.2 23.5Z",
    shield: "M50 6 Q52 6 54 7 L83 16 Q87 17.5 87 21.5 V47 C87 70 71 85 52 93 Q50 94 48 93 C29 85 13 70 13 47 V21.5 Q13 17.5 17 16 L46 7 Q48 6 50 6Z",
    stamp: "M50.0 11.5Q60.5 4.1 66.7 15.3Q79.3 13.2 80.1 26.0Q92.4 29.6 87.5 41.4Q97.0 50.0 87.5 58.6Q92.4 70.4 80.1 74.0Q79.3 86.8 66.7 84.7Q60.5 95.9 50.0 88.5Q39.5 95.9 33.3 84.7Q20.7 86.8 19.9 74.0Q7.6 70.4 12.5 58.6Q3.0 50.0 12.5 41.4Q7.6 29.6 19.9 26.0Q20.7 13.2 33.3 15.3Q39.5 4.1 50.0 11.5Z",
    arch: "M14 88 V46 A36 36 0 0 1 86 46 V88 Q86 93 81 93 H19 Q14 93 14 88Z",
  };
  /* 최고 칭호 '가문의 영광' 전용 그림: 앱 로고 캐릭터(먹색 핀 + 빨간 왕관 + 웃는 얼굴) */
  const GAMUN_ART = '<g transform="translate(21.5 21) scale(.475)"><path d="M60 108 C40 85 28 72 28 54 A32 32 0 0 1 92 54 C92 72 80 85 60 108 Z" fill="#1D2238"/><path d="M45 20 L51 28 L60 15 L69 28 L75 20 L73 33 L47 33 Z" fill="#C8372D" stroke="#C8372D" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="54" r="4.8" fill="#FAF8F4"/><circle cx="70" cy="54" r="4.8" fill="#FAF8F4"/><path d="M51 65 Q60 72 69 65" fill="none" stroke="#FAF8F4" stroke-width="4" stroke-linecap="round"/></g>';
  const TH_SHAPE = { save: "circle", genre: "hex", steady: "shield", space: "stamp", own: "arch" };
  const METAL = {
    pewter: { g: ["#E9E5DC", "#B3AC9E", "#8B8476"], enamel: "#F5EEE3", ink: "#8B8476" },
    silver: { g: ["#EEF3F9", "#A6B4C7", "#6E7F98"], enamel: "#DFE8F5", ink: "#5A6C86" },
    gold: { g: ["#FFF0B8", "#D9A83C", "#9C7215"], enamel: "#FCE6A6", ink: "#8A6410" },
  };
  const LV_METAL = ["pewter", "pewter", "silver", "gold"];       // 도전 칭호 ★~★★★ (index = lv)
  const BASE_METAL = ["pewter", "pewter", "pewter", "silver", "gold", "gold"]; // 문화 종류별 1~5단계
  const LV_NAME = ["", "일반", "희귀", "영광"];
  let uid = 0;
  const INNER = 'transform="translate(9 9) scale(.82)"';
  const iconG = (body, col, lift, w = 2.3, k = 1.5, at = 32) => `<g transform="translate(${at} ${at - lift}) scale(${k})" fill="none" stroke="${col}" style="stroke-width:${w};stroke-linecap:round;stroke-linejoin:round">${body}</g>`;
  const LEAF = { "-1": [[29.7, 76, 190], [22, 67.5, 210], [17.7, 56.9, 230], [17.3, 45.4, 250], [20.9, 34.5, 270]], "1": [[70.3, 76, -10], [78, 67.5, -30], [82.3, 56.9, -50], [82.7, 45.4, -70], [79.1, 34.5, -90]] };
  const laurel = (side, col) => LEAF[side].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="2.8" ry="6" transform="rotate(${r} ${x} ${y})" fill="${col}"/>`).join("");
  /* o: { shape, metal, enamel, ink, body, lv(문화 종류별 단계), special, state:'on'|'off'|'q', p(0~1), label } */
  function badge(o, size) {
    const h = Math.round(size * 114 / 112), d = SHAPE[o.shape] || SHAPE.circle, lab = o.label ? ` role="img" aria-label="${esc(o.label)}"` : ' aria-hidden="true"';
    const open = `<span class="dg-med" style="width:${size}px;height:${h}px"><svg viewBox="-6 -6 112 114" width="${size}" height="${h}"${lab}>`, close = "</svg></span>";
    if (o.state === "q") return `${open}<path d="${d}" fill="#EDEBE6"/><text x="50" y="62" text-anchor="middle" fill="#A6A196" style="font:700 34px Pretendard,sans-serif">?</text>${close}`;
    if (o.state === "off") {
      const C = 307.9, p = Math.max(0, Math.min(1, o.p || 0));
      return `${open}<circle cx="50" cy="50" r="49" fill="none" stroke="#ECEAE4" stroke-width="3"/>${p > 0 ? `<circle cx="50" cy="50" r="49" fill="none" stroke="#2B2F36" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(p * C).toFixed(1)} ${C}" transform="rotate(-90 50 50)"/>` : ""}<path d="${d}" transform="translate(7 7) scale(.86)" fill="#F3F2EE" stroke="#DCD9D1" stroke-width="1.4" stroke-dasharray="4 3"/>${iconG(o.body, "#B3AFA6", 0, 2, 1.1667, 36)}${close}`;
    }
    const M = METAL[o.metal], id = ++uid, gid = `bm${id}`, cid = `bc${id}`, lv = o.lv || 0;
    const enamel = o.special ? "#2A2E44" : o.enamel || M.enamel, ink = o.special ? "#E9C463" : o.ink || M.ink;
    let s = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${M.g[0]}"/><stop offset=".55" stop-color="${M.g[1]}"/><stop offset="1" stop-color="${M.g[2]}"/></linearGradient><clipPath id="${cid}"><path d="${d}" ${INNER}/></clipPath></defs>`;
    s += `<path d="${d}" fill="#000" opacity=".10" transform="translate(0 3.5)"/><path d="${d}" fill="url(#${gid})"/><path d="${d}" ${INNER} fill="${enamel}"/>`;
    if (o.shape === "circle" && !lv) for (let i = 0; i < 26; i++) { const a = i / 26 * 2 * Math.PI; s += `<circle cx="${(50 + 34 * Math.cos(a)).toFixed(1)}" cy="${(50 + 34 * Math.sin(a)).toFixed(1)}" r="1.2" fill="${M.g[1]}"/>`; } // 동전 테두리 점
    if (o.special) s += '<circle cx="30" cy="30" r="1.6" fill="#E9C463"/><circle cx="70" cy="26" r="1.2" fill="#E9C463"/><circle cx="74" cy="68" r="1.4" fill="#E9C463"/><circle cx="27" cy="70" r="1.1" fill="#E9C463"/><circle cx="60" cy="78" r=".9" fill="#E9C463"/>';
    if (lv >= 2) s += `<circle cx="50" cy="50" r="31" fill="none" stroke="${ink}" opacity=".35" stroke-width="1" stroke-dasharray="1.5 2.5"/>`;
    if (lv >= 4) s += laurel(1, M.g[1]);
    if (lv >= 3) s += laurel(-1, M.g[1]);
    if (lv >= 5) s += `<path d="M41 15 44 10 47.5 14 50 8.5 52.5 14 56 10 59 15Z" fill="${M.g[1]}" stroke="${M.g[2]}" stroke-width=".8" stroke-linejoin="round"/>`;
    s += `<g clip-path="url(#${cid})"><ellipse cx="34" cy="26" rx="26" ry="12" transform="rotate(-28 34 26)" fill="#fff" opacity=".45"/></g>`;
    if (o.metal === "gold" && (!o.lv || lv >= 5) && !o.special) s += `<defs><linearGradient id="bh${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".38" stop-color="#FFD6F0" stop-opacity="0"/><stop offset=".46" stop-color="#FFE7F5" stop-opacity=".42"/><stop offset=".52" stop-color="#D9F3FF" stop-opacity=".42"/><stop offset=".58" stop-color="#E9FFD9" stop-opacity=".29"/><stop offset=".66" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><g clip-path="url(#${cid})"><rect class="bd-sheen" x="-60" y="-10" width="220" height="120" fill="url(#bh${id})"/></g>`;
    if (lv) for (let i = 0; i < 5; i++) s += `<circle cx="${(39.6 + 5.2 * i).toFixed(1)}" cy="68" r="1.7" fill="${ink}" opacity="${i < lv ? 1 : .22}"/>`;
    s += o.art || iconG(o.body, ink, lv ? 2 : 0);
    return open + s + close;
  }
  function baseOff(g, size, label) { // 아직 없는 문화 종류: 회색 원 + 아이콘
    const h = Math.round(size * 114 / 112);
    return `<span class="dg-med" style="width:${size}px;height:${h}px"><svg viewBox="-6 -6 112 114" width="${size}" height="${h}" role="img" aria-label="${esc(label || g)}"><path d="${SHAPE.circle}" fill="#EDEBE6"/>${iconG(GICON[g] || ICON.spark, "#B3AFA6", 0, 2, 1.3333, 34)}</svg></span>`;
  }
  const extraBadge = (t, size, st) => {
    const shape = TH_SHAPE[t.th] || "circle", label = t.label || t.name;
    if (st === "q") return badge({ shape, state: "q", label: "숨은 칭호" }, size);
    if (st === "off") return badge({ shape, state: "off", body: ICON[t.ic] || ICON.spark, p: t.goal ? t.v / t.goal : 0, label: `${label} (잠김)` }, size);
    if (t.id === "c100") return badge({ shape, metal: "gold", enamel: "#FFF6DC", art: GAMUN_ART, label }, size);
    return badge({ shape, metal: t.hidden ? "gold" : LV_METAL[t.lv] || "pewter", special: !!t.hidden, body: ICON[t.ic] || ICON.spark, label }, size);
  };
  /* id만으로 그리기 (기본 칭호 b:장르:단계index, 도전 칭호 id) */
  function badgeById(id, size) {
    if (id && id.startsWith("b:")) { const [, g, i] = id.split(":"); return badge({ shape: "circle", metal: BASE_METAL[Number(i) + 1], enamel: SOFT[g], ink: DARK[g], body: GICON[g] || ICON.spark, lv: Number(i) + 1, label: `${g} ${TIERS[Number(i)]}` }, size); }
    const t = EXTRA.find(x => x.id === id); return t ? extraBadge(t, size, "on") : badge({ shape: "circle", metal: "pewter", body: ICON.spark }, size);
  }

  /* ---------- 날짜 도우미 ---------- */
  const dayNum = d => Math.round(Date.parse(d + "T00:00:00Z") / 864e5);
  const dowOf = d => new Date(d + "T00:00:00Z").getUTCDay();
  const weekKey = d => dayNum(d) - ((dowOf(d) + 6) % 7);           // 그 주 월요일
  const weekendKey = d => { const w = dowOf(d); return w === 6 ? dayNum(d) : w === 0 ? dayNum(d) - 1 : null; };
  const longestRun = (keys, step) => { const u = [...new Set(keys)].sort((a, b) => a - b); let best = 0, cur = 0, prev = null; u.forEach(k => { cur = prev != null && k - prev === step ? cur + 1 : 1; best = Math.max(best, cur); prev = k; }); return best; };
  const ymIdx = d => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
  const season = d => { const m = Number(d.slice(5, 7)); return m >= 3 && m <= 5 ? "봄" : m <= 8 && m >= 6 ? "여름" : m >= 9 && m <= 11 ? "가을" : "겨울"; };

  /* ---------- 기록을 칭호 판정용으로 모으기 ---------- */
  function collect() {
    const ds = window.dataService, revs = ds ? ds.getMyReviews() : [];
    const log = typeof receiptLog === "function" ? receiptLog() : {};
    const base = [], keys = new Set();
    revs.forEach(rv => {
      const date = kstDate(rv.visited_at || rv.created_at), it = findAny(rv.target_id); if (!date || !it) return;
      const price = it.price_min ?? it.price ?? 0, lg = log[`${date.slice(0, 7)}|${rv.target_id}`];
      const paid = lg && lg.paid != null ? Math.min(price, lg.paid) : Math.min(price, paidPrice(it));
      keys.add(`${date.slice(0, 7)}|${rv.target_id}`); base.push({ id: rv.target_id, name: it.name, genre: it.genre, date, price, paid, rv });
    });
    allRecordEntries().forEach(r => { if (!keys.has(`${r.date.slice(0, 7)}|${r.id}`)) base.push({ ...r, rv: null }); }); // 시연용 예시 기록 등
    const rows = base.sort((x, y) => x.date.localeCompare(y.date)).map(r => {
      const it = findAny(r.id) || {}, rv = r.rv;
      const hr = rv && rv.visited_at ? new Date(Date.parse(rv.visited_at) + 9 * 3600e3).getUTCHours() : null;
      const price = r.price || 0, paid = r.paid == null ? price : r.paid;
      // '받은 혜택'은 2026-11-28부터 고른다. 그 전 리뷰(또는 예시 기록)는 정가보다 싸게 냈으면 혜택으로 본다
      const ben = rv && rv.benefit_kind ? rv.benefit_kind : (!rv || String(rv.created_at) < "2026-11-27T15:00:00Z") && price > 0 && paid < price ? "other" : "";
      return { ...r, it, rv, hr, price, paid, ben, gu: recGuOf(r.id), with: (rv && rv.companions) || [], rating: (rv && rv.rating) || 0, priv: hasPrivate(noteOf(r.date, r.id)), dow: dowOf(r.date), raw: String(it.raw_category || it.CODENAME || "") };
    });
    const byG = {}; GENRES.forEach(g => byG[g] = []);
    rows.forEach(r => { if (byG[r.genre]) byG[r.genre].push(r); });
    const genreCount = g => g === "무료 공간" ? new Set(byG[g].map(r => r.id)).size : byG[g].length;
    const visitsBy = {}; rows.forEach(r => visitsBy[r.id] = (visitsBy[r.id] || 0) + 1);
    const saved = rows.reduce((a, r) => a + Math.max(0, r.price - r.paid), 0);
    const gus = {}; rows.forEach(r => { if (r.gu) (gus[r.gu] = gus[r.gu] || new Set()).add(r.id); });
    const topGu = Object.entries(gus).sort((a, b) => b[1].size - a[1].size)[0];
    const byDay = {}; rows.forEach(r => (byDay[r.date] = byDay[r.date] || []).push(r));
    const byWeek = {}; rows.forEach(r => (byWeek[weekKey(r.date)] = byWeek[weekKey(r.date)] || []).push(r));
    const byMonth = {}; rows.forEach(r => (byMonth[r.date.slice(0, 7)] = byMonth[r.date.slice(0, 7)] || []).push(r));
    let firstRev = 0;
    if (ds && ds.getReviews) revs.forEach(r => { const all = ds.getReviews(r.target_id) || []; const first = all.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]; if (first && first.id === r.id) firstRev++; });
    const subsOk = ds && ds.getMySubmissions ? ds.getMySubmissions().filter(s => s.status === "승인").length : 0;
    const shares = store().shares || 0;
    return { rows, byG, genreCount, visitsBy, saved, gus, topGu, byDay, byWeek, byMonth, firstRev, subsOk, shares };
  }

  /* 4주 연속, 주마다 다른 문화 종류(서로 다른 종류를 한 주에 하나씩 고를 수 있는지) */
  function weeklyVariety(st) {
    const wks = Object.keys(st.byWeek).map(Number).sort((a, b) => a - b);
    const can = sets => { const p = (k, used) => k === sets.length || sets[k].some(g => !used.has(g) && p(k + 1, new Set([...used, g]))); return p(0, new Set()); };
    const gs = w => [...new Set(st.byWeek[w].map(r => r.genre))];
    let best = wks.length ? 1 : 0;
    for (let i = 0; i < wks.length; i++) {
      const sets = [gs(wks[i])];
      for (let j = i + 1; j < wks.length && wks[j] - wks[j - 1] === 7 && sets.length < 4; j++) { sets.push(gs(wks[j])); if (can(sets)) best = Math.max(best, sets.length); else break; }
    }
    return best;
  }
  function monthOfAllWeds(st) {
    return Object.keys(st.byMonth).some(ym => {
      const [y, m] = ym.split("-").map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const weds = []; for (let d = 1; d <= last; d++) { const ds = `${ym}-${String(d).padStart(2, "0")}`; if (dowOf(ds) === 3) weds.push(ds); }
      return weds.length && weds.every(w => (st.byDay[w] || []).length);
    });
  }

  /* ---------- 도전 칭호 44개 ----------
     p(st) → [지금 값, 목표]. 목표에 닿으면 해금. hidden: 열리기 전엔 '???' */
  const n = (arr, f) => arr.filter(f).length;
  const EXTRA = [
    // 가성비·알뜰
    { id: "free5", th: "save", name: "공짜의 품격", ic: "coin0", lv: 1, cond: "0원으로 관람 5회", p: st => [n(st.rows, r => r.paid === 0), 5] },
    { id: "save1", th: "save", name: "짠테크 새싹", ic: "stack", lv: 1, cond: "아낀 금액 누적 3만 원", p: st => [st.saved, 30000], won: true },
    { id: "save2", th: "save", name: "짠테크 고수", ic: "stack", lv: 2, cond: "아낀 금액 누적 10만 원", p: st => [st.saved, 100000], won: true },
    { id: "save3", th: "save", name: "짠테크 마스터", ic: "stack", lv: 3, cond: "아낀 금액 누적 30만 원", p: st => [st.saved, 300000], won: true },
    { id: "eye", th: "save", name: "가성비 감별사", ic: "magnify", lv: 2, cond: "5천 원 이하 + 내 별점 4.5 이상 관람 3회", p: st => [n(st.rows, r => r.paid <= 5000 && r.rating >= 4.5), 3] },
    { id: "openrun", th: "save", name: "오픈런 전문가", ic: "dooropen", lv: 2, cond: "행사 시작 후 7일 안에 관람 3회", p: st => [n(st.rows, r => r.it.start && !isAlwaysOpen(r.it) && r.date >= r.it.start && dayNum(r.date) - dayNum(r.it.start) <= 7), 3] },
    { id: "benefit", th: "save", name: "혜택 활용왕", ic: "tag", lv: 2, cond: "할인 혜택을 받아 관람 3회 (리뷰의 '받은 혜택')", p: st => [n(st.rows, r => r.ben), 3] },
    { id: "manwon", th: "save", name: "만 원의 행복", ic: "wallet", lv: 2, cond: "한 달 동안 1만 원 이하로 4회 이상 관람", p: st => [Math.max(0, ...Object.values(st.byMonth).map(rs => rs.reduce((a, r) => a + r.paid, 0) <= 10000 ? rs.length : 0)), 4] },
    { id: "nospend", th: "save", name: "무지출 주말러", ic: "sun", lv: 1, cond: "토·일 이틀 모두 0원 관람한 주말 1번", p: st => { const ok = Object.keys(st.byDay).some(d => dowOf(d) === 6 && st.byDay[d].some(r => r.paid === 0) && (st.byDay[new Date((dayNum(d) + 1) * 864e5).toISOString().slice(0, 10)] || []).some(r => r.paid === 0)); return [ok ? 1 : 0, 1]; } },
    // 장르 확장·조합
    { id: "g3", th: "genre", name: "장르 산책자", ic: "grid", lv: 1, cond: "서로 다른 문화 종류 3개 관람", p: st => [GENRES.filter(g => st.byG[g].length).length, 3] },
    { id: "g5", th: "genre", name: "장르 파괴자", ic: "grid", lv: 2, cond: "문화 종류 5개 관람", p: st => [GENRES.filter(g => st.byG[g].length).length, 5] },
    { id: "g6", th: "genre", name: "문화 잡식가", ic: "grid", lv: 2, cond: "문화 종류 6개 모두 관람", p: st => [GENRES.filter(g => st.byG[g].length).length, 6] },
    { id: "allround", th: "genre", name: "올라운더", ic: "crown", lv: 3, cond: "6개 종류 모두 '애호가' 이상", p: st => [GENRES.filter(g => st.genreCount(g) >= TIER_AT[g][2]).length, 6] },
    { id: "weekly", th: "genre", name: "편식 없는 문화인", ic: "plate", lv: 2, cond: "4주 연속, 주마다 다른 문화 종류 관람", p: st => [weeklyVariety(st), 4] },
    { id: "c_film", th: "genre", name: "미술관 옆 영화관", ic: "film", lv: 2, hidden: true, cond: "같은 주에 전시 + 영화 관람", p: st => [Object.values(st.byWeek).some(rs => rs.some(r => r.genre === "전시") && rs.some(r => /영화/.test(r.raw))) ? 1 : 0, 1] },
    { id: "c_book", th: "genre", name: "책과 그림", ic: "book", lv: 1, hidden: true, cond: "같은 날 무료 공간 + 전시 관람", p: st => [Object.values(st.byDay).some(rs => rs.some(r => r.genre === "무료 공간") && rs.some(r => r.genre === "전시")) ? 1 : 0, 1] },
    { id: "c_pop", th: "genre", name: "팝업 투어러", ic: "bag", lv: 2, hidden: true, cond: "하루에 팝업 3곳 관람", p: st => [Math.max(0, ...Object.values(st.byDay).map(rs => new Set(rs.filter(r => r.genre === "팝업").map(r => r.id)).size)), 3] },
    { id: "c_fest", th: "genre", name: "축제의 밤", ic: "firework", lv: 1, hidden: true, cond: "18시 이후 축제 관람", p: st => [n(st.rows, r => r.genre === "축제" && r.hr != null && r.hr >= 18) ? 1 : 0, 1] },
    // 꾸준함·N회차
    { id: "c10", th: "steady", name: "프로 관람러", ic: "ticket", lv: 1, cond: "누적 관람 10회", p: st => [st.rows.length, 10] },
    { id: "c30", th: "steady", name: "문화생활 고인물", ic: "drop", lv: 2, cond: "누적 관람 30회", p: st => [st.rows.length, 30] },
    { id: "c100", th: "steady", name: "가문의 영광", ic: "gamun", lv: 3, cond: "누적 관람 100회", p: st => [st.rows.length, 100] },
    { id: "weekend", th: "steady", name: "주말의 예술가", ic: "brush", lv: 2, cond: "4주 연속 주말마다 관람", p: st => [longestRun(st.rows.map(r => weekendKey(r.date)).filter(k => k != null), 7), 4] },
    { id: "monthly", th: "steady", name: "월간 개근", ic: "calcheck", lv: 2, cond: "3개월 연속, 매달 4회 이상 관람", p: st => [longestRun(Object.entries(st.byMonth).filter(([, rs]) => rs.length >= 4).map(([ym]) => ymIdx(ym)), 1), 3] },
    { id: "again", th: "steady", name: "N차 관람 장인", ic: "repeat", lv: 2, cond: "같은 행사를 2회 이상 관람", p: st => [Math.max(0, ...Object.entries(st.visitsBy).filter(([id]) => { const it = findAny(id); return it && !isAlwaysOpen(it); }).map(([, v]) => v)), 2] },
    { id: "regular", th: "steady", name: "단골 손님", ic: "stampcard", lv: 2, cond: "같은 상설 장소를 5회 방문", p: st => [Math.max(0, ...Object.entries(st.visitsBy).filter(([id]) => { const it = findAny(id); return it && isAlwaysOpen(it); }).map(([, v]) => v)), 5] },
    { id: "season", th: "steady", name: "봄여름가을겨울", ic: "leaf", lv: 3, cond: "봄·여름·가을·겨울 각각 1회 이상 관람", p: st => [new Set(st.rows.map(r => season(r.date))).size, 4] },
    // 공간·기록·공유
    { id: "gulocal", th: "space", name: "터줏대감", ic: "home", lv: 2, cond: "한 구에서 서로 다른 곳 5곳 관람", p: st => [st.topGu ? st.topGu[1].size : 0, 5], label: st => st.topGu && st.topGu[1].size >= 5 ? `${st.topGu[0]} 터줏대감` : "○○구 터줏대감" },
    { id: "gu5", th: "space", name: "문화 유목민", ic: "pin", lv: 1, cond: "서로 다른 구 5곳에서 관람", p: st => [Object.keys(st.gus).length, 5] },
    { id: "gu10", th: "space", name: "서울 원정대", ic: "route", lv: 2, cond: "서로 다른 구 10곳에서 관람", p: st => [Object.keys(st.gus).length, 10] },
    { id: "gu25", th: "space", name: "서울 정복자", ic: "peak", lv: 3, cond: "서울 25구 모두에서 관람", p: st => [Object.keys(st.gus).length, 25] },
    { id: "night", th: "space", name: "야행성 예술가", ic: "moon", lv: 2, cond: "하루 끝에(18시 이후) 관람 5회", p: st => [n(st.rows, r => r.hr != null && r.hr >= 18), 5] },
    { id: "morning", th: "space", name: "아침형 관람객", ic: "sunrise", lv: 2, cond: "11시 이전 관람 3회", p: st => [n(st.rows, r => r.hr != null && r.hr < 11), 3] },
    { id: "solo", th: "space", name: "혼자서도 잘해요", ic: "person", lv: 1, cond: "'혼자' 관람 5회", p: st => [n(st.rows, r => r.with.includes("solo")), 5] },
    { id: "romance", th: "space", name: "로맨티스트", ic: "heart", lv: 1, cond: "'연인·배우자'와 관람 5회", p: st => [n(st.rows, r => r.with.includes("partner")), 5] },
    { id: "mate", th: "space", name: "문화 메이트", ic: "duo", lv: 1, cond: "'친구'와 관람 5회", p: st => [n(st.rows, r => r.with.includes("friend")), 5] },
    { id: "archive", th: "space", name: "감성 아카이빙러", ic: "pen", lv: 2, cond: "비공개 리뷰(나만의 기록) 5회", p: st => [n(st.rows, r => r.priv), 5] },
    { id: "share", th: "space", name: "문화 영업사원", ic: "megaphone", lv: 2, cond: "오문완 카드 공유 5회", p: st => [st.shares, 5] },
    { id: "first", th: "space", name: "첫 리뷰어", ic: "bubble1", lv: 2, cond: "리뷰가 없던 장소에 첫 리뷰 3회", p: st => [st.firstRev, 3] },
    { id: "pioneer", th: "space", name: "지도 개척자", ic: "map", lv: 1, cond: "장소 등록 신청이 승인 1회", p: st => [st.subsOk, 1] },
    // 가문의 영광 고유 기능
    { id: "last", th: "own", name: "막차 탑승객", ic: "clock", lv: 2, cond: "종료 3일 전 안에 관람 3회", p: st => [n(st.rows, r => r.it.end && !isAlwaysOpen(r.it) && r.date <= r.it.end && dayNum(r.it.end) - dayNum(r.date) <= 3), 3] },
    { id: "lastday", th: "own", name: "막차의 신", ic: "bolt", lv: 1, hidden: true, cond: "행사 마지막 날 관람", p: st => [n(st.rows, r => r.it.end && !isAlwaysOpen(r.it) && r.date === r.it.end) ? 1 : 0, 1] },
    { id: "wed", th: "own", name: "수요일의 문화인", ic: "calwed", lv: 2, cond: "문화가 있는 날(수요일) 관람 4회", p: st => [n(st.rows, r => r.dow === 3 || r.ben === "culture_day"), 4] },
    { id: "wedall", th: "own", name: "수요일 개근", ic: "calwedall", lv: 3, hidden: true, cond: "한 달의 모든 수요일에 관람", p: st => [monthOfAllWeds(st) ? 1 : 0, 1] },
    { id: "gumin", th: "own", name: "구민의 특권", ic: "idcard", lv: 2, cond: "구민 할인으로 관람 2회 (리뷰의 '받은 혜택')", p: st => [n(st.rows, r => r.ben === "gu"), 2] },
  ];

  /* ---------- 계산 ---------- */
  /* 설정 › 시연 기능 › 칭호 전체 해금: 화면에서만 전부 연 상태로 보여 주고, 획득일·해금 기록은 저장하지 않는다 */
  const demoAll = () => { try { return Boolean(typeof S !== "undefined" && S.unlockAllTitles); } catch (_) { return false; } };
  function compute() {
    const st = collect(), all = demoAll();
    const base = GENRES.map(g => {
      const at = TIER_AT[g], c = all ? Math.max(st.genreCount(g), at[at.length - 1]) : st.genreCount(g), lv = at.filter(x => c >= x).length;
      return { g, c, lv, tier: lv ? TIERS[lv - 1] : null, next: lv < 5 ? at[lv] : null, nextTier: lv < 5 ? TIERS[lv] : null };
    });
    const extra = EXTRA.map(t => { const [v0, goal] = t.p(st), v = all ? Math.max(v0, goal) : v0; return { ...t, v, goal, pending: all ? false : t.pending, on: all || (!t.pending && v >= goal), label: t.label ? t.label(st) : t.name }; });
    const earned = [];
    base.forEach(b => { for (let i = 0; i < b.lv; i++) earned.push({ id: `b:${b.g}:${i}`, name: `${b.g} ${TIERS[i]}`, g: b.g }); });
    extra.forEach(t => { if (t.on) earned.push({ id: t.id, name: t.label, t }); });
    const seen = store().seen;
    return { st, base, extra, earned, seen, total: 30 + EXTRA.length };
  }
  /* 저장: 계정 값(dataService) 우선, 없으면 이 기기 값 */
  function store() {
    const ds = window.dataService, acc = ds && ds.getMyTitles ? ds.getMyTitles() : {};
    let loc = {}; try { loc = { rep: localStorage.getItem(REP_KEY) || "", seen: JSON.parse(localStorage.getItem(SEEN_KEY)) || {}, shares: Number(localStorage.getItem(SHARE_KEY)) || 0 }; } catch (_) {}
    let locCel = null; try { locCel = JSON.parse(localStorage.getItem(CEL_KEY)); } catch (_) {}
    const cel = acc.celebrated || locCel; // 해금 화면을 이미 보여 준 칭호
    return { rep: acc.rep || loc.rep || "", seen: { ...(loc.seen || {}), ...(acc.seen || {}) }, shares: Math.max(acc.shares || 0, loc.shares || 0), rep_name: acc.rep_name || "", celebrated: Array.isArray(cel) ? cel : null };
  }
  function save(patch) {
    try { if (patch.celebrated) localStorage.setItem(CEL_KEY, JSON.stringify(patch.celebrated)); if (patch.rep !== undefined) localStorage.setItem(REP_KEY, patch.rep || ""); if (patch.seen) localStorage.setItem(SEEN_KEY, JSON.stringify(patch.seen)); if (patch.shares != null) localStorage.setItem(SHARE_KEY, String(patch.shares)); } catch (_) {}
    const ds = window.dataService; if (ds && ds.setMyTitles) ds.setMyTitles(patch);
  }
  const markSeen = C => { if (demoAll()) return; const s = { ...C.seen }; let ch = false; C.earned.forEach(e => { if (!s[e.id]) { s[e.id] = REC_TODAY; ch = true; } }); const r = repOf(C), name = r ? r.name : ""; if (ch || name !== store().rep_name) save({ seen: s, rep_name: name }); };
  const repId = () => store().rep;
  const setRep = id => { const C = compute(), hit = C.earned.find(e => e.id === id); save({ rep: id || "", rep_name: hit ? hit.name : "" }); };
  function repOf(C) {
    const id = repId(), hit = C.earned.find(e => e.id === id);
    if (hit) return hit;
    return C.earned.filter(e => e.g).sort((a, b) => Number(b.id.split(":")[2]) - Number(a.id.split(":")[2]))[0] || C.earned[0] || null; // 고르지 않았으면 가장 높은 기본 칭호
  }
  const fmtV = (t, v) => t.won ? (v >= 10000 ? `${(v / 10000).toFixed(v % 10000 ? 1 : 0)}만` : `${Math.round(v).toLocaleString()}`) : String(Math.min(v, t.goal));
  const dotDay = d => d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : "";

  /* ---------- 화면 ---------- */
  function medal(e, size) {
    if (!e) return badge({ shape: "circle", state: "off", body: ICON.lock, label: "아직 없음" }, size);
    if (e.g || (e.id && e.id.startsWith("b:"))) return badgeById(e.id, size);
    const t = e.t ? e.t : e; return t.id ? badgeById(t.id, size) : badge({ shape: "circle", metal: "pewter", body: ICON[t.ic] || ICON.spark }, size);
  }
  function page(pg) {
    if (!DG.subsAsked && window.dataService && !window.dataService.account().isGuest && window.dataService.listSubmissions) {
      DG.subsAsked = true; window.dataService.listSubmissions(false).then(r => { if (r && r.ok && S.tab === "dogam") renderPage(); });
    }
    const C = compute(), rep = repOf(C), shown = C.extra.filter(t => DG.theme === "all" || t.th === DG.theme);
    const openN = C.extra.filter(t => t.on).length;
    const isNew = id => !demoAll() && !C.seen[id];
    pg.innerHTML = `<h1>칭호 도감</h1>
      <div class="card dg-rep">
        <div class="dg-rep-top">${medal(rep, 64)}
          <div class="dg-rep-t"><small>대표 칭호</small><b>${rep ? esc(rep.name) : "아직 없어요"}</b><small>${rep ? "리뷰 닉네임 옆과 오문완 카드에 보여요" : "다녀온 곳에 리뷰를 남기면 첫 칭호가 열려요"}</small></div>
          ${C.earned.length ? '<button class="out sm" id="dgRep">바꾸기</button>' : ""}</div>
        <div class="dg-prog"><div><span>모은 칭호</span><span><b>${C.earned.length}</b> / ${C.total}</span></div><i><em style="width:${C.earned.length / C.total * 100}%"></em></i></div>
      </div>
      <section class="dg-sec"><div class="dg-h"><h2>문화 종류별 칭호</h2><small>입문자 → 마스터</small></div>
        <div class="card dg-base">${C.base.map(b => `<button class="dg-row" data-dgb="${esc(b.g)}">
          ${b.lv ? badgeById(`b:${b.g}:${b.lv - 1}`, 44) : baseOff(b.g, 44)}
          <span class="dg-rb"><span class="dg-rl"><b${b.lv ? "" : ' class="m"'}>${esc(b.g)} ${b.tier || "<em>아직 없음</em>"}</b><small>${b.lv ? `${b.c}${b.g === "무료 공간" ? "곳" : "회"}${b.next ? ` · ${b.nextTier}까지 ${b.next - b.c}${b.g === "무료 공간" ? "곳" : "회"}` : " · 최고 단계"}` : `첫 ${b.g === "무료 공간" ? "방문" : "관람"} 시 입문자`}</small></span>
          <span class="dg-seg">${TIERS.map((_, i) => `<i${i < b.lv ? ` style="background:${genreCol(b.g)}"` : ""}></i>`).join("")}</span></span></button>`).join("")}</div></section>
      <section class="dg-sec"><div class="dg-h"><h2>도전 칭호</h2><small><b>${openN}</b> / ${C.extra.length} 열림</small></div>
        <div class="dg-chips" role="tablist" aria-label="칭호 분류">${THEMES.map(([k, l]) => `<button role="tab" data-dgth="${k}" aria-pressed="${DG.theme === k}">${l}</button>`).join("")}</div>
        <div class="dg-grid">${shown.map(t => {
          if (t.hidden && !t.on) return `<button class="dg-tile" data-dgx="${t.id}">${extraBadge(t, 58, "q")}<b class="m">숨은 칭호</b><small>조건은 열리면 공개</small></button>`;
          return `<button class="dg-tile${t.on ? " on" : ""}" data-dgx="${t.id}">${t.on && isNew(t.id) ? '<span class="dg-new" aria-label="새 칭호"></span>' : ""}${extraBadge(t, 58, t.on ? "on" : "off")}<b>${esc(t.label)}</b>
            ${t.on ? `<small>${C.seen[t.id] ? `${dotDay(C.seen[t.id])} 획득` : "오늘 획득"}</small>` : t.pending ? `<small>집계 준비 중</small>` : `<small>${fmtV(t, t.v)} / ${fmtV(t, t.goal)}${t.won ? " 원" : ""}</small>`}</button>`;
        }).join("")}</div>
      </section>
      <p class="note" style="margin-top:14px">칭호는 리뷰를 남긴 방문으로 계산해요. 대표 칭호는 이 기기에 저장돼요.</p>`;
    markSeen(C);
    pg.querySelectorAll("[data-dgth]").forEach(b => b.onclick = () => { DG.theme = b.dataset.dgth; page(pg); });
    pg.querySelectorAll("[data-dgx]").forEach(b => b.onclick = () => detail(b.dataset.dgx, pg));
    pg.querySelectorAll("[data-dgb]").forEach(b => b.onclick = () => baseDetail(b.dataset.dgb, pg));
    const rb = pg.querySelector("#dgRep"); if (rb) rb.onclick = () => repSheet(pg);
  }

  function detail(id, pg) {
    const C = compute(), t = C.extra.find(x => x.id === id); if (!t) return;
    const locked = t.hidden && !t.on, theme = (THEMES.find(x => x[0] === t.th) || [])[1];
    sheet(`<div class="sh-h"><h2>${locked ? "숨은 칭호" : esc(t.label)}</h2><button class="x" id="dgX" aria-label="닫기">${ico.x}</button></div>
      <div class="dg-dt">${extraBadge(t, 80, locked ? "q" : t.on ? "on" : "off")}
        <div><small>도전 칭호 · ${theme} · ${locked ? "숨은 칭호" : t.hidden ? "숨은 칭호 특별판" : `${"★".repeat(t.lv)} ${LV_NAME[t.lv]}`}</small><p>${t.on ? (C.seen[t.id] ? `${dotDay(C.seen[t.id])}에 열었어요` : "오늘 열었어요") : locked ? "조건을 채우면 이름과 조건이 공개돼요" : "아직 열지 않았어요"}</p></div></div>
      ${locked ? "" : `<div class="dg-cond"><b>조건 · ${esc(t.cond)}</b>${t.pending ? `<small>${esc(t.pending)}</small>` : `<span class="dg-mini w"><em style="width:${Math.min(100, t.v / t.goal * 100)}%"></em></span><small>${fmtV(t, t.v)} / ${fmtV(t, t.goal)}${t.won ? " 원" : ""}</small>`}</div>`}
      ${t.on ? `<button class="blk" id="dgSet" style="width:100%;margin-top:14px">${repId() === t.id ? "지금 대표 칭호예요" : "대표 칭호로 걸기"}</button>` : ""}`);
    $("#dgX").onclick = closeSheet;
    const s = $("#dgSet"); if (s) s.onclick = () => { setRep(t.id); closeSheet(); toast(`대표 칭호를 '${t.label}'(으)로 바꿨어요.`); page(pg); };
  }
  function baseDetail(g, pg) {
    const C = compute(), b = C.base.find(x => x.g === g), unit = g === "무료 공간" ? "곳" : "회";
    sheet(`<div class="sh-h"><h2>${esc(g)} 칭호</h2><button class="x" id="dgX" aria-label="닫기">${ico.x}</button></div>
      <p class="note">${g === "무료 공간" ? "서로 다른 무료 공간을 다닐수록" : `${esc(g)}을(를) 관람할수록`} 단계가 올라가요. 지금 ${b.c}${unit}.</p>
      <div class="dg-steps">${TIERS.map((tn, i) => { const on = i < b.lv, id = `b:${g}:${i}`; return `<div class="dg-step${on ? " on" : ""}">${on ? badgeById(id, 40) : badge({ shape: "circle", state: "off", body: GICON[g] || ICON.spark, p: i === b.lv ? b.c / TIER_AT[g][i] : 0 }, 40)}<span><b>${esc(g)} ${tn}</b><small>${TIER_AT[g][i]}${unit} 이상${on && C.seen[id] ? ` · ${dotDay(C.seen[id])} 획득` : ""}</small></span>${on ? `<button class="out sm" data-dgset="${id}">${repId() === id ? "대표" : "걸기"}</button>` : ""}</div>`; }).join("")}</div>`);
    $("#dgX").onclick = closeSheet;
    document.querySelectorAll("[data-dgset]").forEach(x => x.onclick = () => { setRep(x.dataset.dgset); closeSheet(); toast("대표 칭호를 바꿨어요."); page(pg); });
  }
  function repSheet(pg) {
    const C = compute(), cur = repOf(C);
    sheet(`<div class="sh-h"><h2>대표 칭호 고르기</h2><button class="x" id="dgX" aria-label="닫기">${ico.x}</button></div>
      <p class="note">모은 칭호 ${C.earned.length}개 중 하나를 골라요. 리뷰 닉네임 옆과 오문완 카드에 보여요.</p>
      <div class="dg-pick">${C.earned.slice().reverse().map(e => `<label class="dg-opt"><input type="radio" name="dgrep" value="${esc(e.id)}" ${cur && cur.id === e.id ? "checked" : ""}>${medal(e, 26)}${esc(e.name)}</label>`).join("")}</div>
      <button class="blk" id="dgOk" style="width:100%;margin-top:14px">대표 칭호로 걸기</button>`);
    $("#dgX").onclick = closeSheet;
    $("#dgOk").onclick = () => { const v = document.querySelector('input[name="dgrep"]:checked'); if (v) setRep(v.value); closeSheet(); toast("대표 칭호를 바꿨어요."); page(pg); };
  }

  /* ---------- 다른 화면에서 쓰는 것 ---------- */
  window.titleApi = {
    page,
    repName() { try { const C = compute(), r = repOf(C); return r ? r.name : ""; } catch (_) { return ""; } },
    /* 저장 직후 보상 화면용: 아직 확인하지 않은 새 칭호(없으면 가장 가까운 도전 칭호) */
    slots(max) {
      const C = compute(), fresh = demoAll() ? [] : C.earned.filter(e => !C.seen[e.id]).slice(-max);
      if (fresh.length) return fresh.map(e => ({ on: true, id: e.id, name: e.name, ic: e.t ? e.t.ic : "spark", g: e.g, html: medal(e, 34) }));
      return C.extra.filter(t => !t.on && !t.hidden && !t.pending).sort((a, b) => b.v / b.goal - a.v / a.goal).slice(0, max).map(t => ({ on: false, id: t.id, name: t.label, ic: t.ic, v: fmtV(t, t.v), goal: fmtV(t, t.goal), html: extraBadge(t, 34, "off") }));
    },
    /* 해금 화면용: 아직 해금 화면을 보여 주지 않은 새 칭호. 처음 쓰는 기기·계정은 지금까지 모은 칭호를 '이미 본 것'으로 두고 시작한다 */
    unseenUnlocks() {
      if (demoAll()) return [];
      const C = compute(), st = store();
      if (!st.celebrated) { save({ celebrated: C.earned.map(e => e.id) }); return []; }
      const done = new Set(st.celebrated);
      return C.earned.filter(e => !done.has(e.id)).map(e => {
        const t = e.t, theme = t ? (THEMES.find(x => x[0] === t.th) || [])[1] : "문화 종류별 칭호";
        const desc = t ? t.cond : (() => { const [, g, i] = e.id.split(":"); return `${g} ${TIER_AT[g][Number(i)]}${g === "무료 공간" ? "곳" : "회"} 이상`; })();
        const lv = t ? t.lv : Number(e.id.split(":")[2]) + 1;
        return { id: e.id, name: e.name, ic: t ? t.ic : "spark", g: e.g || null, desc, theme, lv, rank: t ? (t.hidden ? "숨은 칭호 특별판" : `${"★".repeat(lv)} ${LV_NAME[lv]}`) : `${lv}단계` };
      });
    },
    celebrate(ids) {
      if (demoAll()) return;
      const st = store(), seen = { ...st.seen };
      ids.forEach(id => { if (!seen[id]) seen[id] = REC_TODAY; });
      save({ celebrated: [...new Set([...(st.celebrated || []), ...ids])], seen });
    },
    setRep(id) { setRep(id); },
    repId() { return repId(); },
    medal(u, size) { return u && u.id ? badgeById(u.id, size) : medal(u, size); },
    /* 월 결산용: 그 달에 연 칭호 (처음 확인한 날 기준. 이번 달이면 아직 확인 안 한 칭호도 넣는다) */
    monthNew(ym) {
      const C = compute();
      return C.earned.filter(e => C.seen[e.id] ? C.seen[e.id].startsWith(ym) : ym === REC_TODAY.slice(0, 7))
        .map(e => ({ id: e.id, name: e.name, ic: e.t ? e.t.ic : "spark", g: e.g || null }));
    },
    countShare() { save({ shares: (store().shares || 0) + 1 }); },
    icon: svg,
    badge: badgeById,
  };
})();
