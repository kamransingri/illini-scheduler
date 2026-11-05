import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import { getMeta } from "@/lib/data";
import { courseHref, fmtDate, termLabel } from "@/lib/format";

export default function Home() {
  const meta = getMeta();
  if (!meta) {
    return (
      <p className="text-bad">
        No data has been built yet. Run <code>make data</code>, then rebuild the site.
      </p>
    );
  }
  const next = meta.terms[meta.next_term];
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Plan your {termLabel(meta.next_term)} schedule</h1>
        <p className="mt-1 text-muted">
          Sections, GPA by instructor, when a course is offered, what changed, and a conflict-free schedule builder for UIUC.
        </p>
      </section>
      <SearchBox nextTerm={meta.next_term} autoFocus />
      <section className="flex flex-wrap gap-2 text-sm">
        <span className="text-muted">Popular:</span>
        {[
          ["CS", "124"],
          ["MATH", "221"],
          ["STAT", "107"],
          ["RHET", "105"],
          ["MATH", "231"],
          ["STAT", "200"],
        ].map(([s, n]) => (
          <Link key={s + n} href={courseHref(s, n)} className="rounded-full border border-line px-3 py-1 hover:bg-panel">
            {s} {n}
          </Link>
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/opened/" className="rounded-lg border border-line p-4 no-underline hover:bg-panel">
          <div className="font-semibold">Just opened →</div>
          <p className="mt-1 text-sm text-muted">Sections that went from Closed to Open this week.</p>
        </Link>
        <Link href="/geneds/" className="rounded-lg border border-line p-4 no-underline hover:bg-panel">
          <div className="font-semibold">Gen-ed finder →</div>
          <p className="mt-1 text-sm text-muted">Filter gen-eds by category and time, sorted by GPA.</p>
        </Link>
        <Link href="/schedule/" className="rounded-lg border border-line p-4 no-underline hover:bg-panel">
          <div className="font-semibold">Schedule builder →</div>
          <p className="mt-1 text-sm text-muted">Every conflict-free combination, ranked by your preferences.</p>
        </Link>
        <div className="rounded-lg border border-line p-4 text-sm text-muted">
          <div className="font-semibold text-ink">Data freshness</div>
          <p className="mt-1">
            {termLabel(meta.next_term)} schedule as of {fmtDate(next?.checked_at)}. GPA data through {termLabel(meta.gpa.window[1])}.
          </p>
        </div>
      </section>
    </div>
  );
}
