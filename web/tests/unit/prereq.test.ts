import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkPrereq, parsePrereq, renderPrereq } from "@/lib/prereq";

// Labelled by hand before the parser read them (#21; DECISIONS.md D49.5). labelled.json: 100 courses across CS, MATH,
// STAT, ECON and CHEM, picked at random; the parser's rules were written while reading these. heldout.json: 50 courses
// from every other subject, labelled and then read once without changes (44 of 50), then fixed where it was wrong.
// "RAW" means the right answer is to give up; "?" is something the site can't check.
type Labelled = { code: string; text: string; label: string };
const load = (f: string): Labelled[] => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/prereq", f), "utf8"));
const read = (text: string) => renderPrereq(parsePrereq(text).tree);
const have = (...codes: string[]) => new Set(codes);
// correct: the same tree; missing: gave up ("?") where the label has a rule, which is safe; wrong: anything else
const score = (set: Labelled[]) => {
  const rows = set.map((s) => {
    const got = read(s.text);
    return { ...s, got, kind: got === s.label || (s.label === "RAW" && got === "?") ? "correct" : got === "?" ? "missing" : "wrong" };
  });
  return { correct: rows.filter((r) => r.kind === "correct").length, wrong: rows.filter((r) => r.kind === "wrong").map((r) => `${r.code}: got ${r.got}, label ${r.label}`) };
};

describe("reading prerequisites: the hand-labelled samples (#21)", () => {
  it("the 100: none wrong, at least 95 exactly right", () => {
    const s = score(load("labelled.json"));
    expect(s.wrong).toEqual([]);
    expect(s.correct).toBeGreaterThanOrEqual(95);
  });
  it("the 50 held out: the only difference is a stricter reading, never a looser one", () => {
    const s = score(load("heldout.json"));
    // "BADM 346 required for undergraduate students": read as BADM 346 plus something it can't check
    expect(s.wrong).toEqual(["BADM 446: got BADM 346 & ?, label BADM 346"]);
    expect(s.correct).toBe(49);
  });
});

describe("reading prerequisites: the patterns", () => {
  it("semicolons are AND, a clause opening with 'or' is an alternative to everything before it", () => {
    expect(read("CS 125 or CS 128; CS 173 or MATH 213; credit or concurrent enrollment in CS 225.")).toBe("(CS 125 | CS 128) & (CS 173 | MATH 213) & CS 225~");
    expect(read("MATH 241; MATH 314 or MATH 347; or consent of instructor.")).toBe("(MATH 241 & (MATH 314 | MATH 347)) | consent");
  });
  it("lists: 'one of', 'A, B, or C', 'A, B and C', slashes and parentheses", () => {
    expect(read("One of CS 241, CS 341 or ECE 391, or a combination of CS 233 and CS 340.")).toBe("CS 241 | CS 341 | ECE 391 | (CS 233 & CS 340)");
    expect(read("MATH 241, MATH 416, and MATH 461.")).toBe("MATH 241 & MATH 416 & MATH 461");
    expect(read("ECON 202; ECON 302; MATH 220/221 or other Calculus course.")).toBe("ECON 202 & ECON 302 & (MATH 220 | MATH 221 | ?)");
    expect(read("(STAT 440 or STAT 447) and (STAT 420 or STAT 425); or permission of the instructor.")).toBe("((STAT 440 | STAT 447) & (STAT 420 | STAT 425)) | consent");
  });
  it("leaves out recommendations, restrictions and pointers to the section text, and notes the last", () => {
    expect(read("ECON 202; ECON 302; MATH 220/MATH 221 are required. ECON 203; MATH 231 are recommended.")).toBe("ECON 202 & ECON 302 & (MATH 220 | MATH 221)");
    expect(read("MATH 231. Not intended for first-time freshmen.")).toBe("MATH 231");
    expect(parsePrereq("CS 241 or CS 341. Additional prerequisites may be specified each term. See section information.")).toMatchObject({ more: true });
    expect(read("Not intended for Economics majors or minors.")).toBe("NONE");
  });
  it("a sentence that says what can't be taken with it isn't a prerequisite", () => {
    expect(read("STAT 207; one of MATH 220, MATH 221, MATH 234. CS 277 cannot be taken concurrently with CS 225.")).toBe("STAT 207 & (MATH 220 | MATH 221 | MATH 234)");
  });
  it("gives up on a clause it can't read instead of guessing", () => {
    expect(read("One of CS 446 or ECE 449 and one of CS 463 or ECE 424, or equivalent courses, by consent of instructor.")).toBe("?");
    expect(read("CS 225 and CS 233 or CS 341")).toBe("?"); // "A and B or C"
    expect(read("PHYS 102 or PHYS 212, GEOL 107, or consent of instructor.")).toBe("?"); // "(A or B) and C, or D"?
  });
  it("a course named as a yardstick isn't required; 'and/or' is or", () => {
    expect(read("One of ACE 240 or FIN 221; or consent of instructor and knowledge of spreadsheet software equivalent to the coverage of ACE 360.")).toBe("ACE 240 | FIN 221 | (consent & ?)");
    expect(read("Audition required and/or consent of instructor.")).toBe("? | consent");
  });
});

describe("checking prerequisites against My courses", () => {
  const cs233 = parsePrereq("CS 125 or CS 128; CS 173 or MATH 213; credit or concurrent enrollment in CS 225.");
  it("AND and OR", () => {
    expect(checkPrereq(cs233, have("CS 128", "MATH 213", "CS 225")).status).toBe("met");
    const no = checkPrereq(cs233, have("CS 128", "CS 225"));
    expect(no).toMatchObject({ status: "no", missing: "CS 173 or MATH 213" });
  });
  it("credit or concurrent enrollment: met if taken at the same time", () => {
    expect(checkPrereq(cs233, have("CS 128", "CS 173"))).toMatchObject({ status: "with", alongside: ["CS 225"] });
  });
  it("AP credit and courses in progress count", () => {
    const stat400 = parsePrereq("MATH 231.");
    expect(checkPrereq(stat400, new Map([["MATH 231", "credit" as const]])).status).toBe("met");
    expect(checkPrereq(stat400, new Map([["MATH 231", "in_progress" as const]])).status).toBe("met");
    expect(checkPrereq(stat400, new Map()).status).toBe("no");
  });
  it("consent and 'or equivalent' make an unmet rule unclear, not unmet", () => {
    const math416 = parsePrereq("MATH 241; MATH 314 or MATH 347; or consent of instructor.");
    expect(checkPrereq(math416, have("MATH 241"))).toMatchObject({ status: "unclear", consent: true });
    expect(checkPrereq(parsePrereq("MATH 241 or equivalent."), have()).status).toBe("unclear");
    expect(checkPrereq(parsePrereq("MATH 241 or equivalent."), have("MATH 241")).status).toBe("met");
    expect(checkPrereq(parsePrereq(""), have()).status).toBe("met");
  });
});
