"use client";
import { useState } from "react";
import type { Schedule } from "@/lib/schedule";
import { daysStr, fmtTime } from "@/lib/format";
import type { Section } from "@/lib/types";
import Icon from "./ui/Icon";

// Categorical colours that tell courses apart in the calendar and the cart (their only meaning). Illinois brand
// supporting colours, leaving out green and the seat-status hues (globals.css: .course-0 ... .course-5).
export const COURSE_COLORS = ["course-0", "course-1", "course-2", "course-3", "course-4", "course-5"];

const DAYS: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [4, "Wed"],
  [8, "Thu"],
  [16, "Fri"],
];

export default function WeekCalendar({
  schedule,
  colorOf,
  blocked = [],
  daysOff = 0,
  isLocked,
  onToggleLock,
}: {
  schedule: Schedule;
  colorOf: (course: string) => string;
  blocked?: { d: number; s: number; e: number }[];
  /** days kept free by the student's must-haves (bit mask), shaded */
  daysOff?: number;
  /** with these, each class is a button that locks or unlocks its section (#138) */
  isLocked?: (course: string, crn: string) => boolean;
  onToggleLock?: (course: string, sec: Section) => void;
}) {
  // on a narrow screen a tap opens this panel (the blocks are too small to read), on a wide one it toggles the lock
  const [menu, setMenu] = useState<{ course: string; sec: Section } | null>(null);
  const interactive = !!onToggleLock;
  const press = (course: string, sec: Section) => {
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches) setMenu({ course, sec });
    else onToggleLock?.(course, sec);
  };
  const timed = schedule.bundles.flatMap((b) => b.sections.flatMap((s) => s.meetings.filter((m) => m.s !== null).map((m) => ({ b, s, m }))));
  const untimed = schedule.bundles.flatMap((b) => b.sections.filter((s) => s.meetings.every((m) => m.s === null)).map((s) => ({ b, s })));
  const starts = [...timed.map((t) => t.m.s!), ...blocked.map((x) => x.s)];
  const ends = [...timed.map((t) => t.m.e!), ...blocked.map((x) => x.e)];
  const lo = Math.floor(Math.min(480, ...starts) / 60) * 60;
  const hi = Math.ceil(Math.max(1020, ...ends) / 60) * 60;
  const PX = 0.8; // px per minute
  const hours: number[] = [];
  for (let h = lo; h <= hi; h += 60) hours.push(h);
  return (
    <div>
      <div
        className="grid grid-cols-[2.75rem_repeat(5,minmax(0,1fr))] text-sm leading-tight"
        role={interactive ? "group" : "img"}
        aria-label={interactive ? "Weekly calendar of this schedule: press a class to lock or unlock it" : "Weekly calendar of this schedule"}
      >
        <div />
        {DAYS.map(([, n]) => (
          <div key={n} className="border-b border-line pb-1 text-center font-semibold text-heading">
            {n}
          </div>
        ))}
        <div className="relative" style={{ height: (hi - lo) * PX }}>
          {hours.map((h) => (
            <div key={h} className="absolute right-1.5 -translate-y-1/2 text-muted tnum" style={{ top: (h - lo) * PX }}>
              {fmtTime(h).replace(":00", "")}
            </div>
          ))}
        </div>
        {DAYS.map(([bit, n]) => (
          <div key={n} className={`relative border-l border-line ${daysOff & bit ? "bg-panel" : ""}`} style={{ height: (hi - lo) * PX }}>
            {daysOff & bit ? <div className="absolute inset-x-0 top-2 text-center text-muted">Day off</div> : null}
            {hours.map((h) => (
              <div key={h} className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: (h - lo) * PX }} />
            ))}
            {blocked
              .filter((x) => x.d & bit)
              .map((x, i) => (
                <div
                  key={`bl${i}`}
                  className="absolute inset-x-0.5 rounded border border-dashed border-muted bg-panel p-0.5 text-muted"
                  style={{ top: (x.s - lo) * PX, height: (x.e - x.s) * PX }}
                >
                  Blocked
                </div>
              ))}
            {timed
              .filter((t) => t.m.d & bit)
              .sort((x, y) => x.m.s! - y.m.s!)
              .map(({ b, s, m }, i) => {
                const locked = !!isLocked?.(b.course, s.crn);
                const Tag = interactive ? "button" : "div";
                return (
                  <Tag
                    key={`${s.crn}-${i}`}
                    {...(interactive
                      ? {
                          type: "button" as const,
                          "aria-pressed": locked,
                          "aria-label": `${locked ? "Unlock" : "Lock"} ${b.course} ${s.code}, ${n} ${fmtTime(m.s)}`,
                          onClick: () => press(b.course, s),
                          "data-testid": "calendar-class",
                        }
                      : {})}
                    className={`course-block absolute inset-x-0.5 overflow-hidden rounded border-l-4 px-1 py-0.5 text-left ${colorOf(b.course)} ${
                      locked ? "border-2 border-l-8 font-semibold" : ""
                    } ${interactive ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1" : ""}`}
                    style={{ top: (m.s! - lo) * PX, height: Math.max(18, (m.e! - m.s!) * PX) }}
                    title={`${b.course} ${s.code} (${s.type}) ${fmtTime(m.s)}–${fmtTime(m.e)} ${m.r} ${m.b}${s.part !== "1" ? ` · part of term ${s.part}` : ""}${
                      interactive ? (locked ? ". Locked: press to unlock" : ". Press to lock this section") : ""
                    }`}
                  >
                    <span className="flex items-center gap-0.5 truncate font-semibold">
                      {locked && <Icon name="lock" className="size-3" />}
                      <span className="sm:hidden">{b.course.split(" ")[0]}</span>
                      <span className="hidden sm:inline">{b.course}</span>
                    </span>
                    <span className="block truncate">
                      <span className="font-semibold sm:hidden">{b.course.split(" ")[1]} </span>
                      {s.code}
                      <span className="hidden sm:inline"> {s.type}</span>
                    </span>
                  </Tag>
                );
              })}
          </div>
        ))}
      </div>
      {menu && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-line bg-panel p-2 text-sm" role="dialog" aria-label={`${menu.course} ${menu.sec.code}`} data-testid="calendar-menu">
          <span className="min-w-0 flex-1">
            <strong>
              {menu.course} {menu.sec.code}
            </strong>{" "}
            {menu.sec.type}, {menu.sec.meetings.map((m) => (m.s === null ? "no set time" : `${daysStr(m.d)} ${fmtTime(m.s)}–${fmtTime(m.e)} ${m.b}`)).join("; ")}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-action bg-action px-2 font-semibold leading-8 text-white"
            onClick={() => {
              onToggleLock?.(menu.course, menu.sec);
              setMenu(null);
            }}
          >
            <Icon name={isLocked?.(menu.course, menu.sec.crn) ? "unlock" : "lock"} />
            {isLocked?.(menu.course, menu.sec.crn) ? "Unlock" : "Lock"}
          </button>
          <button type="button" className="rounded border border-line bg-white px-2 leading-8" onClick={() => setMenu(null)}>
            Close
          </button>
        </div>
      )}
      {untimed.length > 0 && (
        <p className="mt-2 text-sm text-muted">
          No set time (online / arranged): {untimed.map(({ b, s }) => `${b.course} ${s.code}`).join(", ")}
        </p>
      )}
    </div>
  );
}
