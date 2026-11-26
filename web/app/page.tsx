import Link from "next/link";
import LiveOpenings from "@/components/home/LiveOpenings";
import SearchBox from "@/components/SearchBox";
import { getMeta, getSearchIndex } from "@/lib/data";
import { courseHref, GENED_SHORT, termLabel } from "@/lib/format";

const POPULAR: [string, string][] = [
  ["CS", "124"],
  ["MATH", "221"],
  ["STAT", "107"],
  ["RHET", "105"],
  ["MATH", "231"],
  ["STAT", "200"],
  ["ECON", "102"],
];

// Each opens the gen-ed finder with that category picked; the finder isn't a header tab (DECISIONS D61)
const POPULAR_GENEDS = ["ACP", "NW", "WCC", "US", "HP", "QR1"];

const chip = "rounded border border-line px-2 leading-7 font-semibold text-action hover:border-action hover:bg-action-tint";

// The home page is the search, the courses and gen-eds students look up most, and the seats that just opened
// (DECISIONS D39, D61). Every other page is one click away in the header or from here.
export default function Home() {
  const meta = getMeta();
  if (!meta) {
    return (
      <p>
        No data has been built yet. Run <code>make data</code>, then rebuild the site.
      </p>
    );
  }
  const known = new Set(getSearchIndex().courses.map((c) => `${c.s} ${c.n}`));

  return (
    <section className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_21rem]" aria-labelledby="home-h">
      <div className="min-w-0">
        <h1 id="home-h" className="font-display text-2xl font-bold text-heading">
          Plan your {termLabel(meta.next_term)} schedule
        </h1>
        <p className="mt-2 max-w-prose text-lg">Find a course, compare its professors by GPA and ratings, and build a week with no conflicts.</p>
        <div className="mt-6">
          <SearchBox nextTerm={meta.next_term} autoFocus />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="home-popular">
          <span className="mr-1 text-muted">Often searched:</span>
          {POPULAR.filter(([s, n]) => known.has(`${s} ${n}`)).map(([s, n]) => (
            <Link key={s + n} href={courseHref(s, n)} className={chip}>
              {s} {n}
            </Link>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="home-geneds">
          <span className="mr-1 text-muted">Popular gen-eds:</span>
          {POPULAR_GENEDS.map((code) => (
            <Link key={code} href={`/geneds/?codes=${code}`} className={chip}>
              {GENED_SHORT[code]}
            </Link>
          ))}
          <Link href="/geneds/" className={chip}>
            All gen-eds
          </Link>
        </div>
      </div>
      <LiveOpenings nextTerm={meta.next_term} liveUrl={meta.live_url} />
    </section>
  );
}
