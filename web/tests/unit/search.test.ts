import { describe, expect, it } from "vitest";
import { parseCode, search } from "@/lib/search";
import type { SearchIndex } from "@/lib/types";

const index: SearchIndex = {
  courses: [
    { s: "CS", n: "124", t: "Introduction to Computer Science I", c: "3", g: ["QR1"], gpa: 3.59, nx: 1, cu: 1 },
    { s: "CS", n: "128", t: "Introduction to Computer Science II", c: "3", g: [], gpa: 3.4, nx: 1, cu: 1 },
    { s: "CS", n: "100", t: "Computer Science Orientation", c: "1", g: [], gpa: 3.9, nx: 0, cu: 1 },
    { s: "MATH", n: "221", t: "Calculus I", c: "4", g: ["QR1"], gpa: 3.1, nx: 0, cu: 1 },
    { s: "CS", n: "12", t: "bogus", c: "", g: [], gpa: null, nx: 0, cu: 0 },
  ],
  instructors: [{ name: "Geoffrey Challen", k: "challen|geoffrey", c: ["CS 124"] }],
};

describe("parseCode", () => {
  it.each(["cs124", "CS 124", " cs  124 ", "Cs124", "cs-124", "CS_124"])("parses %s", (q) => {
    expect(parseCode(q)).toEqual({ subject: "CS", number: "124" });
  });
  it("rejects prose", () => expect(parseCode("intro to cs")).toBeNull());
});

describe("search", () => {
  it("exact code is first", () => {
    expect(search(index, "cs124")[0]).toMatchObject({ kind: "course", course: { s: "CS", n: "124" } });
    expect(search(index, "CS 124")[0]).toMatchObject({ kind: "course", course: { n: "124" } });
  });
  it("title words incl. 'intro'", () => {
    const hits = search(index, "intro to computer science");
    expect(hits[0]).toMatchObject({ kind: "course", course: { n: "124" } });
    expect(hits.map((h) => (h.kind === "course" ? h.course.n : ""))).toContain("128");
  });
  it("instructor by last name", () => {
    expect(search(index, "challen")[0]).toMatchObject({ kind: "instructor", instructor: { k: "challen|geoffrey" } });
  });
  it("subject only lists that subject", () => {
    const hits = search(index, "math");
    expect(hits.every((h) => h.kind === "course" && h.course.s === "MATH")).toBe(true);
  });
  it("empty query", () => expect(search(index, "  ")).toEqual([]));
});
