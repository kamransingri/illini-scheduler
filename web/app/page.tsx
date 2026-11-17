import Link from "next/link";
import LiveOpenings from "@/components/home/LiveOpenings";
import YourSchedule from "@/components/home/YourSchedule";
import SearchBox from "@/components/SearchBox";
import Icon, { type IconName } from "@/components/ui/Icon";
import Info from "@/components/ui/Info";
import { getDegreeIndex, getMeta, getSearchIndex } from "@/lib/data";
import { courseHref, fmtDate, termLabel, termRange } from "@/lib/format";

const POPULAR: [string, string][] = [
  ["CS", "124"],
  ["MATH", "221"],
  ["STAT", "107"],
  ["RHET", "105"],
  ["MATH", "231"],
  ["STAT", "200"],
  ["ECON", "102"],
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
  const idx = getSearchIndex();
  const known = new Set(idx.courses.map((c) => `${c.s} ${c.n}`));
  const offered = idx.courses.filter((c) => c.nx).length;
  const geneds = idx.courses.filter((c) => c.nx && c.g.length).length;
  const programs = getDegreeIndex().length;
  const next = meta.terms[meta.next_term];
  const nextLabel = termLabel(meta.next_term);

  const tools: { href: string; icon: IconName; name: string; what: string; answers: string }[] = [
    { href: "/geneds/", icon: "layers", name: "Gen-ed finder", what: "Gen-eds that count for every category you pick, ranked by GPA, professors and open seats.", answers: "Which gen-ed should I take?" },
    { href: "/schedule/", icon: "calendar", name: "Schedule builder", what: "Every conflict-free combination of your courses, ranked by the rules and priorities you set.", answers: "How do my classes fit together?" },
    { href: "/degree/", icon: "cap", name: "Degree checklist", what: `Your courses checked against any of ${programs} undergraduate programs, with the best options for what's left.`, answers: "What do I still need?" },
    { href: "/opened/", icon: "bolt", name: "Just opened", what: "Sections that just went from closed to open, updated through the day. Copy the CRN and register.", answers: "Did a seat open up?" },
  ];
  const steps: [string, string][] = [
    ["Find a course", "Search by code, title, professor or CRN, or browse gen-eds by category."],
    ["Pick the professor", "Each course page lines up its professors by GPA, grade distribution, ratings and open lectures."],
    ["Build and register", "Generate a conflict-free week, copy every CRN at once and finish in Self-Service."],
  ];

  return (
    <div className="space-y-14">
      <section className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_21rem]" aria-labelledby="home-h">
        <div className="min-w-0">
          <h1 id="home-h" className="font-display text-2xl font-bold text-heading">
            Plan your {nextLabel} schedule
          </h1>
          <p className="mt-2 max-w-prose text-lg">Find a course, compare its professors by GPA and ratings, and build a week with no conflicts.</p>
          <div className="mt-6">
            <SearchBox nextTerm={meta.next_term} autoFocus />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-muted">Often searched:</span>
            {POPULAR.filter(([s, n]) => known.has(`${s} ${n}`)).map(([s, n]) => (
              <Link key={s + n} href={courseHref(s, n)} className="rounded border border-line px-2 leading-7 font-semibold text-action hover:border-action hover:bg-action-tint">
                {s} {n}
              </Link>
            ))}
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-y-4 border-y border-line py-4 sm:grid-cols-4 sm:divide-x sm:divide-line">
            {(
              [
                [meta.n_courses.toLocaleString(), "courses with a page"],
                [offered.toLocaleString(), `offered in ${nextLabel}`],
                [geneds.toLocaleString(), `gen-eds in ${nextLabel}`],
                [idx.instructors.length.toLocaleString(), "professors teaching"],
              ] as [string, string][]
            ).map(([v, l]) => (
              <div key={l} className="flex flex-col sm:px-4 sm:first:pl-0">
                <dt className="text-sm text-muted">{l}</dt>
                <dd className="order-first font-display text-xl font-bold text-heading tnum">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <LiveOpenings nextTerm={meta.next_term} liveUrl={meta.live_url} />
      </section>

      <section aria-labelledby="tools-h">
        <h2 id="tools-h" className="font-display text-xl font-bold text-heading">
          Everything you need before registration
        </h2>
        <ul className="mt-4 grid border-t border-line sm:grid-cols-2">
          {tools.map((t, i) => (
            <li key={t.href} className={`border-b border-line ${i % 2 === 0 ? "sm:border-r sm:pr-6" : "sm:pl-6"}`}>
              <Link href={t.href} className="group flex gap-4 py-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded bg-action-tint text-action">
                  <Icon name={t.icon} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-semibold text-action group-hover:underline">{t.name}</span>
                  <span className="mt-0.5 block text-sm text-muted">{t.answers}</span>
                  <span className="mt-1 block">{t.what}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-3 rounded bg-panel p-4">
          <Icon name="calendar" className="mt-1 text-heading" />
          <span>
            <span className="font-semibold text-heading">Your schedule. </span>
            <YourSchedule />
          </span>
        </p>
      </section>

      <section aria-labelledby="how-h">
        <h2 id="how-h" className="font-display text-xl font-bold text-heading">
          How it works
        </h2>
        <ol className="mt-4 grid gap-6 sm:grid-cols-3">
          {steps.map(([title, text], i) => (
            <li key={title} className="border-t-4 border-navy pt-3">
              <span className="font-display text-xl font-bold text-heading tnum">{i + 1}</span>
              <p className="mt-1 text-lg font-semibold text-heading">{title}</p>
              <p className="mt-1">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <p className="inline-flex flex-wrap items-center text-muted">
        {nextLabel} schedule as of {fmtDate(next?.checked_at)}. GPA data through {termLabel(meta.gpa.window[1])}.
        <Info label="Where the data comes from">
          Sections from Course Explorer; every course&apos;s seats are checked daily and the busiest courses about every 10 minutes. Grades from the UIUC GPA
          dataset ({termRange(meta.gpa.window[0], meta.gpa.window[1])}). Ratings from Rate My Professors. Everything is rebuilt nightly.
        </Info>
      </p>
    </div>
  );
}
