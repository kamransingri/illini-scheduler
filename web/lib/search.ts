import type { SearchCourse, SearchIndex, SearchInstructor } from "./types";

export type SearchHit =
  | { kind: "course"; course: SearchCourse; score: number }
  | { kind: "instructor"; instructor: SearchInstructor; score: number };

const CODE_RE = /^\s*([a-z]{2,4})\s*(\d{1,3})\s*$/i;

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

/** Rank courses and instructors for a free-text query. */
export function search(index: SearchIndex, query: string, limit = 20): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const code = parseCode(q);
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
      if (score) hits.push({ kind: "instructor", instructor: i, score });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
