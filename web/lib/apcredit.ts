// AP credit (docs/AP-CREDIT.md): the Illinois courses a student's AP scores are expected to give, from CITL's table for
// the year they entered. Pure functions over web/public/data/ap-credit.json (pipeline/ap_credit.py). The student's scores
// are kept, not the courses, so a fix to our copy of a table also fixes every saved list and shared link.
import type { MyCourse } from "./mycourses";

export type ApRow = {
  level?: IbLevel; // IB only: the row is for Higher or Standard Level
  scores: number[];
  sub: number[] | null; // subscore values this row needs (0 = no subscore); null = any
  college: "grainger" | "other" | null;
  with: Record<string, number[]> | null; // another exam's score this row needs (0 = not taken)
  credit: [string, number][]; // course code ("MATH 220") or elective credit ("MATH 1--"), with CITL's hours
  message: string | null; // CITL's placement message, word for word
  fix: string | null; // where our copy differs from the page, quoting it
};
export type ApExam = { id: string; name: string; sub: string | null; notes: string[]; rows: ApRow[]; levels?: IbLevel[] };
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

/** What the scores give under one year's table (credits merged as in allCredits). */
export function apCredit(year: ApYear, list: ApScore[], grainger: boolean): ApSummary {
  const byId = new Map(year.exams.map((e) => [e.id, e]));
  const scores = new Map(list.map((a) => [a.exam, a.score]));
  const results = list.map((a): ApResult => {
    const exam = byId.get(a.exam);
    const needsSub = !!exam && effectiveSub(exam, a) === null;
    const row = exam ? rowFor(exam, a, grainger, scores) : null;
    return { score: a, exam, label: scoreLabel(exam, a), row, needsSub };
  });
  return { results, credits: allCredits({ results, credits: [] }) };
}

// IB (issue #25): the same table shape from web/public/data/ib-credit.json, with a level on every row and scores 1 to 7.
export type IbLevel = "HL" | "SL";
export const IB_LEVEL: Record<IbLevel, string> = { HL: "Higher Level", SL: "Standard Level" };
export type IbScore = { exam: string; level: IbLevel; score: number };

const IB_PART = /^([A-Z][A-Z0-9]{1,9})-(HL|SL)-([1-7])$/;

/** "ECON-HL-6,MATHAA-SL-5". */
export function encodeIb(list: IbScore[]): string {
  return list.map((a) => `${a.exam}-${a.level}-${a.score}`).join(",");
}

/** One score per exam (the last one wins); anything that doesn't parse is dropped. */
export function decodeIb(param: string | null | undefined): IbScore[] {
  const out = new Map<string, IbScore>();
  for (const part of (param ?? "").split(",")) {
    const m = IB_PART.exec(part.trim().toUpperCase());
    if (m) out.set(m[1], { exam: m[1], level: m[2] as IbLevel, score: Number(m[3]) });
  }
  return [...out.values()];
}

/** The IB table for the same entering year as the AP table in use; null when that year's IB table isn't copied. */
export function pickIbYear(table: ApTable, apYear: ApYear | null): ApYear | null {
  return apYear ? (table.years.find((y) => y.id === apYear.id) ?? null) : (table.years[0] ?? null);
}

export function ibLabel(exam: ApExam | undefined, a: IbScore): string {
  return `IB ${exam?.name ?? a.exam} ${a.level}, ${a.score}`;
}

/** What the IB scores give under one year's table, in the same shape as apCredit. */
export function ibCredit(year: ApYear, list: IbScore[]): ApSummary {
  const byId = new Map(year.exams.map((e) => [e.id, e]));
  const results = list.map((a): ApResult => {
    const exam = byId.get(a.exam);
    const row = exam?.rows.find((r) => r.level === a.level && r.scores.includes(a.score)) ?? null;
    return { score: { exam: a.exam, score: a.score, sub: null }, exam, label: ibLabel(exam, a), row, needsSub: false };
  });
  return { results, credits: allCredits({ results, credits: [] }) };
}

/**
 * The courses the exams of one or more summaries give (AP and IB together). The same course twice counts once (RHET 105
 * from both English exams, or from an AP and an IB exam); elective credit in the same subject adds up, since each exam
 * posts its own.
 */
export function allCredits(...sums: (ApSummary | null)[]): ApCredit[] {
  const credits = new Map<string, ApCredit>();
  for (const { row, label } of sums.flatMap((s) => s?.results ?? [])) {
    for (const [code, hours] of row?.credit ?? []) {
      const seen = credits.get(code);
      const elective = isElective(code);
      if (!seen) credits.set(code, { code, hours, elective, from: [label] });
      else {
        seen.hours = elective ? seen.hours + hours : Math.max(seen.hours, hours);
        seen.from.push(label);
      }
    }
  }
  return [...credits.values()];
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

// ACT and SAT (#106): web/public/data/test-credit.json in the same table shape. Each row lists every score in its range;
// the English rows give RHET 105 credit or a Rhetoric placement, the math rows a chemistry placement note.
export type TestScore = { exam: string; score: number };

const TEST_PART = /^([A-Z][A-Z0-9]{1,9})-(\d{1,3})$/;

/** The scores an exam can have, highest first: SAT 800 to 200 in tens, ACT 36 to 1. */
export const testScores = (exam: string): number[] =>
  exam.startsWith("SAT") ? Array.from({ length: 61 }, (_, i) => 800 - 10 * i) : Array.from({ length: 36 }, (_, i) => 36 - i);

/** "ACTENG-35,SATMATH-600". */
export function encodeTest(list: TestScore[]): string {
  return list.map((a) => `${a.exam}-${a.score}`).join(",");
}

/** One score per exam (the last one wins); a score the test can't have is dropped. */
export function decodeTest(param: string | null | undefined): TestScore[] {
  const out = new Map<string, TestScore>();
  for (const part of (param ?? "").split(",")) {
    const m = TEST_PART.exec(part.trim().toUpperCase());
    if (m && testScores(m[1]).includes(Number(m[2]))) out.set(m[1], { exam: m[1], score: Number(m[2]) });
  }
  return [...out.values()];
}

/** What the ACT and SAT scores give under one year's table, in the same shape as apCredit. */
export function testCredit(year: ApYear, list: TestScore[]): ApSummary {
  const byId = new Map(year.exams.map((e) => [e.id, e]));
  const results = list.map((a): ApResult => {
    const exam = byId.get(a.exam);
    const row = exam?.rows.find((r) => r.scores.includes(a.score)) ?? null;
    return { score: { ...a, sub: null }, exam, label: `${exam?.name ?? a.exam}, ${a.score}`, row, needsSub: false };
  });
  return { results, credits: allCredits({ results, credits: [] }) };
}
