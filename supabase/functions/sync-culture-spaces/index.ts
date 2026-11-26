// 서울시 문화공간 정보(culturalSpaceInfo, 서울 열린데이터광장) → 상설 시설로 culture_events에 저장
// 2026-11-16: 서울 전역 상설 시설 확장. 박물관·기념관, 미술관·갤러리, 기타(복합문화공간)는 '전시',
//   도서관은 새 분류 '무료 공간'으로 넣는다. 공연장·문화예술회관은 '공연이 있을 때 가는 곳'이라 행사 API가 맡고, 문화원은 제외.
// 본문 {"dry": true} → 저장하지 않고 건수·예시만 / {"libraries": false} → 도서관 빼기
// 필요한 Secret: SEOUL_API_KEY (서울시 문화행사 정보와 같은 키)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseFee } from "./fee.ts";

const KEY = Deno.env.get("SEOUL_API_KEY") ?? "";
const SOURCE = "상설 시설(서울시 문화공간)";
const MAX_PRICE = 30000; // 2026-11-26: 만 원 → 3만 원 (앱 필터 최대값과 같게)
const BASE_SUBJ = ["박물관/기념관", "미술관/갤러리", "기타"];
const LIBRARY = "도서관";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Row = Record<string, string>;
const inSeoul = (lat: number, lng: number) => lat >= 37.42 && lat <= 37.71 && lng >= 126.76 && lng <= 127.19;
const strip = (s: string) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const norm = (s: string) => String(s ?? "").replace(/\([^)]*\)/g, "").replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
// "정보없음", "홈페이지 참조"처럼 쓸모없는 휴관일 문구는 버린다
const JUNK = /^(정보\s*없음|개별\s*확인|홈페이지\s*참조|별도\s*확인|-|없음\s*\(?확인 필요\)?)$/;
// 금액 대신 "전시별 상이"처럼 적힌 경우: 유료 표시면 가격을 모르는 것으로 본다
const VARIES = /상이|별도|문의|다름|변동/;

function hoursText(r: Row): string | null {
  const open = strip(r.OPENHOUR);
  let close = strip(r.CLOSEDAY);
  if (/^(없음|연중\s*무휴|무휴)$/.test(close)) close = "연중무휴";
  if (JUNK.test(close)) close = "";
  const parts = [open, close ? `휴관 ${close}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function priceOf(r: Row): { price: number | null; rules: ReturnType<typeof parseFee>["rules"] } {
  const fee = strip(r.ENTR_FEE);
  const free = strip(r.ENTRFREE);
  if (!fee || /^(0|없음|무료)$/.test(fee)) return free === "유료" ? { price: null, rules: [] } : { price: 0, rules: [] };
  if (VARIES.test(fee) && !/\d/.test(fee)) return free === "무료" ? { price: 0, rules: [] } : { price: null, rules: [] };
  // 이 API는 "성인 6,000원 학생 5,000원 10인 이상 단체 1,000원 할인"처럼 구분자 없이 이어 쓰는 경우가 많아
  // 대상 낱말 앞에서 끊고, 단체 할인 문구는 버린 뒤 공통 요금 해석기에 넘긴다
  const split = fee
    .replace(/[｜|]/g, " / ")
    .replace(/(\d+\s*(인|명)\s*이상\s*)?단체[^/]*/g, " ")
    .replace(/(?<![가-힣~(·])(대학생|대학원생|성인|어른|일반|개인|청소년|학생|어린이|유아|경로|군인|장애인?|국가유공자)/g, " / $1");
  const parsed = parseFee(split, free);
  if (parsed.price === null || parsed.price === 0) return parsed;
  // 대표 가격은 어른 요금으로 잡는다: '성인·어른·일반·개인' 금액이 있으면 그것, 없으면 가장 비싼 금액
  // ("25세-64세 10,000원, 9세-24세 7,000원"처럼 나이 구간만 적힌 경우 가장 싼 값을 잡으면 실제보다 싸 보인다)
  const nums = (t: string) => [...t.matchAll(/(\d{1,3}(?:,\d{3})+|\d{3,6})\s*원?/g)].map(m => Number(m[1].split(",").join(""))).filter(v => v >= 100 && (v < 1900 || v > 2100));
  const adultSeg = split.split("/").find(seg => /(성인|어른|일반|개인)/.test(seg) && nums(seg).length);
  const all = split.split("/").flatMap(seg => /(별도|체험비)/.test(seg) ? [] : nums(seg));
  const price = adultSeg ? Math.min(...nums(adultSeg)) : all.length ? Math.max(...all) : parsed.price;
  return { price, rules: parsed.rules.filter(rule => rule.p < price) };
}

async function fetchAll(): Promise<Row[]> {
  const all: Row[] = [];
  for (let s = 1; s <= 5000; s += 1000) {
    const res = await fetch(`http://openapi.seoul.go.kr:8088/${KEY}/json/culturalSpaceInfo/${s}/${s + 999}/`);
    if (!res.ok) throw new Error(`서울시 API HTTP ${res.status}`);
    const body = (await res.json()).culturalSpaceInfo;
    if (!body) throw new Error("서울시 문화공간 API 응답 오류");
    const rows = (body.row ?? []) as Row[];
    all.push(...rows);
    if (all.length >= Number(body.list_total_count) || rows.length < 1000) break;
  }
  return all;
}

Deno.serve(async (req) => {
  try {
    if (!KEY) throw new Error("SEOUL_API_KEY Secret이 없습니다");
    let o: { dry?: boolean; libraries?: boolean } = {};
    try { o = await req.json(); } catch (_) { o = {}; }
    const subjects = new Set(o.libraries === false ? BASE_SUBJ : [...BASE_SUBJ, LIBRARY]);
    const runStart = new Date().toISOString();
    const all = await fetchAll();

    // 이미 손으로 넣어 둔 상설 시설(서울문화포털·국가유산청)과 겹치면 그쪽을 남긴다
    const { data: curated } = await supabase.from("culture_events").select("title,lat,lng").like("source", "상설 시설%").neq("source", SOURCE);
    const curatedRows = curated ?? [];
    const isCurated = (name: string, lat: number, lng: number) => curatedRows.some(c => {
      const a = norm(c.title), b = norm(name);
      if (a && (a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b)))) return true;
      return Math.abs(c.lat - lat) < 0.0009 && Math.abs(c.lng - lng) < 0.0011 && (a.slice(0, 3) === b.slice(0, 3));
    });

    const stats: Record<string, number> = { fetched: all.length, wrongSubject: 0, noCoord: 0, unknownPrice: 0, tooExpensive: 0, curatedDup: 0, saved: 0, free: 0, paid: 0, withHours: 0 };
    const bySubj: Record<string, number> = {};
    const records = new Map<string, Record<string, unknown>>();
    const samples: unknown[] = [];
    for (const r of all) {
      const subj = strip(r.SUBJCODE);
      if (!subjects.has(subj)) { stats.wrongSubject++; continue; }
      // 이 API는 X_COORD에 위도, Y_COORD에 경도가 들어 있다
      const lat = Number(r.X_COORD), lng = Number(r.Y_COORD);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inSeoul(lat, lng)) { stats.noCoord++; continue; }
      const name = strip(r.FAC_NAME);
      // 공공 도서관은 입장이 무료다(이 API의 요금 칸은 도서관 행사 요금이 섞여 있어 쓰지 않는다)
      const isLib = subj === LIBRARY;
      // 대학 도서관은 외부인 출입이 막힌 곳이 많아 뺀다
      if (isLib && /대학교|대학원|대학\s*도서관/.test(name)) { stats.wrongSubject++; continue; }
      const { price, rules } = isLib ? { price: 0, rules: [] } : priceOf(r);
      if (price === null) { stats.unknownPrice++; continue; }
      if (price > MAX_PRICE) { stats.tooExpensive++; continue; }
      if (isCurated(name, lat, lng)) { stats.curatedDup++; continue; }
      const gu = strip(r.GNGU) || null;
      const id = `space_${norm(name).slice(0, 40)}_${gu ?? ""}`;
      const hours = hoursText(r);
      const fee = strip(r.ENTR_FEE);
      records.set(id, {
        id,
        title: name,
        category: isLib ? "무료 공간" : "전시",
        raw_category: `상설 · ${subj}`,
        place: name,
        org_name: null,
        start_date: null,
        end_date: null,
        event_time: hours,
        price,
        fee_text: isLib ? "무료" : fee && !/^(0|없음)$/.test(fee) ? fee : (price === 0 ? "무료" : null),
        use_target: null,
        lat,
        lng,
        image_url: strip(r.MAIN_IMG) || null,
        homepage_url: strip(r.HOMEPAGE) || null,
        ticket_url: null,
        source: SOURCE,
        benefit_rules: rules,
        place_addr: strip(r.ADDR) || null,
        gu,
        updated_at: runStart,
      });
      bySubj[subj] = (bySubj[subj] ?? 0) + 1;
      if (price === 0) stats.free++; else stats.paid++;
      if (strip(r.OPENHOUR)) stats.withHours++;
      if (samples.length < 25 && (price > 0 || samples.length < 10)) samples.push({ name, subj, gu, price, fee: fee.slice(0, 60), hours: hours?.slice(0, 70) });
    }
    const list = [...records.values()];
    stats.saved = list.length;
    if (o.dry) return Response.json({ ok: true, dry: true, stats, bySubj, samples });

    for (let i = 0; i < list.length; i += 300) {
      const { error } = await supabase.from("culture_events").upsert(list.slice(i, i + 300), { onConflict: "id" });
      if (error) throw error;
    }
    // 이번 목록에서 빠진 '이 출처' 시설만 지운다 (다른 출처는 건드리지 않음)
    const { count, error: delErr } = await supabase.from("culture_events").delete({ count: "exact" }).eq("source", SOURCE).lt("updated_at", runStart);
    if (delErr) throw delErr;
    return Response.json({ ok: true, ...stats, bySubj, deleted: count ?? 0 });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
