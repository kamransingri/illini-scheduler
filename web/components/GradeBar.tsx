import type { Pct } from "@/lib/types";
import { fmtPct } from "@/lib/format";

const SEGS: { k: keyof Pct; label: string; cls: string }[] = [
  { k: "A", label: "A", cls: "bg-emerald-600" },
  { k: "B", label: "B", cls: "bg-sky-600" },
  { k: "C", label: "C", cls: "bg-amber-500" },
  { k: "DF", label: "D/F", cls: "bg-red-600" },
];

/** Stacked A/B/C/DF bar (shares of graded students) with W rate as text. */
export default function GradeBar({ pct, source, compact = false }: { pct: Pct; source: string; compact?: boolean }) {
  const label = SEGS.map((s) => `${s.label} ${fmtPct(pct[s.k])}`).join(", ") + `; W ${fmtPct(pct.W, 1)}`;
  return (
    <div title={`${label}. Source: ${source}`}>
      <div
        className={`flex w-full overflow-hidden rounded ${compact ? "h-2" : "h-3"}`}
        role="img"
        aria-label={`Grade distribution: ${label}`}
      >
        {SEGS.map((s) => (
          <div key={s.k} className={s.cls} style={{ width: `${Math.max(0, (pct[s.k] ?? 0) * 100)}%` }} />
        ))}
      </div>
      {!compact && (
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
          {SEGS.map((s) => (
            <span key={s.k} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-sm ${s.cls}`} aria-hidden />
              {s.label} {fmtPct(pct[s.k])}
            </span>
          ))}
          <span>W {fmtPct(pct.W, 1)}</span>
        </div>
      )}
    </div>
  );
}
