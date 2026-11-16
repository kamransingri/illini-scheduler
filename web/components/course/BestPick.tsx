"use client";
import { scoreOf, type ScoreInput, type ScorePriors } from "@/lib/score";
import { profDomId } from "@/lib/sections";
import { useWeights } from "@/lib/weights";
import Info from "../ui/Info";
import ScoreBreakdown from "./ScoreBreakdown";

/**
 * "Best pick" professor for the course header. The server passes each professor's score inputs (small), and the
 * score is recomputed here so the student's own weights apply.
 */
export default function BestPick({ candidates, priors, termLabel }: { candidates: { key: string; name: string; input: ScoreInput }[]; priors: ScorePriors; termLabel: string }) {
  const w = useWeights();
  const ranked = candidates.map((c) => ({ ...c, r: scoreOf(c.input, priors, w) })).sort((a, b) => (b.r.score ?? -1) - (a.r.score ?? -1));
  const best = ranked[0];
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">Best pick, {termLabel}</dt>
      <dd className="mt-0.5">
        {best && best.r.score !== null ? (
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <a href={`#${profDomId(best.key)}`} className="font-display text-xl font-semibold text-heading hover:underline">
              {best.name}
            </a>
            <span className="inline-flex items-center">
              <span className="tnum text-muted">score {best.r.score}</span>
              <Info label={`How ${best.name}'s score is worked out`}>
                <ScoreBreakdown result={best.r} />
                {ranked.length > 1 && <span className="mt-2 block">Next: {ranked.slice(1, 3).map((c) => `${c.name} (${c.r.score ?? "–"})`).join(", ")}.</span>}
              </Info>
            </span>
          </span>
        ) : (
          <span className="text-lg text-muted">No professor listed yet</span>
        )}
      </dd>
    </div>
  );
}
