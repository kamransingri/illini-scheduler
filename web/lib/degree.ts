// Degree checklist: which requirement groups a student's courses satisfy, under the catalog's double-counting rules.
// Pure functions over web/public/data/degrees/<id>.json (pipeline/degrees.py) and "My courses" (lib/mycourses.ts).
import type { CourseStatus, MyCourse } from "./mycourses";
import type { DegreeProf } from "./rank";

export { rankCourse, type DegreeProf, type Ranked } from "./rank";

export type DegreeGroup = {
  id: string;
  name: string;
  section: string;
  kind: "program" | "gened";
  rule: "all" | "n_of" | "hours" | "manual";
  n: number | null;
  hours: number | null;
  items: string[][][]; // item -> alternatives -> sequence of codes taken together
  from: string[];
  eligible: string[];
  exclude: string[];
  max_hours: Record<string, number>;
  min_from: Record<string, number>;
  not_with: string[];
  exclusive: string | null;
  source: string | null;
  notes: string[];
};

export type DcRule = { allow: boolean; within?: string; between?: [string, string]; quote: string; source: string };

export type DegreeCourse = {
  t: string;
  cr: [number, number];
  g: string[];
  page: boolean;
  gpa?: number | null;
  gn?: number;
  nx?: number;
  nSec?: number;
  nOpen?: number | null;
  known?: boolean;
  pre?: string;
  profs?: DegreeProf[];
};

export type Degree = {
  id: string;
  program: string;
  college: string;
  catalog_year: string;
  source: string;
  read_on: string;
  total_hours: number | null;
  notes: string[];
  double_counting: DcRule[];
  groups: DegreeGroup[];
  courses: Record<string, DegreeCourse>;
  unknown: string[];
  generated?: string; // date, when the file was imported automatically from the catalog (pipeline/catalog_import.py)
};

export type DegreeIndex = { id: string; program: string; college: string; catalog_year: string; groups: number; generated?: string }[];

/**
 * Add the shared gen-ed courses (degrees/gened-courses.json, the same for every program) to a program's own courses,
 * and fill each gen-ed-only group's eligible list from them (the export leaves those lists out to stay small).
 */
export function hydrate(deg: Degree, gened: Record<string, DegreeCourse>): Degree {
  const courses = { ...gened, ...deg.courses };
  const byCode = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
  return {
    ...deg,
    courses,
    groups: deg.groups.map((g) =>
      g.from.length && !g.eligible.length && g.from.every((x) => x.startsWith("gened:"))
        ? { ...g, eligible: Object.keys(courses).filter((c) => !g.exclude.includes(c) && g.from.some((x) => selectorMatches(x, c, courses[c]))).sort(byCode) }
        : g,
    ),
  };
}

export type Verdict = { allow: boolean | "unclear"; rule: DcRule | null; why: string };

const code = (c: MyCourse) => `${c.s} ${c.n}`;

/** Credit hours a course contributes: its fixed value, or the minimum of a variable range (shown as a caveat). */
export function hoursOf(course: DegreeCourse | undefined): number {
  if (!course) return 0;
  return course.cr[0] || course.cr[1] || 0;
}

export function selectorMatches(sel: string, c: string, course: DegreeCourse | undefined): boolean {
  const g = /^gened:([A-Z0-9]+)$/.exec(sel);
  if (g) return !!course && course.g.includes(g[1]);
  const r = /^([A-Z]{2,5}) (\d{3})-(\d{3})$/.exec(sel);
  if (!r) return false;
  const [subj, num] = c.split(" ");
  return subj === r[1] && Number(num) >= Number(r[2]) && Number(num) <= Number(r[3]);
}

/** Does this group take this course at all (ignoring what else it is used for)? */
export function accepts(g: DegreeGroup, c: string, deg: Degree): boolean {
  if (g.items.some((item) => item.some((alt) => alt.includes(c)))) return true;
  if (g.exclude.includes(c)) return false;
  return g.from.some((s) => selectorMatches(s, c, deg.courses[c]));
}

/** May one course count toward both groups? From `not_with` and the program's quoted rules; "unclear" otherwise. */
export function canShare(a: DegreeGroup, b: DegreeGroup, rules: DcRule[]): Verdict {
  if (a.not_with.includes(b.id) || b.not_with.includes(a.id))
    return { allow: false, rule: null, why: `"${(a.not_with.includes(b.id) ? a : b).name}" asks for courses in addition to "${(a.not_with.includes(b.id) ? b : a).name}"` };
  const tags = (g: DegreeGroup) => [g.kind, ...(g.exclusive ? [g.exclusive] : [])];
  for (const r of rules) {
    if (r.within && a.exclusive === r.within && b.exclusive === r.within) return { allow: r.allow, rule: r, why: r.quote };
    if (r.between) {
      const [x, y] = r.between;
      if ((tags(a).includes(x) && tags(b).includes(y)) || (tags(a).includes(y) && tags(b).includes(x))) return { allow: r.allow, rule: r, why: r.quote };
    }
  }
  return { allow: "unclear", rule: null, why: "The catalog doesn't say whether one course can count for both." };
}

export type Used = { code: string; status: CourseStatus; hours: number };
export type Blocked = { code: string; other: string; verdict: Verdict };
export type GroupStatus = "done" | "in_progress" | "partial" | "open";
export type GroupResult = {
  group: DegreeGroup;
  status: GroupStatus;
  used: Used[];
  have: number;
  need: number;
  unit: "courses" | "hours" | "items";
  missingItems: string[][][]; // explicit items still to take (all / n_of)
  blocked: Blocked[]; // courses that match but already count elsewhere where sharing isn't allowed (or isn't clear)
  hoursCaveat: boolean; // a variable-credit course was counted at its minimum
};

export type Evaluation = { results: GroupResult[]; usedBy: Map<string, string[]> };

export function evaluate(deg: Degree, mine: MyCourse[], ticked: string[] = []): Evaluation {
  const taken = new Map<string, CourseStatus>(mine.map((c) => [code(c), c.status]));
  const usedBy = new Map<string, string[]>();
  const byId = new Map(deg.groups.map((g) => [g.id, g]));
  const results: GroupResult[] = [];

  const tryUse = (g: DegreeGroup, c: string, blocked: Blocked[]): boolean => {
    for (const other of usedBy.get(c) ?? []) {
      const v = canShare(byId.get(other)!, g, deg.double_counting);
      if (v.allow !== true) {
        blocked.push({ code: c, other, verdict: v });
        return false;
      }
    }
    return true;
  };
  const commit = (g: DegreeGroup, c: string) => usedBy.set(c, [...(usedBy.get(c) ?? []), g.id]);
  // Completed courses first, so a requirement counts as done rather than "in progress" whenever it can.
  const order = (codes: string[]) => [...codes].sort((a, b) => (taken.get(a) === "in_progress" ? 1 : 0) - (taken.get(b) === "in_progress" ? 1 : 0));

  for (const g of deg.groups) {
    const used: Used[] = [];
    const blocked: Blocked[] = [];
    let hoursCaveat = false;
    const take = (c: string) => {
      commit(g, c);
      used.push({ code: c, status: taken.get(c)!, hours: hoursOf(deg.courses[c]) });
    };
    let have = 0;
    let need = 0;
    let unit: GroupResult["unit"] = "items";
    const missingItems: string[][][] = [];

    if (g.rule === "manual") {
      need = 1;
      have = ticked.includes(g.id) ? 1 : 0;
    } else if (g.items.length && (g.rule === "all" || g.rule === "n_of")) {
      need = g.rule === "all" ? g.items.length : (g.n ?? 1);
      unit = "courses";
      for (const item of g.items) {
        if (have >= need) break;
        const alt = item.find((seq) => seq.every((c) => taken.has(c)) && seq.every((c) => tryUse(g, c, blocked)));
        if (alt) {
          alt.forEach(take);
          have += 1;
        } else missingItems.push(item);
      }
    } else if (g.rule === "n_of") {
      need = g.n ?? 1;
      unit = "courses";
      const cands = order([...taken.keys()].filter((c) => accepts(g, c, deg)));
      // satisfy "at least k from selector" first, then fill with anything else the group takes
      for (const [sel, k] of Object.entries(g.min_from)) {
        let got = used.filter((u) => selectorMatches(sel, u.code, deg.courses[u.code])).length;
        for (const c of cands) {
          if (got >= k || have >= need) break;
          if (used.some((u) => u.code === c) || !selectorMatches(sel, c, deg.courses[c]) || !tryUse(g, c, blocked)) continue;
          take(c);
          have += 1;
          got += 1;
        }
      }
      for (const c of cands) {
        if (have >= need) break;
        if (used.some((u) => u.code === c) || !tryUse(g, c, blocked)) continue;
        if (have === need - 1 && Object.entries(g.min_from).some(([sel, k]) => used.filter((u) => selectorMatches(sel, u.code, deg.courses[u.code])).length < k && !selectorMatches(sel, c, deg.courses[c])))
          continue; // the last slot must go to a course that meets "at least k from"
        take(c);
        have += 1;
      }
    } else if (g.rule === "hours") {
      need = g.hours ?? 0;
      unit = "hours";
      const cands = order([...taken.keys()].filter((c) => accepts(g, c, deg)));
      for (const c of cands) {
        if (have >= need) break;
        if (!tryUse(g, c, blocked)) continue;
        const course = deg.courses[c];
        if (course && course.cr[0] !== course.cr[1]) hoursCaveat = true;
        const h = Math.min(hoursOf(course), g.max_hours[c] ?? Infinity);
        take(c);
        used[used.length - 1].hours = h;
        have += h;
      }
    }

    const met = have >= need && need > 0;
    const anyInProgress = used.some((u) => u.status === "in_progress");
    const status: GroupStatus = met ? (anyInProgress ? "in_progress" : "done") : have > 0 || used.length ? "partial" : "open";
    results.push({ group: g, status, used, have: Math.min(have, need), need, unit, missingItems, blocked, hoursCaveat });
  }
  return { results, usedBy };
}

export function needText(r: GroupResult): string {
  const left = Math.max(0, r.need - r.have);
  if (r.group.rule === "manual") return r.have ? "Marked as done" : "Mark it done when it's met";
  if (left === 0) return r.status === "in_progress" ? "Met once your in-progress courses finish" : "Met";
  if (r.unit === "hours") return `${left} more hour${left === 1 ? "" : "s"} (${r.have} of ${r.need})`;
  return `${left} more course${left === 1 ? "" : "s"} (${r.have} of ${r.need})`;
}

/** Courses that could still fill a group: the missing listed items, or the eligible list for a `from` group. */
export function options(r: GroupResult, deg: Degree, taken: Set<string>): string[] {
  const g = r.group;
  const codes = r.missingItems.length ? r.missingItems.flat(2) : g.from.length ? g.eligible : [];
  return [...new Set(codes)].filter((c) => !taken.has(c) && !(g.from.length && g.exclude.includes(c)));
}

export type DoubleMark = { group: DegreeGroup; verdict: Verdict };

/** Other unfinished groups this course would also fill, with whether the rules let it count for both. */
export function alsoCounts(c: string, from: DegreeGroup, open: GroupResult[], deg: Degree): DoubleMark[] {
  return open
    .filter((r) => r.group.id !== from.id && r.status !== "done" && r.status !== "in_progress" && r.group.rule !== "manual" && accepts(r.group, c, deg))
    .map((r) => ({ group: r.group, verdict: canShare(from, r.group, deg.double_counting) }));
}

const CODE_IN_TEXT = /\b([A-Z]{2,5})\s?(\d{3})\b/g;

/** Prerequisite text worth a "check prerequisites" note: it names a course that isn't in My courses, or no course at all. */
export function prereqNote(pre: string | undefined, taken: Set<string>): string | null {
  const text = (pre ?? "").trim();
  if (!text) return null;
  const named = [...text.matchAll(CODE_IN_TEXT)].map((m) => `${m[1]} ${m[2]}`);
  if (named.length && named.every((c) => taken.has(c))) return null;
  return text;
}
