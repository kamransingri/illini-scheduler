import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Course, GenedRow, Meta, SearchIndex } from "../../web/lib/types";
import { creditRange, findGeneds, genedsMatch, getCourse, pickTerm, searchCourses, termInfo } from "../src/tools";

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
