// `npm run smoke` (after `npm run bundle`): the bundle as Supabase loads it, with nothing else installed. It must import
// nothing from Node or npm, answer /api/health, and refuse a bad parameter with a 400, without reading any data.
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
console.log(`ok - bundle.js imports nothing and answers /api/health (version ${body.version}) and a 400`);
