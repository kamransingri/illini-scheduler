// Build-time data access (server components only). Reads the JSON written by `make data`.
import fs from "node:fs";
import path from "node:path";
import type { Course, Meta, SearchIndex } from "./types";

const DATA_DIR = path.join(process.cwd(), "public", "data");

function readJson<T>(rel: string): T | null {
  const p = path.join(DATA_DIR, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

export function getMeta(): Meta | null {
  return readJson<Meta>("meta.json");
}

export function getSearchIndex(): SearchIndex {
  return readJson<SearchIndex>("search.json") ?? { courses: [], instructors: [] };
}

export function getCourse(subject: string, number: string): Course | null {
  if (!/^[A-Z]{2,5}$/.test(subject) || !/^\d{3}$/.test(number)) return null;
  return readJson<Course>(`course/${subject}/${number}.json`);
}

/** Courses to pre-render. PAGES_LIMIT (e.g. for quick local builds) keeps only the first N plus the reference courses. */
export function courseParams(): { subject: string; number: string }[] {
  const all = getSearchIndex().courses.map((c) => ({ subject: c.s, number: c.n }));
  const limit = Number(process.env.PAGES_LIMIT ?? 0);
  if (!limit) return all;
  const ref = new Set(["CS 124", "MATH 221", "STAT 107", "RHET 105", "MATH 231", "STAT 200", "CS 225", "CS 128"]);
  return all.filter((c, i) => i < limit || ref.has(`${c.subject} ${c.number}`));
}
