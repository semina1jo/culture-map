import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const env = {
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.MANUS_API_BROWSER_KEY || "",
  mapsScriptUrl: process.env.MANUS_API_URL && (process.env.MANUS_API_BROWSER_KEY || process.env.GOOGLE_MAPS_API_KEY)
    ? `${process.env.MANUS_API_URL}/v1/maps/proxy/maps/api/js?key=${encodeURIComponent(process.env.MANUS_API_BROWSER_KEY || process.env.GOOGLE_MAPS_API_KEY)}&libraries=geometry`
    : "",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  readOnly: process.env.PREVIEW_READONLY === "1"
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/env.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(`window.__ENV__=${JSON.stringify(env)};`); return;
    }
    if (url.pathname === "/manus-routes.json") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ routes: [{ path: "/", title: "컬처맵" }] })); return;
    }
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = normalize(join(root, requested));
    if (!file.startsWith(root)) { res.writeHead(403); res.end("Forbidden"); return; }
    let body;
    try { body = await readFile(file); }
    catch (_) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch (_) { res.writeHead(500); res.end("Server error"); }
});
server.listen(port, "0.0.0.0", () => console.log(`거지맵 preview listening on ${port}`));
