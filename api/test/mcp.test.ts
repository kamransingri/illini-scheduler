import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dataSource } from "../../mcp/src/data";
import { createServer } from "../../mcp/src/server";
import { createApi } from "../src/index";

// The hosted MCP endpoint (#102) against the local server (mcp/src/server.ts over memory), on the MCP fixtures.
const DATA = path.join(import.meta.dirname, "..", "..", "mcp", "test", "fixtures", "data");
const logged: { mcp_tool: string }[] = [];
const api = createApi(() => dataSource(DATA), { log: (e) => logged.push(e) });
const viaApi: typeof fetch = (url, init) => api.fetch(new Request(url, init));

const text = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;

describe("POST /mcp, the hosted MCP endpoint", () => {
  const hosted = new Client({ name: "test", version: "0" });
  const local = new Client({ name: "test", version: "0" });
  beforeAll(async () => {
    await hosted.connect(new StreamableHTTPClientTransport(new URL("https://api.test/mcp"), { fetch: viaApi }));
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer(dataSource(DATA)).connect(a);
    await local.connect(b);
  });
  afterAll(async () => {
    await hosted.close();
    await local.close();
  });

  it("lists the same five read-only tools as the local server", async () => {
    const [h, l] = await Promise.all([hosted.listTools(), local.listTools()]);
    expect(h.tools.map((t) => t.name)).toEqual(["term_info", "search_courses", "get_course", "find_geneds", "build_schedules"]);
    expect(h.tools).toEqual(l.tools);
    expect(hosted.getInstructions()).toBe(local.getInstructions());
  });

  it.each([
    ["term_info", {}],
    ["search_courses", { query: "cs 124", limit: 1 }],
    ["search_courses", { min_gpa: 7 }],
    ["get_course", { course: "MATH 231", lectures_only: true }],
    ["get_course", { course: "CS 999" }],
    ["find_geneds", { gened: ["QR1"], limit: 2 }],
    ["build_schedules", { courses: ["cs124", "STAT 100"], no_classes_before: "10am", limit: 2 }],
    ["build_schedules", { courses: ["ADV 283", "CS 999", "intro to cs"] }],
    ["build_schedules", { courses: ["CS 124"], locked_crns: ["123"] }],
  ])("%s %j answers as the local server does", async (name, args) => {
    const [h, l] = await Promise.all([hosted.callTool({ name, arguments: args }), local.callTool({ name, arguments: args })]);
    expect(h).toEqual(l);
    expect(text(h).length).toBeGreaterThan(0);
  });

  it("counts tool calls by name only, never their arguments", async () => {
    logged.length = 0;
    await hosted.callTool({ name: "search_courses", arguments: { query: "a very private question" } });
    expect(logged).toEqual([{ mcp_tool: "search_courses" }]);
    expect(JSON.stringify(logged)).not.toContain("private");
  });
});

describe("serving /mcp", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is stateless: GET (no server-sent stream) and DELETE (no sessions) get a 405", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await api.fetch(new Request("https://api.test/mcp", { method, headers: { Accept: "text/event-stream" } }));
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
    }
  });

  it("lets browser-based AI apps call it (CORS) and limits each address", async () => {
    const pre = await api.fetch(new Request("https://api.test/mcp", { method: "OPTIONS" }));
    expect(pre.headers.get("Access-Control-Allow-Headers")).toContain("Mcp-Protocol-Version");
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-Forwarded-For": "203.0.113.9" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } }),
    };
    const res = await api.fetch(new Request("https://api.test/mcp", init));
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await res.json()).result.serverInfo.name).toBe("illini-scheduler");
    const limited = createApi(() => dataSource(DATA), { limit: () => false });
    expect((await limited.fetch(new Request("https://api.test/mcp", init))).status).toBe(429);
  });

  it("works under Supabase's /api prefix", async () => {
    vi.stubGlobal("Deno", { env: { get: (name: string) => ({ SUPABASE_URL: "https://abcd.supabase.co" })[name] } });
    vi.resetModules();
    const { default: fn } = await import("../src/supabase");
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL("https://abcd.supabase.co/api/mcp"), { fetch: (url, init) => fn.fetch(new Request(url, init)) }));
    expect((await client.listTools()).tools).toHaveLength(5);
    expect((await (await fn.fetch(new Request("https://abcd.supabase.co/api"))).json()).mcp).toBe("https://abcd.supabase.co/functions/v1/api/mcp");
    await client.close();
  });
});
