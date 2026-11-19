import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCart from "@/components/AddToCart";
import BestPick from "@/components/course/BestPick";
import CourseView from "@/components/course/CourseView";
import { Badge } from "@/components/ui/Badge";
import DataRow from "@/components/ui/DataRow";
import Expandable from "@/components/ui/Expandable";
import Icon from "@/components/ui/Icon";
import Info from "@/components/ui/Info";
import Stat from "@/components/ui/Stat";
import { courseParams, getCourse, getMeta, getSummer } from "@/lib/data";
import { cisUrl, fmtDate, fmtGpa, fmtInt, GENED_NAMES, termLabel, termRange } from "@/lib/format";
import { profInput } from "@/lib/rank";
import { professorsFor, tally } from "@/lib/sections";
import { DEFAULT_SUMMER, summerHref, summerLine } from "@/lib/summer";

export const dynamicParams = false;

export function generateStaticParams() {
  return courseParams();
}

type Props = { params: Promise<{ subject: string; number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subject, number } = await params;
  const c = getCourse(subject, number);
  return {
    title: c ? `${subject} ${number}: ${c.title}` : `${subject} ${number}`,
    description: c ? `${subject} ${number} ${c.title}: professors compared by GPA and ratings, sections, offering history and changes.` : undefined,
  };
}

export default async function CoursePage({ params }: Props) {
  const { subject, number } = await params;
  const course = getCourse(subject, number);
  const meta = getMeta();
  if (!course || !meta) notFound();
  const next = course.terms[meta.next_term];
  const regularWindow = meta.history_terms.filter((t) => /-(sp|fa)$/.test(t)).slice(-8);
  const g = course.gpa;
  const cisTerm = next ? meta.next_term : (course.latest_term ?? meta.current_term);
  const recentLabel = g?.recent_terms?.length ? termRange(g.recent_terms[0], g.recent_terms[1]) : "";
  const t = next ? tally(next.sections) : null;
  const candidates = next ? professorsFor(course, meta.next_term).profs.map((p) => ({ key: p.key, name: p.ins.name, input: profInput(course, p) })) : [];
  const credits = course.credits.replace(" hours.", "");
  const summer = getSummer();
  const inSummer = summer?.by.get(`${course.subject} ${course.number}`);
  return (
    <article>
      <header className="pb-6">
        <p className="text-muted">
          <span className="font-semibold text-ink">
            {course.subject} {course.number}
          </span>
          {course.subject_name ? <span>, {course.subject_name}</span> : null}
          {course.formerly?.map((f) => (
            <span key={f.code} className="inline-flex items-center" data-testid="formerly">
              . Formerly {f.code}
              {f.until ? ` (until ${termLabel(f.until)})` : ""}
              <Info label={`Why ${course.subject} ${course.number} was ${f.code}`}>
                Renumbered: grades, offering history and changes before the new number are counted here and marked &ldquo;as {f.code}&rdquo;. Source: {f.source}
              </Info>
            </span>
          ))}
        </p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <h1 className="max-w-3xl font-display text-2xl font-bold text-heading">{course.title}</h1>
          {next?.sections.length ? <AddToCart subject={course.subject} number={course.number} /> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {credits && <Badge>{credits.startsWith("1 ") ? "1 credit hour" : `${credits} credit hours`}</Badge>}
          {course.geneds.codes.map((code) => (
            <Badge key={code} title={`Gen-ed: ${GENED_NAMES[code] ?? code}`}>
              {GENED_NAMES[code] ?? code}
            </Badge>
          ))}
          <a href={cisUrl(cisTerm, course.subject, course.number)} className="inline-flex items-center gap-1 font-semibold text-action underline" rel="noopener">
            Course Explorer
            <Icon name="external" />
          </a>
        </div>

        <dl className="mt-6 grid gap-x-8 gap-y-4 border-y border-line py-4 sm:grid-cols-3">
          <Stat
            label="Recent course GPA"
            value={
              g && g.recent !== null ? (
                fmtGpa(g.recent)
              ) : g ? (
                fmtGpa(g.avg)
              ) : (
                <span className="font-sans text-lg font-semibold text-muted">No grade data</span>
              )
            }
            sub={g ? (g.recent !== null ? `${fmtInt(g.recent_students)} students, ${recentLabel}` : `All-time, ${termRange(g.first_term, g.last_term)}`) : "Sections of 20 or fewer students are withheld"}
            source={
              g
                ? g.recent !== null
                  ? `UIUC GPA dataset, ${recentLabel}, ${fmtInt(g.recent_students)} graded students. All-time (${termRange(g.first_term, g.last_term)}): ${fmtGpa(g.avg)} from ${fmtInt(g.students)} students.`
                  : `UIUC GPA dataset, ${termRange(g.first_term, g.last_term)}, ${fmtInt(g.students)} students (none in the recent window).`
                : "The UIUC GPA dataset leaves out sections of 20 or fewer students (FERPA), so small courses have no grade data."
            }
          />
          <Stat
            label={`${termLabel(meta.next_term)} lectures`}
            value={
              !next || !next.sections.length ? (
                "Not offered"
              ) : t && t.known ? (
                <span>
                  {t.open} of {t.total} open
                </span>
              ) : (
                <span>{next.n_primary} listed</span>
              )
            }
            sub={!next || !next.sections.length ? (course.pattern ? `Usually ${course.pattern.label.toLowerCase()}` : undefined) : t && t.known ? `Checked ${fmtDate(next.checked_at)}` : "Seat status not published yet"}
            source={next ? `Course Explorer, ${termLabel(meta.next_term)} schedule; seat status checked ${fmtDate(next.checked_at)}. "Open" includes Open (Restricted).` : `Course Explorer: no ${termLabel(meta.next_term)} sections.`}
          />
          {meta.score_priors && candidates.length > 0 ? (
            <BestPick candidates={candidates} priors={meta.score_priors} termLabel={termLabel(meta.next_term)} />
          ) : (
            <Stat label={`Best pick, ${termLabel(meta.next_term)}`} value={<span className="font-sans text-lg font-semibold text-muted">No professors listed</span>} />
          )}
        </dl>
      </header>

      <section aria-labelledby="summary-h" className="mb-8 rounded bg-panel px-4 py-3">
        <h2 id="summary-h" className="font-semibold text-heading">
          Before you register
        </h2>
        <dl className="divide-y divide-line">
          <DataRow
            label="When it's offered"
            source={`Course Explorer schedules, the last 8 fall and spring terms (${termRange(regularWindow[0], regularWindow[regularWindow.length - 1])}) plus summers${course.formerly?.length ? `, including terms as ${course.formerly.map((f) => f.code).join(" and ")}` : ""}.${course.pattern ? ` ${course.pattern.reason}.` : ""}`}
          >
            {course.pattern ? (
              <>
                <span className="font-semibold">{course.pattern.label}</span>
                <span className="text-muted">
                  {". "}
                  {termLabel(course.pattern.target)} outlook: <span className="font-semibold text-ink">{course.pattern.likelihood}</span>
                </span>
              </>
            ) : (
              "No recent offerings"
            )}
          </DataRow>
          {summer && inSummer && (
            <DataRow
              label="Summer"
              source={`Course Explorer's ${summer.data.label} schedule, and the summers ${summer.data.recent.map((t) => termLabel(t)).join(", ")}.`}
            >
              <span data-testid="summer-line">{summerLine(inSummer, summer.data)}</span>{" "}
              <Link href={summerHref({ ...DEFAULT_SUMMER, gened: "all", q: course.subject })} className="text-action underline">
                Every summer {course.subject} class
              </Link>
            </DataRow>
          )}
          <DataRow
            label="Biggest recent change"
            source={course.biggest_change ? `Course Explorer catalog, compared term to term (${termLabel(course.biggest_change.term)}).` : undefined}
          >
            {course.biggest_change ? course.biggest_change.summary : "No changes this term or last"}
          </DataRow>
          {course.prereq && <DataRow label="Prerequisites">{course.prereq}</DataRow>}
        </dl>
        {course.description && (
          <div className="border-t border-line py-2">
            <Expandable summary="Course description">
              <p className="max-w-prose">{course.description}</p>
              {course.schedule_info && <p className="mt-2 max-w-prose text-muted">{course.schedule_info}</p>}
            </Expandable>
          </div>
        )}
      </section>

      <CourseView
        subject={course.subject}
        number={course.number}
        meta={{ next_term: meta.next_term, current_term: meta.current_term, rmp_status: meta.rmp_status, repo_url: meta.repo_url, score_priors: meta.score_priors }}
      />
    </article>
  );
}
