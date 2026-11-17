import type { DegreeIndex } from "./degree";

export type Program = DegreeIndex[number];

// Words students type that the catalog never uses. Prefixes ("econ", "psych", "bio") and acronyms of a program's name
// ("mcb", "ee", "me") are matched without being listed here. "cs" is listed so it also finds "Statistics & Computer
// Science" and not "Crop Sciences".
const ALIASES: Record<string, string> = {
  cs: "computer science",
  compsci: "computer science",
  stats: "statistics",
  polisci: "political science",
  bme: "bioengineering",
  ischool: "information sciences",
};

// Words left out of acronyms: "Molecular and Cellular Biology" is MCB, "College of Fine and Applied Arts" is FAA.
const SKIP = new Set(["and", "of", "the", "for", "in", "a", "an", "college", "school"]);

/** Lower case, no accents, "&" and "+" as words, everything else that isn't a letter or digit as a space. */
export function words(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

const acronym = (s: string) =>
  words(s)
    .filter((w) => !SKIP.has(w))
    .map((w) => w[0])
    .join("");

type Entry = { p: Program; name: string[]; acr: Set<string>; college: string[]; collegeAcr: string; flat: string };

const cache = new WeakMap<DegreeIndex, Entry[]>();

function entries(programs: DegreeIndex): Entry[] {
  let e = cache.get(programs);
  if (!e) {
    e = programs.map((p) => {
      // "Computer Science + Education: Learning Sciences, BS": the field before the degree, each part on its own
      const field = p.program.replace(/,\s*[^,]+$/, "");
      const parts = field.split(/\s*[+:]\s*/);
      const acr = new Set([acronym(field), ...parts.map(acronym)].filter((a) => a.length > 1));
      const name = words(p.program);
      return { p, name, acr, college: words(p.college), collegeAcr: acronym(p.college), flat: name.join(" ") };
    });
    cache.set(programs, e);
  }
  return e;
}

/** How well one query word fits a program: 0 means it doesn't. */
function tokenScore(e: Entry, t: string): number {
  if (e.acr.has(t)) return 5;
  const at = e.name.findIndex((w) => w.startsWith(t));
  if (at === 0) return 4;
  if (at > 0) return 3;
  // a different ending of the same word: "accounting" finds Accountancy, "economy" Economics
  if (t.length >= 7 && e.name.some((w) => w.startsWith(t.slice(0, 6)))) return 2;
  if (e.collegeAcr === t || e.college.some((w) => w.startsWith(t))) return 1;
  if (t.length >= 5 && e.flat.includes(t)) return 1; // "engineering" in "Bioengineering"
  return 0;
}

/**
 * Programs matching every word of the query, best first: acronyms and the start of the name count most, the college
 * least. Ties go to the shorter name, so "Computer Science, BS" comes before "Computer Science + Physics, BS".
 * An empty query returns nothing; the picker shows the full list grouped by college instead.
 */
export function searchPrograms(programs: DegreeIndex, q: string): Program[] {
  const raw = words(q);
  if (!raw.length) return [];
  const tokens = raw.flatMap((t) => (ALIASES[t] ? words(ALIASES[t]) : [t]));
  const phrase = tokens.join(" ");
  const scored: [number, Entry][] = [];
  for (const e of entries(programs)) {
    let score = 0;
    let all = true;
    for (const t of tokens) {
      const s = tokenScore(e, t);
      if (!s) {
        all = false;
        break;
      }
      score += s;
    }
    if (!all) continue;
    if (e.flat.startsWith(phrase)) score += 5;
    scored.push([score, e]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].p.program.length - b[1].p.program.length || a[1].p.program.localeCompare(b[1].p.program));
  return scored.map(([, e]) => e.p);
}

/** The full list for browsing: colleges in the order the index has them, programs alphabetical within each. */
export function byCollege(programs: DegreeIndex): { college: string; programs: Program[] }[] {
  const groups = new Map<string, Program[]>();
  for (const p of programs) groups.set(p.college, [...(groups.get(p.college) ?? []), p]);
  return [...groups].map(([college, ps]) => ({ college, programs: [...ps].sort((a, b) => a.program.localeCompare(b.program)) }));
}
