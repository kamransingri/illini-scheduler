"use client";
import { DEFAULT_WEIGHTS, type ScoreWeights } from "@/lib/score";
import { useWeights, writeWeights } from "@/lib/weights";
import Expandable from "./ui/Expandable";

const LABELS: [keyof ScoreWeights, string][] = [
  ["courseGpa", "Course GPA"],
  ["profGpa", "Professor's GPA vs the course"],
  ["quality", "RMP quality"],
  ["difficulty", "RMP difficulty (easier ranks higher)"],
  ["wouldTakeAgain", "Would take again"],
  ["seats", "Open seats"],
];

const LEVEL = ["off", "low", "medium", "high"];

/** The student's weights for the best-pick score; saved in this browser and used on every page that ranks things. */
export default function WeightsControl({ className = "", summary = "Adjust the best pick score" }: { className?: string; summary?: string }) {
  const w = useWeights();
  const changed = LABELS.some(([k]) => w[k] !== DEFAULT_WEIGHTS[k]);
  return (
    <Expandable className={className} summary={<span>{summary}{changed ? " (custom)" : ""}</span>}>
      <fieldset className="max-w-md space-y-2 rounded bg-panel p-3">
        <legend className="sr-only">How much each part counts</legend>
        {LABELS.map(([k, label]) => (
          <label key={k} className="grid grid-cols-[minmax(0,1fr)_7rem_3.5rem] items-center gap-2">
            <span>{label}</span>
            <input
              type="range"
              min={0}
              max={3}
              step={1}
              value={w[k]}
              onChange={(e) => writeWeights({ ...w, [k]: Number(e.target.value) })}
              className="accent-action"
              aria-valuetext={LEVEL[w[k]]}
            />
            <span className="text-sm text-muted">{LEVEL[w[k]]}</span>
          </label>
        ))}
        <button type="button" className="font-semibold text-action hover:underline disabled:text-muted disabled:no-underline" disabled={!changed} onClick={() => writeWeights(DEFAULT_WEIGHTS)}>
          Reset to the defaults
        </button>
      </fieldset>
    </Expandable>
  );
}
