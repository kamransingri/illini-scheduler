import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCart } from "../../web/lib/cart";
import { courseInput } from "../../web/lib/inputs";
import { prefsFromParams } from "../../web/lib/prefs";
import { NOBODY } from "../../web/lib/restrictions";
import { DEFAULT_PREFS, generate, type Prefs } from "../../web/lib/schedule";
import { DEFAULT_WEIGHTS } from "../../web/lib/score";
import type { Course, GenedRow, Meta, SearchIndex } from "../../web/lib/types";
import { buildSchedules, creditRange, findGeneds, genedsMatch, getCourse, parseClock, parseDays, pickTerm, prefsOf, searchCourses, termInfo, type BuildArgs } from "../src/tools";

const DATA = path.join(import.meta.dirname, "fixtures", "data");
const read = <T>(f: string): T => JSON.parse(readFileSync(path.join(DATA, f), "utf8")) as T;
const meta = read<Meta>("meta.json");
const index = read<SearchIndex>("search.json");
const geneds = read<GenedRow[]>("geneds.json");
const cs124 = read<Course>("course/CS/124.json");
const SITE = "https://example.test/illini-scheduler";

describe("helpers", () => {
  it("reads credit hours as printed", () => {
    expect(creditRange("3")).toEqual([3, 3]);
    expect(creditRange("3 OR 4")).toEqual([3, 4]);
    expect(creditRange("0 TO 5")).toEqual([0, 5]);
    expect(creditRange("")).toBeNull();
  });

  it("matches gen-ed codes and categories", () => {
    expect(genedsMatch(["LA", "NW"], ["LA", "NW"])).toBe(true);
    expect(genedsMatch(["LA", "NW"], ["HUM"])).toBe(true); // a category: any of its codes
    expect(genedsMatch(["LA"], ["HUM", "NW"])).toBe(false);
    expect(genedsMatch([], [])).toBe(true);
  });
});

describe("term_info", () => {
  it("names the current and next term with their dates and the build", () => {
    const t = termInfo(meta, SITE);
    expect(t.current_term.id).toBe(meta.current_term);
    expect(t.next_term.id).toBe(meta.next_term);
    expect(t.registering_for).toBe("Spring 2027");
    expect(t.next_term.instruction?.first_day).toBe("2027-01-19");
    expect(t.next_term.instruction?.no_classes).toEqual([{ name: "Spring Break", from: "2027-03-13", to: "2027-03-21" }]);
    expect(t.next_term.sections_and_seats_checked_at).toBe(meta.terms[meta.next_term].checked_at);
    expect(t.gpa_data.recent).toBe("Fall 2022 to Spring 2026");
    expect(t.data.built_at).toBe(meta.built_at);
  });
});

describe("search_courses", () => {
  it("finds a course by its code, however it's typed, and by nickname", () => {
    expect(searchCourses(index, meta, SITE, { query: "cs124" }).courses[0].code).toBe("CS 124");
    expect(searchCourses(index, meta, SITE, { query: "CS 124" }).courses[0]).toMatchObject({
      title: "Introduction to Computer Science I",
      offered_next_term: true,
      url: `${SITE}/course/CS/124/`,
    });
    expect(searchCourses(index, meta, SITE, { query: "calc 2" }).courses[0].code).toBe("MATH 231");
  });

  it("finds a renumbered course by its old number", () => {
    const r = searchCourses(index, meta, SITE, { query: "ADV 283" });
    expect(r.courses[0]).toMatchObject({ code: "ADV 250", formerly: ["ADV 283"] });
  });

  it("filters by gen-ed, credits, GPA and term, and sorts by GPA", () => {
    const r = searchCourses(index, meta, SITE, { gened: ["QR1"], offered: "next", credits: 4, min_gpa: 3, sort: "gpa", limit: 100 });
    expect(r.matches).toBeGreaterThan(2);
    for (const c of r.courses) {
      expect(c.gen_eds).toContain("QR1 (Quantitative Reasoning I)");
      expect(c.offered_next_term).toBe(true);
      expect(c.average_gpa).toBeGreaterThanOrEqual(3);
      const row = index.courses.find((x) => `${x.s} ${x.n}` === c.code)!;
      expect(creditRange(row.c)![1]).toBeGreaterThanOrEqual(4);
    }
    const gpas = r.courses.map((c) => c.average_gpa ?? -1);
    expect(gpas).toEqual([...gpas].sort((a, b) => b - a));
  });

  it("takes gen-ed categories and both lowercase codes", () => {
    const r = searchCourses(index, meta, SITE, { gened: ["hum", "nw"], limit: 100 });
    expect(r.matches).toBeGreaterThan(0);
    expect(r.courses.every((c) => c.gen_eds.some((g) => g.startsWith("NW")))).toBe(true);
  });

  it("returns professors for a name and warns about unknown gen-eds", () => {
    expect(searchCourses(index, meta, SITE, { query: "colleen lewis" }).instructors?.[0]).toEqual({
      name: "Colleen Lewis",
      teaching_next_term: expect.arrayContaining(["CS 124"]),
    });
    expect(searchCourses(index, meta, SITE, { gened: ["XYZ"] }).warning).toMatch(/Unknown gen-ed codes: XYZ/);
  });

  it("caps the list and says how many matched", () => {
    const r = searchCourses(index, meta, SITE, { subject: "CS", limit: 3 });
    expect(r.shown).toBe(3);
    expect(r.matches).toBeGreaterThan(3);
    expect(r.courses.map((c) => c.code)).toEqual(["CS 100", "CS 101", "CS 102"]);
  });
});

describe("get_course", () => {
  it("shows next term's sections with CRNs, times, seats and restrictions", () => {
    const c = getCourse(cs124, meta, SITE);
    expect(c.term).toBe("Spring 2027");
    expect(c.sections_total).toBe(cs124.terms["2027-sp"].sections.length);
    expect(c.sections.every((s) => /^\d{5}$/.test(s.crn))).toBe(true);
    const al1 = c.sections.find((s) => s.section === "AL1")!;
    expect(al1).toMatchObject({ crn: "71571", seats: "CrossListOpen (Restricted)", instructors: ["Colleen Lewis"] });
    expect(al1.restrictions).toEqual(["Restricted to Undergrad - Urbana-Champaign.", "Restricted to CS and blended CS majors students."]);
    const dis = c.sections.find((s) => s.section === "AYF")!;
    expect(dis).toMatchObject({ taken_with_a_lecture: true, link_group: "A" });
    expect(dis.meets[0].time).toMatch(/^\d{1,2}:\d{2}[ap]m-\d{1,2}:\d{2}[ap]m$/);
    expect(c.lectures).toBe(3);
    expect(c.average_gpa?.recent).toBeCloseTo(cs124.gpa!.recent!, 2);
    expect(c.links.course_explorer).toBe("https://courses.illinois.edu/schedule/2027/spring/CS/124");
    expect(c.data).toMatchObject({ built_at: meta.built_at, term: "2027-sp" });
  });

  it("lists this term's professors first, with GPA and ratings", () => {
    const c = getCourse(cs124, meta, SITE);
    expect(c.instructors[0]).toMatchObject({ name: "Colleen Lewis", teaching_this_term: true });
    expect(c.instructors.find((p) => p.name === "Geoffrey Challen")).toMatchObject({ teaching_this_term: false });
  });

  it("takes another term, lectures only and a section cap", () => {
    expect(getCourse(cs124, meta, SITE, { term: "2026-fa" }).term).toBe("Fall 2026");
    const lec = getCourse(cs124, meta, SITE, { lectures_only: true });
    expect(lec.sections.map((s) => s.section)).toEqual(["AL1", "AL2", "WWC"]);
    const two = getCourse(cs124, meta, SITE, { max_sections: 2 });
    expect([two.sections.length, two.sections_shown, two.sections_total]).toEqual([2, 2, 10]);
  });

  it("says so when the term asked for isn't in the data", () => {
    const c = getCourse(cs124, meta, SITE, { term: "2025-fa" });
    expect(c.term).toBeNull();
    expect(c.sections).toEqual([]);
    expect(c.warning).toMatch(/No sections for Fall 2025. Terms in the data: Fall 2026, Spring 2027/);
    expect(pickTerm({ ...cs124, terms: {} }, meta)).toBeNull();
  });
});

describe("find_geneds", () => {
  it("ranks by the site's best-pick score by default", () => {
    const r = findGeneds(geneds, meta, SITE, { gened: ["QR1"] });
    expect(r.matches).toBeGreaterThan(3);
    expect(r.ranked_by).toMatch(/best-pick score/);
    const scores = r.courses.map((c) => c.best_pick_score ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const c of r.courses) {
      expect(c.counts_for).toContain("QR1 (Quantitative Reasoning I)");
      expect(c.gpa_students).toBeGreaterThanOrEqual(200); // the site's default floor
      expect(c.open_lectures).toBeGreaterThan(0); // seats are published in the saved data
    }
    expect(r.gened_finder_url).toBe(`${SITE}/geneds/?codes=QR1`);
  });

  it("takes categories, the GPA floor, open seats and other sorts", () => {
    const strict = findGeneds(geneds, meta, SITE, { gened: ["QR1"] }).matches;
    expect(findGeneds(geneds, meta, SITE, { gened: ["QR1"], min_gpa_students: 0, open_only: false }).matches).toBeGreaterThan(strict);
    const both = findGeneds(geneds, meta, SITE, { gened: ["HUM", "NW"], min_gpa_students: 0, limit: 100 });
    expect(both.matches).toBeGreaterThan(0);
    expect(both.courses.every((c) => c.counts_for.some((x) => x.startsWith("LA")) && c.counts_for.some((x) => x.startsWith("NW")))).toBe(true);
    expect(both.gened_finder_url).toBeUndefined(); // the site's URL takes codes, not categories
    const byGpa = findGeneds(geneds, meta, SITE, { gened: ["QR1"], sort: "gpa", limit: 100 }).courses.map((c) => c.average_gpa ?? -1);
    expect(byGpa).toEqual([...byGpa].sort((a, b) => b - a));
  });

  it("falls back to GPA when the build has no score priors", () => {
    const r = findGeneds(geneds, { ...meta, score_priors: null }, SITE, { gened: ["QR1"] });
    expect(r.ranked_by).toBe("recent average GPA");
  });
});

describe("build_schedules (#100)", () => {
  const course = (code: string) => read<Course>(`course/${code.replace(" ", "/")}.json`);
  const build = (codes: string[], a: Omit<BuildArgs, "courses"> = {}) => buildSchedules(codes.map((c) => ({ course: course(c) })), [], meta, SITE, { courses: codes, ...a });
  const ctx = { rmpPrior: meta.score_priors?.rmp.quality ?? null, priors: meta.score_priors ?? null, weights: DEFAULT_WEIGHTS, me: NOBODY };
  /** The schedule builder on the site for these courses, locks and rules, run with the builder's own code. */
  const site = (cart: string, prefs: Prefs, term = meta.next_term) =>
    generate(
      decodeCart(cart).map((c) => courseInput(`${c.s} ${c.n}`, course(`${c.s} ${c.n}`), c.locked, term, ctx)),
      term,
      prefs,
    ).schedules;
  const crns = (s: { bundles: { crns: string[] }[] }) => s.bundles.flatMap((b) => b.crns);
  const crnOf = (code: string, section: string) => course(code).terms[meta.next_term].sections.find((s) => s.code === section)!.crn;

  it("reads times and days the way people write them", () => {
    expect(["10am", "10:30 AM", "2pm", "2:30 p.m.", "14:30", "5:00", "12pm", "12am", "9"].map(parseClock)).toEqual([600, 630, 840, 870, 870, 1020, 720, 0, 540]);
    expect(["25:00", "10:75", "13pm", "noon", ""].map(parseClock)).toEqual([null, null, null, null, null]);
    expect(["F", "Fri", "friday", "MWF", "tr", "Th", "Thursday", "Tue", "weekend"].map(parseDays)).toEqual([16, 16, 16, 21, 10, 8, 8, 2, null]);
  });

  it("turns must-haves and priorities into the site's rules", () => {
    const { prefs, problems } = prefsOf({
      courses: [],
      no_classes_before: "10am",
      done_by: "5pm",
      days_off: ["F", "Monday"],
      lunch_break: { from: "11:30am", to: "1:30pm", minutes: 60 },
      blocked_times: [{ days: "TR", from: "5pm", to: "7pm" }],
      open_sections_only: true,
      what_matters: { preset: "sleep", gpa: 3, too_early_before: "11am" },
    });
    expect(problems).toEqual([]);
    expect(prefs).toEqual({
      ...DEFAULT_PREFS,
      earliest: 600,
      latest: 1020,
      daysOff: 17,
      lunch: true,
      lunchFrom: 690,
      lunchTo: 810,
      lunchMin: 60,
      blocked: [{ d: 10, s: 1020, e: 1140 }],
      openOnly: true,
      softEarly: 660,
      weights: { gpa: 3, rmp: 1, early: 3, late: 0, daysOff: 1, compact: 1, walking: 1, open: 1, prof: 1 },
    });
    const bad = prefsOf({ courses: [], no_classes_before: "noon", days_off: ["Sat"], lunch_break: { from: "1pm", to: "1:15pm", minutes: 45 } });
    expect(bad.problems).toHaveLength(3);
    expect(bad.prefs.lunchFrom).toBe(DEFAULT_PREFS.lunchFrom); // a window that can't hold the break: the site's default
  });

  // three sample carts: the top schedules and their order are the site's, and each link reproduces its schedule
  const samples: [string, string[], Omit<BuildArgs, "courses">, Prefs][] = [
    ["defaults", ["CS 124", "STAT 100"], {}, DEFAULT_PREFS],
    ["no class before 10am, a lunch break", ["CS 124", "STAT 100", "MATH 231"], { no_classes_before: "10am", lunch_break: true }, { ...DEFAULT_PREFS, earliest: 600, lunch: true }],
    [
      "open sections only, Sleep in",
      ["PSYC 100", "MATH 231", "ADV 250", "CS 124"],
      { open_sections_only: true, what_matters: { preset: "sleep" } },
      { ...DEFAULT_PREFS, openOnly: true, weights: { gpa: 1, rmp: 1, early: 3, late: 0, daysOff: 1, compact: 1, walking: 1, open: 1, prof: 1 } },
    ],
  ];
  for (const [name, codes, args, prefs] of samples)
    it(`same schedules as the site: ${name}`, () => {
      const r = build(codes, { ...args, limit: 5 });
      const expected = site(codes.map((c) => c.replace(" ", "")).join(","), prefs);
      expect(r.schedules.length).toBeGreaterThan(1);
      expect(r.schedules.map((s) => s.crns)).toEqual(expected.slice(0, 5).map(crns));
      r.schedules.forEach((s, i) => {
        const u = new URL(s.open_on_site);
        expect(u.origin + u.pathname).toBe(`${SITE}/schedule/`);
        expect(u.searchParams.get("i")).toBe(String(i));
        const fromLink = site(u.searchParams.get("c")!, prefsFromParams(u.searchParams), u.searchParams.get("t")!);
        expect(crns(fromLink[i])).toEqual(s.crns);
      });
      expect(r.schedules[0]).toMatchObject({ rank: 1, summary: expect.stringContaining("Expected GPA") });
      expect(r.schedules[0].sections.length).toBe(r.schedules[0].crns.length);
    });

  it("keeps locked sections in every schedule and goes into the link", () => {
    const lec = crnOf("MATH 231", "CL2");
    const r = build(["MATH 231", "STAT 100"], { locked_crns: [lec, "99999"] });
    expect(r.schedules.every((s) => s.crns.includes(lec))).toBe(true);
    expect(r.courses[0]).toEqual({ code: "MATH 231", locked_crns: [lec] });
    expect(new URL(r.schedules[0].open_on_site).searchParams.get("c")).toBe(`MATH231!${lec},STAT100`);
    expect(r.warnings).toEqual([expect.stringMatching(/^locked_crns: 99999 isn't a section of MATH 231, STAT 100 in Spring 2027/)]);
  });

  it("says why nothing fits", () => {
    const clash = build(["PSYC 100", "MATH 231"], { locked_crns: [crnOf("PSYC 100", "C4"), crnOf("MATH 231", "AD@")] });
    expect(clash.schedules).toEqual([]);
    expect(clash.why_no_schedule!.join(" ")).toMatch(/locked PSYC 100 C4 .* overlaps your locked MATH 231 AD@/);
    const busy = build(["CS 124", "PSYC 100"], { days_off: ["M", "W", "F"], no_classes_before: "6pm" });
    expect(busy.cannot_schedule!.map((c) => c.course)).toContain("PSYC 100");
    expect(busy.cannot_schedule!.find((c) => c.course === "PSYC 100")!.why).toMatch(/must-haves/);
  });

  it("reports the term, the build and arguments it couldn't use", () => {
    const r = build(["STAT 100"], { term: "spring", done_by: "after lunch" });
    expect(r.term).toBe("Spring 2027");
    expect(r.data.built_at).toBe(meta.built_at);
    expect(r.warnings).toHaveLength(2);
  });
});
