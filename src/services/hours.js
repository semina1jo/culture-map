/* 운영시간 문구 → 요일·시간 규칙 (2026-11-14)
 * 서울시 문화행사 정보(PRO_TIME)와 상설 시설 문구를 읽는다. 자유 문장이라 확실히 읽히는 것만 규칙으로 바꾸고,
 * 못 읽으면 ok:false (화면은 원문을 그대로 보여 준다). 휴관 요일은 시간과 따로 뽑아 '오늘 휴관' 판정에 쓴다.
 */
(function (global) {
  const DAYS = "일월화수목금토";
  const ALL = [0, 1, 2, 3, 4, 5, 6];
  const HAN = "[가-힣]";
  const D1 = new RegExp(`(?<!${HAN})([월화수목금토일])(?!${HAN})`, "g");
  const DR = new RegExp(`(?<!${HAN})([월화수목금토일])\\)?\\s*[~\\-–]\\s*\\(?([월화수목금토일])(?!${HAN})`, "g");
  const CLOSE_KW = /휴관|휴무|휴궁/;
  const IRREGULAR = /째\s*주|주차|매월|매달|격주|또는|별\s*상이|별상이|운영시간 내|소요시간|조정 가능/;
  const ALLDAY = /종일|상시|제한 없음|24시간/;

  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fmt = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  function range(a, b) { const out = []; let i = DAYS.indexOf(a); const j = DAYS.indexOf(b); for (let k = 0; k < 7; k++) { out.push(i); if (i === j) break; i = (i + 1) % 7; } return out; }

  // 문자열 안의 요일 표현 → 요일 번호 집합 (없으면 null)
  function daysIn(s) {
    const set = new Set();
    if (/매일|연중무휴/.test(s)) ALL.forEach(d => set.add(d));
    if (/평일|주중/.test(s)) [1, 2, 3, 4, 5].forEach(d => set.add(d));
    if (/주말/.test(s)) [0, 6].forEach(d => set.add(d));
    let rest = s.replace(DR, (_, a, b) => { range(a, b).forEach(d => set.add(d)); return " "; });
    rest.replace(D1, (_, a) => { set.add(DAYS.indexOf(a)); return " "; });
    return set.size ? [...set].sort() : null;
  }

  function normalize(text) {
    let t = String(text || "").replace(/\s+/g, " ").trim();
    t = t.replace(/([월화수목금토일])요일/g, "$1").replace(/(\d)\s*!\s*(\d)/g, "$1~$2");
    // 오전/오후 N시(M분) → HH:MM
    t = t.replace(/(오전|오후)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/g, (all, ap, h, m) => { let H = Number(h); if (ap === "오후" && H < 12) H += 12; return `${H}:${String(m || 0).padStart(2, "0")}`; });
    t = t.replace(/오전|오후/g, " ");
    // 계절·월 범위는 보호해 둔다
    t = t.replace(/\[?\s*(\d{1,2})\s*[~\-–]\s*(\d{1,2})\s*월\s*\]?/g, " ⟦M$1-$2⟧ ").replace(/하절기/g, " ⟦M3-10⟧ ").replace(/동절기/g, " ⟦M11-2⟧ ");
    // 입장 마감·안내성 괄호·예외 문구 제거
    t = t.replace(/\(\s*단\s.*$/, " ");
    t = t.replace(/\([^()]*(입장|마감|참조|참고|상이|휴강|진행|단 |회\))[^()]*\)/g, " ");
    t = t.replace(/(입장|관람)\s*마감\s*:?\s*\d{1,2}:\d{2}/g, " ").replace(/\d{1,2}:\d{2}\s*까지\s*입장\s*(가능)?/g, " ").replace(/입장\s*\d{1,2}:\d{2}\s*까지/g, " ");
    // 날짜(11.17, 11월 30일, 19일, 1월) 지우기 — 괄호 속 요일은 남는다
    t = t.replace(/(?<![\d:])\d{1,2}\s*월\s*\d{1,2}\s*일/g, " ").replace(/(?<![\d:])\d{1,2}(?:\.\s?|\/)\d{1,2}\.?(?![\d:])/g, " ").replace(/(?<![\d:])\d+\s*일(?!요)/g, " ").replace(/(?<![\d:])\d+\s*월/g, " ");
    return t;
  }

  // 휴관 절을 떼어 내고 휴관 요일을 모은다
  function takeClosed(t) {
    const closed = new Set();
    t = t.replace(/\(([^()]*)\)/g, (all, inner) => { if (!CLOSE_KW.test(inner)) return all; (daysIn(inner) || []).forEach(d => closed.add(d)); return " "; });
    const segs = t.split(/\s+[·|]\s+|\s*\/\s*|\s*※\s*|\s*\|\s*/);
    const kept = [];
    for (let seg of segs) {
      const m = seg.match(CLOSE_KW);
      if (!m) { kept.push(seg); continue; }
      seg = seg.trim(); const k = seg.search(CLOSE_KW);
      const before = seg.slice(0, k), after = seg.slice(k + 2);
      const lastTime = [...before.matchAll(/\d{1,2}:\d{2}/g)].pop();
      if (k === 0 || !lastTime) {
        // '휴관 매주 월요일, …' 또는 '일, 월 휴관'
        const clause = k === 0 ? after : before;
        if (!/연중무휴|없음/.test(clause)) (daysIn(clause) || []).forEach(d => closed.add(d));
        const remain = k === 0 ? "" : after; if (remain.trim()) kept.push(remain);
      } else {
        const cut = lastTime.index + lastTime[0].length;
        (daysIn(before.slice(cut)) || []).forEach(d => closed.add(d));
        kept.push(before.slice(0, cut));
      }
    }
    return { rest: kept, closed: [...closed].sort() };
  }

  const TOKEN = /⟦M(\d{1,2})-(\d{1,2})⟧|(\d{1,2}:\d{2})\s*~\s*\(?\s*(\d{2,3})\s*분|(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})|(\d{1,2}:\d{2})\s*까지|[~\-–]\s*(\d{1,2}:\d{2})|(\d{1,2}:\d{2})\s*~?/g;

  function parse(text) {
    const raw = String(text || "").trim();
    if (!raw) return { ok: false, closed: [], rules: [] };
    const t0 = normalize(raw);
    const { rest, closed } = takeClosed(t0);
    const segsAll = rest.filter(x => !/(\)|일)\s*은\s/.test(x));
    const body = segsAll.join(" / ");
    const hasTime = /\d{1,2}:\d{2}/.test(body);
    if (!hasTime) return { ok: ALLDAY.test(raw), allDay: ALLDAY.test(raw), closed, rules: [] };
    if (IRREGULAR.test(body)) return { ok: false, closed, rules: [] };
    const rules = [];
    let carry = null;
    for (const seg of segsAll) {
      const segRules = [];
      const segHasDays = !!daysIn(seg.replace(/[\d:~\-–⟦⟧M]/g, " "));
      let days = segHasDays ? null : carry, season = null, last = 0;
      const pend = [];
      seg.replace(TOKEN, (all, m1, m2, dO, dM, rO, rC, eT, eT2, sT, idx) => {
        let between = seg.slice(last, idx); last = idx + all.length;
        const cut = between.lastIndexOf(")"); const pre = cut >= 0 && daysIn(between.slice(cut + 1)) ? between.slice(cut + 1) : between;
        const d = daysIn(pre); if (d) days = d;
        if (m1) { const sm = [Number(m1), Number(m2)]; const prev = segRules[segRules.length - 1]; if (prev && !prev.season && !between.replace(/[,()\s]/g, "")) prev.season = sm; else season = sm; return all; }
        let r = null;
        if (dO) r = { open: toMin(dO), close: toMin(dO) + Number(dM) };
        else if (rO) r = { open: toMin(rO), close: toMin(rC) };
        else if (eT || eT2) r = { ext: toMin(eT || eT2) };
        else if (sT) r = { start: toMin(sT) };
        if (!r) return all;
        r.days = days; r.season = season; segRules.push(r); if (!days) pend.push(r);
        return all;
      });
      const tail = daysIn(seg.slice(last));
      if (tail) pend.forEach(r => { if (!r.days) r.days = tail; });
      const own = segRules.find(r => r.days); if (own) carry = own.days;
      rules.push(...segRules);
    }
    const usable = rules.filter(r => r.open != null || r.start != null);
    return { ok: usable.length > 0, closed, rules };
  }

  const inSeason = (s, month) => !s || (s[0] <= s[1] ? month >= s[0] && month <= s[1] : month >= s[0] || month <= s[1]);

  // 특정 날짜(YYYY-MM-DD)의 운영 정보
  function onDate(p, date) {
    if (!p) return { state: "unknown" };
    const d = new Date(`${date}T00:00:00Z`), wd = d.getUTCDay(), month = d.getUTCMonth() + 1;
    if (p.closed && p.closed.includes(wd)) return { state: "closed" };
    if (!p.ok) return { state: "unknown" };
    if (p.allDay && !p.rules.length) return { state: "allday" };
    const today = p.rules.filter(r => (!r.days || r.days.includes(wd)) && inSeason(r.season, month));
    const windows = today.filter(r => r.open != null).map(r => [r.open, r.close]);
    const starts = today.filter(r => r.start != null).map(r => r.start).sort((a, b) => a - b);
    const ext = today.filter(r => r.ext != null).map(r => r.ext);
    if (ext.length && windows.length) { const e = Math.max(...ext); windows.forEach(w => { if (e > w[1]) w[1] = e; }); }
    if (!windows.length && !starts.length) return { state: "off" };
    return { state: "open", windows, starts };
  }

  function label(info) {
    if (!info || info.state === "unknown") return "";
    if (info.state === "closed") return "오늘 휴관";
    if (info.state === "off") return "오늘은 운영 안 함";
    if (info.state === "allday") return "오늘 종일";
    const w = info.windows.map(([a, b]) => `${fmt(a)}–${fmt(b)}`), s = info.starts.map(fmt);
    return "오늘 " + [...w, ...(s.length ? [s.join("·") + " 시작"] : [])].join(", ");
  }

  // 지금(분) 기준 상태: 운영 중 / 곧 시작 / 종료
  function nowState(info, nowMin) {
    if (!info || info.state !== "open") return null;
    if (info.windows.some(([a, b]) => nowMin >= a && nowMin < b)) return "운영 중";
    const next = [...info.windows.map(w => w[0]), ...info.starts].filter(m => m > nowMin).sort((a, b) => a - b)[0];
    if (next != null) return `${fmt(next)} 시작`;
    return "오늘 운영 끝";
  }

  // 하루 끝에(구 퇴근 후): 저녁 8시 이후까지 열려 있는 곳(20:30 전에 열고 20:30 넘어서까지), 또는 18:00~20:30에 시작하는 공연·프로그램
  function evening(info) {
    if (!info || info.state !== "open") return false;
    return info.windows.some(([a, b]) => b >= 20 * 60 + 30 && a <= 20 * 60 + 30) || info.starts.some(s => s >= 18 * 60 && s <= 20 * 60 + 30);
  }
  // 저녁 기준 마감·시작 표시 (예: "21:00까지", "19:30 시작")
  function eveningText(info) {
    if (!evening(info)) return "";
    const w = info.windows.filter(([a, b]) => b >= 20 * 60 + 30 && a <= 20 * 60 + 30).map(w => w[1]);
    if (w.length) return `${fmt(Math.max(...w))}까지`;
    return info.starts.filter(s => s >= 18 * 60 && s <= 20 * 60 + 30).map(fmt).join("·") + " 시작";
  }

  const api = { parse, onDate, label, nowState, evening, eveningText, fmt };
  global.hoursService = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
