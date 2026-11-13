// 서울시 문화행사 API → 걸러내기·가공 → culture_events 테이블 저장 (매일 새벽 5시 자동 실행)
// 확인 모드: 본문에 {"dry": true} 를 보내면 저장하지 않고 반경별 건수만 돌려준다.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseFee } from "./fee.ts";
const SOURCE = "서울시 문화행사 정보";

const API_KEY = Deno.env.get("SEOUL_API_KEY") ?? "";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CENTER = { lat: 37.5563, lng: 126.9236 }; // 홍대입구역
const RADIUS_KM = 5; // 2026-11-07: 3km(17건) → 5km(55건)로 확대
const MAX_PRICE = 10000;
const PAGE = 1000;
const KIDS = /영유아|유아|어린이|아동|미취학|초등|키즈/;

type Row = Record<string, string>;

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function distanceKm(lat: number, lng: number): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat - CENTER.lat) * rad, dLng = (lng - CENTER.lng) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(CENTER.lat * rad) * Math.cos(lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toCoord(s: string): number | null {
  const t = (s ?? "").trim();
  return /^\d+\.\d+$/.test(t) ? Number(t) : null;
}

function toPrice(fee: string, isFree: string): number | null {
  const f = (fee ?? "").replace(/,/g, "");
  const nums: number[] = [];
  for (const m of f.matchAll(/(\d+(?:\.\d+)?)\s*만\s*원/g)) nums.push(Math.round(Number(m[1]) * 10000));
  for (const m of f.matchAll(/(\d+)\s*원/g)) nums.push(Number(m[1]));
  if (nums.length === 0) {
    for (const m of f.matchAll(/(?<!\d)(\d{4,6})(?!\d)(?!\s*년)/g)) {
      const v = Number(m[1]);
      if (v < 1900 || v > 2100) nums.push(v);
    }
  }
  if (nums.length) return Math.min(...nums);
  return isFree === "무료" ? 0 : null;
}

function toCategory(code: string): string | null {
  if (code === "전시/미술") return "전시";
  if (code === "교육/체험") return "체험";
  if (code.startsWith("축제")) return "축제";
  if (["클래식", "콘서트", "국악", "연극", "무용", "뮤지컬/오페라", "독주/독창회", "영화"].includes(code)) return "공연";
  return null;
}

async function fetchPage(start: number, end: number) {
  const url = `http://openapi.seoul.go.kr:8088/${API_KEY}/json/culturalEventInfo/${start}/${end}/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`서울시 API HTTP ${res.status}`);
  const json = await res.json();
  const body = json.culturalEventInfo;
  if (!body) throw new Error(`서울시 API 오류: ${JSON.stringify(json.RESULT ?? json)}`);
  return { total: Number(body.list_total_count), rows: (body.row ?? []) as Row[] };
}

async function fetchAll(): Promise<Row[]> {
  const first = await fetchPage(1, PAGE);
  let all = first.rows;
  for (let s = PAGE + 1; s <= first.total; s += PAGE) {
    const { rows } = await fetchPage(s, Math.min(s + PAGE - 1, first.total));
    all = all.concat(rows);
  }
  return all;
}

// 반경별로 각 거르기 단계에서 몇 건이 남는지 센다
function radiusStats(all: Row[], today: string) {
  const radii = [3, 4, 5, 6, 8, 10];
  const out: Record<string, unknown> = {};
  for (const r of radii) {
    const s = { inRadius: 0, afterCategory: 0, afterKids: 0, saved: 0, priceUnknown: 0, priceOver: 0, byCategory: {} as Record<string, number>, free: 0 };
    const ids = new Set<string>();
    for (const row of all) {
      const end = (row.END_DATE ?? "").slice(0, 10);
      if (!end || end < today) continue;
      const lat = toCoord(row.LAT), lng = toCoord(row.LOT);
      if (lat === null || lng === null || distanceKm(lat, lng) > r) continue;
      s.inRadius++;
      const cat = toCategory(row.CODENAME ?? "");
      if (!cat) continue;
      s.afterCategory++;
      if (KIDS.test(`${row.USE_TRGT ?? ""} ${row.TITLE ?? ""}`)) continue;
      s.afterKids++;
      const price = toPrice(row.USE_FEE, row.IS_FREE);
      if (price === null) { s.priceUnknown++; continue; }
      if (price > MAX_PRICE) { s.priceOver++; continue; }
      const id = (row.HMPG_ADDR ?? "").match(/cultcode=(\d+)/)?.[1] ?? `${row.TITLE}|${row.STRTDATE}|${row.PLACE}`;
      if (ids.has(id)) continue;
      ids.add(id);
      s.saved++;
      if (price === 0) s.free++;
      s.byCategory[cat] = (s.byCategory[cat] ?? 0) + 1;
    }
    out[`${r}km`] = s;
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    if (!API_KEY) throw new Error("SEOUL_API_KEY Secret이 없습니다");
    let options: { dry?: boolean } = {};
    try { options = await req.json(); } catch (_) { options = {}; }
    const runStart = new Date().toISOString();
    const today = todayKST();
    const all = await fetchAll();

    if (options.dry) return Response.json({ ok: true, dry: true, fetched: all.length, today, stats: radiusStats(all, today) });

    const records = new Map<string, Record<string, unknown>>();
    for (const r of all) {
      const end = (r.END_DATE ?? "").slice(0, 10);
      if (!end || end < today) continue;
      const lat = toCoord(r.LAT), lng = toCoord(r.LOT);
      if (lat === null || lng === null) continue;
      if (distanceKm(lat, lng) > RADIUS_KM) continue;
      const category = toCategory(r.CODENAME ?? "");
      if (!category) continue;
      if (KIDS.test(`${r.USE_TRGT ?? ""} ${r.TITLE ?? ""}`)) continue;
      const { price, rules } = parseFee(r.USE_FEE, r.IS_FREE);
      if (price === null) continue;
      const minRule = rules.length ? Math.min(...rules.map(x => x.p)) : Infinity;
      // 일반 가격이 만 원 이하이거나, 혜택가로 만 원 이하가 되는 행사만 저장
      if (price > MAX_PRICE && minRule > MAX_PRICE) continue;

      const id = (r.HMPG_ADDR ?? "").match(/cultcode=(\d+)/)?.[1] ??
        `${r.TITLE}|${r.STRTDATE}|${r.PLACE}`;
      records.set(id, {
        id,
        title: r.TITLE,
        category,
        raw_category: r.CODENAME,
        place: r.PLACE,
        org_name: r.ORG_NAME,
        start_date: (r.STRTDATE ?? "").slice(0, 10) || null,
        end_date: end,
        event_time: r.PRO_TIME || null,
        price,
        fee_text: r.USE_FEE || null,
        use_target: r.USE_TRGT || null,
        lat,
        lng,
        image_url: r.MAIN_IMG || null,
        homepage_url: r.HMPG_ADDR || null,
        ticket_url: r.ORG_LINK || null,
        source: SOURCE,
        benefit_rules: rules,
        updated_at: runStart,
      });
    }

    const list = [...records.values()];
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await supabase.from("culture_events").upsert(list.slice(i, i + 500), { onConflict: "id" });
      if (error) throw error;
    }

    const { count, error: delErr } = await supabase
      .from("culture_events")
      .delete({ count: "exact" })
      .eq("source", SOURCE)
      .lt("updated_at", runStart);
    if (delErr) throw delErr;

    return Response.json({ ok: true, fetched: all.length, saved: list.length, deleted: count ?? 0 });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
