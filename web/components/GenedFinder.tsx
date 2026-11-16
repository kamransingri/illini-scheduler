"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { applyFilters, DEFAULT_FILTERS, DEFAULT_SORT, filtersFromQuery, filtersToQuery, GENED_GROUPS, openCount, type Filters, type SortKey } from "@/lib/geneds";
import { courseHref, dataUrl, fmtGpa, fmtInt, fmtPct, GENED_NAMES, termLabel } from "@/lib/format";
import { rankCourse } from "@/lib/rank";
import type { ScorePriors } from "@/lib/score";
import type { GenedRow } from "@/lib/types";
import { useWeights } from "@/lib/weights";
import ScoreBreakdown from "./course/ScoreBreakdown";
import AddToCart from "./AddToCart";
import Icon from "./ui/Icon";
import Info from "./ui/Info";
import WeightsControl from "./WeightsControl";

const PAGE = 50;
// Table cells: hairline row and column dividers (the first column has no left rule).
const TH = "border-l border-line px-3 py-2 font-semibold first:border-l-0";
const TD = "border-l border-line px-3 py-2.5 first:border-l-0";

export default function GenedFinder({ nextTerm, rmpAvailable, priors }: { nextTerm: string; rmpAvailable: boolean; priors: ScorePriors | null }) {
  const [rows, setRows] = useState<GenedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const weights = useWeights();
  const [limit, setLimit] = useState(PAGE);
  const [restored, setRestored] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters live in the URL so Back, reload and shared links keep them.
  useEffect(() => {
    const { f: f0, sort: s0 } = filtersFromQuery(window.location.search);
    setF(f0);
    setSort(s0);
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    const q = filtersToQuery(f, sort);
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, [f, sort, restored]);

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
  const result = useMemo(() => (rows ? applyFilters(rows, f, sort, (r) => ranked.get(`${r.s} ${r.n}`)?.score?.score ?? null) : []), [rows, f, sort, ranked]);
  const statusKnown = rows?.some((r) => r.statusKnown) ?? false;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setF((old) => ({ ...old, [k]: v }));
    setLimit(PAGE);
  };
  const toggleCode = (code: string) => set("codes", f.codes.includes(code) ? f.codes.filter((c) => c !== code) : [...f.codes, code]);
  const check = (label: React.ReactNode, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-start gap-2 py-0.5">
      <input type="checkbox" className="mt-1 size-4 accent-action" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 rounded border border-action px-3 py-2 font-semibold text-action md:hidden"
        aria-expanded={showFilters}
        aria-controls="gened-filters"
        onClick={() => setShowFilters((v) => !v)}
      >
        <Icon name={showFilters ? "chevronUp" : "chevronDown"} />
        {showFilters ? "Hide filters" : `Filters${f.codes.length ? ` (${f.codes.length} categor${f.codes.length > 1 ? "ies" : "y"})` : ""}`}
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
                        className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 leading-8 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-action ${on ? "border-action bg-action-tint font-semibold text-heading" : "border-line hover:border-action"}`}
                      >
                        <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleCode(code)} />
                        {on && <Icon name="check" className="text-action" />}
                        {GENED_NAMES[code] ?? code}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">{check("Double-dips only (2+ categories)", f.doubleDip, (v) => set("doubleDip", v))}</div>
        </fieldset>
        <fieldset>
          <legend className="font-semibold text-heading">Schedule</legend>
          <div className="mt-1">
            {check(`${statusKnown ? "Open sections" : "Has sections"} in ${termLabel(nextTerm)}`, f.openNext, (v) => set("openNext", v))}
            {check("Only GPA from 200+ students", f.minStudents === 200, (v) => set("minStudents", v ? 200 : 0))}
            {check("No 8am classes", f.earliest === 540, (v) => set("earliest", v ? 540 : null))}
            {check("No Friday classes", f.noFriday, (v) => set("noFriday", v))}
            {check("Online only", f.onlineOnly, (v) => set("onlineOnly", v))}
          </div>
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
        <button type="button" className="font-semibold text-action hover:underline" onClick={() => setF(DEFAULT_FILTERS)}>
          Reset filters
        </button>
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
        <WeightsControl className="mb-3" />
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
                    Best professor, {termLabel(nextTerm)}
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
                  return (
                    <tr key={r.s + r.n} className="border-t border-line align-top even:bg-panel/50" data-gpa={r.gpa ?? ""} data-codes={r.codes.join(" ")}>
                      <th scope="row" className={`${TD} min-w-[10rem] font-normal`}>
                        <Link href={courseHref(r.s, r.n)} className="group">
                          <span className="font-semibold text-action group-hover:underline">
                            {r.s} {r.n}
                          </span>{" "}
                          <span className="group-hover:underline">{r.t}</span>
                        </Link>
                      </th>
                      <td className={`${TD} min-w-[9rem]`}>
                        <ul className="space-y-0.5 text-sm">
                          {r.codes.map((c) => {
                            const picked = f.codes.includes(c);
                            return (
                              <li key={c} className={`flex items-start gap-1 ${picked ? "font-semibold text-heading" : ""}`}>
                                {picked ? <Icon name="check" className="mt-0.5 text-action" /> : <span aria-hidden className="inline-block w-4" />}
                                {GENED_NAMES[c] ?? c}
                                {picked && <span className="sr-only"> (selected)</span>}
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
  );
}
