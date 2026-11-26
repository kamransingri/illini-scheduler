"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { onCartChange, readCart } from "@/lib/cart";
import {
  applyFilters,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  filtersFromQuery,
  filtersToQuery,
  GENED_GROUPS,
  hasTimeRules,
  openCount,
  timesFit,
  type Filters,
  type Fit,
  type SortKey,
} from "@/lib/geneds";
import { courseHref, dataUrl, fmtGpa, fmtInt, fmtPct, GENED_NAMES, GENED_SHORT, termLabel, termOrder } from "@/lib/format";
import { loadPrefs, onPrefsChange, timeRulesSummary } from "@/lib/prefs";
import { rankCourse } from "@/lib/rank";
import type { Prefs } from "@/lib/schedule";
import { DEFAULT_WEIGHTS, type ScorePriors } from "@/lib/score";
import { DEFAULT_SUMMER, summerHref } from "@/lib/summer";
import { termAfter } from "@/lib/terms";
import type { GenedRow } from "@/lib/types";
import { useWeights } from "@/lib/weights";
import ScoreBreakdown from "./course/ScoreBreakdown";
import AddToCart from "./AddToCart";
import SummerFinder from "./SummerFinder";
import Icon from "./ui/Icon";
import Info from "./ui/Info";
import WeightsControl from "./WeightsControl";

const PAGE = 50;
// The term row: this many terms in order from the first one with data, filling the width; the rest scroll (D64)
const TERM_ROW = 9;
// Why a course doesn't fit the schedule builder's must-haves (lib/geneds.ts timesFit)
const NO_FIT: Record<Exclude<Fit, "fits">, string> = { times: "Outside your times", special: "Only special sections", closed: "No open section" };
// Table cells: hairline row and column dividers (the first column has no left rule).
const TH = "border-l border-line px-2.5 py-2 align-bottom font-semibold first:border-l-0";
const TD = "border-l border-line px-2.5 py-2.5 first:border-l-0";

export default function GenedFinder({
  nextTerm,
  summerTerm,
  rmpAvailable,
  priors,
}: {
  nextTerm: string;
  summerTerm: string | null; // the summer the Summer view shows (summer.json), null when there's none
  rmpAvailable: boolean;
  priors: ScorePriors | null;
}) {
  const [rows, setRows] = useState<GenedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const weights = useWeights();
  const [limit, setLimit] = useState(PAGE);
  const [restored, setRestored] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false); // everything but the categories and Double-dips only (#244)
  const [rules, setRules] = useState<Prefs | null>(null); // the schedule builder's saved must-haves
  const [inSchedule, setInSchedule] = useState(0);
  // ?term=summer: the newest summer's classes instead of next term's gen-eds (#123); SummerFinder keeps its own filters
  const [summer, setSummer] = useState(false);
  const termRow = useRef<HTMLDivElement>(null);
  const terms = useMemo(() => {
    const out = [summerTerm && termOrder(summerTerm) < termOrder(nextTerm) ? summerTerm : nextTerm];
    while (out.length < TERM_ROW) out.push(termAfter(out[out.length - 1]));
    return out;
  }, [nextTerm, summerTerm]);
  // on a phone the row scrolls: keep the picked term in view
  // (braces: newer browsers return a promise from scrollIntoView, and React would call it as the effect's cleanup)
  useEffect(() => {
    termRow.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [summer]);

  // Filters live in the URL so Back, reload and shared links keep them.
  useEffect(() => {
    const { f: f0, sort: s0 } = filtersFromQuery(window.location.search);
    setF(f0);
    setSort(s0);
    setSummer(new URLSearchParams(window.location.search).get("term") === "summer");
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored || summer) return;
    const q = filtersToQuery(f, sort);
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, [f, sort, restored, summer]);

  // Times and days off come from the schedule builder (D14.5), and follow it when it's open in another tab.
  useEffect(() => {
    setRules(loadPrefs());
    return onPrefsChange(() => setRules(loadPrefs()));
  }, []);
  useEffect(() => {
    const sync = () => setInSchedule(readCart().length);
    sync();
    return onCartChange(sync);
  }, []);
  const timed = hasTimeRules(rules) ? rules : null;

  useEffect(() => {
    fetch(dataUrl("geneds.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<GenedRow[]>;
      })
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  // Best-pick score per course: course GPA with its best next-term professor (lib/rank.ts), with the student's weights.
  const ranked = useMemo(() => new Map((rows ?? []).map((r) => [`${r.s} ${r.n}`, rankCourse(`${r.s} ${r.n}`, { gpa: r.gpa, gn: r.gpaN, nSec: r.nSec, nOpen: r.nOpen, known: r.statusKnown, profs: r.profs }, priors, weights)])), [rows, priors, weights]);
  const result = useMemo(() => (rows ? applyFilters(rows, f, sort, (r) => ranked.get(`${r.s} ${r.n}`)?.score?.score ?? null, timed) : []), [rows, f, sort, ranked, timed]);
  const statusKnown = rows?.some((r) => r.statusKnown) ?? false;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setF((old) => ({ ...old, [k]: v }));
    setLimit(PAGE);
  };
  // what's on under More filters, counted against a fresh visit so a folded "More filters" still says so (#244)
  const customWeights = (Object.keys(DEFAULT_WEIGHTS) as (keyof typeof DEFAULT_WEIGHTS)[]).some((k) => weights[k] !== DEFAULT_WEIGHTS[k]);
  const moreOn = [f.openNext !== DEFAULT_FILTERS.openNext, f.minStudents !== DEFAULT_FILTERS.minStudents, f.fits && timed !== null, f.credits !== null, f.minRmp !== null, customWeights].filter(Boolean).length;
  const allOn = f.codes.length + (f.doubleDip ? 1 : 0) + moreOn;
  const toggleCode = (code: string) => set("codes", f.codes.includes(code) ? f.codes.filter((c) => c !== code) : [...f.codes, code]);
  const check = (label: React.ReactNode, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-start gap-2 py-0.5">
      <input type="checkbox" className="mt-1 size-4 accent-action" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );

  const toSummer = () => {
    // carry the first picked gen-ed over; SummerFinder reads its filters from the URL when it opens
    window.history.replaceState(null, "", `${window.location.pathname}${summerHref({ ...DEFAULT_SUMMER, gened: f.codes[0] ?? DEFAULT_SUMMER.gened }).replace("/geneds/", "")}`);
    setSummer(true);
  };
  const tab = (on: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={on ? undefined : onClick}
      className={`px-3 py-1.5 font-semibold whitespace-nowrap ${on ? "bg-action text-white" : "text-action hover:bg-action-tint"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div
        ref={termRow}
        role="group"
        aria-label="Term"
        className="relative mb-6 grid auto-cols-[minmax(7.5rem,1fr)] grid-flow-col divide-x divide-line overflow-x-auto rounded border border-line"
        data-testid="gened-term"
      >
        {terms.map((t) =>
          t === nextTerm ? (
            <Fragment key={t}>{tab(!summer, termLabel(t), () => setSummer(false))}</Fragment>
          ) : t === summerTerm ? (
            <Fragment key={t}>{tab(summer, termLabel(t), toSummer)}</Fragment>
          ) : (
            // no gen-ed or summer data for this term: greyed out
            <button key={t} type="button" disabled className="cursor-not-allowed bg-panel px-3 py-1.5 whitespace-nowrap text-muted/70">
              {termLabel(t)}
              <span className="sr-only">, {termOrder(t) > termOrder(nextTerm) ? "not out yet" : "not in the finder"}</span>
            </button>
          ),
        )}
      </div>
      {summer ? (
        <SummerFinder />
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded border border-action px-3 py-2 font-semibold text-action md:hidden"
            aria-expanded={showFilters}
            aria-controls="gened-filters"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Icon name={showFilters ? "chevronUp" : "chevronDown"} />
            {showFilters ? "Hide filters" : `Filters${allOn ? `, ${allOn} on` : ""}`}
          </button>
          <form id="gened-filters" className={`${showFilters ? "block" : "hidden"} space-y-6 md:block`} onSubmit={(e) => e.preventDefault()} aria-label="Filters">
            <fieldset>
              <legend className="font-semibold text-heading">Category</legend>
              <div className="mt-2 space-y-3">
                {GENED_GROUPS.map((g) => (
                  <div key={g.cat}>
                    <div className="text-sm text-muted">{g.label}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {g.codes.map((code) => {
                        const on = f.codes.includes(code);
                        return (
                          <label
                            key={code}
                            title={GENED_NAMES[code]}
                            className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 leading-8 whitespace-nowrap has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-action ${on ? "border-action bg-action-tint font-semibold text-heading" : "border-line hover:border-action"}`}
                          >
                            <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleCode(code)} aria-label={GENED_NAMES[code] ?? code} />
                            {on && <Icon name="check" className="text-action" />}
                            {GENED_SHORT[code] ?? code}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">{check("Double-dips only (2+ categories)", f.doubleDip, (v) => set("doubleDip", v))}</div>
            </fieldset>
            <button
              type="button"
              className="flex min-h-11 w-fit items-center gap-1.5 font-semibold text-action hover:underline"
              aria-expanded={moreOpen}
              aria-controls="more-filters"
              onClick={() => setMoreOpen((v) => !v)}
              data-testid="more-filters-toggle"
            >
              More filters
              {moreOn > 0 && <span className="rounded-full bg-action-tint px-2 text-sm leading-6 text-heading tnum">{moreOn} on</span>}
              <Icon name="chevronDown" className={`transition-transform motion-reduce:transition-none ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            <div id="more-filters" hidden={!moreOpen} className="space-y-6" data-testid="more-filters">
            <fieldset>
              <legend className="font-semibold text-heading">Show</legend>
              <div className="mt-1">
                {check(statusKnown ? `Only courses with an open section in ${termLabel(nextTerm)}` : `Only courses offered in ${termLabel(nextTerm)}`, f.openNext, (v) => set("openNext", v))}
                {check("Only GPA from 200+ students", f.minStudents === 200, (v) => set("minStudents", v ? 200 : 0))}
              </div>
            </fieldset>
            <fieldset data-testid="gened-times">
              <legend className="font-semibold text-heading">Your times</legend>
              {timed ? (
                <>
                  <p className="mt-1 text-sm">From the schedule builder: {timeRulesSummary(timed).join(", ")}.</p>
                  <div className="mt-1">{check("Only courses that fit them", f.fits, (v) => set("fits", v))}</div>
                  <Link href="/schedule/" className="mt-1 inline-block text-sm text-action underline">
                    Change them in the schedule builder
                  </Link>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  Set a start time, end time or days off in the{" "}
                  <Link href="/schedule/" className="text-action underline">
                    schedule builder
                  </Link>{" "}
                  to see which gen-eds fit them.
                </p>
              )}
            </fieldset>
            <label className="block">
              <span className="font-semibold text-heading">Credit hours</span>
              <select className="mt-1 block w-full rounded border border-line bg-white px-2 py-1.5" value={f.credits ?? ""} onChange={(e) => set("credits", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Any</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-semibold text-heading">Minimum RMP rating</span>
              <select
                className="mt-1 block w-full rounded border border-line bg-white px-2 py-1.5 disabled:opacity-50"
                value={f.minRmp ?? ""}
                disabled={!rmpAvailable}
                onChange={(e) => set("minRmp", e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Any</option>
                {[3, 3.5, 4, 4.5].map((n) => (
                  <option key={n} value={n}>
                    {n}+
                  </option>
                ))}
              </select>
              {!rmpAvailable && <span className="mt-1 block text-sm text-muted">RMP unavailable in this build.</span>}
            </label>
            <WeightsControl />
            </div>
            {allOn > 0 && (
              <button type="button" className="block font-semibold text-action hover:underline" onClick={() => setF(DEFAULT_FILTERS)}>
                Reset filters
              </button>
            )}
          </form>

          <section aria-label="Results" className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
              <p className="font-semibold text-heading tnum" aria-live="polite">
                {rows ? `${result.length} course${result.length === 1 ? "" : "s"}` : error ? "" : "Loading…"}
              </p>
              <label className="inline-flex items-center gap-2">
                Sort by
                <select className="rounded border border-line bg-white px-2 py-1.5" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
                  <option value="score" disabled={!priors}>
                    Best pick score
                  </option>
                  <option value="gpa">Recent GPA</option>
                  <option value="pctA">% A</option>
                  <option value="rmp" disabled={!rmpAvailable}>
                    RMP rating
                  </option>
                  <option value="open">{statusKnown ? "Open sections" : "Sections"}</option>
                </select>
              </label>
            </div>
            {inSchedule > 0 && (
              <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-line bg-panel px-3 py-2" data-testid="gened-handoff">
                <span className="tnum">
                  {inSchedule} course{inSchedule === 1 ? "" : "s"} in your schedule.
                </span>
                <Link href="/schedule/" className="inline-flex items-center gap-1 font-semibold text-action hover:underline">
                  Plan {inSchedule === 1 ? "it" : "them"} in the schedule builder
                  <Icon name="chevronRight" />
                </Link>
              </p>
            )}
            {error && (
              <p className="flex items-start gap-2 rounded border border-line p-3" role="alert">
                <Icon name="alert" className="mt-1 text-down" />
                Couldn&apos;t load the gen-ed list ({error}). Reload to try again.
              </p>
            )}
            {rows && result.length > 0 && (
              <div className="relative overflow-x-auto rounded border border-line" role="region" aria-label="Gen-ed courses" tabIndex={0}>
                <table className="w-full min-w-[52rem] border-collapse text-left">
                  <caption className="sr-only">
                    Gen-ed courses{f.codes.length ? ` that count for ${f.codes.map((c) => GENED_NAMES[c] ?? c).join(" and ")}` : ""}, one per row.
                  </caption>
                  <thead className="bg-panel">
                    <tr className="text-sm text-heading">
                      <th scope="col" className={TH}>
                        Course
                      </th>
                      <th scope="col" className={TH}>
                        Counts for
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        <span className="inline-flex items-center">
                          Score
                          <Info label="About the score">
                            Best pick score of the course with its best {termLabel(nextTerm)} professor: course GPA, that professor&apos;s GPA difference, RMP and
                            open seats, with small samples pulled toward an average. Open a score&apos;s (i) for its parts.
                          </Info>
                        </span>
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        <span className="inline-flex items-center">
                          Recent GPA
                          <Info label="About recent GPA">UIUC GPA dataset, the last 8 fall and spring terms, with how many graded students it comes from.</Info>
                        </span>
                      </th>
                      <th scope="col" className={TH}>
                        Best professor
                        <span className="block font-normal text-muted">{termLabel(nextTerm)}</span>
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        RMP
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        {statusKnown ? "Open lectures" : "Lectures"}
                      </th>
                      <th scope="col" className={TH}>
                        <span className="sr-only">Schedule</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody data-testid="gened-results">
                    {result.slice(0, limit).map((r) => {
                      const rk = ranked.get(`${r.s} ${r.n}`);
                      const sc = rk?.score;
                      const bp = rk?.best;
                      const fit = timed && r.nSec > 0 ? timesFit(r, timed) : null;
                      return (
                        <tr
                          key={r.s + r.n}
                          className="border-t border-line align-top even:bg-panel/50"
                          data-gpa={r.gpa ?? ""}
                          data-codes={r.codes.join(" ")}
                          data-fit={fit ?? undefined}
                        >
                          <th scope="row" className={`${TD} min-w-[11rem] font-normal`}>
                            <Link href={courseHref(r.s, r.n)} className="group">
                              <span className="font-semibold text-action group-hover:underline">
                                {r.s} {r.n}
                              </span>{" "}
                              <span className="group-hover:underline">{r.t}</span>
                            </Link>
                            {fit === "fits" && (
                              <span className="mt-1 flex items-center gap-1 text-sm text-up">
                                <Icon name="check" />
                                Fits your times
                              </span>
                            )}
                            {fit && fit !== "fits" && <span className="mt-1 block text-sm text-muted">{NO_FIT[fit]}</span>}
                          </th>
                          <td className={TD}>
                            <ul className="flex flex-col items-start gap-1" aria-label={`${r.s} ${r.n} counts for`}>
                              {r.codes.map((c) => {
                                const picked = f.codes.includes(c);
                                return (
                                  <li
                                    key={c}
                                    title={GENED_NAMES[c]}
                                    className={`inline-flex items-center gap-1 rounded border px-1.5 text-sm leading-6 whitespace-nowrap ${picked ? "border-action bg-action-tint font-semibold text-heading" : "border-line bg-white"}`}
                                  >
                                    {picked && <Icon name="check" className="text-action" />}
                                    <span aria-hidden>{GENED_SHORT[c] ?? c}</span>
                                    <span className="sr-only">
                                      {GENED_NAMES[c] ?? c}
                                      {picked ? " (selected)" : ""}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </td>
                          <td className={`${TD} text-right`}>
                            {sc && sc.score !== null ? (
                              <span className="inline-flex items-center">
                                <span className="tnum text-lg font-semibold text-heading">{sc.score}</span>
                                <Info label={`How ${r.s} ${r.n}'s score is worked out`}>
                                  <ScoreBreakdown result={sc} />
                                </Info>
                              </span>
                            ) : (
                              <span className="text-muted">–</span>
                            )}
                          </td>
                          <td className={`${TD} text-right`}>
                            {r.gpa !== null ? (
                              <>
                                <span className="tnum font-semibold text-heading">{fmtGpa(r.gpa)}</span>
                                <span className="block text-sm text-muted tnum">{fmtInt(r.gpaN)} students</span>
                                <span className="block text-sm text-muted tnum">{fmtPct(r.pctA)} A</span>
                              </>
                            ) : (
                              <span className="text-muted">No data</span>
                            )}
                          </td>
                          <td className={`${TD} min-w-[8.5rem]`}>
                            {bp ? (
                              <>
                                <span className="font-semibold">{bp.name}</span>
                                <span className="block text-sm text-muted tnum">
                                  {bp.d !== null ? `${bp.d >= 0 ? "+" : "−"}${Math.abs(bp.d).toFixed(2)} vs course, ${fmtInt(bp.dn)} students` : "No grade history"}
                                </span>
                              </>
                            ) : r.best ? (
                              <>
                                <span className="font-semibold">{r.best.name}</span>
                                <span className="block text-sm text-muted tnum">
                                  GPA {fmtGpa(r.best.gpa)}, {fmtInt(r.best.students)} students
                                </span>
                              </>
                            ) : (
                              <span className="text-muted">–</span>
                            )}
                          </td>
                          <td className={`${TD} text-right tnum`}>{r.rmp !== null ? r.rmp.toFixed(1) : <span className="text-muted">–</span>}</td>
                          <td className={`${TD} text-right tnum`}>
                            {r.nSec ? (r.statusKnown ? `${openCount(r)} of ${r.nSec}` : r.nSec) : <span className="text-muted">Not offered</span>}
                          </td>
                          <td className={TD}>{r.nSec > 0 && <AddToCart subject={r.s} number={r.n} small short />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {result.length > limit && (
              <button className="mt-4 rounded border border-action px-3 py-1.5 font-semibold text-action hover:bg-action-tint" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, result.length - limit)} more ({result.length - limit} left)
              </button>
            )}
            {rows && !result.length && (
              <p className="mt-3" role="status">
                {f.codes.length > 1
                  ? `No course counts for all of ${f.codes.map((c) => GENED_NAMES[c] ?? c).join(", ")} with the current filters. Remove a category or a filter to see more.`
                  : "No gen-eds match these filters. Try removing one."}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
