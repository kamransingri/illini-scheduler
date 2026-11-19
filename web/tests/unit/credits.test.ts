import { describe, expect, it } from "vitest";
import { courseHours, fmtCredits, HOUR_RULES_SOURCE, hourWarnings, limitsFor, totalHours } from "@/lib/credits";

const kinds = (...a: Parameters<typeof hourWarnings>) => hourWarnings(...a).map((w) => w.kind);

describe("credit hours (#82)", () => {
  it("limits follow the term: 18 and full-time 12 in fall and spring, 9 in summer, one class in winter", () => {
    expect(limitsFor("2027-sp")).toEqual({ max: 18, maxClasses: null, fullTime: 12 });
    expect(limitsFor("2026-fa")).toEqual({ max: 18, maxClasses: null, fullTime: 12 });
    expect(limitsFor("2027-su")).toEqual({ max: 9, maxClasses: null, fullTime: null });
    expect(limitsFor("2026-wi")).toEqual({ max: null, maxClasses: 1, fullTime: null });
  });

  it("adds hours as a range when a course has variable credit", () => {
    expect(courseHours([3, 3])).toEqual([3, 3]);
    expect(courseHours([1, 4])).toEqual([1, 4]);
    expect(courseHours([0, 0])).toEqual([3, 3]); // no hours listed: counted as 3, like the builder
    expect(courseHours([4, 0])).toEqual([4, 4]);
    expect(totalHours([[4, 4], [3, 3], [1, 4]])).toEqual([8, 11]);
    expect(fmtCredits([15, 15])).toBe("15");
    expect(fmtCredits([15, 17])).toBe("15–17");
    expect(fmtCredits([7.5, 7.5])).toBe("7.5");
  });

  it("18 hours is fine, 19 needs an overload, and the warning links to the Registrar", () => {
    expect(kinds([18, 18], 5, "2027-sp", "Spring 2027")).toEqual([]);
    const w = hourWarnings([19, 19], 5, "2027-sp", "Spring 2027");
    expect(w.map((x) => x.kind)).toEqual(["over"]);
    expect(w[0].text).toBe("19 credit hours: over the 18-hour limit for Spring 2027, so your college office has to approve an overload.");
    expect(w[0].href).toBe(HOUR_RULES_SOURCE);
  });

  it("12 hours is full-time, 11 isn't", () => {
    expect(kinds([12, 12], 4, "2027-sp", "Spring 2027")).toEqual([]);
    const w = hourWarnings([11, 11], 4, "2027-sp", "Spring 2027");
    expect(w.map((x) => x.kind)).toEqual(["under"]);
    expect(w[0].text).toContain("under 12, so you wouldn't be full-time");
  });

  it("a variable-credit course that could cross a limit says which course decides it", () => {
    const over = hourWarnings([17, 20], 5, "2027-sp", "Spring 2027", ["CS 498"]);
    expect(over.map((x) => x.kind)).toEqual(["maybe-over"]);
    expect(over[0].text).toBe("17–20 credit hours (CS 498 can be taken for different hours): more than 18 in Spring 2027 needs your college office's approval.");
    expect(kinds([10, 13], 4, "2027-sp", "Spring 2027", ["MUS 100"])).toEqual(["maybe-under"]);
  });

  it("under 12 waits for a generated schedule: a cart being filled is on its way up", () => {
    expect(kinds([7, 7], 2, "2027-sp", "Spring 2027", [], false)).toEqual([]);
    expect(kinds([19, 19], 5, "2027-sp", "Spring 2027", [], false)).toEqual(["over"]); // over shows straight away
    expect(kinds([0, 0], 0, "2027-sp", "Spring 2027")).toEqual([]); // nothing in the cart
  });

  it("summer caps at 9 hours with no full-time warning; winter allows one class", () => {
    expect(kinds([9, 9], 3, "2027-su", "Summer 2027")).toEqual([]);
    expect(kinds([10, 10], 3, "2027-su", "Summer 2027")).toEqual(["over"]);
    expect(kinds([3, 3], 1, "2027-su", "Summer 2027")).toEqual([]);
    expect(kinds([3, 3], 1, "2026-wi", "Winter 2026")).toEqual([]);
    const w = hourWarnings([6, 6], 2, "2026-wi", "Winter 2026");
    expect(w.map((x) => x.kind)).toEqual(["classes"]);
    expect(w[0].text).toBe("2 classes: Winter 2026 allows one class without your college office's approval.");
  });
});
