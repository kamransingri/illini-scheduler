// AP credit (docs/AP-CREDIT.md): the Illinois courses a student's AP scores are expected to give, from CITL's table for
// the year they entered. Pure functions over web/public/data/ap-credit.json (pipeline/ap_credit.py). The student's scores
// are kept, not the courses, so a fix to our copy of a table also fixes every saved list and shared link.
import type { MyCourse } from "./mycourses";

export type ApRow = {
  scores: number[];
  sub: number[] | null; // subscore values this row needs (0 = no subscore); null = any
  college: "grainger" | "other" | null;
  with: Record<string, number[]> | null; // another exam's score this row needs (0 = not taken)
  credit: [string, number][]; // course code ("MATH 220") or elective credit ("MATH 1--"), with CITL's hours
  message: string | null; // CITL's placement message, word for word
  fix: string | null; // where our copy differs from the page, quoting it
};
export type ApExam = { id: string; name: string; sub: string | null; notes: string[]; rows: ApRow[] };
export type ApYear = { id: string; label: string; entering: string; source: string; read_on: string; notes: string[]; exams: ApExam[]; unknown: string[] };
export type ApTable = { years: ApYear[] };
/** One exam the student took. `sub` is the subscore when the table needs one (Calculus BC's AB subscore, Music Theory's aural). */
export type ApScore = { exam: string; score: number; sub: number | null };

const PART = /^([A-Z][A-Z0-9]{1,9})-([1-5])(?:-([0-5]))?$/;
export const ELECTIVE = /^([A-Z]{2,5}) ([1-4])--$/;
export const isElective = (code: string) => ELECTIVE.test(code);

/** "CALCBC-3-4,CHEM-5": exam id, score, and the subscore when there is one. */
export function encodeAp(list: ApScore[]): string {
  return list.map((a) => `${a.exam}-${a.score}${a.sub !== null ? `-${a.sub}` : ""}`).join(",");
}

/** One score per exam (the last one wins); anything that doesn't parse is dropped. */
export function decodeAp(param: string | null | undefined): ApScore[] {
  const out = new Map<string, ApScore>();
  for (const part of (param ?? "").split(",")) {
    const m = PART.exec(part.trim().toUpperCase());
    if (m) out.set(m[1], { exam: m[1], score: Number(m[2]), sub: m[3] !== undefined ? Number(m[3]) : null });
  }
  return [...out.values()];
}

/** The year's table, or the newest one when the id is empty or unknown. */
export function pickYear(table: ApTable, id: string): ApYear | null {
  return table.years.find((y) => y.id === id) ?? table.years[0] ?? null;
}

export const isGrainger = (college: string | null | undefined) => !!college && /grainger/i.test(college);

const subApplies = (r: ApRow, sub: number) => !r.sub || r.sub.includes(sub);

/** Subscore values the table tells apart for this exam and score; [] when the score doesn't depend on a subscore. */
export function subOptions(exam: ApExam, score: number): number[] {
  const vals = new Set<number>();
  for (const r of exam.rows) if (r.scores.includes(score)) r.sub?.forEach((v) => vals.add(v));
  return [...vals].sort((a, b) => a - b);
}

/** The subscore to use: the one given, else "no subscore" (0) when the table has a row for that. */
function effectiveSub(exam: ApExam, a: ApScore): number | null {
  const opts = subOptions(exam, a.score);
  if (!opts.length) return 0;
  if (a.sub !== null && opts.includes(a.sub)) return a.sub;
  return opts.includes(0) ? 0 : null;
}

export function rowFor(exam: ApExam, a: ApScore, grainger: boolean, scores: Map<string, number>): ApRow | null {
  const sub = effectiveSub(exam, a);
  if (sub === null) return null;
  const college = grainger ? "grainger" : "other";
  return (
    exam.rows.find(
      (r) =>
        r.scores.includes(a.score) &&
        subApplies(r, sub) &&
        (!r.college || r.college === college) &&
        (!r.with || Object.entries(r.with).every(([x, v]) => v.includes(scores.get(x) ?? 0))),
    ) ?? null
  );
}

export function scoreLabel(exam: ApExam | undefined, a: ApScore): string {
  const sub = exam?.sub && a.sub !== null && subOptions(exam, a.score).length ? ` (${exam.sub}: ${a.sub || "none"})` : "";
  return `AP ${exam?.name ?? a.exam}, ${a.score}${sub}`;
}

export type ApResult = {
  score: ApScore;
  exam: ApExam | undefined; // undefined: the exam isn't in this year's table
  label: string;
  row: ApRow | null; // null: no credit for this score (or a subscore is still needed)
  needsSub: boolean;
};
/** A course (or elective credit) the scores give, merged across exams. */
export type ApCredit = { code: string; hours: number; elective: boolean; from: string[] };
export type ApSummary = { results: ApResult[]; credits: ApCredit[] };

/**
 * What the scores give under one year's table. The same course from two exams (RHET 105 from both English exams)
 * counts once; elective credit in the same subject from two exams adds up, since each exam posts its own.
 */
export function apCredit(year: ApYear, list: ApScore[], grainger: boolean): ApSummary {
  const byId = new Map(year.exams.map((e) => [e.id, e]));
  const scores = new Map(list.map((a) => [a.exam, a.score]));
  const credits = new Map<string, ApCredit>();
  const results = list.map((a): ApResult => {
    const exam = byId.get(a.exam);
    const label = scoreLabel(exam, a);
    const needsSub = !!exam && effectiveSub(exam, a) === null;
    const row = exam ? rowFor(exam, a, grainger, scores) : null;
    for (const [code, hours] of row?.credit ?? []) {
      const seen = credits.get(code);
      const elective = isElective(code);
      if (!seen) credits.set(code, { code, hours, elective, from: [label] });
      else {
        seen.hours = elective ? seen.hours + hours : Math.max(seen.hours, hours);
        seen.from.push(label);
      }
    }
    return { score: a, exam, label, row, needsSub };
  });
  return { results, credits: [...credits.values()] };
}

/**
 * The credits as "My courses" entries (status "credit", at CITL's hours), leaving out what the student switched off and
 * what they already listed themselves (their own entry wins).
 */
export function creditCourses(credits: ApCredit[], declined: string[], own: MyCourse[]): MyCourse[] {
  const mine = new Set(own.map((c) => `${c.s} ${c.n}`));
  return credits
    .filter((c) => !declined.includes(c.code) && !mine.has(c.code))
    .map((c) => {
      const [s, n] = c.code.split(" ");
      return { s, n, status: "credit" as const, hours: c.hours, ap: c.from.join("; ") };
    });
}
