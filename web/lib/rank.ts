// Professors of a course ranked by the "best pick" score. Pure: used by the server-rendered header and the client page.
import type { Course } from "./types";
import type { ProfEntry } from "./sections";
import { scoreOf, type ScoreInput, type ScorePriors, type ScoreResult, type ScoreWeights } from "./score";

export type Scored = ProfEntry & { score: ScoreResult };

export function profInput(course: Course, p: ProfEntry): ScoreInput {
  const g = course.gpa;
  const r = p.ins.rmp;
  return {
    subject: course.subject,
    courseGpa: g ? (g.recent ?? g.avg) : null,
    courseN: g ? (g.recent !== null ? g.recent_students : g.students) : 0,
    delta: p.ins.gpa?.delta ?? null,
    deltaN: p.ins.gpa?.students ?? 0,
    rmp: r && r.num_ratings > 0 ? { quality: r.rating, difficulty: r.difficulty, wouldTakeAgain: r.would_take_again, n: r.num_ratings } : null,
    openShare: p.tally.known && p.tally.total ? p.tally.open / p.tally.total : null,
  };
}

export function rankProfs(course: Course, list: ProfEntry[], priors: ScorePriors | null | undefined, w: ScoreWeights): Scored[] {
  return list
    .map((p) => ({ ...p, score: priors ? scoreOf(profInput(course, p), priors, w) : { score: null, parts: [], missing: [] } }))
    .sort((a, b) => (b.score.score ?? -1) - (a.score.score ?? -1) || (b.ins.gpa?.avg ?? -1) - (a.ins.gpa?.avg ?? -1) || a.ins.name.localeCompare(b.ins.name));
}

/** A next-term lecturer's score inputs as exported for course lists (degree checklist, gen-ed finder). */
/** `g`: their own recent GPA in this course (from exports after 0.16; older data leaves it out). */
export type DegreeProf = { k: string; name: string; d: number | null; dn: number; g?: number | null; rmp: [number | null, number | null, number | null, number] | null; open: [number, number] | null };

/** The course facts a list needs to score a course (pipeline/export.py course_summary). */
export type CourseFacts = { gpa?: number | null; gn?: number; nSec?: number; nOpen?: number | null; known?: boolean; profs?: DegreeProf[] };

export type Ranked<C extends CourseFacts = CourseFacts> = { code: string; course: C; score: ScoreResult | null; best: DegreeProf | null };

/** The best-pick score of a course taught by `p`, or by the course alone when `p` is null. */
function scoreWith(c: string, course: CourseFacts, p: DegreeProf | null, priors: ScorePriors, w: ScoreWeights): ScoreResult {
  const courseOpen = course.known && course.nSec ? (course.nOpen ?? 0) / course.nSec : null;
  const base = { subject: c.split(" ")[0], courseGpa: course.gpa ?? null, courseN: course.gn ?? 0 };
  if (!p) return scoreOf({ ...base, delta: null, deltaN: 0, rmp: null, openShare: courseOpen }, priors, w);
  return scoreOf(
    {
      ...base,
      delta: p.d,
      deltaN: p.dn,
      rmp: p.rmp ? { quality: p.rmp[0], difficulty: p.rmp[1], wouldTakeAgain: p.rmp[2], n: p.rmp[3] } : null,
      openShare: p.open && p.open[1] ? p.open[0] / p.open[1] : courseOpen,
    },
    priors,
    w,
  );
}

/** Every next-term professor of a course with the course's score when they teach it, best first (listed order without priors). */
export function rankTeachers<C extends CourseFacts>(c: string, course: C, priors: ScorePriors | null | undefined, w: ScoreWeights): Ranked<C>[] {
  const profs = course.profs ?? [];
  if (!priors) return profs.map((p) => ({ code: c, course, score: null, best: p }));
  return profs.map((p) => ({ code: c, course, score: scoreWith(c, course, p, priors, w), best: p })).sort((a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1));
}

/** Score a course by its best next-term professor (or by the course alone when no one is listed yet). */
export function rankCourse<C extends CourseFacts>(c: string, course: C, priors: ScorePriors | null | undefined, w: ScoreWeights): Ranked<C> {
  if (!priors) return { code: c, course, score: null, best: null };
  if (!course.profs?.length) return { code: c, course, score: scoreWith(c, course, null, priors, w), best: null };
  return rankTeachers(c, course, priors, w)[0];
}
