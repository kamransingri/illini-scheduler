import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import Info from "@/components/ui/Info";
import { getMeta } from "@/lib/data";
import { courseHref, fmtDate, termLabel, termRange } from "@/lib/format";

const POPULAR: [string, string][] = [
  ["CS", "124"],
  ["MATH", "221"],
  ["STAT", "107"],
  ["RHET", "105"],
  ["MATH", "231"],
  ["STAT", "200"],
];

export default function Home() {
  const meta = getMeta();
  if (!meta) {
    return (
      <p>
        No data has been built yet. Run <code>make data</code>, then rebuild the site.
      </p>
    );
  }
  const next = meta.terms[meta.next_term];
  const tools: [string, string, string][] = [
    ["/geneds/", "Gen-ed finder", "Filter gen-eds by category, time and seats, sorted by GPA."],
    ["/schedule/", "Schedule builder", "Every conflict-free combination of your courses, ranked by what matters to you."],
    ["/opened/", "Just opened", "Sections that went from closed to open in the last week."],
  ];
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-heading">Plan your {termLabel(meta.next_term)} schedule</h1>
      <p className="mt-2 text-lg">Find a course, compare its professors by GPA and ratings, and build a schedule with no conflicts.</p>
      <div className="mt-6">
        <SearchBox nextTerm={meta.next_term} autoFocus />
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-muted">Often searched:</span>
        {POPULAR.map(([s, n]) => (
          <Link key={s + n} href={courseHref(s, n)} className="font-semibold text-action hover:underline">
            {s} {n}
          </Link>
        ))}
      </p>

      <ul className="mt-12 border-t border-line">
        {tools.map(([href, name, what]) => (
          <li key={href} className="border-b border-line">
            <Link href={href} className="group grid gap-x-6 py-4 sm:grid-cols-[12rem_1fr]">
              <span className="text-lg font-semibold text-action group-hover:underline">{name}</span>
              <span>{what}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 inline-flex flex-wrap items-center text-muted">
        {termLabel(meta.next_term)} schedule and seats as of {fmtDate(next?.checked_at)}. GPA data through {termLabel(meta.gpa.window[1])}.
        <Info label="Where the data comes from">
          Sections and seat status from Course Explorer, checked about once a day. Grades from the UIUC GPA dataset ({termRange(meta.gpa.window[0], meta.gpa.window[1])}).
          Ratings from Rate My Professors. Everything is rebuilt nightly.
        </Info>
      </p>
    </div>
  );
}
