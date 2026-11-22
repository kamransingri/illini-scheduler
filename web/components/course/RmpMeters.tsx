import { fmtDate, fmtInt } from "@/lib/format";
import type { Rmp } from "@/lib/types";

export type RmpMeter = { key: string; label: string; note: string | null; value: string; share: number; cls: string };

/** The three RMP averages as meter rows (share 0 to 1; 0 when missing), plus the sentence screen readers get. */
export function rmpMeters(rmp: Rmp): { rows: RmpMeter[]; label: string } {
  const of5 = (v: number | null) => (v === null ? "–" : v.toFixed(1));
  const wta = rmp.would_take_again;
  const rows: RmpMeter[] = [
    { key: "quality", label: "Quality", note: null, value: of5(rmp.rating), share: (rmp.rating ?? 0) / 5, cls: "bg-grade-b" },
    { key: "difficulty", label: "Difficulty", note: "lower is easier", value: of5(rmp.difficulty), share: (rmp.difficulty ?? 0) / 5, cls: "bg-grade-c" },
    { key: "again", label: "Would take again", note: null, value: wta === null ? "–" : `${Math.round(wta)}%`, share: (wta ?? 0) / 100, cls: "bg-grade-b" },
  ];
  const label =
    `Quality ${of5(rmp.rating)} of 5, difficulty ${of5(rmp.difficulty)} of 5, ` +
    `${wta === null ? "would-take-again not reported" : `${Math.round(wta)}% would take again`}, from ${fmtInt(rmp.num_ratings)} ratings (all courses)`;
  return { rows, label };
}

/** Rate My Professors averages as meters: quality and would-take-again in blue, difficulty lighter and marked "lower is easier". */
export default function RmpMeters({ rmp }: { rmp: Rmp }) {
  const { rows, label } = rmpMeters(rmp);
  return (
    <div className="mt-1 max-w-sm" data-testid="rmp-meters">
      <div role="img" aria-label={`Rate My Professors: ${label}`} className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.key} data-meter={r.key} className="grid grid-cols-[8.5rem_1fr_2.75rem] items-center gap-2 text-sm" aria-hidden>
            <span>
              {r.label}
              {r.note && <span className="block text-xs text-muted">{r.note}</span>}
            </span>
            <span className="h-2.5 overflow-hidden rounded bg-panel ring-1 ring-line ring-inset">
              <span className={`block h-full ${r.cls}`} style={{ width: `${Math.round(Math.min(1, Math.max(0, r.share)) * 1000) / 10}%` }} />
            </span>
            <span className="tnum text-right font-semibold text-heading">{r.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-sm text-muted tnum">
        {fmtInt(rmp.num_ratings)} ratings (all courses), fetched {fmtDate(rmp.fetched_at)}
      </p>
    </div>
  );
}
