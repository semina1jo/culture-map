// 한눈에보는문화정보조회서비스(문화체육관광부·한국문화정보원) → 서울시 전역 공연·전시·행사 → culture_events 저장
// 2026-11-13: 홍대 5km → 서울 전역. 상세 조회가 많아져서 한 번에 다 못 하면 다음 실행에서 이어서 한다(시간 예산).
// 매일 자동 실행. 본문에 {"dry": true}를 보내면 저장하지 않고 건수·예시만 돌려준다.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseFee } from "./fee.ts";

const KEY = Deno.env.get("CULTURE_PORTAL_KEY") ?? "";
const BASE = "https://apis.data.go.kr/B553457/cultureinfo";
const SOURCE = "한눈에보는문화정보";
const SEOUL_SOURCE = "서울시 문화행사 정보";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CENTER = { lat: 37.5563, lng: 126.9236 }; // 홍대입구역
const RADIUS_KM = 5;
const MAX_PRICE = 30000; // 2026-11-26: 만 원 → 3만 원 (앱 필터 최대값과 같게)
// 서울시를 덮는 사각형 (검색은 사각형으로, 저장은 서울 주소만)
const BOX = { gpsxfrom: "126.7640", gpsxto: "127.1840", gpsyfrom: "37.4280", gpsyto: "37.7020" };
const inBox = (lat: number, lng: number) => lat >= 37.428 && lat <= 37.702 && lng >= 126.764 && lng <= 127.184;
const TIME_BUDGET_MS = 110_000; // Edge Function 실행 시간 제한 안에서 끝내기
const FRESH_DAYS = 7;           // 최근 7일 안에 상세를 받은 행사는 다시 받지 않음
const KIDS = /영유아|유아|어린이|아동|미취학|초등|키즈|가족뮤지컬/;

function tag(xml: string, t: string): string {
  const a = xml.indexOf("<" + t + ">"); if (a < 0) return "";
  const b = xml.indexOf("</" + t + ">", a); if (b < 0) return "";
  return xml.slice(a + t.length + 2, b).trim();
}
function items(xml: string): string[] {
  const out: string[] = []; let i = 0;
  while (true) { const a = xml.indexOf("<item>", i); if (a < 0) break; const b = xml.indexOf("</item>", a); if (b < 0) break; out.push(xml.slice(a + 6, b)); i = b + 7; }
  return out;
}
function unesc(s: string): string {
  // 이 API는 &amp;lt; 처럼 두 번 감싸서 보내는 경우가 있어 두 번 푼다
  let v = s;
  for (let k = 0; k < 2; k++) v = v.split("&lt;").join("<").split("&gt;").join(">").split("&quot;").join('"').split("&#39;").join("'").split("&middot;").join("·").split("&amp;").join("&");
  return v.trim();
}
function distanceKm(lat: number, lng: number): number {
  const R = 6371, rad = Math.PI / 180, dLat = (lat - CENTER.lat) * rad, dLng = (lng - CENTER.lng) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(CENTER.lat * rad) * Math.cos(lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function toCategory(realm: string): string | null {
  if (realm === "전시") return "전시";
  if (["연극", "음악/콘서트", "국악", "무용/발레", "뮤지컬/오페라"].includes(realm)) return "공연";
  if (realm === "행사/축제") return "축제";
  if (realm === "교육/체험") return "체험";
  return null; // 아동/가족·도서·체육·기타는 제외
}
const ymd = (s: string) => /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
const norm = (s: string) => s.replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
// 제목 비슷한 정도: [기관명] 같은 머리말을 빼고 두 글자씩 끊어 겹치는 비율
function bigrams(s: string): Set<string> {
  const n = norm(s.replace(/\[[^\]]*\]|【[^】]*】|<[^>]*>/g, ""));
  const out = new Set<string>(); for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2)); return out;
}
function similar(a: string, b: string): boolean {
  const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return false;
  let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
  return inter / Math.min(A.size, B.size) >= 0.6;
}
const httpsUrl = (s: string) => s ? s.replace(/^http:\/\/www\.culture\.go\.kr/, "https://www.culture.go.kr") : null;

async function get(op: string, params: Record<string, string>): Promise<string> {
  const q = new URLSearchParams({ serviceKey: KEY, ...params });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}/${op}?${q}`);
    const text = await res.text();
    if (res.ok && text.includes("<resultCode>00</resultCode>")) return text;
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`문화정보 API 응답 오류 (${op})`);
}

Deno.serve(async (req) => {
  try {
    if (!KEY) throw new Error("CULTURE_PORTAL_KEY Secret이 없습니다");
    let options: { dry?: boolean; probe?: boolean } = {};
    try { options = await req.json(); } catch (_) { options = {}; }
    // 확인용: {"probe": true} → 상세 응답의 항목 이름과 값 예시(3건)
    if (options.probe) {
      const xml = await get("period2", { PageNo: "1", numOfrows: "3", from: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).split("-").join(""), to: "20271231", ...BOX });
      const out = [];
      for (const x of items(xml)) { const d = items(await get("detail2", { seq: tag(x, "seq") }))[0] ?? ""; out.push(Object.fromEntries([...d.matchAll(/<([a-zA-Z0-9]+)>([\s\S]*?)<\/\1>/g)].map(m => [m[1], unesc(m[2]).slice(0, 160)]))); }
      return Response.json({ ok: true, probe: out });
    }
    const runStart = new Date().toISOString();
    const todayIso = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const today = todayIso.split("-").join("");
    const until = new Date(Date.now() + (9 * 3600 + 365 * 86400) * 1000).toISOString().slice(0, 10).split("-").join("");

    // 1) 목록: 사각형 범위 + 오늘 이후
    const list: string[] = [];
    for (let page = 1; page <= 80; page++) {
      const xml = await get("period2", { PageNo: String(page), numOfrows: "100", from: today, to: until, ...BOX });
      const total = Number(tag(xml, "totalCount")) || 0;
      const its = items(xml); list.push(...its);
      if (list.length >= total || its.length === 0) break;
    }

    // 2) 1차 거르기: 원 안, 분류, 어린이 대상, 종료, 서울시 데이터와 중복
    // 서울시 데이터와 같은 행사: 제목이 같거나, 300m 안에서 제목이 비슷하면 중복으로 본다
    const seoul = (await supabase.from("culture_events").select("title,lat,lng").eq("source", SEOUL_SOURCE)).data ?? [];
    const isDup = (c: { title: string; lat: number; lng: number }) => seoul.some(r => norm(r.title || "") === norm(c.title) || (Math.abs(r.lat - c.lat) < 0.003 && Math.abs(r.lng - c.lng) < 0.0035 && similar(r.title || "", c.title)));
    const candidates = list.map(x => ({
      seq: tag(x, "seq"), title: unesc(tag(x, "title")), realm: tag(x, "realmName"), place: unesc(tag(x, "place")),
      start: ymd(tag(x, "startDate")), end: ymd(tag(x, "endDate")), lat: Number(tag(x, "gpsY")), lng: Number(tag(x, "gpsX")), thumb: tag(x, "thumbnail"),
    })).filter(c => c.seq && c.lat && c.lng && inBox(c.lat, c.lng) && toCategory(c.realm) && !KIDS.test(c.title) && (!c.end || c.end >= todayIso) && !isDup(c));

    // 3) 상세(요금·링크·이미지)를 차례로 받아 요금 문구를 규칙으로 바꾼다 (동시에 보내면 포털이 거절함)
    const records: Record<string, unknown>[] = [];
    const stats = { listed: list.length, candidates: candidates.length, saved: 0, free: 0, under10k: 0, benefitOnly: 0, tooExpensive: 0, unknownPrice: 0, withRules: 0, notSeoul: 0, skippedFresh: 0, pending: 0 };
    const samples: unknown[] = [];
    // 이미 저장된 행사 중 최근에 상세를 받은 것은 건너뛰고, 새 행사부터 상세를 받는다
    const existing = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("culture_events").select("id,updated_at").eq("source", SOURCE).range(from, from + 999);
      (data ?? []).forEach((r: { id: string; updated_at: string }) => existing.set(r.id, r.updated_at)); if (!data || data.length < 1000) break;
    }
    const freshCut = new Date(Date.now() - FRESH_DAYS * 86400e3).toISOString();
    // 저장 안 하기로 확인한 행사(만 원 초과·가격 불명·서울 밖)도 7일 동안은 다시 조회하지 않는다
    const skipped = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("culture_portal_skip").select("seq").gt("checked_at", freshCut).range(from, from + 999);
      (data ?? []).forEach((r: { seq: string }) => skipped.add(r.seq)); if (!data || data.length < 1000) break;
    }
    const skipRows: { seq: string; reason: string; checked_at: string }[] = [];
    const todo = candidates.filter(c => { const u = existing.get(`kcis_${c.seq}`); if (!options.dry && ((u && u > freshCut) || skipped.has(c.seq))) { stats.skippedFresh++; return false; } return true; })
      .sort((a, b) => (existing.has(`kcis_${a.seq}`) ? 1 : 0) - (existing.has(`kcis_${b.seq}`) ? 1 : 0));
    const t0 = Date.now();
    for (let i = 0; i < todo.length; i += 1) {
      if (Date.now() - t0 > TIME_BUDGET_MS) { stats.pending = todo.length - i; break; }
      const batch = todo.slice(i, i + 1);
      const details = [await get("detail2", { seq: batch[0].seq }).catch(() => "")];
      batch.forEach((c, k) => {
        const it = items(details[k])[0] ?? "";
        const fee = unesc(tag(it, "price"));
        const { price, rules } = parseFee(fee);
        if (!it) return; // 상세 조회 실패: 다음 실행에서 다시
        if (price === null) { stats.unknownPrice++; skipRows.push({ seq: c.seq, reason: "가격 불명", checked_at: runStart }); return; }
        const minRule = rules.length ? Math.min(...rules.map(r => r.p)) : Infinity;
        if (price > MAX_PRICE && minRule > MAX_PRICE) { stats.tooExpensive++; skipRows.push({ seq: c.seq, reason: "가격 상한 초과", checked_at: runStart }); return; }
        const addr = unesc(tag(it, "placeAddr"));
        if (addr && !addr.includes("서울")) { stats.notSeoul++; skipRows.push({ seq: c.seq, reason: "서울 밖", checked_at: runStart }); return; }
        if (price === 0) stats.free++; else if (price <= MAX_PRICE) stats.under10k++; else stats.benefitOnly++;
        if (rules.length) stats.withRules++;
        const url = unesc(tag(it, "url"));
        const rec = {
          id: `kcis_${c.seq}`,
          title: c.title,
          category: toCategory(c.realm),
          raw_category: c.realm,
          place: c.place,
          org_name: null,
          start_date: c.start,
          end_date: c.end,
          event_time: null,
          price,
          fee_text: fee || null,
          use_target: null,
          lat: c.lat,
          lng: c.lng,
          image_url: httpsUrl(tag(it, "imgUrl") || c.thumb),
          homepage_url: url || null,
          ticket_url: url || null,
          source: SOURCE,
          benefit_rules: rules,
          place_addr: unesc(tag(it, "placeAddr")) || null,
          gu: (addr.match(/서울(?:특별시|시)?\s*([가-힣]{1,4}구)/) ?? [])[1] ?? null,
          updated_at: runStart,
        };
        records.push(rec);
        if (samples.length < 40 && (rules.length || price > 0)) samples.push({ title: c.title.slice(0, 28), fee: fee.slice(0, 80), price, rules });
      });
    }
    stats.saved = records.length;
    if (options.dry) return Response.json({ ok: true, dry: true, stats, samples });

    // 4) 저장(같은 id면 덮어쓰기) → 이번에 빠진 '이 출처' 행사만 삭제
    for (let i = 0; i < records.length; i += 200) {
      const { error } = await supabase.from("culture_events").upsert(records.slice(i, i + 200), { onConflict: "id" });
      if (error) throw error;
    }
    for (let i = 0; i < skipRows.length; i += 500) {
      const { error } = await supabase.from("culture_portal_skip").upsert(skipRows.slice(i, i + 500), { onConflict: "seq" });
      if (error) throw error;
    }
    // 목록에서 사라진(끝났거나 범위를 벗어난) 행사만 삭제. 시간이 모자라 상세를 못 받은 행사는 다음 실행까지 그대로 둔다
    const keep = new Set(candidates.map(c => `kcis_${c.seq}`));
    const gone = [...existing.keys()].filter(id => !keep.has(id));
    let deleted = 0;
    for (let i = 0; i < gone.length; i += 200) {
      const { count, error: delErr } = await supabase.from("culture_events").delete({ count: "exact" }).in("id", gone.slice(i, i + 200));
      if (delErr) throw delErr; deleted += count ?? 0;
    }
    return Response.json({ ok: true, ...stats, deleted });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
