// Four-year plan (#22, this part #114): the courses a student means to take in each term from the next one to their
// expected graduation. My courses has no terms (D17.3), so what's in it counts as already done; the plan holds only
// future terms. Saved and shared with My courses (lib/mycourses.ts): ?g=<graduation term>&gs=1 (summers)&pl=<terms>.
import { evaluate, type Degree } from "./degree";
import type { MyCourse } from "./mycourses";

/** `terms`: term id ("2027-fa") -> course codes ("CS 225"), in the order they were added. */
export type Plan = { grad: string; summers: boolean; terms: Record<string, string[]> };
export const EMPTY_PLAN: Plan = { grad: "", summers: false, terms: {} };

/** How far ahead a plan goes, and how much one term or the whole link can hold. */
export const MAX_YEARS = 6;
const MAX_PER_TERM = 12;
const MAX_TERMS = 3 * MAX_YEARS + 3;

const SEASONS = ["sp", "su", "fa"] as const;
const TERM = /^(\d{4})-(sp|su|fa)$/;

/** Terms as consecutive numbers (spring, summer, fall of each year); NaN for anything else. */
export function termIndex(t: string): number {
  const m = TERM.exec(t);
  return m ? Number(m[1]) * 3 + SEASONS.indexOf(m[2] as (typeof SEASONS)[number]) : NaN;
}
const termAt = (i: number) => `${Math.floor(i / 3)}-${SEASONS[i % 3]}`;
const byTerm = (a: string, b: string) => termIndex(a) - termIndex(b);

/** Graduation terms to pick from: each spring and fall from the next term on, plus the plan's own if it's elsewhere. */
export function gradOptions(next: string, current = ""): string[] {
  const start = termIndex(next);
  if (Number.isNaN(start)) return current ? [current] : [];
  const out = new Set<string>();
  for (let i = start; i < start + 3 * MAX_YEARS; i++) if (SEASONS[i % 3] !== "su") out.add(termAt(i));
  if (TERM.test(current)) out.add(current);
  return [...out].sort(byTerm);
}

/**
 * The terms to show: the next term through graduation (summers only when asked for), plus any other term that has
 * courses in it, so nothing in the plan is ever hidden (a term that has passed, a summer, a term after graduation).
 */
export function planTerms(plan: Plan, next: string): string[] {
  const out = new Set(Object.keys(plan.terms).filter((t) => plan.terms[t].length));
  const start = termIndex(next);
  const end = termIndex(plan.grad);
  if (!Number.isNaN(start) && !Number.isNaN(end))
    for (let i = start; i <= end && i < start + 3 * MAX_YEARS; i++) if (plan.summers || SEASONS[i % 3] !== "su") out.add(termAt(i));
  return [...out].sort(byTerm);
}

/** The term a course is planned in, if any. */
export function plannedIn(plan: Plan, code: string): string | null {
  return Object.keys(plan.terms).find((t) => plan.terms[t].includes(code)) ?? null;
}

export function addToTerm(plan: Plan, term: string, code: string): Plan {
  if (plannedIn(plan, code)) return plan;
  return { ...plan, terms: { ...plan.terms, [term]: [...(plan.terms[term] ?? []), code] } };
}

export function removeFromPlan(plan: Plan, code: string): Plan {
  const terms: Record<string, string[]> = {};
  for (const [t, codes] of Object.entries(plan.terms)) {
    const left = codes.filter((c) => c !== code);
    if (left.length) terms[t] = left;
  }
  return { ...plan, terms };
}

/** Put a course in a term: moved there if it's planned in another term, added at the end if it isn't planned yet. */
export function moveToTerm(plan: Plan, code: string, term: string): Plan {
  if (plan.terms[term]?.includes(code)) return plan;
  return addToTerm(removeFromPlan(plan, code), term, code);
}

/** The drag-and-drop type for a course code (#115): course options and planned courses carry it, terms accept it. */
export const COURSE_DRAG = "application/x-illini-course";

export const isEmptyPlan =(plan: Plan) => !plan.grad && !Object.keys(plan.terms).length;

/** "2027-fa.CS225.MATH231_2028-sp.CS233": terms in order, then their courses ("-", "." and "_" need no escaping in a URL). */
export function encodePlanTerms(plan: Plan): string {
  return Object.keys(plan.terms)
    .filter((t) => plan.terms[t].length)
    .sort(byTerm)
    .map((t) => [t, ...plan.terms[t].map((c) => c.replace(" ", ""))].join("."))
    .join("_");
}

export function decodePlan(grad: unknown, summers: unknown, terms: unknown): Plan {
  const out: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const part of (typeof terms === "string" ? terms : "").split("_")) {
    const [t, ...codes] = part.split(".");
    if (!TERM.test(t) || out[t] || Object.keys(out).length >= MAX_TERMS) continue;
    const list: string[] = [];
    for (const raw of codes) {
      const m = /^([A-Za-z]{2,5})(\d{3})$/.exec(raw);
      const code = m && `${m[1].toUpperCase()} ${m[2]}`;
      if (!code || seen.has(code) || list.length >= MAX_PER_TERM) continue;
      seen.add(code);
      list.push(code);
    }
    if (list.length) out[t] = list;
  }
  return { grad: typeof grad === "string" && TERM.test(grad) ? grad : "", summers: summers === true || summers === "1", terms: out };
}

export type TermHours = { hours: number; variable: boolean; unknown: string[] };

/** A term's credit hours, counting variable-credit courses at their minimum. `lookup` gives [min, max] or null. */
export function termHours(codes: string[], lookup: (code: string) => [number, number] | null): TermHours {
  const out: TermHours = { hours: 0, variable: false, unknown: [] };
  for (const c of codes) {
    const cr = lookup(c);
    if (!cr) out.unknown.push(c);
    else {
      out.hours += cr[0];
      if (cr[0] !== cr[1]) out.variable = true;
    }
  }
  return out;
}

/** "now": met by My courses already. A term: the plan finishes it then. null: the plan doesn't finish it. */
export type FinishAt = "now" | string | null;

/**
 * The term each requirement gets finished in: the checklist worked out again with every term's courses added in
 * order. `mine` is My courses with AP and IB credit; hand-ticked requirements count as met now, and unticked ones
 * aren't in the result (the plan can't tick them).
 */
export function finishTerms(deg: Degree, mine: MyCourse[], ticked: string[], plan: Plan, terms: string[]): Map<string, FinishAt> {
  const out = new Map<string, FinishAt>();
  const met = (have: number, need: number) => need > 0 && have >= need;
  const left = new Set<string>();
  for (const r of evaluate(deg, mine, ticked).results) {
    if (met(r.have, r.need)) out.set(r.group.id, "now");
    else if (r.group.rule !== "manual") left.add(r.group.id);
  }
  const have = new Set(mine.map((c) => `${c.s} ${c.n}`));
  let acc = mine;
  for (const t of terms) {
    if (!left.size) break;
    const add = (plan.terms[t] ?? []).filter((c) => !have.has(c));
    if (!add.length) continue;
    for (const c of add) have.add(c);
    // planned courses count like in-progress ones: the checklist uses completed courses first either way
    acc = [...acc, ...add.map((c): MyCourse => ({ s: c.split(" ")[0], n: c.split(" ")[1], status: "in_progress" }))];
    for (const r of evaluate(deg, acc, ticked).results)
      if (left.has(r.group.id) && met(r.have, r.need)) {
        out.set(r.group.id, t);
        left.delete(r.group.id);
      }
  }
  for (const id of left) out.set(id, null);
  return out;
}
