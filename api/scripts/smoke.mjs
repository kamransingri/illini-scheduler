// `npm run smoke` (after `npm run bundle`): the bundle as Supabase loads it, with nothing else installed. It must import
// nothing from Node or npm, answer /api/health, refuse a bad parameter with a 400 and list the MCP tools at /api/mcp,
// all without reading any data.
import { readFileSync } from "node:fs";

const file = new URL("../../supabase/functions/api/bundle.js", import.meta.url);
const imports = [...readFileSync(file, "utf8").matchAll(/^\s*import\s[^;]*?from\s*["']([^"']+)["']/gm)].map((m) => m[1]);
if (imports.length) throw new Error(`bundle.js still imports ${imports.join(", ")}`);

const { default: api } = await import(file);
const health = await api.fetch(new Request("http://localhost/api/health"));
const body = await health.json();
if (health.status !== 200 || body.status !== "ok") throw new Error(`/api/health answered ${health.status} ${JSON.stringify(body)}`);
const bad = await api.fetch(new Request("http://localhost/api/v1/courses?limit=0"));
if (bad.status !== 400) throw new Error(`/api/v1/courses?limit=0 answered ${bad.status}, not 400`);
const mcp = await api.fetch(
  new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Mcp-Protocol-Version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }),
);
const tools = mcp.status === 200 ? (await mcp.json()).result?.tools?.map((t) => t.name) : null;
if (tools?.length !== 5) throw new Error(`/api/mcp tools/list answered ${mcp.status} ${JSON.stringify(tools)}`);
console.log(`ok - bundle.js imports nothing and answers /api/health (version ${body.version}), a 400 and MCP tools/list (${tools.join(", ")})`);
