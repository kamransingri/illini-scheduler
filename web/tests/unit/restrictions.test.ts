import { describe, expect, it } from "vitest";
import { prefsFromParams, prefsToParams } from "@/lib/prefs";
import { eligibility, nameFits, NOBODY, parseRestrictions, type AboutYou } from "@/lib/restrictions";
import { DEFAULT_PREFS, explainEmpty, generate, type CourseInput } from "@/lib/schedule";
import type { Course, Section } from "@/lib/types";

const kinds = (text: string) => parseRestrictions(text).map((c) => [c.not ? "not" : "only", c.kind]);

// real sentences from Course Explorer's section notes (Spring 2027 and Fall 2026)
const CS_ONLY =
  "This section is for CS majors and CS + X only. For up-to-date information about CS course restrictions, please see the following link: http://go.cs.illinois.edu/CSregister Restricted to Undergrad - Urbana-Champaign. Restricted to CS and blended CS majors students.";
const NOT_CS =
  "This section is intended for non CS majors. Restricted to Undergrad - Urbana-Champaign. Not intended for CS and blended CS majors students.";

const me = (x: Partial<AboutYou>): AboutYou => ({ ...NOBODY, ...x });
const csJunior = me({ level: "undergrad", standing: "junior", program: { name: "Computer Science, BS", college: "The Grainger College of Engineering" } });
const finSoph = me({ level: "undergrad", standing: "sophomore", program: { name: "Finance, BS", college: "Gies College of Business" } });

describe("reading restrictions (#79)", () => {
  it("reads level, majors, standing, departments, colleges and programs", () => {
    expect(kinds(CS_ONLY)).toEqual([["only", "level"], ["only", "major"]]);
    expect(kinds(NOT_CS)).toEqual([["only", "level"], ["not", "major"]]);
    expect(parseRestrictions("Restricted to students with Sophomore, Junior, or Senior class standing.")[0]).toMatchObject({ kind: "standing", standings: ["sophomore", "junior", "senior"] });
    expect(parseRestrictions("Restricted to Computer Science or Bioinformatics major(s).")[0]).toMatchObject({ kind: "major", names: ["Computer Science", "Bioinformatics"] });
    expect(parseRestrictions("Restricted to Dance or Dance and Kinesiology major(s) or minor(s).")[0]).toMatchObject({ kind: "major", names: ["Dance", "Dance and Kinesiology"] });
    expect(parseRestrictions("Restricted to students in the Electrical & Computer Eng department.")[0]).toMatchObject({ kind: "department", names: ["Electrical & Computer Eng"] });
    expect(parseRestrictions("Restricted to Gies College of Business.")[0].kind).toBe("college");
    expect(parseRestrictions("Restricted to Agr, Consumer, & Env Sciences or Grainger Engineering.")[0]).toMatchObject({ kind: "college", names: ["Agr, Consumer, & Env Sciences", "Grainger Engineering"] });
    expect(parseRestrictions("Restricted to MS: Civil Engr - Online - UIUC, MS:Industrial Engr Online-UIUC, or PHD:Information Sciences -UIUC.")[0].kind).toBe("grad-program");
    expect(parseRestrictions("Restricted to NDEG:Accountancy Online -UIUC or MCS:Computer Sci Online -UIUC.")[0].kind).toBe("grad-program");
    expect(parseRestrictions("Restricted to BSW: Social Work - UIUC.")[0]).toMatchObject({ kind: "major", names: ["Social Work"] });
    expect(parseRestrictions("Restricted to Medicine - Urbana-Champaign.")[0]).toMatchObject({ kind: "level", levels: ["professional"] });
    expect(parseRestrictions("Restricted to First Time Freshman students.")[0].kind).toBe("first-time");
    expect(parseRestrictions("Restricted to James Scholars Program students.")[0].kind).toBe("other");
    expect(parseRestrictions("")).toEqual([]);
  });

  it("matches Banner's major names to the catalog's, abbreviations included", () => {
    expect(nameFits("Computer Science", "Computer Science + Economics, BSLAS")).toBe(true);
    expect(nameFits("Materials Sci & Engr", "Materials Science and Engineering, BS")).toBe(true);
    expect(nameFits("Accountancy + Data Science", "Accountancy + Data Science, BS")).toBe(true);
    expect(nameFits("Chemistry", "Finance, BS")).toBe(false);
    expect(nameFits("Computer Engineering", "Computer Science, BS")).toBe(false);
  });
});

describe("who can register (#81)", () => {
  it("a CS-majors-only section: yes for a CS major, no for a finance major, maybe when the major isn't known", () => {
    expect(eligibility(CS_ONLY, "Open (Restricted)", csJunior).status).toBe("ok");
    const no = eligibility(CS_ONLY, "Open (Restricted)", finSoph);
    expect(no.status).toBe("no");
    expect(no.because).toEqual(["Restricted to CS and blended CS majors students."]);
    expect(eligibility(CS_ONLY, "Open (Restricted)", me({ level: "undergrad" })).status).toBe("maybe");
    expect(eligibility(CS_ONLY, "Open (Restricted)", NOBODY).status).toBe("maybe");
  });

  it("'Not intended for' counts against a student who fits it", () => {
    expect(eligibility(NOT_CS, "Open (Restricted)", csJunior).status).toBe("no");
    expect(eligibility(NOT_CS, "Open (Restricted)", finSoph).status).toBe("ok");
    // a group we can't read doesn't flag the section
    expect(eligibility("Not intended for ESL-placed students.", "Open", finSoph).status).toBe("ok");
  });

  it("any of your minors counts when the section names minors", () => {
    const dance = "Restricted to Dance or Dance and Kinesiology major(s) or minor(s).";
    const two = me({ ...finSoph, minors: [{ name: "History Minor" }, { name: "Dance Minor" }] });
    expect(eligibility(dance, "Open (Restricted)", two).status).toBe("ok");
    expect(eligibility(dance, "Open (Restricted)", me({ ...finSoph, minors: [{ name: "History Minor" }] })).status).toBe("no");
    // a majors-only section isn't opened by a minor
    expect(eligibility("Restricted to Dance major(s).", "Open (Restricted)", two).status).toBe("no");
  });

  it("class standing and level", () => {
    const jrsr = "Restricted to students with Junior or Senior class standing.";
    expect(eligibility(jrsr, "Open (Restricted)", csJunior).status).toBe("ok");
    expect(eligibility(jrsr, "Open (Restricted)", finSoph).status).toBe("no");
    expect(eligibility(jrsr, "Open (Restricted)", me({ level: "undergrad" })).status).toBe("maybe");
    expect(eligibility("Restricted to Graduate - Urbana-Champaign.", "Open (Restricted)", finSoph).status).toBe("no");
    expect(eligibility("Restricted to Graduate - Urbana-Champaign.", "Open (Restricted)", me({ standing: "graduate" })).status).toBe("ok");
    expect(eligibility("Restricted to MS: Civil Engr - Online - UIUC.", "Open (Restricted)", finSoph).status).toBe("no");
    expect(eligibility("Restricted to First Time Freshman students.", "Open (Restricted)", finSoph).status).toBe("no");
    expect(eligibility("Restricted to First Time Freshman students.", "Open (Restricted)", me({ standing: "freshman" })).status).toBe("maybe");
  });

  it("colleges and departments", () => {
    expect(eligibility("Restricted to Gies College of Business.", "Open (Restricted)", finSoph).status).toBe("ok");
    expect(eligibility("Restricted to Gies College of Business.", "Open (Restricted)", csJunior).status).toBe("no");
    expect(eligibility("Restricted to Grainger Engineering.", "Open (Restricted)", csJunior).status).toBe("ok");
    // a department we can't tie to the major is unclear, not a no
    expect(eligibility("Restricted to students in the Music department.", "Open (Restricted)", csJunior).status).toBe("maybe");
    expect(eligibility("Restricted to students in the Electrical & Computer Eng department.", "Open (Restricted)", me({ program: { name: "Computer Engineering, BS", college: "" } })).status).toBe("ok");
  });

  it("every sentence must pass; the one that fails is the reason", () => {
    const text = "Restricted to Undergrad - Urbana-Champaign. Restricted to students with Senior class standing. Restricted to Finance major(s).";
    const e = eligibility(text, "Open (Restricted)", finSoph);
    expect(e).toEqual({ status: "no", because: ["Restricted to students with Senior class standing."] });
  });

  it("no restriction text: open, unless Course Explorer still marks it Restricted", () => {
    expect(eligibility("", "Open", finSoph).status).toBe("open");
    expect(eligibility("", "Open (Restricted)", finSoph).status).toBe("maybe");
  });
});

describe("the builder skips sections you can't take (#81)", () => {
  const sec = (code: string, d: number, s: number): Section =>
    ({ crn: code, code, type: "LEC", type_name: "Lecture", component: "primary", group: "*", part: "1", status: "Open", status_code: "A", text: "", meetings: [{ d, s, e: s + 50, b: "", r: "" }], instructors: [], instructors_raw: [], special: "" }) as unknown as Section;
  const course = { terms: { "2027-sp": { sections: [sec("A1", 1, 600), sec("A2", 2, 600)] } }, instructors: {}, gpa: null } as unknown as Course;
  const input = (cannot: string[], locked: string[] = []): CourseInput => ({ key: "X 1", course, credits: 3, locked, cannot });

  it("with the must-have on, a section you can't take is never used unless you lock it", () => {
    const codes = (inp: CourseInput, prefs = DEFAULT_PREFS) => generate([inp], "2027-sp", prefs).schedules.map((x) => x.bundles[0].sections[0].code).sort();
    expect(codes(input(["A1"]))).toEqual(["A2"]);
    expect(codes(input(["A1"]), { ...DEFAULT_PREFS, eligibleOnly: false })).toEqual(["A1", "A2"]);
    expect(codes(input(["A1"], ["A1"]))).toEqual(["A1"]);
    expect(explainEmpty(input(["A1", "A2"]), "2027-sp", DEFAULT_PREFS)).toContain("every section is restricted to students you aren't");
  });

  it("the must-have is on by default and only an opt-out goes in the link", () => {
    expect(DEFAULT_PREFS.eligibleOnly).toBe(true);
    const p = new URLSearchParams();
    prefsToParams({ ...DEFAULT_PREFS, eligibleOnly: false }, p);
    expect(p.get("eo")).toBe("0");
    expect(prefsFromParams(p).eligibleOnly).toBe(false);
    expect(prefsFromParams(new URLSearchParams("e=540")).eligibleOnly).toBe(true);
  });
});
