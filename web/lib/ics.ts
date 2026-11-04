// iCalendar export with weekly recurrences (RFC 5545), America/Chicago time zone.
import type { Schedule } from "./schedule";
import { TERM_DATES } from "./terms";

const BYDAY: [number, string, number][] = [
  [1, "MO", 1],
  [2, "TU", 2],
  [4, "WE", 3],
  [8, "TH", 4],
  [16, "FR", 5],
  [32, "SA", 6],
  [64, "SU", 0],
];

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const parseDate = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** US DST rule: second Sunday in March to first Sunday in November. */
function isDst(d: Date): boolean {
  const y = d.getUTCFullYear();
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1));
    return new Date(Date.UTC(y, month, 1 + ((7 - first.getUTCDay()) % 7) + 7 * (n - 1)));
  };
  return d >= nthSunday(2, 2) && d < nthSunday(10, 1);
}

/** UNTIL in UTC for 23:59:59 local time on `date`. */
function untilUtc(date: string): string {
  const d = parseDate(date);
  const offset = isDst(d) ? 5 : 6;
  const utc = new Date(d.getTime() + (23 * 3600 + 59 * 60 + 59 + offset * 3600) * 1000);
  return `${ymd(utc)}T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}${pad(utc.getUTCSeconds())}Z`;
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Chicago",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0600",
  "TZOFFSETTO:-0500",
  "TZNAME:CDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0600",
  "TZNAME:CST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function buildIcs(schedule: Schedule, term: string, termLabel: string, now = new Date()): string {
  const dates = TERM_DATES[term];
  if (!dates) throw new Error(`No instruction dates for ${term}`);
  const stamp = `${ymd(now)}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Illini Scheduler//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(termLabel)} classes`, ...VTIMEZONE];
  let n = 0;
  for (const b of schedule.bundles) {
    for (const s of b.sections) {
      s.meetings.forEach((m, mi) => {
        if (m.s === null || m.e === null || !m.d) return;
        const part = s.part || "1";
        const start = parseDate(part === "B" ? dates.bStart : dates.start);
        const end = part === "A" ? dates.aEnd : dates.end;
        const days = BYDAY.filter(([bit]) => m.d & bit);
        // first date on/after start that falls on one of the meeting days
        let first = start;
        for (let i = 0; i < 7; i++) {
          const d = addDays(start, i);
          if (days.some(([, , wd]) => wd === d.getUTCDay())) {
            first = d;
            break;
          }
        }
        const t = (min: number) => `${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
        const exdates: string[] = [];
        for (const [a, z] of dates.breaks)
          for (let d = parseDate(a); d <= parseDate(z); d = addDays(d, 1)) if (days.some(([, , wd]) => wd === d.getUTCDay())) exdates.push(`${ymd(d)}T${t(m.s!)}`);
        n++;
        lines.push(
          "BEGIN:VEVENT",
          `UID:${term}-${s.crn}-${mi}@illini-scheduler`,
          `DTSTAMP:${stamp}`,
          `DTSTART;TZID=America/Chicago:${ymd(first)}T${t(m.s)}`,
          `DTEND;TZID=America/Chicago:${ymd(first)}T${t(m.e)}`,
          `RRULE:FREQ=WEEKLY;UNTIL=${untilUtc(end)};BYDAY=${days.map(([, code]) => code).join(",")}`,
          ...(exdates.length ? [`EXDATE;TZID=America/Chicago:${exdates.join(",")}`] : []),
          `SUMMARY:${esc(`${b.course} ${s.code} (${s.type})`)}`,
          ...(m.b ? [`LOCATION:${esc(`${m.r} ${m.b}`.trim())}`] : []),
          `DESCRIPTION:${esc(`CRN ${s.crn}. ${s.instructors_raw.length ? `Instructor: ${s.instructors_raw.join("; ")}. ` : ""}Dates are estimated from the usual academic calendar.`)}`,
          "END:VEVENT",
        );
      });
    }
  }
  lines.push("END:VCALENDAR");
  if (!n) throw new Error("This schedule has no meetings with set times (all online/arranged).");
  return lines.map(fold).join("\r\n") + "\r\n";
}
