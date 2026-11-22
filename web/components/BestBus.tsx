"use client";
// The best bus line from where you live (#216): the one MTD line from a stop near home that reaches the most of the
// week's classes directly, the classes close enough to walk, and two other lines to compare.

import dynamic from "next/dynamic";
import { useId, useMemo, useState } from "react";
import { bestLines, type BestLine, type BuildingMap, type MapStop, type Place, type Transit } from "@/lib/commute";
import Icon from "./ui/Icon";

const DayMapCanvas = dynamic(() => import("./DayMapCanvas"), {
  ssr: false,
  loading: () => <div className="grid h-80 w-full place-items-center rounded border border-line text-muted">Loading the map…</div>,
});

function Badge({ line }: { line: BestLine }) {
  return (
    <span className="inline-block rounded px-1.5 font-semibold" style={line.color ? { background: line.color, color: line.textColor || "#000" } : undefined}>
      {line.route}
    </span>
  );
}

const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export default function BestBus({ transit, home, classes, buildings }: { transit: Transit; home: Place; classes: { course: string; b: string }[]; buildings: BuildingMap }) {
  const plan = useMemo(() => bestLines(transit, home, classes, buildings), [transit, home, classes, buildings]);
  const [open, setOpen] = useState(false);
  const id = useId();
  const best = plan.lines[0];
  const walkCount = plan.walk.reduce((n, w) => n + w.courses.length, 0);
  const stops: MapStop[] = best
    ? best.covered.map((c, i) => ({ n: i + 1, courses: c.courses, name: c.building, lat: c.lat, lon: c.lon, start: 0, end: 0, walkNext: null, gapNext: null }))
    : [];

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-2 rounded border border-line p-3" data-testid="best-bus">
      <h4 id={`${id}-h`} className="font-semibold text-heading">
        Your best bus
      </h4>
      {!best ? (
        <p data-testid="best-bus-none">
          {walkCount === plan.total ? "Every class is a short walk from here, so you won't need a bus." : "No single bus from near here saves walking to your classes."}
        </p>
      ) : (
        <>
          <p data-testid="best-bus-line">
            <Badge line={best} /> from <strong>{best.board}</strong> ({best.walkTo} min walk), toward {best.headsign}: it reaches{" "}
            <strong>
              {best.courses} of your {plan.total} classes
            </strong>{" "}
            without a transfer.
          </p>
          <ul className="space-y-1" data-testid="best-bus-stops">
            {best.covered.map((c, i) => (
              <li key={c.building} className="flex gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-action text-xs font-bold text-white" aria-hidden>
                  {i + 1}
                </span>
                <span>
                  {list(c.courses)} at {c.building}: get off at <strong>{c.stop}</strong> ({c.ride} min ride, then {c.walkFrom} min walk; {c.walk} min on foot
                  all the way)
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {plan.walk.length > 0 && (
        <p className="text-sm" data-testid="best-bus-walk">
          Just walk to {plan.walk.map((w) => `${list(w.courses)} (${w.building}, ${w.walk} min)`).join("; ")}.
        </p>
      )}
      {plan.lines.length > 1 && (
        <p className="text-sm text-muted" data-testid="best-bus-others">
          Also:{" "}
          {plan.lines.slice(1).map((l, i) => (
            <span key={l.route}>
              {i > 0 && ", "}
              <Badge line={l} /> from {l.board} reaches {l.courses}
            </span>
          ))}
          .
        </p>
      )}
      {plan.missing.length > 0 && <p className="text-sm text-muted">No location yet for {list(plan.missing)}, so it isn&rsquo;t counted.</p>}
      {best && (
        <div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-semibold text-action hover:underline"
            aria-expanded={open}
            aria-controls={`${id}-map`}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "chevronUp" : "chevronDown"} />
            {open ? "Hide the line on the map" : "Show the line on the map"}
          </button>
          {open && (
            <div id={`${id}-map`} className="mt-2">
              <DayMapCanvas
                stops={stops}
                home={home}
                route={{ path: best.path, color: best.color }}
                label={`Map of the ${best.route} line from ${best.board} (B) to your classes: ${stops.map((s) => `${s.n} ${s.name}`).join(", ")}`}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
