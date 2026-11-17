"use client";
import { useMemo, useState } from "react";
import type { Course, ExamProfile, Section } from "@/lib/types";
import { cisUrl, daysStr, fmtDate, fmtGpa, fmtInt, fmtPct, fmtTime, termLabel, termRange, treLabel } from "@/lib/format";
import { normCourse, profDomId, type ProfEntry } from "@/lib/sections";
import type { Scored } from "@/lib/rank";
import CopyButton from "../CopyButton";
import GradeBar from "../GradeBar";
import { Badge, Delta, SeatStatus } from "../ui/Badge";
import Icon from "../ui/Icon";
import Info from "../ui/Info";
import ScoreBreakdown from "./ScoreBreakdown";

type Ctx = { course: Course; term: string | null; rmpStatus: string };

// Desktop column grid shared by the header row and every professor row, so numbers line up down the page.
const GRID = "md:grid md:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_7.5rem_4rem_4.5rem_4rem_6.5rem_1.75rem] md:items-center md:gap-x-3";

export function rmpSearchUrl(name: string): string {
  return `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(name + " University of Illinois")}`;
}

/**
 * RMP's "rate this professor" form for a stored profile URL (".../professor/209729" -> ".../add/professor-rating/209729").
 * RMP has no posting API, so the site can only send people there; new ratings come back through the nightly RMP job.
 * Anything that isn't a profile URL is returned as it is.
 */
export function rmpRateUrl(profileUrl: string): string {
  const m = /^https:\/\/www\.ratemyprofessors\.com\/professor\/(\d+)\/?$/.exec(profileUrl);
  return m ? `https://www.ratemyprofessors.com/add/professor-rating/${m[1]}` : profileUrl;
}

/** "Rate on RMP" for a matched professor: opens RMP's rating form in a new tab. */
function RateLink({ name, url, className = "" }: { name: string; url: string; className?: string }) {
  return (
    <a
      href={rmpRateUrl(url)}
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center gap-1 text-sm font-semibold text-action underline ${className}`}
      aria-label={`Rate ${name} on Rate My Professors (opens in a new tab)`}
      data-testid="rate-on-rmp"
    >
      Rate on RMP
      <Icon name="external" />
    </a>
  );
}

function gpaSource(course: Course, p: ProfEntry): string {
  const g = p.ins.gpa!;
  return `UIUC GPA dataset: ${course.subject} ${course.number} with this professor, ${termRange(g.first_term, g.last_term)}, ${fmtInt(g.students)} graded students over ${g.n_terms} term${g.n_terms === 1 ? "" : "s"}. Recent (last 8 fall/spring terms): ${fmtGpa(g.recent)}.`;
}

export function ProfessorHeader() {
  return (
    <div className={`hidden border-b border-line pb-2 text-sm text-muted ${GRID}`} aria-hidden>
      <span>Professor</span>
      <span className="text-right">GPA here</span>
      <span className="text-right">vs course</span>
      <span>Grades</span>
      <span className="text-right">Quality</span>
      <span className="text-right">Difficulty</span>
      <span className="text-right">Again</span>
      <span>This term</span>
      <span />
    </div>
  );
}

function Cell({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="block text-sm text-muted md:sr-only">{label}</span>
      {children}
    </div>
  );
}

function TermLoad({ p, term }: { p: ProfEntry; term: string | null }) {
  if (!term || !p.sections.length) return <span className="text-muted">{p.ins.gpa ? `Last taught ${termLabel(p.ins.gpa.last_term)}` : "–"}</span>;
  const n = p.lectures || p.sections.length;
  const kind = p.lectures ? "lecture" : "section";
  return (
    <span className="block leading-tight">
      <span className="tnum">
        {n} {kind}
        {n === 1 ? "" : "s"}
      </span>
      <span className="block text-sm text-muted tnum">{p.tally.known ? `${p.tally.open} open` : "status not published"}</span>
    </span>
  );
}

export function ProfessorRow({ p, ctx, open, onToggle, rank }: { p: Scored; ctx: Ctx; open: boolean; onToggle: () => void; rank?: number }) {
  const { course } = ctx;
  const g = p.ins.gpa;
  const r = p.ins.rmp && p.ins.rmp.num_ratings > 0 ? p.ins.rmp : null;
  const panelId = `${profDomId(p.key)}-panel`;
  return (
    <li id={profDomId(p.key)} className="scroll-mt-28 border-b border-line" data-testid="prof-row">
      <div
        className={`grid grid-cols-3 gap-x-3 gap-y-2 py-3 ${GRID} ${open ? "bg-panel" : "hover:bg-panel/60"} cursor-pointer px-2 md:px-2`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, a, [role=tooltip]")) return;
          onToggle();
        }}
      >
        <div className="col-span-3 min-w-0 md:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <button type="button" className="text-left text-lg font-semibold text-heading hover:underline" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
              {p.ins.name}
            </button>
            <span className="md:hidden">
              <Icon name="chevronDown" className={`mt-1.5 text-action ${open ? "rotate-180" : ""}`} />
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {p.score.score !== null && (
              <span className="inline-flex items-center text-sm">
                <span className={`tnum rounded px-1.5 font-semibold leading-6 ${rank === 0 ? "bg-navy text-white" : "bg-action-tint text-heading"}`}>
                  {rank === 0 ? "Best pick " : "Score "}
                  {p.score.score}
                </span>
                <Info label={`How ${p.ins.name}'s score is worked out`}>
                  <ScoreBreakdown result={p.score} />
                </Info>
              </span>
            )}
            {p.ins.tre.length > 0 && (
              <Badge icon="award" title={`Teachers Ranked as Excellent: ${p.ins.tre.map(treLabel).join("; ")}`}>
                Ranked excellent ×{p.ins.tre.length}
              </Badge>
            )}
            {g?.limited && <Badge title="Fewer than 60 graded students with this professor in this course">Limited data</Badge>}
            {!g && <Badge title="No grades on record for this professor in this course yet">No grade history</Badge>}
          </div>
        </div>
        <Cell label="GPA here" className={`md:text-right ${g ? "" : "hidden md:block"}`}>
          {g ? (
            <span className="inline-flex items-center md:justify-end">
              <span className="tnum text-lg font-semibold text-heading">{fmtGpa(g.avg)}</span>
              <Info label={`Source for ${p.ins.name}'s GPA`}>{gpaSource(course, p)}</Info>
            </span>
          ) : (
            <span className="text-muted">–</span>
          )}
        </Cell>
        <Cell label="vs course" className={`md:text-right ${g ? "" : "hidden md:block"}`}>
          {g ? (
            <span className="inline-flex items-center md:justify-end">
              <Delta value={g.delta} />
              <Info label="What vs course means">
                {p.ins.name}&apos;s GPA minus the {course.subject} {course.number} average in the same terms they taught (grade disparity), so
                grading trends over the years don&apos;t count against anyone. Green is higher, red is lower.
              </Info>
            </span>
          ) : (
            <span className="text-muted">–</span>
          )}
        </Cell>
        <Cell label="Grades" className={`col-span-3 md:col-span-1 ${g ? "" : "hidden md:block"}`}>
          {g ? <GradeBar pct={g.pct} source={gpaSource(course, p)} compact /> : <span className="text-muted">–</span>}
        </Cell>
        {r ? (
          <>
            <Cell label="Quality" className="md:text-right">
              <span className="block leading-tight">
                <span className="tnum text-lg font-semibold text-heading">{r.rating?.toFixed(1) ?? "–"}</span>
                <span className="block text-sm text-muted tnum">{fmtInt(r.num_ratings)} ratings</span>
                <RateLink name={p.ins.name} url={r.url} className="md:hidden" />
              </span>
            </Cell>
            <Cell label="Difficulty" className="md:text-right">
              <span className="tnum">{r.difficulty?.toFixed(1) ?? "–"}</span>
            </Cell>
            <Cell label="Would take again" className="md:text-right">
              <span className="tnum">{r.would_take_again !== null ? `${Math.round(r.would_take_again)}%` : "–"}</span>
            </Cell>
          </>
        ) : (
          <Cell label="Rate My Professors" className="col-span-3 md:text-center">
            <span className="text-muted">{ctx.rmpStatus.startsWith("unavailable") ? "RMP unavailable in this build" : p.ins.rmp ? "On RMP, no ratings yet" : "No RMP match"}</span>
            {p.ins.rmp && <RateLink name={p.ins.name} url={p.ins.rmp.url} className="ml-2" />}
          </Cell>
        )}
        <Cell label={ctx.term ? termLabel(ctx.term) : "This term"}>
          <TermLoad p={p} term={ctx.term} />
        </Cell>
        <div className="hidden md:block">
          <button type="button" className="inline-flex size-7 items-center justify-center rounded text-action" aria-label={`${open ? "Hide" : "Show"} details for ${p.ins.name}`} aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
            <Icon name="chevronDown" className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      <div id={panelId} hidden={!open} className="bg-panel px-2 pb-5">
        {open && <ProfessorPanel p={p} ctx={ctx} />}
      </div>
    </li>
  );
}

function SectionMini({ s, course, term }: { s: Section; course: Course; term: string }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CopyButton text={s.crn} label={s.crn} />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{s.code}</span> <span className="text-sm text-muted">{s.type_name || s.type}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <SeatStatus status={s.status} known={course.terms[term]?.status_known} title={s.status_at ? `Checked ${fmtDate(s.status_at)}` : undefined} />
          <a className="inline-flex items-center gap-1 text-sm text-action underline" href={cisUrl(term, course.subject, course.number, s.crn)} rel="noopener">
            Live seats
            <Icon name="external" />
          </a>
        </span>
      </div>
      <div className="mt-1 tnum">
        {s.meetings.length
          ? s.meetings.map((m, i) => (
              <span key={i} className="block">
                {m.s === null ? "Online or arranged" : `${daysStr(m.d)} ${fmtTime(m.s)}–${fmtTime(m.e)}`}
                {m.b ? <span className="text-muted">, {`${m.r} ${m.b}`.trim()}</span> : null}
              </span>
            ))
          : <span className="text-muted">No meeting listed</span>}
      </div>
    </li>
  );
}

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

export function ExamList({ profile }: { profile: ExamProfile }) {
  const known = Object.entries(profile).filter(([, v]) => v.value !== "unknown");
  if (!known.length) return null;
  return (
    <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
      {known.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-2 border-b border-line py-1">
          <dt className="text-muted">{EXAM_LABELS[k] ?? k}</dt>
          <dd className="inline-flex items-center font-semibold">
            {Array.isArray(v.value) ? v.value.join(", ") : String(v.value)}
            <Info label={`Evidence for ${EXAM_LABELS[k] ?? k}`}>
              {v.agree} of {v.total} source{v.total === 1 ? "" : "s"} agree.{" "}
              {v.evidence.map((e, i) => (
                <span key={i} className="mt-1 block">
                  {e.source}: &ldquo;{e.quote}&rdquo;
                </span>
              ))}
            </Info>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Reviews({ p, course }: { p: ProfEntry; course: Course }) {
  const [all, setAll] = useState(false);
  const rmp = p.ins.rmp;
  const here = `${course.subject} ${course.number}`;
  const reviews = useMemo(() => {
    const list = (rmp?.reviews ?? []).map((r) => ({ ...r, code: normCourse(r.course), mine: normCourse(r.course) === here }));
    return [...list.filter((r) => r.mine), ...list.filter((r) => !r.mine)];
  }, [rmp, here]);
  if (!rmp) return null;
  const shown = all ? reviews : reviews.slice(0, 2);
  return (
    <div>
      {rmp.tags.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Most common Rate My Professors tags">
          {rmp.tags.map((t) => (
            <li key={t}>
              <Badge>{t}</Badge>
            </li>
          ))}
        </ul>
      )}
      {reviews.length ? (
        <ul className="space-y-3">
          {shown.map((r, i) => (
            <li key={i} className="max-w-prose">
              <p className="text-sm text-muted">
                {r.mine ? r.code : <span className="font-semibold text-ink">Written for {r.code || "another course"}</span>}
                {r.date ? `, ${fmtDate(r.date)}` : ""}
              </p>
              <blockquote className="mt-0.5 border-l-2 border-line pl-3">{r.text}</blockquote>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No written reviews.</p>
      )}
      {reviews.length > 2 && (
        <button type="button" className="mt-2 font-semibold text-action hover:underline" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? "Show fewer reviews" : `Show ${reviews.length - 2} more review${reviews.length - 2 === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}

function ProfessorPanel({ p, ctx }: { p: ProfEntry; ctx: Ctx }) {
  const { course, term } = ctx;
  const g = p.ins.gpa;
  const rmp = p.ins.rmp;
  return (
    <div className="grid gap-x-8 gap-y-6 pt-2 lg:grid-cols-2">
      <section aria-label={`${p.ins.name}: sections`}>
        <h4 className="font-semibold text-heading">{term ? `Sections in ${termLabel(term)}` : "Sections"}</h4>
        {term && p.sections.length ? (
          <ul className="divide-y divide-line">
            {p.sections.map((s) => (
              <SectionMini key={s.crn} s={s} course={course} term={term} />
            ))}
          </ul>
        ) : (
          <p className="text-muted">Not teaching {term ? termLabel(term) : "this term"}.</p>
        )}
        {g && (
          <div className="mt-4">
            <h4 className="font-semibold text-heading">Grades in {course.subject} {course.number}</h4>
            <p className="tnum">
              GPA {fmtGpa(g.avg)} over {fmtInt(g.students)} students, {termRange(g.first_term, g.last_term)}
              {g.recent !== null ? `; recent ${fmtGpa(g.recent)}` : ""}. W rate {fmtPct(g.pct.W, 1)}.
            </p>
            <div className="mt-2 max-w-sm">
              <GradeBar pct={g.pct} source={gpaSource(course, p)} />
            </div>
          </div>
        )}
        {p.ins.tre.length > 0 && (
          <p className="mt-4">
            <span className="font-semibold text-heading">Teachers Ranked as Excellent</span> (campus list from student ratings): {p.ins.tre.map(treLabel).join("; ")}.
          </p>
        )}
      </section>
      <section aria-label={`${p.ins.name}: reviews and format`}>
        <h4 className="font-semibold text-heading">Rate My Professors</h4>
        {rmp && rmp.num_ratings > 0 ? (
          <p className="tnum text-sm text-muted">
            Quality {rmp.rating?.toFixed(1) ?? "–"} of 5, difficulty {rmp.difficulty?.toFixed(1) ?? "–"} of 5,{" "}
            {rmp.would_take_again === null ? "would-take-again not reported" : `${Math.round(rmp.would_take_again)}% would take again`}, from{" "}
            {fmtInt(rmp.num_ratings)} ratings (all courses), fetched {fmtDate(rmp.fetched_at)}.
          </p>
        ) : null}
        <div className="mt-2">
          <Reviews p={p} course={course} />
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {rmp ? (
            <>
              <a href={rmp.url} className="inline-flex items-center gap-1 font-semibold text-action underline" rel="noopener">
                Rate My Professors page
                <Icon name="external" />
              </a>
              <RateLink name={p.ins.name} url={rmp.url} />
              <span className="basis-full text-sm text-muted">Took {course.subject} {course.number} with {p.ins.name}? A rating on RMP reaches this page with the next nightly update.</span>
            </>
          ) : (
            <>
              <span className="text-muted">{ctx.rmpStatus.startsWith("unavailable") ? "RMP unavailable in this build. " : "No confident RMP match. "}</span>
              <a href={rmpSearchUrl(p.ins.name)} className="inline-flex items-center gap-1 font-semibold text-action underline" rel="noopener">
                Search Rate My Professors
                <Icon name="external" />
              </a>
            </>
          )}
        </p>
        {p.ins.exam && (
          <div className="mt-5">
            <h4 className="font-semibold text-heading">Exam and grading format</h4>
            <ExamList profile={p.ins.exam} />
          </div>
        )}
      </section>
    </div>
  );
}
