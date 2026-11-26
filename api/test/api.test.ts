import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { version } from "../../mcp/package.json";
import { dataSource } from "../../mcp/src/data";
import { createServer } from "../../mcp/src/server";
import { createApi } from "../src/index";
import { memoryLimiter } from "../src/limit";

// The MCP server's test data (mcp/test/fixtures): Spring 2027 as the next term, CS 124, MATH 231, STAT 100, PSYC 100,
// ADV 250 (once ADV 283), and the search and gen-ed indexes.
const DATA = path.join(import.meta.dirname, "..", "..", "mcp", "test", "fixtures", "data");
const api = createApi(() => dataSource(DATA));
const get = (p: string, init?: RequestInit) => api.fetch(new Request(`https://api.test${p}`, init));
const post = (p: string, body: unknown) => get(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("the same answers as the MCP tools", () => {
  const client = new Client({ name: "test", version: "0" });
  beforeAll(async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer(dataSource(DATA)).connect(a);
    await client.connect(b);
  });
  afterAll(() => client.close());
  const tool = async (name: string, args: Record<string, unknown>) => JSON.parse(((await client.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0].text);

  it.each([
    ["/v1/terms", "term_info", {}],
    ["/v1/courses?q=cs%20124&limit=3", "search_courses", { query: "cs 124", limit: 3 }],
    ["/v1/courses?gened=QR1&credits=3&offered=next&sort=gpa", "search_courses", { gened: ["QR1"], credits: 3, offered: "next", sort: "gpa" }],
    ["/v1/courses?gened=QR1&gened=SBS", "search_courses", { gened: ["QR1", "SBS"] }],
    ["/v1/courses/CS/124", "get_course", { course: "CS 124" }],
    ["/v1/courses/cs/124?lectures_only=true&max_sections=3", "get_course", { course: "CS 124", lectures_only: true, max_sections: 3 }],
    ["/v1/courses/ADV/283", "get_course", { course: "ADV 283" }],
    ["/v1/geneds?gened=QR1&limit=2", "find_geneds", { gened: ["QR1"], limit: 2 }],
    ["/v1/geneds?open_only=false&min_gpa_students=0&two_or_more_categories=1&sort=pctA", "find_geneds", { open_only: false, min_gpa_students: 0, two_or_more_categories: true, sort: "pctA" }],
  ])("GET %s = %s", async (p, name, args) => {
    const res = await get(p);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(await tool(name, args));
    expect(body.data.built_at).toBe("2026-11-19T05:05:22+00:00");
    expect(body.data.note).toMatch(/Unofficial data/);
  });

  it("POST /v1/schedules = build_schedules", async () => {
    const args = { courses: ["cs124", "STAT 100"], no_classes_before: "10am", days_off: ["F"], what_matters: { preset: "sleep" }, limit: 2 };
    const res = await post("/v1/schedules", args);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(await tool("build_schedules", args));
    expect(body.schedules.length).toBeGreaterThan(0);
    expect(body.schedules[0].open_on_site).toMatch(/^https:\/\/kamransingri\.github\.io\/illini-scheduler\/schedule\//);
  });
});

describe("errors say what to fix", () => {
  const message = async (res: Response) => ((await res.json()) as { error: { status: number; message: string } }).error;

  it("refuses unknown, missing and out-of-range parameters with 400", async () => {
    let res = await get("/v1/courses?qq=cs");
    expect(res.status).toBe(400);
    expect((await message(res)).message).toMatch(/qq/);
    res = await get("/v1/courses?credits=three");
    expect(res.status).toBe(400);
    expect((await message(res)).message).toMatch(/credits/);
    res = await get("/v1/geneds?limit=500");
    expect((await message(res)).message).toMatch(/limit/);
    res = await post("/v1/schedules", { courses: [] });
    expect(res.status).toBe(400);
    res = await post("/v1/schedules", { courses: ["CS 124"], locked_crns: ["123"] });
    expect((await message(res)).message).toMatch(/locked_crns/);
    res = await get("/v1/schedules", { method: "POST", body: "not json", headers: { "Content-Type": "application/json" } });
    expect((await message(res)).message).toMatch(/must be JSON/);
  });

  it("404s an unknown course or endpoint, pointing to the search", async () => {
    let res = await get("/v1/courses/CS/999");
    expect(res.status).toBe(404);
    expect((await message(res)).message).toMatch(/No course CS 999.*GET \/v1\/courses\?q=/);
    res = await get("/v1/nope");
    expect(res.status).toBe(404);
    expect((await message(res)).message).toMatch(/openapi\.json/);
    res = await post("/v1/schedules", { courses: ["CS 999"] });
    expect(res.status).toBe(400);
    expect((await message(res)).message).toMatch(/CS 999/);
  });

  it("405s the wrong method, naming the right one", async () => {
    const res = await get("/v1/schedules");
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("502s when the site's data can't be read", async () => {
    const down = createApi(() => ({ root: "https://down.test/data", site: "https://down.test", read: () => Promise.reject(new Error("HTTP 503")) }));
    const res = await down.fetch(new Request("https://api.test/v1/terms"));
    expect(res.status).toBe(502);
    expect((await message(res)).message).toMatch(/down\.test.*503/);
  });
});

describe("serving", () => {
  it("/health answers without reading data or counting against the limit", async () => {
    const limit = vi.fn(() => false);
    const res = await createApi(() => dataSource(DATA), { limit }).fetch(new Request("https://api.test/health"));
    expect(await res.json()).toEqual({ status: "ok", version });
    expect(limit).not.toHaveBeenCalled();
  });

  it("limits each address and says when to retry", async () => {
    const limit = vi.fn((key: string) => key !== "203.0.113.9");
    const limited = createApi(() => dataSource(DATA), { limit });
    const from = (ip: string) => limited.fetch(new Request("https://api.test/v1/terms", { headers: { "X-Forwarded-For": `${ip}, 10.0.0.1` } }));
    expect((await from("198.51.100.1")).status).toBe(200);
    const res = await from("203.0.113.9");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(limit).toHaveBeenLastCalledWith("203.0.113.9");
  });

  it("counts 60 a minute per address in memory", () => {
    let t = 0;
    const ok = memoryLimiter(60, 60_000, () => t, 3);
    for (let i = 0; i < 60; i++) expect(ok("a")).toBe(true);
    expect(ok("a")).toBe(false);
    expect(ok("b")).toBe(true);
    t = 60_000;
    expect(ok("a")).toBe(true);
    ok("c");
    ok("d"); // a fourth address: the expired ones go first
    expect(ok("d")).toBe(true);
  });

  it("lets any site call it (CORS) and caches answers for 10 minutes", async () => {
    const pre = await get("/v1/schedules", { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(pre.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    const res = await get("/v1/terms/");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("describes every endpoint and parameter in /v1/openapi.json", async () => {
    const doc = await (await get("/v1/openapi.json")).json();
    expect(doc.servers).toEqual([{ url: "https://api.test" }]);
    expect(Object.keys(doc.paths)).toEqual(["/v1/terms", "/v1/courses", "/v1/courses/{subject}/{number}", "/v1/geneds", "/v1/schedules"]);
    const names = (p: string) => doc.paths[p].get.parameters.map((x: { name: string }) => x.name);
    expect(names("/v1/courses")).toEqual(["q", "subject", "gened", "credits", "min_gpa", "offered", "sort", "limit"]);
    expect(names("/v1/courses/{subject}/{number}")).toEqual(["subject", "number", "term", "lectures_only", "max_sections"]);
    expect(doc.paths["/v1/schedules"].post.requestBody.content["application/json"].schema.required).toEqual(["courses"]);
    const index = await (await get("/")).json();
    expect(index.openapi).toBe("https://api.test/v1/openapi.json");
  });
});

describe("the Supabase Edge Function (src/supabase.ts)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("serves under /api, links its public address and reads DATA_URL once per file", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const file = String(url).replace("https://pages.test/site/data/", "");
      return new Response(await readFile(path.join(DATA, file), "utf8"), { headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchFn);
    const vars: Record<string, string> = { SUPABASE_URL: "https://abcd.supabase.co", DATA_URL: "https://pages.test/site/data" };
    vi.stubGlobal("Deno", { env: { get: (name: string) => vars[name] } });
    const { default: fn } = await import("../src/supabase");
    // Supabase passes the path after /functions/v1, starting with the function's name
    const at = (p: string) => fn.fetch(new Request(`https://abcd.supabase.co/api${p}`));

    const res = await at("/v1/courses/STAT/100");
    expect(res.status).toBe(200);
    expect((await res.json()).links.page).toBe("https://pages.test/site/course/STAT/100/");
    await at("/v1/courses/STAT/100");
    expect(fetchFn.mock.calls.map(([u]) => String(u)).sort()).toEqual(["https://pages.test/site/data/course/STAT/100.json", "https://pages.test/site/data/meta.json"]);
    expect(fetchFn.mock.calls[0][1]?.headers).toEqual({ "User-Agent": `illini-scheduler-api/${version}` });

    expect((await (await at("/v1/openapi.json")).json()).servers).toEqual([{ url: "https://abcd.supabase.co/functions/v1/api" }]);
    expect((await (await at("")).json()).openapi).toBe("https://abcd.supabase.co/functions/v1/api/v1/openapi.json");
    expect((await at("/health")).status).toBe(200);
  });
});
