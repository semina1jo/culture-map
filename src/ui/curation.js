/* ===== 큐레이션 탭 (2026-11-20) =====
   - 오늘의 큐레이션(시간대에 따라 순서가 바뀌는 캐러셀) · 주제 칩 16개 · 막차 · 우리 동네(구 타일 지도) · 취향 섹션(2주마다 교체) · 무료 전시 · 문화가 있는 날
   - 공공데이터로 계산되는 주제는 실제 데이터로, 이용자 리뷰가 필요한 주제는 리뷰가 충분히 쌓이기 전까지 '예시 데이터'로 채운다
     (예시 데이터는 설정의 '시연 모드' 또는 '더미(예시) 데이터 보기'가 켜져 있을 때만 보인다)
   - index.html 안쪽 스크립트의 전역(events, S, revStats, sheet 등)을 그대로 쓴다 */
(function () {
  const CUR = { gu: null, ex: new Map(), photoOk: new Map() };
  const demoOn = () => Boolean(S.showDemo || S.demoMode);
  const today = () => REC_TODAY;
  const g4 = e => e.genre4 || e.genre;
  const priceOf = e => cultureFilterPrice(e);
  const isFree = e => priceOf(e) === 0;
  const isEvent = e => !isAlwaysOpen(e);
  const hasPhoto = e => Boolean(e.photo && /^https?:/.test(e.photo));
  const guOf = e => e.gu || e.GUNAME || "";
  const nameKey = e => String(e.name || e.title || "").replace(/\s+/g, "");
  const DOW = "일월화수목금토";

  /* ---------- 예시 팝업 (팝업은 공공데이터에 없어 장소 등록으로만 들어오므로 시연용 예시를 둔다) ---------- */
  const EX_POPUPS = [
    { id: "cur_ex_pop1", name: "(예시) 성수 굿즈 팝업스토어", place: "성수동2가 연무장길", gu: "성동구", lat: 37.5446, lng: 127.0560, s: -4, e: 9, hours: "매일 11:00–20:00" },
    { id: "cur_ex_pop2", name: "(예시) 연남 독립출판 팝업", place: "연남동 경의선숲길 인근", gu: "마포구", lat: 37.5622, lng: 126.9255, s: -2, e: 5, hours: "수–일 12:00–19:00" },
    { id: "cur_ex_pop3", name: "(예시) 홍대 일러스트 마켓 팝업", place: "서교동 홍대 걷고싶은거리", gu: "마포구", lat: 37.5547, lng: 126.9220, s: -6, e: 3, hours: "매일 12:00–21:00" },
    { id: "cur_ex_pop4", name: "(예시) 한남 향수 체험 팝업", place: "한남동 이태원로", gu: "용산구", lat: 37.5345, lng: 127.0016, s: -1, e: 12, hours: "매일 11:00–20:00" },
    { id: "cur_ex_pop5", name: "(예시) 여의도 캐릭터 팝업", place: "여의도동 국제금융로", gu: "영등포구", lat: 37.5259, lng: 126.9284, s: -3, e: 7, hours: "매일 10:30–20:00" },
    { id: "cur_ex_pop6", name: "(예시) 을지로 레트로 문구 팝업", place: "을지로3가 인쇄골목", gu: "중구", lat: 37.5663, lng: 126.9910, s: -5, e: 6, hours: "화–일 12:00–20:00" }
  ].map(p => ({
    id: p.id, name: p.name, title: p.name, TITLE: p.name, genre: "팝업", genre4: "팝업", price: 0, price_min: 0, price_label: "무료", fee_text: "무료 입장", USE_FEE: "무료 입장",
    start: addFilterDays(REC_TODAY, p.s), end: addFilterDays(REC_TODAY, p.e), hours: p.hours, place: p.place, PLACE: p.place, gu: p.gu, GUNAME: p.gu,
    lat: p.lat, lng: p.lng, x: 500 + (p.lng - 126.9245) / 0.000018, y: 660 - (p.lat - 37.5572) / 0.000012,
    reserve: false, entry: "자유 입장 (예시)", src: "예시 데이터", source: "예시 데이터", is_sample: true, is_demo: true, photo: "", comments: [], votes: { went: 0, ended: 0, wrong: 0 }, ben: []
  }));
  EX_POPUPS.forEach(p => {
    if (!retainedCultureSamples.some(x => x.id === p.id)) retainedCultureSamples.push(p);
    if (!events.some(x => x.id === p.id)) events.push(p);
  });

  /* ---------- 데이터 묶음 ---------- */
  // 한 번 그릴 때 여러 주제가 같은 묶음을 쓰므로 그리는 동안만 기억해 둔다
  function basePool() {
    if (CUR.pool) return CUR.pool;
    return events.filter(e => {
      if (e.hidden || e.x == null || hideDemo(e)) return false;
      if (!isAlwaysOpen(e) && (!e.end || e.end < today())) return false;
      const p = priceOf(e); return p != null && p <= 10000;
    });
  }
  // 이용자 리뷰가 필요한 주제의 예시 수치: 장소 id로 정해지는 값이라 새로고침해도 같다
  function ex(e) {
    if (CUR.ex.has(e.id)) return CUR.ex.get(e.id);
    const g = g4(e), r = k => (hashNum(e.id + k) % 1000) / 1000, n = 6 + hashNum(e.id + "n") % 40;
    const pri = {
      partner: ["공연", "축제"].includes(g) ? .45 : g === "전시" ? .35 : .2,
      friend: ["체험", "축제", "팝업"].includes(g) ? .5 : .22,
      solo: ["전시", "무료 공간"].includes(g) ? .45 : .12,
      photo: ["전시", "축제", "팝업"].includes(g) ? .45 : .12,
      vibe: ["공연", "전시"].includes(g) ? .38 : .12,
      quiet: g === "무료 공간" || (g === "전시" && isAlwaysOpen(e)) ? .5 : .1
    };
    const o = { n, recent: 3 + hashNum(e.id + "rc") % 38 };
    for (const k in pri) o[k] = Math.round(n * Math.min(.95, pri[k] * (.45 + r(k))));
    CUR.ex.set(e.id, o); return o;
  }
  // 리뷰 기반 주제: 실제 리뷰가 기준(3명 이상·40% 이상)을 넘는 곳이 5곳 이상이면 실제 데이터, 아니면 시연용 예시 데이터
  function byReviews(pool, realCount, exCount, unit) {
    const real = pool.map(e => ({ e, R: revStats(e.id) })).filter(x => x.R.reviewers >= SIT_MIN_VOTERS)
      .map(x => ({ e: x.e, c: realCount(x.R), n: x.R.reviewers })).filter(x => x.c > 0 && x.c / x.n >= SIT_YES_RATIO).sort((a, b) => b.c - a.c);
    if (real.length >= 5) { const m = new Map(real.map(x => [x.e.id, x.c])); return { items: real.map(x => x.e), demo: false, meta: e => `${unit} ${m.get(e.id)}건` }; }
    if (!demoOn()) return { items: [], demo: true, meta: () => "" };
    const list = pool.filter(hasPhoto).map(e => ({ e, c: exCount(ex(e)) })).sort((a, b) => b.c - a.c);
    const m = new Map(list.map(x => [x.e.id, x.c]));
    return { items: list.map(x => x.e), demo: true, meta: e => `${unit} ${m.get(e.id)}건` };
  }
  const evFirst = (a, b) => (isEvent(b) - isEvent(a)) || (hasPhoto(b) - hasPhoto(a));
  const byEnd = (a, b) => String(a.end || "9999").localeCompare(String(b.end || "9999"));
  function nextWed() { let d = today(); for (let i = 0; i < 7; i++) { if (isWedStr(d)) return d; d = addFilterDays(d, 1); } return d; }
  const dday = e => { const d = days(today(), e.end); return d <= 0 ? "D-DAY" : `D-${d}`; };
  const shortGu = g => g === "중구" ? "중구" : g.replace(/구$/, "");

  /* ---------- 주제 16개 ---------- */
  const TOPICS = {
    evening: { chip: "하루 끝에", title: "하루 끝에 가볍게 즐기는 문화생활", desc: "오늘 저녁 8시 이후까지 여는 곳 · 운영시간이 확인된 곳만",
      run() { const t = today(); const items = basePool().filter(e => activeOn(e, t) && window.hoursService.evening(hoursOn(e, t))).sort(evFirst);
        return { items, meta: e => window.hoursService.eveningText(hoursOn(e, t)) || period(e) }; } },
    quick: { chip: "약속 전 1시간", title: "약속 전 1시간, 짧고 굵게 즐기기", desc: "1km 안 · 예약 없이 · 오늘 아직 여는 곳 (거리는 내 위치, 없으면 지도 가운데 기준)",
      run() { const t = today(); const items = basePool().filter(e => activeOn(e, t) && !e.reserve && sitDistance(e) <= 1000 && hoursBadge(e)?.c !== "red").sort((a, b) => sitDistance(a) - sitDistance(b));
        return { items, meta: e => `${fmtDist(Math.round(sitDistance(e) / 10) * 10)} · ${g4(e)}` }; } },
    rain: { chip: "비 오는 날", title: "비 오는 날, 0원으로 즐기는 실내 문화 피난처", desc: "실내 공간 + 무료 · 이번 주에 여는 곳",
      run() { const t = today(), w = addFilterDays(t, 6); const items = basePool().filter(e => isFree(e) && isIndoor(e) && activeDuring(e, t, w)).sort(evFirst);
        return { items, meta: e => `${g4(e)} · ${shortGu(guOf(e)) || "서울"}` }; } },
    lastcall: { chip: "마감 임박", title: "이번 주가 마지막! 놓치면 아쉬운 문화생활", desc: "7일 안에 끝나는 전시·공연·팝업·체험·축제 · 끝나는 날이 빠른 순",
      run() { const t = today(); const soonEnd = e => isEvent(e) && e.end && days(t, e.end) >= 0 && days(t, e.end) <= 6;
        const items = basePool().filter(soonEnd);
        return { items: items.sort((a, b) => byEnd(a, b) || (hasPhoto(b) - hasPhoto(a))), meta: e => e.place || "", badge: dday }; } },
    weekend: { chip: "무지출 주말", title: "월급날 전날에도 당당한 '무지출' 주말 코스", desc: "이번 주말 무료로 여는 곳",
      run() { const [sat, sun] = nextWeekend(); const items = basePool().filter(e => isFree(e) && activeDuring(e, sat, sun)).sort(evFirst);
        return { items, meta: e => isEvent(e) ? period(e) : `상시 · ${shortGu(guOf(e)) || "서울"}`, range: `${md(sat)}–${md(sun)}` }; } },
    wday: { chip: "문화가 있는 날", title: "수요일 문화가 있는 날", desc: "매주 수요일 무료·할인되는 곳 (고궁·종묘·왕릉 등)",
      run() { const w = nextWed(); const items = events.filter(e => !e.hidden && !hideDemo(e) && e.x != null && WDAY_RULES.some(r => w >= r.from && r.re.test(nameKey(e))));
        return { items, meta: () => "수요일 무료", date: w }; } },
    date: { chip: "데이트", title: "데이트 코스 리뷰 1위! 돈 안 쓰고 분위기 내는 곳", desc: "연인·배우자와 다녀온 리뷰가 많은 순", review: true,
      run() { return byReviews(basePool().filter(e => ["공연", "전시", "축제"].includes(g4(e))), R => R.w.partner || 0, x => x.partner, "연인 방문 리뷰"); } },
    friend: { chip: "친구와", title: "친구와 함께 가면 더 재밌는 곳", desc: "친구와 다녀온 리뷰가 많은 순", review: true,
      run() { return byReviews(basePool().filter(e => ["체험", "축제", "공연", "팝업"].includes(g4(e))), R => R.w.friend || 0, x => x.friend, "친구 방문 리뷰"); } },
    solo: { chip: "혼자", title: "혼자 가서 조용히 사색하기 좋은 숨은 아지트", desc: "혼자 다녀온 리뷰 + '조용해요'가 많은 순", review: true,
      run() { return byReviews(basePool().filter(e => (g4(e) === "전시" && isIndoor(e)) || g4(e) === "무료 공간"), R => Math.min(R.w.solo || 0, Math.max(R.n.quiet || 0, R.n.rest || 0)), x => Math.min(x.solo, x.quiet + 2), "혼자 방문 리뷰"); } },
    photo: { chip: "포토존", title: "사진첩 용량 주의! 찍기만 하면 인생샷 나오는 곳", desc: "'사진이 잘 나와요' 리뷰가 많은 순", review: true,
      run() { return byReviews(basePool().filter(e => ["전시", "축제", "팝업"].includes(g4(e))), R => R.n.photo || 0, x => x.photo, "포토존 리뷰"); } },
    vibe: { chip: "분위기 맛집", title: "조명과 음악까지 완벽한 분위기 맛집", desc: "'분위기가 감성적이에요(음악·조명)'·'연출이 탄탄해요' 리뷰가 많은 순", review: true,
      run() { return byReviews(basePool().filter(e => ["전시", "공연"].includes(g4(e))), R => (R.n.vibe || 0) + (R.n.staging || 0), x => x.vibe, "감성 리뷰"); } },
    exp: { chip: "이색 체험", title: "직접 만들고 경험하는 이색 체험", desc: "체험·클래스 · 끝나는 날이 빠른 순",
      run() { const items = basePool().filter(e => g4(e) === "체험").sort((a, b) => (hasPhoto(b) - hasPhoto(a)) || byEnd(a, b));
        return { items, meta: e => `${period(e)} · ${priceText(e)}` }; } },
    local: { chip: "우리 동네", title: "우리 동네 이번 주 문화생활", desc: "고른 동네에서 이번 주에 여는 곳",
      run() { return localTopic(CUR.gu || defaultGu()); } },
    freeexh: { chip: "무료 전시", title: "서울에서 꼭 가봐야 할 무료 전시", desc: "무료 상설 전시 시설 · 국립·시립·구립 시설 우선",
      run() { const score = e => (/국립|시립/.test(e.name) ? 3 : /구립|궁|박물관/.test(e.name) ? 2 : 0) + (hasPhoto(e) ? 1 : 0);
        const items = basePool().filter(e => isAlwaysOpen(e) && g4(e) === "전시" && isFree(e)).sort((a, b) => score(b) - score(a));
        return { items, meta: e => shortGu(guOf(e)) ? `${guOf(e)} · 상시 무료` : "상시 무료" }; } },
    festival: { chip: "주말 축제", title: "이번 주말 서울에서 열리는 축제", desc: "이번 주말에 열리는 축제",
      run() { const [sat, sun] = nextWeekend(); const items = basePool().filter(e => g4(e) === "축제" && activeDuring(e, sat, sun)).sort(evFirst);
        return { items, meta: e => `${period(e)} · ${priceText(e)}` }; } },
    popup: { chip: "핫한 팝업", title: "요즘 가장 핫한 팝업스토어", desc: "최근 7일 리뷰가 많이 늘어난 순", review: true,
      run() {
        const pool = events.filter(e => !e.hidden && e.x != null && g4(e) === "팝업" && activeOn(e, today()) && (!isDemoCulture(e) || demoOn()));
        const anyDemo = pool.some(isDemoCulture);
        if (!pool.length) return { items: [], demo: true, meta: () => "" };
        const list = pool.map(e => ({ e, c: ex(e).recent })).sort((a, b) => b.c - a.c);
        return { items: list.map(x => x.e), demo: true, meta: e => `최근 7일 리뷰 ${ex(e).recent}건`, anyDemo };
      } }
  };
  // 주제별로 골라보기(한 화면에 다 보이게 3×2) · 아래 주제 섹션 4개 (2026-11-20 사용자 요청으로 고정)
  const CHIP_ORDER = ["quick", "evening", "rain", "solo", "date", "friend"];
  const CHIP_ICON = {
    quick: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8.5"/>',
    evening: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
    rain: '<path d="M3 12a9 9 0 0 1 18 0Z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/>',
    solo: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20.5c.8-3.6 3.6-5.8 7-5.8s6.2 2.2 7 5.8"/>',
    date: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>',
    friend: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20c.6-3.2 3-5.2 6-5.2s5.4 2 6 5.2"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.9c1.9.6 3.1 2.4 3.5 5.1"/>'
  };
  const BOTTOM = ["exp", "vibe", "photo", "popup"];
  const runTopic = k => { const T = TOPICS[k]; const r = T.run(); return { key: k, ...T, ...r }; };

  /* ---------- 우리 동네: 구 타일 지도 ---------- */
  const GU_GRID = [
    [null, "은평구", "강북구", "도봉구", "노원구", null],
    ["강서구", "서대문구", "종로구", "성북구", "중랑구", null],
    ["양천구", "마포구", "중구", "동대문구", "광진구", "강동구"],
    ["구로구", "영등포구", "용산구", "성동구", "송파구", null],
    ["금천구", "동작구", "서초구", "강남구", null, null],
    [null, "관악구", null, null, null, null]
  ];
  const GU_POS = {}; GU_GRID.forEach((row, r) => row.forEach((g, c) => { if (g) GU_POS[g] = [r, c]; }));
  function defaultGu() { const p = S.profile?.gu; if (p && GU_POS[p]) return p; const pr = [...(S.prefs?.regions || [])].find(g => GU_POS[g]); return pr || "마포구"; }
  function weekEvents() { const t = today(), w = addFilterDays(t, 6); return basePool().filter(e => isEvent(e) && activeDuring(e, t, w)); }
  function localTopic(gu) {
    const evs = weekEvents().filter(e => guOf(e) === gu).sort((a, b) => byEnd(a, b) || (hasPhoto(b) - hasPhoto(a)));
    const places = basePool().filter(e => isAlwaysOpen(e) && guOf(e) === gu && isFree(e) && ["전시", "무료 공간"].includes(g4(e))).sort((a, b) => (hasPhoto(b) - hasPhoto(a)) || ((g4(a) === "전시") ? -1 : 1));
    return { key: "local", ...TOPICS.local, title: `${gu} 이번 주 문화생활`, items: [...evs, ...places], evCount: evs.length, placeCount: places.length,
      meta: e => isEvent(e) ? `${g4(e)} · ~${md(e.end)}` : `상시 · ${g4(e)}` };
  }
  function guCounts() { const counts = {}; weekEvents().forEach(e => { const g = guOf(e); if (GU_POS[g]) counts[g] = (counts[g] || 0) + 1; }); return counts; }
  function guSection() {
    const counts = guCounts();
    const vals = Object.values(counts).sort((a, b) => a - b), q = f => vals[Math.floor((vals.length - 1) * f)] || 0; const lvl = n => !n ? 0 : n >= q(.67) ? 3 : n >= q(.34) ? 2 : 1; // 행사가 있는 구 사이 순위로 3단계 진하기
    const active = Object.keys(counts).length;
    const tiles = GU_GRID.flat().map(g => g
      ? `<button class="cu-gt l${lvl(counts[g])}" data-curgu="${g}" aria-label="${g} 이번 주 문화생활 보기 (행사 ${counts[g] || 0}건)"><b>${shortGu(g)}</b>${counts[g] ? `<small>${counts[g]}곳</small>` : ""}</button>`
      : `<span class="cu-gt empty" aria-hidden="true"></span>`).join("");
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return `<section class="cu-sec">
      <div class="cu-h"><div><h2>우리 동네 이번 주 문화생활</h2><small>동네를 누르면 그 동네의 이번 주 문화생활이 열려요</small></div><span class="cu-ratio">${active} / 25구</span></div>
      <div class="cu-gumap"><div class="cu-gugrid">${tiles}</div>
        <p class="cu-guline"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.5s-7-6.1-7-11.6A7 7 0 0 1 19 9.9c0 5.5-7 11.6-7 11.6Z"/><circle cx="12" cy="10" r="2.6"/></svg><span>${top ? `이번 주 행사가 가장 많은 동네는 <button class="cu-link" data-curgu="${top[0]}">${top[0]}</button> <b>${top[1]}건</b>` : "이번 주 행사 정보를 불러오는 중이에요"}</span></p></div>
    </section>`;
  }
  function guSheet(gu) {
    CUR.pool = null; CUR.pool = basePool();
    let L, counts; try { L = localTopic(gu); counts = guCounts(); } finally { CUR.pool = null; }
    const evs = L.items.filter(isEvent), places = L.items.filter(e => !isEvent(e));
    let empty = "";
    if (!evs.length) {
      const [r0, c0] = GU_POS[gu];
      const nb = Object.keys(counts).map(g => ({ g, d: Math.hypot(GU_POS[g][0] - r0, GU_POS[g][1] - c0), n: counts[g] })).filter(x => x.d > 0).sort((a, b) => a.d - b.d || b.n - a.n)[0];
      empty = `<p class="cu-empty">${gu}에는 이번 주 행사가 없어요.${nb ? ` 가까운 <button class="cu-link" data-curgu="${nb.g}">${nb.g}</button>에 <b>${nb.n}건</b>이 있어요.` : ""}</p>`;
    }
    sheet(`<div class="sh-h"><h2>${gu} 이번 주 문화생활</h2><button class="x" id="cuX" aria-label="닫기">${ico.x}</button></div>
      <p class="note">이번 주 행사 ${evs.length}건 · 상시 무료 전시·공간 ${places.length}곳</p>
      ${evs.length ? `<h3 class="cu-sh3">이번 주 행사</h3><div class="cu-grid">${evs.slice(0, 40).map((e, i) => gridCard(e, L.meta(e), { badge: dday(e) })).join("")}</div>` : empty}
      ${places.length ? `<h3 class="cu-sh3">언제 가도 무료</h3><div class="cu-grid">${places.slice(0, 20).map(e => gridCard(e, L.meta(e), {})).join("")}</div>` : ""}`);
    $("#cuX").onclick = closeSheet;
  }

  /* ---------- 카드 ---------- */
  const ICO = {
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    stat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V10M10 19V5M16 19v-7M21 19H3"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };
  const PAL = [["#3D5414", "#EEF6DC"], ["#B4532A", "#FFF4E8"], ["#24395C", "#E6EEFB"], ["#C99A1E", "#2A1E00"], ["#5A3A5E", "#F6EAF7"], ["#2F6B5E", "#E3F5F0"], ["#1F2B22", "#E8F0DC"]];
  const palOf = e => PAL[hashNum(e.id) % PAL.length];
  function visual(e, cls) {
    const [bg, fg] = palOf(e);
    const fb = `<span class="cu-fb" style="background:${bg};color:${fg}"><b>${esc(String(e.name || "").replace(/^\[[^\]]*\]\s*/, ""))}</b><small>${esc(g4(e))}</small></span>`;
    const img = hasPhoto(e) ? `<img src="${esc(e.photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
    return `<span class="${cls}">${fb}${img}`;
  }
  function pick(items, used, max) {
    const out = [];
    for (const e of items) { if (out.length >= max) break; const n = used.get(e.id) || 0; if (n >= 2) continue; out.push(e); }
    out.forEach(e => used.set(e.id, (used.get(e.id) || 0) + 1));
    return out;
  }
  const exTag = e => isDemoCulture(e) && !/^\(예시\)/.test(e.name || "") ? '<em class="cu-ex">예시</em>' : "";
  function posterCard(e, meta, badge) {
    return `<button class="cu-pc" data-open="${e.id}">${visual(e, "cu-ph")}${badge ? `<i class="cu-dd ${/D-(DAY|[0-2])$/.test(badge) ? "hot" : ""}">${badge}</i>` : ""}</span>
      <span class="cu-tt">${exTag(e)}${esc(e.name)}</span><span class="cu-mt">${esc(meta || e.place || "")}</span><span class="cu-pr">${priceText(e)}</span></button>`;
  }
  function landCard(e, meta) {
    return `<button class="cu-lc" data-open="${e.id}">${visual(e, "cu-lph")}</span><span class="cu-lb"><span class="cu-tt one">${exTag(e)}${esc(e.name)}</span><span class="cu-mt">${esc(meta || "")} · ${priceText(e)}</span></span></button>`;
  }
  function statCard(e, meta) {
    return `<button class="cu-pc sq" data-open="${e.id}">${visual(e, "cu-ph sq")}</span>
      <span class="cu-tt">${exTag(e)}${esc(e.name)}</span><span class="cu-mt st">${ICO.stat}${esc(meta || "")}</span></button>`;
  }
  function gridCard(e, meta, o) {
    const b = o.badge ? `<i class="cu-dd ${/D-(DAY|[0-2])$/.test(o.badge) ? "hot" : ""}">${o.badge}</i>` : o.rank ? `<i class="cu-rk ${o.rank <= 3 ? "top" : ""}">${o.rank}</i>` : "";
    return `<button class="cu-gc" data-open="${e.id}">${visual(e, "cu-gph")}${b}</span>
      <span class="cu-tt">${exTag(e)}${esc(e.name)}</span><span class="cu-mt ${o.stat ? "st" : ""}">${o.stat ? ICO.stat : ""}${esc(meta || "")}</span>
      <span class="cu-gp"><b>${priceText(e)}</b>${guOf(e) ? `<small>${esc(guOf(e))}</small>` : ""}</span></button>`;
  }
  const demoBadge = '<span class="cu-demo">예시 데이터</span>';
  function section(t, used, kind, min = 5) {
    const list = pick(t.items, used, 10);
    if (list.length < min) return "";
    const cards = list.map(e => kind === "stat" ? statCard(e, t.meta(e)) : kind === "land" ? landCard(e, t.meta(e)) : posterCard(e, t.meta(e), t.badge && t.badge(e))).join("");
    return `<section class="cu-sec"><div class="cu-h"><div><h2>${esc(t.title)}${t.demo ? demoBadge : ""}</h2><small>${esc(t.desc)}</small></div><button class="cu-more" data-cur="${t.key}" aria-label="${esc(t.title)} 전체 보기">${ICO.chev}</button></div><div class="cu-row">${cards}</div></section>`;
  }

  /* ---------- 오늘의 큐레이션 (캐러셀) ---------- */
  function heroOrder() {
    const now = kstToday(), d = now.getUTCDay(), h = now.getUTCHours();
    const first = d === 3 ? "wday" : (d === 5 && h >= 15) || d === 6 || d === 0 ? "weekend" : h >= 16 ? "evening" : d === 4 || d === 5 ? "weekend" : "evening";
    const tod = h >= 17 ? "저녁" : h >= 12 ? "오후" : "오전";
    return { keys: [first, ...["weekend", "evening", "wday"].filter(k => k !== first)], label: `${DOW[d]}요일 ${tod}에 맞춰 골랐어요` };
  }
  function heroCard(t, i, n, label) {
    const ph = t.items.filter(hasPhoto).slice(0, 6);
    const tiles = (ph.length >= 3 ? ph : t.items.slice(0, 6)).map(e => { const [bg, fg] = palOf(e); return `<span style="background:${bg};color:${fg}"><b>${esc(String(e.name).replace(/^\[[^\]]*\]\s*/, ""))}</b>${hasPhoto(e) ? `<img src="${esc(e.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>`; }).join("");
    const sub = t.key === "weekend" ? `이번 주말(${t.range}) 무료로 여는 곳 <b>${t.items.length.toLocaleString()}곳</b>`
      : t.key === "evening" ? `오늘 저녁 8시 이후까지 여는 곳 <b>${t.items.length}곳</b>`
      : `${isWedStr(today()) ? "오늘" : `다음 수요일(${md(t.date)})`} 무료로 들어가는 곳 <b>${t.items.length}곳</b>`;
    const tag = i === 0 ? label : t.key === "weekend" ? "이번 주말" : t.key === "evening" ? "평일 저녁" : "매주 수요일";
    return `<button class="cu-hero ${i === 0 ? "first" : ""}" data-cur="${t.key}"><span class="cu-col" aria-hidden="true">${tiles}</span><span class="cu-scrim"></span>
      <span class="cu-hb"><i class="cu-tag">${ICO.clock}${tag}</i><b>${esc(t.title)}</b><small>${sub}</small></span><i class="cu-pg">${i + 1} / ${n}</i></button>`;
  }

  /* ---------- 페이지 ---------- */
  function curationPage(pg) {
    CUR.pool = null; CUR.pool = basePool();
    try { renderCuration(pg); } finally { CUR.pool = null; }
  }
  function renderCuration(pg) {
    const keep = pg.querySelector(".cu") ? pg.scrollTop : 0;
    const used = new Map();
    const ho = heroOrder();
    const heroes = ho.keys.map(runTopic).filter(t => t.items.length);
    const lc = runTopic("lastcall");
    const bottom = BOTTOM.map(k => { const t = runTopic(k); return section(t, used, t.review ? "stat" : "poster", 1); }).join("");
    const anyDemo = [...CHIP_ORDER, ...BOTTOM].some(k => TOPICS[k].review);
    pg.dataset.cu = "1";
    pg.innerHTML = `<div class="cu">
      <h1>큐레이션</h1><p class="cu-lead">적은 돈으로 알차게, 데이터로 골랐어요</p>
      ${heroes.length ? `<section class="cu-sec"><div class="cu-h"><h2>오늘의 큐레이션</h2></div><div class="cu-row heroes">${heroes.map((t, i) => heroCard(t, i, heroes.length, ho.label)).join("")}</div></section>` : ""}
      <section class="cu-sec"><div class="cu-h"><h2>주제별로 골라보기</h2></div><div class="cu-chips">${CHIP_ORDER.map(k => `<button class="cu-chip" data-cur="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${CHIP_ICON[k]}</svg><span>${TOPICS[k].chip}</span>${TOPICS[k].review && demoOn() ? '<i title="예시 데이터"></i>' : ""}</button>`).join("")}</div></section>
      ${section(lc, used, "poster")}
      ${guSection()}
      ${bottom}
      ${anyDemo && demoOn() ? `<p class="cu-note">${ICO.clock}<span>'예시 데이터' 표시가 붙은 주제는 이용자 리뷰가 충분히 쌓이기 전까지 시연용 예시 수치로 보여줘요. 리뷰가 기준을 넘으면 실제 데이터로 자동 전환돼요.</span></p>` : ""}
    </div>`;
    pg.scrollTop = keep;
  }
  function topicSheet(k) {
    CUR.pool = null; CUR.pool = basePool();
    let t; try { t = runTopic(k); } finally { CUR.pool = null; }
    const items = t.items.slice(0, 60);
    sheet(`<div class="sh-h"><h2>${esc(t.title)}</h2><button class="x" id="cuX" aria-label="닫기">${ico.x}</button></div>
      <p class="note">${esc(t.desc)} · ${t.items.length.toLocaleString()}곳${t.items.length > items.length ? ` 중 ${items.length}곳` : ""}</p>
      ${t.demo ? '<p class="note" style="margin-top:2px"><span class="tag">예시 데이터</span>이용자 리뷰가 쌓이기 전까지 시연용 예시 수치로 순위를 매겨요.</p>' : ""}
      ${items.length ? `<div class="cu-grid">${items.map((e, i) => gridCard(e, t.meta(e), { badge: t.badge && t.badge(e), rank: t.review ? i + 1 : 0, stat: t.review })).join("")}</div>` : '<p class="note" style="padding:12px 0">지금은 조건에 맞는 곳이 없어요.</p>'}`);
    $("#cuX").onclick = closeSheet;
  }

  /* 클릭: 주제 열기 · 동네 고르기 (index.html의 공통 클릭 처리보다 먼저 받는다) */
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-cur],[data-curgu]"); if (!b) return;
    ev.stopPropagation(); ev.preventDefault();
    if (b.dataset.curgu) { guSheet(b.dataset.curgu); return; }
    topicSheet(b.dataset.cur);
  }, true);

  /* ---------- 스타일 ---------- */
  const css = `
.cu{padding-bottom:8px}.cu h1{margin:4px 0 2px}.cu-lead{margin:0 0 4px;color:var(--ink2);font-size:14px}
.cu-sec{margin-top:24px}.cu-h{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:10px}
.cu-h h2{margin:0;font-size:17px;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.cu-h small{display:block;color:var(--ink2);font-size:12.5px;margin-top:2px}
.cu-h.sub{margin:14px 0 8px}.cu-h.sub h3{margin:0;font-size:15px;font-weight:800}
.cu-more{flex:none;border:0;background:none;display:flex;align-items:center;gap:2px;min-width:44px;min-height:40px;justify-content:flex-end;color:var(--ink2);font-weight:700;font-size:13px;padding:0}
.cu-more svg,.cu-banner>svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.cu-demo,.cu-ratio{font-size:11px;font-weight:700;color:var(--ink2);background:var(--chip);border-radius:6px;padding:2px 7px;letter-spacing:0}
.cu-ratio{flex:none;font-size:13px;font-weight:800;color:var(--accent);background:none;padding:0 0 2px}
.cu-row{display:flex;gap:10px;overflow-x:auto;margin:0 -16px;padding:0 16px 4px;scroll-padding:0 16px;scrollbar-width:none;scroll-snap-type:x proximity}.cu-row::-webkit-scrollbar{display:none}
.cu-row>*{scroll-snap-align:start}
.cu-hero{position:relative;flex:none;width:min(330px,86vw);height:228px;border:0;border-radius:20px;overflow:hidden;background:var(--ink);padding:0;text-align:left;color:#fff}
.cu-col{position:absolute;inset:-18px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;transform:rotate(-6deg) scale(1.08);opacity:.62}
.cu-col span{position:relative;height:128px;border-radius:10px;overflow:hidden;padding:9px;box-sizing:border-box;font-size:12px;line-height:1.25;font-weight:900}
.cu-col img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cu-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,32,16,.1) 0%,rgba(20,32,16,.55) 45%,rgba(20,32,16,.95) 100%)}
.cu-hb{position:absolute;left:18px;right:18px;bottom:16px;display:flex;flex-direction:column;gap:7px}
.cu-hb b{font-size:20px;line-height:1.3;font-weight:900;letter-spacing:-.03em;word-break:keep-all}.cu-hb small{font-size:13px;color:#DCE3D3}.cu-hb small b{font-size:13px;color:#CFE59A}
.cu-tag{align-self:flex-start;font-style:normal;display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:7px;background:#CFE59A;color:#142010;font-size:12px;font-weight:800}
.cu-tag svg,.cu-note svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round}
.cu-hero:not(.first) .cu-tag{background:#fff}
.cu-pg{position:absolute;right:12px;top:12px;font-style:normal;height:22px;padding:0 8px;border-radius:999px;background:rgba(0,0,0,.45);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center}
.cu-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.cu-chip{position:relative;min-height:48px;padding:0 8px;border-radius:14px;background:#fff;border:1px solid #E1E6D8;display:flex;align-items:center;justify-content:center;gap:6px;font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap}
.cu-chip svg{flex:none;width:17px;height:17px;fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.cu-chip i{position:absolute;top:6px;right:7px;width:6px;height:6px;border-radius:50%;background:#C99A1E}
.cu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 10px;margin-top:10px}
.cu-gc{border:0;background:none;padding:0;text-align:left;display:flex;flex-direction:column;gap:3px;color:var(--ink);min-width:0}
.cu-gph{position:relative;display:block;aspect-ratio:3/4;border-radius:14px;overflow:hidden;margin-bottom:5px;background:var(--chip)}
.cu-gph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cu-gp{display:flex;align-items:baseline;justify-content:space-between;gap:6px}.cu-gp b{font-size:13px;font-weight:800;color:#3D5414}.cu-gp small{font-size:11.5px;color:var(--ink2)}
.cu-rk{position:absolute;left:8px;top:8px;z-index:1;font-style:normal;min-width:26px;height:26px;padding:0 7px;box-sizing:border-box;border-radius:8px;background:rgba(31,43,34,.82);color:#fff;font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center}.cu-rk.top{background:#6F8F2E}
.cu-sh3{margin:18px 0 0;font-size:15px;font-weight:800}
.cu-pc{flex:none;width:136px;border:0;background:none;padding:0;text-align:left;display:flex;flex-direction:column;gap:3px;color:var(--ink)}
.cu-pc.sq{width:148px}
.cu-ph,.cu-lph{position:relative;display:block;height:182px;border-radius:14px;overflow:hidden;margin-bottom:5px;background:var(--chip)}
.cu-ph.sq{height:150px}.cu-ph img,.cu-lph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cu-fb{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:34px 11px 11px;box-sizing:border-box}
.cu-fb b{font-size:15px;line-height:1.25;font-weight:900;letter-spacing:-.03em;word-break:keep-all;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}.cu-fb small{font-size:10px;font-weight:700;opacity:.85}
.cu-lph .cu-fb{padding:12px 14px;justify-content:flex-end}.cu-lph .cu-fb small{display:none}
.cu-dd{position:absolute;left:8px;top:8px;z-index:1;font-style:normal;height:22px;padding:0 8px;border-radius:7px;background:var(--ink);color:#fff;font-size:12px;font-weight:900;display:flex;align-items:center}.cu-dd.hot{background:#C42E43}
.cu-tt{font-size:14px;font-weight:700;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:keep-all}.cu-tt.one{-webkit-line-clamp:1;display:-webkit-box}
.cu-mt{font-size:12px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cu-mt.st{display:flex;align-items:center;gap:4px}
.cu-mt.st svg{flex:none;width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}
.cu-pr{font-size:12px;font-weight:800;color:#3D5414}
.cu-ex{font-style:normal;font-size:10.5px;font-weight:700;color:var(--ink2);background:var(--chip);border-radius:5px;padding:0 5px;margin-right:4px;vertical-align:1px}
.cu-lc{flex:none;width:220px;border:1px solid var(--line);background:#fff;border-radius:16px;overflow:hidden;padding:0;text-align:left;display:flex;flex-direction:column;color:var(--ink)}
.cu-lph{height:108px;border-radius:0;margin:0}.cu-lb{display:flex;flex-direction:column;gap:3px;padding:10px 12px 12px}
.cu-gumap{background:#fff;border:1px solid var(--line);border-radius:22px;padding:16px 12px 12px}
.cu-gugrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;max-width:360px;margin:0 auto}
.cu-gt{aspect-ratio:1;border:0;border-radius:12px;background:#F1F4EA;color:var(--ink2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:0;font:inherit;line-height:1.15}
.cu-gt b{font-size:12.5px;font-weight:700}.cu-gt small{font-size:11px;font-weight:800}
.cu-gt.empty{background:none}.cu-gt.l1{background:#DCE8C3;color:#2E3F10}.cu-gt.l2{background:#AFC97A;color:#1E2A0A}.cu-gt.l3{background:#6F8F2E;color:#fff}
.cu-gt.sel{background:var(--ink);color:#fff;box-shadow:0 0 0 2px #fff,0 0 0 4px var(--accent)}.cu-gt.sel b,.cu-gt.l3 b{font-weight:800}
.cu-guline{display:flex;align-items:center;gap:6px;margin:12px 4px 0;font-size:13px;color:var(--ink2)}.cu-guline b{color:var(--ink)}
.cu-guline svg{flex:none;width:16px;height:16px;fill:none;stroke:var(--accent);stroke-width:2.2;stroke-linejoin:round}
.cu-link{border:0;background:none;padding:0;font:inherit;font-weight:800;color:#3D5414;text-decoration:underline;text-underline-offset:2px}
.cu-empty{font-size:13px;color:var(--ink2);margin:12px 2px 0}
.cu-banner{width:100%;display:flex;align-items:center;gap:14px;padding:18px;border:0;border-radius:18px;background:#F3EBDD;text-align:left;color:var(--ink)}
.cu-tk{flex:none;width:74px;height:86px;border-radius:10px;background:var(--ink);color:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;transform:rotate(-5deg)}
.cu-tk small{font-size:11px;font-weight:700;color:#CFE59A}.cu-tk b{font-size:24px;font-weight:900;line-height:1}
.cu-bt{flex:1;display:flex;flex-direction:column;gap:4px}.cu-bt small{font-size:12px;font-weight:800;color:#8A4B1F}.cu-bt b{font-size:16px;font-weight:900;line-height:1.35}
.cu-note{display:flex;gap:6px;margin:22px 2px 0;font-size:12px;line-height:1.5;color:var(--ink2)}.cu-note svg{margin-top:3px;flex:none}
.nav button svg .g{fill:none}.nav button[aria-current="page"] svg .g{fill:var(--accent-soft)}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  window.curationPage = curationPage;
  if (S.tab === "cur") renderPage();
})();
