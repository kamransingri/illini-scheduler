import { describe, expect, it } from "vitest";
import { allCredits, apCredit, creditCourses, decodeAp, decodeIb, encodeAp, encodeIb, ibCredit, isGrainger, nextTable, pickIbYear, pickYear, subOptions, type ApExam, type ApRow, type ApTable, type ApYear } from "@/lib/apcredit";
import { evaluate, hoursSoFar, parseHours, selectorMatches, type Degree, type DegreeCourse, type DegreeGroup } from "@/lib/degree";
import { decodeState, EMPTY, encodeState, stateFromParams, stateToParams, type MyState } from "@/lib/mycourses";

const row = (p: Partial<ApRow> & { scores: number[]; credit: [string, number][] }): ApRow => ({ sub: null, college: null, with: null, message: null, fix: null, ...p });
const exam = (id: string, name: string, rows: ApRow[], sub: string | null = null): ApExam => ({ id, name, sub, notes: [], rows });

// A slice of the 2026-2027 table (data/ap-credit/2026-2027.yaml)
const Y26: ApYear = {
  id: "2026",
  label: "2026-2027",
  entering: "Summer 2026, Fall 2026 or Spring 2027",
  source: "https://citl.illinois.edu/current-cutoff-scores",
  read_on: "2026-11-17",
  notes: [],
  unknown: [],
  exams: [
    exam("CALCAB", "Calculus AB", [
      row({ scores: [3], college: "other", credit: [["MATH 234", 4]], message: "Talk with your advisor. If your program requires MATH 220 or MATH 221, you will not receive credit towards graduation for MATH 234." }),
      row({ scores: [4, 5], college: "other", credit: [["MATH 220", 5]], message: "Placed into MATH 231" }),
      row({ scores: [3], college: "grainger", credit: [["MATH 234", 4]], message: "MATH 234 does not satisfy the Calculus I requirement for Grainger Engineering majors." }),
      row({ scores: [4], college: "grainger", credit: [["MATH 220", 5]], message: "Grainger Engineering recommends taking MATH 221." }),
      row({ scores: [5], college: "grainger", credit: [["MATH 220", 5]] }),
    ]),
    exam(
      "CALCBC",
      "Calculus BC",
      [
        row({ scores: [3], sub: [0, 1, 2, 3], credit: [["MATH 234", 4]] }),
        row({ scores: [3], sub: [4, 5], credit: [["MATH 220", 5]] }),
        row({ scores: [4, 5], credit: [["MATH 220", 5], ["MATH 231", 3]], message: "Placed into MATH 241" }),
      ],
      "Calculus AB subscore",
    ),
    exam("MUSTH", "Music Theory", [row({ scores: [4], sub: [1, 2, 3], credit: [["MUS 101", 2]] }), row({ scores: [4], sub: [4, 5], credit: [["MUS 101", 2], ["MUS 102", 2]] })], "Aural subscore"),
    exam("ENGLANG", "English Language and Composition", [row({ scores: [3], credit: [["RHET 1--", 3]] }), row({ scores: [4, 5], credit: [["RHET 105", 4]] })]),
    exam("ENGLIT", "English Literature and Composition", [
      row({ scores: [3], credit: [["RHET 1--", 3]] }),
      row({ scores: [4, 5], with: { ENGLANG: [0, 1, 2, 3] }, credit: [["RHET 105", 4]] }),
      row({ scores: [4, 5], with: { ENGLANG: [4, 5] }, credit: [["RHET 105", 4], ["ENGL 1--", 3]] }),
    ]),
    exam("FR", "French Language and Culture", [row({ scores: [4], credit: [["FR 203", 4], ["FR 204", 4], ["FR 205", 2]] })]),
    exam("GER", "German Language and Culture", [row({ scores: [1, 2], credit: [], message: "Take the UIUC German Placement Test." })]),
  ],
};
const TABLE: ApTable = { years: [Y26, { ...Y26, id: "2025", label: "2025-2026" }] };
const credits = (spec: string, grainger = false) => apCredit(Y26, decodeAp(spec), grainger);
const codes = (spec: string, grainger = false) => credits(spec, grainger).credits.map((c) => `${c.code}:${c.hours}`);

describe("AP scores in a link", () => {
  it("round-trips exams, scores and subscores, one score per exam", () => {
    expect(encodeAp(decodeAp("CALCBC-3-4,chem-5,ENGLANG-4"))).toBe("CALCBC-3-4,CHEM-5,ENGLANG-4");
    expect(decodeAp("CHEM-3,CHEM-5")).toEqual([{ exam: "CHEM", score: 5, sub: null }]); // the last one wins
    expect(decodeAp("PHYS1-5")).toEqual([{ exam: "PHYS1", score: 5, sub: null }]); // ids can end in a digit
  });

  it("drops what doesn't parse", () => {
    expect(decodeAp("CALCBC-6,CHEM,-4,CALC BC-4,X-4,CHEM-3-9")).toEqual([]);
    expect(decodeAp(null)).toEqual([]);
  });
});

describe("which table and which rows", () => {
  it("uses the entering year asked for, else the newest", () => {
    expect(pickYear(TABLE, "2025")?.label).toBe("2025-2026");
    expect(pickYear(TABLE, "")?.label).toBe("2026-2027");
    expect(pickYear(TABLE, "1999")?.label).toBe("2026-2027");
    expect(pickYear({ years: [] }, "")).toBeNull();
  });

  it("knows Grainger from the program's college", () => {
    expect(isGrainger("The Grainger College of Engineering")).toBe(true);
    expect(isGrainger("Gies College of Business")).toBe(false);
    expect(isGrainger(undefined)).toBe(false);
  });

  it("Calculus credit follows the college", () => {
    expect(codes("CALCAB-4")).toEqual(["MATH 220:5"]);
    expect(credits("CALCAB-4").results[0].row?.message).toBe("Placed into MATH 231");
    expect(credits("CALCAB-4", true).results[0].row?.message).toBe("Grainger Engineering recommends taking MATH 221.");
    expect(codes("CALCAB-3", true)).toEqual(["MATH 234:4"]);
  });

  it("a Calculus BC 3 depends on the AB subscore; no subscore counts as 0", () => {
    const bc = Y26.exams.find((e) => e.id === "CALCBC")!;
    expect(subOptions(bc, 3)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(subOptions(bc, 4)).toEqual([]);
    expect(codes("CALCBC-3-4")).toEqual(["MATH 220:5"]);
    expect(codes("CALCBC-3-2")).toEqual(["MATH 234:4"]);
    expect(codes("CALCBC-3")).toEqual(["MATH 234:4"]); // no subscore given
    expect(codes("CALCBC-4")).toEqual(["MATH 220:5", "MATH 231:3"]);
    expect(credits("CALCBC-3-4").results[0].label).toBe("AP Calculus BC, 3 (Calculus AB subscore: 4)");
  });

  it("Music Theory has no 'no subscore' row, so it waits for one", () => {
    const r = credits("MUSTH-4").results[0];
    expect(r.needsSub).toBe(true);
    expect(r.row).toBeNull();
    expect(codes("MUSTH-4-5")).toEqual(["MUS 101:2", "MUS 102:2"]);
  });

  it("English Literature depends on the English Language score", () => {
    expect(codes("ENGLIT-4")).toEqual(["RHET 105:4"]);
    expect(codes("ENGLIT-4,ENGLANG-2")).toEqual(["RHET 105:4"]);
    // RHET 105 from both exams counts once; ENGL 1-- elective comes with it
    expect(codes("ENGLANG-5,ENGLIT-4")).toEqual(["RHET 105:4", "ENGL 1--:3"]);
    expect(credits("ENGLANG-5,ENGLIT-4").credits[0].from).toEqual(["AP English Language and Composition, 5", "AP English Literature and Composition, 4"]);
  });

  it("elective credit in the same subject from two exams adds up", () => {
    expect(codes("ENGLANG-3,ENGLIT-3")).toEqual(["RHET 1--:6"]);
  });

  it("a score without credit keeps its placement message; an exam missing from the year gives nothing", () => {
    const r = credits("GER-2,CHEM-5");
    expect(r.credits).toEqual([]);
    expect(r.results[0].row?.message).toBe("Take the UIUC German Placement Test.");
    expect(r.results[1].exam).toBeUndefined();
    expect(credits("FR-3").results[0].row).toBeNull(); // no row for a 3 in this slice
  });
});

describe("credits as My courses", () => {
  it("skips switched-off credit and courses the student listed", () => {
    const own = [{ s: "MATH", n: "231", status: "done" as const }];
    const out = creditCourses(credits("CALCBC-5,FR-4").credits, ["FR 204"], own);
    expect(out.map((c) => `${c.s} ${c.n}`)).toEqual(["MATH 220", "FR 203", "FR 205"]);
    expect(out[2]).toEqual({ s: "FR", n: "205", status: "credit", hours: 2, ap: "AP French Language and Culture, 4" });
  });
});

function group(p: Partial<DegreeGroup> & { id: string }): DegreeGroup {
  return { name: p.id, section: "", kind: "program", rule: "all", n: null, hours: null, items: [], from: [], eligible: [], exclude: [], max_hours: {}, min_from: {}, not_with: [], exclusive: null, source: null, notes: [], ...p };
}
const c = (t: string, cr: number, g: string[] = []): DegreeCourse => ({ t, cr: [cr, cr], g, page: true });
const DEG: Degree = {
  id: "t", program: "Test", college: "", catalog_year: "2026-2027", source: "", read_on: "2026-11-17", total_hours: 120, notes: [], unknown: [], double_counting: [],
  groups: [
    group({ id: "calc", rule: "n_of", n: 1, items: [[["MATH 220"]], [["MATH 221"]]] }),
    group({ id: "french", rule: "hours", hours: 10, from: ["FR 200-299"] }),
    group({ id: "rhet-electives", rule: "hours", hours: 6, from: ["RHET 100-199"] }),
    group({ id: "upper", rule: "hours", hours: 3, from: ["RHET 150-199"] }),
  ],
  courses: { "MATH 220": c("Calculus", 5, ["QR1"]), "MATH 221": c("Calculus I", 4, ["QR1"]), "FR 203": c("French III", 4), "FR 204": c("French IV", 4), "FR 205": c("French Conversation", 3) },
};

describe("AP credit in the checklist", () => {
  const ap = (spec: string) => creditCourses(credits(spec).credits, [], []);

  it("counts credited courses as done, at CITL's hours", () => {
    const r = evaluate(DEG, ap("CALCAB-5,FR-4"));
    const res = (id: string) => r.results.find((x) => x.group.id === id)!;
    expect(res("calc").status).toBe("done");
    expect(res("calc").used[0]).toEqual({ code: "MATH 220", status: "credit", hours: 5, ap: "AP Calculus AB, 5" });
    // FR 205 is 3 hours in the catalog but 2 from AP: 4 + 4 + 2 = 10
    expect(res("french").have).toBe(10);
    expect(res("french").used.find((u) => u.code === "FR 205")?.hours).toBe(2);
  });

  it("elective credit fills a range only when the range takes the whole level", () => {
    expect(selectorMatches("RHET 100-199", "RHET 1--", undefined)).toBe(true);
    expect(selectorMatches("RHET 150-199", "RHET 1--", undefined)).toBe(false);
    expect(selectorMatches("ENGL 100-199", "RHET 1--", undefined)).toBe(false);
    const r = evaluate(DEG, ap("ENGLANG-3,ENGLIT-3"));
    expect(r.results.find((x) => x.group.id === "rhet-electives")!.have).toBe(6);
    expect(r.results.find((x) => x.group.id === "upper")!.status).toBe("open");
  });

  it("adds up hours, AP credit at CITL's hours", () => {
    const lookup = (code: string) => (code === "STAT 107" ? ([4, 4] as [number, number]) : code === "CS 199" ? ([1, 4] as [number, number]) : null);
    const mine = [...ap("CALCBC-4,ENGLANG-3"), { s: "STAT", n: "107", status: "done" as const }, { s: "CS", n: "199", status: "in_progress" as const }, { s: "ZZZ", n: "999", status: "done" as const }];
    expect(hoursSoFar(mine, lookup)).toEqual({ done: 5 + 3 + 3 + 4, inProgress: 1, unknown: ["ZZZ 999"], variable: true });
    expect(parseHours("3 OR 4")).toEqual([3, 4]);
    expect(parseHours("1 TO 4")).toEqual([1, 4]);
    expect(parseHours("")).toBeNull();
  });
});

describe("My courses state with AP scores", () => {
  const st: MyState = { ...EMPTY, program: "computer-science-bs", courses: [{ s: "CS", n: "124", status: "done" }], ap: decodeAp("CALCBC-3-4,CHEM-5"), year: "2025", declined: ["MATH 220", "RHET 1--"] };

  it("round-trips through the browser's storage", () => {
    expect(decodeState(encodeState(st))).toEqual(st);
  });

  it("round-trips through the link", () => {
    const params = new URLSearchParams();
    stateToParams(st, params);
    expect(params.toString()).toBe("p=computer-science-bs&m=CS124&a=CALCBC-3-4%2CCHEM-5&y=2025&d=MATH220%2CRHET1--");
    expect(stateFromParams(params)).toEqual(st);
  });

  it("a link with only AP scores is a shared list; old links and old saved lists still open", () => {
    expect(stateFromParams(new URLSearchParams("a=CHEM-5"))?.ap).toEqual([{ exam: "CHEM", score: 5, sub: null }]);
    expect(stateFromParams(new URLSearchParams("p=finance-data-science&m=STAT107"))).toEqual({ ...EMPTY, program: "finance-data-science", courses: [{ s: "STAT", n: "107", status: "done" }] });
    expect(decodeState(JSON.stringify({ c: "STAT107", p: "x", x: [] }))).toEqual({ ...EMPTY, program: "x", courses: [{ s: "STAT", n: "107", status: "done" }] });
    expect(decodeState(JSON.stringify({ c: "", y: "20x6", d: "MATH 2!0" }))).toEqual(EMPTY);
  });

  it("year and declined credit stay out of the link when there are no AP scores", () => {
    const params = new URLSearchParams("y=2025&d=MATH220");
    stateToParams({ ...EMPTY, year: "2025", declined: ["MATH 220"] }, params);
    expect(params.toString()).toBe("");
  });
});

// A slice of the 2026-2027 IB table (data/ib-credit/2026-2027.yaml)
const IB26: ApYear = {
  ...Y26,
  exams: [
    {
      ...exam("ANTH", "Anthropology", [
        row({ level: "HL", scores: [4, 5], credit: [["ANTH 1--", 3]], message: "ANTH 103 or ANTH 230" }),
        row({ level: "HL", scores: [6, 7], credit: [["ANTH 230", 3]], message: "ANTH 270" }),
        row({ level: "SL", scores: [4, 5], credit: [["ANTH 1--", 3]], message: "ANTH 103" }),
        row({ level: "SL", scores: [6, 7], credit: [["ANTH 103", 3]], message: "ANTH 230" }),
      ]),
      levels: ["HL", "SL"],
    },
    { ...exam("ENGLAL", "English A: Literature", [row({ level: "HL", scores: [5, 6, 7], credit: [["RHET 105", 4], ["ENGL 1--", 3]] })]), levels: ["HL"] },
  ],
};

describe("IB credit", () => {
  it("picks the row for the level and the score", () => {
    const sum = ibCredit(IB26, decodeIb("ANTH-SL-6"));
    expect(sum.results[0].label).toBe("IB Anthropology SL, 6");
    expect(sum.credits).toEqual([{ code: "ANTH 103", hours: 3, elective: false, from: ["IB Anthropology SL, 6"] }]);
    expect(ibCredit(IB26, decodeIb("ANTH-HL-6")).credits.map((c) => c.code)).toEqual(["ANTH 230"]);
    // a 3, a level the exam doesn't have, or an exam not in the table gives nothing
    for (const s of ["ANTH-HL-3", "ENGLAL-SL-7", "PHYS-HL-7"]) expect(ibCredit(IB26, decodeIb(s)).credits).toEqual([]);
    expect(ibCredit(IB26, decodeIb("PHYS-HL-7")).results[0].exam).toBeUndefined();
  });

  it("merges with AP credit: the same course counts once, elective credit adds up", () => {
    const ap = apCredit(Y26, decodeAp("ENGLANG-5,ENGLIT-3"), false);
    const ib = ibCredit(IB26, decodeIb("ENGLAL-HL-6"));
    const all = allCredits(ap, ib);
    expect(all.find((c) => c.code === "RHET 105")).toEqual({ code: "RHET 105", hours: 4, elective: false, from: ["AP English Language and Composition, 5", "IB English A: Literature HL, 6"] });
    expect(all.find((c) => c.code === "ENGL 1--")?.hours).toBe(3);
    expect(allCredits(null, ib)).toEqual(ib.credits);
  });

  it("uses the IB table of the AP table's year, or none", () => {
    const table: ApTable = { years: [IB26] };
    expect(pickIbYear(table, Y26)).toBe(IB26);
    expect(pickIbYear(table, { ...Y26, id: "2025" })).toBeNull();
    expect(pickIbYear(table, null)).toBe(IB26);
  });

  it("encodes one score per exam and drops what doesn't parse", () => {
    expect(decodeIb("anth-hl-6,ANTH-SL-7,ECON-XL-5,MATH-HL-8,,PHYS-HL-4")).toEqual([
      { exam: "ANTH", level: "SL", score: 7 },
      { exam: "PHYS", level: "HL", score: 4 },
    ]);
    expect(encodeIb(decodeIb("ANTH-HL-6,MATHAA-SL-5"))).toBe("ANTH-HL-6,MATHAA-SL-5");
  });

  it("IB scores go in the link and in storage; year and declined credit come along", () => {
    const st: MyState = { ...EMPTY, ib: decodeIb("ANTH-HL-6"), year: "2026", declined: ["ANTH 230"] };
    const params = new URLSearchParams();
    stateToParams(st, params);
    expect(params.toString()).toBe("i=ANTH-HL-6&y=2026&d=ANTH230");
    expect(stateFromParams(params)).toEqual(st);
    expect(decodeState(encodeState(st))).toEqual(st);
  });
});

describe("nextTable", () => {
  const Y25: ApYear = { ...Y26, id: "2025", label: "2025-2026", entering: "Summer 2025, Fall 2025 or Spring 2026" };
  const table: ApTable = { years: [Y26, Y25] };

  it("names next year's table and when CITL usually publishes it, for the newest year", () => {
    expect(nextTable(table, Y26)).toEqual({ label: "2027-2028", expected: "the end of April 2027" });
  });

  it("says nothing for an older year, no year, or a label that isn't a year range", () => {
    expect(nextTable(table, Y25)).toBeNull();
    expect(nextTable(table, null)).toBeNull();
    expect(nextTable({ years: [{ ...Y26, label: "2026" }] }, { ...Y26, label: "2026" })).toBeNull();
  });
});
