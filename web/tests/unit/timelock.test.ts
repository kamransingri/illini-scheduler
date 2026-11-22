import { describe, expect, it } from "vitest";
import { decodeCart, encodeCart } from "@/lib/cart";
import { DEFAULT_PREFS, explainEmpty, generate, type CourseInput } from "@/lib/schedule";
import type { Course, Section } from "@/lib/types";

// Time locks (#139): "Keep 11am MWF, any section".
const MWF = 1 | 4 | 16;
const lec = (crn: string, code: string, d: number, s: number): Section => ({
  crn, code, type: "LEC", type_name: "", component: "primary", group: "*", part: "1", status: "Open", status_code: "A", credits: "", title: "", text: "",
  instructors: [], instructors_raw: [], special: "", meetings: [{ d, s, e: s + 50, b: "Lincoln Hall", r: "1" }],
});
const course = (sections: Section[]) =>
  ({ subject: "X", number: "101", title: "", credits: "3 hours.", credit_range: [3, 3], gpa: null, instructors: {}, terms: { "2027-sp": { sections } } }) as unknown as Course;
const SECS = [lec("10001", "A1", MWF, 660), lec("10002", "A2", MWF, 660), lec("10003", "A3", MWF, 540), lec("10004", "A4", 2 | 8, 660)];
const input = (at?: CourseInput["at"]): CourseInput => ({ key: "X 101", course: course(SECS), credits: 3, locked: [], ...(at ? { at } : {}) });
const crns = (i: CourseInput) => generate([i], "2027-sp", DEFAULT_PREFS).schedules.flatMap((s) => s.bundles.flatMap((b) => b.alternatives.flat().map((x) => x.crn))).sort();

describe("time locks", () => {
  it("keep every section that meets then and drop the rest", () => {
    expect(crns(input())).toEqual(["10001", "10002", "10003", "10004"]);
    expect(crns(input([{ d: MWF, s: 660 }]))).toEqual(["10001", "10002"]);
  });

  it("say which lock leaves nothing", () => {
    expect(explainEmpty(input([{ d: MWF, s: 780 }]), "2027-sp", DEFAULT_PREFS)).toBe("no section meets at your 1:00pm MWF lock");
  });

  it("go into share links after the CRN locks, and old links still decode", () => {
    const enc = encodeCart([{ s: "CS", n: "124", locked: ["12345"], at: ["21-660"] }, { s: "STAT", n: "107", locked: [] }]);
    expect(enc).toBe("CS124!12345@21-660,STAT107");
    expect(decodeCart(enc)).toEqual([{ s: "CS", n: "124", locked: ["12345"], at: ["21-660"] }, { s: "STAT", n: "107", locked: [] }]);
    expect(decodeCart("CS124!12345,STAT107")).toEqual([{ s: "CS", n: "124", locked: ["12345"] }, { s: "STAT", n: "107", locked: [] }]);
    expect(decodeCart("CS124@999-1@21-x@21-660")).toEqual([{ s: "CS", n: "124", locked: [], at: ["21-660"] }]); // bad ones dropped
  });
});
