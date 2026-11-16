"use client";
import { useState } from "react";
import { fmtGpa, fmtInt, fmtPct } from "@/lib/format";
import { Delta } from "../ui/Badge";
import Icon from "../ui/Icon";
import type { Scored } from "@/lib/rank";

type Col = { key: string; label: string; get: (p: Scored) => number | null; show: (p: Scored) => React.ReactNode; lowerIsBetter?: boolean };

const rmp = (p: Scored) => (p.ins.rmp && p.ins.rmp.num_ratings > 0 ? p.ins.rmp : null);

const COLS: Col[] = [
  { key: "score", label: "Score", get: (p) => p.score.score, show: (p) => p.score.score ?? "–" },
  { key: "gpa", label: "GPA here", get: (p) => p.ins.gpa?.avg ?? null, show: (p) => fmtGpa(p.ins.gpa?.avg) },
  { key: "delta", label: "vs course", get: (p) => p.ins.gpa?.delta ?? null, show: (p) => <Delta value={p.ins.gpa?.delta} /> },
  { key: "a", label: "A grades", get: (p) => p.ins.gpa?.pct.A ?? null, show: (p) => fmtPct(p.ins.gpa?.pct.A) },
  { key: "students", label: "Students", get: (p) => p.ins.gpa?.students ?? null, show: (p) => fmtInt(p.ins.gpa?.students) },
  { key: "quality", label: "Quality", get: (p) => rmp(p)?.rating ?? null, show: (p) => rmp(p)?.rating?.toFixed(1) ?? "–" },
  { key: "difficulty", label: "Difficulty", get: (p) => rmp(p)?.difficulty ?? null, show: (p) => rmp(p)?.difficulty?.toFixed(1) ?? "–", lowerIsBetter: true },
  { key: "again", label: "Would take again", get: (p) => rmp(p)?.would_take_again ?? null, show: (p) => (rmp(p)?.would_take_again != null ? `${Math.round(rmp(p)!.would_take_again!)}%` : "–") },
  { key: "ratings", label: "Ratings", get: (p) => rmp(p)?.num_ratings ?? null, show: (p) => fmtInt(rmp(p)?.num_ratings) },
  { key: "open", label: "Open lectures", get: (p) => (p.tally.known ? p.tally.open : null), show: (p) => (p.tally.known ? `${p.tally.open} of ${p.tally.total}` : p.tally.total ? `${p.tally.total}, status n/a` : "–") },
];

/** Professors side by side; every column sorts (missing values always last). */
export default function CompareTable({ rows, onPick }: { rows: Scored[]; onPick: (key: string) => void }) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: "score", desc: true });
  const col = COLS.find((c) => c.key === sort.key) ?? COLS[0];
  const sorted = [...rows].sort((a, b) => {
    const x = col.get(a);
    const y = col.get(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return sort.desc ? y - x : x - y;
  });
  return (
    <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Professors compared">
      <table className="w-full min-w-[56rem] border-collapse text-left">
        <caption className="sr-only">Professors compared side by side. Column headers sort the table.</caption>
        <thead>
          <tr className="border-b border-line text-sm text-muted">
            <th scope="col" className="py-2 pr-3 font-normal">
              Professor
            </th>
            {COLS.map((c) => (
              <th key={c.key} scope="col" className="py-2 pr-3 text-right font-normal" aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 hover:text-action ${sort.key === c.key ? "font-semibold text-heading" : ""}`}
                  onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : !c.lowerIsBetter }))}
                >
                  {c.label}
                  <Icon name="sort" />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.key} className="border-b border-line">
              <th scope="row" className="py-2 pr-3 font-semibold">
                <button type="button" className="text-left text-action hover:underline" onClick={() => onPick(p.key)}>
                  {p.ins.name}
                </button>
              </th>
              {COLS.map((c) => (
                <td key={c.key} className="tnum py-2 pr-3 text-right">
                  {c.show(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
