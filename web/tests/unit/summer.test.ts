import { describe, expect, it } from "vitest";
import { DEFAULT_SUMMER, filterSummer, matchesQuery, seasonOf, sessionText, summerFromQuery, summerHref, summerLine, summerRedirect, summerToQuery, type SummerRow } from "@/lib/summer";

const row = (p: Partial<SummerRow> & { s: string; n: string }): SummerRow => ({ t: "", cr: [3, 3], codes: [], nSec: 1, online: "all", sess: ["S2"], ran: 3, gpa: null, page: true, ...p });
const ROWS = [
  row({ s: "ECON", n: "102", t: "Microeconomic Principles", codes: ["SS"], online: "some", sess: ["S1", "S2"] }),
  row({ s: "STAT", n: "100", t: "Statistics", codes: ["QR2"], sess: ["full"], ran: 1 }),
  row({ s: "CS", n: "124", t: "Introduction to Computer Science I", codes: ["QR1"], online: "none" }),
  row({ s: "CS", n: "598", t: "Special Topics" }),
];
const ids = (rows: SummerRow[]) => rows.map((r) => `${r.s} ${r.n}`);

describe("summer filters", () => {
  it("defaults to undergraduate gen-eds; 'all' lists every class", () => {
    expect(ids(filterSummer(ROWS, DEFAULT_SUMMER, 3))).toEqual(["ECON 102", "STAT 100", "CS 124"]);
    expect(filterSummer(ROWS, { ...DEFAULT_SUMMER, undergrad: false }, 3)).toHaveLength(3);
    expect(filterSummer(ROWS, { ...DEFAULT_SUMMER, gened: "all", undergrad: false }, 3)).toHaveLength(4);
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
    expect(summerToQuery({ ...DEFAULT_SUMMER, gened: "all" })).toBe("gened=all");
    expect(summerFromQuery("gened=all").gened).toBe("all");
  });

  it("points to the gen-ed finder's Summer view, and old /summer/ links keep their filters", () => {
    expect(summerHref(DEFAULT_SUMMER)).toBe("/geneds/?term=summer");
    expect(summerHref({ ...DEFAULT_SUMMER, session: "S1" })).toBe("/geneds/?term=summer&session=S1");
    // the old page listed every class unless a gen-ed was picked
    expect(summerRedirect("")).toBe("/geneds/?term=summer&gened=all");
    expect(summerRedirect("?q=cs%20124&campus=1")).toBe("/geneds/?term=summer&q=cs+124&gened=all&campus=1");
    expect(summerRedirect("?gened=HP&online=1")).toBe("/geneds/?term=summer&gened=HP&online=1");
    expect(summerRedirect("?gened=any&every=1&grad=1")).toBe("/geneds/?term=summer&every=1&grad=1");
  });
});

describe("summer line on course pages", () => {
  const d = { term: "2026-su", label: "Summer 2026", recent: ["2024-su", "2025-su", "2026-su"], next_label: "Summer 2027" };
  it("says when and where it runs, and how often", () => {
    expect(summerLine(ROWS[0], { ...d, upcoming: true })).toBe("Summer 2026: Session I, Session II, online or on campus. Ran in 3 of the last 3 summers.");
    expect(summerLine(ROWS[1], { ...d, upcoming: false })).toBe(
      "Ran in Summer 2026 (Full summer, online), and in 1 of the last 3 summers. Summer 2027's schedule isn't out yet.",
    );
    expect(summerLine(ROWS[2], { ...d, recent: ["2026-su"], upcoming: true })).toBe("Summer 2026: Session II, on campus.");
  });
});

describe("winter session (#270)", () => {
  const w = { term: "2027-wi", label: "Winter 2027", recent: ["2025-wi", "2026-wi", "2027-wi"], next_label: "Winter 2028" };
  const astr = row({ s: "ASTR", n: "100", t: "Introduction to Astronomy", codes: ["PS"], sess: ["full"] });
  it("reads the season from the term", () => {
    expect(seasonOf("2027-wi")).toBe("winter");
    expect(seasonOf("2026-su")).toBe("summer");
  });
  it("calls the one session winter session, and counts winters", () => {
    expect(sessionText(astr, "2027-wi")).toBe("Winter session");
    expect(sessionText(astr, "2026-su")).toBe("Full summer");
    expect(summerLine(astr, { ...w, upcoming: true })).toBe("Winter 2027: Winter session, online. Ran in 3 of the last 3 winters.");
    expect(summerLine({ ...astr, ran: 2 }, { ...w, upcoming: false })).toBe(
      "Ran in Winter 2027 (Winter session, online), and in 2 of the last 3 winters. Winter 2028's schedule isn't out yet.",
    );
  });
  it("links to the gen-ed finder's Winter view, without a session", () => {
    expect(summerHref({ ...DEFAULT_SUMMER, gened: "all", q: "ASTR" }, "winter")).toBe("/geneds/?term=winter&q=ASTR&gened=all");
    expect(summerHref({ ...DEFAULT_SUMMER, session: "S1" }, "winter")).toBe("/geneds/?term=winter");
  });
});
