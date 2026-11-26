// The package the way someone gets it: `npm pack`, install the tarball into an empty folder, start the server the way
// mcp/README.md says (`npx -y <tarball>`) with the saved test data, list its tools and call each one once.
// CI runs it after the unit tests: cd mcp && npm run smoke
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.join(import.meta.dirname, "..");
const data = path.join(here, "test", "fixtures", "data");
const pkg = JSON.parse(readFileSync(path.join(here, "package.json"), "utf8"));
const tmp = mkdtempSync(path.join(tmpdir(), "illini-mcp-"));

// `npm run smoke` sets npm_execpath to npm's own script, which runs the same way on every OS
function npm(args, cwd) {
  const cli = process.env.npm_execpath;
  return cli
    ? execFileSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
    : execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" });
}

function check(ok, message) {
  if (!ok) throw new Error(message);
  console.log(`ok - ${message}`);
}

const CALLS = {
  term_info: {},
  search_courses: { query: "cs 124", limit: 1 },
  get_course: { course: "STAT 100" },
  find_geneds: { gened: ["QR1"], limit: 2 },
  build_schedules: { courses: ["CS 124", "STAT 100"], limit: 1 },
};

try {
  // 1. Pack: prepack builds dist/index.js first
  const out = npm(["pack", "--json", "--pack-destination", tmp], here);
  const [packed] = JSON.parse(out.slice(out.indexOf("[")));
  const files = packed.files.map((f) => f.path).sort();
  check(JSON.stringify(files) === JSON.stringify(["LICENSE", "README.md", "dist/index.js", "package.json"]), `the tarball holds only ${files.join(", ")}`);
  const tarball = path.join(tmp, packed.filename);

  // 2. Install into an empty folder: dist/index.js is one bundle, so nothing else comes with it
  const app = path.join(tmp, "app");
  mkdirSync(app);
  writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "smoke", private: true }));
  npm(["install", "--no-audit", "--no-fund", "--no-package-lock", tarball], app);
  const installed = readdirSync(path.join(app, "node_modules")).filter((d) => !d.startsWith("."));
  check(JSON.stringify(installed) === JSON.stringify([pkg.name]), "installing it adds no other packages");

  // 3. Start it with npx, as the setup guide does (there with the release's https URL), and use every tool.
  // A bare C:\ path confuses npx on Windows; a file: spec works everywhere.
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", `file:${tarball.replaceAll("\\", "/")}`],
    cwd: app,
    env: { ...process.env, ILLINI_SCHEDULER_DATA: data },
    stderr: "ignore",
  });
  const client = new Client({ name: "smoke", version: "0" });
  await client.connect(transport);
  check(client.getServerVersion()?.version === pkg.version, `npx starts it and it says version ${pkg.version}`);
  const { tools } = await client.listTools();
  check(JSON.stringify(tools.map((t) => t.name).sort()) === JSON.stringify(Object.keys(CALLS).sort()), `it lists ${tools.length} tools`);
  for (const [name, args] of Object.entries(CALLS)) {
    const r = await client.callTool({ name, arguments: args });
    const answer = JSON.parse(r.content[0].text);
    check(!r.isError && answer && typeof answer === "object", `${name} answers from the saved data`);
  }
  await client.close();
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
