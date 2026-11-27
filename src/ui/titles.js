/* ===== 칭호 도감 탭 (2026-11-27) =====
   - 기본 칭호: 문화 종류 6개 × 5단계(입문자~마스터). 무료 공간은 서로 다른 장소 수로 센다
   - 도전 칭호 44개: 기획 문서 '가문의 영광 · 칭호 전체 목록 (검토용)' 기준
   - 판정은 기록(리뷰를 남긴 방문)으로 한다. 인증 없는 리뷰도 센다
   - 같은 곳을 다시 간 것도 리뷰마다 한 번으로 센다(기록 탭은 한 달에 한 번만 보여 준다)
   - 대표 칭호·처음 연 날짜·오문완 공유 횟수는 계정(user_profiles.extra_fields.titles)에 저장하고, 이 기기에도 같이 둔다
   - 다른 사람 리뷰의 대표 칭호는 public_titles()로 받아 온다 (dataService.titleOf)
   - index.html 안쪽 스크립트의 전역(S, allRecordEntries, findAny, sheet 등)을 그대로 쓴다 */
(function () {
  const REP_KEY = "gamun-rep-title-v1", SEEN_KEY = "gamun-title-seen-v1", SHARE_KEY = "gamun-omw-shares-v1";
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
    gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0"/>',
  };
  const svg = (k, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICON[k] || ICON.spark}</svg>`;

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
    { id: "free5", th: "save", name: "공짜의 품격", ic: "coin", lv: 1, cond: "0원으로 관람 5회", p: st => [n(st.rows, r => r.paid === 0), 5] },
    { id: "save1", th: "save", name: "짠테크 새싹", ic: "stack", lv: 1, cond: "아낀 금액 누적 3만 원", p: st => [st.saved, 30000], won: true },
    { id: "save2", th: "save", name: "짠테크 고수", ic: "stack", lv: 2, cond: "아낀 금액 누적 10만 원", p: st => [st.saved, 100000], won: true },
    { id: "save3", th: "save", name: "짠테크 마스터", ic: "stack", lv: 3, cond: "아낀 금액 누적 30만 원", p: st => [st.saved, 300000], won: true },
    { id: "eye", th: "save", name: "가성비 감별사", ic: "eye", lv: 2, cond: "5천 원 이하 + 내 별점 4.5 이상 관람 3회", p: st => [n(st.rows, r => r.paid <= 5000 && r.rating >= 4.5), 3] },
    { id: "openrun", th: "save", name: "오픈런 전문가", ic: "door", lv: 2, cond: "행사 시작 후 7일 안에 관람 3회", p: st => [n(st.rows, r => r.it.start && !isAlwaysOpen(r.it) && r.date >= r.it.start && dayNum(r.date) - dayNum(r.it.start) <= 7), 3] },
    { id: "benefit", th: "save", name: "혜택 활용왕", ic: "tag", lv: 2, cond: "할인 혜택을 받아 관람 3회 (리뷰의 '받은 혜택')", p: st => [n(st.rows, r => r.ben), 3] },
    { id: "manwon", th: "save", name: "만 원의 행복", ic: "wallet", lv: 2, cond: "한 달 동안 1만 원 이하로 4회 이상 관람", p: st => [Math.max(0, ...Object.values(st.byMonth).map(rs => rs.reduce((a, r) => a + r.paid, 0) <= 10000 ? rs.length : 0)), 4] },
    { id: "nospend", th: "save", name: "무지출 주말러", ic: "sun", lv: 1, cond: "토·일 이틀 모두 0원 관람한 주말 1번", p: st => { const ok = Object.keys(st.byDay).some(d => dowOf(d) === 6 && st.byDay[d].some(r => r.paid === 0) && (st.byDay[new Date((dayNum(d) + 1) * 864e5).toISOString().slice(0, 10)] || []).some(r => r.paid === 0)); return [ok ? 1 : 0, 1]; } },
    // 장르 확장·조합
    { id: "g3", th: "genre", name: "장르 산책자", ic: "grid", lv: 1, cond: "서로 다른 문화 종류 3개 관람", p: st => [GENRES.filter(g => st.byG[g].length).length, 3] },
    { id: "g5", th: "genre", name: "장르 파괴자", ic: "grid", lv: 2, cond: "문화 종류 5개 관람", p: st => [GENRES.filter(g => st.byG[g].length).length, 5] },
    { id: "g6", th: "genre", name: "문화 잡식가", ic: "grid", lv: 2, cond: "문화 종류 6개 모두 관람", p: st => [GENRES.filter(g => st.byG[g].length).length, 6] },
    { id: "allround", th: "genre", name: "올라운더", ic: "crown", lv: 3, cond: "6개 종류 모두 '애호가' 이상", p: st => [GENRES.filter(g => st.genreCount(g) >= TIER_AT[g][2]).length, 6] },
    { id: "weekly", th: "genre", name: "편식 없는 문화인", ic: "spark", lv: 2, cond: "4주 연속, 주마다 다른 문화 종류 관람", p: st => [weeklyVariety(st), 4] },
    { id: "c_film", th: "genre", name: "미술관 옆 영화관", ic: "film", lv: 2, hidden: true, cond: "같은 주에 전시 + 영화 관람", p: st => [Object.values(st.byWeek).some(rs => rs.some(r => r.genre === "전시") && rs.some(r => /영화/.test(r.raw))) ? 1 : 0, 1] },
    { id: "c_book", th: "genre", name: "책과 그림", ic: "book", lv: 1, hidden: true, cond: "같은 날 무료 공간 + 전시 관람", p: st => [Object.values(st.byDay).some(rs => rs.some(r => r.genre === "무료 공간") && rs.some(r => r.genre === "전시")) ? 1 : 0, 1] },
    { id: "c_pop", th: "genre", name: "팝업 투어러", ic: "bag", lv: 2, hidden: true, cond: "하루에 팝업 3곳 관람", p: st => [Math.max(0, ...Object.values(st.byDay).map(rs => new Set(rs.filter(r => r.genre === "팝업").map(r => r.id)).size)), 3] },
    { id: "c_fest", th: "genre", name: "축제의 밤", ic: "moon", lv: 1, hidden: true, cond: "18시 이후 축제 관람", p: st => [n(st.rows, r => r.genre === "축제" && r.hr != null && r.hr >= 18) ? 1 : 0, 1] },
    // 꾸준함·N회차
    { id: "c10", th: "steady", name: "프로 관람러", ic: "flag", lv: 1, cond: "누적 관람 10회", p: st => [st.rows.length, 10] },
    { id: "c30", th: "steady", name: "문화생활 고인물", ic: "flag", lv: 2, cond: "누적 관람 30회", p: st => [st.rows.length, 30] },
    { id: "c100", th: "steady", name: "가문의 영광", ic: "crown", lv: 3, cond: "누적 관람 100회", p: st => [st.rows.length, 100] },
    { id: "weekend", th: "steady", name: "주말의 예술가", ic: "week", lv: 2, cond: "4주 연속 주말마다 관람", p: st => [longestRun(st.rows.map(r => weekendKey(r.date)).filter(k => k != null), 7), 4] },
    { id: "monthly", th: "steady", name: "월간 개근", ic: "week", lv: 2, cond: "3개월 연속, 매달 4회 이상 관람", p: st => [longestRun(Object.entries(st.byMonth).filter(([, rs]) => rs.length >= 4).map(([ym]) => ymIdx(ym)), 1), 3] },
    { id: "again", th: "steady", name: "N차 관람 장인", ic: "repeat", lv: 2, cond: "같은 행사를 2회 이상 관람", p: st => [Math.max(0, ...Object.entries(st.visitsBy).filter(([id]) => { const it = findAny(id); return it && !isAlwaysOpen(it); }).map(([, v]) => v)), 2] },
    { id: "regular", th: "steady", name: "단골 손님", ic: "home", lv: 2, cond: "같은 상설 장소를 5회 방문", p: st => [Math.max(0, ...Object.entries(st.visitsBy).filter(([id]) => { const it = findAny(id); return it && isAlwaysOpen(it); }).map(([, v]) => v)), 5] },
    { id: "season", th: "steady", name: "봄여름가을겨울", ic: "leaf", lv: 3, cond: "봄·여름·가을·겨울 각각 1회 이상 관람", p: st => [new Set(st.rows.map(r => season(r.date))).size, 4] },
    // 공간·기록·공유
    { id: "gulocal", th: "space", name: "터줏대감", ic: "home", lv: 2, cond: "한 구에서 서로 다른 곳 5곳 관람", p: st => [st.topGu ? st.topGu[1].size : 0, 5], label: st => st.topGu && st.topGu[1].size >= 5 ? `${st.topGu[0]} 터줏대감` : "○○구 터줏대감" },
    { id: "gu5", th: "space", name: "문화 유목민", ic: "pin", lv: 1, cond: "서로 다른 구 5곳에서 관람", p: st => [Object.keys(st.gus).length, 5] },
    { id: "gu10", th: "space", name: "서울 원정대", ic: "route", lv: 2, cond: "서로 다른 구 10곳에서 관람", p: st => [Object.keys(st.gus).length, 10] },
    { id: "gu25", th: "space", name: "서울 정복자", ic: "crown", lv: 3, cond: "서울 25구 모두에서 관람", p: st => [Object.keys(st.gus).length, 25] },
    { id: "night", th: "space", name: "야행성 예술가", ic: "moon", lv: 2, cond: "하루 끝에(18시 이후) 관람 5회", p: st => [n(st.rows, r => r.hr != null && r.hr >= 18), 5] },
    { id: "morning", th: "space", name: "아침형 관람객", ic: "sun", lv: 2, cond: "11시 이전 관람 3회", p: st => [n(st.rows, r => r.hr != null && r.hr < 11), 3] },
    { id: "solo", th: "space", name: "혼자서도 잘해요", ic: "person", lv: 1, cond: "'혼자' 관람 5회", p: st => [n(st.rows, r => r.with.includes("solo")), 5] },
    { id: "romance", th: "space", name: "로맨티스트", ic: "heart", lv: 1, cond: "'연인·배우자'와 관람 5회", p: st => [n(st.rows, r => r.with.includes("partner")), 5] },
    { id: "mate", th: "space", name: "문화 메이트", ic: "duo", lv: 1, cond: "'친구'와 관람 5회", p: st => [n(st.rows, r => r.with.includes("friend")), 5] },
    { id: "archive", th: "space", name: "감성 아카이빙러", ic: "pen", lv: 2, cond: "비공개 리뷰(나만의 기록) 5회", p: st => [n(st.rows, r => r.priv), 5] },
    { id: "share", th: "space", name: "문화 영업사원", ic: "share", lv: 2, cond: "오문완 카드 공유 5회", p: st => [st.shares, 5] },
    { id: "first", th: "space", name: "첫 리뷰어", ic: "spark", lv: 2, cond: "리뷰가 없던 장소에 첫 리뷰 3회", p: st => [st.firstRev, 3] },
    { id: "pioneer", th: "space", name: "지도 개척자", ic: "flag", lv: 1, cond: "장소 등록 신청이 승인 1회", p: st => [st.subsOk, 1] },
    // 가문의 영광 고유 기능
    { id: "last", th: "own", name: "막차 탑승객", ic: "clock", lv: 2, cond: "종료 3일 전 안에 관람 3회", p: st => [n(st.rows, r => r.it.end && !isAlwaysOpen(r.it) && r.date <= r.it.end && dayNum(r.it.end) - dayNum(r.date) <= 3), 3] },
    { id: "lastday", th: "own", name: "막차의 신", ic: "bolt", lv: 1, hidden: true, cond: "행사 마지막 날 관람", p: st => [n(st.rows, r => r.it.end && !isAlwaysOpen(r.it) && r.date === r.it.end) ? 1 : 0, 1] },
    { id: "wed", th: "own", name: "수요일의 문화인", ic: "week", lv: 2, cond: "문화가 있는 날(수요일) 관람 4회", p: st => [n(st.rows, r => r.dow === 3 || r.ben === "culture_day"), 4] },
    { id: "wedall", th: "own", name: "수요일 개근", ic: "week", lv: 3, hidden: true, cond: "한 달의 모든 수요일에 관람", p: st => [monthOfAllWeds(st) ? 1 : 0, 1] },
    { id: "gumin", th: "own", name: "구민의 특권", ic: "gift", lv: 2, cond: "구민 할인으로 관람 2회 (리뷰의 '받은 혜택')", p: st => [n(st.rows, r => r.ben === "gu"), 2] },
  ];

  /* ---------- 계산 ---------- */
  function compute() {
    const st = collect();
    const base = GENRES.map(g => {
      const c = st.genreCount(g), at = TIER_AT[g], lv = at.filter(x => c >= x).length;
      return { g, c, lv, tier: lv ? TIERS[lv - 1] : null, next: lv < 5 ? at[lv] : null, nextTier: lv < 5 ? TIERS[lv] : null };
    });
    const extra = EXTRA.map(t => { const [v, goal] = t.p(st); return { ...t, v, goal, on: !t.pending && v >= goal, label: t.label ? t.label(st) : t.name }; });
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
    return { rep: acc.rep || loc.rep || "", seen: { ...(loc.seen || {}), ...(acc.seen || {}) }, shares: Math.max(acc.shares || 0, loc.shares || 0), rep_name: acc.rep_name || "" };
  }
  function save(patch) {
    try { if (patch.rep !== undefined) localStorage.setItem(REP_KEY, patch.rep || ""); if (patch.seen) localStorage.setItem(SEEN_KEY, JSON.stringify(patch.seen)); if (patch.shares != null) localStorage.setItem(SHARE_KEY, String(patch.shares)); } catch (_) {}
    const ds = window.dataService; if (ds && ds.setMyTitles) ds.setMyTitles(patch);
  }
  const markSeen = C => { const s = { ...C.seen }; let ch = false; C.earned.forEach(e => { if (!s[e.id]) { s[e.id] = REC_TODAY; ch = true; } }); const r = repOf(C), name = r ? r.name : ""; if (ch || name !== store().rep_name) save({ seen: s, rep_name: name }); };
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
    if (e && e.g) return `<span class="dg-med" style="width:${size}px;height:${size}px;background:${SOFT[e.g]};--mc:${DARK[e.g]};box-shadow:inset 0 0 0 2px ${genreCol(e.g)}66">${svg("spark", Math.round(size * .46))}</span>`;
    const t = e && e.t ? e.t : e;
    return `<span class="dg-med" style="width:${size}px;height:${size}px">${svg(t ? t.ic : "spark", Math.round(size * .46))}</span>`;
  }
  function page(pg) {
    if (!DG.subsAsked && window.dataService && !window.dataService.account().isGuest && window.dataService.listSubmissions) {
      DG.subsAsked = true; window.dataService.listSubmissions(false).then(r => { if (r && r.ok && S.tab === "dogam") renderPage(); });
    }
    const C = compute(), rep = repOf(C), shown = C.extra.filter(t => DG.theme === "all" || t.th === DG.theme);
    const openN = C.extra.filter(t => t.on).length;
    const isNew = id => !C.seen[id];
    pg.innerHTML = `<h1>칭호 도감</h1>
      <div class="card dg-rep">
        <div class="dg-rep-top">${rep ? medal(rep, 60) : `<span class="dg-med off" style="width:60px;height:60px">${svg("lock", 26)}</span>`}
          <div class="dg-rep-t"><small>대표 칭호</small><b>${rep ? esc(rep.name) : "아직 없어요"}</b><small>${rep ? "리뷰 닉네임 옆과 오문완 카드에 보여요" : "다녀온 곳에 리뷰를 남기면 첫 칭호가 열려요"}</small></div>
          ${C.earned.length ? '<button class="out sm" id="dgRep">바꾸기</button>' : ""}</div>
        <div class="dg-prog"><div><span>모은 칭호</span><span><b>${C.earned.length}</b> / ${C.total}</span></div><i><em style="width:${C.earned.length / C.total * 100}%"></em></i></div>
      </div>
      <section class="dg-sec"><div class="dg-h"><h2>문화 종류별 칭호</h2><small>입문자 → 마스터</small></div>
        <div class="card dg-base">${C.base.map(b => `<button class="dg-row" data-dgb="${esc(b.g)}">
          <span class="dg-gt" style="background:${SOFT[b.g]};color:${DARK[b.g]}">${esc(b.g)}</span>
          <span class="dg-rb"><span class="dg-rl"><b${b.lv ? "" : ' class="m"'}>${b.tier || "아직 없음"}</b><small>${b.lv ? `${b.c}${b.g === "무료 공간" ? "곳" : "회"}${b.next ? ` · ${b.nextTier}까지 ${b.next - b.c}${b.g === "무료 공간" ? "곳" : "회"}` : " · 최고 단계"}` : `첫 ${b.g === "무료 공간" ? "방문" : "관람"} 시 입문자`}</small></span>
          <span class="dg-seg">${TIERS.map((_, i) => `<i${i < b.lv ? ` style="background:${genreCol(b.g)}"` : ""}></i>`).join("")}</span></span></button>`).join("")}</div></section>
      <section class="dg-sec"><div class="dg-h"><h2>도전 칭호</h2><small><b>${openN}</b> / ${C.extra.length} 열림</small></div>
        <div class="dg-chips" role="tablist" aria-label="칭호 분류">${THEMES.map(([k, l]) => `<button role="tab" data-dgth="${k}" aria-pressed="${DG.theme === k}">${l}</button>`).join("")}</div>
        <div class="dg-grid">${shown.map(t => {
          if (t.hidden && !t.on) return `<button class="dg-tile" data-dgx="${t.id}"><span class="dg-med q" style="width:52px;height:52px">?</span><b class="m">숨은 칭호</b><small>조건은 열리면 공개</small></button>`;
          return `<button class="dg-tile${t.on ? " on" : ""}" data-dgx="${t.id}">${t.on && isNew(t.id) ? '<span class="dg-new" aria-label="새 칭호"></span>' : ""}<span class="dg-med${t.on ? "" : " off"}" style="width:52px;height:52px">${svg(t.ic, 24)}</span><b>${esc(t.label)}</b>
            ${t.on ? `<small>${C.seen[t.id] ? `${dotDay(C.seen[t.id])} 획득` : "오늘 획득"}</small>` : t.pending ? `<small>집계 준비 중</small>` : `<span class="dg-mini"><em style="width:${Math.min(100, t.v / t.goal * 100)}%"></em></span><small>${fmtV(t, t.v)} / ${fmtV(t, t.goal)}${t.won ? " 원" : ""}</small>`}</button>`;
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
      <div class="dg-dt">${locked ? '<span class="dg-med q" style="width:72px;height:72px">?</span>' : `<span class="dg-med${t.on ? "" : " off"}" style="width:72px;height:72px">${svg(t.ic, 34)}</span>`}
        <div><small>도전 칭호 · ${theme} · ${"★".repeat(t.lv)}</small><p>${t.on ? (C.seen[t.id] ? `${dotDay(C.seen[t.id])}에 열었어요` : "오늘 열었어요") : locked ? "조건을 채우면 이름과 조건이 공개돼요" : "아직 열지 않았어요"}</p></div></div>
      ${locked ? "" : `<div class="dg-cond"><b>조건 · ${esc(t.cond)}</b>${t.pending ? `<small>${esc(t.pending)}</small>` : `<span class="dg-mini w"><em style="width:${Math.min(100, t.v / t.goal * 100)}%"></em></span><small>${fmtV(t, t.v)} / ${fmtV(t, t.goal)}${t.won ? " 원" : ""}</small>`}</div>`}
      ${t.on ? `<button class="blk" id="dgSet" style="width:100%;margin-top:14px">${repId() === t.id ? "지금 대표 칭호예요" : "대표 칭호로 걸기"}</button>` : ""}`);
    $("#dgX").onclick = closeSheet;
    const s = $("#dgSet"); if (s) s.onclick = () => { setRep(t.id); closeSheet(); toast(`대표 칭호를 '${t.label}'(으)로 바꿨어요.`); page(pg); };
  }
  function baseDetail(g, pg) {
    const C = compute(), b = C.base.find(x => x.g === g), unit = g === "무료 공간" ? "곳" : "회";
    sheet(`<div class="sh-h"><h2>${esc(g)} 칭호</h2><button class="x" id="dgX" aria-label="닫기">${ico.x}</button></div>
      <p class="note">${g === "무료 공간" ? "서로 다른 무료 공간을 다닐수록" : `${esc(g)}을(를) 관람할수록`} 단계가 올라가요. 지금 ${b.c}${unit}.</p>
      <div class="dg-steps">${TIERS.map((tn, i) => { const on = i < b.lv, id = `b:${g}:${i}`; return `<div class="dg-step${on ? " on" : ""}"><span class="dg-sn" style="${on ? `background:${genreCol(g)};color:#fff` : ""}">${i + 1}</span><span><b>${esc(g)} ${tn}</b><small>${TIER_AT[g][i]}${unit} 이상${on && C.seen[id] ? ` · ${dotDay(C.seen[id])} 획득` : ""}</small></span>${on ? `<button class="out sm" data-dgset="${id}">${repId() === id ? "대표" : "걸기"}</button>` : ""}</div>`; }).join("")}</div>`);
    $("#dgX").onclick = closeSheet;
    document.querySelectorAll("[data-dgset]").forEach(x => x.onclick = () => { setRep(x.dataset.dgset); closeSheet(); toast("대표 칭호를 바꿨어요."); page(pg); });
  }
  function repSheet(pg) {
    const C = compute(), cur = repOf(C);
    sheet(`<div class="sh-h"><h2>대표 칭호 고르기</h2><button class="x" id="dgX" aria-label="닫기">${ico.x}</button></div>
      <p class="note">모은 칭호 ${C.earned.length}개 중 하나를 골라요. 리뷰 닉네임 옆과 오문완 카드에 보여요.</p>
      <div class="dg-pick">${C.earned.slice().reverse().map(e => `<label class="dg-opt"><input type="radio" name="dgrep" value="${esc(e.id)}" ${cur && cur.id === e.id ? "checked" : ""}><span class="dg-dot" style="background:${e.g ? genreCol(e.g) : "var(--accent)"}"></span>${esc(e.name)}</label>`).join("")}</div>
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
      const C = compute(), fresh = C.earned.filter(e => !C.seen[e.id]).slice(-max);
      if (fresh.length) return fresh.map(e => ({ on: true, name: e.name, ic: e.t ? e.t.ic : "spark", g: e.g }));
      return C.extra.filter(t => !t.on && !t.hidden && !t.pending).sort((a, b) => b.v / b.goal - a.v / a.goal).slice(0, max).map(t => ({ on: false, name: t.label, ic: t.ic, v: fmtV(t, t.v), goal: fmtV(t, t.goal) }));
    },
    countShare() { save({ shares: (store().shares || 0) + 1 }); },
    icon: svg,
  };
})();
