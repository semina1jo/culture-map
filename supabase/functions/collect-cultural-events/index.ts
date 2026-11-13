// @ts-nocheck
// Supabase Edge Function 초안
// 현재는 실행하지 않는다. SEOUL_API_KEY는 브라우저가 아니라 Edge Function secret으로 주입한다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OA_SERVICE = "culturalEventInfo";
const PAGE_SIZE = 1000;
const SEOUL_LAT = { min: 37, max: 38 };
const SEOUL_LNG = { min: 126, max: 128 };

function numberOrNull(value: unknown): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function extractAmounts(text: unknown) {
  const source = String(text ?? "").replace(/,/g, "");
  const amounts: number[] = [];
  for (const match of source.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*만\s*원/g)) amounts.push(Math.round(Number(match[1]) * 10000));
  for (const match of source.matchAll(/([0-9]{3,8})\s*원/g)) amounts.push(Number(match[1]));
  return amounts.filter(Number.isFinite);
}
function parseFee(isFree: unknown, fee: unknown) {
  const text = String(fee ?? "").trim();
  if (String(isFree ?? "").includes("무료") || text === "무료" || /^무료(?:\s|$)/.test(text)) return { price_min: 0, price_label: "무료" };
  const amounts = extractAmounts(text);
  if (!amounts.length) return { price_min: null, price_label: "가격 확인" };
  const min = Math.min(...amounts);
  return { price_min: min, price_label: amounts.length > 1 ? `${min.toLocaleString("ko-KR")}원~` : `${min.toLocaleString("ko-KR")}원` };
}
const GENRE4_MAP: Record<string, string> = { 전시:"전시", 미술:"전시", 공연:"공연", 음악:"공연", 체험:"체험", 교육:"체험", 축제:"축제", 행사:"축제" };

function normalizeCoordinates(latValue: unknown, lotValue: unknown) {
  let lat = numberOrNull(latValue);
  let lng = numberOrNull(lotValue);
  const valid = (a: number | null, b: number | null) =>
    a !== null && b !== null && a >= SEOUL_LAT.min && a <= SEOUL_LAT.max && b >= SEOUL_LNG.min && b <= SEOUL_LNG.max;
  if (!valid(lat, lng) && valid(lng, lat)) [lat, lng] = [lng, lat];
  return valid(lat, lng) ? { lat, lng } : { lat: null, lng: null };
}

function normalizeRow(row: Record<string, unknown>) {
  const coord = normalizeCoordinates(row.LAT, row.LOT);
  const fee = parseFee(row.IS_FREE, row.USE_FEE);
  return {
    id: String(row.ORG_LINK || row.HMPG_ADDR || `${row.TITLE || "event"}-${row.STRTDATE || ""}`),
    codename: row.CODENAME ?? null,
    guname: row.GUNAME ?? null,
    title: row.TITLE ?? "",
    date: row.DATE ?? null,
    place: row.PLACE ?? null,
    org_name: row.ORG_NAME ?? null,
    use_trgt: row.USE_TRGT ?? null,
    use_fee: row.USE_FEE ?? null,
    is_free: row.IS_FREE ?? null,
    main_img: row.MAIN_IMG ?? null,
    strtdate: row.STRTDATE ?? null,
    end_date: row.END_DATE ?? null,
    org_link: row.ORG_LINK ?? null,
    hmpg_addr: row.HMPG_ADDR ?? null,
    lat: coord.lat,
    lot: coord.lng,
    price_min: fee.price_min,
    price_label: fee.price_label,
    genre4: GENRE4_MAP[String(row.CODENAME || "")] || "기타",
    is_sample: false,
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("POST only", { status: 405 });
  const apiKey = Deno.env.get("SEOUL_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey || !supabaseUrl || !serviceRoleKey) return Response.json({ error: "missing server secrets" }, { status: 500 });

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const end = Number((await request.json().catch(() => ({}))).end ?? PAGE_SIZE);
  const url = `https://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/${OA_SERVICE}/1/${Math.max(1, Math.min(end, PAGE_SIZE))}`;
  const upstream = await fetch(url);
  if (!upstream.ok) return Response.json({ error: `Seoul API ${upstream.status}` }, { status: 502 });
  const body = await upstream.json();
  const rows = body?.[OA_SERVICE]?.row ?? [];
  const events = rows.map(normalizeRow).filter((row: Record<string, unknown>) => row.title && row.lat !== null && row.lot !== null);
  const { error } = await supabase.from("cultural_events").upsert(events, { onConflict: "id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ service: OA_SERVICE, received: rows.length, saved: events.length });
});
