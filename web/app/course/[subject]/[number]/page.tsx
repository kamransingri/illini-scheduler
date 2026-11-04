import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AddToCart from "@/components/AddToCart";
import CourseDetail from "@/components/CourseDetail";
import Metric from "@/components/Metric";
import { courseParams, getCourse, getMeta } from "@/lib/data";
import { cisUrl, fmtDate, fmtGpa, fmtInt, fmtPct, GENED_NAMES, termLabel, termRange } from "@/lib/format";

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
    description: c ? `${subject} ${number} ${c.title}: sections, GPA by instructor, offering history and changes.` : undefined,
  };
}

const LIKELIHOOD_CLS: Record<string, string> = {
  High: "bg-green-100 text-green-800",
  Medium: "bg-amber-100 text-amber-800",
  Low: "bg-red-100 text-red-800",
};

export default async function CoursePage({ params }: Props) {
  const { subject, number } = await params;
  const course = getCourse(subject, number);
  const meta = getMeta();
  if (!course || !meta) notFound();
  const next = course.terms[meta.next_term];
  const g = course.gpa;
  const cisTerm = next ? meta.next_term : (course.latest_term ?? meta.current_term);
  const recentLabel = g?.recent_terms?.length ? termRange(g.recent_terms[0], g.recent_terms[1]) : "";
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted">
          {course.subject} {course.number}
          {course.subject_name ? ` · ${course.subject_name}` : ""}
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{course.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {course.credits && <span className="rounded bg-panel px-2 py-0.5">{course.credits.replace(" hours.", "")} credit hours</span>}
          {course.geneds.codes.map((code) => (
            <span key={code} className="rounded bg-orange-50 px-2 py-0.5 font-medium text-brand-dark" title={GENED_NAMES[code] ?? code}>
              {GENED_NAMES[code] ?? code}
            </span>
          ))}
          <a href={cisUrl(cisTerm, course.subject, course.number)} className="text-brand-dark underline" rel="noopener">
            Course Explorer ↗
          </a>
          {next?.sections.length ? <AddToCart subject={course.subject} number={course.number} /> : null}
        </div>
        {course.prereq && (
          <p className="text-sm">
            <span className="font-semibold">Prerequisites:</span> {course.prereq}
          </p>
        )}
      </header>

      <section aria-labelledby="summary-h" className="rounded-lg border border-line bg-panel p-4">
        <h2 id="summary-h" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Before you register
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Average GPA (recent)</dt>
            <dd className="text-2xl font-bold">
              {g && g.recent !== null ? (
                <Metric
                  source={`UIUC GPA dataset, ${recentLabel}, ${fmtInt(g.recent_students)} students. All-time (${termRange(g.first_term, g.last_term)}): ${fmtGpa(g.avg)}.`}
                >
                  {fmtGpa(g.recent)}
                </Metric>
              ) : g ? (
                <Metric
                  source={`UIUC GPA dataset, ${termRange(g.first_term, g.last_term)}, ${fmtInt(g.students)} students (none in the recent window)`}
                >
                  {fmtGpa(g.avg)}
                </Metric>
              ) : (
                <span className="text-base font-medium text-muted">No grade data</span>
              )}
              {!g && (
                <span className="block text-xs font-normal text-muted">Sections of ≤ 20 students are withheld from the GPA dataset.</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">When it&apos;s offered</dt>
            <dd className="font-semibold">
              {course.pattern ? (
                <Metric
                  source={`Course Explorer schedules, ${termRange(meta.history_terms[0], meta.history_terms[meta.history_terms.length - 1])}`}
                >
                  {course.pattern.label}
                </Metric>
              ) : (
                "No recent offerings"
              )}
              {course.pattern && (
                <span className="mt-1 block text-xs font-normal">
                  {termLabel(course.pattern.target)}:{" "}
                  <span className={`rounded px-1.5 py-0.5 font-medium ${LIKELIHOOD_CLS[course.pattern.likelihood] ?? ""}`}>
                    {course.pattern.likelihood}
                  </span>{" "}
                  <span className="text-muted">{course.pattern.reason}</span>
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{termLabel(meta.next_term)} sections</dt>
            <dd className="font-semibold">
              {!next || !next.sections.length ? (
                <span>Not offered</span>
              ) : next.status_known && next.n_open !== null ? (
                <Metric source={`Course Explorer snapshot, ${fmtDate(next.checked_at)}`}>
                  {fmtPct(next.n_primary ? next.n_open / next.n_primary : 0)} open ({next.n_open}/{next.n_primary})
                </Metric>
              ) : (
                <Metric source={`Course Explorer snapshot, ${fmtDate(next.checked_at)}, taken before seat status was published`}>
                  {next.n_primary} lecture section{next.n_primary === 1 ? "" : "s"} listed
                </Metric>
              )}
              {next && next.sections.length > 0 && !next.status_known && (
                <span className="block text-xs font-normal text-muted">Seat status not published yet; check live seats.</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Biggest recent change</dt>
            <dd className="text-sm font-medium">
              {course.biggest_change ? (
                <Metric source={`Course Explorer catalog, compared term to term (${termLabel(course.biggest_change.term)})`}>
                  {course.biggest_change.summary}
                </Metric>
              ) : (
                "No changes found"
              )}
            </dd>
          </div>
        </dl>
      </section>

      {course.description && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Course description</summary>
          <p className="mt-2 leading-relaxed">{course.description}</p>
          {course.schedule_info && <p className="mt-2 text-muted">{course.schedule_info}</p>}
        </details>
      )}

      <CourseDetail
        subject={course.subject}
        number={course.number}
        meta={{ next_term: meta.next_term, current_term: meta.current_term, rmp_status: meta.rmp_status, repo_url: meta.repo_url }}
      />
    </article>
  );
}
