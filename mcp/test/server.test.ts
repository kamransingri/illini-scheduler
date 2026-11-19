import { existsSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dataSource, NotFound } from "../src/data";
import { createServer } from "../src/server";

const DATA = path.join(import.meta.dirname, "fixtures", "data");
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);
const json = (r: unknown) => JSON.parse(text(r));

describe("data source", () => {
  it("caches each file until it's stale and retries a failed read", async () => {
    let t = 0;
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("missing.json") ? new Response("", { status: 404 }) : String(url).endsWith("down.json") ? new Response("", { status: 503 }) : Response.json({ url: String(url) }),
    );
    const src = dataSource("https://example.test/site/data/", { ttlMs: 1000, fetchFn, now: () => t });
    expect(src.site).toBe("https://example.test/site");
    expect(await src.read("meta.json")).toEqual({ url: "https://example.test/site/data/meta.json" });
    await src.read("meta.json");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    t = 1001;
    await src.read("meta.json");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await expect(src.read("missing.json")).rejects.toBeInstanceOf(NotFound);
    await expect(src.read("down.json")).rejects.toThrow("HTTP 503");
    await expect(src.read("down.json")).rejects.toThrow("HTTP 503");
    expect(fetchFn).toHaveBeenCalledTimes(5); // failures aren't cached
  });

  it("reads a local folder", async () => {
    const src = dataSource(DATA);
    expect((await src.read<{ next_term: string }>("meta.json")).next_term).toBe("2027-sp");
    await expect(src.read("course/XX/999.json")).rejects.toBeInstanceOf(NotFound);
  });
});

describe("MCP server", () => {
  const client = new Client({ name: "test", version: "0" });
  beforeAll(async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer(dataSource(DATA)).connect(a);
    await client.connect(b);
  });
  afterAll(() => client.close());

  it("lists five read-only tools with descriptions", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["term_info", "search_courses", "get_course", "find_geneds", "build_schedules"]);
    for (const t of tools) {
      expect(t.description!.length).toBeGreaterThan(150);
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    }
    const get = tools.find((t) => t.name === "get_course")!;
    expect(get.inputSchema.required).toEqual(["course"]);
  });

  it("answers each tool from the data", async () => {
    expect(json(await client.callTool({ name: "term_info", arguments: {} })).next_term.id).toBe("2027-sp");
    expect(json(await client.callTool({ name: "search_courses", arguments: { query: "cs 124", limit: 1 } })).courses[0].code).toBe("CS 124");
    expect(json(await client.callTool({ name: "get_course", arguments: { course: "STAT100" } })).code).toBe("STAT 100");
    expect(json(await client.callTool({ name: "find_geneds", arguments: { gened: ["QR1"], limit: 2 } })).courses).toHaveLength(2);
    const built = json(await client.callTool({ name: "build_schedules", arguments: { courses: ["cs124", "STAT 100"], no_classes_before: "10am", limit: 2 } }));
    expect(built.schedules).toHaveLength(2);
    expect(built.schedules[0].open_on_site).toMatch(/\/schedule\/\?t=2027-sp&c=CS124%2CSTAT100&e=600&i=0$/);
  });

  it("builds schedules for a renumbered course and leaves out codes it can't find", async () => {
    const r = json(await client.callTool({ name: "build_schedules", arguments: { courses: ["ADV 283", "CS 999", "intro to cs"] } }));
    expect(r.renumbered).toEqual(["ADV 283 is now ADV 250"]);
    expect(r.courses).toEqual([{ code: "ADV 250" }]);
    expect(r.warnings).toHaveLength(2);
    const none = await client.callTool({ name: "build_schedules", arguments: { courses: ["CS 999"] } });
    expect(none.isError).toBe(true);
    const bad = await client.callTool({ name: "build_schedules", arguments: { courses: ["CS 124"], locked_crns: ["123"] } });
    expect(bad.isError).toBe(true); // not a CRN: the schema rejects it
  });

  it("follows a renumbered course to its new number", async () => {
    const r = json(await client.callTool({ name: "get_course", arguments: { course: "ADV 283" } }));
    expect(r).toMatchObject({ renumbered: "ADV 283 is now ADV 250", code: "ADV 250" });
  });

  it("explains a code it doesn't have, or one that isn't a code", async () => {
    const missing = await client.callTool({ name: "get_course", arguments: { course: "CS 999" } });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toMatch(/No course CS 999.*search_courses/);
    const bad = await client.callTool({ name: "get_course", arguments: { course: "intro to cs" } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toMatch(/isn't a course code/);
  });

  it("rejects arguments outside the schema", async () => {
    const r = await client.callTool({ name: "search_courses", arguments: { min_gpa: 7 } });
    expect(r.isError).toBe(true);
  });
});

// `npm test` builds dist/index.js first: the bundle MCP clients actually start.
describe.runIf(existsSync(path.join(import.meta.dirname, "..", "dist", "index.js")))("built server over stdio", () => {
  it("starts, lists its tools and answers", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(import.meta.dirname, "..", "dist", "index.js")],
      env: { ...(process.env as Record<string, string>), ILLINI_SCHEDULER_DATA: DATA },
      stderr: "ignore",
    });
    const client = new Client({ name: "stdio-test", version: "0" });
    await client.connect(transport);
    expect((await client.listTools()).tools).toHaveLength(5);
    expect(json(await client.callTool({ name: "get_course", arguments: { course: "CS 124", lectures_only: true } })).sections).toHaveLength(3);
    await client.close();
  });
});
