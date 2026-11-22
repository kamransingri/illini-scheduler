import { describe, expect, it } from "vitest";
import { courseSummary, scheduleSummary } from "@/lib/askai";
import type { Schedule } from "@/lib/schedule";
import type { Course, Section } from "@/lib/types";

// "Ask your AI" (#103): the text a student copies, for a sample course and a sample schedule.
const sec = (crn: string, code: string, component: string, d: number, s: number, who: string[]): Section => ({
  crn, code, type: component === "primary" ? "LEC" : component, type_name: "", component, group: "*", part: "1", status: "Open", status_code: "A",
  credits: "", title: "", text: "", instructors: who, instructors_raw: who, special: "", meetings: [{ d, s, e: s + 50, b: "Siebel Center", r: "1404" }],
});
const COURSE = {
  subject: "CS", number: "124", title: "Introduction to Computer Science I", credits: "3 hours.", credit_range: [3, 3], prereq: "None.",
  geneds: { codes: ["QR1"], categories: [] },
  gpa: { recent: 3.5871, recent_students: 12000 },
  terms: { "2027-sp": { sections: [sec("12345", "AL1", "primary", 1 | 4 | 16, 540, ["challen-g"]), sec("12346", "AYA", "DIS", 2, 600, [])] } },
  instructors: { "challen-g": { name: "Geoffrey Challen", rmp: { rating: 4.42, num_ratings: 210 } } },
} as unknown as Course;

describe("Ask your AI summaries", () => {
  it("a course: GPA, gen eds, prerequisite, lectures with CRN, times, instructor and RMP, and a starter question", () => {
    const t = courseSummary(COURSE, "2027-sp");
    expect(t.split("\n")).toEqual([
      "CS 124: Introduction to Computer Science I (3 hours), University of Illinois Urbana-Champaign.",
      "Average GPA 3.59 over the last 8 fall and spring terms (12000 students).",
      "Gen eds: Quantitative Reasoning I.",
      "Prerequisite: None.",
      "Spring 2027 lectures:",
      "- AL1 (CRN 12345): MWF 9:00am-9:50am, Geoffrey Challen, Rate My Professors 4.4/5 from 210 ratings, Open",
      "From Illini Scheduler (https://kamransingri.github.io/illini-scheduler/course/CS/124/); check Course Explorer before registering.",
      "",
      "Question: Is CS 124 a good fit for me, and which section would you pick? Ask me what you need to know about my goals and schedule.",
    ]);
    expect(courseSummary(COURSE, "2027-fa")).toContain("Not offered in Fall 2027");
  });

  it("a schedule: every section, the stats and the must-haves", () => {
    const s = COURSE.terms["2027-sp"].sections;
    const sched = {
      score: 0,
      bundles: [{ course: "CS 124", sections: s, meetings: [], crns: ["12345", "12346"], gpa: 3.59, rmp: 4.4, prof: null, alternatives: [] }],
      stats: { expectedGpa: 3.587, daysOff: ["Thu"], earliest: 540, latest: 650, gapMinutes: 0, backToBackFar: 0, backToBack: 0, walks: [] },
    } as unknown as Schedule;
    const t = scheduleSummary(sched, "2027-sp", ["start 9:00am or later", "lunch break"], { "CS 124": COURSE });
    expect(t).toContain("- CS 124 AL1 LEC (CRN 12345): MWF 9:00am-9:50am, Geoffrey Challen, Rate My Professors 4.4/5 from 210 ratings");
    expect(t).toContain("- CS 124 AYA DIS (CRN 12346): T 10:00am-10:50am, instructor TBA");
    expect(t).toContain("expected GPA 3.59, Thu off.");
    expect(t).toContain("My must-haves: start 9:00am or later, lunch break.");
    expect(t.trim().endsWith("what should I watch out for?")).toBe(true);
  });
});
