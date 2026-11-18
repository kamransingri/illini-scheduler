import { describe, expect, it } from "vitest";
import { applyFilters, DEFAULT_FILTERS as DF, filtersFromQuery, filtersToQuery, fitsTimes, hasTimeRules, matches, sortRows, timesFit } from "@/lib/geneds";
import { timeRulesSummary } from "@/lib/prefs";
import { DEFAULT_PREFS } from "@/lib/schedule";
const DEFAULT_FILTERS = { ...DF, minStudents: 0, openNext: false };
import type { GenedRow } from "@/lib/types";

const row = (o: Partial<GenedRow>): GenedRow => ({
  s: "X",
  n: "100",
  t: "t",
  codes: ["HP"],
  cats: ["HUM"],
  cr: [3, 3],
  gpa: 3.0,
  gpaN: 100,
  pctA: 0.4,
  nSec: 2,
  nOpen: null,
  statusKnown: false,
  best: null,
  rmp: null,
  opts: [[600, 650, 10, 6]], // TR 10:00-10:50, made by the builder with or without special sections
  ...o,
});

describe("gen-ed filters", () => {
  it("category / code", () => {
    // a course must cover every selected category (it has HP only)
    expect(matches(row({}), { ...DEFAULT_FILTERS, codes: ["HP"] })).toBe(true);
    expect(matches(row({}), { ...DEFAULT_FILTERS, codes: ["HP", "LA"] })).toBe(false);
    expect(matches(row({ codes: ["HP", "NW"] }), { ...DEFAULT_FILTERS, codes: ["HP", "NW"] })).toBe(true);
    expect(matches(row({}), { ...DEFAULT_FILTERS, codes: ["QR1"] })).toBe(false);
  });
  it("double dips need 2+ categories", () => {
    expect(matches(row({}), { ...DEFAULT_FILTERS, doubleDip: true })).toBe(false);
    expect(matches(row({ cats: ["HUM", "CS"], codes: ["HP", "NW"] }), { ...DEFAULT_FILTERS, doubleDip: true })).toBe(true);
  });
  it("credit hours within range", () => {
    expect(matches(row({ cr: [3, 4] }), { ...DEFAULT_FILTERS, credits: 4 })).toBe(true);
    expect(matches(row({ cr: [3, 3] }), { ...DEFAULT_FILTERS, credits: 4 })).toBe(false);
  });
  it("open next term uses status when known, listed sections otherwise", () => {
    const f = { ...DEFAULT_FILTERS, openNext: true };
    expect(matches(row({ nSec: 0, opts: [] }), f)).toBe(false);
    expect(matches(row({ statusKnown: true, nOpen: 0 }), f)).toBe(false);
    expect(matches(row({ statusKnown: true, nOpen: 1 }), f)).toBe(true);
    expect(matches(row({ statusKnown: true, nOpen: 0 }), { ...f, openNext: false })).toBe(true);
  });
  it("open sections are on by default", () => expect(DF.openNext).toBe(true));
  it("sample-size floor", () => {
    expect(matches(row({ gpaN: 150 }), { ...DEFAULT_FILTERS, minStudents: 200 })).toBe(false);
    expect(matches(row({ gpaN: 250 }), { ...DEFAULT_FILTERS, minStudents: 200 })).toBe(true);
  });
  it("min RMP excludes unknown ratings", () => {
    expect(matches(row({ rmp: null }), { ...DEFAULT_FILTERS, minRmp: 3 })).toBe(false);
    expect(matches(row({ rmp: 4.1 }), { ...DEFAULT_FILTERS, minRmp: 3 })).toBe(true);
  });
});

describe("gen-ed sorting", () => {
  const rows = [row({ n: "1", gpa: 3.1, pctA: 0.5 }), row({ n: "2", gpa: null }), row({ n: "3", gpa: 3.6, pctA: 0.3, nSec: 9 })];
  it("GPA desc, nulls last", () => expect(sortRows(rows, "gpa").map((r) => r.n)).toEqual(["3", "1", "2"]));
  it("% A", () => expect(sortRows(rows, "pctA")[0].n).toBe("1"));
  it("open sections", () => expect(sortRows(rows, "open")[0].n).toBe("3"));
  it("best-pick score, nulls last", () => {
    const score: Record<string, number | null> = { "1": 40, "2": null, "3": 70 };
    expect(sortRows(rows, "score", (r) => score[r.n]).map((r) => r.n)).toEqual(["3", "1", "2"]);
  });
  it("apply = filter + sort", () => expect(applyFilters(rows, { ...DEFAULT_FILTERS, codes: ["HP"] }, "gpa").length).toBe(3));
});

describe("fits the schedule builder's times (#30)", () => {
  const rules = (o: Partial<typeof DEFAULT_PREFS>) => ({ ...DEFAULT_PREFS, ...o });
  it("start time, end time and days off, as the builder's must-haves apply them", () => {
    const r = row({});
    expect(fitsTimes(r, rules({ earliest: 600 }))).toBe(true);
    expect(fitsTimes(r, rules({ earliest: 630 }))).toBe(false);
    expect(fitsTimes(r, rules({ latest: 650 }))).toBe(true);
    expect(fitsTimes(r, rules({ latest: 640 }))).toBe(false);
    expect(fitsTimes(r, rules({ daysOff: 17 }))).toBe(true); // Mon and Fri off; it meets Tue/Thu
    expect(fitsTimes(r, rules({ daysOff: 2 }))).toBe(false);
  });
  it("one way to take the course that fits is enough; one with no set times always fits", () => {
    const r = row({ opts: [[480, 530, 10, 6], [780, 830, 10, 6]] });
    expect(fitsTimes(r, rules({ earliest: 540 }))).toBe(true);
    expect(fitsTimes(r, rules({ earliest: 540, latest: 720 }))).toBe(false);
    expect(fitsTimes(row({ opts: [[-1, -1, 0, 6]] }), rules({ earliest: 720, daysOff: 31 }))).toBe(true);
    expect(fitsTimes(row({ opts: [] }), rules({ earliest: 540 }))).toBe(false);
  });
  it("special sections count only when allowed, closed ones not when the builder wants open sections", () => {
    const special = row({ opts: [[600, 650, 10, 2]] });
    expect(fitsTimes(special, rules({ earliest: 540 }))).toBe(false);
    expect(fitsTimes(special, rules({ earliest: 540, includeSpecial: true }))).toBe(true);
    const closed = row({ opts: [[600, 650, 10, 7]] });
    expect(fitsTimes(closed, rules({ earliest: 540 }))).toBe(true);
    expect(fitsTimes(closed, rules({ earliest: 540, openOnly: true }))).toBe(false);
  });
  it("says why a course doesn't fit", () => {
    expect(timesFit(row({}), rules({ earliest: 540 }))).toBe("fits");
    expect(timesFit(row({}), rules({ earliest: 630 }))).toBe("times");
    expect(timesFit(row({ opts: [[600, 650, 10, 2]] }), rules({ earliest: 540 }))).toBe("special");
    expect(timesFit(row({ opts: [[600, 650, 10, 7]] }), rules({ earliest: 540, openOnly: true }))).toBe("closed");
    expect(timesFit(row({ nSec: 0, opts: [] }), rules({ earliest: 540 }))).toBeNull();
  });
  it("the filter needs time rules; open-only or lunch alone aren't times", () => {
    const f = { ...DEFAULT_FILTERS, fits: true };
    expect(hasTimeRules(null)).toBe(false);
    expect(hasTimeRules(rules({ openOnly: true, lunch: true }))).toBe(false);
    expect(matches(row({}), f, null)).toBe(true);
    expect(matches(row({}), f, rules({ earliest: 630 }))).toBe(false);
    expect(matches(row({}), { ...f, fits: false }, rules({ earliest: 630 }))).toBe(true);
    expect(applyFilters([row({ n: "1" }), row({ n: "2", opts: [[540, 590, 10, 6]] })], f, "gpa", undefined, rules({ latest: 600 })).map((r) => r.n)).toEqual(["2"]);
  });
  it("says the rules in plain words", () => {
    expect(timeRulesSummary(rules({ earliest: 600, latest: 1020, daysOff: 17 }))).toEqual(["start 10:00am or later", "done by 5:00pm", "Mon, Fri off"]);
    expect(timeRulesSummary(DEFAULT_PREFS)).toEqual([]);
  });
});

describe("gen-ed URL state", () => {
  it("round trip", () => {
    const f = { ...DF, codes: ["HP", "LA"], openNext: false, minStudents: 0 };
    expect(filtersFromQuery(filtersToQuery(f, "pctA"))).toEqual({ f, sort: "pctA" });
    expect(filtersToQuery(f, "pctA")).toContain("nx=0");
    expect(filtersFromQuery(filtersToQuery({ ...f, fits: true }, "gpa"))).toEqual({ f: { ...f, fits: true }, sort: "gpa" });
    expect(filtersToQuery({ ...DF, fits: true }, "score")).toBe("fit=1");
    // old links with time filters still open (the time filters moved to the schedule builder)
    expect(filtersFromQuery("codes=HP&e=540&nf=1&on=1").f).toEqual({ ...DF, codes: ["HP"] });
    expect(filtersToQuery(DF, "score")).toBe(""); // the best-pick score is the default sort
    expect(filtersToQuery(DF, "gpa")).toBe("sort=gpa");
    expect(filtersFromQuery("").sort).toBe("score");
  });
});
