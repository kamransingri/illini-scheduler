import { describe, expect, it } from "vitest";
import { groupSections, normCourse, professorsFor, profDomId, tally } from "@/lib/sections";
import type { Course, Instructor, Section } from "@/lib/types";

function sec(crn: string, code: string, component: string, group: string, instructors: string[] = [], status = ""): Section {
  return {
    crn, code, type: component === "primary" ? "LEC" : component, type_name: component === "primary" ? "Lecture" : "Discussion", component, group,
    part: "1", status, status_code: "A", credits: "", title: "", text: "", meetings: [], instructors, instructors_raw: instructors, special: "",
  };
}

const ins = (name: string, withGpa = true): Instructor => ({
  name, teaching: ["2027-sp"], rmp: null, exam: null, tre: [], in_gpa_dataset: withGpa,
  gpa: withGpa ? { avg: 3.2, recent: 3.3, students: 500, n_terms: 4, first_term: "2022-fa", last_term: "2026-sp", delta: 0.1, limited: false, pct: { A: 0.4, B: 0.3, C: 0.2, DF: 0.1, W: 0.02 } } : null,
});

describe("section groups", () => {
  it("groups letter-linked sections and explains what to take", () => {
    const g = groupSections([sec("1", "AL1", "primary", "A"), sec("2", "AD1", "DIS", "A"), sec("3", "BL1", "primary", "B"), sec("4", "BD1", "DIS", "B")]);
    expect(g.map((x) => x.key)).toEqual(["A", "B"]);
    expect(g[0].title).toBe("Group A: AL1");
    expect(g[0].hint).toBe("Take one lecture and one discussion from this group.");
    expect(g[0].sections.map((s) => s.code)).toEqual(["AL1", "AD1"]);
  });
  it("any-with-any and single-component courses", () => {
    expect(groupSections([sec("1", "L1", "primary", "*"), sec("2", "Y01", "DIS", "*")])[0].title).toMatch(/Any lecture with any discussion/);
    const solo = groupSections([sec("1", "A1", "primary", "A1"), sec("2", "A2", "primary", "A2")]);
    expect(solo).toHaveLength(1);
    expect(solo[0].title).toBeNull();
  });
});

describe("professors for a term", () => {
  const course = {
    subject: "CS", number: "124",
    instructors: { "lee|a": ins("Ann Lee"), "ta|b": ins("Bo Ta", false), "old|c": ins("Cy Old") },
    terms: { "2027-sp": { sections: [sec("1", "AL1", "primary", "A", ["lee|a"], "Open"), sec("2", "AL2", "primary", "A", ["lee|a"], "Closed"), sec("3", "AD1", "DIS", "A", ["ta|b"], "Open")] } },
  } as unknown as Course;

  it("lecturers first, discussion leaders apart, past professors only with grade history", () => {
    const r = professorsFor(course, "2027-sp");
    expect(r.profs.map((p) => p.key)).toEqual(["lee|a"]);
    expect(r.assistants.map((p) => p.key)).toEqual(["ta|b"]);
    expect(r.past.map((p) => p.key)).toEqual(["old|c"]);
    expect(r.profs[0].lectures).toBe(2);
    expect(r.profs[0].tally).toEqual({ total: 2, open: 1, restricted: 0, closed: 1, known: true });
  });

  it("tally counts Open (Restricted) as open and knows when status isn't published", () => {
    expect(tally([sec("1", "A", "primary", "A", [], "Open (Restricted)")])).toMatchObject({ open: 1, restricted: 1 });
    expect(tally([sec("1", "A", "primary", "A")]).known).toBe(false);
  });
});

it("normalises RMP course codes and builds safe ids", () => {
  expect(normCourse("CS124")).toBe("CS 124");
  expect(normCourse("stat-107")).toBe("STAT 107");
  expect(profDomId("challen|geoffrey")).toBe("prof-challen-geoffrey");
});
