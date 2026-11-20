import { describe, expect, it } from "vitest";
import type { Degree, DegreeCourse, DegreeGroup } from "@/lib/degree";
import { decodeCourses, decodeState, EMPTY, encodeState, stateFromParams, stateToParams } from "@/lib/mycourses";
import { addToTerm, decodePlan, EMPTY_PLAN, encodePlanTerms, finishTerms, gradOptions, planTerms, plannedIn, removeFromPlan, termHours, termIndex, type Plan } from "@/lib/plan";

const PLAN: Plan = { grad: "2029-sp", summers: false, terms: { "2027-fa": ["CS 225", "MATH 231"], "2027-sp": ["CS 124"], "2028-sp": ["CS 233"] } };

describe("terms", () => {
  it("orders spring, summer and fall", () => {
    expect(termIndex("2027-sp") < termIndex("2027-su") && termIndex("2027-su") < termIndex("2027-fa") && termIndex("2027-fa") < termIndex("2028-sp")).toBe(true);
    expect(termIndex("2027-wi")).toBeNaN();
  });
  it("offers each spring and fall for six years as a graduation term", () => {
    const opts = gradOptions("2027-sp");
    expect(opts.slice(0, 3)).toEqual(["2027-sp", "2027-fa", "2028-sp"]);
    expect(opts).toHaveLength(12);
    expect(opts.every((t) => !t.endsWith("-su"))).toBe(true);
    expect(gradOptions("2027-sp", "2027-su")).toContain("2027-su"); // a plan's own term stays pickable
  });
  it("shows the next term through graduation, summers when asked, and every term that has courses", () => {
    expect(planTerms(PLAN, "2027-sp")).toEqual(["2027-sp", "2027-fa", "2028-sp", "2028-fa", "2029-sp"]);
    expect(planTerms({ ...PLAN, summers: true }, "2027-sp")).toEqual(["2027-sp", "2027-su", "2027-fa", "2028-sp", "2028-su", "2028-fa", "2029-sp"]);
    // the plan was made a year ago: its past term is still shown, and so is a summer with courses
    const old = { ...PLAN, terms: { ...PLAN.terms, "2028-su": ["STAT 107"] } };
    expect(planTerms(old, "2028-sp")).toEqual(["2027-sp", "2027-fa", "2028-sp", "2028-su", "2028-fa", "2029-sp"]);
    expect(planTerms(EMPTY_PLAN, "2027-sp")).toEqual([]);
  });
});

describe("the plan in the link", () => {
  it("round-trips through the share link and the saved list", () => {
    expect(encodePlanTerms(PLAN)).toBe("2027-sp.CS124_2027-fa.CS225.MATH231_2028-sp.CS233");
    const params = new URLSearchParams();
    stateToParams({ ...EMPTY, courses: decodeCourses("CS124~p"), plan: { ...PLAN, summers: true } }, params);
    expect(params.get("g")).toBe("2029-sp");
    expect(params.get("gs")).toBe("1");
    expect(params.toString()).toContain("pl=2027-sp.CS124_2027-fa.CS225.MATH231_2028-sp.CS233");
    const back = stateFromParams(new URLSearchParams(params.toString()))!;
    expect(back.plan).toEqual({ ...PLAN, summers: true });
    expect(decodeState(encodeState(back)).plan).toEqual(back.plan);
    // a link with only a plan opens it
    expect(stateFromParams(new URLSearchParams("g=2029-sp&pl=2027-fa.CS225"))?.plan.terms).toEqual({ "2027-fa": ["CS 225"] });
  });
  it("opens old links and saved lists without a plan", () => {
    expect(stateFromParams(new URLSearchParams("m=CS124&p=computer-science-bs"))!.plan).toEqual(EMPTY_PLAN);
    expect(decodeState(JSON.stringify({ c: "CS124", p: "x" })).plan).toEqual(EMPTY_PLAN);
  });
  it("drops what it can't read and a course planned twice", () => {
    expect(decodePlan("2029-xx", "0", "2027-fa.CS225.cs225.junk_bad.CS100_2028-sp.CS225.math231")).toEqual({
      grad: "",
      summers: false,
      terms: { "2027-fa": ["CS 225"], "2028-sp": ["MATH 231"] },
    });
  });
});

describe("editing the plan", () => {
  it("adds a course once and removes it from wherever it is", () => {
    const p = addToTerm(PLAN, "2028-fa", "STAT 107");
    expect(plannedIn(p, "STAT 107")).toBe("2028-fa");
    expect(addToTerm(p, "2029-sp", "STAT 107")).toBe(p); // already planned
    const q = removeFromPlan(p, "CS 124");
    expect(q.terms["2027-sp"]).toBeUndefined();
    expect(plannedIn(q, "CS 124")).toBeNull();
  });
  it("adds up each term's hours, variable credit at its minimum", () => {
    const cr: Record<string, [number, number]> = { "CS 225": [4, 4], "MATH 231": [3, 3], "CS 498": [1, 4] };
    const lookup = (c: string) => cr[c] ?? null;
    expect(termHours(["CS 225", "MATH 231"], lookup)).toEqual({ hours: 7, variable: false, unknown: [] });
    expect(termHours(["CS 225", "CS 498", "XYZ 101"], lookup)).toEqual({ hours: 5, variable: true, unknown: ["XYZ 101"] });
  });
});

describe("the term each requirement is finished in", () => {
  const group = (p: Partial<DegreeGroup> & { id: string }): DegreeGroup => ({
    name: p.id, section: "", kind: "program", rule: "all", n: null, hours: null, items: [], from: [], eligible: [], exclude: [], max_hours: {}, min_from: {}, not_with: [], exclusive: null, source: null, notes: [], ...p,
  });
  const c = (cr: number, g: string[] = []): DegreeCourse => ({ t: "", cr: [cr, cr], g, page: true });
  const DEG: Degree = {
    id: "t", program: "Test", college: "", catalog_year: "2026-2027", source: "", read_on: "", total_hours: 120, notes: [], unknown: [],
    double_counting: [{ allow: true, between: ["program", "gened"], quote: "", source: "" }],
    groups: [
      group({ id: "intro", items: [[["CS 124"]], [["CS 128"]]] }),
      group({ id: "core", items: [[["CS 225"]], [["CS 233"]]] }),
      group({ id: "calc", rule: "n_of", n: 1, items: [[["MATH 221"]], [["MATH 220"]]] }),
      group({ id: "stats", rule: "hours", hours: 6, from: ["STAT 100-499"] }),
      group({ id: "qr", kind: "gened", rule: "n_of", n: 1, from: ["gened:QR1"] }),
      group({ id: "lang", rule: "manual" }),
      group({ id: "capstone", items: [[["CS 494"]]] }),
    ],
    courses: { "CS 124": c(3), "CS 128": c(3), "CS 225": c(4), "CS 233": c(4), "MATH 221": c(4, ["QR1"]), "STAT 107": c(4, ["QR1"]), "STAT 200": c(3), "CS 494": c(3) },
  };
  it("is now for what My courses already meets, else the first term that finishes it, else none", () => {
    const plan: Plan = { grad: "2029-sp", summers: false, terms: { "2027-fa": ["CS 128", "CS 225", "STAT 107"], "2028-sp": ["CS 233"], "2028-fa": ["STAT 200"] } };
    const at = finishTerms(DEG, decodeCourses("CS124,MATH221~p"), [], plan, planTerms(plan, "2027-sp"));
    expect(Object.fromEntries(at)).toEqual({
      calc: "now", // in progress counts
      qr: "now", // MATH 221 counts for the gen-ed too
      intro: "2027-fa",
      core: "2028-sp", // needs both courses
      stats: "2028-fa", // 4 hours, then 7
      capstone: null, // never planned
    }); // "lang" is ticked by hand, so the plan can't finish it
    expect(finishTerms(DEG, [], ["lang"], EMPTY_PLAN, []).get("lang")).toBe("now");
  });
  it("ignores a planned course that's already in My courses", () => {
    const plan: Plan = { grad: "2028-sp", summers: false, terms: { "2027-fa": ["CS 124"] } };
    expect(finishTerms(DEG, decodeCourses("CS124"), [], plan, ["2027-fa"]).get("intro")).toBeNull();
  });
});
