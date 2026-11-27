import { fmtDate, fmtInt } from "@/lib/format";
import type { Rmp } from "@/lib/types";

/** `good` is how good the value is for a student, 0 to 1 (null when missing): it colours the bar from red to green. */
export type RmpMeter = { key: string; label: string; value: string; share: number; good: number | null };

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** The three RMP averages as meter rows (share 0 to 1; 0 when missing), plus the sentence screen readers get.
 * Quality and would-take-again are better high, difficulty is better low (RMP's scale runs 1 to 5). */
export function rmpMeters(rmp: Rmp): { rows: RmpMeter[]; label: string } {
  const of5 = (v: number | null) => (v === null ? "–" : v.toFixed(1));
  const wta = rmp.would_take_again;
  const rows: RmpMeter[] = [
    { key: "quality", label: "Quality", value: of5(rmp.rating), share: (rmp.rating ?? 0) / 5, good: rmp.rating === null ? null : clamp((rmp.rating - 1) / 4) },
    { key: "difficulty", label: "Difficulty", value: of5(rmp.difficulty), share: (rmp.difficulty ?? 0) / 5, good: rmp.difficulty === null ? null : clamp((5 - rmp.difficulty) / 4) },
    { key: "again", label: "Would take again", value: wta === null ? "–" : `${Math.round(wta)}%`, share: (wta ?? 0) / 100, good: wta === null ? null : clamp(wta / 100) },
  ];
  const label =
    `Quality ${of5(rmp.rating)} of 5, difficulty ${of5(rmp.difficulty)} of 5, ` +
    `${wta === null ? "would-take-again not reported" : `${Math.round(wta)}% would take again`}, from ${fmtInt(rmp.num_ratings)} ratings (all courses)`;
  return { rows, label };
}

/** The bar's colour: red (--color-down) when it's bad for a student, green (--color-up) when it's good. */
export function meterColor(good: number): string {
  return `color-mix(in oklch, var(--color-up) ${Math.round(clamp(good) * 100)}%, var(--color-down))`;
}

/** Rate My Professors averages as meters, each bar coloured from red to green by how good it is for a student: high
 * quality, low difficulty and high would-take-again are green (DECISIONS D73). */
export default function RmpMeters({ rmp }: { rmp: Rmp }) {
  const { rows, label } = rmpMeters(rmp);
  return (
    <div className="mt-1 max-w-sm" data-testid="rmp-meters">
      <div role="img" aria-label={`Rate My Professors: ${label}`} className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.key} data-meter={r.key} className="grid grid-cols-[8.5rem_1fr_2.75rem] items-center gap-2 text-sm" aria-hidden>
            <span>{r.label}</span>
            <span className="h-2.5 overflow-hidden rounded bg-panel ring-1 ring-line ring-inset">
              <span
                className="block h-full"
                data-good={r.good === null ? undefined : r.good.toFixed(2)}
                style={{ width: `${Math.round(clamp(r.share) * 1000) / 10}%`, background: r.good === null ? undefined : meterColor(r.good) }}
              />
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
