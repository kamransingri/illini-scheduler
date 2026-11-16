// Full-page screenshots of the main pages at desktop and phone width, for design reviews and the PR.
// Usage (with the static build served on :4173):  node scripts/screenshots.mjs ../docs/screenshots/after [extra paths...]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const base = process.env.SHOT_BASE_URL ?? "http://127.0.0.1:4173/";
const outDir = path.resolve(process.argv[2] ?? "screenshots");
const extra = process.argv.slice(3).map((p) => [p.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "page", p]);
// SHOT_ONLY=1 captures just the extra paths (quick checks while iterating)
const pages = process.env.SHOT_ONLY ? extra : [
  ["home", "./"],
  ["cs-124", "./course/CS/124/"],
  ["math-221", "./course/MATH/221/"],
  ["stat-107", "./course/STAT/107/"],
  ["geneds", "./geneds/"],
  ["schedule", "./schedule/?c=CS124,STAT107,RHET105&t=2027-sp"],
  ["opened", "./opened/"],
  ...extra,
];
const widths = [
  ["desktop", 1280, 900],
  ["mobile", 375, 800],
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const [label, w, h] of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [name, rel] of pages) {
    await page.goto(new URL(rel, base).toString(), { waitUntil: "networkidle" });
    // let client-side data (course JSON, search index) render before capturing
    await page.waitForTimeout(600);
    const file = path.join(outDir, `${name}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
  await ctx.close();
}
await browser.close();
