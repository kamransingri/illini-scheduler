import Link from "next/link";
import LiveOpenings from "@/components/home/LiveOpenings";
import SearchBox from "@/components/SearchBox";
import { getGeneds, getMeta, getSearchIndex } from "@/lib/data";
import { courseHref, GENED_NAMES, termLabel } from "@/lib/format";

const POPULAR: [string, string][] = [
  ["CS", "124"],
  ["MATH", "221"],
  ["STAT", "107"],
  ["RHET", "105"],
  ["MATH", "231"],
  ["STAT", "200"],
  ["ECON", "102"],
];

// The gen-ed courses the most students took over the recent terms (graded students in the GPA data), offered next
// term and not already under Often searched; "All gen-eds" opens the finder (DECISIONS D61, D64)
const POPULAR_GENEDS = 6;

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
  const often = POPULAR.filter(([s, n]) => known.has(`${s} ${n}`));
  const geneds = getGeneds()
    .filter((r) => r.nSec > 0 && r.gpaN > 0 && !often.some(([s, n]) => s === r.s && n === r.n))
    .sort((a, b) => b.gpaN - a.gpaN)
    .slice(0, POPULAR_GENEDS);

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
          {often.map(([s, n]) => (
            <Link key={s + n} href={courseHref(s, n)} className={chip}>
              {s} {n}
            </Link>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="home-geneds">
          <span className="mr-1 text-muted">Popular gen-eds:</span>
          {geneds.map((r) => (
            <Link key={r.s + r.n} href={courseHref(r.s, r.n)} className={chip} title={`${r.t}: ${r.codes.map((c) => GENED_NAMES[c] ?? c).join(", ")}`}>
              {r.s} {r.n}
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
