import type { SearchCourse, SearchIndex, SearchInstructor } from "./types";

export type SearchHit =
  | { kind: "course"; course: SearchCourse; score: number }
  | { kind: "instructor"; instructor: SearchInstructor; score: number };

const CODE_RE = /^\s*([a-z]{2,5})[\s\-_.]*(\d{1,3})\s*$/i;

/** Normalise "cs124", "CS 124", " cs  124 " to {subject: "CS", number: "124"}. */
export function parseCode(q: string): { subject: string; number: string } | null {
  const m = CODE_RE.exec(q);
  if (!m) return null;
  return { subject: m[1].toUpperCase(), number: m[2] };
}

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["to", "of", "and", "the", "in", "for", "a", "an", "intro"]);

/** Nicknames students actually type -> course codes (best first). Keys are normalised queries. */
export const ALIASES: Record<string, string[]> = {
  "calc 1": ["MATH 221", "MATH 220"],
  "calc i": ["MATH 221", "MATH 220"],
  "calculus 1": ["MATH 221", "MATH 220"],
  "calc 2": ["MATH 231"],
  "calc ii": ["MATH 231"],
  "calculus 2": ["MATH 231"],
  "calc 3": ["MATH 241"],
  "calc iii": ["MATH 241"],
  "calculus 3": ["MATH 241"],
  "multivariable calculus": ["MATH 241"],
  "linear algebra": ["MATH 257", "MATH 415"],
  "lin alg": ["MATH 257", "MATH 415"],
  "diff eq": ["MATH 285"],
  "differential equations": ["MATH 285"],
  "intro cs": ["CS 124", "CS 101", "CS 105"],
  "cs 1": ["CS 124"],
  "intro programming": ["CS 124", "CS 101"],
  "data structures": ["CS 225"],
  "discrete math": ["CS 173", "MATH 213"],
  "discrete structures": ["CS 173"],
  "algorithms": ["CS 374"],
  "systems programming": ["CS 341"],
  "intro stats": ["STAT 100", "STAT 200"],
  "stats": ["STAT 100", "STAT 200", "STAT 212"],
  "data science": ["STAT 107"],
  "rhet": ["RHET 105"],
  "comp 1": ["RHET 105"],
  "composition": ["RHET 105"],
  "micro": ["ECON 102"],
  "microeconomics": ["ECON 102"],
  "macro": ["ECON 103"],
  "macroeconomics": ["ECON 103"],
  "physics 1": ["PHYS 211"],
  "mechanics": ["PHYS 211"],
  "physics 2": ["PHYS 212"],
  "gen chem": ["CHEM 102", "CHEM 104"],
  "chem 1": ["CHEM 102"],
  "intro psych": ["PSYC 100"],
  "psych": ["PSYC 100"],
};

/** Edit distance with an early exit once it exceeds `max` (adjacent swaps count as one edit). */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** Typos allowed for a word of this length: none under 4 letters, 1 up to 7, 2 from 8. */
function typoBudget(w: string): number {
  return w.length < 4 ? 0 : w.length < 8 ? 1 : 2;
}

/** Rank courses and instructors for a free-text query. */
export function search(index: SearchIndex, query: string, limit = 20): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const alias = ALIASES[norm(q)];
  if (alias) {
    alias.forEach((codeStr, i) => {
      const [s, n] = codeStr.split(" ");
      const c = index.courses.find((x) => x.s === s && x.n === n);
      if (c) hits.push({ kind: "course", course: c, score: 2000 - i });
    });
  }
  let code = parseCode(q);
  if (code && !index.courses.some((c) => c.s === code!.subject)) code = null; // "calc 2" is not subject CALC
  const subjOnly = /^\s*([a-z]{2,4})\s*$/i.exec(q);
  const nq = norm(q);
  const words = nq.split(" ").filter((w) => w && !STOP.has(w));
  // "intro to computer science" should still match "Introduction to Computer Science I"
  const expanded = words.map((w) => (w === "intro" ? "introduction" : w));
  if (nq.startsWith("intro ") || nq === "intro") expanded.push("introduction");

  for (const c of index.courses) {
    let score = 0;
    if (code) {
      if (c.s === code.subject && c.n === code.number) score = 1000;
      else if (c.s === code.subject && c.n.startsWith(code.number)) score = 500 - Number(c.n);
    } else if (subjOnly && c.s === subjOnly[1].toUpperCase()) {
      score = 300 - Number(c.n) / 10;
    }
    if (!score && expanded.length) {
      const title = norm(c.t);
      const titleWords = new Set(title.split(" "));
      let matched = 0;
      for (const w of expanded) {
        if (titleWords.has(w)) matched += 2;
        else if ([...titleWords].some((t) => t.startsWith(w) && w.length >= 3)) matched += 1;
        else if (typoBudget(w) && [...titleWords].some((t) => editDistance(w, t, typoBudget(w)) <= typoBudget(w))) matched += 1;
      }
      const needed = Math.max(1, words.length);
      if (matched >= needed) score = 100 + matched * 10 - c.t.length / 20 + (c.nx ? 5 : 0);
      if (title === nq) score += 50;
    }
    if (score > 0) hits.push({ kind: "course", course: c, score });
  }
  if (!code && nq.length >= 3) {
    for (const i of index.instructors) {
      const name = norm(i.name);
      const parts = name.split(" ");
      const last = parts[parts.length - 1];
      let score = 0;
      if (name === nq) score = 400;
      else if (last === nq) score = 350;
      else if (words.every((w) => parts.some((p) => p.startsWith(w)))) score = 200;
      else if (words.length === 1 && typoBudget(nq) && editDistance(nq, last, typoBudget(nq)) <= typoBudget(nq)) score = 150;
      if (score) hits.push({ kind: "instructor", instructor: i, score });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  return hits
    .filter((h) => {
      const k = h.kind === "course" ? `c${h.course.s}${h.course.n}` : `i${h.instructor.k}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}
