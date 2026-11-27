"use client";
import { useEffect, useState } from "react";
import type { Course, TermBlock } from "@/lib/types";
import { cisUrl, daysStr, fmtDate, fmtTime, SELF_SERVICE_URL, termLabel } from "@/lib/format";
import { eligibility } from "@/lib/restrictions";
import { groupSections } from "@/lib/sections";
import { useAboutYou } from "@/lib/useAboutYou";
import CopyButton from "../CopyButton";
import WatchButton from "../WatchButton";
import { Badge, SeatStatus } from "../ui/Badge";
import Icon from "../ui/Icon";
import Info from "../ui/Info";

const COLS = "md:grid md:grid-cols-[5.75rem_7.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_8.5rem] md:gap-x-3";

export default function SectionsList({
  course,
  term,
  block,
  onPickProf,
  focusCrn = null,
  watchable = false,
}: {
  course: Course;
  term: string;
  block: TermBlock;
  onPickProf: (key: string) => void;
  /** A CRN to scroll to and highlight (a #crn-12345 link from search). */
  focusCrn?: string | null;
  /** The current or next term, which Just opened follows: each row gets a Watch button (#15). */
  watchable?: boolean;
}) {
  const { me } = useAboutYou();
  const groups = groupSections(block.sections);
  const flat = groups.flatMap((g) => g.sections);
  const focusAt = focusCrn ? flat.findIndex((s) => s.crn === focusCrn) : -1;
  const [showAll, setShowAll] = useState(focusAt >= 40);
  const total = block.sections.length;
  useEffect(() => {
    if (focusAt < 0) return;
    if (focusAt >= 40) setShowAll(true);
    const t = setTimeout(() => document.getElementById(`crn-${focusCrn}`)?.scrollIntoView({ block: "center" }), 50);
    return () => clearTimeout(t);
  }, [focusAt, focusCrn]);
  let budget = showAll ? Infinity : 40;
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
        <span className="inline-flex items-center">
          Seat status checked {fmtDate(block.checked_at)}
          <Info label="About seat status">
            Open / Restricted / Closed per section, read from the public Course Explorer pages about once a day. Exact seats left and
            waitlists are only in Self-Service, which needs a NetID and is never scraped.
          </Info>
        </span>
        <a className="inline-flex items-center gap-1 font-semibold text-action underline" href={SELF_SERVICE_URL} target="_blank" rel="noopener noreferrer">
          Register in Self-Service
          <Icon name="external" />
        </a>
      </p>
      <div className={`mt-3 hidden border-b border-line pb-2 text-sm text-muted ${COLS}`} aria-hidden>
        <span>CRN</span>
        <span>Section</span>
        <span>Time</span>
        <span>Location</span>
        <span>Professor</span>
        <span>Seats</span>
      </div>
      <div className="space-y-4 md:space-y-2">
        {groups.map((g) => {
          if (budget <= 0) return null;
          const secs = g.sections.slice(0, budget);
          budget -= secs.length;
          return (
            <section key={g.key} aria-label={g.title ?? "Sections"} className={g.title ? "mt-3" : ""}>
              {g.title && (
                <div className="flex flex-wrap items-baseline gap-x-3 pt-2">
                  <h3 className="font-semibold text-heading">{g.title}</h3>
                  {g.hint && <p className="text-sm text-muted">{g.hint}</p>}
                </div>
              )}
              <ul className={g.title ? "mt-1 border-l-2 border-action/40 pl-3" : ""}>
                {secs.map((s) => (
                  <li
                    key={s.crn}
                    id={`crn-${s.crn}`}
                    className={`grid scroll-mt-20 grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-line py-2.5 ${COLS} md:items-start ${s.crn === focusCrn ? "-mx-2 bg-action-tint px-2 outline-2 outline-action" : ""}`}
                    data-testid="section-row"
                    aria-current={s.crn === focusCrn ? "true" : undefined}
                  >
                    <span>
                      <CopyButton text={s.crn} label={s.crn} />
                    </span>
                    <span>
                      <span className="font-semibold">{s.code}</span> <span className="text-sm text-muted">{s.type_name || s.type}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {s.part !== "1" && <Badge title="Part of term">{s.part === "A" ? "First half" : s.part === "B" ? "Second half" : `Part ${s.part}`}</Badge>}
                        {s.special && (
                          <Badge icon="alert" title={s.special}>
                            special
                          </Badge>
                        )}
                        <SectionRestriction text={s.text} status={s.status} me={me} />
                      </span>
                    </span>
                    <span className="col-span-2 tnum md:col-span-1">
                      {s.meetings.length ? (
                        s.meetings.map((m, i) => (
                          <span key={i} className="block">
                            {m.s === null ? (s.type.startsWith("O") || s.type === "ONL" ? "Online, no set time" : "Arranged") : `${daysStr(m.d)} ${fmtTime(m.s)}–${fmtTime(m.e)}`}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted">No meeting listed</span>
                      )}
                      {(s.fx ?? [])
                        .filter(([, st, , type]) => st !== null && !/conflict/i.test(type))
                        .map(([date, st, en]) => (
                          <span key={date + st} className="block text-sm text-muted">
                            Final {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })},{" "}
                            {fmtTime(st)}–{fmtTime(en)}
                          </span>
                        ))}
                    </span>
                    <span className="col-span-2 text-muted md:col-span-1 md:text-ink">
                      {s.meetings.map((m, i) => (
                        <span key={i} className="block">
                          {m.b ? `${m.r} ${m.b}`.trim() : "–"}
                        </span>
                      ))}
                    </span>
                    <span className="col-span-2 md:col-span-1">
                      {s.instructors.length ? (
                        s.instructors.map((k, i) =>
                          course.instructors[k] ? (
                            <button key={k} type="button" className="block text-left font-semibold text-action hover:underline" onClick={() => onPickProf(k)}>
                              {course.instructors[k].name}
                            </button>
                          ) : (
                            <span key={k} className="block">
                              {s.instructors_raw[i] ?? k}
                            </span>
                          ),
                        )
                      ) : (
                        <span className="text-muted">Professor TBA</span>
                      )}
                    </span>
                    <span className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 md:col-span-1 md:flex-col md:items-start">
                      <span className="inline-flex items-center gap-1.5">
                        <SeatStatus
                          status={s.status}
                          known={block.status_known}
                          title={s.status_at ? `Checked ${fmtDate(s.status_at)}${s.status_since ? `; ${s.status} since ${fmtDate(s.status_since)}` : ""}` : undefined}
                        />
                      </span>
                      <a className="inline-flex items-center gap-1 text-sm text-action underline" href={cisUrl(term, course.subject, course.number, s.crn)} target="_blank" rel="noopener noreferrer">
                        Check live seats
                        <Icon name="external" />
                      </a>
                      {watchable && <WatchButton item={{ t: term, crn: s.crn, s: course.subject, n: course.number, code: s.code }} />}
                    </span>
                    {s.text && (
                      <details className="col-span-2 text-sm text-muted md:col-span-6">
                        <summary className="cursor-pointer">Section notes</summary>
                        <p className="mt-1 max-w-prose">{s.text}</p>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {total > 40 && (
        <button type="button" className="mt-3 font-semibold text-action hover:underline" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? "Show fewer sections" : `Show all ${total} sections in ${termLabel(term)}`}
        </button>
      )}
    </div>
  );
}

/** Whether this student can take a restricted section (#81), from About you; the full text is in the row's notes. */
function SectionRestriction({ text, status, me }: { text: string; status: string; me: import("@/lib/restrictions").AboutYou }) {
  const e = eligibility(text, status, me);
  if (e.status === "open") return null;
  const label = e.status === "no" ? "not for you" : e.status === "maybe" ? "restricted" : "restricted: you qualify";
  return (
    <span data-testid="restriction" data-status={e.status}>
      <Badge icon={e.status === "ok" ? "check" : "alert"} title={e.because.join(" ")}>
        {label}
      </Badge>
    </span>
  );
}
