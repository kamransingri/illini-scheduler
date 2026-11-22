import { describe, expect, it } from "vitest";
import { CART_KEY, decodeCart } from "@/lib/cart";
import {
  activePlan,
  createPlan,
  deletePlan,
  icsFileName,
  MAX_PLANS,
  nextName,
  openLink,
  planDifferences,
  PLANS_KEY,
  readPlans,
  renamePlan,
  restorePlan,
  switchPlan,
  type PlanStore,
} from "@/lib/plans";
import { PREFS_KEY } from "@/lib/prefs";
import type { Schedule } from "@/lib/schedule";
import type { Section } from "@/lib/types";

function store(init: Record<string, string> = {}): PlanStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe("named schedules: storage (#117)", () => {
  it("moves the single cart and must-haves into Plan A without losing anything", () => {
    const s = store({ [CART_KEY]: "CS124!31152,STAT107", [PREFS_KEY]: "e=540&do=16" });
    const p = readPlans(s);
    expect(p.plans).toEqual([{ id: "p1", name: "Plan A", cart: "CS124!31152,STAT107", prefs: "e=540&do=16" }]);
    expect(JSON.parse(s.data.get(PLANS_KEY)!).active).toBe("p1");
    // the cart and prefs keys are untouched, so every other page still reads them
    expect(s.data.get(CART_KEY)).toBe("CS124!31152,STAT107");
    expect(s.data.get(PREFS_KEY)).toBe("e=540&do=16");
  });

  it("an empty browser starts with an empty Plan A", () => {
    expect(readPlans(store()).plans).toEqual([{ id: "p1", name: "Plan A", cart: "", prefs: null }]);
  });

  it("plans round-trip: each keeps its own courses, locks and must-haves through switches", () => {
    const s = store({ [CART_KEY]: "CS124", [PREFS_KEY]: "e=540" });
    readPlans(s);
    createPlan({}, s); // Plan B, active, no courses
    expect(s.data.get(CART_KEY)).toBe("");
    s.data.set(CART_KEY, "CS225!12345,MATH241"); // what the builder writes while Plan B is open
    s.data.set(PREFS_KEY, "do=16&lu=1");
    switchPlan("p1", s);
    expect(s.data.get(CART_KEY)).toBe("CS124");
    expect(s.data.get(PREFS_KEY)).toBe("e=540");
    switchPlan("p2", s);
    expect(decodeCart(s.data.get(CART_KEY))).toEqual([
      { s: "CS", n: "225", locked: ["12345"] },
      { s: "MATH", n: "241", locked: [] },
    ]);
    expect(s.data.get(PREFS_KEY)).toBe("do=16&lu=1");
    // and they survive a reload (a fresh read of the same storage)
    expect(readPlans(s).plans.map((x) => [x.name, x.cart])).toEqual([
      ["Plan A", "CS124"],
      ["Plan B", "CS225!12345,MATH241"],
    ]);
  });

  it("duplicate, rename, delete and undo", () => {
    const s = store({ [CART_KEY]: "CS225,STAT200" });
    readPlans(s);
    let p = createPlan({ copyOf: "p1" }, s)!;
    expect(activePlan(p)).toMatchObject({ name: "Plan B", cart: "CS225,STAT200" });
    p = renamePlan(p.active, "  Plan B if   CS 225 fills ", s);
    expect(activePlan(p).name).toBe("Plan B if CS 225 fills");
    expect(activePlan(renamePlan(p.active, "plan a", s)).name).toBe("plan a (2)"); // names stay unique
    expect(renamePlan(p.active, "   ", s).plans).toHaveLength(2); // a blank name is ignored
    const r = deletePlan(p.active, s)!;
    expect(r.plans.plans.map((x) => x.name)).toEqual(["Plan A"]);
    expect(r.plans.active).toBe("p1");
    expect(s.data.get(CART_KEY)).toBe("CS225,STAT200");
    expect(deletePlan("p1", s)).toBeNull(); // never the last plan
    const back = restorePlan(r.deleted, s)!;
    expect(back.plans.map((x) => x.name)).toEqual(["Plan A", "plan a (2)"]);
    expect(activePlan(back).name).toBe("plan a (2)");
  });

  it("caps the number of plans", () => {
    const s = store();
    readPlans(s);
    for (let i = 1; i < MAX_PLANS; i++) expect(createPlan({}, s)).not.toBeNull();
    expect(readPlans(s).plans).toHaveLength(MAX_PLANS);
    expect(createPlan({}, s)).toBeNull();
    expect(nextName(readPlans(s))).toBe("Plan K");
  });

  it("ignores broken saved data instead of failing", () => {
    const s = store({ [PLANS_KEY]: "{not json", [CART_KEY]: "CS124" });
    expect(readPlans(s).plans).toEqual([{ id: "p1", name: "Plan A", cart: "CS124", prefs: null }]);
    const t = store({ [PLANS_KEY]: JSON.stringify({ active: "zz", plans: [{ id: "a", name: "", cart: "bogus,CS124" }, { id: "a" }, null] }) });
    expect(readPlans(t)).toEqual({ active: "a", plans: [{ id: "a", name: "Plan A", cart: "", prefs: null }] });
  });
});

describe("named schedules: share links (#117)", () => {
  const cs = decodeCart("CS124,STAT200");

  it("a link fills an empty plan", () => {
    const s = store();
    expect(openLink(cs, "e=540", "Friday-free", s)).toEqual({ kind: "filled" });
    expect(readPlans(s).plans).toEqual([{ id: "p1", name: "Friday-free", cart: "CS124,STAT200", prefs: "e=540" }]);
  });

  it("a link to the open plan, or to another saved plan, opens that plan", () => {
    const s = store({ [CART_KEY]: "CS124,STAT200", [PREFS_KEY]: "e=540" });
    expect(openLink(cs, "t=2027-sp&c=CS124%2CSTAT200&e=540", null, s)).toEqual({ kind: "same" });
    expect(openLink(cs, null, null, s)).toEqual({ kind: "same" }); // no rules in the link: the plan's own apply
    createPlan({ cart: "PHYS211" }, s);
    const out = openLink(cs, "e=540", null, s);
    expect(out).toMatchObject({ kind: "switched", plan: { name: "Plan A" } });
    expect(s.data.get(CART_KEY)).toBe("CS124,STAT200");
  });

  it("any other link opens as a new plan and never overwrites a saved one", () => {
    const s = store({ [CART_KEY]: "PHYS211,CHEM102", [PREFS_KEY]: "do=16" });
    const out = openLink(cs, "e=540", null, s);
    expect(out).toMatchObject({ kind: "created", plan: { name: "Shared plan", cart: "CS124,STAT200", prefs: "e=540" }, from: { name: "Plan A" } });
    const p = readPlans(s);
    expect(p.plans.find((x) => x.name === "Plan A")).toMatchObject({ cart: "PHYS211,CHEM102", prefs: "do=16" });
    expect(activePlan(p).name).toBe("Shared plan");
    // the link's plan name is used, made unique
    expect(openLink(decodeCart("MATH231"), null, "Plan A", s)).toMatchObject({ kind: "created", plan: { name: "Plan A (2)" } });
  });

  it("your plan's courses with other rules: that plan opens and nothing is saved until the student chooses", () => {
    const s = store({ [CART_KEY]: "CS124,STAT200", [PREFS_KEY]: "e=540" });
    expect(openLink(cs, "e=600&do=16", null, s)).toMatchObject({ kind: "rules", plan: { name: "Plan A" } });
    expect(readPlans(s).plans).toHaveLength(1); // no new plan
    expect(s.data.get(PREFS_KEY)).toBe("e=540"); // and Plan A's rules are untouched
    // the same courses as a plan that isn't open: it opens first
    createPlan({ cart: "PHYS211" }, s);
    const out = openLink(cs, "lu=1", null, s);
    expect(out).toMatchObject({ kind: "rules", plan: { name: "Plan A" } });
    expect(activePlan(readPlans(s)).name).toBe("Plan A");
    expect(s.data.get(PREFS_KEY)).toBe("e=540");
  });

  it("a new plan is blank: no courses and the default rules", () => {
    const s = store({ [CART_KEY]: "CS124", [PREFS_KEY]: "e=540&do=16" });
    readPlans(s);
    expect(activePlan(createPlan({}, s)!)).toMatchObject({ name: "Plan B", cart: "", prefs: null });
    expect(s.data.has(PREFS_KEY)).toBe(false);
  });

  it("past the cap, a link isn't saved", () => {
    const s = store({ [CART_KEY]: "PHYS211" });
    readPlans(s);
    for (let i = 1; i < MAX_PLANS; i++) createPlan({ cart: `CS${100 + i}` }, s);
    expect(openLink(cs, null, null, s)).toEqual({ kind: "full" });
    expect(readPlans(s).plans).toHaveLength(MAX_PLANS);
  });
});

let crn = 50000;
function sec(code: string, component: string, d: number, s: number | null): Section {
  return { crn: String(crn++), code, type: "LEC", type_name: "", component, group: "*", part: "1", status: "Open", status_code: "A", credits: "", title: "", text: "", meetings: [{ d, s, e: s === null ? null : s + 50, b: "", r: "" }], instructors: [], instructors_raw: [], special: "" } as Section;
}
function sched(bundles: [string, Section[]][], daysOff: string[]): Schedule {
  return {
    score: 0,
    bundles: bundles.map(([course, sections]) => ({ course, sections, meetings: [], crns: sections.map((x) => x.crn), gpa: null, rmp: null, prof: null, alternatives: [] })),
    stats: { expectedGpa: null, daysOff, earliest: null, latest: null, gapMinutes: 0, backToBackFar: 0, backToBack: 0, walks: [] },
  };
}

describe("comparing plans (#119)", () => {
  const al1 = sec("AL1", "primary", 1 | 4 | 16, 600);
  const ad1 = sec("AD1", "DIS", 8, 600);
  const base = sched([["CS 225", [al1, ad1]], ["CHEM 102", [sec("AL1", "primary", 1 | 4 | 16, 540)]]], []);

  it("names the moved class, the courses added or left out, and the days off", () => {
    const other = sched([["CS 225", [sec("AL2", "primary", 2 | 8, 840), ad1]], ["STAT 107", [sec("AL1", "primary", 2 | 8, 600)]]], ["Mon", "Wed", "Fri"]);
    expect(planDifferences(base, other)).toEqual(["CS 225 at 2pm TR", "adds STAT 107", "without CHEM 102", "Mondays, Wednesdays and Fridays off"]);
    expect(planDifferences(other, base)).toContain("class on Mondays, Wednesdays and Fridays");
  });

  it("a moved discussion, an online section, the same times in other sections, and the same schedule", () => {
    expect(planDifferences(base, sched([["CS 225", [al1, sec("AD2", "DIS", 8, 780)]], ["CHEM 102", base.bundles[1].sections]], []))).toEqual(["CS 225 discussion at 1pm R"]);
    expect(planDifferences(base, sched([["CS 225", [al1, sec("AD9", "DIS", 0, null)]], ["CHEM 102", base.bundles[1].sections]], []))[0]).toBe("CS 225 discussion with no set time");
    expect(planDifferences(base, sched([["CS 225", [al1, sec("AD3", "DIS", 8, 600)]], ["CHEM 102", base.bundles[1].sections]], []))).toEqual(["CS 225 AL1 + AD3, same times"]);
    expect(planDifferences(base, base)).toEqual([]);
  });

  it("each plan's calendar file has its name", () => {
    expect(icsFileName("2027-sp", "Plan A")).toBe("illini-schedule-2027-sp.ics");
    expect(icsFileName("2027-sp", null)).toBe("illini-schedule-2027-sp.ics");
    expect(icsFileName("2027-sp", "Plan B if CS 225 fills!")).toBe("illini-schedule-2027-sp-plan-b-if-cs-225-fills.ics");
  });
});
