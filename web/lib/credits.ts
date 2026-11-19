// Credit-hour limits for one term's schedule (issue #82, DECISIONS.md D35): the Registrar's maximum without overload
// approval and the full-time minimum, checked against the hours of the courses in the cart or a schedule.

/** Where the limits come from, and when they were read. */
export const HOUR_RULES_SOURCE = "https://registrar.illinois.edu/registration/registration-process/max-min-enrollment-levels/";
export const HOUR_RULES_READ = "2026-11-18";

export type HourLimits = {
  /** most hours without overload approval from the college office; null if the term has no hour cap */
  max: number | null;
  /** most classes without approval (winter: one class); null if no class cap */
  maxClasses: number | null;
  /** hours for full-time status; null where we don't state one (summer and winter) */
  fullTime: number | null;
};

/** Undergraduate limits by term ("2027-sp"): 18 hours in fall and spring (12 or more is full-time), 9 in summer, 1 class in winter. */
export function limitsFor(term: string): HourLimits {
  const season = term.split("-")[1];
  if (season === "su") return { max: 9, maxClasses: null, fullTime: null };
  if (season === "wi") return { max: null, maxClasses: 1, fullTime: null };
  return { max: 18, maxClasses: null, fullTime: 12 };
}

/** A course's hours as [least, most]: "1 TO 4 hours." is [1, 4]; a course with no hours listed counts as 3, as in the builder. */
export function courseHours(range: [number, number] | undefined): [number, number] {
  const hi = range?.[1] || range?.[0] || 3;
  const lo = range?.[0] || hi;
  return [Math.min(lo, hi), hi];
}

/** Total hours of a set of courses, as [least, most]. */
export function totalHours(ranges: ([number, number] | undefined)[]): [number, number] {
  return ranges.map(courseHours).reduce<[number, number]>((a, h) => [a[0] + h[0], a[1] + h[1]], [0, 0]);
}

/** "15" or "15–17" */
export function fmtCredits([lo, hi]: [number, number]): string {
  const n = (x: number) => String(Math.round(x * 10) / 10);
  return lo === hi ? n(lo) : `${n(lo)}–${n(hi)}`;
}

export type HourWarning = { kind: "over" | "maybe-over" | "under" | "maybe-under" | "classes"; text: string; href: string };

/**
 * Warnings for a term's hours. `classes` is how many courses; `variable` names the courses whose hours can vary, so a
 * range that crosses a limit can say which course decides it. Under-12 is only checked when `complete` (a generated
 * schedule), since a cart being filled is under 12 on its way to 15.
 */
export function hourWarnings(
  hours: [number, number],
  classes: number,
  term: string,
  termName: string,
  variable: string[] = [],
  complete = true,
): HourWarning[] {
  if (!classes) return [];
  const lim = limitsFor(term);
  const out: HourWarning[] = [];
  const [lo, hi] = hours;
  const which = variable.length ? ` (${variable.join(", ")} can be taken for different hours)` : "";
  const href = HOUR_RULES_SOURCE;
  if (lim.max !== null) {
    if (lo > lim.max)
      out.push({ kind: "over", href, text: `${fmtCredits(hours)} credit hours: over the ${lim.max}-hour limit for ${termName}, so your college office has to approve an overload.` });
    else if (hi > lim.max)
      out.push({ kind: "maybe-over", href, text: `${fmtCredits(hours)} credit hours${which}: more than ${lim.max} in ${termName} needs your college office's approval.` });
  }
  if (lim.maxClasses !== null && classes > lim.maxClasses)
    out.push({ kind: "classes", href, text: `${classes} classes: ${termName} allows ${lim.maxClasses === 1 ? "one class" : `${lim.maxClasses} classes`} without your college office's approval.` });
  if (complete && lim.fullTime !== null) {
    if (hi < lim.fullTime)
      out.push({ kind: "under", href, text: `${fmtCredits(hours)} credit hours: under ${lim.fullTime}, so you wouldn't be full-time. That can matter for financial aid, scholarships, insurance and student visas.` });
    else if (lo < lim.fullTime)
      out.push({ kind: "maybe-under", href, text: `${fmtCredits(hours)} credit hours${which}: full-time is ${lim.fullTime} or more, so take enough hours to reach it if that matters to you.` });
  }
  return out;
}
