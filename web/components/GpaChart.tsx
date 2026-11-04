import type { GpaBlock } from "@/lib/types";
import { fmtGpa, fmtInt, fmtPct, termLabel } from "@/lib/format";

/** Stacked grade-distribution bars per term with the term's average GPA printed above each bar. */
export default function GpaChart({ gpa }: { gpa: GpaBlock }) {
  const rows = gpa.by_term.slice(-16);
  if (!rows.length) return null;
  const W = rows.length > 8 ? 640 : 420;
  const H = 210;
  const padL = 30;
  const padB = 38;
  const padT = 22;
  const innerH = H - padB - padT;
  const step = (W - padL - 6) / rows.length;
  const bw = Math.min(28, step * 0.7);
  const colors: [keyof GpaBlock["pct"], string][] = [
    ["A", "#059669"],
    ["B", "#0284c7"],
    ["C", "#f59e0b"],
    ["DF", "#dc2626"],
  ];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby="gpa-chart-title">
        <title id="gpa-chart-title">Grade distribution and average GPA by term</title>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W} y1={padT + innerH * (1 - f)} y2={padT + innerH * (1 - f)} stroke="#e5e7eb" />
            <text x={padL - 4} y={padT + innerH * (1 - f) + 3} fontSize="9" textAnchor="end" fill="#566173">
              {f * 100}%
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = padL + i * step + (step - bw) / 2;
          let y = padT + innerH;
          return (
            <g key={r.term}>
              <title>{`${termLabel(r.term)}: GPA ${fmtGpa(r.gpa)}, ${fmtInt(r.students)} students; A ${fmtPct(r.pct.A)}, B ${fmtPct(r.pct.B)}, C ${fmtPct(r.pct.C)}, D/F ${fmtPct(r.pct.DF)}`}</title>
              {colors.map(([k, c]) => {
                const h = innerH * (r.pct[k] ?? 0);
                y -= h;
                return <rect key={k} x={x} y={y} width={bw} height={Math.max(0, h)} fill={c} />;
              })}
              <text x={x + bw / 2} y={padT - 6} fontSize="9" textAnchor="middle" fill="#16202f" fontWeight="600">
                {fmtGpa(r.gpa)}
              </text>
              <text
                x={x + bw / 2}
                y={H - padB + 12}
                fontSize="9"
                textAnchor="end"
                fill="#566173"
                transform={`rotate(-40 ${x + bw / 2} ${H - padB + 12})`}
              >
                {r.term}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-xs text-muted">
        Bars: share of A / B / C / D-F grades among graded students; number above each bar: that term&apos;s average GPA. Source: UIUC GPA
        dataset (Wade Fagen-Ulmschneider), {termLabel(rows[0].term)} to {termLabel(rows[rows.length - 1].term)}.
      </figcaption>
    </figure>
  );
}
