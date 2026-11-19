import { describe, expect, it } from "vitest";
import { examConflicts, finalsByDay, finalsOf, finalsPending, finalsSummary, whoOffers } from "@/lib/finals";
import type { Bundle, Schedule } from "@/lib/schedule";
import type { Section } from "@/lib/types";

let crn = 50000;
const withFinals = (course: string, fx: Section["fx"]): Bundle =>
  ({
    course,
    sections: [{ crn: String(crn++), code: "AL1", type: "LEC", component: "primary", group: "*", part: "1", meetings: [], instructors: [], instructors_raw: [], fx } as unknown as Section],
    meetings: [],
    crns: [],
    gpa: null,
    rmp: null,
    prof: null,
    alternatives: [],
  }) as Bundle;
const sched = (...bundles: Bundle[]): Schedule => ({ bundles, score: 0, stats: {} as Schedule["stats"] });
const exam = (date: string, s: number, type = "Combined"): [string, number, number, string] => [date, s, s + 180, type];
const kinds = (s: Schedule) => examConflicts(s).map((c) => c.kind);

// Registrar slots: 8:00am (480), 1:30pm (810), 7:00pm (1140)
describe("final exam conflicts (Student Code § 3-201, #84)", () => {
  it("two finals that overlap on the same day", () => {
    const c = examConflicts(sched(withFinals("MATH 221", [exam("2026-12-14", 810), ["2026-12-15", 480, 660, "Conflict"]]), withFinals("CS 124", [["2026-12-14", 900, 1080, "Combined"]])));
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("overlap");
    expect(c[0].text).toMatch(/^Final exams overlap: MATH 221 \(Mon, Dec 14, 1:30pm–4:30pm\) and CS 124 \(3:00pm–6:00pm\)\./);
    expect(c[0].text).toContain("Contact the instructors by the last day of class.");
  });

  it("different days, back-to-back times and make-up ('Conflict') slots don't overlap", () => {
    expect(examConflicts(sched(withFinals("A 1", [exam("2026-12-14", 480)]), withFinals("B 2", [exam("2026-12-15", 480)])))).toEqual([]);
    expect(examConflicts(sched(withFinals("A 1", [["2026-12-14", 480, 660, "Combined"]]), withFinals("B 2", [["2026-12-14", 660, 840, "Combined"]])))).toEqual([]);
    expect(examConflicts(sched(withFinals("A 1", [exam("2026-12-14", 480)]), withFinals("B 2", [["2026-12-14", 480, 660, "Conflict"]])))).toEqual([]);
  });

  it("three finals starting within 24 hours, on one day", () => {
    const s = sched(withFinals("A 1", [exam("2026-12-14", 480)]), withFinals("B 2", [exam("2026-12-14", 810)]), withFinals("C 3", [exam("2026-12-14", 1140)]));
    const [c] = examConflicts(s);
    expect(c.kind).toBe("three-in-24h");
    expect(c.text).toBe(
      "Three finals within 24 hours: A 1 (Mon, Dec 14, 8:00am), B 2 (Mon, Dec 14, 1:30pm) and C 3 (Mon, Dec 14, 7:00pm). " +
        "The Student Code counts this as an exam conflict, so you can ask for a conflict exam; A 1 or B 2 or C 3, whichever has more students, offers it. " +
        "Contact the instructors by the last day of class.",
    );
  });

  it("three finals across midnight count; three spread over 25 hours don't", () => {
    // Mon 7pm, Tue 8am, Tue 1:30pm: 18.5 hours from first to last
    expect(kinds(sched(withFinals("A 1", [exam("2026-12-14", 1140)]), withFinals("B 2", [exam("2026-12-15", 480)]), withFinals("C 3", [exam("2026-12-15", 810)])))).toEqual(["three-in-24h"]);
    // Mon 8am, Mon 7pm, Tue 9am: 25 hours
    expect(kinds(sched(withFinals("A 1", [exam("2026-12-14", 480)]), withFinals("B 2", [exam("2026-12-14", 1140)]), withFinals("C 3", [exam("2026-12-15", 540)])))).toEqual([]);
  });

  it("exactly 24 hours is flagged as a question for the instructors, not a sure conflict", () => {
    const s = sched(withFinals("A 1", [exam("2026-12-14", 480)]), withFinals("B 2", [exam("2026-12-14", 1140)]), withFinals("C 3", [exam("2026-12-15", 480)]));
    const [c] = examConflicts(s);
    expect(c.kind).toBe("exactly-24h");
    expect(c.text).toContain("ask your instructors whether this counts");
    expect(finalsSummary(s)).toBe("2 on Mon"); // not counted as a conflict in the table
  });

  it("four finals in a day are one conflict, listed together", () => {
    const s = sched(
      withFinals("A 1", [exam("2026-12-14", 480)]),
      withFinals("B 2", [exam("2026-12-14", 720)]),
      withFinals("C 3", [exam("2026-12-14", 900)]),
      withFinals("D 4", [exam("2026-12-14", 1140)]),
    );
    const c = examConflicts(s).filter((x) => x.kind === "three-in-24h");
    expect(c).toHaveLength(1);
    expect(c[0].exams.map((x) => x.course)).toEqual(["A 1", "B 2", "C 3", "D 4"]);
    expect(c[0].text).toMatch(/^4 finals within 24 hours/);
  });

  it("the course with the combined-section exam is the one to offer the conflict exam", () => {
    const s = sched(withFinals("A 1", [exam("2026-12-14", 480, "Non Combined")]), withFinals("B 2", [exam("2026-12-14", 480, "Combined")]));
    expect(examConflicts(s)[0].text).toContain("B 2 is the one to offer it");
    expect(whoOffers(finalsOf(sched(withFinals("A 1", [exam("2026-12-14", 480, "Other")]))))).toBeNull();
  });

  it("a course with no final listed is pending, not conflict-free", () => {
    const s = sched(withFinals("A 1", [exam("2026-12-14", 480)]), withFinals("B 2", undefined), withFinals("C 3", [["2026-12-15", 480, 660, "Conflict"]]));
    expect(finalsPending(s)).toEqual(["B 2", "C 3"]);
    expect(finalsSummary(sched(withFinals("B 2", undefined)))).toBe("not listed yet");
  });

  it("an extra room for the same exam is one exam, with the exam's own type", () => {
    const s = sched(withFinals("A 1", [["2026-12-17", 1140, 1320, "Extra Space"], ["2026-12-17", 1140, 1320, "Non Combined"]]));
    expect(finalsOf(s)).toHaveLength(1);
    expect(finalsOf(s)[0].type).toBe("Non Combined");
  });

  it("groups by day and summarizes the busiest day", () => {
    const s = sched(withFinals("A 1", [exam("2026-12-15", 480)]), withFinals("B 2", [exam("2026-12-14", 1140)]), withFinals("C 3", [exam("2026-12-15", 1140)]));
    expect(finalsByDay(s).map((d) => [d.date, d.exams.map((x) => x.course)])).toEqual([
      ["2026-12-14", ["B 2"]],
      ["2026-12-15", ["A 1", "C 3"]],
    ]);
    expect(finalsSummary(s)).toBe("2 on Tue");
    expect(finalsSummary(sched(withFinals("A 1", [exam("2026-12-14", 480)]), withFinals("B 2", [exam("2026-12-14", 480)])))).toBe("1 conflict");
  });
});
