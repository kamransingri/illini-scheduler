// Schedule builder engine: section bundles, conflicts, backtracking generator, ranking. Pure functions.
import type { Course, Section } from "./types";
import { areaOf } from "./campus";

export type Mtg = { d: number; s: number | null; e: number | null; part: string; b: string; crn: string; course: string };

export type Bundle = {
  course: string; // "CS 124"
  sections: Section[];
  meetings: Mtg[];
  crns: string[];
  /** expected GPA for this bundle (instructor GPA for the course, else course GPA), null if unknown */
  gpa: number | null;
  /** best RMP quality among the bundle's instructors, null if unknown */
  rmp: number | null;
  /** how many equivalent alternatives (same times + areas) this bundle represents */
  alternatives: Section[][];
};

export type CourseInput = { key: string; course: Course; credits: number; locked: string[] };

export type Prefs = {
  earliest: number | null; // hard: no meeting may start before this (minutes); 540 = "no 8am"
  noFriday: boolean; // hard
  blocked: { d: number; s: number; e: number }[]; // hard: work, practice
  includeSpecial: boolean; // allow sections flagged as restricted / special-program
  weights: { gpa: number; rmp: number; early: number; daysOff: number; compact: number; walking: number };
};

export const DEFAULT_PREFS: Prefs = {
  earliest: null,
  noFriday: false,
  blocked: [],
  includeSpecial: false,
  weights: { gpa: 2, rmp: 1, early: 1, daysOff: 1, compact: 1, walking: 1 },
};

export type Schedule = { bundles: Bundle[]; score: number; stats: ScheduleStats };

export type ScheduleStats = {
  expectedGpa: number | null;
  daysOff: string[];
  earliest: number | null;
  latest: number | null;
  gapMinutes: number;
  backToBackFar: number;
  backToBack: number;
};

// ---------------------------------------------------------------------------------------------------------
// Time primitives
// ---------------------------------------------------------------------------------------------------------

/** Parts of term "A" (first half) and "B" (second half) never overlap each other; anything else overlaps all. */
export function partsOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  if ((a === "A" && b === "B") || (a === "B" && b === "A")) return false;
  return true;
}

export function meetingsConflict(a: Pick<Mtg, "d" | "s" | "e" | "part">, b: Pick<Mtg, "d" | "s" | "e" | "part">): boolean {
  if (a.s === null || a.e === null || b.s === null || b.e === null) return false; // online / arranged
  if (!(a.d & b.d)) return false;
  if (!partsOverlap(a.part, b.part)) return false;
  return a.s < b.e && b.s < a.e;
}

/** Back-to-back: same day, no overlap, and the next class starts within 10 minutes of the previous one ending. */
export function backToBack(a: Pick<Mtg, "d" | "s" | "e" | "part">, b: Pick<Mtg, "d" | "s" | "e" | "part">): boolean {
  if (a.s === null || a.e === null || b.s === null || b.e === null) return false;
  if (!(a.d & b.d) || !partsOverlap(a.part, b.part)) return false;
  if (meetingsConflict(a, b)) return false;
  const gap = a.e <= b.s ? b.s - a.e : a.s - b.e;
  return gap >= 0 && gap <= 10;
}

// ---------------------------------------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------------------------------------

function sectionMeetings(s: Section, course: string): Mtg[] {
  return s.meetings.map((m) => ({ d: m.d, s: m.s, e: m.e, part: s.part || "1", b: m.b, crn: s.crn, course }));
}

function product<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((prefix) => list.map((x) => [...prefix, x])), [[]]);
}

/** Valid bundles for one course in one term: one section per component within a link group. */
export function buildBundles(sections: Section[], courseKey: string, includeSpecial = true, locked: string[] = []): Section[][] {
  const usable = sections.filter((s) => s.status_code !== "P" && (includeSpecial || !s.special || locked.includes(s.crn)));
  const groups = new Map<string, Section[]>();
  for (const s of usable) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  const out: Section[][] = [];
  for (const secs of groups.values()) {
    const byComp = new Map<string, Section[]>();
    for (const s of secs) byComp.set(s.component, [...(byComp.get(s.component) ?? []), s]);
    if (!byComp.has("primary")) continue;
    for (const combo of product([...byComp.values()])) {
      const mtgs = combo.flatMap((s) => sectionMeetings(s, courseKey));
      let ok = true;
      for (let i = 0; i < mtgs.length && ok; i++) for (let j = i + 1; j < mtgs.length && ok; j++) if (meetingsConflict(mtgs[i], mtgs[j])) ok = false;
      if (ok) out.push(combo);
    }
  }
  return out;
}

/** True when every bundle is a valid lecture + linked-section combination for that course. */
export function isValidBundle(bundle: Section[], sections: Section[]): boolean {
  const comps = new Set(bundle.map((s) => s.component));
  if (comps.size !== bundle.length || !comps.has("primary")) return false;
  const group = bundle[0].group;
  if (bundle.some((s) => s.group !== group)) return false;
  const needed = new Set(sections.filter((s) => s.group === group).map((s) => s.component));
  return needed.size === comps.size;
}

function instructorStats(course: Course, secs: Section[]): { gpa: number | null; rmp: number | null } {
  let gpa: number | null = null;
  let rmp: number | null = null;
  for (const s of secs) {
    if (s.component !== "primary") continue;
    for (const k of s.instructors) {
      const ins = course.instructors[k];
      const g = ins?.gpa && !ins.gpa.limited ? (ins.gpa.recent ?? ins.gpa.avg) : null;
      if (g !== null && (gpa === null || g > gpa)) gpa = g;
      const r = ins?.rmp?.rating ?? null;
      if (r !== null && (rmp === null || r > rmp)) rmp = r;
    }
  }
  if (gpa === null) gpa = course.gpa?.recent ?? course.gpa?.avg ?? null;
  return { gpa, rmp };
}

/** Bundles with hard preferences applied and equivalent ones (same times + campus areas) merged. */
export function prepareBundles(input: CourseInput, term: string, prefs: Prefs): Bundle[] {
  const block = input.course.terms[term];
  if (!block) return [];
  const raw = buildBundles(block.sections, input.key, prefs.includeSpecial, input.locked).filter((b) => input.locked.every((crn) => !block.sections.some((s) => s.crn === crn) || b.some((s) => s.crn === crn)));
  const byKey = new Map<string, Bundle>();
  for (const secs of raw) {
    const meetings = secs.flatMap((s) => sectionMeetings(s, input.key));
    if (!hardOk(meetings, prefs)) continue;
    const { gpa, rmp } = instructorStats(input.course, secs);
    const sig = meetings
      .map((m) => `${m.d}:${m.s}:${m.e}:${m.part}:${m.s === null ? "" : areaOf(m.b)}`)
      .sort()
      .join("|");
    const cur = byKey.get(sig);
    const b: Bundle = { course: input.key, sections: secs, meetings, crns: secs.map((s) => s.crn), gpa, rmp, alternatives: [] };
    if (!cur) byKey.set(sig, { ...b, alternatives: [secs] });
    else {
      cur.alternatives.push(secs);
      if (bundleValue(b, prefs) > bundleValue(cur, prefs)) byKey.set(sig, { ...b, alternatives: cur.alternatives });
    }
  }
  return [...byKey.values()];
}

function bundleValue(b: Bundle, prefs: Prefs): number {
  return prefs.weights.gpa * ((b.gpa ?? 3) - 2) / 2 + prefs.weights.rmp * (((b.rmp ?? 3) - 1) / 4) + (b.sections.every((s) => !/closed/i.test(s.status)) ? 0.01 : 0);
}

function hardOk(meetings: Mtg[], prefs: Prefs): boolean {
  for (const m of meetings) {
    if (m.s === null) continue;
    if (prefs.earliest !== null && m.s < prefs.earliest) return false;
    if (prefs.noFriday && m.d & 16) return false;
    for (const bl of prefs.blocked) if (meetingsConflict(m, { d: bl.d, s: bl.s, e: bl.e, part: "1" })) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------------------------------------

export type GenerateResult = {
  schedules: Schedule[];
  total: number; // complete conflict-free schedules scored (after pruning)
  truncated: boolean; // enumeration hit the cap
  emptyCourses: string[]; // courses with no bundle after hard filters
  ms: number;
};

const DAY_NAMES: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [4, "Wed"],
  [8, "Thu"],
  [16, "Fri"],
];

export function scheduleStats(bundles: Bundle[], credits: number[]): ScheduleStats {
  const timed = bundles.flatMap((b) => b.meetings).filter((m) => m.s !== null && m.e !== null);
  let used = 0;
  for (const m of timed) used |= m.d;
  const daysOff = DAY_NAMES.filter(([bit]) => !(used & bit)).map(([, n]) => n);
  let gap = 0;
  let b2b = 0;
  let far = 0;
  for (const [bit] of DAY_NAMES) {
    const day = timed.filter((m) => m.d & bit).sort((a, b) => a.s! - b.s!);
    for (let i = 1; i < day.length; i++) {
      const g = day[i].s! - day[i - 1].e!;
      if (g > 10) gap += g - 10;
      if (backToBack(day[i - 1], day[i])) {
        b2b++;
        if (areaOf(day[i - 1].b) !== areaOf(day[i].b) && areaOf(day[i - 1].b) !== "?" && areaOf(day[i].b) !== "?") far++;
      }
    }
  }
  let wsum = 0;
  let gsum = 0;
  bundles.forEach((b, i) => {
    if (b.gpa !== null) {
      wsum += credits[i] || 3;
      gsum += (credits[i] || 3) * b.gpa;
    }
  });
  return {
    expectedGpa: wsum ? gsum / wsum : null,
    daysOff,
    earliest: timed.length ? Math.min(...timed.map((m) => m.s!)) : null,
    latest: timed.length ? Math.max(...timed.map((m) => m.e!)) : null,
    gapMinutes: gap,
    backToBack: b2b,
    backToBackFar: far,
  };
}

export function scoreSchedule(st: ScheduleStats, bundles: Bundle[], prefs: Prefs): number {
  const w = prefs.weights;
  const gpa = st.expectedGpa === null ? 0.5 : Math.max(0, Math.min(1, (st.expectedGpa - 2) / 2));
  const rmps = bundles.map((b) => b.rmp).filter((r): r is number => r !== null);
  const rmp = rmps.length ? (rmps.reduce((a, b) => a + b, 0) / rmps.length - 1) / 4 : 0.5;
  const timed = bundles.flatMap((b) => b.meetings).filter((m) => m.s !== null);
  let earlyDays = 0;
  for (const [bit] of DAY_NAMES) if (timed.some((m) => m.d & bit && m.s! < 600)) earlyDays++;
  const early = 1 - earlyDays / 5;
  const daysOff = st.daysOff.length / 5;
  const compact = 1 - Math.min(st.gapMinutes / 900, 1);
  const walking = 1 - Math.min(st.backToBackFar / 3, 1);
  return w.gpa * gpa + w.rmp * rmp + w.early * early + w.daysOff * daysOff + w.compact * compact + w.walking * walking;
}

const popcount5 = (x: number) => [1, 2, 4, 8, 16].filter((b) => x & b).length;

type Node = { b: Bundle; timed: Mtg[]; days: number; early: number };

function farPairs(a: Mtg[], b: Mtg[]): number {
  let n = 0;
  for (const x of a)
    for (const y of b)
      if (backToBack(x, y)) {
        const ax = areaOf(x.b), ay = areaOf(y.b);
        if (ax !== ay && ax !== "?" && ay !== "?") n++;
      }
  return n;
}

/**
 * Branch and bound over courses (fewest options first, best bundles first). Each score term has an
 * optimistic bound for a partial schedule (days used, early days and rushed walks only grow; GPA/RMP use each
 * remaining course's best bundle; compactness is assumed perfect), so branches that can't beat the current
 * top `limit` are pruned. `budgetMs` is a safety net: if hit, the best schedules found so far are returned.
 */
export function generate(inputs: CourseInput[], term: string, prefs: Prefs, limit = 50, budgetMs = 1500): GenerateResult {
  const t0 = Date.now();
  const w = prefs.weights;
  const prepared = inputs.map((inp) => ({ inp, bundles: prepareBundles(inp, term, prefs) }));
  const emptyCourses = prepared.filter((p) => !p.bundles.length).map((p) => p.inp.key);
  const active = prepared.filter((p) => p.bundles.length).sort((a, b) => a.bundles.length - b.bundles.length);
  const credits = active.map((p) => p.inp.credits || 3);
  const levels: Node[][] = active.map((p) =>
    p.bundles
      .map((b) => {
        const timed = b.meetings.filter((m) => m.s !== null && m.e !== null);
        let days = 0, early = 0;
        for (const m of timed) {
          days |= m.d;
          if (m.s! < 600) early |= m.d;
        }
        return { b, timed, days, early };
      })
      .sort((x, y) => bundleValue(y.b, prefs) - bundleValue(x.b, prefs) || popcount5(x.days) - popcount5(y.days)),
  );
  // best possible GPA / RMP per remaining level (suffix sums)
  const maxG = levels.map((l) => Math.max(...l.map((n) => n.b.gpa ?? -1)));
  const maxR = levels.map((l) => Math.max(...l.map((n) => n.b.rmp ?? -1)));
  // days / early days every bundle of a level uses (so any completion must use them too)
  const mustDays = levels.map((l) => l.reduce((acc, n) => acc & n.days, 31));
  const mustEarly = levels.map((l) => l.reduce((acc, n) => acc & n.early, 31));
  // pair[i][j][a * |Lj| + b] = -1 if bundle a (level i) conflicts with bundle b (level j), else # rushed walks
  const pair: Int8Array[][] = levels.map(() => []);
  for (let i = 0; i < levels.length; i++)
    for (let j = i + 1; j < levels.length; j++) {
      const arr = new Int8Array(levels[i].length * levels[j].length);
      levels[i].forEach((na, a) =>
        levels[j].forEach((nb, b) => {
          let v = 0;
          for (const x of na.timed)
            for (const y of nb.timed) {
              if (meetingsConflict(x, y)) {
                v = -1;
                break;
              }
            }
          if (v === 0) v = Math.min(100, farPairs(na.timed, nb.timed));
          arr[a * levels[j].length + b] = v;
        }),
      );
      pair[i][j] = arr;
    }
  const idx: number[] = [];

  const best: Schedule[] = [];
  let worst = -Infinity;
  let total = 0;
  let nodes = 0;
  let truncated = false;
  const chosen: Node[] = [];

  const bound = (depth: number, days: number, early: number, far: number, gW: number, gS: number, rN: number, rS: number) => {
    for (let i = depth; i < levels.length; i++) {
      days |= mustDays[i];
      early |= mustEarly[i];
      if (maxG[i] >= 0) {
        gW += credits[i];
        gS += credits[i] * maxG[i];
      }
      if (maxR[i] >= 0) {
        rN++;
        rS += maxR[i];
      }
    }
    const gpa = gW ? Math.max(0, Math.min(1, (gS / gW - 2) / 2)) : 0.5;
    const rmp = rN ? (rS / rN - 1) / 4 : 0.5;
    return w.gpa * gpa + w.rmp * rmp + w.early * (1 - popcount5(early) / 5) + w.daysOff * ((5 - popcount5(days)) / 5) + w.compact + w.walking * (1 - Math.min(far / 3, 1));
  };

  const rec = (i: number, days: number, early: number, far: number, gW: number, gS: number, rN: number, rS: number) => {
    if (truncated) return;
    if (++nodes % 2048 === 0 && Date.now() - t0 > budgetMs) {
      truncated = true;
      return;
    }
    if (i === levels.length) {
      total++;
      // cheap exact score; build the full stats object only for schedules that make the top list
      const gpa = gW ? Math.max(0, Math.min(1, (gS / gW - 2) / 2)) : 0.5;
      const rmp = rN ? (rS / rN - 1) / 4 : 0.5;
      let gap = 0;
      for (const bit of [1, 2, 4, 8, 16]) {
        const day: Mtg[] = [];
        for (const c of chosen) for (const m of c.timed) if (m.d & bit) day.push(m);
        if (day.length < 2) continue;
        day.sort((a, b) => a.s! - b.s!);
        for (let k = 1; k < day.length; k++) {
          const gg = day[k].s! - day[k - 1].e!;
          if (gg > 10) gap += gg - 10;
        }
      }
      const score =
        w.gpa * gpa + w.rmp * rmp + w.early * (1 - popcount5(early) / 5) + w.daysOff * ((5 - popcount5(days)) / 5) +
        w.compact * (1 - Math.min(gap / 900, 1)) + w.walking * (1 - Math.min(far / 3, 1));
      if (best.length < limit || score > worst) {
        const bundles = chosen.map((n) => n.b);
        const sched = { bundles, score, stats: scheduleStats(bundles, credits) };
        let pos = best.findIndex((x) => x.score < score);
        if (pos < 0) pos = best.length;
        best.splice(pos, 0, sched);
        if (best.length > limit) best.pop();
        worst = best.length >= limit ? best[best.length - 1].score : -Infinity;
      }
      return;
    }
    const Lj = levels[i].length;
    outer: for (let b = 0; b < Lj; b++) {
      const n = levels[i][b];
      let addFar = 0;
      for (let k = 0; k < i; k++) {
        const v = pair[k][i][idx[k] * Lj + b];
        if (v < 0) continue outer;
        addFar += v;
      }
      const g = n.b.gpa, r = n.b.rmp;
      const ngW = gW + (g !== null ? credits[i] : 0), ngS = gS + (g !== null ? credits[i] * g : 0);
      const nrN = rN + (r !== null ? 1 : 0), nrS = rS + (r ?? 0);
      if (best.length >= limit && bound(i + 1, days | n.days, early | n.early, far + addFar, ngW, ngS, nrN, nrS) <= worst + 1e-9) continue;
      chosen.push(n);
      idx.push(b);
      rec(i + 1, days | n.days, early | n.early, far + addFar, ngW, ngS, nrN, nrS);
      chosen.pop();
      idx.pop();
      if (truncated) return;
    }
  };
  if (levels.length) rec(0, 0, 0, 0, 0, 0, 0, 0);
  const order = new Map(inputs.map((x, i) => [x.key, i]));
  for (const s of best) s.bundles.sort((a, b) => (order.get(a.course) ?? 0) - (order.get(b.course) ?? 0));
  return { schedules: best, total, truncated, emptyCourses, ms: Date.now() - t0 };
}

/** Why a course has no usable bundle, in words a student can act on. */
export function explainEmpty(input: CourseInput, term: string, prefs: Prefs): string {
  const block = input.course.terms[term];
  if (!block || !block.sections.length) return "it isn't offered this term";
  const all = buildBundles(block.sections, input.key, true, input.locked);
  const locked = input.locked.filter((c) => block.sections.some((s) => s.crn === c));
  const withLocks = all.filter((b) => locked.every((c) => b.some((s) => s.crn === c)));
  if (locked.length && !withLocks.length) {
    const codes = locked.map((c) => block.sections.find((s) => s.crn === c)!.code).join(" + ");
    return `the locked sections ${codes} can't be taken together (they belong to different lecture groups or overlap)`;
  }
  const visible = prefs.includeSpecial ? withLocks : withLocks.filter((b) => b.every((s) => !s.special || locked.includes(s.crn)));
  if (!visible.length) return "only special/restricted-looking sections are left (tick “Include special sections” to allow them)";
  return "every section breaks one of your rules (no classes before, no Friday, or a blocked time)";
}

/** Pairs of courses that can never be scheduled together under the current rules. */
export function clashingPairs(inputs: CourseInput[], term: string, prefs: Prefs): string[] {
  const prepared = inputs.map((inp) => ({ key: inp.key, bundles: prepareBundles(inp, term, prefs) })).filter((p) => p.bundles.length);
  const out: string[] = [];
  for (let i = 0; i < prepared.length; i++)
    for (let j = i + 1; j < prepared.length; j++) {
      const ok = prepared[i].bundles.some((a) =>
        prepared[j].bundles.some((b) => !a.meetings.some((m) => b.meetings.some((n) => meetingsConflict(m, n)))),
      );
      if (!ok) {
        const times = (bs: Bundle[]) =>
          [...new Set(bs.flatMap((b) => b.meetings.filter((m) => m.s !== null).map((m) => `${dayLetters(m.d)} ${hhmm(m.s!)}–${hhmm(m.e!)}`)))].slice(0, 2).join(", ");
        out.push(`${prepared[i].key} (${times(prepared[i].bundles)}) always overlaps ${prepared[j].key} (${times(prepared[j].bundles)})`);
      }
    }
  return out;
}

function dayLetters(mask: number): string {
  return [
    [1, "M"],
    [2, "T"],
    [4, "W"],
    [8, "R"],
    [16, "F"],
  ]
    .filter(([b]) => mask & (b as number))
    .map(([, l]) => l)
    .join("");
}
function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  return `${h % 12 || 12}:${String(min % 60).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

export function summaryLine(st: ScheduleStats, fmt: (m: number | null) => string): string {
  const parts: string[] = [];
  if (st.expectedGpa !== null) parts.push(`Expected GPA ${st.expectedGpa.toFixed(2)}`);
  const plural: Record<string, string> = { Mon: "Mondays", Tue: "Tuesdays", Wed: "Wednesdays", Thu: "Thursdays", Fri: "Fridays" };
  if (st.daysOff.length === 1) parts.push(`${plural[st.daysOff[0]]} off`);
  else if (st.daysOff.length > 1) parts.push(`${st.daysOff.join(" + ")} off`);
  if (st.earliest !== null) parts.push(`earliest ${fmt(st.earliest)}`);
  if (st.backToBackFar) parts.push(`${st.backToBackFar} rushed walk${st.backToBackFar > 1 ? "s" : ""}`);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------------------------------------

export function warnings(inputs: CourseInput[], term: string, schedule: Schedule | null, termLabel: string): string[] {
  const out: string[] = [];
  for (const inp of inputs) {
    const block = inp.course.terms[term];
    if (!block || !block.sections.length) out.push(`${inp.key} is not offered in ${termLabel}.`);
  }
  const credits = inputs.filter((i) => i.course.terms[term]?.sections.length).reduce((a, i) => a + i.credits, 0);
  if (credits > 18) out.push(`${credits} credit hours: more than 18 needs approval from your college.`);
  if (schedule) {
    for (const b of schedule.bundles)
      for (const s of b.sections) {
        if (/closed/i.test(s.status)) out.push(`${b.course} ${s.code} (CRN ${s.crn}) was Closed at the last snapshot.`);
        else if (/restricted/i.test(s.status)) out.push(`${b.course} ${s.code} (CRN ${s.crn}) is Restricted: check who can register.`);
      }
  }
  return out;
}
