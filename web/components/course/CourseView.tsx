"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Course } from "@/lib/types";
import { dataUrl, fmtGpa, fmtInt, termLabel, termOrder, termRange } from "@/lib/format";
import { professorsFor, profDomId } from "@/lib/sections";
import { POSTED_IN, tabTerms } from "@/lib/terms";
import { rankProfs } from "@/lib/rank";
import type { ScorePriors } from "@/lib/score";
import { useWeights } from "@/lib/weights";
import GpaChart from "../GpaChart";
import GradeBar from "../GradeBar";
import Expandable from "../ui/Expandable";
import Icon from "../ui/Icon";
import Info from "../ui/Info";
import SectionHeader from "../ui/SectionHeader";
import CompareTable from "./CompareTable";
import { ExamList, ProfessorHeader, ProfessorRow } from "./ProfessorLedger";
import WeightsControl from "../WeightsControl";
import SectionsList from "./SectionsList";

export type CourseMeta = {
  next_term: string;
  current_term: string;
  rmp_status: string;
  repo_url: string;
  score_priors?: ScorePriors | null;
  /** terms Course Explorer has published (meta.json `terms`); others are greyed out (#140) */
  published?: string[];
  /** this course's line from summer.json (#122), shown on the summer tab instead of sections */
  summer?: { term: string; line: string | null } | null;
};

type Tab = { term: string; state: "open" | "none" | "summer" | "unpublished" };

const NAV = [
  ["professors", "Professors"],
  ["sections", "Sections"],
  ["grades", "Grades"],
] as const;

export default function CourseView({ subject, number, meta }: { subject: string; number: string; meta: CourseMeta }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [view, setView] = useState<"rows" | "compare">("rows");
  const [showPast, setShowPast] = useState(false);
  const [showAssistants, setShowAssistants] = useState(false);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [focusCrn, setFocusCrn] = useState<string | null>(null);
  const weights = useWeights();
  const hashRead = useRef(false);

  useEffect(() => {
    fetch(dataUrl(`course/${subject}/${number}.json`))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Course>;
      })
      .then((c) => {
        setCourse(c);
        const terms = Object.keys(c.terms);
        // A #crn-12345 link (search by CRN) opens the term that section is in.
        const crn = /^#crn-(\d{5})$/.exec(window.location.hash)?.[1];
        const crnTerm = crn ? terms.find((t) => c.terms[t].sections.some((s) => s.crn === crn)) : undefined;
        if (crnTerm) setFocusCrn(crn!);
        setTerm(crnTerm ?? (terms.includes(meta.next_term) && c.terms[meta.next_term].sections.length ? meta.next_term : (terms.sort((a, b) => termOrder(b) - termOrder(a))[0] ?? null)));
      })
      .catch((e: Error) => setError(e.message));
  }, [subject, number, meta.next_term]);

  const groups = useMemo(() => (course ? professorsFor(course, term) : null), [course, term]);
  const scored = useMemo(() => {
    if (!course || !groups) return null;
    return {
      profs: rankProfs(course, groups.profs, meta.score_priors, weights),
      assistants: rankProfs(course, groups.assistants, meta.score_priors, weights),
      past: rankProfs(course, groups.past, meta.score_priors, weights),
    };
  }, [course, groups, meta.score_priors, weights]);

  // Open a professor's row and bring it into view (from a section row or the compare table).
  const pickProf = useCallback(
    (key: string) => {
      if (!scored) return;
      setView("rows");
      if (scored.assistants.some((p) => p.key === key)) setShowAssistants(true);
      if (scored.past.some((p) => p.key === key)) setShowPast(true);
      setOpenKey(key);
      setScrollTo(key);
    },
    [scored],
  );
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById(profDomId(scrollTo));
    if (el) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      el.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus({ preventScroll: true });
    }
    setScrollTo(null);
  }, [scrollTo, view, showPast, showAssistants]);

  // A #prof-... link (the header's best pick, or a shared URL) opens that professor's row.
  useEffect(() => {
    if (!scored) return;
    const all = [...scored.profs, ...scored.assistants, ...scored.past];
    const fromHash = () => {
      const hit = all.find((p) => `#${profDomId(p.key)}` === window.location.hash);
      if (hit) pickProf(hit.key);
    };
    if (!hashRead.current) {
      hashRead.current = true;
      fromHash();
    }
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [scored, pickProf]);

  if (error)
    return (
      <p className="flex items-start gap-2 rounded border border-line p-3" role="alert">
        <Icon name="alert" className="mt-1 text-down" />
        <span>Couldn&apos;t load section and professor details ({error}). The summary above is still accurate; reload to try again.</span>
      </p>
    );
  // Reserve a screen of height while loading so the footer doesn't jump into view (layout shift).
  if (!course || !scored) return <p className="min-h-screen text-muted">Loading sections and professors…</p>;

  // The same tabs on every course page (#140): this term, next term, and the next summer and fall, plus any other term
  // this course's file has. A term not published yet is disabled; one with no sections for this course is greyed.
  const published = meta.published ?? Object.keys(course.terms);
  const tabs: Tab[] = [...new Set([...tabTerms(meta.current_term), ...Object.keys(course.terms)])]
    .sort((a, b) => termOrder(a) - termOrder(b))
    .map((t) => ({
      term: t,
      state: course.terms[t]?.sections.length
        ? "open"
        : published.includes(t)
          ? "none"
          : meta.summer?.term === t
            ? meta.summer.line
              ? "summer"
              : "none"
            : "unpublished",
    }));
  const openable = tabs.filter((x) => x.state !== "unpublished");
  const pick = (t: string) => {
    setTerm(t);
    setOpenKey(null);
  };
  const block = term ? course.terms[term] : null;
  const tabNote = (x: Tab) =>
    x.state === "unpublished"
      ? `${termLabel(x.term)} sections aren't out yet.${POSTED_IN[x.term.split("-")[1]] ? ` Course Explorer usually posts them in ${POSTED_IN[x.term.split("-")[1]]}.` : ""}`
      : x.state === "none"
        ? `Not offered in ${termLabel(x.term)}`
        : null;
  const ctx = { course, term, rmpStatus: meta.rmp_status };
  const toggle = (k: string) => setOpenKey((o) => (o === k ? null : k));
  const g = course.gpa;
  // The term switch sits in the sticky bar on wider screens and in the Professors heading on phones.
  // Arrow keys, Home and End move between the tabs that can be opened (the tablist pattern), selecting as they go.
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = openable.findIndex((x) => x.term === term);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: openable.length - 1 }[e.key];
    if (to === undefined || !openable.length) return;
    e.preventDefault();
    const next = openable[(to + openable.length) % openable.length].term;
    pick(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-term="${next}"]`)?.focus();
  };
  const termTabs = (cls: string) =>
    tabs.length > 0 && (
      <div className={`gap-1 overflow-x-auto ${cls}`} role="tablist" aria-label="Term" onKeyDown={onKey}>
        {tabs.map((x) => {
          const off = x.state === "unpublished";
          return (
            <button
              key={x.term}
              role="tab"
              type="button"
              data-term={x.term}
              data-state={x.state}
              aria-selected={x.term === term}
              aria-disabled={off || undefined}
              tabIndex={x.term === term ? 0 : -1}
              title={tabNote(x) ?? undefined}
              onClick={() => !off && pick(x.term)}
              className={`shrink-0 rounded px-2.5 py-1 text-sm font-semibold whitespace-nowrap ${
                x.term === term ? "bg-navy text-white" : off ? "cursor-not-allowed text-muted opacity-60" : x.state === "open" ? "text-action hover:bg-action-tint" : "text-muted hover:bg-action-tint"
              }`}
            >
              {termLabel(x.term)}
            </button>
          );
        })}
      </div>
    );
  const notes = tabs.filter((x) => x.state === "unpublished").map(tabNote);
  if (notes.length && course.pattern) notes.push(`${course.subject} ${course.number} is usually ${course.pattern.label.toLowerCase()}.`);

  return (
    <div>
      <nav aria-label="On this page" className="sticky top-[var(--site-header,0px)] z-30 -mx-4 transition-[top] duration-200 ease-out motion-reduce:transition-none mb-6 border-b border-line bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="flex items-center gap-x-4 overflow-x-auto py-2 sm:gap-x-6">
          <ul className="flex shrink-0 gap-x-4 sm:gap-x-5">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-sm font-semibold whitespace-nowrap text-action hover:underline sm:text-base">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          {termTabs("ml-auto hidden shrink-0 sm:flex")}
        </div>
      </nav>
      {notes.length > 0 && (
        <p className="-mt-4 mb-6 text-sm text-muted" data-testid="term-notes">
          {notes.join(" ")}
        </p>
      )}

      <div className="space-y-12">
        <section id="professors" aria-labelledby="professors-h" className="scroll-mt-16">
          <SectionHeader
            id="professors-h"
            title={term ? `Professors in ${termLabel(term)}` : "Professors"}
            actions={
              <>
                {termTabs("flex max-w-full sm:hidden")}
                {scored.profs.length > 1 ? (
                  <div className="inline-flex rounded border border-line p-0.5" role="group" aria-label="Layout">
                    {(
                      [
                        ["rows", "Rows", "rows"],
                        ["compare", "Compare", "table"],
                      ] as const
                    ).map(([v, label, icon]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={view === v}
                        onClick={() => setView(v)}
                        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-semibold ${view === v ? "bg-navy text-white" : "text-action hover:bg-action-tint"}`}
                      >
                        <Icon name={icon} />
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            }
            lead={
              g ? (
                <span>
                  All-time course average <span className="tnum font-semibold text-ink">{fmtGpa(g.avg)}</span>
                  <Info label="Source for the course average">
                    UIUC GPA dataset, {course.subject} {course.number}, {termRange(g.first_term, g.last_term)}, {fmtInt(g.students)} graded students. Each
                    professor&apos;s &ldquo;vs course&rdquo; compares them with the course in the same terms they taught.
                  </Info>
                  {scored.profs.some((p) => p.score.score !== null) ? " Professors are sorted by best pick score, highest first." : ""}
                </span>
              ) : (
                "No grade data for this course, so professors are compared on ratings and seats only."
              )
            }
          />
          {g && (
            <div className="mb-4 max-w-md">
              <GradeBar pct={g.pct} source={`UIUC GPA dataset, ${termRange(g.first_term, g.last_term)}, ${fmtInt(g.students)} students`} />
            </div>
          )}
          {!scored.profs.length ? (
            <p className="text-muted">No professors listed{term ? ` for ${termLabel(term)}` : ""} yet.</p>
          ) : view === "compare" ? (
            <CompareTable rows={scored.profs} onPick={pickProf} />
          ) : (
            <>
              <ProfessorHeader />
              <ul data-testid="professors">
                {scored.profs.map((p, i) => (
                  <ProfessorRow key={p.key} p={p} ctx={ctx} open={openKey === p.key} onToggle={() => toggle(p.key)} rank={scored.profs.length > 1 && p.score.score !== null ? i : undefined} />
                ))}
              </ul>
            </>
          )}
          <div className="mt-4 space-y-3">
            {scored.assistants.length > 0 && (
              <Expandable
                open={showAssistants}
                onToggle={setShowAssistants}
                summary={`Discussion and lab instructors (${scored.assistants.length})`}
              >
                <ul>
                  {scored.assistants.map((p) => (
                    <ProfessorRow key={p.key} p={p} ctx={ctx} open={openKey === p.key} onToggle={() => toggle(p.key)} />
                  ))}
                </ul>
              </Expandable>
            )}
            {scored.past.length > 0 && (
              <Expandable open={showPast} onToggle={setShowPast} summary={`Show past professors (${scored.past.length})`}>
                <ul>
                  {scored.past.map((p) => (
                    <ProfessorRow key={p.key} p={p} ctx={{ ...ctx, term: null }} open={openKey === p.key} onToggle={() => toggle(p.key)} />
                  ))}
                </ul>
              </Expandable>
            )}
            {meta.score_priors && scored.profs.length > 1 && <WeightsControl summary="How the best pick is scored" />}
          </div>
          <ReviewLine course={course} />
          {course.exam_course && (
            <div className="mt-6 max-w-3xl">
              <h3 className="text-lg font-semibold text-heading">Course format, from the catalog description</h3>
              <ExamList profile={course.exam_course} />
            </div>
          )}
        </section>

        <section id="sections" aria-labelledby="sections-h" className="scroll-mt-16">
          <SectionHeader
            id="sections-h"
            title={term ? `Sections in ${termLabel(term)}` : "Sections"}
            actions={
              <span className="inline-flex items-center">
                <a
                  href={dataUrl(`feeds/${course.subject}/${course.number}.xml`)}
                  className="inline-flex items-center gap-1.5 font-semibold text-action underline"
                  aria-label={`Seat changes for ${course.subject} ${course.number} (RSS feed)`}
                >
                  <Icon name="rss" />
                  Seat feed (RSS)
                </a>
                <Info label="About the seat feed">
                  Every open or closed change in the last three weeks. Add the feed to any feed reader, or to a Slack or Discord feed bot, to hear when
                  a section opens or closes. Status is checked about once a day, so confirm in Self-Service.
                </Info>
              </span>
            }
          />
          {term && meta.summer?.line && meta.summer.term === term && !block?.sections.length ? (
            <p data-testid="summer-tab">{meta.summer.line}</p>
          ) : !block || !block.sections.length ? (
            <p className="text-muted">
              Not offered in {termLabel(term ?? meta.next_term)}.{course.pattern ? ` Usual pattern: ${course.pattern.label}.` : ""}
            </p>
          ) : (
            <SectionsList
              course={course}
              term={term!}
              block={block}
              onPickProf={pickProf}
              focusCrn={focusCrn}
              watchable={term === meta.next_term || term === meta.current_term}
            />
          )}
        </section>

        <section id="grades" aria-labelledby="grades-h" className="scroll-mt-16">
          <SectionHeader id="grades-h" title="Grades over time" />
          {g && g.by_term.length > 0 ? <GpaChart gpa={g} /> : <p className="text-muted">No grade data for this course.</p>}
        </section>
      </div>
    </div>
  );
}

/** One line under Professors: students review a course on Rate My Professors, through their professor's page. */
function ReviewLine({ course }: { course: Course }) {
  return (
    <div className="mt-6 max-w-3xl" data-testid="review-block">
      <p className="text-muted">
        <span className="font-semibold text-ink">Took this course?</span> Open{" "}
        <a href="#professors" className="font-semibold text-action underline">
          your professor&apos;s row
        </a>
        , use{" "}
        <span className="font-semibold text-ink">Rate them on RMP</span> and pick {course.subject} {course.number} as the course.
      </p>
      {course.notes.length > 0 && (
        <ul className="mt-3 space-y-3">
          {course.notes.map((n, i) => (
            <li key={i}>
              <p className="text-sm text-muted">
                {n.instructor}
                {n.term ? `, ${termLabel(n.term)}` : ""}
              </p>
              <blockquote className="border-l-2 border-line pl-3">{n.text}</blockquote>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
