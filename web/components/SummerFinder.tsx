"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GENED_GROUPS } from "@/lib/geneds";
import { cisUrl, courseHref, dataUrl, fmtGpa, GENED_NAMES, GENED_SHORT } from "@/lib/format";
import { DEFAULT_SUMMER, filterSummer, SESSION_LABEL, SESSION_SHORT, summerFromQuery, summerToQuery, type SummerData, type SummerFilters } from "@/lib/summer";
import Icon from "./ui/Icon";

const PAGE = 60;
const TH = "border-l border-line px-2.5 py-2 align-bottom font-semibold first:border-l-0";
const TD = "border-l border-line px-2.5 py-2.5 first:border-l-0";

const credits = (cr: [number, number] | null) => (!cr ? "" : cr[0] === cr[1] ? `${cr[0]}` : `${cr[0]}–${cr[1]}`);
const ONLINE_LABEL = { all: "Online", some: "Online or on campus", none: "On campus" } as const;

export default function SummerFinder() {
  const [data, setData] = useState<SummerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<SummerFilters>(DEFAULT_SUMMER);
  const [restored, setRestored] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    setF(summerFromQuery(window.location.search));
    setRestored(true);
    fetch(dataUrl("summer.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SummerData>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!restored) return;
    const q = summerToQuery(f);
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, [f, restored]);

  const recent = data?.recent.length ?? 0;
  const rows = useMemo(() => (data ? filterSummer(data.courses, f, recent) : []), [data, f, recent]);
  const set = <K extends keyof SummerFilters>(k: K, v: SummerFilters[K]) => {
    setF((old) => ({ ...old, [k]: v }));
    setLimit(PAGE);
  };
  const check = (label: string, k: "online" | "campus" | "every" | "undergrad") => (
    <label className="flex items-start gap-2 py-0.5">
      <input type="checkbox" className="mt-1 size-4 accent-action" checked={f[k]} onChange={(e) => set(k, e.target.checked)} />
      <span>{label}</span>
    </label>
  );

  if (error) {
    return (
      <p role="alert" className="flex items-start gap-2">
        <Icon name="alert" className="mt-1" />
        Couldn&apos;t load the summer courses ({error}). Reload to try again.
      </p>
    );
  }
  if (!data) return <p className="text-muted">Loading summer courses…</p>;
  return (
    <div className="space-y-6">
      <p className="max-w-3xl rounded bg-panel p-3" data-testid="summer-note">
        {data.upcoming ? (
          <>
            The {data.courses.length} classes on Course Explorer&apos;s <span className="font-semibold">{data.label}</span> schedule. Sections can still change before
            summer, so confirm in Course Explorer before you register.
          </>
        ) : (
          <>
            {data.next_label}&apos;s schedule isn&apos;t published yet: Course Explorer usually lists the summer around March. These are the {data.courses.length}{" "}
            classes that ran in <span className="font-semibold">{data.label}</span>. Most summer classes run every year, so this is a good guide to plan with;
            check Course Explorer once {data.next_label} is out.
          </>
        )}
      </p>
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()} aria-label="Filters">
        <label className="block">
          <span className="text-sm text-muted">Course or subject</span>
          <input
            type="search"
            className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1.5"
            placeholder="ECON, CS 124, statistics"
            value={f.q}
            onChange={(e) => set("q", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Gen-ed</span>
          <select className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1.5" value={f.gened} onChange={(e) => set("gened", e.target.value)}>
            <option value="">Any course</option>
            <option value="any">Any gen-ed</option>
            {GENED_GROUPS.map((g) => (
              <optgroup key={g.cat} label={g.label}>
                {g.codes.map((c) => (
                  <option key={c} value={c}>
                    {GENED_NAMES[c] ?? c}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-muted">Session</span>
          <select className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1.5" value={f.session} onChange={(e) => set("session", e.target.value)}>
            <option value="">Any session</option>
            {Object.entries(SESSION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="text-sm">
          <legend className="sr-only">Show</legend>
          {check("Online", "online")}
          {check("On campus", "campus")}
          {check(`Ran all of the last ${recent} summers`, "every")}
          {check("Undergraduate (100 to 400 level)", "undergrad")}
        </fieldset>
      </form>

      <p className="text-sm text-muted" data-testid="summer-count" aria-live="polite">
        {rows.length} of {data.courses.length} classes
      </p>
      {rows.length === 0 ? (
        <p>No classes match. Try fewer filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left" data-testid="summer-table">
            <thead className="border-b border-line text-sm text-muted">
              <tr>
                <th className={TH}>Course</th>
                <th className={TH}>Session</th>
                <th className={TH}>Where</th>
                <th className={TH}>Hours</th>
                <th className={TH}>Gen-ed</th>
                <th className={`${TH} text-right`}>GPA</th>
                <th className={`${TH} text-right`}>Summers</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((r) => (
                <tr key={`${r.s} ${r.n}`} className="border-b border-line align-top" data-course={`${r.s} ${r.n}`}>
                  <td className={TD}>
                    {r.page ? (
                      <Link href={courseHref(r.s, r.n)} className="font-semibold text-action hover:underline">
                        {r.s} {r.n}
                      </Link>
                    ) : (
                      <a href={cisUrl(data.term, r.s, r.n)} className="font-semibold text-action hover:underline" rel="noopener">
                        {r.s} {r.n}
                      </a>
                    )}
                    <div className="text-sm">{r.t}</div>
                  </td>
                  <td className={`${TD} text-sm`}>{r.sess.map((x) => SESSION_SHORT[x] ?? x).join(", ")}</td>
                  <td className={`${TD} text-sm`}>{ONLINE_LABEL[r.online]}</td>
                  <td className={`${TD} text-sm`}>{credits(r.cr)}</td>
                  <td className={`${TD} text-sm`}>{r.codes.map((c) => GENED_SHORT[c] ?? c).join(", ")}</td>
                  <td className={`${TD} text-right font-mono text-sm`}>{fmtGpa(r.gpa)}</td>
                  <td className={`${TD} text-right text-sm`} title={`Ran in ${r.ran} of the last ${recent} summers`}>
                    {r.ran} of {recent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <button type="button" className="rounded border border-action px-3 py-1.5 font-semibold text-action hover:bg-action-tint" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, rows.length - limit)} more
        </button>
      )}
    </div>
  );
}
