import fs from "node:fs";
import path from "node:path";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { buildIcs, fold } from "@/lib/ics";
import {
  backToBack,
  clashingPairs,
  explainEmpty,
  buildBundles,
  DEFAULT_PREFS,
  generate,
  isValidBundle,
  meetingsConflict,
  type CourseInput,
} from "@/lib/schedule";
import type { Course, Section } from "@/lib/types";

const M = 1, T = 2, W = 4, R = 8, F = 16;
const mt = (d: number, s: number, e: number, part = "1") => ({ d, s, e, part });

describe("conflicts", () => {
  it("overlapping times on shared days conflict", () => {
    expect(meetingsConflict(mt(M | W | F, 600, 650), mt(W, 630, 700))).toBe(true);
  });
  it("same times on different days don't", () => {
    expect(meetingsConflict(mt(M | W | F, 600, 650), mt(T | R, 600, 650))).toBe(false);
  });
  it("MWF vs TR never conflict", () => {
    expect(meetingsConflict(mt(M | W | F, 540, 1200), mt(T | R, 540, 1200))).toBe(false);
  });
  it("10:00-10:50 and 10:50-11:40 are back-to-back but not a conflict", () => {
    const a = mt(M, 600, 650), b = mt(M, 650, 700);
    expect(meetingsConflict(a, b)).toBe(false);
    expect(backToBack(a, b)).toBe(true);
  });
  it("first-half and second-half sections don't conflict", () => {
    expect(meetingsConflict(mt(M, 600, 650, "A"), mt(M, 600, 650, "B"))).toBe(false);
    expect(meetingsConflict(mt(M, 600, 650, "1"), mt(M, 600, 650, "B"))).toBe(true);
  });
  it("online / arranged never conflict", () => {
    expect(meetingsConflict({ d: 0, s: null, e: null, part: "1" }, mt(M, 600, 650))).toBe(false);
  });
});

// ---- synthetic courses ------------------------------------------------------------------------------------
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const DAYS = [M | W | F, T | R, M | W, W, F, T, R];
let crn = 10000;

function sec(code: string, component: string, group: string, online = false): Section {
  const s = 480 + 30 * Math.floor(rnd() * 20);
  const len = pick([50, 80, 110]);
  return {
    crn: String(crn++), code, type: component === "primary" ? "LEC" : component, type_name: "", component, group, part: pick(["1", "1", "1", "A", "B"]),
    status: "", status_code: "A", credits: "", title: "", text: "", instructors: [], instructors_raw: [], special: "",
    meetings: [online ? { d: 0, s: null, e: null, b: "", r: "" } : { d: pick(DAYS), s, e: s + len, b: "Lincoln Hall", r: "1" }],
  };
}

function randomCourse(i: number): Course {
  const kind = Math.floor(rnd() * 3);
  const sections: Section[] = [];
  if (kind === 0) for (let k = 0; k < 1 + Math.floor(rnd() * 6); k++) sections.push(sec(`A${k}`, "primary", "*", rnd() < 0.1));
  else if (kind === 1) {
    for (const g of ["A", "B"].slice(0, 1 + Math.floor(rnd() * 2))) {
      sections.push(sec(`${g}L1`, "primary", g));
      for (let k = 0; k < 1 + Math.floor(rnd() * 5); k++) sections.push(sec(`${g}D${k}`, "DIS", g));
    }
  } else {
    for (let k = 0; k < 1 + Math.floor(rnd() * 2); k++) sections.push(sec(`L${k}`, "primary", "*"));
    for (let k = 0; k < 1 + Math.floor(rnd() * 4); k++) sections.push(sec(`Y${k}`, "LBD", "*"));
  }
  return {
    subject: "X", number: String(100 + i), title: "t", subject_name: "", credits: "3 hours.", credit_range: [3, 3], description: "", prereq: "",
    section_info: "", schedule_info: "", latest_term: "2027-sp", geneds: { codes: [], categories: [] }, gpa: null, pattern: null, history: [],
    terms: { "2027-sp": { label: "Spring 2027", checked_at: "", source: "", status_known: false, n_primary: 0, n_open: null, sections } },
    instructors: {}, changes: [], biggest_change: null, exam_course: null, notes: [],
  };
}

describe("generator properties", () => {
  it("1,000 random carts: every schedule is conflict-free and every bundle valid", () => {
    let schedules = 0;
    for (let cart = 0; cart < 1000; cart++) {
      const n = 1 + Math.floor(rnd() * 5);
      const inputs: CourseInput[] = Array.from({ length: n }, (_, i) => {
        const c = randomCourse(i);
        return { key: `X ${c.number}`, course: c, credits: 3, locked: [] };
      });
      const res = generate(inputs, "2027-sp", DEFAULT_PREFS, 50);
      for (const s of res.schedules) {
        schedules++;
        expect(s.bundles.length).toBe(n - res.emptyCourses.length);
        const all = s.bundles.flatMap((b) => b.meetings);
        for (let i = 0; i < all.length; i++)
          for (let j = i + 1; j < all.length; j++) if (all[i].course !== all[j].course) expect(meetingsConflict(all[i], all[j])).toBe(false);
        for (const b of s.bundles) {
          const course = inputs.find((x) => x.key === b.course)!.course;
          expect(isValidBundle(b.sections, course.terms["2027-sp"].sections)).toBe(true);
        }
      }
    }
    expect(schedules).toBeGreaterThan(1000);
  });

  it("respects hard prefs: no 8am, no Friday, blocked times, locked CRN", () => {
    for (let k = 0; k < 200; k++) {
      const inputs: CourseInput[] = [0, 1, 2].map((i) => {
        const c = randomCourse(i);
        return { key: `X ${c.number}`, course: c, credits: 3, locked: [] };
      });
      const lockSec = inputs[0].course.terms["2027-sp"].sections.find((s) => s.component === "primary")!;
      inputs[0].locked = [lockSec.crn];
      const prefs = { ...DEFAULT_PREFS, earliest: 540, noFriday: true, blocked: [{ d: T, s: 720, e: 840 }] };
      const res = generate(inputs, "2027-sp", prefs);
      for (const s of res.schedules) {
        for (const m of s.bundles.flatMap((b) => b.meetings)) {
          if (m.s === null) continue;
          expect(m.s).toBeGreaterThanOrEqual(540);
          expect(m.d & F).toBe(0);
          expect(meetingsConflict(m, { d: T, s: 720, e: 840, part: "1" })).toBe(false);
        }
        if (!res.emptyCourses.includes(inputs[0].key)) expect(s.bundles.find((b) => b.course === inputs[0].key)!.crns).toContain(lockSec.crn);
      }
    }
  });

  it("STAT 107-style any-lecture-any-lab and grouped AL/AD bundles", () => {
    const lec = sec("AL1", "primary", "A"), dis = sec("AD1", "DIS", "A"), lec2 = sec("BL1", "primary", "B"), dis2 = sec("BD1", "DIS", "B");
    const bs = buildBundles([lec, dis, lec2, dis2], "X 1");
    for (const b of bs) expect(new Set(b.map((s) => s.group)).size).toBe(1);
  });
});

// ---- real data ---------------------------------------------------------------------------------------------
const DATA = path.join(__dirname, "../../public/data/course");
const real = (s: string, n: string): Course | null => {
  const p = path.join(DATA, s, `${n}.json`);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as Course) : null;
};

describe("real data", () => {
  const heavy = [["PHYS", "211"], ["RHET", "105"], ["CHEM", "102"], ["MATH", "231"], ["CS", "124"], ["ECON", "102"]] as const;
  const courses = heavy.map(([s, n]) => real(s, n));
  it.skipIf(courses.some((c) => !c))("6-course heavy cart generates in < 2 s", () => {
    const inputs = courses.map((c) => ({ key: `${c!.subject} ${c!.number}`, course: c!, credits: c!.credit_range[1], locked: [] }));
    const t0 = performance.now();
    const res = generate(inputs, "2027-sp", DEFAULT_PREFS);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(2000);
    expect(res.schedules.length).toBeGreaterThan(0);
  });

  it.skipIf(courses.some((c) => !c))(".ics parses with ical.js and has weekly recurrences", () => {
    const inputs = courses.slice(0, 4).map((c) => ({ key: `${c!.subject} ${c!.number}`, course: c!, credits: 3, locked: [] }));
    const res = generate(inputs, "2027-sp", DEFAULT_PREFS);
    const ics = buildIcs(res.schedules[0], "2027-sp", "Spring 2027", new Date("2026-11-04T00:00:00Z"));
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    const comp = new ICAL.Component(ICAL.parse(ics));
    const events = comp.getAllSubcomponents("vevent");
    expect(events.length).toBeGreaterThan(0);
    for (const ev of events) {
      const e = new ICAL.Event(ev);
      expect(e.isRecurring()).toBe(true);
      expect(ev.getFirstProperty("dtstart")!.getParameter("tzid")).toBe("America/Chicago");
      const it2 = e.iterator();
      let count = 0;
      while (it2.next() && count < 100) count++;
      expect(count).toBeGreaterThan(5);
      expect(count).toBeLessThan(60);
    }
  });
});

describe("ics folding", () => {
  it("folds long lines", () => {
    const long = "DESCRIPTION:" + "x".repeat(200);
    expect(fold(long).split("\r\n ").every((l) => l.length <= 75)).toBe(true);
    expect(fold(long).replace(/\r\n /g, "")).toBe(long);
  });
});

describe("explanations", () => {
  const mk = (n: string, secs: Section[]): CourseInput => {
    const c = randomCourse(0);
    c.number = n;
    c.terms["2027-sp"].sections = secs;
    return { key: `X ${n}`, course: c, credits: 3, locked: [] };
  };
  const fixed = (code: string, comp: string, group: string, d: number, s: number, e: number, special = ""): Section => ({
    ...sec(code, comp, group),
    part: "1",
    special,
    meetings: [{ d, s, e, b: "", r: "" }],
  });
  it("names two courses that always overlap", () => {
    const a = mk("261", [fixed("A", "primary", "*", T | R, 660, 740)]);
    const b = mk("200", [fixed("L1", "primary", "*", T | R, 660, 740)]);
    expect(clashingPairs([a, b], "2027-sp", DEFAULT_PREFS)[0]).toMatch(/X 261 .* always overlaps X 200/);
  });
  it("explains invalid locked combinations", () => {
    const c = mk("231", [fixed("AL1", "primary", "A", M, 600, 650), fixed("AD1", "DIS", "A", T, 600, 650), fixed("CL1", "primary", "C", M, 700, 750), fixed("CD1", "DIS", "C", T, 700, 750)]);
    const [al1, , , cd1] = c.course.terms["2027-sp"].sections;
    c.locked = [al1.crn, cd1.crn];
    expect(explainEmpty(c, "2027-sp", DEFAULT_PREFS)).toMatch(/AL1 \+ CD1 can't be taken together/);
  });
  it("skips special sections unless allowed or locked", () => {
    const c = mk("124", [fixed("WWC", "primary", "W", M, 600, 650, "special")]);
    expect(generate([c], "2027-sp", DEFAULT_PREFS).emptyCourses).toEqual(["X 124"]);
    expect(explainEmpty(c, "2027-sp", DEFAULT_PREFS)).toMatch(/special/);
    expect(generate([c], "2027-sp", { ...DEFAULT_PREFS, includeSpecial: true }).schedules.length).toBe(1);
    c.locked = [c.course.terms["2027-sp"].sections[0].crn];
    expect(generate([c], "2027-sp", DEFAULT_PREFS).schedules.length).toBe(1);
  });
});
