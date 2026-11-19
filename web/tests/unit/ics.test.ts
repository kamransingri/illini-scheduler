import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";
import type { Schedule } from "@/lib/schedule";
import type { Section } from "@/lib/types";
import { TERM_DATES } from "@/lib/terms";

// Monday-Wednesday-Friday 10:00-10:50 (d: MO=1, WE=4, FR=16), in a given part of term.
const section = (crn: string, part: string): Section => ({
  crn,
  code: "AL1",
  type: "LEC",
  type_name: "Lecture",
  component: "primary",
  group: "*",
  part,
  status: "open",
  status_code: "A",
  credits: "3",
  title: "",
  text: "",
  meetings: [{ d: 1 | 4 | 16, s: 600, e: 650, b: "Altgeld Hall", r: "314" }],
  instructors: [],
  instructors_raw: [],
  special: "",
} as unknown as Section);

const schedule = (...parts: string[]): Schedule =>
  ({ bundles: [{ course: "MATH 221", sections: parts.map((p, i) => section(`1000${i}`, p)) }], score: 0, stats: {} }) as unknown as Schedule;

/** Every class date (YYYY-MM-DD, Chicago time) of each event in an exported calendar. */
function occurrences(ics: string): { summary: string; description: string; dates: string[] }[] {
  const comp = new ICAL.Component(ICAL.parse(ics));
  return comp.getAllSubcomponents("vevent").map((ev) => {
    const e = new ICAL.Event(ev);
    const it = e.iterator();
    const dates: string[] = [];
    for (let t = it.next(); t && dates.length < 200; t = it.next()) {
      const d = e.getOccurrenceDetails(t).startDate;
      dates.push(`${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`);
    }
    return { summary: e.summary, description: e.description, dates };
  });
}

const within = (d: string, [a, z]: [string, string, string]) => d >= a && d <= z;

describe(".ics export uses the Registrar's calendar", () => {
  it("Fall 2026: first and last class on the official instruction days, nothing on Labor Day or in Fall Break", () => {
    const [ev] = occurrences(buildIcs(schedule("1"), "2026-fa", "Fall 2026", new Date("2026-11-17T00:00:00Z")));
    expect(ev.dates[0]).toBe("2026-08-24"); // Monday, first day of instruction
    expect(ev.dates.at(-1)).toBe("2026-12-09"); // Wednesday, last day of instruction
    expect(ev.dates).not.toContain("2026-09-07"); // Labor Day
    for (const b of TERM_DATES["2026-fa"].breaks) expect(ev.dates.filter((d) => within(d, b))).toEqual([]);
    expect(ev.dates).toContain("2026-11-20"); // the Friday before Fall Break still meets
    expect(ev.dates).toContain("2026-11-30"); // and classes resume the Monday after
    expect(ev.description).toContain("Dates from the Registrar's Fall 2026 academic calendar, read 2026-11-17; no classes on Labor Day and Fall Break.");
  });

  it("Spring 2027: no classes in Spring Break, and the halves of term use POT A and POT B dates", () => {
    const [full, a, b] = occurrences(buildIcs(schedule("1", "A", "B"), "2027-sp", "Spring 2027"));
    expect(full.dates[0]).toBe("2027-01-20"); // the first MWF day on or after Tuesday 19 January
    expect(full.dates.at(-1)).toBe("2027-05-05");
    expect(full.dates.filter((d) => within(d, TERM_DATES["2027-sp"].breaks[0]))).toEqual([]);
    expect(a.dates.at(-1)).toBe("2027-03-12"); // POT A ends the Friday before Spring Break
    expect(b.dates[0]).toBe("2027-03-22"); // POT B starts the Monday after it
    expect(b.dates.at(-1)).toBe("2027-05-05");
  });

  it("an estimated term says so in every event", () => {
    TERM_DATES["test-est"] = { ...TERM_DATES["2027-sp"], estimated: true };
    try {
      const [ev] = occurrences(buildIcs(schedule("1"), "test-est", "Test"));
      expect(ev.description).toContain("Dates are estimated from the usual academic calendar");
    } finally {
      delete TERM_DATES["test-est"];
    }
  });
});

describe(".ics export can include final exams (#85)", () => {
  const withFinal = (): Schedule => {
    const s = schedule("1");
    (s.bundles[0].sections[0] as Section).fx = [
      ["2026-12-14", 810, 990, "Combined"],
      ["2026-12-15", 480, 660, "Conflict"], // the make-up slot, not the exam
    ];
    return s;
  };
  it("adds each final as a one-off event when asked, and only then", () => {
    const evs = occurrences(buildIcs(withFinal(), "2026-fa", "Fall 2026", new Date("2026-11-17T00:00:00Z"), { finals: true }));
    const finals = evs.filter((e) => e.summary === "MATH 221 final exam");
    expect(finals).toHaveLength(1);
    expect(finals[0].dates).toEqual(["2026-12-14"]);
    expect(finals[0].description).toContain("Course Explorer's final exam schedule (Combined)");
    expect(buildIcs(withFinal(), "2026-fa", "Fall 2026", new Date("2026-11-17T00:00:00Z"), { finals: true })).toContain("DTSTART;TZID=America/Chicago:20261214T133000");
    expect(occurrences(buildIcs(withFinal(), "2026-fa", "Fall 2026")).some((e) => e.summary.includes("final"))).toBe(false);
  });
  it("escapes semicolons in text (RFC 5545 §3.3.11)", () => {
    const s = schedule("1");
    (s.bundles[0].sections[0] as Section).instructors_raw = ["Smith; J", "Lee, K"];
    expect(buildIcs(s, "2026-fa", "Fall 2026").replace(/\r\n /g, "")).toContain("Instructor: Smith\\; J\\; Lee\\, K");
  });
});
