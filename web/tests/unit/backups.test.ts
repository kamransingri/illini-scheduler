import { describe, expect, it } from "vitest";
import { backupsFor } from "@/lib/backups";
import { DEFAULT_PREFS, generate, type CourseInput, type Prefs } from "@/lib/schedule";
import type { Course, Section } from "@/lib/types";

const M = 1, T = 2, W = 4, R = 8, F = 16;
const TERM = "2027-sp";

let crn = 70000;
/** A section meeting on days `d` from `s` for `len` minutes. */
function sec(code: string, component: string, group: string, d: number, s: number, len = 50, extra: Partial<Section> = {}): Section {
  return {
    crn: String(crn++), code, type: component === "primary" ? "LEC" : component, type_name: component === "primary" ? "Lecture" : "Discussion", component, group, part: "1",
    status: "Open", status_code: "A", credits: "", title: "", text: "", instructors: [], instructors_raw: [], special: "",
    meetings: [{ d, s, e: s + len, b: "Lincoln Hall", r: "1" }], ...extra,
  } as Section;
}
function course(n: string, sections: Section[]): CourseInput {
  const c = {
    subject: "X", number: n, title: "t", subject_name: "", credits: "3 hours.", credit_range: [3, 3], description: "", prereq: "",
    section_info: "", schedule_info: "", latest_term: TERM, geneds: { codes: [], categories: [] }, gpa: null, pattern: null, history: [],
    terms: { [TERM]: { label: "Spring 2027", checked_at: "", source: "", status_known: true, n_primary: 0, n_open: null, sections } },
    instructors: {}, changes: [], biggest_change: null, exam_course: null, notes: [],
  } as unknown as Course;
  return { key: `X ${n}`, course: c, credits: 3, locked: [] };
}
const first = (inputs: CourseInput[], prefs: Prefs = DEFAULT_PREFS) => generate(inputs, TERM, prefs).schedules[0];

describe("registration backups (#75)", () => {
  it("a lecture's backup is another lecture that fits the rest of the week", () => {
    const a = course("101", [sec("A1", "primary", "*", M | W | F, 600), sec("A2", "primary", "*", T | R, 840, 75), sec("A3", "primary", "*", M | W | F, 660)]);
    const b = course("102", [sec("B1", "primary", "*", M | W | F, 660)]); // takes A3's slot
    const s = first([a, b]);
    const A = s.bundles.find((x) => x.course === "X 101")!.sections[0];
    const res = backupsFor(s, [a, b], TERM, DEFAULT_PREFS);
    const forA = res.find((x) => x.section.crn === A.crn)!;
    const codes = forA.backups.map((bk) => bk.changed.map((x) => x.code).join("+"));
    expect(codes).not.toContain(A.code);
    expect(codes).not.toContain("A3"); // clashes with B1
    expect(codes.length).toBeGreaterThan(0);
    expect(forA.none).toBeNull();
  });

  it("a full discussion is replaced by another discussion of the same lecture first", () => {
    const a = course("101", [
      sec("AL1", "primary", "A", M | W, 600, 80),
      sec("AD1", "DIS", "A", F, 600),
      sec("AD2", "DIS", "A", F, 720),
      sec("BL1", "primary", "B", T | R, 600, 80),
      sec("BD1", "DIS", "B", F, 840),
    ]);
    const s = first([a]);
    const cur = s.bundles[0];
    const dis = cur.sections.find((x) => x.component === "DIS")!;
    const lec = cur.sections.find((x) => x.component === "primary")!;
    const res = backupsFor(s, [a], TERM, DEFAULT_PREFS);
    const forDis = res.find((x) => x.section.crn === dis.crn)!;
    // keeps the lecture, changes only the discussion
    expect(forDis.backups[0].changed).toHaveLength(1);
    expect(forDis.backups[0].bundle.crns).toContain(lec.crn);
    // a full lecture needs the other lecture group, with its own discussion
    const forLec = res.find((x) => x.section.crn === lec.crn)!;
    expect(forLec.backups[0].bundle.crns).not.toContain(lec.crn);
    expect(forLec.backups[0].bundle.sections.every((x) => x.group !== lec.group)).toBe(true);
  });

  it("never offers a closed section, a must-have breaker or a clash, and says why when nothing fits", () => {
    const a = course("101", [
      sec("A1", "primary", "*", M | W | F, 600),
      sec("A2", "primary", "*", M | W | F, 660, 50, { status: "Closed" }),
      sec("A3", "primary", "*", T | R, 480, 75), // 8am: breaks "no classes before 9"
      sec("A4", "primary", "*", T | R, 600, 75), // clashes with B1
    ]);
    const b = course("102", [sec("B1", "primary", "*", T | R, 600, 75)]);
    const prefs = { ...DEFAULT_PREFS, earliest: 540 };
    const s = first([a, b], prefs);
    expect(s.bundles.find((x) => x.course === "X 101")!.sections[0].code).toBe("A1");
    const forA = backupsFor(s, [a, b], TERM, prefs).find((x) => x.course === "X 101")!;
    expect(forA.backups).toEqual([]);
    expect(forA.none).toBe("No backup for X 101 A1: of the other options, 1 is closed, 1 clashes with X 102 and 1 breaks a must-have (it starts at 8:00am, before 9:00am).");
  });

  it("a course with a single lecture says so", () => {
    const a = course("101", [sec("A1", "primary", "*", M | W | F, 600)]);
    const s = first([a]);
    expect(backupsFor(s, [a], TERM, DEFAULT_PREFS)[0].none).toBe("X 101 has no other lecture this term.");
  });

  it("locks don't stop backups: a locked section can fill too", () => {
    const a = course("101", [sec("A1", "primary", "*", M | W | F, 600), sec("A2", "primary", "*", T | R, 600, 75)]);
    a.locked = [a.course.terms[TERM].sections[1].crn];
    const s = first([a]);
    expect(s.bundles[0].sections[0].code).toBe("A2");
    expect(backupsFor(s, [a], TERM, DEFAULT_PREFS)[0].backups[0].changed[0].code).toBe("A1");
  });

  it("a live status that says Closed drops the backup (#77)", () => {
    const a = course("101", [sec("A1", "primary", "*", M | W | F, 600), sec("A2", "primary", "*", T | R, 600, 75), sec("A3", "primary", "*", T | R, 840, 75)]);
    const s = first([a]);
    const res = backupsFor(s, [a], TERM, DEFAULT_PREFS);
    const top = res[0].backups[0].changed[0];
    const after = backupsFor(s, [a], TERM, DEFAULT_PREFS, { statusOf: (c) => (c === top.crn ? "Closed" : undefined) });
    expect(after[0].backups.map((bk) => bk.changed[0].crn)).not.toContain(top.crn);
    expect(after[0].backups).toHaveLength(res[0].backups.length - 1);
  });

  it("backups keep the lunch break and fit with every other course", () => {
    const a = course("101", [sec("A1", "primary", "*", M | W | F, 600), sec("A2", "primary", "*", M | W | F, 750), sec("A3", "primary", "*", T | R, 900, 75)]);
    const b = course("102", [sec("B1", "primary", "*", M | W | F, 660)]);
    const prefs = { ...DEFAULT_PREFS, lunch: true, lunchFrom: 660, lunchTo: 840, lunchMin: 60 };
    const s = first([a, b], prefs);
    const forA = backupsFor(s, [a, b], TERM, prefs).find((x) => x.course === "X 101")!;
    // A2 (MWF 12:30) with B1 (MWF 11:00) leaves no free hour between 11 and 2
    expect(forA.backups.map((bk) => bk.changed[0].code)).not.toContain("A2");
  });
});
