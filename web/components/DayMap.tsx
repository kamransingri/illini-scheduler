"use client";
// Map 3 (#95): one day's classes on a campus map, numbered in class order, with the walk between each, and the
// same stops as a list for screen readers and small screens. The map itself (MapLibre) loads only when opened.

import dynamic from "next/dynamic";
import { useId, useState } from "react";
import type { MapStop, Place } from "@/lib/commute";
import { fmtTime } from "@/lib/format";
import Icon from "./ui/Icon";

const DayMapCanvas = dynamic(() => import("./DayMapCanvas"), {
  ssr: false,
  loading: () => <div className="grid h-80 w-full place-items-center rounded border border-line text-muted">Loading the map…</div>,
});

export function StopList({ stops }: { stops: MapStop[] }) {
  return (
    <ol className="space-y-1" data-testid="map-stops">
      {stops.map((s) => (
        <li key={s.n} className="flex gap-2" data-testid="map-stop" data-n={s.n} data-name={s.name}>
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-action text-xs font-bold text-white" aria-hidden>
            {s.n}
          </span>
          <span>
            <span className="tnum">{fmtTime(s.start)}</span> {s.courses.join(", ")}, <strong>{s.name}</strong>
            {s.walkNext !== null && (
              <span className={`block text-sm ${s.gapNext !== null && s.walkNext > s.gapNext ? "font-semibold text-heading" : "text-muted"}`}>
                {s.walkNext} min walk to {s.n + 1}
                {s.gapNext !== null ? `, ${s.gapNext} min between classes` : ""}
                {s.gapNext !== null && s.walkNext > s.gapNext ? " (tight)" : ""}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function DayMap({ day, stops, home }: { day: string; stops: MapStop[]; home: Place | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!stops.length) return null;
  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-semibold text-action hover:underline"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? "chevronUp" : "chevronDown"} />
        {open ? `Hide ${day}'s map` : `Show ${day}'s map`}
      </button>
      {open && (
        <div id={id} className="mt-2 grid gap-3 md:grid-cols-[2fr_1fr]" data-testid="day-map">
          <DayMapCanvas stops={stops} home={home} label={`Map of ${day}'s classes: ${stops.map((s) => `${s.n} ${s.name}`).join(", ")}`} />
          <StopList stops={stops} />
        </div>
      )}
    </div>
  );
}
