"use client";
import { useEffect, useMemo, useState } from "react";
import { applyFilters, DEFAULT_FILTERS, DEFAULT_SORT, filtersFromQuery, filtersToQuery, GENED_GROUPS, openCount, type Filters, type SortKey } from "@/lib/geneds";
import { dataUrl, fmtGpa, fmtInt, fmtPct, GENED_NAMES, termLabel } from "@/lib/format";
import { rankCourse } from "@/lib/rank";
import type { ScorePriors } from "@/lib/score";
import type { GenedRow } from "@/lib/types";
import { useWeights } from "@/lib/weights";
import ScoreBreakdown from "./course/ScoreBreakdown";
import AddToCart from "./AddToCart";
import { Badge } from "./ui/Badge";
import CourseRow, { CourseRowHeader, type CourseCols } from "./ui/CourseRow";
import Icon from "./ui/Icon";
import Info from "./ui/Info";
import WeightsControl from "./WeightsControl";

const PAGE = 50;
const COLS: CourseCols = { score: true, gpa: true, best: true, rmp: true, next: true, action: true };

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
    <div className="grid gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
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
        <CourseRowHeader
          cols={COLS}
          labels={{
            score: (
              <span className="inline-flex items-center justify-end">
                Score
                <Info label="About the score">
                  Best pick score of the course with its best {termLabel(nextTerm)} professor: course GPA, that professor&apos;s GPA difference, RMP and open seats,
                  with small samples pulled toward an average. Open a score&apos;s (i) for its parts.
                </Info>
              </span>
            ),
            gpa: (
              <span className="inline-flex items-center justify-end">
                Recent GPA
                <Info label="About recent GPA">UIUC GPA dataset, the last 8 fall and spring terms. Each row shows how many graded students that average is from.</Info>
              </span>
            ),
            best: `Best professor, ${termLabel(nextTerm)}`,
            rmp: "RMP",
            next: statusKnown ? "Open lectures" : "Lectures",
          }}
        />
        <ul data-testid="gened-results">
          {result.slice(0, limit).map((r) => (
            <CourseRow
              key={r.s + r.n}
              subject={r.s}
              number={r.n}
              title={r.t}
              cols={COLS}
              data-gpa={r.gpa ?? ""}
              data-codes={r.codes.join(" ")}
              badges={r.codes.map((c) => (
                <Badge key={c}>{GENED_NAMES[c] ?? c}</Badge>
              ))}
              slots={{
                score: (() => {
                  const sc = ranked.get(`${r.s} ${r.n}`)?.score;
                  return {
                    label: "Score",
                    value:
                      sc && sc.score !== null ? (
                        <span className="inline-flex items-center">
                          <span className="tnum text-lg font-semibold text-heading">{sc.score}</span>
                          <Info label={`How ${r.s} ${r.n}'s score is worked out`}>
                            <ScoreBreakdown result={sc} />
                          </Info>
                        </span>
                      ) : undefined,
                  };
                })(),
                gpa: {
                  label: "Recent GPA",
                  value: r.gpa !== null ? <span className="tnum text-lg font-semibold text-heading">{fmtGpa(r.gpa)}</span> : <span className="text-muted">No data</span>,
                  sub:
                    r.gpa !== null ? (
                      <>
                        {fmtInt(r.gpaN)} students
                        <br />
                        {fmtPct(r.pctA)} A
                      </>
                    ) : undefined,
                },
                best: (() => {
                  // the professor the score picked (same as the degree checklist); without priors, the best by GPA
                  const bp = ranked.get(`${r.s} ${r.n}`)?.best;
                  if (bp)
                    return {
                      label: `Best professor, ${termLabel(nextTerm)}`,
                      value: <span className="font-semibold">{bp.name}</span>,
                      sub: bp.d !== null ? `${bp.d >= 0 ? "+" : "−"}${Math.abs(bp.d).toFixed(2)} vs course, ${fmtInt(bp.dn)} students` : "No grade history",
                    };
                  return {
                    label: `Best professor, ${termLabel(nextTerm)}`,
                    value: r.best ? <span className="font-semibold">{r.best.name}</span> : undefined,
                    sub: r.best ? `GPA ${fmtGpa(r.best.gpa)}, ${fmtInt(r.best.students)} students` : undefined,
                  };
                })(),
                rmp: { label: "RMP", value: r.rmp !== null ? <span className="tnum">{r.rmp.toFixed(1)}</span> : undefined },
                next: {
                  label: statusKnown ? "Open lectures" : "Lectures",
                  value: r.nSec ? <span className="tnum">{r.statusKnown ? `${openCount(r)} of ${r.nSec}` : r.nSec}</span> : <span className="text-muted">Not offered</span>,
                  sub: r.nSec ? termLabel(nextTerm) : undefined,
                },
              }}
              action={r.nSec > 0 ? <AddToCart subject={r.s} number={r.n} small /> : null}
            />
          ))}
        </ul>
        {result.length > limit && (
          <button className="mt-4 rounded border border-action px-3 py-1.5 font-semibold text-action hover:bg-action-tint" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, result.length - limit)} more ({result.length - limit} left)
          </button>
        )}
        {rows && !result.length && <p className="mt-3 text-muted">No gen-eds match these filters. Try removing one.</p>}
      </section>
    </div>
  );
}
