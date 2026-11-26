import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const out = join(process.cwd(), "dist");
await mkdir(out, { recursive: true });
await cp("index.html", join(out, "index.html"));
await cp("src", join(out, "src"), { recursive: true });
await cp("public", out, { recursive: true });
const env = { googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.MANUS_API_BROWSER_KEY || "", mapsScriptUrl: process.env.MANUS_API_URL && process.env.MANUS_API_BROWSER_KEY ? `${process.env.MANUS_API_URL}/v1/maps/proxy/maps/api/js?key=${encodeURIComponent(process.env.MANUS_API_BROWSER_KEY)}&libraries=geometry` : "", SUPABASE_URL: process.env.SUPABASE_URL || "", SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  // Vercel 미리보기(브랜치) 배포에서는 원본 데이터를 지키기 위해 저장을 막는다. 정식 배포(main)는 영향 없음
  readOnly: process.env.VERCEL_ENV === "preview" || process.env.PREVIEW_READONLY === "1" };
await writeFile(join(out, "env.js"), `window.__ENV__=${JSON.stringify(env)};\n`);
let html = await readFile(join(out, "index.html"), "utf8");
html = html.replace("/env.js", "/env.js");
await writeFile(join(out, "index.html"), html);
console.log(`built ${out}`);
