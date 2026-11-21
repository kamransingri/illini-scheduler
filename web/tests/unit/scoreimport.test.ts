import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ApYear } from "@/lib/apcredit";
import { detectKind, parseApScores, parseIbResults } from "@/lib/scoreimport";

const root = path.join(__dirname, "../../..");
const fixture = (f: string) => fs.readFileSync(path.join(__dirname, "fixtures/scoreimport", f), "utf8");

// The exam ids and names of a real table; the parser only reads those
function year(file: string): ApYear {
  const yaml = fs.readFileSync(path.join(root, file), "utf8");
  const exams = [...yaml.matchAll(/^ {2}- id: (\S+)\n {4}name: (.+)$/gm)].map(([, id, name]) => ({ id, name: name.replace(/^["']|["']$/g, ""), sub: null, notes: [], rows: [] }));
  return { id: "2026", label: "2026-2027", entering: "", source: "", read_on: "", notes: [], unknown: [], exams };
}
const AP = year("data/ap-credit/2026-2027.yaml");
const IB = year("data/ib-credit/2026-2027.yaml");

describe("parseApScores", () => {
  it("reads every exam, the AB subscore and retakes off College Board's page", () => {
    const r = parseApScores(fixture("ap-college-board.txt"), AP);
    expect(r.found).toEqual([
      { exam: "CALCBC", score: 5, sub: 5 },
      { exam: "CHEM", score: 4, sub: null },
      { exam: "ENGLANG", score: 4, sub: null },
      { exam: "PHYSCM", score: 3, sub: null },
      { exam: "BIO", score: 3, sub: null },
      { exam: "USHIST", score: 5, sub: null },
      { exam: "CSP", score: 4, sub: null },
    ]);
    expect(r.notes).toEqual(["AP Chemistry was taken 2 times (4 in 2025, 3 in 2024). The highest score, 4, is kept."]);
    expect(r.unknown).toEqual(["AP Underwater Basket Weaving"]);
  });

  it("matches short and old names, scores on the same line, and the aural subscore", () => {
    const r = parseApScores(fixture("ap-short-names.txt"), AP);
    expect(r.found).toEqual([
      { exam: "CALCBC", score: 4, sub: 4 },
      { exam: "PHYS1", score: 5, sub: null },
      { exam: "MACRO", score: 3, sub: null },
      { exam: "MUSTH", score: 4, sub: 4 },
      { exam: "SPANLANG", score: 5, sub: null },
      { exam: "GOVUS", score: 4, sub: null },
      { exam: "STAT", score: 5, sub: null },
    ]);
    expect(r.unknown).toEqual([]);
  });

  it("matches every exam name in the AP and IB tables as written", () => {
    expect(parseApScores(AP.exams.map((e) => `AP ${e.name}\n4`).join("\n"), AP).found).toHaveLength(AP.exams.length);
    expect(parseIbResults(IB.exams.map((e) => `${e.name.toUpperCase()} HL 5`).join("\n"), IB).found).toHaveLength(IB.exams.length);
  });
});

describe("parseIbResults", () => {
  it("reads subjects and levels, sets the diploma core apart, and lists unknown subjects", () => {
    const r = parseIbResults(fixture("ib-results.txt"), IB);
    expect(r.found).toEqual([
      { exam: "ENGLAL", level: "SL", score: 6 },
      { exam: "MATHAA", level: "HL", score: 7 },
      { exam: "PHYS", level: "HL", score: 6 },
      { exam: "ECON", level: "HL", score: 5 },
      { exam: "SPANB", level: "SL", score: 6 },
      { exam: "PSYCH", level: "SL", score: 5 },
    ]);
    expect(r.notUsed).toEqual(["THEORY OF KNOWLEDGE B", "EXTENDED ESSAY A", "Total points 41"]);
    expect(r.unknown).toEqual(["SANSKRIT CLASSICAL HL 6"]);
  });
});

it("detectKind tells AP from IB", () => {
  expect(detectKind(fixture("ap-college-board.txt"))).toBe("AP");
  expect(detectKind(fixture("ap-short-names.txt"))).toBe("AP");
  expect(detectKind(fixture("ib-results.txt"))).toBe("IB");
});
