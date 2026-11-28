"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GENED_GROUPS } from "@/lib/geneds";
import { cisUrl, courseHref, dataUrl, fmtGpa, GENED_NAMES, GENED_SHORT } from "@/lib/format";
import { DEFAULT_SUMMER, filterSummer, SESSION_LABEL, SESSION_SHORT, summerFromQuery, summerToQuery, type Season, type SummerData, type SummerFilters } from "@/lib/summer";
import Icon from "./ui/Icon";

const PAGE = 60;
const TH = "border-l border-line px-2.5 py-2 align-bottom font-semibold first:border-l-0";
const TD = "border-l border-line px-2.5 py-2.5 first:border-l-0";

const credits = (cr: [number, number] | null) => (!cr ? "" : cr[0] === cr[1] ? `${cr[0]}` : `${cr[0]}–${cr[1]}`);
const ONLINE_LABEL = { all: "Online", some: "Online or on campus", none: "On campus" } as const;

/** The gen-ed finder's Summer view, or with season="winter" its Winter view (#270): winter.json has the same fields, and
 * winter is one session, so the session filter and column are left out. */
export default function SummerFinder({ season = "summer" }: { season?: Season }) {
  const winter = season === "winter";
  const [data, setData] = useState<SummerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<SummerFilters>(DEFAULT_SUMMER);
  const [restored, setRestored] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const f0 = summerFromQuery(window.location.search);
    setF(winter ? { ...f0, session: "" } : f0);
    setRestored(true);
    fetch(dataUrl(`${season}.json`))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SummerData>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [season, winter]);
  useEffect(() => {
    if (!restored) return;
    const q = summerToQuery(f);
    window.history.replaceState(null, "", `${window.location.pathname}?term=${season}${q ? `&${q}` : ""}`);
  }, [f, restored, season]);

  const recent = data?.recent.length ?? 0;
  const onlineOnly = data?.courses.filter((r) => r.online === "all").length ?? 0;
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
        Couldn&apos;t load the {season} courses ({error}). Reload to try again.
      </p>
    );
  }
  if (!data) return <p className="text-muted">Loading {season} courses…</p>;
  return (
    <div className="space-y-6">
      <p className="max-w-3xl rounded bg-panel p-3" data-testid="summer-note">
        {winter ? (
          data.upcoming ? (
            <>
              The {data.courses.length} classes on Course Explorer&apos;s <span className="font-semibold">{data.label}</span> schedule, one short session
              between fall and spring; {onlineOnly === data.courses.length ? "all of them are" : `${onlineOnly} of them are`} online only. Sections can still
              change, so confirm in Course Explorer before you register.
            </>
          ) : (
            <>
              {data.next_label}&apos;s schedule isn&apos;t published yet. These are the {data.courses.length} classes that ran in{" "}
              <span className="font-semibold">{data.label}</span>; most winter classes run every year, so check Course Explorer once {data.next_label} is out.
            </>
          )
        ) : data.upcoming ? (
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
      <form className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${winter ? "lg:grid-cols-3" : "lg:grid-cols-4"}`} onSubmit={(e) => e.preventDefault()} aria-label="Filters">
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
          <select aria-label="Gen-ed" className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1.5" value={f.gened} onChange={(e) => set("gened", e.target.value)}>
            <option value="any">Any gen-ed</option>
            <option value="all">Any course (not only gen-eds)</option>
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
        {!winter && (
        <label className="block">
          <span className="text-sm text-muted">Session</span>
          <select aria-label="Session" className="mt-0.5 w-full rounded border border-line bg-white px-2 py-1.5" value={f.session} onChange={(e) => set("session", e.target.value)}>
            <option value="">Any session</option>
            {Object.entries(SESSION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        )}
        <fieldset className="text-sm">
          <legend className="sr-only">Show</legend>
          {check("Online", "online")}
          {check("On campus", "campus")}
          {check(`Ran all of the last ${recent} ${season}s`, "every")}
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
                {!winter && <th className={TH}>Session</th>}
                <th className={TH}>Where</th>
                <th className={TH}>Hours</th>
                <th className={TH}>Gen-ed</th>
                <th className={`${TH} text-right`}>GPA</th>
                <th className={`${TH} text-right`}>{winter ? "Winters" : "Summers"}</th>
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
                      <a href={cisUrl(data.term, r.s, r.n)} className="font-semibold text-action hover:underline" target="_blank" rel="noopener noreferrer">
                        {r.s} {r.n}
                      </a>
                    )}
                    <div className="text-sm">{r.t}</div>
                  </td>
                  {!winter && <td className={`${TD} text-sm`}>{r.sess.map((x) => SESSION_SHORT[x] ?? x).join(", ")}</td>}
                  <td className={`${TD} text-sm`}>{ONLINE_LABEL[r.online]}</td>
                  <td className={`${TD} text-sm`}>{credits(r.cr)}</td>
                  <td className={`${TD} text-sm`}>{r.codes.map((c) => GENED_SHORT[c] ?? c).join(", ")}</td>
                  <td className={`${TD} text-right font-mono text-sm`}>{fmtGpa(r.gpa)}</td>
                  <td className={`${TD} text-right text-sm`} title={`Ran in ${r.ran} of the last ${recent} ${season}s`}>
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
