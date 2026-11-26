// KOPIS 공연예술통합전산망 → 서울 공연 중 만 원 이하 → culture_events 저장
// 2026-11-16 신규. 목록에는 가격·좌표가 없어서 공연마다 상세(가격), 공연장마다 시설 상세(좌표)를 받는다.
//  - 목록: 오늘~90일 뒤, 서울(signgucode=11), 한 번에 100건(KOPIS 최대)
//  - 상세는 한 번에 다 못 받으면 다음 실행에서 이어간다(시간 예산). 저장 안 하기로 한 공연은 7일간 다시 조회하지 않음(kopis_skip)
//  - 공연장 좌표는 kopis_facility에 30일 보관
// 본문 {"dry": true} → 저장하지 않고 건수·예시만
// 필요한 Secret: KOPIS_API_KEY
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseFee } from "./fee.ts";

const SOURCE = "KOPIS 공연예술통합전산망";
const BASE = "http://www.kopis.or.kr/openApi/restful";
const MAX_PRICE = 30000; // 2026-11-26: 만 원 → 3만 원 (앱 필터 최대값과 같게)
const DAYS_AHEAD = 90;
const TIME_BUDGET_MS = 100_000;
const FRESH_DAYS = 7, FACILITY_DAYS = 30;
const KIDS = /영유아|유아|어린이|아동|키즈|가족뮤지컬|인형극/;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function tag(xml: string, t: string): string {
  const a = xml.indexOf(`<${t}>`); if (a < 0) return "";
  const b = xml.indexOf(`</${t}>`, a); if (b < 0) return "";
  return xml.slice(a + t.length + 2, b).trim();
}
function blocks(xml: string, t: string): string[] {
  const out: string[] = []; let i = 0;
  while (true) { const a = xml.indexOf(`<${t}>`, i); if (a < 0) break; const b = xml.indexOf(`</${t}>`, a); if (b < 0) break; out.push(xml.slice(a + t.length + 2, b)); i = b + t.length + 3; }
  return out;
}
const unesc = (s: string) => s.split("&lt;").join("<").split("&gt;").join(">").split("&quot;").join('"').split("&#39;").join("'").split("&amp;").join("&").trim();
const ymd = (s: string) => /^\d{4}\.\d{2}\.\d{2}$/.test(s) ? s.split(".").join("-") : null;
const compact = (d: Date) => d.toISOString().slice(0, 10).split("-").join("");
const https = (u: string) => u ? u.replace(/^http:\/\/www\.kopis\.or\.kr/, "https://www.kopis.or.kr") : null;
const norm = (s: string) => s.replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
function bigrams(s: string): Set<string> { const n = norm(s); const o = new Set<string>(); for (let i = 0; i < n.length - 1; i++) o.add(n.slice(i, i + 2)); return o; }
function similar(a: string, b: string): boolean {
  const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return false;
  let k = 0; A.forEach(x => { if (B.has(x)) k++; }); return k / Math.min(A.size, B.size) >= 0.6;
}

let KEY = Deno.env.get("KOPIS_API_KEY") ?? "";
async function get(path: string, params: Record<string, string> = {}): Promise<string> {
  const q = new URLSearchParams({ service: KEY, ...params });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/${path}?${q}`, { signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      if (res.ok && !text.includes("<returncode>")) return text;
      if (text.includes("<returncode>")) throw new Error(`KOPIS 오류: ${unesc(tag(text, "errmsg"))}`);
    } catch (e) { if (attempt === 2) throw e; }
    await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
  }
  throw new Error(`KOPIS 응답 없음 (${path})`);
}

Deno.serve(async (req) => {
  try {
    let o: { dry?: boolean; key?: string } = {};
    try { o = await req.json(); } catch (_) { o = {}; }
    if (!KEY && o.key) KEY = o.key; // Secret 저장 전 한 번 시험할 때만
    if (!KEY) throw new Error("KOPIS_API_KEY Secret이 없습니다");
    // 진단: {"ping": true} → KOPIS 응답 시간만 잰다 (2026-11-26 시간 초과 조사용)
    if ((o as { ping?: boolean }).ping) {
      const probe = async (label: string, url: string) => {
        const t = Date.now();
        try { const r = await fetch(url, { signal: AbortSignal.timeout(40000) }); const x = await r.text(); return { label, ms: Date.now() - t, status: r.status, head: x.slice(0, 160) }; }
        catch (e) { return { label, ms: Date.now() - t, error: String((e as Error)?.message ?? e) }; }
      };
      const d = compact(new Date(Date.now() + 9 * 3600e3));
      return Response.json({ ok: true, ping: [
        await probe("http 가짜 키", `${BASE}/pblprfr?service=x&stdate=${d}&eddate=${d}&cpage=1&rows=1`),
        await probe("https 가짜 키", `${BASE.replace("http://", "https://")}/pblprfr?service=x&stdate=${d}&eddate=${d}&cpage=1&rows=1`),
        await probe("http 실제 키 1건", `${BASE}/pblprfr?service=${KEY}&stdate=${d}&eddate=${d}&cpage=1&rows=1&signgucode=11`),
        await probe("https 실제 키 1건", `${BASE.replace("http://", "https://")}/pblprfr?service=${KEY}&stdate=${d}&eddate=${d}&cpage=1&rows=1&signgucode=11`),
      ] });
    }
    const runStart = new Date().toISOString();
    const now = new Date(Date.now() + 9 * 3600e3);
    const todayIso = now.toISOString().slice(0, 10);

    // 1) 목록
    const list: { id: string; title: string; start: string | null; end: string | null; place: string; poster: string; genre: string; open: string }[] = [];
    for (let page = 1; page <= 40; page++) {
      const xml = await get("pblprfr", { stdate: compact(now), eddate: compact(new Date(now.getTime() + DAYS_AHEAD * 86400e3)), cpage: String(page), rows: "100", signgucode: "11" });
      const dbs = blocks(xml, "db");
      for (const d of dbs) list.push({ id: tag(d, "mt20id"), title: unesc(tag(d, "prfnm")), start: ymd(tag(d, "prfpdfrom")), end: ymd(tag(d, "prfpdto")), place: unesc(tag(d, "fcltynm")), poster: tag(d, "poster"), genre: unesc(tag(d, "genrenm")), open: tag(d, "openrun") });
      if (dbs.length < 100) break;
    }
    const candidates = list.filter(c => c.id && !KIDS.test(c.title) && (!c.end || c.end >= todayIso));

    // 2) 이미 받은 것·건너뛸 것
    const freshCut = new Date(Date.now() - FRESH_DAYS * 86400e3).toISOString();
    const existing = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("culture_events").select("id,updated_at").eq("source", SOURCE).range(from, from + 999);
      (data ?? []).forEach((r: { id: string; updated_at: string }) => existing.set(r.id, r.updated_at)); if (!data || data.length < 1000) break;
    }
    const skipped = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("kopis_skip").select("mt20id").gt("checked_at", freshCut).range(from, from + 999);
      (data ?? []).forEach((r: { mt20id: string }) => skipped.add(r.mt20id)); if (!data || data.length < 1000) break;
    }
    const facCut = new Date(Date.now() - FACILITY_DAYS * 86400e3).toISOString();
    const facilities = new Map<string, { name: string; lat: number; lng: number; addr: string; gu: string | null }>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("kopis_facility").select("*").gt("checked_at", facCut).range(from, from + 999);
      (data ?? []).forEach((r: Record<string, unknown>) => facilities.set(String(r.mt10id), r as never)); if (!data || data.length < 1000) break;
    }
    // 다른 출처(서울시·한눈에보는문화정보)와 같은 공연은 넣지 않는다
    const others = ((await supabase.from("culture_events").select("title,lat,lng").in("source", ["서울시 문화행사 정보", "한눈에보는문화정보"])).data ?? []) as { title: string; lat: number; lng: number }[];
    const isDup = (title: string, lat: number, lng: number) => others.some(r => norm(r.title || "") === norm(title) || (Math.abs(r.lat - lat) < 0.003 && Math.abs(r.lng - lng) < 0.0035 && similar(r.title || "", title)));

    const todo = candidates.filter(c => {
      const u = existing.get(`kopis_${c.id}`);
      return o.dry || !((u && u > freshCut) || skipped.has(c.id));
    }).sort((a, b) => (existing.has(`kopis_${a.id}`) ? 1 : 0) - (existing.has(`kopis_${b.id}`) ? 1 : 0));

    // 3) 상세 + 시설
    const stats = { listed: list.length, candidates: candidates.length, todo: todo.length, saved: 0, free: 0, paid: 0, tooExpensive: 0, unknownPrice: 0, kids: 0, noCoord: 0, dup: 0, pending: 0, facilityCalls: 0 };
    const records: Record<string, unknown>[] = [];
    const skipRows: { mt20id: string; reason: string; checked_at: string }[] = [];
    const facRows: Record<string, unknown>[] = [];
    const samples: unknown[] = [];
    const t0 = Date.now();
    // 상세는 5개씩 동시에 받는다 (하나씩 받으면 100초에 160건 정도라 첫 수집이 너무 오래 걸림)
    const PAR = 5;
    let details = new Map<string, string>();
    for (let i = 0; i < todo.length; i++) {
      if (Date.now() - t0 > TIME_BUDGET_MS) { stats.pending = todo.length - i; break; }
      if (i % PAR === 0) {
        const batch = todo.slice(i, i + PAR);
        const got = await Promise.all(batch.map(x => get(`pblprfr/${x.id}`).catch(() => "")));
        details = new Map(batch.map((x, k) => [x.id, got[k]]));
      }
      const c = todo[i];
      const d = blocks(details.get(c.id) ?? "", "db")[0];
      if (!d) continue; // 다음 실행에서 다시
      const skip = (reason: string) => skipRows.push({ mt20id: c.id, reason, checked_at: runStart });
      if (tag(d, "child") === "Y" || /만?\s*[0-7]\s*세\s*이하|어린이|유아/.test(tag(d, "prfage"))) { stats.kids++; skip("어린이 대상"); continue; }
      const fee = unesc(tag(d, "pcseguidance"));
      const { price, rules } = parseFee(fee);
      if (price === null) { stats.unknownPrice++; skip("가격 불명"); continue; }
      const minRule = rules.length ? Math.min(...rules.map(r => r.p)) : Infinity;
      if (price > MAX_PRICE && minRule > MAX_PRICE) { stats.tooExpensive++; skip("가격 상한 초과"); continue; }
      const fid = tag(d, "mt10id");
      let fac = facilities.get(fid);
      if (!fac && fid) {
        stats.facilityCalls++;
        const f = blocks(await get(`prfplc/${fid}`).catch(() => ""), "db")[0];
        if (f) {
          const addr = unesc(tag(f, "adres"));
          fac = { name: unesc(tag(f, "fcltynm")), lat: Number(tag(f, "la")), lng: Number(tag(f, "lo")), addr, gu: (addr.match(/서울(?:특별시|시)?\s*([가-힣]{1,4}구)/) ?? [])[1] ?? null };
          facilities.set(fid, fac);
          facRows.push({ mt10id: fid, ...fac, checked_at: runStart });
        }
      }
      if (!fac || !Number.isFinite(fac.lat) || !Number.isFinite(fac.lng) || !fac.lat) { stats.noCoord++; skip("좌표 없음"); continue; }
      if (isDup(c.title, fac.lat, fac.lng)) { stats.dup++; skip("다른 출처와 중복"); continue; }
      const link = unesc(tag(blocks(d, "relate")[0] ?? "", "relateurl")) || `https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?menuId=MNU_00020&mt20Id=${c.id}`;
      records.push({
        id: `kopis_${c.id}`,
        title: c.title,
        category: "공연",
        raw_category: c.genre,
        place: unesc(tag(d, "fcltynm")) || c.place,
        org_name: unesc(tag(d, "entrpsnm")) || null,
        start_date: c.start,
        end_date: c.end,
        event_time: unesc(tag(d, "dtguidance")) || null,
        price,
        fee_text: fee || null,
        use_target: unesc(tag(d, "prfage")) || null,
        lat: fac.lat,
        lng: fac.lng,
        image_url: https(c.poster),
        homepage_url: link,
        ticket_url: link,
        source: SOURCE,
        benefit_rules: rules,
        place_addr: fac.addr || null,
        gu: fac.gu,
        updated_at: runStart,
      });
      if (price === 0) stats.free++; else if (price <= MAX_PRICE) stats.paid++;
      if (samples.length < 20) samples.push({ title: c.title.slice(0, 30), genre: c.genre, fee: fee.slice(0, 60), price, gu: fac.gu });
    }
    stats.saved = records.length;
    if (o.dry) return Response.json({ ok: true, dry: true, stats, samples });

    // 4) 저장
    for (let i = 0; i < facRows.length; i += 200) { const { error } = await supabase.from("kopis_facility").upsert(facRows.slice(i, i + 200), { onConflict: "mt10id" }); if (error) throw error; }
    for (let i = 0; i < records.length; i += 200) { const { error } = await supabase.from("culture_events").upsert(records.slice(i, i + 200), { onConflict: "id" }); if (error) throw error; }
    for (let i = 0; i < skipRows.length; i += 500) { const { error } = await supabase.from("kopis_skip").upsert(skipRows.slice(i, i + 500), { onConflict: "mt20id" }); if (error) throw error; }
    // 목록에서 빠진(끝났거나 범위를 벗어난) 이 출처 공연만 삭제
    const keep = new Set(candidates.map(c => `kopis_${c.id}`));
    const gone = [...existing.keys()].filter(id => !keep.has(id));
    let deleted = 0;
    for (let i = 0; i < gone.length; i += 200) { const { count, error } = await supabase.from("culture_events").delete({ count: "exact" }).in("id", gone.slice(i, i + 200)); if (error) throw error; deleted += count ?? 0; }
    return Response.json({ ok: true, ...stats, deleted });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
