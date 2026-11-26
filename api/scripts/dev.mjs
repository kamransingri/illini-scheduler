// `npm run dev`: the bundled function (supabase/functions/api/bundle.js) on http://localhost:8787, in Node, without
// Docker or the Supabase CLI. Paths are as on Supabase, after /functions/v1: http://localhost:8787/api/v1/terms.
// DATA_URL=<url> reads another copy of the data (a local `make data` export served over HTTP, say).
import { createServer } from "node:http";

if (process.env.DATA_URL) globalThis.Deno = { env: { get: (name) => process.env[name] } };
const { default: api } = await import("../../supabase/functions/api/bundle.js");
const port = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : body });
  const response = await api.fetch(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`Illini Scheduler API on http://localhost:${port}/api/ (Ctrl+C to stop)`));
