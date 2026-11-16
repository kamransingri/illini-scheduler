"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Course } from "@/lib/types";
import { dataUrl, fmtGpa, fmtInt, seatVerb, fmtAgo, termLabel, termOrder, termRange } from "@/lib/format";
import { professorsFor, profDomId } from "@/lib/sections";
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

export type CourseMeta = { next_term: string; current_term: string; rmp_status: string; repo_url: string; score_priors?: ScorePriors | null };

const NAV = [
  ["professors", "Professors"],
  ["sections", "Sections"],
  ["grades", "Grades"],
  ["changes", "What changed"],
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
        setTerm(terms.includes(meta.next_term) && c.terms[meta.next_term].sections.length ? meta.next_term : (terms.sort((a, b) => termOrder(b) - termOrder(a))[0] ?? null));
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

  const terms = Object.keys(course.terms).sort((a, b) => termOrder(b) - termOrder(a));
  const block = term ? course.terms[term] : null;
  const ctx = { course, term, rmpStatus: meta.rmp_status };
  const toggle = (k: string) => setOpenKey((o) => (o === k ? null : k));
  const g = course.gpa;
  // The term switch sits in the sticky bar on wider screens and in the Professors heading on phones.
  const termTabs = (cls: string) =>
    terms.length > 0 && (
      <div className={`gap-1 ${cls}`} role="tablist" aria-label="Term">
        {terms.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={t === term}
            onClick={() => {
              setTerm(t);
              setOpenKey(null);
            }}
            className={`rounded px-2.5 py-1 text-sm font-semibold whitespace-nowrap ${t === term ? "bg-navy text-white" : "text-action hover:bg-action-tint"}`}
          >
            {termLabel(t)}
          </button>
        ))}
      </div>
    );

  return (
    <div>
      <nav aria-label="On this page" className="sticky top-0 z-30 -mx-4 mb-6 border-b border-line bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="flex items-center gap-x-4 overflow-x-auto py-2 sm:gap-x-6">
          <ul className="flex shrink-0 gap-x-4 sm:gap-x-5">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-sm font-semibold whitespace-nowrap text-action hover:underline sm:text-base">
                  {id === "changes" ? (
                    <>
                      <span className="sm:hidden">Changes</span>
                      <span className="hidden sm:inline">{label}</span>
                    </>
                  ) : (
                    label
                  )}
                </a>
              </li>
            ))}
          </ul>
          {termTabs("ml-auto hidden shrink-0 sm:flex")}
        </div>
      </nav>

      <div className="space-y-12">
        <section id="professors" aria-labelledby="professors-h" className="scroll-mt-16">
          <SectionHeader
            id="professors-h"
            title={term ? `Professors in ${termLabel(term)}` : "Professors"}
            actions={
              <>
                {termTabs("flex sm:hidden")}
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
          {meta.score_priors && scored.profs.length > 1 && <WeightsControl className="mb-4" />}
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
          </div>
          {course.exam_course && (
            <div className="mt-6 max-w-3xl">
              <h3 className="text-lg font-semibold text-heading">Course format, from the catalog description</h3>
              <ExamList profile={course.exam_course} />
            </div>
          )}
        </section>

        <section id="sections" aria-labelledby="sections-h" className="scroll-mt-16">
          <SectionHeader id="sections-h" title={term ? `Sections in ${termLabel(term)}` : "Sections"} />
          {!block || !block.sections.length ? (
            <p className="text-muted">
              Not offered in {termLabel(term ?? meta.next_term)}.{course.pattern ? ` Usual pattern: ${course.pattern.label}.` : ""}
            </p>
          ) : (
            <SectionsList course={course} term={term!} block={block} onPickProf={pickProf} />
          )}
        </section>

        <section id="grades" aria-labelledby="grades-h" className="scroll-mt-16">
          <SectionHeader id="grades-h" title="Grades over time" />
          {g && g.by_term.length > 0 ? <GpaChart gpa={g} /> : <p className="text-muted">No grade data for this course.</p>}
        </section>

        <section id="changes" aria-labelledby="changes-h" className="scroll-mt-16">
          <SectionHeader
            id="changes-h"
            title={
              <span className="inline-flex items-center gap-1">
                What changed
                <Info label="How changes are found">
                  Course Explorer catalog records compared between consecutive fall and spring offerings: description, credit hours, prerequisites,
                  gen-ed codes, delivery mode and new instructors.
                </Info>
              </span>
            }
          />
          {course.changes.length ? (
            <ol className="max-w-3xl">
              {course.changes.slice(0, 12).map((c, i) => (
                <li key={i} className="grid grid-cols-[7.5rem_1fr] gap-x-4 border-b border-line py-2">
                  <span className="font-semibold text-heading">{termLabel(c.term)}</span>
                  <span>{c.summary}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted">No catalog changes between offerings since {termLabel(course.history[0]?.term)}.</p>
          )}
        </section>

        <SeatChanges course={course} />
        <NotesBlock course={course} repoUrl={meta.repo_url} />
      </div>
    </div>
  );
}

function SeatChanges({ course }: { course: Course }) {
  const events = course.seat_events ?? [];
  const feed = dataUrl(`feeds/${course.subject}/${course.number}.xml`);
  return (
    <section aria-labelledby="seats-h">
      <SectionHeader
        id="seats-h"
        title="Seat changes"
        actions={
          <a href={feed} className="inline-flex items-center gap-1.5 font-semibold text-action underline">
            <Icon name="rss" />
            Watch seats for {course.subject} {course.number} (RSS)
          </a>
        }
        lead={
          <span className="inline-flex flex-wrap items-center">
            Open and closed changes in the last three weeks.
            <Info label="About seat changes and the feed">
              Status is checked about once a day, so confirm in Self-Service. Add the RSS feed to any feed reader, or to a Slack or Discord feed bot,
              to hear when a section opens or closes.
            </Info>
          </span>
        }
      />
      {events.length ? (
        <ul className="max-w-3xl" data-testid="seat-events">
          {events.slice(0, 15).map((e) => {
            const verb = seatVerb(e.old, e.new);
            return (
              <li key={e.term + e.crn + e.at} className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-line py-2">
                <span>
                  <span className="font-semibold">
                    {e.code} {verb}
                  </span>{" "}
                  <span className="text-muted">
                    {e.old} to {e.new}, CRN {e.crn}, {termLabel(e.term)}
                  </span>
                </span>
                <span className="text-sm text-muted">{fmtAgo(e.at)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted">No open or closed changes recorded in the last three weeks.</p>
      )}
    </section>
  );
}

function NotesBlock({ course, repoUrl }: { course: Course; repoUrl: string }) {
  const title = `Note for ${course.subject} ${course.number}`;
  const body = `Course: ${course.subject} ${course.number}\nInstructor (as on Course Explorer):\nTerm taken (e.g. 2026-fa):\n\nWhat should other students know? (exams, CBTF, curve, attendance, homework platform, projects, textbook)\n\n`;
  const href = `${repoUrl}/issues/new?labels=student-note&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  return (
    <section aria-labelledby="notes-h">
      <SectionHeader
        id="notes-h"
        title="Student notes"
        actions={
          <a href={href} className="inline-flex items-center gap-1 font-semibold text-action underline" rel="noopener">
            Suggest a note
            <Icon name="external" />
          </a>
        }
      />
      {course.notes.length ? (
        <ul className="max-w-3xl space-y-3">
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
      ) : (
        <p className="text-muted">No student notes yet. Notes are added from GitHub issues after review.</p>
      )}
    </section>
  );
}
