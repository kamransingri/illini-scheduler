"use client";
import { useEffect, useMemo, useState } from "react";
import { alsoCounts, evaluate, needText, options, prereqNote, rankCourse, type Degree, type DegreeCourse, type DegreeIndex, type GroupResult, type GroupStatus, type Ranked } from "@/lib/degree";
import { dataUrl, fmtDate, fmtGpa, fmtInt, GENED_NAMES, termLabel } from "@/lib/format";
import { EMPTY, onMineChange, readMine, sameState, STATUS_LABEL, stateFromParams, stateToParams, writeMine, type CourseStatus, type MyState } from "@/lib/mycourses";
import type { ScorePriors } from "@/lib/score";
import type { SearchIndex } from "@/lib/types";
import { useWeights } from "@/lib/weights";
import AddToCart from "./AddToCart";
import CopyButton from "./CopyButton";
import ScoreBreakdown from "./course/ScoreBreakdown";
import { loadIndex } from "./SearchBox";
import { Badge } from "./ui/Badge";
import CourseRow, { CourseRowHeader, type CourseCols } from "./ui/CourseRow";
import Expandable from "./ui/Expandable";
import Icon, { type IconName } from "./ui/Icon";
import Info from "./ui/Info";

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

const loadDegree = (id: string): Promise<Degree> =>
  fetch(dataUrl(`degrees/${id}.json`)).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<Degree>;
  });

export default function DegreeChecklist({ programs, meta }: { programs: DegreeIndex; meta: { next_term: string; score_priors: ScorePriors | null } }) {
  const [st, setSt] = useState<MyState>(EMPTY);
  const [shared, setShared] = useState<MyState | null>(null); // your own list, kept while a shared link is open
  const [ready, setReady] = useState(false);
  const [deg, setDeg] = useState<Degree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const weights = useWeights();

  // Start from the link if it carries a list; never overwrite a saved list without asking.
  useEffect(() => {
    const fromUrl = stateFromParams(new URLSearchParams(window.location.search));
    const saved = readMine();
    let start = fromUrl ?? saved;
    if (fromUrl && saved.courses.length && !sameState(saved, fromUrl)) setShared(saved);
    else if (fromUrl) writeMine(fromUrl);
    if (!start.program && programs.length === 1) start = { ...start, program: programs[0].id };
    setSt(start);
    setReady(true);
    loadIndex().then(setIndex).catch(() => setIndex(null));
    return onMineChange(() => {
      setShared(null);
      setSt(readMine());
    });
  }, [programs]);

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

  const ev = useMemo(() => (deg ? evaluate(deg, st.courses, st.ticked) : null), [deg, st.courses, st.ticked]);
  const taken = useMemo(() => new Set(st.courses.map((c) => `${c.s} ${c.n}`)), [st.courses]);

  // Until the saved list (or the link's) has been read, hold the space instead of flashing an empty checklist.
  if (!ready) return <div className="min-h-screen" aria-busy="true" />;
  return (
    <div className="space-y-8">
      {shared && (
        <div className="rounded bg-panel p-4" role="status">
          You opened a shared checklist. Your own list ({shared.courses.length} course{shared.courses.length === 1 ? "" : "s"}) is untouched.
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

      <section className="grid gap-x-8 gap-y-6 rounded bg-panel p-4 sm:p-5 lg:grid-cols-[19rem_minmax(0,1fr)]" aria-label="Your program and courses">
        <div className="space-y-5">
          <div>
            <label htmlFor="program-select" className="font-semibold text-heading">
              Program
            </label>
            <select
              id="program-select"
              className="mt-1 block w-full rounded border border-line bg-white px-2 py-1.5"
              value={st.program}
              onChange={(e) => update({ ...st, program: e.target.value })}
            >
              <option value="">Choose a program</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.program} ({p.catalog_year})
                </option>
              ))}
            </select>
          </div>
          <AddCourse st={st} update={update} deg={deg} index={index} />
        </div>
        <MyCourseList st={st} update={update} deg={deg} index={index} />
      </section>

      <section aria-label="Requirements" className="min-w-0">
          {!st.program && <p className="text-muted">Choose a program to see its requirements.</p>}
          {error && (
            <p className="flex items-start gap-2" role="alert">
              <Icon name="alert" className="mt-1" />
              Couldn&apos;t load the requirements ({error}). Reload to try again.
            </p>
          )}
          {st.program && !deg && !error && <p className="min-h-screen text-muted">Loading requirements…</p>}
          {deg && ev && <Checklist deg={deg} results={ev.results} st={st} update={update} taken={taken} meta={meta} weights={weights} />}
      </section>
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
        <button type="submit" className="inline-flex items-center gap-1.5 rounded bg-action px-3 font-semibold text-white hover:bg-action-dark">
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

function MyCourseList({ st, update, deg, index }: MineProps) {
  return (
    <div aria-labelledby="mine-h" role="group">
      <h2 id="mine-h" className="font-display text-xl font-bold text-heading">
        My courses
      </h2>
      {!st.courses.length ? (
        <p className="mt-2 text-muted">None yet. Add what you&apos;ve finished, AP or transfer credit, and what you&apos;re taking now.</p>
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
          <ShareLink />
        </div>
      )}
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
      <Info label="About sharing">The link carries your program and course list, so an advisor or a friend sees the same checklist. Nothing is saved on a server.</Info>
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
}: {
  deg: Degree;
  results: GroupResult[];
  st: MyState;
  update: (s: MyState) => void;
  taken: Set<string>;
  meta: { next_term: string; score_priors: ScorePriors | null };
  weights: ReturnType<typeof useWeights>;
}) {
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
          <span className="block text-sm">Read {fmtDate(deg.read_on)}. Minimum {deg.total_hours ?? "–"} hours to graduate.</span>
        </p>
        <h2 className="mt-2 font-display text-xl font-bold text-heading">{deg.program}</h2>
        <p className="mt-3 text-lg" data-testid="degree-progress">
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
      </header>

      {sections.map((sec) => (
        <section key={sec} className="mt-8" aria-labelledby={`sec-${sec}`}>
          <h3 id={`sec-${sec}`} className="font-display text-lg font-bold text-heading">
            {sec}
          </h3>
          <ul className="mt-2" data-testid="requirements">
            {results
              .filter((r) => (r.group.section || "Requirements") === sec)
              .map((r) => (
                <Requirement key={r.group.id} r={r} results={results} deg={deg} st={st} update={update} taken={taken} meta={meta} weights={weights} />
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
}: {
  r: GroupResult;
  results: GroupResult[];
  deg: Degree;
  st: MyState;
  update: (s: MyState) => void;
  taken: Set<string>;
  meta: { next_term: string; score_priors: ScorePriors | null };
  weights: ReturnType<typeof useWeights>;
}) {
  const g = r.group;
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
      {g.rule === "manual" ? (
        <label className="mt-2 flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-action"
            checked={st.ticked.includes(g.id)}
            onChange={(e) => update({ ...st, ticked: e.target.checked ? [...st.ticked, g.id] : st.ticked.filter((x) => x !== g.id) })}
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
        <Badge key={u.code} icon={u.status === "in_progress" ? "calendar" : "check"} title={STATUS_LABEL[u.status]}>
          {u.code}
          {u.status !== "done" ? <span className="text-muted">, {u.status === "credit" ? "credit" : "in progress"}</span> : null}
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
