import type { Pct } from "@/lib/types";
import { fmtPct } from "@/lib/format";

// A darkest -> D/F lightest. Blues and grey only: green and red are reserved for "above / below the course average".
export const GRADE_SEGS: { k: keyof Pct; label: string; cls: string; color: string }[] = [
  { k: "A", label: "A", cls: "bg-grade-a", color: "var(--color-grade-a)" },
  { k: "B", label: "B", cls: "bg-grade-b", color: "var(--color-grade-b)" },
  { k: "C", label: "C", cls: "bg-grade-c", color: "var(--color-grade-c)" },
  { k: "DF", label: "D/F", cls: "bg-grade-df", color: "var(--color-grade-df)" },
];

/** Stacked A/B/C/DF bar (shares of graded students) with the W rate as text. */
export default function GradeBar({ pct, source, compact = false }: { pct: Pct; source: string; compact?: boolean }) {
  const label = GRADE_SEGS.map((s) => `${s.label} ${fmtPct(pct[s.k])}`).join(", ") + `; W ${fmtPct(pct.W, 1)}`;
  return (
    <div title={`${label}. Source: ${source}`}>
      <div className={`flex w-full overflow-hidden rounded ${compact ? "h-2" : "h-3"}`} role="img" aria-label={`Grade distribution: ${label}`}>
        {GRADE_SEGS.map((s) => (
          <div key={s.k} className={s.cls} style={{ width: `${Math.max(0, (pct[s.k] ?? 0) * 100)}%` }} />
        ))}
      </div>
      {compact ? (
        <div className="mt-1 text-sm text-muted tnum" aria-hidden>
          A {fmtPct(pct.A)}
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-x-4 text-sm tnum" aria-hidden>
          {GRADE_SEGS.map((s) => (
            <span key={s.k} className="inline-flex items-center gap-1.5">
              <span className={`inline-block size-2.5 rounded-sm ${s.cls}`} />
              {s.label} {fmtPct(pct[s.k])}
            </span>
          ))}
          <span className="text-muted">W {fmtPct(pct.W, 1)}</span>
        </div>
      )}
    </div>
  );
}
