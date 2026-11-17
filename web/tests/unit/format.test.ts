import { describe, expect, it } from "vitest";
import { cisUrl, daysStr, fmtDate, fmtDelta, fmtGpa, fmtTime, rmpRateUrl, termLabel, termOrder, treLabel } from "@/lib/format";
import { decodeCart, encodeCart } from "@/lib/cart";

describe("format", () => {
  it("RMP rating link: RMP's add-a-rating page for a numeric id, else the profile", () => {
    const url = "https://www.ratemyprofessors.com/professor/209729";
    expect(rmpRateUrl({ id: "209729", url })).toBe("https://www.ratemyprofessors.com/add/professor-rating/209729");
    expect(rmpRateUrl({ id: "VGVhY2hlci0yMDk3Mjk=", url })).toBe(url);
    expect(rmpRateUrl({ id: "", url })).toBe(url);
  });
  it("terms", () => {
    expect(termLabel("2027-sp")).toBe("Spring 2027");
    expect(termOrder("2026-fa")).toBeGreaterThan(termOrder("2026-sp"));
    expect(treLabel("2024-fa Excellent")).toBe("Fall 2024, Excellent");
    expect(treLabel("2022-sp Outstanding")).toBe("Spring 2022, Outstanding");
    expect(treLabel("something else")).toBe("something else");
    expect(fmtDate("2026-11-16")).toBe("Nov 16, 2026"); // a calendar day stays that day
    expect(fmtDate("2026-11-16T03:00:00+00:00")).toBe("Nov 15, 2026"); // a timestamp is shown in Chicago time
  });
  it("times and days", () => {
    expect(fmtTime(540)).toBe("9:00am");
    expect(fmtTime(780)).toBe("1:00pm");
    expect(fmtTime(720)).toBe("12:00pm");
    expect(daysStr(21)).toBe("MWF");
  });
  it("numbers never show NaN", () => {
    expect(fmtGpa(null)).toBe("–");
    expect(fmtGpa(NaN)).toBe("–");
    expect(fmtDelta(0.001)).toBe("±0.00");
    expect(fmtDelta(-0.13)).toBe("−0.13");
  });
  it("course explorer links", () => {
    expect(cisUrl("2027-sp", "CS", "124", "71571")).toBe("https://courses.illinois.edu/schedule/2027/spring/CS/124?sectionId=71571");
  });
  it("cart round trip", () => {
    const items = [
      { s: "CS", n: "124", locked: [] },
      { s: "MATH", n: "231", locked: ["12345"] },
    ];
    expect(decodeCart(encodeCart(items))).toEqual(items);
    expect(decodeCart("cs124,junk,CS124")).toEqual([{ s: "CS", n: "124", locked: [] }]);
  });
});

import { hasPrefParams, prefsFromParams, prefsToParams } from "@/lib/prefs";
import { DEFAULT_PREFS } from "@/lib/schedule";

describe("prefs in the URL", () => {
  it("round trip", () => {
    const p = {
      ...DEFAULT_PREFS,
      earliest: 540,
      latest: 1080,
      daysOff: 17,
      lunch: true,
      openOnly: true,
      includeSpecial: true,
      softEarly: 540,
      softLate: 960,
      blocked: [{ d: 10, s: 900, e: 1080 }],
      weights: { ...DEFAULT_PREFS.weights, gpa: 3, walking: 0, late: 2, open: 3 },
    };
    const params = new URLSearchParams();
    prefsToParams(p, params);
    expect(hasPrefParams(params)).toBe(true);
    expect(prefsFromParams(params)).toEqual(p);
  });
  it("links from before v0.4.0 still open: nf=1 is Friday off, 6-digit weights keep the new ones at default", () => {
    const p = prefsFromParams(new URLSearchParams("nf=1&w=300000"));
    expect(p.daysOff).toBe(16);
    expect(p.weights).toEqual({ ...DEFAULT_PREFS.weights, gpa: 3, rmp: 0, early: 0, daysOff: 0, compact: 0, walking: 0 });
  });
  it("defaults add nothing", () => {
    const params = new URLSearchParams();
    prefsToParams(DEFAULT_PREFS, params);
    expect(params.toString()).toBe("");
  });
});

import { fmtAgo, seatVerb } from "@/lib/format";

describe("seat history helpers", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("fmtAgo", () => {
    expect(fmtAgo("2026-11-05T01:00:00Z", now)).toBe("today");
    expect(fmtAgo("2026-11-04T06:00:00Z", now)).toBe("yesterday");
    expect(fmtAgo("2026-11-02T12:00:00Z", now)).toBe("3 days ago");
    expect(fmtAgo("", now)).toBe("");
  });
  it("seatVerb", () => {
    expect(seatVerb("Closed", "Open")).toBe("opened");
    expect(seatVerb("Closed", "CrossListOpen (Restricted)")).toBe("opened");
    expect(seatVerb("Open", "Closed")).toBe("closed");
    expect(seatVerb("Open", "Open (Restricted)")).toBe("changed");
  });
});
