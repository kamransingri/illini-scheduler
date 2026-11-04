"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { applyFilters, DEFAULT_FILTERS, GENED_GROUPS, openCount, type Filters, type SortKey } from "@/lib/geneds";
import { courseHref, dataUrl, fmtGpa, fmtInt, fmtPct, GENED_NAMES, termLabel } from "@/lib/format";
import type { GenedRow } from "@/lib/types";
import AddToCart from "./AddToCart";
import Metric from "./Metric";

const PAGE = 50;

export default function GenedFinder({ nextTerm, rmpAvailable }: { nextTerm: string; rmpAvailable: boolean }) {
  const [rows, setRows] = useState<GenedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>("gpa");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    fetch(dataUrl("geneds.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<GenedRow[]>;
      })
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  const result = useMemo(() => (rows ? applyFilters(rows, f, sort) : []), [rows, f, sort]);
  const statusKnown = rows?.some((r) => r.statusKnown) ?? false;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setF((old) => ({ ...old, [k]: v }));
    setLimit(PAGE);
  };
  const toggleCode = (code: string) => set("codes", f.codes.includes(code) ? f.codes.filter((c) => c !== code) : [...f.codes, code]);

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <form className="space-y-4 text-sm" onSubmit={(e) => e.preventDefault()} aria-label="Filters">
        <fieldset>
          <legend className="font-semibold">Category</legend>
          <div className="mt-1 space-y-2">
            {GENED_GROUPS.map((g) => (
              <div key={g.cat}>
                <div className="text-xs text-muted">{g.label}</div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {g.codes.map((code) => (
                    <label key={code} className={`cursor-pointer rounded border px-2 py-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${f.codes.includes(code) ? "border-brand bg-orange-50 text-brand-dark" : "border-line"}`}>
                      <input type="checkbox" className="sr-only" checked={f.codes.includes(code)} onChange={() => toggleCode(code)} />
                      {GENED_NAMES[code] ?? code}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={f.doubleDip} onChange={(e) => set("doubleDip", e.target.checked)} />
            Double-dips only (2+ categories)
          </label>
        </fieldset>
        <fieldset className="space-y-1">
          <legend className="font-semibold">Schedule</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.openNext} onChange={(e) => set("openNext", e.target.checked)} />
            {statusKnown ? "Open sections" : "Has sections"} in {termLabel(nextTerm)}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.minStudents === 200} onChange={(e) => set("minStudents", e.target.checked ? 200 : 0)} />
            GPA from 200+ students
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.earliest === 540} onChange={(e) => set("earliest", e.target.checked ? 540 : null)} />
            No 8am classes
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.noFriday} onChange={(e) => set("noFriday", e.target.checked)} />
            No Friday classes
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.onlineOnly} onChange={(e) => set("onlineOnly", e.target.checked)} />
            Online only
          </label>
        </fieldset>
        <label className="block">
          <span className="font-semibold">Credit hours</span>
          <select className="mt-1 block w-full rounded border border-line p-1" value={f.credits ?? ""} onChange={(e) => set("credits", e.target.value ? Number(e.target.value) : null)}>
            <option value="">Any</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-semibold">Minimum RMP rating</span>
          <select
            className="mt-1 block w-full rounded border border-line p-1 disabled:opacity-50"
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
          {!rmpAvailable && <span className="mt-1 block text-xs text-muted">RMP unavailable in this build.</span>}
        </label>
        <button type="button" className="text-brand-dark underline" onClick={() => setF(DEFAULT_FILTERS)}>
          Reset filters
        </button>
      </form>

      <section aria-label="Results">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm" aria-live="polite">
            {rows ? `${result.length} course${result.length === 1 ? "" : "s"}` : error ? "" : "Loading…"}
          </p>
          <label className="text-sm">
            Sort by{" "}
            <select className="rounded border border-line p-1" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
              <option value="gpa">Recent GPA</option>
              <option value="pctA">% A</option>
              <option value="rmp" disabled={!rmpAvailable}>
                RMP rating
              </option>
              <option value="open">{statusKnown ? "Open sections" : "Sections"}</option>
            </select>
          </label>
        </div>
        {error && (
          <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-bad" role="alert">
            Couldn&apos;t load the gen-ed list ({error}).
          </p>
        )}
        <ul className="mt-2 divide-y divide-line" data-testid="gened-results">
          {result.slice(0, limit).map((r) => (
            <li key={r.s + r.n} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3" data-gpa={r.gpa ?? ""} data-codes={r.codes.join(" ")}>
              <div className="min-w-0 flex-1 basis-60">
                <Link href={courseHref(r.s, r.n)} className="font-semibold no-underline hover:underline">
                  {r.s} {r.n}
                </Link>{" "}
                <span>{r.t}</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.codes.map((c) => (
                    <span key={c} className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-dark">
                      {GENED_NAMES[c] ?? c}
                    </span>
                  ))}
                </div>
              </div>
              <div className="w-24 text-sm">
                <div className="text-xs text-muted">Recent GPA</div>
                {r.gpa !== null ? (
                  <Metric source={`UIUC GPA dataset, last 8 fall/spring terms, ${fmtInt(r.gpaN)} students; ${fmtPct(r.pctA)} A`} className="font-semibold">
                    {fmtGpa(r.gpa)}
                  </Metric>
                ) : (
                  <span className="text-muted">No data</span>
                )}
                {r.gpa !== null && <div className="text-xs text-muted">n={fmtInt(r.gpaN)}</div>}
              </div>
              <div className="w-40 text-sm">
                <div className="text-xs text-muted">Best instructor next term</div>
                {r.best ? (
                  <Metric source={`GPA dataset: ${fmtInt(r.best.students)} students with this instructor in this course`}>
                    {r.best.name} ({fmtGpa(r.best.gpa)})
                  </Metric>
                ) : (
                  <span className="text-muted">–</span>
                )}
              </div>
              <div className="w-20 text-sm">
                <div className="text-xs text-muted">{r.statusKnown ? "Open" : "Sections"}</div>
                {r.nSec ? (r.statusKnown ? `${openCount(r)}/${r.nSec}` : r.nSec) : <span className="text-muted">Not offered</span>}
              </div>
              <div className="self-center">{r.nSec > 0 && <AddToCart subject={r.s} number={r.n} small />}</div>
            </li>
          ))}
        </ul>
        {result.length > limit && (
          <button className="mt-3 rounded border border-line px-3 py-1 text-sm hover:bg-panel" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({result.length - limit} left)
          </button>
        )}
        {rows && !result.length && <p className="mt-3 text-sm text-muted">No gen-eds match these filters. Try removing one.</p>}
      </section>
    </div>
  );
}
