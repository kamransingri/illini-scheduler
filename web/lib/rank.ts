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
