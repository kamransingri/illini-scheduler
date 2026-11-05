import { describe, expect, it } from "vitest";
import { cisUrl, daysStr, fmtDelta, fmtGpa, fmtTime, termLabel, termOrder } from "@/lib/format";
import { decodeCart, encodeCart } from "@/lib/cart";

describe("format", () => {
  it("terms", () => {
    expect(termLabel("2027-sp")).toBe("Spring 2027");
    expect(termOrder("2026-fa")).toBeGreaterThan(termOrder("2026-sp"));
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
    const p = { ...DEFAULT_PREFS, earliest: 540, noFriday: true, includeSpecial: true, blocked: [{ d: 10, s: 900, e: 1080 }], weights: { ...DEFAULT_PREFS.weights, gpa: 3, walking: 0 } };
    const params = new URLSearchParams();
    prefsToParams(p, params);
    expect(hasPrefParams(params)).toBe(true);
    expect(prefsFromParams(params)).toEqual(p);
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
