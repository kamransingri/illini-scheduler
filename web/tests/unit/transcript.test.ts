import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diffImport, parseTranscript } from "@/lib/transcript";

// Hand-written in the layouts of Self-Service's Academic History and a DARS audit; no real student's record (#20).
// Line endings are normalised, since a Windows checkout gives the fixtures CRLF.
const fixture = (f: string) => fs.readFileSync(path.join(__dirname, "fixtures/transcript", f), "utf8").replace(/\r\n/g, "\n");
const codes = (xs: { s: string; n: string; status: string }[]) => Object.fromEntries(xs.map((c) => [`${c.s} ${c.n}`, c.status]));

describe("reading a transcript or DARS audit (#20)", () => {
  it("reads Self-Service's Academic History: institution, transfer and in-progress sections", () => {
    const r = parseTranscript(fixture("self-service.txt"));
    expect(codes(r.found)).toEqual({
      "MATH 220": "credit", // AP, PS in the transfer section
      "CHEM 102": "credit",
      "CS 100": "done", // S
      "CS 124": "done", // A, and its in-progress retake doesn't undo that
      "MATH 231": "done",
      "RHET 105": "done",
      "CS 128": "done", // a wrapped row: the hours are on the next line
      "PHYS 211": "done", // withdrawn once, then passed
      "STAT 107": "done", // "AH": an honors A
      "MATH 241": "in_progress", // DFR: deferred
      "CS 173": "done", // failed, then passed
      "CS 222": "done", // CR
      "CS 225": "in_progress",
      "MATH 257": "in_progress",
    });
    expect(r.testCredit).toBe(true);
    expect(r.found.find((c) => c.s === "CS" && c.n === "128")).toMatchObject({ grade: "A", term: "Spring 2025" });
    // a passed course hides its failed or withdrawn attempts; elective credit is seen but has no course to add
    expect(r.skipped).toEqual([{ code: "ECON 1--", grade: "PS", term: "Fall 2024", why: "elective credit, not a single course" }]);
    // a malformed grade is reported, not dropped
    expect(r.unreadable).toEqual(["ENG 100 UG Grainger Engineering Orientation ?? 1.000 0.00"]);
  });

  it("reads a DARS audit: term first, grade after the hours, each course once", () => {
    const r = parseTranscript(fixture("dars.txt"));
    expect(codes(r.found)).toEqual({
      "RHET 105": "done",
      "CS 124": "done",
      "CS 128": "done",
      "CS 173": "done",
      "CS 225": "in_progress", // IP
      "MATH 220": "credit", // PS
      "MATH 231": "done",
      "MATH 257": "in_progress",
      "CHEM 102": "credit", // TR
      "PHYS 211": "done",
    });
    expect(r.found.find((c) => c.s === "CS" && c.n === "225")).toMatchObject({ term: "Spring 2026", grade: "IP" });
    // "SELECT FROM: CS 233 CS 341" lists options, not courses taken
    expect(r.found.some((c) => c.n === "233")).toBe(false);
    expect(r.unreadable).toEqual(["FA25 STAT 4 3.0 A MALFORMED NUMBER"]);
    expect(r.testCredit).toBe(false);
  });

  it("lists attempts that don't count, with why", () => {
    const r = parseTranscript("Term: Fall 2025\nCS 233 UG Computer Architecture W 0.000 0.00\nCS 357 UG Numerical Methods I F 3.000 0.00\nMUS 132 UG Music Theory AU 0.000 0.00");
    expect(r.found).toEqual([]);
    expect(r.skipped.map((s) => [s.code, s.why, s.term])).toEqual([
      ["CS 233", "withdrawn", "Fall 2025"],
      ["CS 357", "failed", "Fall 2025"],
      ["MUS 132", "audited", "Fall 2025"],
    ]);
  });

  it("finds nothing in text that isn't a transcript", () => {
    expect(parseTranscript("Dear student,\nYour registration time is 8:00 AM.\n")).toEqual({ found: [], skipped: [], unreadable: [], testCredit: false });
  });
});

describe("what applying it would change", () => {
  it("adds new courses, updates statuses, and keeps courses the paste doesn't list", () => {
    const { found } = parseTranscript("Term: Fall 2025\nCS 124 UG Intro A 3.000 12.00\nCS 128 UG Intro II B 3.000 9.00\nCOURSES IN PROGRESS\nCS 225 UG Data Structures 4.000");
    const d = diffImport(found, [
      { s: "CS", n: "128", status: "in_progress" },
      { s: "CS", n: "124", status: "done" },
      { s: "PHYS", n: "211", status: "credit" },
    ]);
    expect(d.adds.map((c) => `${c.s} ${c.n}`)).toEqual(["CS 225"]);
    expect(d.changes.map((c) => [`${c.course.s} ${c.course.n}`, c.from, c.course.status])).toEqual([["CS 128", "in_progress", "done"]]);
    expect(d.same.map((c) => c.n)).toEqual(["124"]);
    expect(d.notListed).toEqual(["PHYS 211"]);
  });
});
