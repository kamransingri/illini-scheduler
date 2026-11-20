import { describe, expect, it } from "vitest";
import { evaluate, listedByHand, NO_PROGRAMS, overlapChecks, programCourses, type Degree, type DegreeCourse, type DegreeGroup, type OverlapRule } from "@/lib/degree";
import { decodeCourses } from "@/lib/mycourses";

// A minor's coursework that must be distinct from the major (#112).
const group = (p: Partial<DegreeGroup> & { id: string }): DegreeGroup => ({
  name: p.id, section: "", kind: "program", rule: "all", n: null, hours: null, items: [], from: [], eligible: [], exclude: [], max_hours: {}, min_from: {}, not_with: [], exclusive: null, source: null, notes: [], ...p,
});
const c = (cr: number, g: string[] = []): DegreeCourse => ({ t: "", cr: [cr, cr], g, page: true });
const SIX: OverlapRule = { distinct_hours: 6, min_level: 300, minors_too: true, quote: "At least six hours ... must be distinct from credit earned for your major or another minor.", source: "https://catalog.illinois.edu/x/" };

const MINOR: Degree = {
  id: "landscape-minor", type: "minor", program: "Landscape Minor", college: "", catalog_year: "2026-2027", source: "", read_on: "", total_hours: 17, notes: [], unknown: [], double_counting: [],
  major_overlap: [SIX],
  groups: [group({ id: "intro", items: [[["LA 101"]]] }), group({ id: "electives", rule: "hours", hours: 15, items: [[["LA 250"]], [["LA 315"]], [["LA 342"]], [["LA 437"]]] })],
  courses: { "LA 101": c(3), "LA 250": c(3), "LA 315": c(3), "LA 342": c(4), "LA 437": c(3) },
};
const hours = (code: string) => MINOR.courses[code]?.cr[0] ?? 3;
const check = (courses: string, major: string[] = [], others: string[] = [], minor = MINOR) =>
  overlapChecks(minor, decodeCourses(courses), { ...NO_PROGRAMS, major: new Set(major), minors: new Set(others) }, hours)[0];

describe("coursework distinct from the major", () => {
  it("is short, met exactly, or more than met", () => {
    expect(check("LA101,LA250,LA315")).toMatchObject({ unit: "hours", need: 6, have: 3, distinct: ["LA 315"], shared: [] }); // LA 250 isn't advanced
    expect(check("LA315,LA437")).toMatchObject({ have: 6, distinct: ["LA 315", "LA 437"] });
    expect(check("LA315,LA342,LA437")).toMatchObject({ have: 10 });
  });
  it("leaves out what the major (or another minor) uses too", () => {
    expect(check("LA315,LA342,LA437", ["LA 342", "LA 437"])).toMatchObject({ have: 3, distinct: ["LA 315"], shared: ["LA 342", "LA 437"] });
    expect(check("LA315,LA437", [], ["LA 437"])).toMatchObject({ have: 3, shared: ["LA 437"] });
    // a rule about the major only doesn't mind another minor
    const majorOnly = { ...MINOR, major_overlap: [{ ...SIX, minors_too: false }] };
    expect(check("LA315,LA437", [], ["LA 437"], majorOnly)).toMatchObject({ have: 6, shared: [] });
  });
  it("counts courses from a range, without the excluded ones, when the rule says so", () => {
    const ansc: Degree = {
      ...MINOR,
      major_overlap: [{ distinct_courses: 2, min_level: 300, from: ["ANSC 300-499"], exclude: ["ANSC 398", "ANSC 499"], minors_too: true, quote: "q", source: "s" }],
    };
    expect(check("ANSC100,ANSC321,ANSC398", [], [], ansc)).toMatchObject({ unit: "courses", need: 2, have: 1, distinct: ["ANSC 321"] });
    // AP elective credit at the 400 level ("ANSC 4--") counts like any 400-level ANSC course
    const withAp = [...decodeCourses("ANSC321,ANSC440"), { s: "ANSC", n: "4--", status: "credit" as const, hours: 3, ap: "AP Biology" }];
    expect(overlapChecks(ansc, withAp, { ...NO_PROGRAMS, major: new Set(["ANSC 440"]) }, hours)[0]).toMatchObject({ have: 2, distinct: ["ANSC 321", "ANSC 4--"], shared: ["ANSC 440"] });
  });
  it("is nothing for a minor without a rule", () => {
    expect(overlapChecks({ ...MINOR, major_overlap: undefined }, decodeCourses("LA315"), NO_PROGRAMS, hours)).toEqual([]);
  });
  it("takes the major's own requirements, not its gen-eds", () => {
    const major: Degree = {
      ...MINOR, id: "m", type: "major", major_overlap: [],
      double_counting: [{ allow: true, between: ["program", "gened"], quote: "", source: "" }],
      groups: [group({ id: "core", items: [[["LA 315"]]] }), group({ id: "hum", kind: "gened", rule: "hours", hours: 3, from: ["gened:HP"] })],
      courses: { ...MINOR.courses, "LA 437": c(3, ["HP"]) },
    };
    expect([...programCourses(evaluate(major, decodeCourses("LA315,LA437")))]).toEqual(["LA 315"]);
  });
  it("counts a course on the major's hand-ticked list, but says it may count there", () => {
    const major: Degree = { ...MINOR, id: "m", type: "major", major_overlap: [], groups: [group({ id: "electives", rule: "manual", items: [[["LA 437"]], [["LA 342"]]] })] };
    expect([...listedByHand(major)]).toEqual(["LA 437", "LA 342"]);
    const r = overlapChecks(MINOR, decodeCourses("LA315,LA437"), { ...NO_PROGRAMS, majorLists: listedByHand(major) }, hours)[0];
    expect(r).toMatchObject({ have: 6, distinct: ["LA 315", "LA 437"], shared: [], maybe: ["LA 437"] });
  });
});
