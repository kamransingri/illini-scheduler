import type { Schedule } from "@/lib/schedule";
import { fmtTime } from "@/lib/format";

export const COURSE_COLORS = [
  "bg-sky-100 border-sky-500 text-sky-950",
  "bg-amber-100 border-amber-500 text-amber-950",
  "bg-emerald-100 border-emerald-500 text-emerald-950",
  "bg-rose-100 border-rose-500 text-rose-950",
  "bg-violet-100 border-violet-500 text-violet-950",
  "bg-lime-100 border-lime-600 text-lime-950",
  "bg-orange-100 border-orange-500 text-orange-950",
  "bg-cyan-100 border-cyan-600 text-cyan-950",
];

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
}: {
  schedule: Schedule;
  colorOf: (course: string) => string;
  blocked?: { d: number; s: number; e: number }[];
}) {
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
      <div className="grid grid-cols-[2.25rem_repeat(5,minmax(0,1fr))] text-[11px]" role="img" aria-label="Weekly calendar of this schedule">
        <div />
        {DAYS.map(([, n]) => (
          <div key={n} className="border-b border-line pb-1 text-center font-semibold">
            {n}
          </div>
        ))}
        <div className="relative" style={{ height: (hi - lo) * PX }}>
          {hours.map((h) => (
            <div key={h} className="absolute right-1 -translate-y-1/2 text-muted" style={{ top: (h - lo) * PX }}>
              {fmtTime(h).replace(":00", "")}
            </div>
          ))}
        </div>
        {DAYS.map(([bit, n]) => (
          <div key={n} className="relative border-l border-line" style={{ height: (hi - lo) * PX }}>
            {hours.map((h) => (
              <div key={h} className="absolute inset-x-0 border-t border-dashed border-gray-200" style={{ top: (h - lo) * PX }} />
            ))}
            {blocked
              .filter((x) => x.d & bit)
              .map((x, i) => (
                <div
                  key={`bl${i}`}
                  className="absolute inset-x-0.5 rounded bg-[repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb_4px,#f9fafb_4px,#f9fafb_8px)] p-0.5 text-[10px] text-muted"
                  style={{ top: (x.s - lo) * PX, height: (x.e - x.s) * PX }}
                >
                  Blocked
                </div>
              ))}
            {timed
              .filter((t) => t.m.d & bit)
              .map(({ b, s, m }, i) => (
                <div
                  key={`${s.crn}-${i}`}
                  className={`absolute inset-x-0.5 overflow-hidden rounded border-l-4 px-1 py-0.5 leading-tight ${colorOf(b.course)}`}
                  style={{ top: (m.s! - lo) * PX, height: Math.max(18, (m.e! - m.s!) * PX) }}
                  title={`${b.course} ${s.code} (${s.type}) ${fmtTime(m.s)}–${fmtTime(m.e)} ${m.r} ${m.b}${s.part !== "1" ? ` · part of term ${s.part}` : ""}`}
                >
                  <div className="truncate font-semibold">
                    <span className="sm:hidden">{b.course.split(" ")[0]}</span>
                    <span className="hidden sm:inline">{b.course}</span>
                  </div>
                  <div className="truncate">
                    <span className="font-semibold sm:hidden">{b.course.split(" ")[1]} </span>
                    {s.code}
                    <span className="hidden sm:inline"> {s.type}</span>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
      {untimed.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          No set time (online / arranged): {untimed.map(({ b, s }) => `${b.course} ${s.code}`).join(", ")}
        </p>
      )}
    </div>
  );
}
