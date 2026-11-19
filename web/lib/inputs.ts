// What the schedule generator gets for one course of a cart: its sections, locks, professors' best-pick scores and
// the sections the student can't register for. One function, so the builder, the plan comparison (#119) and the MCP
// server's build_schedules (#100) rank schedules the same way.
import { rankProfs } from "./rank";
import { eligibility, type AboutYou } from "./restrictions";
import type { CourseInput } from "./schedule";
import type { ScorePriors, ScoreWeights } from "./score";
import { professorsFor } from "./sections";
import type { Course } from "./types";

export type InputContext = {
  /** UIUC-wide mean RMP quality (meta.score_priors.rmp.quality) */
  rmpPrior: number | null;
  priors: ScorePriors | null;
  /** the student's best-pick weights (lib/weights.ts) */
  weights: ScoreWeights;
  /** About you (#80); NOBODY when it isn't set */
  me: AboutYou;
};

/** Each lecturer's best-pick score for the term, exactly as the course page ranks them (#49), and the top one. */
export function profScoresFor(course: Course, term: string, priors: ScorePriors | null, weights: ScoreWeights): { scores: Record<string, number | null>; best: string | null } | null {
  if (!priors) return null;
  const ranked = rankProfs(course, professorsFor(course, term).profs, priors, weights);
  return { scores: Object.fromEntries(ranked.map((p) => [p.key, p.score.score])), best: ranked.find((p) => p.score.score !== null)?.key ?? null };
}

/** The sections whose restriction clearly leaves this student out (#81). */
export function cannotRegister(course: Course, term: string, me: AboutYou): string[] {
  return (course.terms[term]?.sections ?? []).filter((x) => eligibility(x.text, x.status, me).status === "no").map((x) => x.crn);
}

/** One course of the cart as the generator's input. `scores` can be passed when the caller already has them. */
export function courseInput(
  key: string,
  course: Course,
  locked: string[],
  term: string,
  ctx: InputContext,
  scores: Record<string, number | null> | undefined = profScoresFor(course, term, ctx.priors, ctx.weights)?.scores,
): CourseInput {
  return { key, course, credits: course.credit_range[1] || 3, locked, rmpPrior: ctx.rmpPrior, profScores: scores, cannot: cannotRegister(course, term, ctx.me) };
}
