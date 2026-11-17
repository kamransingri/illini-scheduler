import { describe, expect, it } from "vitest";
import type { DegreeIndex } from "@/lib/degree";
import { byCollege, searchPrograms, words } from "@/lib/programs";

const LAS = "College of Liberal Arts and Sciences";
const ENG = "The Grainger College of Engineering";
const GIES = "Gies College of Business";
const EDU = "College of Education";
const P: DegreeIndex = [
  ["computer-science-bs", "Computer Science, BS", ENG],
  ["computer-science-physics-bs", "Computer Science + Physics, BS", ENG],
  ["statistics-computer-science-bslas", "Statistics & Computer Science, BSLAS", LAS],
  ["crop-sciences-bs", "Crop Sciences, BS", "College of Agricultural, Consumer and Environmental Sciences"],
  ["mechanical-engineering-bs", "Mechanical Engineering, BS", ENG],
  ["bioengineering-bs", "Bioengineering, BS", ENG],
  ["media-cinema-studies-bs", "Media & Cinema Studies, BS", "College of Media"],
  ["mcb-bslas", "Molecular & Cellular Biology, BSLAS", LAS],
  ["economics-balas", "Economics, BALAS", LAS],
  ["secondary-education-bs", "Secondary Education, BS", EDU],
  ["accountancy-bs", "Accountancy, BS", GIES],
  ["finance-data-science", "Finance + Data Science, BS", GIES],
  ["political-science-balas-law-power", "Political Science: Law & Power, BALAS", LAS],
  ["human-development-family-studies-bs", "Human Development & Family Studies, BS", "College of Agricultural, Consumer and Environmental Sciences"],
].map(([id, program, college]) => ({ id, program, college, catalog_year: "2026-2027", groups: 10 }));

const ids = (q: string) => searchPrograms(P, q).map((p) => p.id);

describe("program search", () => {
  it("normalises case, accents, & and +", () => {
    expect(words("Molecular & Cellular Biology, BSLAS")).toEqual(["molecular", "and", "cellular", "biology", "bslas"]);
    expect(words("  Écon+DS ")).toEqual(["econ", "ds"]);
  });

  it("matches the start of any word, every word of the query", () => {
    expect(ids("finance data")).toEqual(["finance-data-science"]);
    expect(ids("data fin")).toEqual(["finance-data-science"]);
    expect(ids("human development and family")).toEqual(["human-development-family-studies-bs"]);
    expect(ids("human development & family")).toEqual(["human-development-family-studies-bs"]);
    expect(ids("finance physics")).toEqual([]);
    expect(ids("xyz")).toEqual([]);
    expect(ids("   ")).toEqual([]);
  });

  it("CS finds every computer science program, the plain major first, and not Crop Sciences", () => {
    const cs = ids("cs");
    expect(cs[0]).toBe("computer-science-bs");
    expect(cs).toContain("computer-science-physics-bs");
    expect(cs).toContain("statistics-computer-science-bslas");
    expect(cs).not.toContain("crop-sciences-bs");
    expect(ids("computer science")[0]).toBe("computer-science-bs");
  });

  it("acronyms of the name, nicknames and other word endings", () => {
    expect(ids("mcb")).toEqual(["mcb-bslas"]);
    expect(ids("me")[0]).toBe("mechanical-engineering-bs"); // before Media & Cinema Studies
    expect(ids("polisci")).toEqual(["political-science-balas-law-power"]);
    expect(ids("accounting")).toEqual(["accountancy-bs"]);
  });

  it("the college counts, but less than the name", () => {
    const eng = ids("engineering");
    expect(eng.slice(0, 2)).toEqual(["mechanical-engineering-bs", "bioengineering-bs"]); // in the name first
    expect(eng).toContain("computer-science-bs"); // Grainger College of Engineering
    expect(ids("las")).toEqual(expect.arrayContaining(["economics-balas", "mcb-bslas"]));
    expect(ids("gies")).toEqual(["accountancy-bs", "finance-data-science"]);
  });

  it("a short word doesn't match from the middle of another", () => {
    expect(ids("econ")).toEqual(["economics-balas"]); // not "Secondary Education"
  });

  it("browse list: colleges in index order, programs alphabetical", () => {
    const groups = byCollege(P);
    expect(groups[0].college).toBe(ENG);
    expect(groups[0].programs.map((p) => p.program)).toEqual([
      "Bioengineering, BS",
      "Computer Science + Physics, BS",
      "Computer Science, BS",
      "Mechanical Engineering, BS",
    ]);
    expect(groups.flatMap((g) => g.programs)).toHaveLength(P.length);
  });
});
