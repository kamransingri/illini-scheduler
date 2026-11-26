import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// The MCP server's build_schedules (#100) gives each schedule a link to the builder. This runs the built server
// (mcp/dist, made by `cd mcp && npm run build`, which `make test` does) over stdio on this build's data, the way an
// AI app does, and opens the links it returns.
const SERVER = path.join(__dirname, "..", "..", "..", "mcp", "dist", "index.js");
const DATA = path.join(__dirname, "..", "..", "out", "data");

type Built = { schedules: { crns: string[]; open_on_site: string }[] };

async function callTool(name: string, args: Record<string, unknown>): Promise<Built> {
  const proc = spawn(process.execPath, [SERVER], { env: { ...process.env, ILLINI_SCHEDULER_DATA: DATA }, stdio: ["pipe", "pipe", "ignore"] });
  const waiting = new Map<number, (m: { result: { content: { text: string }[] } }) => void>();
  let buf = "";
  proc.stdout.on("data", (d: Buffer) => {
    buf += d.toString();
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      const msg = JSON.parse(line);
      waiting.get(msg.id)?.(msg);
    }
  });
  const send = (m: object) => proc.stdin.write(`${JSON.stringify(m)}\n`);
  const request = (id: number, method: string, params: object) =>
    new Promise<{ result: { content: { text: string }[] } }>((resolve) => {
      waiting.set(id, resolve);
      send({ jsonrpc: "2.0", id, method, params });
    });
  try {
    await request(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    const res = await request(2, "tools/call", { name, arguments: args });
    return JSON.parse(res.result.content[0].text) as Built;
  } finally {
    proc.kill();
  }
}

test("build_schedules: each returned link opens that schedule in the builder (#100)", async ({ page }) => {
  test.skip(!existsSync(SERVER) || !existsSync(DATA), "needs mcp/dist (cd mcp && npm run build) and the static build");
  const out = await callTool("build_schedules", { courses: ["CS 124", "STAT 100", "PSYC 100"], no_classes_before: "9:30am", what_matters: { preset: "sleep" }, limit: 2 });
  expect(out.schedules).toHaveLength(2);
  for (const [i, s] of out.schedules.entries()) {
    await page.goto(`./schedule/${new URL(s.open_on_site).search}`);
    await expect(page.getByTestId("schedule-result")).toBeVisible();
    await expect(page.getByText(`Schedule ${i + 1} of`)).toBeVisible();
    // each row's first copy button is its own CRN (the backup line under it has more)
    const shown = await page
      .getByTestId("schedule-sections")
      .locator(":scope > li")
      .evaluateAll((els) => els.map((e) => e.querySelector('button[aria-label^="Copy "]')!.getAttribute("aria-label")!.slice(5)));
    expect(shown.sort()).toEqual([...s.crns].sort());
    await expect(page.getByLabel("No classes before")).toHaveValue("570");
  }
  // both links are the same plan (same courses and rules), so the second one didn't make a copy
  await expect(page.getByTestId("plan-menu").locator('[role="group"] button')).toHaveCount(1);
});
