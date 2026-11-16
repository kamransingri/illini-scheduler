import type { ScoreResult } from "@/lib/score";

/** The parts behind a "best pick" score: raw value, value after small-sample shrinkage, and weight. */
export default function ScoreBreakdown({ result }: { result: ScoreResult }) {
  const used = result.parts.filter((p) => p.weight > 0);
  return (
    <span className="block">
      <span className="block font-semibold">Score {result.score ?? "–"} of 100</span>
      <span className="mt-1 block">Weighted average of the parts below, each on a 0–100 scale. Small samples are pulled toward an average first.</span>
      <span className="mt-2 block space-y-1">
        {used.map((p) => (
          <span key={p.key} className="flex justify-between gap-3 tnum">
            <span>
              {p.label}: {p.raw}
              {p.adjusted !== p.raw && !p.raw.startsWith(p.adjusted) ? ` → ${p.adjusted}` : ""}
              {p.note ? ` (${p.note})` : ""}
            </span>
            <span className="whitespace-nowrap">
              {Math.round(p.value * 100)} ×{p.weight}
            </span>
          </span>
        ))}
      </span>
      {result.missing.length > 0 && <span className="mt-2 block">Left out: {result.missing.join("; ")}.</span>}
    </span>
  );
}
