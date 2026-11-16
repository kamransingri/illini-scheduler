// One "best pick" score for a professor in a course (and, through the best professor, for a course).
// Every part is put on a 0–1 scale, small samples are shrunk toward an average first, and parts with no data are left
// out (and named) instead of guessed. The formula is written down in docs/DECISIONS.md (D13).

export type ScoreWeights = { courseGpa: number; profGpa: number; quality: number; difficulty: number; wouldTakeAgain: number; seats: number };

export const DEFAULT_WEIGHTS: ScoreWeights = { courseGpa: 2, profGpa: 2, quality: 2, difficulty: 1, wouldTakeAgain: 1, seats: 1 };

/** Prior means the small samples are shrunk toward (computed from the data by pipeline/export.py). */
export type ScorePriors = {
  rmp: { quality: number | null; difficulty: number | null; would_take_again: number | null; n_instructors?: number };
  subject_gpa: Record<string, number>; // subject -> student-weighted recent GPA
  campus_gpa: number | null;
};

export type ScoreInput = {
  subject: string;
  courseGpa: number | null; // recent course GPA
  courseN: number; // graded students behind courseGpa
  delta: number | null; // professor GPA minus course GPA in the same terms
  deltaN: number; // graded students behind delta
  rmp: { quality: number | null; difficulty: number | null; wouldTakeAgain: number | null; n: number } | null;
  openShare: number | null; // open primary sections / primary sections, null when status is unknown
};

export type ScorePart = {
  key: keyof ScoreWeights;
  label: string;
  raw: string; // the number as the student knows it
  adjusted: string; // after shrinkage
  value: number; // 0–1
  weight: number;
  note?: string;
};

export type ScoreResult = { score: number | null; parts: ScorePart[]; missing: string[] };

/** Shrinkage strength: how many students / ratings it takes to count half as the measured value and half as the prior. */
export const K_COURSE_STUDENTS = 200;
export const K_PROF_STUDENTS = 150;
export const K_RMP_RATINGS = 10;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
// With no prior (no data to average), the measured value is used as is.
export const shrink = (x: number, n: number, prior: number | null, k: number) => (prior === null ? x : (n * x + k * prior) / (n + k));

export function scoreOf(input: ScoreInput, priors: ScorePriors, w: ScoreWeights = DEFAULT_WEIGHTS): ScoreResult {
  const parts: ScorePart[] = [];
  const missing: string[] = [];

  if (input.courseGpa !== null && input.courseN > 0) {
    const prior = priors.subject_gpa[input.subject] ?? priors.campus_gpa;
    const g = shrink(input.courseGpa, input.courseN, prior, K_COURSE_STUDENTS);
    parts.push({
      key: "courseGpa",
      label: "Course GPA",
      raw: `${input.courseGpa.toFixed(2)} (${input.courseN.toLocaleString("en-US")} students)`,
      adjusted: g.toFixed(2),
      value: clamp01((g - 2) / 2),
      weight: w.courseGpa,
      note: input.courseN < 1000 && prior !== null ? `pulled toward the ${input.subject} average (${prior.toFixed(2)}) because of the sample size` : undefined,
    });
  } else missing.push("course GPA (no grade data)");

  // A professor with no grade history counts as the course average (delta 0), not as unknown-and-skipped:
  // otherwise a brand-new instructor would be ranked on RMP alone.
  const d = input.delta !== null && input.deltaN > 0 ? shrink(input.delta, input.deltaN, 0, K_PROF_STUDENTS) : 0;
  parts.push({
    key: "profGpa",
    label: "Professor vs course GPA",
    raw: input.delta !== null && input.deltaN > 0 ? `${input.delta >= 0 ? "+" : "−"}${Math.abs(input.delta).toFixed(2)} (${input.deltaN.toLocaleString("en-US")} students)` : "no grade history",
    adjusted: `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`,
    value: clamp01((d + 0.5) / 1),
    weight: w.profGpa,
    note: input.delta === null || input.deltaN === 0 ? "counted as the course average" : input.deltaN < 600 ? "pulled toward the course average because of the sample size" : undefined,
  });

  const r = input.rmp;
  if (r && r.n > 0 && r.quality !== null) {
    const q = shrink(r.quality, r.n, priors.rmp.quality, K_RMP_RATINGS);
    parts.push({ key: "quality", label: "RMP quality", raw: `${r.quality.toFixed(1)} (${r.n} ratings)`, adjusted: q.toFixed(2), value: clamp01((q - 1) / 4), weight: w.quality, note: r.n < 20 ? "pulled toward the UIUC average because of few ratings" : undefined });
    if (r.difficulty !== null) {
      const df = shrink(r.difficulty, r.n, priors.rmp.difficulty, K_RMP_RATINGS);
      parts.push({ key: "difficulty", label: "RMP difficulty (lower is better)", raw: r.difficulty.toFixed(1), adjusted: df.toFixed(2), value: clamp01((5 - df) / 4), weight: w.difficulty });
    }
    if (r.wouldTakeAgain !== null && r.wouldTakeAgain >= 0) {
      const wt = shrink(r.wouldTakeAgain, r.n, priors.rmp.would_take_again, K_RMP_RATINGS);
      parts.push({ key: "wouldTakeAgain", label: "Would take again", raw: `${Math.round(r.wouldTakeAgain)}%`, adjusted: `${Math.round(wt)}%`, value: clamp01(wt / 100), weight: w.wouldTakeAgain });
    }
  } else missing.push("Rate My Professors (no ratings matched)");

  if (input.openShare !== null) {
    parts.push({ key: "seats", label: "Open sections", raw: `${Math.round(input.openShare * 100)}%`, adjusted: `${Math.round(input.openShare * 100)}%`, value: clamp01(input.openShare), weight: w.seats });
  } else missing.push("open seats (status not published)");

  const used = parts.filter((p) => p.weight > 0);
  const total = used.reduce((a, p) => a + p.weight, 0);
  const score = total > 0 ? Math.round((100 * used.reduce((a, p) => a + p.weight * p.value, 0)) / total) : null;
  return { score, parts, missing };
}
