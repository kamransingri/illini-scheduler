import { describe, expect, it } from "vitest";
import { accepts, alsoCounts, canShare, evaluate, hydrate, needText, options, prereqNote, rankCourse, type Degree, type DegreeCourse, type DegreeGroup } from "@/lib/degree";
import { decodeCourses, decodeState, encodeCourses, encodeState, MAX_MINORS, stateFromParams, stateToParams, ticksOf, type MyCourse } from "@/lib/mycourses";
import { DEFAULT_WEIGHTS } from "@/lib/score";

function group(p: Partial<DegreeGroup> & { id: string }): DegreeGroup {
  return { name: p.id, section: "", kind: "program", rule: "all", n: null, hours: null, items: [], from: [], eligible: [], exclude: [], max_hours: {}, min_from: {}, not_with: [], exclusive: null, source: null, notes: [], ...p };
}
const c = (t: string, cr: number, g: string[] = [], extra: Partial<DegreeCourse> = {}): DegreeCourse => ({ t, cr: [cr, cr], g, page: true, ...extra });

const DEG: Degree = {
  id: "t", program: "Test", college: "", catalog_year: "2026-2027", source: "https://catalog.illinois.edu/x", read_on: "2026-11-16", total_hours: 124, notes: [], unknown: [],
  double_counting: [
    { allow: false, within: "cultural-studies", quote: "no single course can fulfill multiple Cultural Studies categories", source: "https://gened.illinois.edu/requirements/" },
    { allow: true, between: ["cultural-studies", "gened"], quote: "These courses may fulfill other curricular requirements", source: "https://gened.illinois.edu/requirements/" },
    { allow: true, between: ["program", "gened"], quote: "Some Gen Ed requirements may be met by courses required and/or electives in the program.", source: "https://catalog.illinois.edu/x" },
  ],
  groups: [
    group({ id: "core", items: [[["ECON 102"]], [["ECON 103"]], [["CMN 101"]]] }),
    group({ id: "fin-req", items: [[["FIN 411"]]] }),
    group({ id: "fin-400", rule: "hours", hours: 6, from: ["FIN 400-499"], exclude: ["FIN 494"], max_hours: { "FIN 490": 3 }, not_with: ["fin-req"] }),
    group({ id: "calc", rule: "n_of", n: 1, items: [[["MATH 220"]], [["MATH 221"]], [["MATH 234"]]] }),
    group({ id: "ds", items: [[["STAT 107"], ["CS 107"]], [["STAT 207"]]] }),
    group({ id: "other-program", rule: "n_of", n: 1, items: [[["STAT 207"]], [["CS 277"]]] }),
    group({ id: "comp1", kind: "gened", rule: "n_of", n: 1, items: [[["RHET 105"]], [["RHET 101", "RHET 102"]]] }),
    group({ id: "sbs", kind: "gened", rule: "hours", hours: 6, from: ["gened:SS"] }),
    group({ id: "hum", kind: "gened", rule: "hours", hours: 6, from: ["gened:HP"], eligible: ["HIST 100", "PHIL 101"] }),
    group({ id: "nw", kind: "gened", rule: "n_of", n: 1, from: ["gened:NW"], exclusive: "cultural-studies", eligible: ["HIST 100"] }),
    group({ id: "us", kind: "gened", rule: "n_of", n: 1, from: ["gened:US"], exclusive: "cultural-studies" }),
    group({ id: "qr", kind: "gened", rule: "n_of", n: 2, from: ["gened:QR1", "gened:QR2"], min_from: { "gened:QR1": 1 } }),
    group({ id: "lang", kind: "gened", rule: "manual", notes: ["third semester"] }),
  ],
  courses: {
    "ECON 102": c("Micro", 3, ["SS"]),
    "ECON 103": c("Macro", 3, ["SS"]),
    "CMN 101": c("Public Speaking", 3),
    "FIN 411": c("Investments", 3),
    "FIN 412": c("Options", 3),
    "FIN 490": c("Special Topics", 1, [], { cr: [1, 4] }),
    "FIN 494": c("Senior Research", 3),
    "MATH 220": c("Calculus", 5, ["QR1"]),
    "MATH 221": c("Calculus I", 4, ["QR1"]),
    "MATH 234": c("Calculus for Business", 4, ["QR1"]),
    "STAT 107": c("Data Science Discovery", 4, ["QR1"]),
    "STAT 207": c("Data Science Exploration", 4, ["QR2"]),
    "RHET 101": c("Principles of Writing", 4),
    "RHET 102": c("Principles of Research", 4),
    "HIST 100": c("Global History", 3, ["HP", "NW", "US"], { pre: "" }),
    "PHIL 101": c("Intro Philosophy", 3, ["HP"], { pre: "Credit in PHIL 100 or STAT 107." }),
  },
};
const g = (id: string) => DEG.groups.find((x) => x.id === id)!;
const mine = (s: string): MyCourse[] => decodeCourses(s);

describe("double counting", () => {
  it("follows the quoted rules and says unclear otherwise", () => {
    expect(canShare(g("ds"), g("qr"), DEG.double_counting).allow).toBe(true); // program + gen-ed
    expect(canShare(g("nw"), g("us"), DEG.double_counting).allow).toBe(false); // two Cultural Studies categories
    expect(canShare(g("nw"), g("hum"), DEG.double_counting).allow).toBe(true); // Cultural Studies + another gen-ed
    expect(canShare(g("hum"), g("sbs"), DEG.double_counting).allow).toBe("unclear"); // two other gen-eds
    expect(canShare(g("ds"), g("other-program"), DEG.double_counting).allow).toBe("unclear"); // two program groups
    expect(canShare(g("fin-req"), g("fin-400"), DEG.double_counting).allow).toBe(false); // "four additional"
  });

  // #18: campus policy (EP.17.74 1.8) approves a course for two gen-ed categories only when one is ACP or QR II
  const TWO_CATS = {
    allow: true, between: ["gened", "gened"] as [string, string], approved_for: ["ACP", "QR2"],
    quote: "Individual courses will be approved to satisfy only one General Education requirement except as follows. Exceptions are the Advanced Composition, Quantitative Reasoning II, and the Cultural Studies requirements.",
    source: "https://gened.illinois.edu/faculty-staff/details-criteria/",
  };
  const GE: Degree = {
    ...DEG,
    double_counting: [...DEG.double_counting.slice(0, 2), TWO_CATS, DEG.double_counting[2]],
    groups: [...DEG.groups, group({ id: "acp", kind: "gened", rule: "hours", hours: 3, from: ["gened:ACP"] })],
    courses: {
      ...DEG.courses,
      "HIST 140": c("Western Civ to 1660", 3, ["ACP", "HP"]),
      "PHIL 103": c("Logic and Reasoning", 3, ["HP", "QR2"]),
      "CMN 199": c("Special Topics", 3, ["HP", "SS"]), // sections approved differently; the course-level record shows both
      "ENGL 360": c("Writing", 3, ["ACP"]),
    },
  };
  const ge = (id: string) => GE.groups.find((x) => x.id === id)!;

  it("an ACP or QR II course counts for its other gen-ed category too, quoting the policy", () => {
    const acpHum = canShare(ge("acp"), ge("hum"), GE.double_counting, GE.courses["HIST 140"]);
    expect(acpHum.allow).toBe(true);
    expect(acpHum.rule?.source).toBe("https://gened.illinois.edu/faculty-staff/details-criteria/");
    expect(canShare(ge("hum"), ge("qr"), GE.double_counting, GE.courses["PHIL 103"]).allow).toBe(true);
  });

  it("two categories the policy doesn't let one course combine stay unclear, and so does a call without the course", () => {
    expect(canShare(ge("hum"), ge("sbs"), GE.double_counting, GE.courses["CMN 199"]).allow).toBe("unclear");
    expect(canShare(ge("acp"), ge("hum"), GE.double_counting).allow).toBe("unclear");
    expect(canShare(ge("acp"), ge("hum"), GE.double_counting, GE.courses["ENGL 360"]).allow).toBe("unclear"); // only one category
    // the Cultural Studies rules still come first
    expect(canShare(ge("nw"), ge("us"), GE.double_counting, GE.courses["HIST 100"]).allow).toBe(false);
  });

  it("evaluate: HIST 140 fills Advanced Composition and Humanities; CMN 199 counts once", () => {
    const r = evaluate(GE, mine("HIST140,PHIL103,CMN199"));
    const res = (id: string) => r.results.find((x) => x.group.id === id)!;
    expect(res("acp").status).toBe("done");
    expect(res("acp").used.map((u) => u.code)).toEqual(["HIST 140"]);
    expect(res("hum").used.map((u) => u.code).sort()).toEqual(["HIST 140", "PHIL 103"]);
    expect(res("hum").status).toBe("done");
    expect(res("qr").used.map((u) => u.code)).toEqual(["PHIL 103"]); // QR II, counted for Humanities too
    expect(res("sbs").used.map((u) => u.code)).toEqual(["CMN 199"]);
    const alone = evaluate(GE, mine("CMN199")).results.find((x) => x.group.id === "hum")!;
    expect(alone.used).toEqual([]);
    expect(alone.blocked).toContainEqual(expect.objectContaining({ code: "CMN 199", other: "sbs", verdict: expect.objectContaining({ allow: "unclear" }) }));
  });
});

describe("evaluate", () => {
  it("the same course counts for a program group and a gen-ed when the rules allow it", () => {
    const r = evaluate(DEG, mine("ECON102,ECON103,STAT107,MATH220~c"));
    const res = (id: string) => r.results.find((x) => x.group.id === id)!;
    expect(res("core").status).toBe("partial");
    expect(res("sbs").status).toBe("done"); // ECON 102 + 103 also count as 6 hours of social science
    expect(res("calc").status).toBe("done"); // AP credit counts as completed
    expect(res("qr").status).toBe("done"); // STAT 107 (QR1) + MATH 220 (QR1)
    expect(r.usedBy.get("STAT 107")).toEqual(["ds", "qr"]);
  });

  it("never double counts where the rules say no or don't say", () => {
    const r = evaluate(DEG, mine("HIST100,STAT207"));
    const res = (id: string) => r.results.find((x) => x.group.id === id)!;
    expect(res("nw").status).toBe("done");
    expect(res("us").status).toBe("open"); // HIST 100 is US too, but not two Cultural Studies categories
    expect(res("us").blocked[0]).toMatchObject({ code: "HIST 100", other: "nw" });
    expect(res("hum").used.map((u) => u.code)).toEqual(["HIST 100"]); // Cultural Studies + Humanities is allowed
    expect(res("ds").used.map((u) => u.code)).toEqual(["STAT 207"]);
    expect(res("other-program").status).toBe("open"); // program + program: unclear, so not counted twice
    expect(res("other-program").blocked[0].verdict.allow).toBe("unclear");
  });

  it("hours: ranges, exclusions, caps and 'additional' courses", () => {
    const r = evaluate(DEG, mine("FIN411,FIN412,FIN490,FIN494"));
    const fin = r.results.find((x) => x.group.id === "fin-400")!;
    expect(fin.used.map((u) => u.code)).toEqual(["FIN 412", "FIN 490"]); // 411 is already a required course; 494 excluded
    expect(fin.have).toBe(4); // 3 + FIN 490 at its 1-hour minimum
    expect(fin.hoursCaveat).toBe(true);
    expect(needText(fin)).toBe("2 more hours (4 of 6)");
  });

  it("sequences count as one item; in-progress courses make a group 'in progress'", () => {
    const r = evaluate(DEG, mine("RHET101,RHET102~p"));
    const comp = r.results.find((x) => x.group.id === "comp1")!;
    expect(comp.status).toBe("in_progress");
    expect(comp.used.map((u) => u.code)).toEqual(["RHET 101", "RHET 102"]);
    expect(evaluate(DEG, mine("RHET101")).results.find((x) => x.group.id === "comp1")!.status).toBe("open");
  });

  it("at least one QR1: two QR2-only courses don't finish QR", () => {
    const deg = { ...DEG, courses: { ...DEG.courses, "CS 277": c("Algorithms", 4, ["QR2"]) } };
    const r = evaluate(deg, mine("STAT207,CS277"));
    const qr = r.results.find((x) => x.group.id === "qr")!;
    expect(qr.status).toBe("partial");
    expect(qr.have).toBe(1);
  });

  it("manual groups are done only when ticked", () => {
    expect(evaluate(DEG, []).results.find((x) => x.group.id === "lang")!.status).toBe("open");
    expect(evaluate(DEG, [], ["lang"]).results.find((x) => x.group.id === "lang")!.status).toBe("done");
  });
});

describe("options and marks", () => {
  it("lists what's left, and marks courses that fill two open requirements", () => {
    const ev = evaluate(DEG, mine("STAT107"));
    const hum = ev.results.find((x) => x.group.id === "hum")!;
    const taken = new Set(["STAT 107"]);
    expect(options(hum, DEG, taken)).toEqual(["HIST 100", "PHIL 101"]);
    const marks = alsoCounts("HIST 100", hum.group, ev.results, DEG);
    expect(marks.map((m) => [m.group.id, m.verdict.allow])).toEqual([
      ["nw", true],
      ["us", true],
    ]);
    const calc = ev.results.find((x) => x.group.id === "calc")!;
    expect(options(calc, DEG, taken)).toEqual(["MATH 220", "MATH 221", "MATH 234"]);
    expect(accepts(g("fin-400"), "FIN 494", DEG)).toBe(false);
  });

  it("prerequisite notes only when a named course isn't in My courses", () => {
    expect(prereqNote("Credit in PHIL 100 or STAT 107.", new Set(["STAT 107"]))).toBe("Credit in PHIL 100 or STAT 107.");
    expect(prereqNote("Credit in STAT 107.", new Set(["STAT 107"]))).toBeNull();
    expect(prereqNote("Junior standing.", new Set())).toBe("Junior standing."); // can't verify: show it
    expect(prereqNote("", new Set())).toBeNull();
  });

  it("ranks a course by its best next-term professor", () => {
    const priors = { rmp: { quality: 3.6, difficulty: 2.9, would_take_again: 65 }, subject_gpa: {}, campus_gpa: 3.5 };
    const course = c("X", 3, [], {
      gpa: 3.4, gn: 2000, profs: [
        { k: "a", name: "A", d: -0.2, dn: 800, rmp: null, open: [1, 1] },
        { k: "b", name: "B", d: 0.2, dn: 800, rmp: null, open: [1, 1] },
      ],
    });
    expect(rankCourse("ABC 100", course, priors, DEFAULT_WEIGHTS).best!.name).toBe("B");
    expect(rankCourse("ABC 100", course, null, DEFAULT_WEIGHTS).score).toBeNull();
  });
});

describe("my courses encoding", () => {
  it("round-trips statuses and ignores junk", () => {
    const list = decodeCourses("STAT107,math220~c, CS 124~p,bogus,STAT107~p");
    expect(list).toEqual([
      { s: "STAT", n: "107", status: "done" },
      { s: "MATH", n: "220", status: "credit" },
      { s: "CS", n: "124", status: "in_progress" },
    ]);
    expect(encodeCourses(list)).toBe("STAT107,MATH220~c,CS124~p");
    expect(stateFromParams(new URLSearchParams("p=finance-data-science&m=STAT107&x=language,<bad>"))).toEqual({
      program: "finance-data-science",
      minors: [],
      courses: [{ s: "STAT", n: "107", status: "done" }],
      ticked: ["language"],
      ap: [],
      ib: [],
      year: "",
      declined: [],
      plan: { grad: "", summers: false, terms: {} },
    });
    expect(stateFromParams(new URLSearchParams("q=1"))).toBeNull();
  });

  it("carries an optional minor and its ticked groups in the link and in storage", () => {
    const st = stateFromParams(new URLSearchParams("p=computer-science-bs&mn=nutrition-minor&x=language,nutrition-minor--electives"))!;
    expect(st).toMatchObject({ program: "computer-science-bs", minors: ["nutrition-minor"], ticked: ["language", "nutrition-minor--electives"] });
    expect(stateFromParams(new URLSearchParams("mn=nutrition-minor"))).toMatchObject({ program: "", minors: ["nutrition-minor"] });
    expect(stateFromParams(new URLSearchParams("p=x&mn=<bad>"))!.minors).toEqual([]);
    const params = new URLSearchParams("mn=old-minor");
    stateToParams({ ...st, minors: [] }, params);
    expect(params.has("mn")).toBe(false); // removing the minor drops it from the link
    expect(decodeState(encodeState(st))).toEqual(st);
    expect(decodeState(JSON.stringify({ c: "STAT107", p: "finance-data-science", x: [] })).minors).toEqual([]); // lists saved before minors
  });

  it("opens one-minor links and saved lists from before #111 unchanged", () => {
    // the old tick format, "mn--<group>", belongs to the one minor
    const old = stateFromParams(new URLSearchParams("p=computer-science-bs&mn=nutrition-minor&x=language,mn--electives"))!;
    expect(old).toMatchObject({ minors: ["nutrition-minor"], ticked: ["language", "nutrition-minor--electives"] });
    expect(ticksOf(old.ticked)).toEqual(["language"]);
    expect(ticksOf(old.ticked, "nutrition-minor")).toEqual(["electives"]);
    const saved = decodeState(JSON.stringify({ c: "FSHN220", p: "computer-science-bs", n: "nutrition-minor", x: ["language", "mn--electives"] }));
    expect(saved).toMatchObject({ minors: ["nutrition-minor"], ticked: ["language", "nutrition-minor--electives"] });
    // an old minor tick with no minor picked is dropped, not given to the major
    expect(stateFromParams(new URLSearchParams("p=x&x=language,mn--electives"))!.ticked).toEqual(["language"]);
  });

  it("two minors round-trip, each with its own ticks", () => {
    const st = stateFromParams(new URLSearchParams("p=finance-data-science&mn=history-minor,nutrition-minor&x=language,history-minor--more,nutrition-minor--more"))!;
    expect(st.minors).toEqual(["history-minor", "nutrition-minor"]);
    expect(ticksOf(st.ticked, "history-minor")).toEqual(["more"]);
    expect(ticksOf(st.ticked, "nutrition-minor")).toEqual(["more"]);
    expect(ticksOf(st.ticked)).toEqual(["language"]);
    const params = new URLSearchParams();
    stateToParams(st, params);
    expect(params.get("mn")).toBe("history-minor,nutrition-minor");
    expect(stateFromParams(params)).toEqual(st);
    expect(decodeState(encodeState(st))).toEqual(st);
    // duplicates, junk and a fourth minor are dropped; ticks of a minor that isn't picked go with it
    const messy = stateFromParams(new URLSearchParams(`mn=a-minor,a-minor,b--minor,b-minor,c-minor,d-minor&x=d-minor--x,c-minor--y`))!;
    expect(messy.minors).toEqual(["a-minor", "b-minor", "c-minor"]);
    expect(messy.minors.length).toBe(MAX_MINORS);
    expect(messy.ticked).toEqual(["c-minor--y"]);
  });
});

describe("hydrate", () => {
  it("adds the shared gen-ed courses and fills gen-ed groups' options from them", () => {
    const slim: Degree = { ...DEG, courses: { "FIN 411": DEG.courses["FIN 411"] }, groups: DEG.groups.map((g) => (g.id === "hum" ? { ...g, eligible: [] } : g)) };
    const gened = { "HIST 100": DEG.courses["HIST 100"], "PHIL 101": DEG.courses["PHIL 101"], "ECON 102": DEG.courses["ECON 102"] };
    const full = hydrate(slim, gened);
    expect(full.groups.find((g) => g.id === "hum")!.eligible).toEqual(["HIST 100", "PHIL 101"]);
    expect(full.groups.find((g) => g.id === "fin-400")!.eligible).toEqual([]); // range groups keep the exported list
    expect(Object.keys(full.courses).sort()).toEqual(["ECON 102", "FIN 411", "HIST 100", "PHIL 101"]);
  });
});
