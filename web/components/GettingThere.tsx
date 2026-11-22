"use client";
// Map 4 (#96): the schedule builder's "Getting there" tab. Where you live stays in this browser (never in share
// links); "where I am now" is asked each time and never stored. Bus times: MTD's published timetable.

import { useEffect, useId, useMemo, useState } from "react";
import {
  homeChoices,
  planDay,
  decodePin,
  PIN_NAME,
  readHome,
  stopsForDay,
  writeHome,
  type BuildingMap,
  type Leg,
  type Place,
  type Ride,
  type Transit,
} from "@/lib/commute";
import { dataUrl, fmtTime } from "@/lib/format";
import type { Schedule } from "@/lib/schedule";
import BestBus from "./BestBus";
import DayMap from "./DayMap";
import PinPicker from "./PinPicker";
import Icon from "./ui/Icon";

const DAYS: [number, string][] = [
  [1, "Monday"],
  [2, "Tuesday"],
  [4, "Wednesday"],
  [8, "Thursday"],
  [16, "Friday"],
  [32, "Saturday"],
  [64, "Sunday"],
];

type Loaded = { transit: Transit | null; buildings: BuildingMap };
let loading: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  const get = <T,>(f: string) =>
    fetch(dataUrl(f))
      .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
      .catch(() => null);
  loading ??= Promise.all([get<Transit>("transit.json"), get<{ buildings: BuildingMap }>("buildings.json")]).then(([t, b]) => ({
    transit: t,
    buildings: b?.buildings ?? {},
  }));
  return loading;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RouteBadge({ ride }: { ride: Ride }) {
  return (
    <span
      className="inline-block rounded px-1.5 font-semibold tnum"
      style={ride.color ? { background: ride.color, color: ride.textColor || "#000" } : undefined}
    >
      {ride.route}
    </span>
  );
}

function BusSteps({ ride, to }: { ride: Ride; to: string }) {
  return (
    <>
      Walk {ride.walkTo} min to <strong>{ride.from}</strong>, take <RouteBadge ride={ride} /> toward {ride.headsign} at{" "}
      <strong className="tnum">{fmtTime(ride.board)}</strong>, get off at {ride.to} ({fmtTime(ride.alight)}) and walk {ride.walkFrom} min to {to}.
    </>
  );
}

function LegItem({ leg }: { leg: Leg }) {
  const there = <span className="tnum">{fmtTime(leg.arrive)}</span>;
  let body: React.ReactNode;
  if (leg.kind === "to-class") {
    body = leg.ride ? (
      <>
        Leave by <strong className="tnum">{fmtTime(leg.leave)}</strong>. <BusSteps ride={leg.ride} to={leg.to} /> There by {there}.
      </>
    ) : (
      <>
        Leave by <strong className="tnum">{fmtTime(leg.leave)}</strong> and walk {leg.walk} min to {leg.to}.
      </>
    );
  } else if (leg.kind === "between") {
    body = leg.ride ? (
      <>
        {leg.from} to {leg.to} is a {leg.walk}-minute walk. By bus: <BusSteps ride={leg.ride} to={leg.to} /> There by {there}.
      </>
    ) : (
      <>
        Walk {leg.walk} min from {leg.from} to {leg.to}.
        {leg.late > 0 && (
          <strong className="ml-1 inline-flex items-center gap-1 text-heading">
            <Icon name="alert" /> About {leg.late} min late, and no bus gets there in time.
          </strong>
        )}
      </>
    );
  } else {
    body = leg.ride ? (
      <>
        After class: <BusSteps ride={leg.ride} to={leg.to} /> Home by {there}.
      </>
    ) : (
      <>
        After class, walk {leg.walk} min home ({leg.to}), home by {there}.
      </>
    );
  }
  return (
    <li className="flex gap-2" data-testid="trip-leg" data-kind={leg.kind} data-bus={leg.ride ? "1" : "0"}>
      <Icon name={leg.ride ? "bus" : "chevronRight"} className="mt-1 shrink-0 text-muted" />
      <span>{body}</span>
    </li>
  );
}

export default function GettingThere({ schedule, termName }: { schedule: Schedule; termName: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [homeName, setHomeName] = useState<string | null>(null);
  const [here, setHere] = useState<Place | null>(null);
  const [locating, setLocating] = useState<"idle" | "asking" | "denied">("idle");
  const [pinning, setPinning] = useState(false);
  const pickId = useId();

  useEffect(() => {
    setHomeName(readHome());
    let live = true;
    load().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);

  const choices = useMemo(() => (data ? homeChoices(data.transit, data.buildings) : []), [data]);
  const pin = useMemo(() => decodePin(homeName), [homeName]);
  const picked = useMemo(() => pin ?? choices.flatMap((g) => g.places).find((p) => p.name === homeName) ?? null, [pin, choices, homeName]);
  const home = here ?? picked;

  const days = useMemo(() => {
    if (!data) return [];
    const mtgs = schedule.bundles.flatMap((b) => b.meetings);
    return DAYS.flatMap(([bit, name]) => {
      const today = mtgs.filter((m) => m.d & bit && m.s !== null && m.e !== null).map((m) => ({ course: m.course, s: m.s!, e: m.e!, b: m.b }));
      if (!today.length) return [];
      return [{ bit, name, ...planDay(today, home, data.buildings, data.transit, bit), stops: stopsForDay(today, data.buildings).stops }];
    });
  }, [data, schedule, home]);

  // every class meeting of the week with a room, for the best bus line
  const week = useMemo(
    () => schedule.bundles.flatMap((b) => b.meetings).filter((m) => m.s !== null && m.b).map((m) => ({ course: m.course, b: m.b })),
    [schedule],
  );

  function pick(name: string) {
    setHere(null);
    setPinning(false);
    setHomeName(name || null);
    writeHome(name || null);
  }

  function useHere() {
    if (!("geolocation" in navigator)) {
      setLocating("denied");
      return;
    }
    setLocating("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ name: "where you are now", lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating("idle");
      },
      () => setLocating("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  if (!data) return <p className="text-muted">Loading bus times and building locations…</p>;
  const t = data.transit;
  const noBuses = !t || !t.patterns.length;
  const missing = [...new Set(days.flatMap((d) => d.missing))];

  return (
    <div className="space-y-4" data-testid="getting-there">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="flex flex-col gap-1" htmlFor={pickId}>
          <span className="font-semibold text-heading">Where you live</span>
          <select
            id={pickId}
            className="max-w-full rounded border border-line bg-white px-2 py-1.5"
            value={here ? "" : pin ? homeName! : (picked?.name ?? "")}
            onChange={(e) => pick(e.target.value)}
            data-testid="home-picker"
          >
            <option value="">{here ? "Where you are now" : "Choose a hall or building"}</option>
            {pin && <option value={homeName!}>{PIN_NAME}</option>}
            {choices.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.places.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="button" className="inline-flex items-center gap-1 font-semibold text-action underline" onClick={useHere} disabled={locating === "asking"}>
          {locating === "asking" ? "Finding you…" : "Use where I am now"}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-semibold text-action underline"
          aria-expanded={pinning}
          onClick={() => setPinning((v) => !v)}
        >
          {pin ? "Move your pin" : "Drop a pin"}
        </button>
      </div>
      {pinning && <PinPicker start={pin ?? here} onSave={(v) => pick(v)} onCancel={() => setPinning(false)} />}
      <p className="text-sm text-muted">
        Kept in this browser only and never put in share links; a pin is rounded to about 100 m. &ldquo;Where I am now&rdquo; asks your browser each
        time and isn&rsquo;t saved.
        {locating === "denied" && <strong className="ml-1 text-heading">Your browser didn&rsquo;t share a location; pick a place instead.</strong>}
      </p>

      {!home && <p>Pick where you live to see when to leave and which bus to take. Trips between classes are below either way.</p>}
      {home && !noBuses && <BestBus transit={t!} home={home} classes={week} buildings={data.buildings} />}

      {days.map((d) => (
        <section key={d.bit} aria-label={d.name} className="space-y-1.5">
          <h4 className="font-semibold text-heading">{d.name}</h4>
          <DayMap day={d.name} stops={d.stops} home={home} />
          {d.legs.length ? (
            <ol className="space-y-1.5">
              {d.legs.map((l, i) => (
                <LegItem key={i} leg={l} />
              ))}
            </ol>
          ) : (
            <p className="text-muted">{home ? "No trips to plan." : "Every class is in the same building."}</p>
          )}
        </section>
      ))}

      {missing.length > 0 && <p className="text-sm text-muted">No location yet for {missing.join(", ")}, so trips to it aren&rsquo;t shown.</p>}

      <div className="space-y-1 border-t border-line pt-3 text-sm text-muted">
        <p>
          Estimates. Walking is the straight-line distance plus 30% at 4.8 km/h; buses are one ride, no transfers, from MTD&rsquo;s published timetable
          {t?.feed.start && t.feed.end ? ` for ${fmtDate(t.feed.start)} to ${fmtDate(t.feed.end)}` : ""}. {termName} times can change once MTD publishes
          them, and buses run late. Check MTD&rsquo;s trip planner before you rely on one.
          {noBuses && <strong className="ml-1 text-heading">Bus times couldn&rsquo;t be loaded this time, so only walking is shown.</strong>}
        </p>
        <p>
          {t?.credit ?? "Data provided by Champaign-Urbana Mass Transit District"}. Building and residence locations © OpenStreetMap contributors (ODbL).
        </p>
      </div>
    </div>
  );
}
