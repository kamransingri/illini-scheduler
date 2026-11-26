// Illini Scheduler's public HTTP API (#157, #158): the MCP server's answers (mcp/src/answers.ts) over plain HTTP,
// reading the site's JSON from GitHub Pages. It needs no database. The handler only uses web standards (Request,
// Response, fetch), so it runs on Supabase Edge Functions (supabase.ts) and in Node for tests and `npm run dev`.
import { version } from "../../mcp/package.json";
import * as answers from "../../mcp/src/answers";
import { BUILD_ARGS, check, COURSE_OPTIONS, GENED_ARGS, jsonSchema, SEARCH_ARGS } from "../../mcp/src/schemas";
import { remoteSource, SITE_URL, type DataSource } from "../../mcp/src/source";
import { openApi } from "./openapi";
import { fromQuery } from "./query";

export type ApiOptions = {
  /** a prefix every path has, like Supabase's function name ("/api"); it's removed before routing */
  basePath?: string;
  /** the API's public address, for links and the OpenAPI `servers` (default: the request's origin plus basePath) */
  publicUrl?: string;
  /** false when this address has asked too often (limit.ts); no limit when left out */
  limit?: (key: string) => boolean;
};

const SEARCH = "GET /v1/courses?q=";
const DOCS = "https://github.com/kamransingri/illini-scheduler/blob/main/docs/API.md#http-api";
const MAX_BODY = 20_000;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Retry-After" };
// Answers only change when the site rebuilds (nightly), so a client may reuse one for 10 minutes.
const CACHE = { "Cache-Control": "public, max-age=600" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...headers } });
}

function error(status: number, message: string, headers: Record<string, string> = {}): Response {
  return json({ error: { status, message } }, status, headers);
}

function reply(a: answers.Answer): Response {
  return a.ok ? json(a.value, 200, CACHE) : error(a.status, a.message);
}

type Shape = Parameters<typeof check>[0];
/** Checks `input` against the arguments in `shape`, then answers with `run`. */
async function checked<S extends Shape>(shape: S, input: unknown, run: (args: Extract<ReturnType<typeof check<S>>, { ok: true }>["value"]) => Promise<answers.Answer>) {
  const c = check(shape, input);
  return c.ok ? reply(await run(c.value)) : error(400, c.message);
}

type Ctx = { request: Request; url: URL; base: string; asker: answers.Asker; match: RegExpMatchArray };
type Route = { method: "GET" | "POST"; path: RegExp; limited: boolean; run: (c: Ctx) => Response | Promise<Response> };

let query: { search: ReturnType<typeof jsonSchema>; course: ReturnType<typeof jsonSchema>; geneds: ReturnType<typeof jsonSchema> } | null = null;
const queryOf = () => (query ??= { search: jsonSchema(SEARCH_ARGS), course: jsonSchema(COURSE_OPTIONS), geneds: jsonSchema(GENED_ARGS) });

const ROUTES: Route[] = [
  {
    method: "GET",
    path: /^\/$/,
    limited: false,
    run: ({ base }) =>
      json({
        name: "Illini Scheduler API",
        version,
        about: "Read-only answers over Illini Scheduler's public course data for UIUC: the same answers as the site and its MCP server. No key needed; 60 requests a minute per address.",
        openapi: `${base}/v1/openapi.json`,
        docs: DOCS,
        endpoints: ["GET /v1/terms", "GET /v1/courses?q=", "GET /v1/courses/{subject}/{number}", "GET /v1/geneds?gened=", "POST /v1/schedules"],
        site: SITE_URL,
      }),
  },
  { method: "GET", path: /^\/health$/, limited: false, run: () => json({ status: "ok", version }, 200, { "Cache-Control": "no-store" }) },
  { method: "GET", path: /^\/v1\/openapi\.json$/, limited: false, run: ({ base }) => json(openApi(version, base), 200, CACHE) },
  { method: "GET", path: /^\/v1\/terms$/, limited: true, run: async ({ asker }) => reply(await answers.terms(asker)) },
  {
    method: "GET",
    path: /^\/v1\/courses$/,
    limited: true,
    run: ({ url, asker }) => checked(SEARCH_ARGS, fromQuery(url.searchParams, queryOf().search, { q: "query" }), (args) => answers.search(asker, args)),
  },
  {
    method: "GET",
    path: /^\/v1\/courses\/([^/]+)\/([^/]+)$/,
    limited: true,
    run: ({ url, asker, match }) =>
      checked(COURSE_OPTIONS, fromQuery(url.searchParams, queryOf().course), (args) =>
        answers.course(asker, { ...args, course: `${decodeURIComponent(match[1])} ${decodeURIComponent(match[2])}` }),
      ),
  },
  {
    method: "GET",
    path: /^\/v1\/geneds$/,
    limited: true,
    run: ({ url, asker }) => checked(GENED_ARGS, fromQuery(url.searchParams, queryOf().geneds), (args) => answers.geneds(asker, args)),
  },
  {
    method: "POST",
    path: /^\/v1\/schedules$/,
    limited: true,
    run: async ({ request, asker }) => {
      if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY) return error(413, `The request body is over ${MAX_BODY} bytes.`);
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return error(400, `The body must be JSON, like {"courses": ["CS 124", "MATH 231"], "no_classes_before": "9am"}. ${DOCS}`);
      }
      return checked(BUILD_ARGS, body, (args) => answers.schedules(asker, args));
    },
  },
];

/** The address a request comes from, for the rate limit: the first hop of X-Forwarded-For. */
function caller(request: Request): string {
  return request.headers.get("X-Forwarded-For")?.split(",")[0].trim() || request.headers.get("X-Real-IP") || "unknown";
}

/** The API's fetch handler over `sourceFor()`'s data (tests pass the MCP fixtures). */
export function createApi(sourceFor: () => DataSource, { basePath = "", publicUrl, limit }: ApiOptions = {}) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      let path = url.pathname.replace(/(.)\/+$/, "$1");
      if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) path = path.slice(basePath.length) || "/";
      const base = (publicUrl ?? `${url.origin}${basePath}`).replace(/\/+$/, "");
      if (request.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: { ...CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" },
        });
      const at = ROUTES.filter((r) => r.path.test(path));
      if (!at.length) return error(404, `There's no ${url.pathname}. Every endpoint is in ${base}/v1/openapi.json.`);
      const method = request.method === "HEAD" ? "GET" : request.method;
      const route = at.find((r) => r.method === method);
      if (!route) return error(405, `${url.pathname} takes ${at.map((r) => r.method).join(" or ")}.`, { Allow: [...at.map((r) => r.method), "OPTIONS"].join(", ") });
      if (route.limited && limit && !limit(caller(request)))
        return error(429, "Too many requests: each address gets 60 a minute. Wait a minute, or download the JSON files for bulk use (docs/API.md).", { "Retry-After": "60" });
      return route.run({ request, url, base, asker: { src: sourceFor(), search: SEARCH }, match: path.match(route.path)! });
    },
  };
}

// One reader per instance, so each data file is fetched and parsed once per 30 minutes rather than once per request.
let live: { root: string; src: DataSource } | null = null;
/** The site's data (or `dataUrl`'s), read with fetch and cached in memory. */
export function liveSource(dataUrl?: string): DataSource {
  const root = dataUrl || `${SITE_URL}/data`;
  if (live?.root !== root) live = { root, src: remoteSource(root, { userAgent: `illini-scheduler-api/${version}` }) };
  return live.src;
}
