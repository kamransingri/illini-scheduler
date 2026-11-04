import { describe, expect, it } from "vitest";
import { applyFilters, DEFAULT_FILTERS, matches, sortRows } from "@/lib/geneds";
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
  opts: [[600, 10, 0]],
  ...o,
});

describe("gen-ed filters", () => {
  it("category / code", () => {
    expect(matches(row({}), { ...DEFAULT_FILTERS, codes: ["HP", "LA"] })).toBe(true);
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
  it("no 8am needs some bundle starting at or after 9", () => {
    const f = { ...DEFAULT_FILTERS, earliest: 540 };
    expect(matches(row({ opts: [[480, 21, 0]] }), f)).toBe(false);
    expect(matches(row({ opts: [[480, 21, 0], [600, 21, 0]] }), f)).toBe(true);
    expect(matches(row({ opts: [[-1, 0, 1]] }), f)).toBe(true); // online, no set time
  });
  it("no Friday and online only", () => {
    expect(matches(row({ opts: [[600, 21, 0]] }), { ...DEFAULT_FILTERS, noFriday: true })).toBe(false);
    expect(matches(row({ opts: [[600, 10, 0]] }), { ...DEFAULT_FILTERS, noFriday: true })).toBe(true);
    expect(matches(row({ opts: [[600, 10, 0]] }), { ...DEFAULT_FILTERS, onlineOnly: true })).toBe(false);
    expect(matches(row({ opts: [[-1, 0, 1]] }), { ...DEFAULT_FILTERS, onlineOnly: true })).toBe(true);
  });
  it("open next term uses status when known, listed sections otherwise", () => {
    const f = { ...DEFAULT_FILTERS, openNext: true };
    expect(matches(row({ nSec: 0, opts: [] }), f)).toBe(false);
    expect(matches(row({ statusKnown: true, nOpen: 0 }), f)).toBe(false);
    expect(matches(row({ statusKnown: true, nOpen: 1 }), f)).toBe(true);
  });
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
  it("apply = filter + sort", () => expect(applyFilters(rows, { ...DEFAULT_FILTERS, codes: ["HP"] }, "gpa").length).toBe(3));
});
