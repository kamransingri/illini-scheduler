// The Cloudflare build (docs/CLOUDFLARE.md): the static site at the root, with data/ left out. Pages fetch their data
// from GitHub Pages instead (it allows cross-origin reads), which keeps the deploy under the free plan's file cap.
//   node scripts/cloudflare-build.mjs            build, then prune out/
//   node scripts/cloudflare-build.mjs --no-build prune and count an existing out/
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DATA_URL = process.env.DATA_URL ?? "https://kamransingri.github.io/illini-scheduler/data";
// Cloudflare's free plan allows 20,000 files per deploy; stop short of it so a growing catalog fails here, not there
const MAX_FILES = Number(process.env.CF_MAX_FILES ?? 19000);
const OUT = path.join(process.cwd(), "out");

// Every course in search.json gets a page, and a page without its course file renders "not found". A quick
// `make data-quick` leaves most of them out, so stop here unless PAGES_LIMIT says a partial build is meant.
const DATA = path.join(process.cwd(), "public", "data");
if (!process.argv.includes("--no-build") && !Number(process.env.PAGES_LIMIT ?? 0)) {
  const courses = JSON.parse(fs.readFileSync(path.join(DATA, "search.json"), "utf8")).courses;
  const missing = courses.filter((c) => !fs.existsSync(path.join(DATA, "course", c.s, `${c.n}.json`)));
  if (missing.length) {
    console.error(`${missing.length} of ${courses.length} courses in public/data/search.json have no course file, so their pages would say "not found".`);
    console.error("Run `make data` first, or set PAGES_LIMIT for a partial test build.");
    process.exit(1);
  }
}

if (!process.argv.includes("--no-build")) {
  const env = { ...process.env, BASE_PATH: "", DATA_URL };
  const r = spawnSync(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "build"], { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!fs.existsSync(OUT)) {
  console.error("No out/ folder: run the build first.");
  process.exit(1);
}
fs.rmSync(path.join(OUT, "data"), { recursive: true, force: true });
// Anyone who uses this site's /data/ URLs (the API, feeds, bookmarks) is sent to GitHub Pages' copy. Cloudflare reads
// _redirects itself, so this needs no Worker.
fs.writeFileSync(path.join(OUT, "_redirects"), `/data/* ${DATA_URL}/:splat 301\n`);

let files = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name));
    else files++;
  }
};
walk(OUT);
console.log(`Cloudflare build: ${files} files in out/ (cap ${MAX_FILES}), data from ${DATA_URL}`);
if (files > MAX_FILES) {
  console.error(`Too many files for Cloudflare's free plan: ${files} > ${MAX_FILES}.`);
  process.exit(1);
}
