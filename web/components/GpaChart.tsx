import type { GpaBlock } from "@/lib/types";
import { fmtGpa, fmtInt, fmtPct, termLabel } from "@/lib/format";
import { GRADE_SEGS } from "./GradeBar";
import Info from "./ui/Info";

/**
 * Grades over time as a table: one row per term, newest first, with that term's grade mix as a horizontal stacked bar
 * and its average GPA. Text stays at real CSS sizes on every screen (an SVG chart shrank its labels to ~5px on phones).
 */
export default function GpaChart({ gpa }: { gpa: GpaBlock }) {
  const rows = gpa.by_term.slice(-16).reverse();
  if (!rows.length) return null;
  const first = rows[rows.length - 1].term;
  const last = rows[0].term;
  return (
    <div className="max-w-3xl">
      <table className="w-full border-collapse">
        <caption className="mb-2 text-left text-muted">
          <span className="sr-only">Grade distribution and average GPA by term. </span>
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-hidden>
            {GRADE_SEGS.map((s) => (
              <span key={s.k} className="inline-flex items-center gap-1.5 text-ink">
                <span className={`inline-block size-2.5 rounded-sm ${s.cls}`} />
                {s.label}
              </span>
            ))}
          </span>
          <Info label="Source for grades over time">
            Share of A, B, C and D-F grades among graded students each term, and that term&apos;s average GPA. Source: UIUC GPA dataset (Wade
            Fagen-Ulmschneider), {termLabel(first)} to {termLabel(last)}.
          </Info>
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Term</th>
            <th scope="col">Grade mix</th>
            <th scope="col">Average GPA</th>
            <th scope="col">Graded students</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mix = GRADE_SEGS.map((s) => `${s.label} ${fmtPct(r.pct[s.k])}`).join(", ");
            return (
              <tr key={r.term} className="border-b border-line">
                <th scope="row" className="w-28 py-1.5 pr-3 text-left font-normal whitespace-nowrap">
                  {termLabel(r.term)}
                  {r.as && <span className="block text-sm text-muted">as {r.as}</span>}
                </th>
                <td className="py-1.5 pr-3">
                  <div className="flex h-3 w-full overflow-hidden rounded" role="img" aria-label={mix} title={mix}>
                    {GRADE_SEGS.map((s) => (
                      <div key={s.k} className={s.cls} style={{ width: `${Math.max(0, (r.pct[s.k] ?? 0) * 100)}%` }} />
                    ))}
                  </div>
                </td>
                <td className="w-12 py-1.5 pr-3 text-right font-semibold text-heading tnum">{fmtGpa(r.gpa)}</td>
                <td className="hidden w-28 py-1.5 text-right text-sm text-muted tnum sm:table-cell">{fmtInt(r.students)} students</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
