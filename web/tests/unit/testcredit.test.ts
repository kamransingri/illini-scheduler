import { describe, expect, it } from "vitest";
import {
  allCredits,
  apCredit,
  decodeAp,
  decodeTest,
  encodeTest,
  testCredit,
  type ApExam,
  type ApYear,
} from "@/lib/apcredit";
import {
  decodeState,
  EMPTY,
  encodeState,
  stateFromParams,
  stateToParams,
} from "@/lib/mycourses";

// ACT and SAT (#106). Slices of data/test-credit/*.yaml: each row lists every score in its range, as exported.
const span = (lo: number, hi: number, step = 1) =>
  Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step);
const msg = {
  rhet105: "If the EPT is not required, placed into RHET 105.",
  chem: "Students who have ACT Math scores of 25 or below or who have SAT Math scores of 590 or below are recommended to enroll in Chemistry 101 regardless of chemistry placement score.",
};
const row = (
  scores: number[],
  credit: [string, number][],
  message: string | null = null,
) => ({
  scores,
  sub: null,
  college: null,
  with: null,
  credit,
  message,
  fix: null,
});
const exam = (
  id: string,
  name: string,
  rows: ReturnType<typeof row>[],
): ApExam => ({ id, name, sub: null, notes: [], rows });
const tables = (act: number, sat: number): ApExam[] => [
  exam("ACTENG", "ACT English", [
    row(span(act, 36), [["RHET 105", 4]]),
    row(span(20, act - 1), [], msg.rhet105),
  ]),
  exam("SATEBRW", "SAT Evidence-Based Reading and Writing", [
    row(span(sat, 800, 10), [["RHET 105", 4]]),
    row(span(530, sat - 10, 10), [], msg.rhet105),
  ]),
  exam("SATMATH", "SAT Math", [row(span(200, 590, 10), [], msg.chem)]),
];
const base = {
  entering: "",
  source: "https://citl.illinois.edu/current-cutoff-scores",
  read_on: "2026-11-25",
  notes: [],
  unknown: [],
};
const YEARS: Record<string, ApYear> = {
  "2026-2027": {
    ...base,
    id: "2026",
    label: "2026-2027",
    exams: tables(35, 740),
  },
  "2025-2026": {
    ...base,
    id: "2025",
    label: "2025-2026",
    exams: tables(34, 730),
  },
};
const year = (label: string) => YEARS[label];
const credit = (label: string, scores: string) =>
  testCredit(year(label), decodeTest(scores)).credits.map(
    (c) => `${c.code}:${c.hours}`,
  );

describe("ACT and SAT credit", () => {
  it("moves the RHET 105 cutoff each year", () => {
    expect(credit("2026-2027", "ACTENG-35")).toEqual(["RHET 105:4"]);
    expect(credit("2026-2027", "ACTENG-34")).toEqual([]);
    expect(credit("2025-2026", "ACTENG-34")).toEqual(["RHET 105:4"]);
    expect(credit("2026-2027", "SATEBRW-740")).toEqual(["RHET 105:4"]);
    expect(credit("2026-2027", "SATEBRW-730")).toEqual([]);
    expect(credit("2025-2026", "SATEBRW-730")).toEqual(["RHET 105:4"]);
  });

  it("shows the placement and the chemistry note in CITL's words", () => {
    const [eng, math] = testCredit(
      year("2026-2027"),
      decodeTest("ACTENG-25,SATMATH-590"),
    ).results;
    expect(eng.row?.message).toMatch(
      /^If the EPT is not required, placed into RHET 105/,
    );
    expect(math.row?.message).toMatch(/recommended to enroll in Chemistry 101/);
    expect(
      testCredit(year("2026-2027"), decodeTest("SATMATH-600")).results[0].row,
    ).toBeNull();
  });

  it("counts RHET 105 once with AP English Language", () => {
    const ap = apCredit(
      {
        ...year("2026-2027"),
        exams: [
          exam("ENGLANG", "English Language and Composition", [
            row([4, 5], [["RHET 105", 4]]),
          ]),
        ],
      },
      decodeAp("ENGLANG-5"),
      false,
    );
    const both = allCredits(
      ap,
      testCredit(year("2026-2027"), decodeTest("ACTENG-36")),
    );
    expect(both).toEqual([
      {
        code: "RHET 105",
        hours: 4,
        elective: false,
        from: ["AP English Language and Composition, 5", "ACT English, 36"],
      },
    ]);
  });

  it("keeps only scores the test can have, in storage and in the link", () => {
    expect(
      encodeTest(
        decodeTest("acteng-35,SATMATH-605,SATEBRW-900,ACTMATH-0,SATMATH-610"),
      ),
    ).toBe("ACTENG-35,SATMATH-610");
    const st = { ...EMPTY, tests: decodeTest("ACTENG-35"), year: "2025" };
    expect(decodeState(encodeState(st)).tests).toEqual(st.tests);
    const params = new URLSearchParams();
    stateToParams(st, params);
    expect(params.get("t")).toBe("ACTENG-35");
    expect(params.get("y")).toBe("2025");
    expect(stateFromParams(params)?.tests).toEqual(st.tests);
    expect(decodeState(encodeState(EMPTY)).tests).toEqual([]); // old saved lists have no t
  });
});
