"use client";
import { useEffect, useMemo, useState } from "react";
import type { Course, ExamProfile, Instructor, Section, TermBlock } from "@/lib/types";
import {
  cisUrl,
  dataUrl,
  daysStr,
  fmtDate,
  fmtDelta,
  fmtGpa,
  fmtInt,
  fmtTime,
  SELF_SERVICE_URL,
  termLabel,
  termOrder,
  termRange,
} from "@/lib/format";
import CopyButton from "./CopyButton";
import GpaChart from "./GpaChart";
import GradeBar from "./GradeBar";
import Metric from "./Metric";

type MetaLite = { next_term: string; current_term: string; rmp_status: string; repo_url: string };

export default function CourseDetail({ subject, number, meta }: { subject: string; number: string; meta: MetaLite }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState<string | null>(null);

  useEffect(() => {
    fetch(dataUrl(`course/${subject}/${number}.json`))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Course>;
      })
      .then((c) => {
        setCourse(c);
        const terms = Object.keys(c.terms);
        setTerm(
          terms.includes(meta.next_term) && c.terms[meta.next_term].sections.length
            ? meta.next_term
            : (terms.sort((a, b) => termOrder(b) - termOrder(a))[0] ?? null),
        );
      })
      .catch((e: Error) => setError(e.message));
  }, [subject, number, meta.next_term]);

  if (error)
    return (
      <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-bad" role="alert">
        Couldn&apos;t load section and instructor details ({error}). The summary above is still accurate; reload to try again.
      </p>
    );
  // Reserve a screen of height while loading so the footer doesn't jump into view (layout shift).
  if (!course) return <p className="min-h-screen text-sm text-muted">Loading sections and instructors…</p>;

  const terms = Object.keys(course.terms).sort((a, b) => termOrder(b) - termOrder(a));
  const block = term ? course.terms[term] : null;
  return (
    <div className="space-y-8">
      <section aria-labelledby="sections-h">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="sections-h" className="text-xl font-bold">
            Sections
          </h2>
          {terms.length > 0 && (
            <div className="flex gap-1" role="tablist" aria-label="Term">
              {terms.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={t === term}
                  onClick={() => setTerm(t)}
                  className={`rounded px-3 py-1 text-sm ${t === term ? "bg-navy text-white" : "border border-line hover:bg-panel"}`}
                >
                  {termLabel(t)}
                </button>
              ))}
            </div>
          )}
        </div>
        {!block || !block.sections.length ? (
          <p className="mt-2 text-sm text-muted">
            Not offered in {termLabel(term ?? meta.next_term)}. {course.pattern ? `Usual pattern: ${course.pattern.label}.` : ""}
          </p>
        ) : (
          <SectionsTable course={course} term={term!} block={block} />
        )}
      </section>

      <InstructorsBlock course={course} term={term} meta={meta} />

      {course.gpa && course.gpa.by_term.length > 0 && (
        <section aria-labelledby="dist-h">
          <h2 id="dist-h" className="text-xl font-bold">
            Grades over time
          </h2>
          <div className="mt-2">
            <GpaChart gpa={course.gpa} />
          </div>
        </section>
      )}

      <section aria-labelledby="changes-h">
        <h2 id="changes-h" className="text-xl font-bold">
          What changed
        </h2>
        {course.changes.length ? (
          <ol className="mt-2 space-y-2 border-l-2 border-line pl-4">
            {course.changes.slice(0, 12).map((c, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold">{termLabel(c.term)}</span> · {c.summary}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted">No catalog changes between offerings since {termLabel(course.history[0]?.term)}.</p>
        )}
        <p className="mt-2 text-xs text-muted">
          Source: Course Explorer catalog records compared between consecutive fall/spring offerings.
        </p>
      </section>

      <NotesBlock course={course} repoUrl={meta.repo_url} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (!s) return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">Not published</span>;
  const restricted = s.includes("restricted");
  if (s.includes("closed")) return <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">Closed</span>;
  if (s.includes("open"))
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-xs font-medium ${restricted ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"}`}
      >
        {restricted ? "Open (Restricted)" : "Open"}
      </span>
    );
  return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{status}</span>;
}

function linkHint(sections: Section[]): string | null {
  const comps = [...new Set(sections.map((s) => s.component))];
  if (comps.length < 2) return null;
  const names = comps.map((c) =>
    c === "primary" ? "one lecture" : `one ${c === "DIS" ? "discussion" : c === "LAB" ? "lab" : c === "LBD" ? "lab-discussion" : c}`,
  );
  const grouped = sections.some((s) => s.group !== "*");
  return `Register for ${names.join(" + ")}${grouped ? " with the same first letter (e.g. AL1 + AD1)" : " (any combination)"}.`;
}

function SectionsTable({ course, term, block }: { course: Course; term: string; block: TermBlock }) {
  const sections = [...block.sections].sort(
    (a, b) =>
      (a.component === "primary" ? 0 : 1) - (b.component === "primary" ? 0 : 1) || a.code.localeCompare(b.code, "en", { numeric: true }),
  );
  const hint = linkHint(sections);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sections : sections.slice(0, 40);
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Seat status from the Course Explorer snapshot of <strong>{fmtDate(block.checked_at)}</strong>.
        </span>
        <a className="font-medium text-brand-dark underline" href={SELF_SERVICE_URL} rel="noopener">
          Register in Self-Service ↗
        </a>
      </div>
      {hint && <p className="mt-1 text-sm">{hint}</p>}
      <div className="mt-2 hidden grid-cols-[5.5rem_6.5rem_1fr_1fr_1fr_7rem] gap-2 border-b border-line px-2 pb-1 text-xs font-semibold text-muted md:grid">
        <span>CRN</span>
        <span>Section</span>
        <span>Time</span>
        <span>Location</span>
        <span>Instructor</span>
        <span>Status</span>
      </div>
      <ul className="divide-y divide-line">
        {visible.map((s) => (
          <li
            key={s.crn}
            className="grid grid-cols-2 gap-x-2 gap-y-1 px-2 py-2 text-sm md:grid-cols-[5.5rem_6.5rem_1fr_1fr_1fr_7rem] md:items-start"
          >
            <span>
              <CopyButton text={s.crn} label={s.crn} />
            </span>
            <span className="text-right md:text-left">
              <span className="font-medium">{s.code}</span>{" "}
              <span className="text-xs text-muted" title={s.type_name}>
                {s.type}
              </span>
              {s.part !== "1" && (
                <span className="ml-1 rounded bg-panel px-1 text-[11px]" title="Part of term">
                  {s.part === "A" ? "1st half" : s.part === "B" ? "2nd half" : s.part}
                </span>
              )}
              {s.special && (
                <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] text-amber-900" title={s.special}>
                  special
                </span>
              )}
            </span>
            <span className="col-span-2 md:col-span-1">
              {s.meetings.map((m, i) => (
                <span key={i} className="block">
                  {m.s === null ? (
                    <span className="text-muted">{s.type.startsWith("O") || s.type === "ONL" ? "Online, no set time" : "Arranged"}</span>
                  ) : (
                    `${daysStr(m.d)} ${fmtTime(m.s)}–${fmtTime(m.e)}`
                  )}
                </span>
              ))}
            </span>
            <span className="text-muted md:text-ink">
              {s.meetings.map((m, i) => (
                <span key={i} className="block">
                  {m.b ? `${m.r} ${m.b}` : "—"}
                </span>
              ))}
            </span>
            <span className="text-right md:text-left">
              {s.instructors_raw.length ? s.instructors_raw.join("; ") : <span className="text-muted">TBA</span>}
            </span>
            <span className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1 md:flex-col md:items-start md:gap-1">
              {statusBadge(s.status)}
              <a className="text-xs text-brand-dark underline" href={cisUrl(term, course.subject, course.number, s.crn)} rel="noopener">
                Check live seats ↗
              </a>
            </span>
          </li>
        ))}
      </ul>
      {sections.length > 40 && (
        <button className="mt-2 text-sm text-brand-dark underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${sections.length} sections`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------

const EXAM_LABELS: Record<string, string> = {
  n_midterms: "Midterms",
  has_final: "Final exam",
  exam_mode: "Exam format",
  curve: "Curve",
  attendance_required: "Attendance required",
  homework_platform: "Homework platform",
  group_projects: "Group projects",
  textbook_required: "Textbook required",
};

function ExamSummary({ profile }: { profile: ExamProfile }) {
  const known = Object.entries(profile).filter(([, v]) => v.value !== "unknown");
  if (!known.length) return null;
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {known.map(([k, v]) => (
        <div key={k}>
          <dt className="text-muted">{EXAM_LABELS[k] ?? k}</dt>
          <dd>
            <Metric source={`${v.agree} of ${v.total} source(s) agree. ${v.evidence.map((e) => `${e.source}: “${e.quote}”`).join(" ")}`}>
              {Array.isArray(v.value) ? v.value.join(", ") : String(v.value)}
            </Metric>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function rmpSearchUrl(name: string): string {
  return `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(name + " University of Illinois")}`;
}

function InstructorCard({ course, ins, rmpStatus }: { course: Course; ins: Instructor; rmpStatus: string }) {
  const g = ins.gpa;
  const delta = g?.delta ?? null;
  const deltaCls = delta === null || Math.abs(delta) < 0.005 ? "text-muted" : delta > 0 ? "text-good" : "text-bad";
  const gpaSource = g
    ? `UIUC GPA dataset, ${course.subject} ${course.number} with this instructor, ${termRange(g.first_term, g.last_term)}, ${fmtInt(g.students)} students over ${g.n_terms} term(s)`
    : "";
  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{ins.name}</h3>
          <p className="text-xs text-muted">Teaching {ins.teaching.map(termLabel).join(", ")}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {g?.limited && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">Limited data</span>}
          {ins.tre.length > 0 && (
            <span
              className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-900"
              title={`Teachers Ranked as Excellent: ${ins.tre.join(", ")}`}
            >
              ★ Ranked excellent ×{ins.tre.length}
            </span>
          )}
        </div>
      </div>
      {g ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span>
              GPA{" "}
              <Metric source={gpaSource} className="text-lg font-bold">
                {fmtGpa(g.avg)}
              </Metric>
              {g.recent !== null && g.avg !== null && Math.abs((g.recent ?? 0) - (g.avg ?? 0)) >= 0.01 && (
                <span className="ml-1 text-xs text-muted">(recent {fmtGpa(g.recent)})</span>
              )}
            </span>
            <span className={deltaCls}>
              <Metric
                source={`Difference from the ${course.subject} ${course.number} average in the same terms (grade disparity). Source: UIUC GPA dataset.`}
              >
                {fmtDelta(delta)} vs course, same terms
              </Metric>
            </span>
            <span className="text-xs text-muted">{fmtInt(g.students)} students</span>
          </div>
          <GradeBar pct={g.pct} source={gpaSource} compact />
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          No grades on record for this instructor in {course.subject} {course.number}. The GPA dataset names one primary instructor per
          section, and new instructors appear only after their first term is published.
        </p>
      )}
      <div className="mt-3 border-t border-line pt-2 text-sm">
        {ins.rmp && ins.rmp.num_ratings === 0 ? (
          <p className="text-xs text-muted">
            On Rate My Professors but no ratings yet.{" "}
            <a href={ins.rmp.url} className="text-brand-dark underline" rel="noopener">
              Rate My Professors page ↗
            </a>
          </p>
        ) : ins.rmp ? (
          <div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Metric source={`Rate My Professors, ${fmtInt(ins.rmp.num_ratings)} ratings, fetched ${fmtDate(ins.rmp.fetched_at)}`}>
                Quality {ins.rmp.rating?.toFixed(1) ?? "–"}/5
              </Metric>
              <span>Difficulty {ins.rmp.difficulty?.toFixed(1) ?? "–"}/5</span>
              <span>Would take again {ins.rmp.would_take_again === null ? "–" : `${Math.round(ins.rmp.would_take_again)}%`}</span>
              <span className="text-muted">{fmtInt(ins.rmp.num_ratings)} ratings</span>
            </div>
            {ins.rmp.tags.length > 0 && <p className="mt-1 text-xs text-muted">{ins.rmp.tags.join(" · ")}</p>}
            {ins.rmp.reviews.map((r, i) => (
              <blockquote key={i} className="mt-1 border-l-2 border-line pl-2 text-xs">
                “{r.text}”{" "}
                <span className="text-muted">
                  ({r.course} {r.date})
                </span>
              </blockquote>
            ))}
            <a href={ins.rmp.url} className="mt-1 inline-block text-xs text-brand-dark underline" rel="noopener">
              Rate My Professors page ↗
            </a>
          </div>
        ) : (
          <p className="text-xs text-muted">
            {rmpStatus.startsWith("unavailable") ? "RMP unavailable in this build. " : "No confident RMP match. "}
            <a href={rmpSearchUrl(ins.name)} className="text-brand-dark underline" rel="noopener">
              Search Rate My Professors ↗
            </a>
          </p>
        )}
      </div>
      {ins.exam && <ExamSummary profile={ins.exam} />}
    </li>
  );
}

function InstructorsBlock({ course, term, meta }: { course: Course; term: string | null; meta: MetaLite }) {
  const [showPast, setShowPast] = useState(false);
  const entries = Object.entries(course.instructors);
  const current = useMemo(
    () =>
      entries
        .filter(([, i]) => term && i.teaching.includes(term))
        .sort(([, a], [, b]) => (b.gpa?.recent ?? b.gpa?.avg ?? -1) - (a.gpa?.recent ?? a.gpa?.avg ?? -1)),
    [entries, term],
  );
  const past = entries
    .filter(([, i]) => i.gpa && !(term && i.teaching.includes(term)))
    .sort(([, a], [, b]) => (b.gpa?.delta ?? 0) - (a.gpa?.delta ?? 0));
  return (
    <section aria-labelledby="inst-h">
      <h2 id="inst-h" className="text-xl font-bold">
        Instructors {term ? `· ${termLabel(term)}` : ""}
      </h2>
      {course.gpa && (
        <p className="mt-1 text-sm text-muted">
          All-time course average{" "}
          <Metric
            source={`UIUC GPA dataset, ${termRange(course.gpa.first_term, course.gpa.last_term)}, ${fmtInt(course.gpa.students)} students`}
          >
            {fmtGpa(course.gpa.avg)}
          </Metric>{" "}
          ({termRange(course.gpa.first_term, course.gpa.last_term)}). Each card&apos;s ± compares that instructor with the course in the
          terms they taught (grading changes over the years, so this is fairer than the all-time average): green = grades higher, red = lower.
        </p>
      )}
      {course.gpa && (
        <div className="mt-2 max-w-md">
          <GradeBar pct={course.gpa.pct} source={`UIUC GPA dataset, ${termRange(course.gpa.first_term, course.gpa.last_term)}`} />
        </div>
      )}
      {current.length ? (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {current.map(([k, ins]) => (
            <InstructorCard key={k} course={course} ins={ins} rmpStatus={meta.rmp_status} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No instructors listed{term ? ` for ${termLabel(term)}` : ""} yet.</p>
      )}
      {course.exam_course && (
        <div className="mt-3 rounded border border-line p-3">
          <h3 className="text-sm font-semibold">Course format (from the catalog description)</h3>
          <ExamSummary profile={course.exam_course} />
        </div>
      )}
      {past.length > 0 && (
        <div className="mt-3">
          <button className="text-sm text-brand-dark underline" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
            {showPast ? "Hide" : "Show"} {past.length} past instructor{past.length > 1 ? "s" : ""} (grade disparity)
          </button>
          {showPast && (
            <ul className="mt-2 divide-y divide-line text-sm">
              {past.map(([k, ins]) => (
                <li key={k} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                  <span className="min-w-[10rem] flex-1 font-medium">{ins.name}</span>
                  <span>GPA {fmtGpa(ins.gpa!.avg)}</span>
                  <span
                    className={(ins.gpa!.delta ?? 0) > 0.005 ? "text-good" : (ins.gpa!.delta ?? 0) < -0.005 ? "text-bad" : "text-muted"}
                  >
                    {fmtDelta(ins.gpa!.delta)}
                  </span>
                  <span className="text-xs text-muted">
                    {fmtInt(ins.gpa!.students)} students, {termRange(ins.gpa!.first_term, ins.gpa!.last_term)}
                    {ins.gpa!.limited ? " · limited data" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
      <h2 id="notes-h" className="text-xl font-bold">
        Student notes
      </h2>
      {course.notes.length ? (
        <ul className="mt-2 space-y-2">
          {course.notes.map((n, i) => (
            <li key={i} className="rounded border border-line p-2 text-sm">
              “{n.text}”{" "}
              <span className="text-xs text-muted">
                {n.instructor} {n.term && `· ${termLabel(n.term)}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No student notes yet for this course.</p>
      )}
      <a href={href} className="mt-2 inline-block text-sm text-brand-dark underline" rel="noopener">
        Suggest a note (opens a GitHub issue) ↗
      </a>
    </section>
  );
}
