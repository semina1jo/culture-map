// 서울시 역사마스터 정보(subwayStationMaster, 서울 열린데이터광장) → subway_stations
// 2026-11-27: 장소 상세의 '가까운 역' 표시용. 역 수가 거의 안 바뀌어 가끔 한 번 돌리면 된다
// 본문 {"dry": true} → 저장하지 않고 건수·노선 목록만 돌려준다
// 필요한 Secret: SEOUL_API_KEY (서울시 문화행사 정보와 같은 키)
import { createClient } from "jsr:@supabase/supabase-js@2";

const KEY = Deno.env.get("SEOUL_API_KEY") ?? "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
type Row = Record<string, string>;

async function fetchAll(): Promise<Row[]> {
  const out: Row[] = [];
  for (let s = 1; s < 5000; s += 1000) {
    const res = await fetch(`http://openapi.seoul.go.kr:8088/${KEY}/json/subwayStationMaster/${s}/${s + 999}/`);
    const json = await res.json();
    const body = json.subwayStationMaster;
    if (!body) { if (s === 1) throw new Error(`API 응답 오류: ${JSON.stringify(json.RESULT ?? json).slice(0, 200)}`); break; }
    out.push(...(body.row ?? []));
    if (out.length >= Number(body.list_total_count ?? 0)) break;
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    if (!KEY) throw new Error("SEOUL_API_KEY Secret이 없습니다");
    const opts = await req.json().catch(() => ({}));
    const raw = await fetchAll();
    const rows = raw.map(r => ({
      id: String(r.BLDN_ID ?? "").trim(),
      name: String(r.BLDN_NM ?? "").trim(),
      line: String(r.ROUTE ?? "").trim(),
      lat: Number(r.LAT), lng: Number(r.LOT),
      updated_at: new Date().toISOString(),
    })).filter(r => r.id && r.name && r.line && Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.lat > 33 && r.lat < 39);
    const lines = [...new Set(rows.map(r => r.line))].sort();
    if (opts.dry) return Response.json({ fetched: raw.length, valid: rows.length, lines, sample: rows.slice(0, 3) });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("subway_stations").upsert(rows.slice(i, i + 500), { onConflict: "id" });
      if (error) throw error;
    }
    return Response.json({ saved: rows.length, lines });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
});
