import { describe, expect, it } from "vitest";
import { DEFAULT_SUMMER, filterSummer, matchesQuery, summerFromQuery, summerToQuery, type SummerRow } from "@/lib/summer";

const row = (p: Partial<SummerRow> & { s: string; n: string }): SummerRow => ({ t: "", cr: [3, 3], codes: [], nSec: 1, online: "all", sess: ["S2"], ran: 3, gpa: null, page: true, ...p });
const ROWS = [
  row({ s: "ECON", n: "102", t: "Microeconomic Principles", codes: ["SS"], online: "some", sess: ["S1", "S2"] }),
  row({ s: "STAT", n: "100", t: "Statistics", codes: ["QR2"], sess: ["full"], ran: 1 }),
  row({ s: "CS", n: "124", t: "Introduction to Computer Science I", codes: ["QR1"], online: "none" }),
  row({ s: "CS", n: "598", t: "Special Topics" }),
];
const ids = (rows: SummerRow[]) => rows.map((r) => `${r.s} ${r.n}`);

describe("summer filters", () => {
  it("defaults to undergraduate classes", () => {
    expect(ids(filterSummer(ROWS, DEFAULT_SUMMER, 3))).toEqual(["ECON 102", "STAT 100", "CS 124"]);
    expect(filterSummer(ROWS, { ...DEFAULT_SUMMER, undergrad: false }, 3)).toHaveLength(4);
  });

  it("filters by gen-ed, session, place and every summer", () => {
    expect(ids(filterSummer(ROWS, { ...DEFAULT_SUMMER, gened: "QR1" }, 3))).toEqual(["CS 124"]);
    expect(ids(filterSummer(ROWS, { ...DEFAULT_SUMMER, gened: "any" }, 3))).toEqual(["ECON 102", "STAT 100", "CS 124"]);
    expect(ids(filterSummer(ROWS, { ...DEFAULT_SUMMER, session: "S1" }, 3))).toEqual(["ECON 102"]);
    expect(ids(filterSummer(ROWS, { ...DEFAULT_SUMMER, online: true }, 3))).toEqual(["ECON 102", "STAT 100"]);
    expect(ids(filterSummer(ROWS, { ...DEFAULT_SUMMER, campus: true }, 3))).toEqual(["ECON 102", "CS 124"]);
    expect(ids(filterSummer(ROWS, { ...DEFAULT_SUMMER, every: true }, 3))).toEqual(["ECON 102", "CS 124"]);
  });

  it("searches codes and title words", () => {
    expect(matchesQuery(ROWS[2], "cs 124")).toBe(true);
    expect(matchesQuery(ROWS[2], "CS12")).toBe(true);
    expect(matchesQuery(ROWS[2], "cs")).toBe(true);
    expect(matchesQuery(ROWS[0], "microeconomic principles")).toBe(true);
    expect(matchesQuery(ROWS[0], "macro")).toBe(false);
  });

  it("keeps only non-default filters in the link and reads them back", () => {
    expect(summerToQuery(DEFAULT_SUMMER)).toBe("");
    const f = { ...DEFAULT_SUMMER, q: "cs", gened: "QR1", session: "S2", campus: true, undergrad: false };
    expect(summerToQuery(f)).toBe("q=cs&gened=QR1&session=S2&campus=1&grad=1");
    expect(summerFromQuery(summerToQuery(f))).toEqual(f);
    expect(summerFromQuery("session=XX&gened=<b>")).toEqual(DEFAULT_SUMMER);
  });
});
