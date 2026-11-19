// Saves a small copy of the site's data for the tests in test/: a few courses, their search rows and gen-ed rows.
// node scripts/make-fixtures.mjs [https://.../data | web/public/data]   (default: the live site)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = (process.argv[2] ?? "https://kamransingri.github.io/illini-scheduler/data").replace(/\/+$/, "");
const out = path.join(import.meta.dirname, "..", "test", "fixtures", "data");
const COURSES = ["CS 124", "STAT 100", "ADV 250", "MATH 231", "PSYC 100"]; // ADV 250 was ADV 283 (renumbered); MATH 231 and PSYC 100 for build_schedules
const SEARCH_EXTRA = new Set(["MATH 220", "MATH 221", "MATH 231", "PSYC 100", "ADV 250", "THEA 175"]);
const keepGened = (codes) => codes.includes("QR1") || (codes.includes("NW") && codes.includes("LA"));

async function read(file) {
  if (/^https?:/.test(root)) {
    const res = await fetch(`${root}/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
    return res.json();
  }
  return JSON.parse(await readFile(path.join(root, file), "utf8"));
}

async function save(file, value) {
  await mkdir(path.dirname(path.join(out, file)), { recursive: true });
  await writeFile(path.join(out, file), `${JSON.stringify(value)}\n`);
}

const meta = await read("meta.json");
await save("meta.json", { ...meta, match_report: {} });

const search = await read("search.json");
const courses = search.courses.filter(
  (c) => (c.s === "CS" && Number(c.n) < 200) || (c.s === "STAT" && Number(c.n) < 300) || keepGened(c.g) || SEARCH_EXTRA.has(`${c.s} ${c.n}`),
);
const codes = new Set(courses.map((c) => `${c.s} ${c.n}`));
await save("search.json", { courses, instructors: search.instructors.filter((i) => i.c.some((c) => codes.has(c))) });

const geneds = await read("geneds.json");
await save("geneds.json", geneds.filter((r) => keepGened(r.codes)));

for (const code of COURSES) {
  const [s, n] = code.split(" ");
  await save(`course/${s}/${n}.json`, await read(`course/${s}/${n}.json`));
}
const renumbered = await read("renumbered.json");
await save("renumbered.json", Object.fromEntries(Object.entries(renumbered).filter(([, to]) => COURSES.includes(to))));
console.log(`saved ${courses.length} search rows, ${COURSES.length} courses from ${root} to ${out}`);
