"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apCredit, creditCourses, isElective, isGrainger, pickYear, subOptions, type ApSummary, type ApTable, type ApYear } from "@/lib/apcredit";
import { alsoCounts, evaluate, hoursSoFar, hydrate, needText, options, parseHours, prereqNote, rankCourse, type Degree, type DegreeCourse, type DegreeIndex, type GroupResult, type GroupStatus, type HoursSoFar, type Ranked } from "@/lib/degree";
import { courseHref, dataUrl, fmtDate, fmtGpa, fmtInt, GENED_NAMES, termLabel } from "@/lib/format";
import { EMPTY, MINOR_TICK, onMineChange, readMine, sameState, STATUS_LABEL, stateFromParams, stateToParams, writeMine, type CourseStatus, type MyState } from "@/lib/mycourses";
import type { ScorePriors } from "@/lib/score";
import type { SearchIndex } from "@/lib/types";
import { useWeights } from "@/lib/weights";
import AddToCart from "./AddToCart";
import CopyButton from "./CopyButton";
import ScoreBreakdown from "./course/ScoreBreakdown";
import ProgramPicker from "./ProgramPicker";
import { loadIndex } from "./SearchBox";
import { Badge } from "./ui/Badge";
import CourseRow, { CourseRowHeader, type CourseCols } from "./ui/CourseRow";
import Expandable from "./ui/Expandable";
import Icon, { type IconName } from "./ui/Icon";
import Info from "./ui/Info";
import WeightsControl from "./WeightsControl";

const COLS: CourseCols = { score: true, gpa: true, best: true, rmp: true, next: true, action: true };
const SHOW = 5;

const STATUS: Record<GroupStatus, { label: string; icon: IconName; cls: string }> = {
  done: { label: "Done", icon: "check", cls: "bg-heading text-white" },
  in_progress: { label: "In progress", icon: "check", cls: "bg-action-tint text-heading" },
  partial: { label: "Partly done", icon: "minus", cls: "border border-heading text-heading" },
  open: { label: "Open", icon: "plus", cls: "border border-line text-ink" },
};

function StatusBadge({ status }: { status: GroupStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 text-sm font-semibold whitespace-nowrap leading-6 ${s.cls}`}>
      <Icon name={s.icon} />
      {s.label}
    </span>
  );
}

const getJson = <T,>(path: string): Promise<T> =>
  fetch(dataUrl(path)).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });

// Gen-ed courses are the same for every program: one shared file, loaded once.
let genedCache: Promise<Record<string, DegreeCourse>> | null = null;
const loadDegree = (id: string): Promise<Degree> => {
  if (!genedCache) {
    genedCache = getJson<Record<string, DegreeCourse>>("degrees/gened-courses.json");
    genedCache.catch(() => (genedCache = null));
  }
  return Promise.all([getJson<Degree>(`degrees/${id}.json`), genedCache]).then(([deg, gened]) => hydrate(deg, gened));
};

// CITL's AP credit tables (pipeline/ap_credit.py), one small file for every entering year.
let apCache: Promise<ApTable> | null = null;
const loadAp = (): Promise<ApTable> => {
  if (!apCache) {
    apCache = getJson<ApTable>("ap-credit.json");
    apCache.catch(() => (apCache = null));
  }
  return apCache;
};

export default function DegreeChecklist({ programs, meta }: { programs: DegreeIndex; meta: { next_term: string; score_priors: ScorePriors | null } }) {
  const [st, setSt] = useState<MyState>(EMPTY);
  const [shared, setShared] = useState<MyState | null>(null); // your own list, kept while a shared link is open
  const [ready, setReady] = useState(false);
  const [deg, setDeg] = useState<Degree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minorDeg, setMinorDeg] = useState<Degree | null>(null);
  const [minorError, setMinorError] = useState<string | null>(null);
  const majors = useMemo(() => programs.filter((p) => p.type !== "minor"), [programs]);
  const minors = useMemo(() => programs.filter((p) => p.type === "minor"), [programs]);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [apTable, setApTable] = useState<ApTable | null>(null);
  const [apError, setApError] = useState(false);
  const weights = useWeights();

  // Start from the link if it carries a list; never overwrite a saved list without asking.
  useEffect(() => {
    const fromUrl = stateFromParams(new URLSearchParams(window.location.search));
    const saved = readMine();
    let start = fromUrl ?? saved;
    if (fromUrl && (saved.courses.length || saved.ap.length) && !sameState(saved, fromUrl)) setShared(saved);
    else if (fromUrl) writeMine(fromUrl);
    if (!start.program && majors.length === 1) start = { ...start, program: majors[0].id };
    setSt(start);
    setReady(true);
    loadIndex().then(setIndex).catch(() => setIndex(null));
    loadAp()
      .then(setApTable)
      .catch(() => setApError(true));
    return onMineChange(() => {
      setShared(null);
      setSt(readMine());
    });
  }, [majors]);

  const update = (next: MyState) => {
    setSt(next);
    if (!shared) writeMine(next);
  };

  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    stateToParams(st, url.searchParams);
    window.history.replaceState(null, "", url.toString());
  }, [st, ready]);

  useEffect(() => {
    if (!st.program) return;
    setDeg(null);
    setError(null);
    loadDegree(st.program)
      .then(setDeg)
      .catch((e: Error) => setError(e.message));
  }, [st.program]);

  useEffect(() => {
    setMinorDeg(null);
    setMinorError(null);
    if (!st.minor) return;
    loadDegree(st.minor)
      .then(setMinorDeg)
      .catch((e: Error) => setMinorError(e.message));
  }, [st.minor]);

  // AP scores become "credit" courses at CITL's hours; the college picks the Grainger rows for Calculus.
  const grainger = isGrainger(programs.find((p) => p.id === st.program)?.college);
  const apYear = apTable ? pickYear(apTable, st.year) : null;
  const apSum = useMemo(() => (apYear && st.ap.length ? apCredit(apYear, st.ap, grainger) : null), [apYear, st.ap, grainger]);
  const allCourses = useMemo(() => [...st.courses, ...(apSum ? creditCourses(apSum.credits, st.declined, st.courses) : [])], [st.courses, st.declined, apSum]);
  const apReady = !st.ap.length || !!apTable || apError;
  const majorTicks = useMemo(() => st.ticked.filter((t) => !t.startsWith(MINOR_TICK)), [st.ticked]);
  const minorTicks = useMemo(() => st.ticked.filter((t) => t.startsWith(MINOR_TICK)).map((t) => t.slice(MINOR_TICK.length)), [st.ticked]);
  const ev = useMemo(() => (deg && apReady ? evaluate(deg, allCourses, majorTicks) : null), [deg, apReady, allCourses, majorTicks]);
  const minorEv = useMemo(() => (minorDeg && apReady ? evaluate(minorDeg, allCourses, minorTicks) : null), [minorDeg, apReady, allCourses, minorTicks]);
  const generatedOn = majors.find((p) => p.id === st.program)?.generated;
  const minorGeneratedOn = minors.find((p) => p.id === st.minor)?.generated;
  const taken = useMemo(() => new Set(allCourses.map((c) => `${c.s} ${c.n}`)), [allCourses]);
  const hours = useMemo(() => {
    if (!deg) return null;
    const byCode = new Map(index?.courses.map((c) => [`${c.s} ${c.n}`, c.c]) ?? []);
    return hoursSoFar(allCourses, (code) => deg.courses[code]?.cr ?? parseHours(byCode.get(code)));
  }, [deg, index, allCourses]);
  const apHours = allCourses.reduce((t, c) => t + (c.hours ?? 0), 0);

  // Until the saved list (or the link's) has been read, hold the space instead of flashing an empty checklist.
  if (!ready) return <div className="min-h-screen" aria-busy="true" />;
  return (
    <div className="space-y-8">
      {shared && (
        <div className="rounded bg-panel p-4" role="status">
          You opened a shared checklist. Your own list ({shared.courses.length} course{shared.courses.length === 1 ? "" : "s"}
          {shared.ap.length ? `, ${shared.ap.length} AP exam${shared.ap.length === 1 ? "" : "s"}` : ""}) is untouched.
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-action px-3 py-1.5 font-semibold text-white hover:bg-action-dark"
              onClick={() => {
                writeMine(st);
                setShared(null);
              }}
            >
              Use this list
            </button>
            <button
              type="button"
              className="rounded border border-action bg-white px-3 py-1.5 font-semibold text-action hover:bg-action-tint"
              onClick={() => {
                setSt(shared);
                setShared(null);
              }}
            >
              Back to my list
            </button>
          </div>
        </div>
      )}

      {/* grid-cols-1 (minmax(0, 1fr)) so a long <select> option can't widen the column past a phone screen */}
      <section className="grid grid-cols-1 gap-x-8 gap-y-6 rounded bg-panel p-4 sm:p-5 lg:grid-cols-[19rem_minmax(0,1fr)]" aria-label="Your program and courses">
        <div className="space-y-5">
          <ProgramPicker
            programs={majors}
            value={st.program}
            onChange={(program) => update({ ...st, program })}
            label="Major"
            idPrefix="program"
            noun={["major", "majors"]}
            hint="finance, CS, MCB"
          />
          {minors.length > 0 && (
            <ProgramPicker
              programs={minors}
              value={st.minor}
              // a different minor starts with none of the old one's boxes ticked
              onChange={(minor) => update({ ...st, minor, ticked: st.ticked.filter((t) => !t.startsWith(MINOR_TICK)) })}
              label={
                <>
                  Minor <span className="font-normal text-muted">(optional)</span>
                </>
              }
              idPrefix="minor"
              noun={["minor", "minors"]}
              hint="business, CS, music"
              clearable
            />
          )}
          <AddCourse st={st} update={update} deg={deg} index={index} />
          <ApForm st={st} update={update} table={apTable} error={apError} />
        </div>
        <MyCourseList st={st} update={update} deg={deg} index={index} ap={apYear && apSum ? { year: apYear, sum: apSum } : null} />
      </section>

      <section aria-label="Requirements" className="min-w-0">
          {!st.program && <p className="text-muted">Choose a major{minors.length ? " (and a minor, if you have one)" : ""} to see its requirements.</p>}
          {error && (
            <p className="flex items-start gap-2" role="alert">
              <Icon name="alert" className="mt-1" />
              Couldn&apos;t load the requirements ({error}). Reload to try again.
            </p>
          )}
          {generatedOn && (
            // From the program index embedded in the page, so it shows before the program's own file has loaded.
            <p className="mb-6 flex max-w-3xl items-start gap-2 rounded bg-panel p-3" data-testid="generated-note">
              <Icon name="info" className="mt-1 shrink-0 text-heading" />
              <span>
                Read automatically from the catalog page on {fmtDate(generatedOn)}. Course lists, alternatives and &ldquo;select N&rdquo; rules come
                straight from its tables; rules the catalog writes out in words (electives, concentrations) are shown in its own words for you to tick
                when you&apos;ve met them. Check the catalog page before you rely on it.
              </span>
            </p>
          )}
          {st.program && !ev && !error && <p className="min-h-screen text-muted">Loading requirements…</p>}
          {deg && ev && <Checklist deg={deg} results={ev.results} st={st} update={update} taken={taken} meta={meta} weights={weights} hours={hours} apHours={apHours} tickPrefix="" />}
      </section>

      {st.minor && (
        <section aria-label="Minor requirements" className="min-w-0 border-t-4 border-heading pt-6" data-testid="minor-checklist">
          {minorError && (
            <p className="flex items-start gap-2" role="alert">
              <Icon name="alert" className="mt-1" />
              Couldn&apos;t load the minor&apos;s requirements ({minorError}). Reload to try again.
            </p>
          )}
          <p className="mb-4 flex max-w-3xl items-start gap-2 rounded bg-panel p-3">
            <Icon name="info" className="mt-1 shrink-0 text-heading" />
            <span>
              Your courses count toward your major and your minor here. Some minors and colleges limit how many hours can count for both, or need some
              courses taken outside your major: the minor&apos;s catalog page says so. Most minors also need a form filed with your college.
              {minorGeneratedOn && <> This minor was read automatically from its catalog page on {fmtDate(minorGeneratedOn)}; check that page before you rely on it.</>}
            </span>
          </p>
          {!minorEv && !minorError && <p className="text-muted">Loading the minor&apos;s requirements…</p>}
          {minorDeg && minorEv && (
            <Checklist deg={minorDeg} results={minorEv.results} st={st} update={update} taken={taken} meta={meta} weights={weights} hours={null} apHours={0} tickPrefix={MINOR_TICK} />
          )}
        </section>
      )}
    </div>
  );
}

type MineProps = { st: MyState; update: (s: MyState) => void; deg: Degree | null; index: SearchIndex | null };
const STATUSES: CourseStatus[] = ["done", "credit", "in_progress"];
const titleIn = (deg: Degree | null, index: SearchIndex | null, code: string) =>
  deg?.courses[code]?.t ?? index?.courses.find((c) => `${c.s} ${c.n}` === code)?.t ?? "";

function AddCourse({ st, update, deg, index }: MineProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<CourseStatus>("done");
  const [msg, setMsg] = useState<string | null>(null);
  const add = () => {
    const m = /^\s*([A-Za-z]{2,5})\s*-?\s*(\d{3})\s*$/.exec(text);
    if (!m) return setMsg("Type a course code like STAT 107.");
    const code = `${m[1].toUpperCase()} ${m[2]}`;
    if (!titleIn(deg, index, code)) return setMsg(`${code} isn't in the course data this site has. Check the code.`);
    const rest = st.courses.filter((c) => `${c.s} ${c.n}` !== code);
    update({ ...st, courses: [...rest, { s: m[1].toUpperCase(), n: m[2], status }] });
    setText("");
    setMsg(null);
  };
  return (
    <form
      className="space-y-2"
      aria-labelledby="add-h"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <h2 id="add-h" className="font-semibold text-heading">
        Add a course you&apos;ve taken
      </h2>
      <input
        className="w-full rounded border border-line bg-white px-3 py-2 placeholder:text-muted"
        placeholder="Course code, e.g. STAT 107"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Course code"
        autoComplete="off"
      />
      <div className="flex gap-2">
        <select className="min-w-0 flex-1 rounded border border-line bg-white px-2 py-1.5" value={status} onChange={(e) => setStatus(e.target.value as CourseStatus)} aria-label="Status">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!deg && !index}
          title={!deg && !index ? "Loading the course list…" : undefined}
          className="inline-flex items-center gap-1.5 rounded bg-action px-3 font-semibold text-white hover:bg-action-dark disabled:opacity-50"
        >
          <Icon name="plus" />
          Add
        </button>
      </div>
      {msg && (
        <p className="text-sm" role="alert">
          {msg}
        </p>
      )}
    </form>
  );
}

function MyCourseList({ st, update, deg, index, ap }: MineProps & { ap: { year: ApYear; sum: ApSummary } | null }) {
  return (
    <div aria-labelledby="mine-h" role="group">
      <h2 id="mine-h" className="font-display text-xl font-bold text-heading">
        My courses
      </h2>
      {!st.courses.length && !st.ap.length ? (
        <p className="mt-2 text-muted">None yet. Add what you&apos;ve finished, your AP exams, transfer credit, and what you&apos;re taking now.</p>
      ) : (
        <div className="mt-2 space-y-3" data-testid="my-courses">
          {STATUSES.map((s) => {
            const list = st.courses.filter((c) => c.status === s);
            if (!list.length) return null;
            return (
              <div key={s}>
                <h3 className="text-sm text-muted">{STATUS_LABEL[s]}</h3>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {list.map((c) => {
                    const code = `${c.s} ${c.n}`;
                    return (
                      <li key={code} className="inline-flex items-center rounded border border-line bg-white pl-2" title={titleIn(deg, index, code)}>
                        <span className="font-semibold">{code}</span>
                        <button
                          type="button"
                          className="inline-flex size-8 items-center justify-center rounded text-muted hover:text-action"
                          aria-label={`Remove ${code}`}
                          onClick={() => update({ ...st, courses: st.courses.filter((x) => `${x.s} ${x.n}` !== code) })}
                        >
                          <Icon name="x" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {st.ap.length > 0 && (ap ? <ApCredits st={st} update={update} year={ap.year} sum={ap.sum} /> : <p className="text-muted">Loading the AP credit table…</p>)}
          <ShareLink />
        </div>
      )}
    </div>
  );
}

/** The exams in the chosen year's table, a score, and the subscore when the table tells subscores apart. */
function ApForm({ st, update, table, error }: { st: MyState; update: (s: MyState) => void; table: ApTable | null; error: boolean }) {
  const [examId, setExamId] = useState("");
  const [score, setScore] = useState("");
  const [sub, setSub] = useState("");
  const year = table ? pickYear(table, st.year) : null;
  const exam = year?.exams.find((e) => e.id === examId);
  const subs = exam && score ? subOptions(exam, Number(score)) : [];
  const ok = !!exam && !!score && (!subs.length || sub !== "");
  return (
    <form
      className="space-y-2"
      aria-labelledby="ap-h"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const next = { exam: examId, score: Number(score), sub: subs.length ? Number(sub) : null };
        update({ ...st, ap: [...st.ap.filter((a) => a.exam !== examId), next] });
        setExamId("");
        setScore("");
        setSub("");
      }}
    >
      <h2 id="ap-h" className="inline-flex items-center font-semibold text-heading">
        Add an AP exam
        <Info label="About AP credit">
          Illinois gives course credit for AP scores from a table CITL (the Center for Innovation in Teaching &amp; Learning) publishes for each starting year.
          Add your exams and scores to see the courses they&apos;re expected to give. It&apos;s an estimate until the credit shows on your DARS report. Your
          scores stay in this browser and in the share link.
        </Info>
      </h2>
      {error && (
        <p className="text-sm" role="alert">
          Couldn&apos;t load the AP credit table. Reload to try again.
        </p>
      )}
      <label className="block text-sm">
        <span className="text-muted">Starting term at Illinois</span>
        <select
          className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1.5 text-base"
          value={year?.id ?? ""}
          disabled={!table}
          onChange={(e) => update({ ...st, year: e.target.value === table?.years[0]?.id ? "" : e.target.value })}
        >
          {!table && <option value="">Loading…</option>}
          {table?.years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.entering}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <select
          className="min-w-0 flex-1 rounded border border-line bg-white px-2 py-1.5"
          aria-label="AP exam"
          value={examId}
          disabled={!year}
          onChange={(e) => {
            setExamId(e.target.value);
            setSub("");
          }}
        >
          <option value="">AP exam</option>
          {year?.exams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          className="w-24 rounded border border-line bg-white px-2 py-1.5"
          aria-label="Score"
          value={score}
          disabled={!year}
          onChange={(e) => {
            setScore(e.target.value);
            setSub("");
          }}
        >
          <option value="">Score</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      {exam?.sub && subs.length > 0 && (
        <select className="w-full rounded border border-line bg-white px-2 py-1.5" aria-label={exam.sub} value={sub} onChange={(e) => setSub(e.target.value)}>
          <option value="">{exam.sub}</option>
          {subs.map((v) => (
            <option key={v} value={v}>
              {v === 0 ? `No ${exam.sub!.toLowerCase()}` : `${exam.sub} ${v}`}
            </option>
          ))}
        </select>
      )}
      <button
        type="submit"
        disabled={!ok}
        className="inline-flex items-center gap-1.5 rounded bg-action px-3 py-1.5 font-semibold text-white hover:bg-action-dark disabled:opacity-50"
      >
        <Icon name="plus" />
        Add exam
      </button>
    </form>
  );
}

/** What each AP score gives: its courses (each can be switched off), CITL's placement message word for word, and notes. */
function ApCredits({ st, update, year, sum }: { st: MyState; update: (s: MyState) => void; year: ApYear; sum: ApSummary }) {
  const own = new Set(st.courses.map((c) => `${c.s} ${c.n}`));
  const collegeRows = sum.results.some((r) => r.exam?.rows.some((x) => x.college));
  const toggle = (code: string, on: boolean) => update({ ...st, declined: on ? st.declined.filter((x) => x !== code) : [...st.declined, code] });
  return (
    <div data-testid="ap-credit">
      <h3 className="text-sm text-muted">Expected AP credit</h3>
      <ul className="mt-1 grid grid-cols-1 items-start gap-2 xl:grid-cols-2">
        {sum.results.map((r) => (
          <li key={r.score.exam} className="rounded border border-line bg-white p-3" data-exam={r.score.exam}>
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{r.label}</span>
              <button
                type="button"
                className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded text-muted hover:text-action"
                aria-label={`Remove ${r.label}`}
                onClick={() => update({ ...st, ap: st.ap.filter((a) => a.exam !== r.score.exam) })}
              >
                <Icon name="x" />
              </button>
            </div>
            {!r.exam ? (
              <p className="text-sm text-muted">Not in the {year.label} table.</p>
            ) : r.needsSub ? (
              <p className="text-sm">Remove this exam and add it again with your {r.exam.sub?.toLowerCase()} to see its credit.</p>
            ) : !r.row?.credit.length ? (
              <p className="text-sm text-muted">No credit for this score.</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {r.row.credit.map(([code, h]) => (
                  <li key={code}>
                    {own.has(code) ? (
                      <span className="text-sm">
                        <span className="font-semibold">{code}</span> <span className="text-muted">is already in your list</span>
                      </span>
                    ) : (
                      <label className="inline-flex items-center gap-1.5">
                        <input type="checkbox" className="size-4 accent-action" checked={!st.declined.includes(code)} onChange={(e) => toggle(code, e.target.checked)} />
                        <span className="font-semibold">{code}</span>
                        <span className="text-sm text-muted">
                          {h} hour{h === 1 ? "" : "s"}
                          {isElective(code) ? ", elective" : ""}
                        </span>
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {r.row?.message && (
              <p className="mt-1 text-sm">
                <span className="font-semibold">Placement:</span> {r.row.message}
              </p>
            )}
            {r.exam?.notes.map((n) => (
              <p key={n} className="mt-1 text-sm text-muted">
                {n}
              </p>
            ))}
            {r.row?.fix && <p className="mt-1 text-sm text-muted">Where our copy differs from CITL&apos;s page: {r.row.fix}</p>}
          </li>
        ))}
      </ul>
      {year.notes.length > 0 && (
        // the year's general notes, word for word: they differ between years (which year's policy applies, DARS)
        <div className="mt-2 rounded border border-line bg-white p-3 text-sm" data-testid="ap-year-notes">
          <h4 className="font-semibold text-heading">CITL&apos;s notes for the {year.label} table</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {year.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-sm text-muted">
        From CITL&apos;s{" "}
        <a href={year.source} className="font-semibold text-action underline" rel="noopener">
          {year.label} AP credit table
        </a>{" "}
        for students starting in {year.entering}, read {fmtDate(year.read_on)}. It&apos;s an estimate until the credit shows on your DARS report. Untick a course
        if you&apos;d rather take it than accept the credit (ask your advisor first). Elective credit such as MATH 1-- counts toward your hours here.
        {collegeRows && !st.program && " Calculus credit differs for Grainger engineering programs: choose your program to see yours."}
      </p>
    </div>
  );
}

function ShareLink() {
  const [href, setHref] = useState("");
  useEffect(() => {
    const update = () => setHref(window.location.href);
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="flex flex-wrap items-center gap-1">
      <CopyButton text={href} label="Copy share link" className="!px-3 !leading-9" />
      <Info label="About sharing">
        The link carries your program, your course list and any AP scores you added, so an advisor or a friend sees the same checklist. Nothing is saved on a
        server.
      </Info>
    </p>
  );
}

function Checklist({
  deg,
  results,
  st,
  update,
  taken,
  meta,
  weights,
  hours,
  apHours,
  tickPrefix,
}: {
  deg: Degree;
  results: GroupResult[];
  st: MyState;
  update: (s: MyState) => void;
  taken: Set<string>;
  meta: { next_term: string; score_priors: ScorePriors | null };
  weights: ReturnType<typeof useWeights>;
  hours: HoursSoFar | null;
  apHours: number;
  tickPrefix: string; // "" for the major, MINOR_TICK for the minor
}) {
  const minor = deg.type === "minor";
  const counts = (s: GroupStatus) => results.filter((r) => r.status === s).length;
  const total = results.length;
  const sections = [...new Set(results.map((r) => r.group.section || "Requirements"))];
  return (
    <div>
      <header className="border-b border-line pb-5">
        <p className="text-muted">
          {deg.college}, {deg.catalog_year} catalog{" "}
          <a href={deg.source} className="inline-flex items-center gap-1 font-semibold text-action underline" rel="noopener">
            Catalog page
            <Icon name="external" />
          </a>
          <span className="block text-sm">
            Read {fmtDate(deg.read_on)}.{" "}
            {minor ? (deg.total_hours ? `At least ${deg.total_hours} hours for the minor.` : "") : `Minimum ${deg.total_hours ?? "–"} hours to graduate.`}
          </span>
          {hours && (hours.done > 0 || hours.inProgress > 0) && (
            <span className="block text-sm" data-testid="hours-so-far">
              <span className="font-semibold text-ink tnum">{hours.done}</span> hours in My courses
              {apHours > 0 && <> ({apHours} from AP credit)</>}
              {hours.inProgress > 0 && <>, {hours.inProgress} more in progress</>}.{hours.variable && " Variable-credit courses count at their minimum."}
              {hours.unknown.length > 0 && <> Not counted (hours unknown): {hours.unknown.join(", ")}.</>}
            </span>
          )}
        </p>
        <h2 className="mt-2 font-display text-xl font-bold text-heading">
          {minor && <span className="mr-2 align-middle text-sm font-semibold tracking-wide text-muted uppercase">Minor </span>}
          {deg.program}
        </h2>
        <p className="mt-3 text-lg" data-testid={minor ? "minor-progress" : "degree-progress"}>
          <span className="font-semibold text-heading tnum">
            {counts("done")} of {total}
          </span>{" "}
          requirements done
          {counts("in_progress") ? <>, {counts("in_progress")} in progress</> : null}
          {counts("partial") ? <>, {counts("partial")} partly done</> : null}.
        </p>
        <div className="mt-2 flex h-3 w-full overflow-hidden rounded bg-panel" role="img" aria-label={`${counts("done")} of ${total} requirements done, ${counts("in_progress")} in progress, ${counts("partial")} partly done`}>
          <div className="bg-heading" style={{ width: `${(100 * counts("done")) / total}%` }} />
          <div className="bg-heading/45" style={{ width: `${(100 * counts("in_progress")) / total}%` }} />
          <div className="bg-heading/15" style={{ width: `${(100 * counts("partial")) / total}%` }} />
        </div>
        {deg.unknown.length > 0 && <p className="mt-2 text-sm text-muted">Not in this site&apos;s course data, so not shown as options: {deg.unknown.join(", ")}.</p>}
        {meta.score_priors && !minor && <WeightsControl className="mt-4" />}
      </header>

      {sections.map((sec) => (
        <section key={sec} className="mt-8" aria-labelledby={`sec-${deg.id}-${sec}`}>
          <h3 id={`sec-${deg.id}-${sec}`} className="font-display text-lg font-bold text-heading">
            {sec}
          </h3>
          <ul className="mt-2" data-testid="requirements">
            {results
              .filter((r) => (r.group.section || "Requirements") === sec)
              .map((r) => (
                <Requirement key={r.group.id} r={r} results={results} deg={deg} st={st} update={update} taken={taken} meta={meta} weights={weights} tickPrefix={tickPrefix} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Requirement({
  r,
  results,
  deg,
  st,
  update,
  taken,
  meta,
  weights,
  tickPrefix,
}: {
  r: GroupResult;
  results: GroupResult[];
  deg: Degree;
  st: MyState;
  update: (s: MyState) => void;
  taken: Set<string>;
  meta: { next_term: string; score_priors: ScorePriors | null };
  weights: ReturnType<typeof useWeights>;
  tickPrefix: string;
}) {
  const g = r.group;
  const tick = tickPrefix + g.id;
  const finished = r.status === "done" || r.status === "in_progress";
  const [showAll, setShowAll] = useState(false);
  const ranked = useMemo(() => {
    if (finished || g.rule === "manual") return [];
    return options(r, deg, taken)
      .filter((c) => deg.courses[c]?.page)
      .map((c) => rankCourse(c, deg.courses[c], meta.score_priors, weights))
      .sort((a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1) || (b.course.gpa ?? 0) - (a.course.gpa ?? 0));
  }, [finished, g.rule, r, deg, taken, meta.score_priors, weights]);
  const hidden = finished || g.rule === "manual" ? 0 : options(r, deg, taken).length - ranked.length;
  const shown = showAll ? ranked : ranked.slice(0, SHOW);
  const info = (
    <Info label={`Catalog notes for ${g.name}`}>
      {g.notes.length ? g.notes.map((n, i) => <span key={i} className="mb-1 block">{n}</span>) : <span className="block">From the catalog page.</span>}
      <span className="mt-1 block">Source: {g.source ?? deg.source}</span>
    </Info>
  );
  const head = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <StatusBadge status={r.status} />
      <span className="text-lg font-semibold text-heading">{g.name}</span>
      {info}
      <span className="text-muted">{needText(r)}</span>
    </div>
  );
  return (
    <li className="border-b border-line py-4" data-status={r.status} data-group={g.id}>
      {finished ? (
        <Expandable summary={<span className="sr-only">Show what counts for {g.name}</span>} buttonClassName="float-right" className="">
          <UsedList r={r} />
        </Expandable>
      ) : null}
      {head}
      {g.rule === "manual" && !finished && (
        <div className="mt-2 max-w-3xl space-y-1" data-testid="catalog-words">
          {g.notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
          {g.items.length > 0 && <ListedCourses items={g.items} deg={deg} taken={taken} />}
        </div>
      )}
      {g.rule === "manual" ? (
        <label className="mt-2 flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-action"
            checked={st.ticked.includes(tick)}
            onChange={(e) => update({ ...st, ticked: e.target.checked ? [...st.ticked, tick] : st.ticked.filter((x) => x !== tick) })}
          />
          <span>I&apos;ve met this requirement</span>
        </label>
      ) : null}
      {!finished && r.used.length > 0 && <UsedList r={r} />}
      {!finished && r.hoursCaveat && <p className="mt-1 text-sm text-muted">A variable-credit course is counted at its minimum hours; check your transcript.</p>}
      {r.blocked.length > 0 && !finished && (
        <ul className="mt-2 space-y-1 text-sm">
          {r.blocked.map((b) => {
            const other = deg.groups.find((x) => x.id === b.other)!;
            return (
              <li key={b.code + b.other} className="flex items-start gap-1.5">
                <Icon name="info" className="mt-0.5 text-muted" />
                <span>
                  <span className="font-semibold">{b.code}</span> already counts for {other.name}.{" "}
                  {b.verdict.allow === "unclear" ? "The catalog doesn't say whether it can count here too, so it isn't counted twice. Ask your advisor." : `It can't count here too: "${b.verdict.why}"`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!finished && g.rule !== "manual" && (
        <div className="mt-3">
          {ranked.length ? (
            <>
              <CourseRowHeader
                cols={COLS}
                labels={{
                  score: (
                    <span className="inline-flex items-center justify-end">
                      Score
                      <Info label="About the score">
                        Best pick score of the course with its best {termLabel(meta.next_term)} professor: course GPA, that professor&apos;s GPA difference, RMP and open
                        seats, small samples pulled toward an average. Open a score&apos;s (i) for its parts.
                      </Info>
                    </span>
                  ),
                  gpa: "Recent GPA",
                  best: `Best professor, ${termLabel(meta.next_term)}`,
                  rmp: "RMP",
                  next: "Open lectures",
                }}
              />
              <ul>
                {shown.map((x) => (
                  <OptionRow key={x.code} x={x} r={r} results={results} deg={deg} taken={taken} nextTerm={meta.next_term} />
                ))}
              </ul>
              {ranked.length > SHOW && (
                <button type="button" className="mt-2 font-semibold text-action hover:underline" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                  {showAll ? "Show fewer" : `Show all ${ranked.length} options`}
                </button>
              )}
              {hidden > 0 && <p className="mt-1 text-sm text-muted">{hidden} more listed in the catalog but not offered recently.</p>}
            </>
          ) : (
            <p className="text-muted">No options offered recently; see the catalog page.</p>
          )}
        </div>
      )}
    </li>
  );
}

function UsedList({ r }: { r: GroupResult }) {
  if (!r.used.length) return <p className="mt-1 text-sm text-muted">{r.group.rule === "manual" ? "Marked as done." : ""}</p>;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-muted">Counted:</span>
      {r.used.map((u) => (
        <Badge key={u.code} icon={u.status === "in_progress" ? "calendar" : u.ap ? "award" : "check"} title={u.ap ?? STATUS_LABEL[u.status]}>
          {u.code}
          {u.status !== "done" ? <span className="text-muted">, {u.ap ? "AP credit" : u.status === "credit" ? "credit" : "in progress"}</span> : null}
        </Badge>
      ))}
    </p>
  );
}

function OptionRow({
  x,
  r,
  results,
  deg,
  taken,
  nextTerm,
}: {
  x: Ranked<DegreeCourse>;
  r: GroupResult;
  results: GroupResult[];
  deg: Degree;
  taken: Set<string>;
  nextTerm: string;
}) {
  const [s, n] = x.code.split(" ");
  const c = x.course;
  const marks = alsoCounts(x.code, r.group, results, deg);
  const pre = prereqNote(c.pre, taken);
  const yes = marks.filter((m) => m.verdict.allow === true);
  const unclear = marks.filter((m) => m.verdict.allow === "unclear");
  const no = marks.filter((m) => m.verdict.allow === false);
  const best = x.best;
  return (
    <CourseRow
      subject={s}
      number={n}
      title={c.t}
      cols={COLS}
      data-code={x.code}
      badges={
        <>
          {yes.length > 0 && (
            <Badge icon="plus" title={yes.map((m) => `${m.group.name}: ${m.verdict.why}`).join("\n")}>
              Also counts for {yes.map((m) => m.group.name).join(", ")}
            </Badge>
          )}
          {c.g.filter((code) => GENED_NAMES[code]).map((code) => (
            <Badge key={code}>{GENED_NAMES[code]}</Badge>
          ))}
        </>
      }
      note={
        unclear.length || no.length || pre ? (
          <span className="block space-y-0.5">
            {unclear.length > 0 && <span className="block">Also matches {unclear.map((m) => m.group.name).join(", ")}; the catalog doesn&apos;t say it can count for both.</span>}
            {no.length > 0 && <span className="block">Matches {no.map((m) => m.group.name).join(", ")} too, but can count for only one.</span>}
            {pre && (
              <span className="block">
                <span className="font-semibold text-ink">Check prerequisites:</span> {pre}
              </span>
            )}
          </span>
        ) : undefined
      }
      slots={{
        score: {
          label: "Score",
          value:
            x.score && x.score.score !== null ? (
              <span className="inline-flex items-center">
                <span className="tnum text-lg font-semibold text-heading">{x.score.score}</span>
                <Info label={`How ${x.code}'s score is worked out`}>
                  <ScoreBreakdown result={x.score} />
                </Info>
              </span>
            ) : undefined,
        },
        gpa: {
          label: "Recent GPA",
          value: c.gpa != null ? <span className="tnum font-semibold">{fmtGpa(c.gpa)}</span> : <span className="text-muted">No data</span>,
          sub: c.gpa != null ? `${fmtInt(c.gn ?? 0)} students` : undefined,
        },
        best: {
          label: `Best professor, ${termLabel(nextTerm)}`,
          value: best ? <span className="font-semibold">{best.name}</span> : undefined,
          sub: best && best.d !== null ? `${best.d >= 0 ? "+" : "−"}${Math.abs(best.d).toFixed(2)} vs course` : best ? "No grade history" : undefined,
        },
        rmp: { label: "RMP", value: best?.rmp && best.rmp[0] !== null ? <span className="tnum">{best.rmp[0].toFixed(1)}</span> : undefined, sub: best?.rmp ? `${best.rmp[3]} ratings` : undefined },
        next: {
          label: "Open lectures",
          value: c.nx ? <span className="tnum">{c.known ? `${c.nOpen ?? 0} of ${c.nSec}` : `${c.nSec} listed`}</span> : <span className="text-muted">Not offered</span>,
          sub: termLabel(nextTerm),
        },
      }}
      action={c.nx ? <AddToCart subject={s} number={n} small /> : null}
    />
  );
}

/** The courses the catalog lists under a requirement it states in words (shown as links; nothing is counted). */
function ListedCourses({ items, deg, taken }: { items: string[][][]; deg: Degree; taken: Set<string> }) {
  const [all, setAll] = useState(false);
  const codes = [...new Set(items.flat(2))];
  const shown = all ? codes : codes.slice(0, 24);
  return (
    <div>
      <p className="text-sm text-muted">Courses the catalog lists here ({codes.length}):</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {shown.map((c) => {
          const [s, n] = c.split(" ");
          const page = deg.courses[c]?.page;
          return (
            <li key={c}>
              {page ? (
                <Link href={courseHref(s, n)} className={`inline-flex rounded border px-1.5 text-sm leading-6 ${taken.has(c) ? "border-heading bg-heading text-white" : "border-line bg-white text-action hover:underline"}`} title={deg.courses[c]?.t}>
                  {c}
                </Link>
              ) : (
                <span className="inline-flex rounded border border-line px-1.5 text-sm leading-6 text-muted" title="Not offered in the terms this site loads">
                  {c}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {codes.length > 24 && (
        <button type="button" className="mt-1 text-sm font-semibold text-action hover:underline" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? "Show fewer" : `Show all ${codes.length}`}
        </button>
      )}
    </div>
  );
}
