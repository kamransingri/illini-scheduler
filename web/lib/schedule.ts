// Schedule builder engine: section bundles, conflicts, backtracking generator, ranking. Pure functions.
import type { Course, Section } from "./types";
import { rushedWalk } from "./walk";
import { K_RMP_RATINGS, shrink } from "./score";
import { examConflicts } from "./finals";

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
  /** the lecture's professor with the highest best-pick score (0-100, as on the course page), null if none is scored */
  prof: { key: string; score: number } | null;
  /** how many equivalent alternatives (same times + areas) this bundle represents */
  alternatives: Section[][];
};

export type CourseInput = {
  key: string;
  course: Course;
  credits: number;
  locked: string[];
  /** time locks (#139): one of the course's sections must meet on these days at this start minute */
  at?: { d: number; s: number }[];
  /** UIUC-wide mean RMP quality; when set, ratings from few students are pulled toward it, as in the best-pick score */
  rmpPrior?: number | null;
  /** each professor's best-pick score for this course and term (lib/rank.ts rankProfs), by instructor key */
  profScores?: Record<string, number | null>;
  /** CRNs whose restriction clearly excludes the student (lib/restrictions.ts), skipped when `eligibleOnly` is on */
  cannot?: string[];
};

/** Must-haves (hard rules: a schedule breaking one is never shown) and what matters to you (weights 0-3). */
export type Prefs = {
  earliest: number | null; // hard: no meeting may start before this (minutes); 540 = "no 8am"
  latest: number | null; // hard: no meeting may end after this (minutes)
  daysOff: number; // hard: weekdays to keep free (bit mask, M=1 ... F=16)
  blocked: { d: number; s: number; e: number }[]; // hard: work, practice
  lunch: boolean; // hard: a break of lunchMin minutes between lunchFrom and lunchTo on every day with class
  lunchFrom: number; // the lunch window (minutes), 11am-2pm unless the student changes it (#56)
  lunchTo: number;
  lunchMin: number; // the shortest free stretch that counts as lunch
  openOnly: boolean; // hard: skip sections that were Closed at the last check (locked ones are kept)
  includeSpecial: boolean; // allow sections flagged as restricted / special-program
  eligibleOnly: boolean; // hard: skip sections whose restriction clearly excludes the student (About you, #81; locked ones are kept)
  noRushedWalks: boolean; // hard: no class may start before you can walk there from the one before it (#94)
  softEarly: number; // "too early": a class starting before this counts against `early` (minutes)
  softLate: number; // "too late": a class ending after this counts against `late` (minutes)
  weights: { gpa: number; rmp: number; early: number; late: number; daysOff: number; compact: number; walking: number; open: number; prof: number };
};

/** The default lunch window and the shortest break that counts as lunch. */
export const LUNCH = { from: 660, to: 840, min: 45 };

export const DEFAULT_PREFS: Prefs = {
  earliest: null,
  latest: null,
  daysOff: 0,
  blocked: [],
  lunch: false,
  lunchFrom: LUNCH.from,
  lunchTo: LUNCH.to,
  lunchMin: LUNCH.min,
  openOnly: false,
  includeSpecial: false,
  eligibleOnly: true,
  noRushedWalks: false,
  softEarly: 600,
  softLate: 1020,
  weights: { gpa: 2, rmp: 1, early: 1, late: 0, daysOff: 1, compact: 1, walking: 1, open: 1, prof: 2 },
};

export type LunchWindow = { from: number; to: number; min: number };

/** The student's lunch window. */
export const lunchOf = (p: Pick<Prefs, "lunchFrom" | "lunchTo" | "lunchMin">): LunchWindow => ({ from: p.lunchFrom, to: p.lunchTo, min: p.lunchMin });

/** Closed at the last check (Course Explorer's status; "Open (Restricted)" isn't closed). */
export function isClosed(s: Section): boolean {
  return /closed/i.test(s.status);
}

export type Schedule = { bundles: Bundle[]; score: number; stats: ScheduleStats };

export type ScheduleStats = {
  expectedGpa: number | null;
  daysOff: string[];
  earliest: number | null;
  latest: number | null;
  gapMinutes: number;
  backToBackFar: number;
  backToBack: number;
  /** each walk longer than the gap before the next class (#94); walk null when a building has no location */
  walks: RushedWalk[];
};

export type RushedWalk = { day: string; from: string; to: string; fromCourse: string; toCourse: string; walk: number | null; gap: number };

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

export function sectionMeetings(s: Section, course: string): Mtg[] {
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

export function instructorStats(course: Course, secs: Section[], rmpPrior: number | null = null): { gpa: number | null; rmp: number | null } {
  let gpa: number | null = null;
  let rmp: number | null = null;
  for (const s of secs) {
    if (s.component !== "primary") continue;
    for (const k of s.instructors) {
      const ins = course.instructors[k];
      const g = ins?.gpa && !ins.gpa.limited ? (ins.gpa.recent ?? ins.gpa.avg) : null;
      if (g !== null && (gpa === null || g > gpa)) gpa = g;
      const rm = ins?.rmp;
      const r = rm && rm.num_ratings > 0 && rm.rating !== null ? shrink(rm.rating, rm.num_ratings, rmpPrior, K_RMP_RATINGS) : null;
      if (r !== null && (rmp === null || r > rmp)) rmp = r;
    }
  }
  if (gpa === null) gpa = course.gpa?.recent ?? course.gpa?.avg ?? null;
  return { gpa, rmp };
}

/** The lecture professor with the highest best-pick score among a bundle's primary sections (#49). */
export function bundleProf(secs: Section[], scores: Record<string, number | null> | undefined): Bundle["prof"] {
  let best: Bundle["prof"] = null;
  for (const s of secs) {
    if (s.component !== "primary") continue;
    for (const k of s.instructors) {
      const v = scores?.[k];
      if (v !== null && v !== undefined && (!best || v > best.score)) best = { key: k, score: v };
    }
  }
  return best;
}

/** A professor score on the 0-1 scale the other priorities use; an unscored lecture counts as average. */
const profValue = (p: Bundle["prof"]) => (p ? p.score / 100 : 0.5);

/** Bundles with hard preferences applied and equivalent ones (same times + campus areas) merged. */
export function prepareBundles(input: CourseInput, term: string, prefs: Prefs): Bundle[] {
  const block = input.course.terms[term];
  if (!block) return [];
  const raw = buildBundles(block.sections, input.key, prefs.includeSpecial, input.locked).filter(
    (b) =>
      input.locked.every((crn) => !block.sections.some((s) => s.crn === crn) || b.some((s) => s.crn === crn)) &&
      meetsAt(b, input.at) &&
      (!prefs.openOnly || b.every((s) => !isClosed(s) || input.locked.includes(s.crn))) &&
      (!prefs.eligibleOnly || b.every((s) => !input.cannot?.includes(s.crn) || input.locked.includes(s.crn))),
  );
  const byKey = new Map<string, Bundle>();
  for (const secs of raw) {
    const meetings = secs.flatMap((s) => sectionMeetings(s, input.key));
    if (!hardOk(meetings, prefs)) continue;
    const { gpa, rmp } = instructorStats(input.course, secs, input.rmpPrior ?? null);
    const sig = meetings
      .map((m) => `${m.d}:${m.s}:${m.e}:${m.part}:${m.s === null ? "" : m.b}`)
      .sort()
      .join("|");
    const cur = byKey.get(sig);
    const b: Bundle = { course: input.key, sections: secs, meetings, crns: secs.map((s) => s.crn), gpa, rmp, prof: bundleProf(secs, input.profScores), alternatives: [] };
    if (!cur) byKey.set(sig, { ...b, alternatives: [secs] });
    else {
      cur.alternatives.push(secs);
      if (bundleValue(b, prefs) > bundleValue(cur, prefs)) byKey.set(sig, { ...b, alternatives: cur.alternatives });
    }
  }
  return [...byKey.values()];
}

/** The sections of a schedule that were Closed at the last check, in schedule order: the ones to watch (#27). */
export function sectionsToWatch(s: Pick<Schedule, "bundles">): { course: string; section: Section }[] {
  return s.bundles.flatMap((b) => b.sections.filter(isClosed).map((section) => ({ course: b.course, section })));
}

/** 1 when none of the bundle's sections was Closed at the last check. */
export function bundleOpen(b: Pick<Bundle, "sections">): number {
  return b.sections.some(isClosed) ? 0 : 1;
}

/** How good one course's section choice is on its own: decides which of several same-time sections represents them
 * (so with Best professor on, the better professor's section is the one shown) and the order the search tries them. */
function bundleValue(b: Bundle, prefs: Prefs): number {
  return (
    prefs.weights.gpa * ((b.gpa ?? 3) - 2) / 2 + prefs.weights.rmp * (((b.rmp ?? 3) - 1) / 4) + prefs.weights.prof * profValue(b.prof) + (prefs.weights.open + 0.01) * bundleOpen(b)
  );
}

/** The first must-have these meetings break, in words ("it starts at 8:00am, before 9:00am"), or null. A course's own
 * meetings that leave no lunch break can't get one back from other courses, so the lunch break is checked here too. */
export function brokenRule(meetings: Pick<Mtg, "d" | "s" | "e" | "part">[], prefs: Prefs): string | null {
  for (const m of meetings) {
    if (m.s === null || m.e === null) continue;
    if (prefs.earliest !== null && m.s < prefs.earliest) return `it starts at ${hhmm(m.s)}, before ${hhmm(prefs.earliest)}`;
    if (prefs.latest !== null && m.e > prefs.latest) return `it ends at ${hhmm(m.e)}, after ${hhmm(prefs.latest)}`;
    if (prefs.daysOff & m.d) return `it meets on ${dayLetters(prefs.daysOff & m.d)}, a day you keep free`;
    for (const bl of prefs.blocked)
      if (meetingsConflict(m, { d: bl.d, s: bl.s, e: bl.e, part: "1" })) return `it overlaps your blocked time ${dayLetters(bl.d)} ${hhmm(bl.s)}–${hhmm(bl.e)}`;
  }
  if (prefs.lunch && !hasLunch(meetings, lunchOf(prefs))) return `it leaves no ${prefs.lunchMin}-minute lunch break between ${hhmm(prefs.lunchFrom)} and ${hhmm(prefs.lunchTo)}`;
  return null;
}

const hardOk = (meetings: Mtg[], prefs: Prefs) => brokenRule(meetings, prefs) === null && !(prefs.noRushedWalks && rushedPairs(meetings, meetings) > 0);

/** Rushed walks between two sets of meetings, either way round (#94); the same set twice counts each pair once. */
function rushedPairs(a: Mtg[], b: Mtg[]): number {
  let n = 0;
  for (const x of a)
    for (const y of b) {
      if (a === b && x === y) continue;
      if (!partsOverlap(x.part, y.part) || meetingsConflict(x, y)) continue;
      if (rushedWalk(x, y)) n++;
      else if (a !== b && rushedWalk(y, x)) n++;
    }
  return n;
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
  const walks: RushedWalk[] = [];
  for (const [bit, name] of DAY_NAMES) {
    const day = timed.filter((m) => m.d & bit).sort((a, b) => a.s! - b.s!);
    for (let i = 1; i < day.length; i++) {
      const g = day[i].s! - day[i - 1].e!;
      if (g > 10) gap += g - 10;
      if (backToBack(day[i - 1], day[i])) b2b++;
      const [x, y] = [day[i - 1], day[i]];
      const r = partsOverlap(x.part, y.part) && !meetingsConflict(x, y) ? rushedWalk(x, y) : null;
      if (r) walks.push({ day: name, from: x.b, to: y.b, fromCourse: x.course, toCourse: y.course, ...r });
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
    backToBackFar: walks.length,
    walks,
  };
}

export function scoreSchedule(st: ScheduleStats, bundles: Bundle[], prefs: Prefs): number {
  const w = prefs.weights;
  const gpa = st.expectedGpa === null ? 0.5 : Math.max(0, Math.min(1, (st.expectedGpa - 2) / 2));
  const rmps = bundles.map((b) => b.rmp).filter((r): r is number => r !== null);
  const rmp = rmps.length ? (rmps.reduce((a, b) => a + b, 0) / rmps.length - 1) / 4 : 0.5;
  const timed = bundles.flatMap((b) => b.meetings).filter((m) => m.s !== null && m.e !== null);
  let earlyDays = 0;
  let lateDays = 0;
  for (const [bit] of DAY_NAMES) {
    if (timed.some((m) => m.d & bit && m.s! < prefs.softEarly)) earlyDays++;
    if (timed.some((m) => m.d & bit && m.e! > prefs.softLate)) lateDays++;
  }
  const daysOff = st.daysOff.length / 5;
  const compact = 1 - Math.min(st.gapMinutes / 900, 1);
  const walking = 1 - Math.min(st.backToBackFar / 3, 1);
  const open = bundles.length ? bundles.reduce((a, b) => a + bundleOpen(b), 0) / bundles.length : 1;
  const profs = bundles.map((b) => b.prof).filter((p): p is NonNullable<Bundle["prof"]> => p !== null);
  const prof = profs.length ? profs.reduce((a, p) => a + p.score, 0) / profs.length / 100 : 0.5;
  return (
    w.gpa * gpa + w.rmp * rmp + w.early * (1 - earlyDays / 5) + w.late * (1 - lateDays / 5) + w.daysOff * daysOff + w.compact * compact + w.walking * walking + w.open * open +
    w.prof * prof
  );
}

/** True when every day with a timed class keeps a free stretch of `win.min` minutes inside the lunch window. */
export function hasLunch(meetings: Pick<Mtg, "d" | "s" | "e">[], win: LunchWindow = LUNCH): boolean {
  for (const [bit] of DAY_NAMES) {
    if (!meetings.some((m) => m.s !== null && m.d & bit)) continue;
    const day = meetings.filter((m) => m.s !== null && m.e !== null && m.d & bit && m.s < win.to && m.e > win.from).sort((a, b) => a.s! - b.s!);
    let free = win.from;
    let ok = false;
    for (const m of day) {
      if (m.s! - free >= win.min) ok = true;
      free = Math.max(free, m.e!);
    }
    if (!ok && win.to - free < win.min) return false;
  }
  return true;
}

const popcount5 = (x: number) => [1, 2, 4, 8, 16].filter((b) => x & b).length;

type Node = { b: Bundle; timed: Mtg[]; days: number; early: number; late: number; open: number };


/**
 * Branch and bound over courses (fewest options first, best bundles first). Each score term has an
 * optimistic bound for a partial schedule (days used, early days and rushed walks only grow; GPA/RMP use each
 * remaining course's best bundle; compactness is assumed perfect), so branches that can't beat the current
 * top `limit` are pruned. `budgetMs` is a safety net: if hit, the best schedules found so far are returned.
 * `firstOnly` stops at the first schedule that fits: enough to ask whether any does.
 */
export function generate(inputs: CourseInput[], term: string, prefs: Prefs, limit = 50, budgetMs = 1500, firstOnly = false): GenerateResult {
  const t0 = Date.now();
  const w = prefs.weights;
  const lunch = lunchOf(prefs);
  const prepared = inputs.map((inp) => ({ inp, bundles: prepareBundles(inp, term, prefs) }));
  const emptyCourses = prepared.filter((p) => !p.bundles.length).map((p) => p.inp.key);
  const active = prepared.filter((p) => p.bundles.length).sort((a, b) => a.bundles.length - b.bundles.length);
  const credits = active.map((p) => p.inp.credits || 3);
  const levels: Node[][] = active.map((p) =>
    p.bundles
      .map((b) => {
        const timed = b.meetings.filter((m) => m.s !== null && m.e !== null);
        let days = 0, early = 0, late = 0;
        for (const m of timed) {
          days |= m.d;
          if (m.s! < prefs.softEarly) early |= m.d;
          if (m.e! > prefs.softLate) late |= m.d;
        }
        return { b, timed, days, early, late, open: bundleOpen(b) };
      })
      .sort((x, y) => bundleValue(y.b, prefs) - bundleValue(x.b, prefs) || popcount5(x.days) - popcount5(y.days)),
  );
  // best possible GPA / RMP per remaining level (suffix sums)
  const maxG = levels.map((l) => Math.max(...l.map((n) => n.b.gpa ?? -1)));
  const maxR = levels.map((l) => Math.max(...l.map((n) => n.b.rmp ?? -1)));
  const maxP = levels.map((l) => Math.max(...l.map((n) => n.b.prof?.score ?? -1)));
  // days / early days every bundle of a level uses (so any completion must use them too)
  const mustDays = levels.map((l) => l.reduce((acc, n) => acc & n.days, 31));
  const mustEarly = levels.map((l) => l.reduce((acc, n) => acc & n.early, 31));
  const mustLate = levels.map((l) => l.reduce((acc, n) => acc & n.late, 31));
  const maxOpen = levels.map((l) => Math.max(...l.map((n) => n.open)));
  const nLevels = levels.length;
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
          if (v === 0) v = Math.min(100, rushedPairs(na.timed, nb.timed));
          if (v > 0 && prefs.noRushedWalks) v = -1;
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

  const bound = (depth: number, days: number, early: number, late: number, open: number, far: number, gW: number, gS: number, rN: number, rS: number, pN: number, pS: number) => {
    for (let i = depth; i < levels.length; i++) {
      days |= mustDays[i];
      early |= mustEarly[i];
      late |= mustLate[i];
      open += maxOpen[i];
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
    // The exact professor term is the average score of the chosen scored lectures (0.5 when none is scored). An average
    // is never above the larger of the average so far and the best score still to come, so that is the bound.
    let prof = pN ? pS / pN / 100 : 0.5;
    for (let i = depth; i < levels.length; i++) if (maxP[i] >= 0) prof = Math.max(prof, maxP[i] / 100);
    return (
      w.gpa * gpa + w.rmp * rmp + w.early * (1 - popcount5(early) / 5) + w.late * (1 - popcount5(late) / 5) + w.daysOff * ((5 - popcount5(days)) / 5) + w.compact +
      w.walking * (1 - Math.min(far / 3, 1)) + w.open * (nLevels ? open / nLevels : 1) + w.prof * prof
    );
  };

  const rec = (i: number, days: number, early: number, late: number, open: number, far: number, gW: number, gS: number, rN: number, rS: number, pN: number, pS: number) => {
    if (truncated || (firstOnly && total)) return;
    if (++nodes % 2048 === 0 && Date.now() - t0 > budgetMs) {
      truncated = true;
      return;
    }
    if (i === levels.length) {
      if (prefs.lunch && !hasLunch(chosen.flatMap((c) => c.timed), lunch)) return;
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
      const prof = pN ? pS / pN / 100 : 0.5;
      const score =
        w.gpa * gpa + w.rmp * rmp + w.early * (1 - popcount5(early) / 5) + w.late * (1 - popcount5(late) / 5) + w.daysOff * ((5 - popcount5(days)) / 5) +
        w.compact * (1 - Math.min(gap / 900, 1)) + w.walking * (1 - Math.min(far / 3, 1)) + w.open * (nLevels ? open / nLevels : 1) + w.prof * prof;
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
      const p = n.b.prof;
      const npN = pN + (p ? 1 : 0), npS = pS + (p ? p.score : 0);
      if (best.length >= limit && bound(i + 1, days | n.days, early | n.early, late | n.late, open + n.open, far + addFar, ngW, ngS, nrN, nrS, npN, npS) <= worst + 1e-9) continue;
      chosen.push(n);
      idx.push(b);
      rec(i + 1, days | n.days, early | n.early, late | n.late, open + n.open, far + addFar, ngW, ngS, nrN, nrS, npN, npS);
      chosen.pop();
      idx.pop();
      if (truncated || (firstOnly && total)) return;
    }
  };
  if (levels.length) rec(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  const order = new Map(inputs.map((x, i) => [x.key, i]));
  for (const s of best) s.bundles.sort((a, b) => (order.get(a.course) ?? 0) - (order.get(b.course) ?? 0));
  return { schedules: best, total, truncated, emptyCourses, ms: Date.now() - t0 };
}

/** Does a combination of sections meet at every time lock (#139)? */
const meetsAt = (b: Section[], at: CourseInput["at"]) => !at?.length || at.every((t) => b.some((s) => s.meetings.some((m) => m.d === t.d && m.s === t.s)));
/** "11:00am MWF" for time locks. */
const atLabel = (at: NonNullable<CourseInput["at"]>) => at.map((t) => `${hhmm(t.s)} ${dayLetters(t.d)}`).join(" and ");

/** Why a course has no usable bundle, in words a student can act on. */
export function explainEmpty(input: CourseInput, term: string, prefs: Prefs): string {
  const block = input.course.terms[term];
  if (!block || !block.sections.length) return "it isn't offered this term";
  const all = buildBundles(block.sections, input.key, true, input.locked);
  const locked = input.locked.filter((c) => block.sections.some((s) => s.crn === c));
  const crnLocked = all.filter((b) => locked.every((c) => b.some((s) => s.crn === c)));
  if (locked.length && !crnLocked.length) {
    const codes = locked.map((c) => block.sections.find((s) => s.crn === c)!.code).join(" + ");
    return `the locked sections ${codes} can't be taken together (they belong to different lecture groups or overlap)`;
  }
  const withLocks = crnLocked.filter((b) => meetsAt(b, input.at));
  if (!withLocks.length) return `no section meets at your ${atLabel(input.at!)} lock${locked.length ? ` together with your locked ${lockedCodes(input, block.sections)}` : ""}`;
  const visible = prefs.includeSpecial ? withLocks : withLocks.filter((b) => b.every((s) => !s.special || locked.includes(s.crn)));
  if (!visible.length) return "only special/restricted-looking sections are left (tick “Include special sections” to allow them)";
  const open = prefs.openOnly ? visible.filter((b) => b.every((s) => !isClosed(s) || locked.includes(s.crn))) : visible;
  if (!open.length) return "every section was Closed at the last check (turn off “Open sections only” to plan around a waitlist)";
  const eligible = prefs.eligibleOnly ? open.filter((b) => b.every((s) => !input.cannot?.includes(s.crn) || locked.includes(s.crn))) : open;
  if (!eligible.length) return "every section is restricted to students you aren't, going by About you (turn off “Only sections I can register for” to see them anyway)";
  for (const crn of locked) {
    const s = block.sections.find((x) => x.crn === crn)!;
    const why = brokenRule(sectionMeetings(s, input.key), prefs);
    if (why) return `your locked ${s.code} ${s.type} (${sectionTimes(s)}) breaks a must-have: ${why}`;
  }
  if (locked.length) return `every combination with your locked ${lockedCodes(input, block.sections)} breaks one of your must-haves (start or end time, days off, a blocked time or the lunch break)`;
  if (input.at?.length) return `every section at your ${atLabel(input.at)} lock breaks one of your must-haves (start or end time, days off, a blocked time or the lunch break)`;
  return "every section breaks one of your must-haves (start or end time, days off, a blocked time or the lunch break)";
}

/** "MWF 11:00am–11:50am" for a section's timed meetings, "no set time" when it has none. */
function sectionTimes(s: Section): string {
  const t = s.meetings.filter((m) => m.s !== null && m.e !== null).map((m) => `${dayLetters(m.d)} ${hhmm(m.s!)}–${hhmm(m.e!)}`);
  return t.length ? t.join(", ") : "no set time";
}

/** The locked sections of a course that are offered in the term, by code ("AL1 + AD3"). */
function lockedSections(input: CourseInput, sections: Section[]): Section[] {
  return sections.filter((s) => input.locked.includes(s.crn));
}
const lockedCodes = (input: CourseInput, sections: Section[]) => lockedSections(input, sections).map((s) => s.code).join(" + ");

export type Clash = { a: string; b: string; text: string; locked: boolean };

/** Pairs of courses that can never be scheduled together under the current rules. A course with locked sections is
 * described by them ("your locked STAT 107 AL1 (MWF 11:00am–11:50am)"), since they are what can't move. */
export function clashingPairs(inputs: CourseInput[], term: string, prefs: Prefs): Clash[] {
  const prepared = inputs
    .map((inp) => ({ inp, locked: lockedSections(inp, inp.course.terms[term]?.sections ?? []), bundles: prepareBundles(inp, term, prefs) }))
    .filter((p) => p.bundles.length);
  const out: Clash[] = [];
  const label = (p: (typeof prepared)[number], first: boolean) => {
    if (p.locked.length) return `${first ? "Your" : "your"} locked ${p.inp.key} ${p.locked.map((s) => s.code).join(" + ")} (${p.locked.map(sectionTimes).join("; ")})`;
    if (p.inp.at?.length) return `${first ? "Your" : "your"} ${atLabel(p.inp.at)} lock for ${p.inp.key}`;
    const times = [...new Set(p.bundles.flatMap((b) => b.meetings.filter((m) => m.s !== null).map((m) => `${dayLetters(m.d)} ${hhmm(m.s!)}–${hhmm(m.e!)}`)))];
    return `${p.inp.key} (${times.slice(0, 2).join(", ")})`;
  };
  for (let i = 0; i < prepared.length; i++)
    for (let j = i + 1; j < prepared.length; j++) {
      const ok = prepared[i].bundles.some((a) => prepared[j].bundles.some((b) => !a.meetings.some((m) => b.meetings.some((n) => meetingsConflict(m, n)))));
      if (ok) continue;
      const [a, b] = prepared[j].locked.length && !prepared[i].locked.length ? [prepared[j], prepared[i]] : [prepared[i], prepared[j]];
      const verb = b.locked.length ? "overlaps" : "overlaps every section of";
      out.push({
        a: a.inp.key,
        b: b.inp.key,
        text: a.locked.length ? `${label(a, true)} ${verb} ${b.locked.length ? label(b, false) : `${b.inp.key} that fits your must-haves`}` : `${label(a, true)} always overlaps ${label(b, false)}`,
        locked: !!(a.locked.length || b.locked.length),
      });
    }
  return out;
}

export type LockBlame = { each: string[]; all: boolean };

/**
 * When no schedule fits: the courses whose locked sections are the reason, found by trying again without them (#67).
 * `each`: unlocking any one of these courses gives at least one schedule. `all`: no single unlock is enough, but
 * unlocking every course does. Both empty: the locks aren't the problem (or nothing is locked).
 */
export function locksToBlame(inputs: CourseInput[], term: string, prefs: Prefs, budgetMs = 300): LockBlame {
  const lockedKeys = inputs.filter((i) => lockedSections(i, i.course.terms[term]?.sections ?? []).length || i.at?.length).map((i) => i.key);
  const fits = (unlock: string[]) => generate(inputs.map((i) => (unlock.includes(i.key) ? { ...i, locked: [], at: [] } : i)), term, prefs, 1, budgetMs, true).total > 0;
  const each = lockedKeys.filter((k) => fits([k]));
  return { each, all: !each.length && lockedKeys.length > 1 && fits(lockedKeys) };
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

/**
 * `restriction` (#81) words a section's restriction for this student: a string to show, null for nothing to say,
 * undefined to fall back to the plain "is Restricted" line.
 */
export function warnings(
  inputs: CourseInput[],
  term: string,
  schedule: Schedule | null,
  termLabel: string,
  restriction?: (course: string, s: Section) => string | null | undefined,
): string[] {
  const out: string[] = [];
  for (const inp of inputs) {
    const block = inp.course.terms[term];
    if (!block || !block.sections.length) out.push(`${inp.key} is not offered in ${termLabel}.`);
  }
  // credit-hour limits are lib/credits.ts hourWarnings, shown with a link to the Registrar's rule
  if (schedule) {
    for (const b of schedule.bundles)
      for (const s of b.sections) {
        if (/closed/i.test(s.status)) out.push(`${b.course} ${s.code} (CRN ${s.crn}) was Closed at the last snapshot.`);
        const note = restriction?.(b.course, s);
        if (note) out.push(note);
        else if (note === undefined && /restricted/i.test(s.status) && !/closed/i.test(s.status))
          out.push(`${b.course} ${s.code} (CRN ${s.crn}) is Restricted: check who can register.`);
      }
    out.push(...examConflicts(schedule).map((c) => c.text));
  }
  return out;
}

