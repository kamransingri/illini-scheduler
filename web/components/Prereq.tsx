"use client";
// Prerequisites in the degree checklist (#21): a course option's status next to the catalog's own words, and the
// courses you can take next.
import Link from "next/link";
import { useMemo, useState } from "react";
import { options, rankCourse, type Degree, type DegreeCourse, type GroupResult } from "@/lib/degree";
import { courseHref, termLabel } from "@/lib/format";
import { checkPrereq, prereqOf, type PreCheck } from "@/lib/prereq";
import type { ScorePriors } from "@/lib/score";
import type { useWeights } from "@/lib/weights";

const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function prereqLabel(c: PreCheck): string {
  if (c.status === "met") return "Prerequisites met";
  if (c.status === "with") return `Prerequisites met if you take ${list(c.alongside)} at the same time`;
  if (c.status === "no") return `Prerequisites not met: needs ${c.missing}`;
  return `Prerequisites: can't tell${c.consent ? " (consent of the instructor may do)" : ""}`;
}

/** The status, then the catalog's sentence, always. */
export function PrereqLine({ text, taken }: { text: string | undefined; taken: Set<string> }) {
  const t = (text ?? "").trim();
  if (!t) return null;
  const p = prereqOf(t);
  const c = checkPrereq(p, taken);
  return (
    <span className="block" data-prereq={c.status}>
      <span className={`font-semibold ${c.status === "no" ? "text-ink" : "text-heading"}`}>{prereqLabel(c)}.</span> <span className="text-muted">Catalog:</span> {t}
      {p.more && <span className="text-muted"> Sections may add more.</span>}
    </span>
  );
}

type Next = { code: string; course: DegreeCourse; groups: string[]; check: PreCheck; score: number };
const SHOW = 8;

/**
 * Courses on the program's open requirements (its own, not gen-eds) whose prerequisites My courses meet, with courses
 * in progress counted as done. Only courses offered next term, once the term's schedule is out.
 */
export function NextCourses({
  results,
  deg,
  taken,
  nextTerm,
  priors,
  weights,
}: {
  results: GroupResult[];
  deg: Degree;
  taken: Set<string>;
  nextTerm: string;
  priors: ScorePriors | null;
  weights: ReturnType<typeof useWeights>;
}) {
  const [all, setAll] = useState(false);
  const { ready, unclear, scheduled } = useMemo(() => {
    const by = new Map<string, Next>();
    for (const r of results) {
      if (r.status === "done" || r.status === "in_progress" || r.group.rule === "manual" || r.group.kind !== "program") continue;
      for (const code of options(r, deg, taken)) {
        const course = deg.courses[code];
        if (!course?.page) continue;
        const seen = by.get(code);
        if (seen) {
          if (!seen.groups.includes(r.group.name)) seen.groups.push(r.group.name);
          continue;
        }
        const score = rankCourse(code, course, priors, weights).score?.score ?? -1;
        by.set(code, { code, course, groups: [r.group.name], check: checkPrereq(prereqOf(course.pre), taken), score });
      }
    }
    const xs = [...by.values()];
    const scheduled = xs.some((x) => x.course.nx);
    const offered = scheduled ? xs.filter((x) => x.course.nx) : xs;
    return {
      ready: offered.filter((x) => x.check.status === "met" || x.check.status === "with").sort((a, b) => b.score - a.score || (b.course.gpa ?? 0) - (a.course.gpa ?? 0)),
      unclear: offered.filter((x) => x.check.status === "unclear").length,
      scheduled,
    };
  }, [results, deg, taken, priors, weights]);

  const shown = all ? ready : ready.slice(0, SHOW);
  return (
    <section className="mt-6 rounded bg-panel p-4" aria-labelledby={`next-${deg.id}`} data-testid="next-courses">
      <h3 id={`next-${deg.id}`} className="font-display text-lg font-bold text-heading">
        You can take next
      </h3>
      <p className="text-sm text-muted">
        Courses on your major&apos;s open requirements whose prerequisites your courses meet (courses in progress count as done)
        {scheduled ? `, offered in ${termLabel(nextTerm)}` : ""}. Best picks first. Prerequisites are read from the catalog&apos;s sentence: check it before
        you register.
      </p>
      {ready.length === 0 ? (
        <p className="mt-2">Nothing yet: add the courses you&apos;ve finished to My courses.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {shown.map((x) => {
            const [s, n] = x.code.split(" ");
            return (
              <li key={x.code} data-code={x.code}>
                <Link href={courseHref(s, n)} className="font-semibold text-action underline">
                  {x.code}
                </Link>{" "}
                {x.course.t} <span className="text-sm text-muted">· {x.groups.join(", ")}</span>
                {x.check.status === "with" && <span className="text-sm"> · take with {list(x.check.alongside)}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {ready.length > SHOW && (
        <button type="button" className="mt-2 font-semibold text-action underline" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${ready.length}`}
        </button>
      )}
      {unclear > 0 && (
        <p className="mt-2 text-sm text-muted" data-testid="next-unclear">
          {unclear} more {unclear === 1 ? "course" : "courses"} on your requirements {unclear === 1 ? "has" : "have"} prerequisites the site can&apos;t check (consent of the
          instructor, &ldquo;or equivalent&rdquo;, class standing): see them under each requirement.
        </p>
      )}
    </section>
  );
}
