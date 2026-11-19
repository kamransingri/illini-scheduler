// Registration backups (#74, #75, #77; DECISIONS.md D37): for each section of a chosen schedule, the best other
// sections of that course that still fit everything else in the schedule, so a section that fills during
// registration can be swapped without rebuilding the week.
import {
  brokenRule,
  buildBundles,
  bundleProf,
  hasLunch,
  instructorStats,
  lunchOf,
  meetingsConflict,
  scheduleStats,
  scoreSchedule,
  sectionMeetings,
  type Bundle,
  type CourseInput,
  type Mtg,
  type Prefs,
  type Schedule,
} from "./schedule";
import type { Section } from "./types";

export type Backup = {
  bundle: Bundle;
  /** the sections that change (the rest of the course's sections stay) */
  changed: Section[];
  /** the schedule's score with this backup minus the score with the chosen section */
  delta: number;
  sameTime: boolean;
  sameProf: boolean;
};

export type SectionBackups = {
  course: string;
  section: Section;
  backups: Backup[];
  /** why there is none, in words, when `backups` is empty */
  none: string | null;
};

/** Status to trust for a section: the live feed's when it has one (#77), else the last snapshot's. */
export type StatusOf = (crn: string) => string | undefined;
const closed = (s: Section, statusOf?: StatusOf) => /closed/i.test(statusOf?.(s.crn) ?? s.status);

const timed = (ms: Mtg[]) => ms.filter((m) => m.s !== null && m.e !== null);
const sig = (ms: Mtg[]) =>
  timed(ms)
    .map((m) => `${m.d}:${m.s}:${m.e}:${m.part}`)
    .sort()
    .join("|");
const profs = (secs: Section[]) =>
  secs
    .filter((s) => s.component === "primary")
    .flatMap((s) => s.instructors)
    .sort()
    .join("|");

function makeBundle(input: CourseInput, secs: Section[]): Bundle {
  const meetings = secs.flatMap((s) => sectionMeetings(s, input.key));
  const { gpa, rmp } = instructorStats(input.course, secs, input.rmpPrior ?? null);
  return { course: input.key, sections: secs, meetings, crns: secs.map((s) => s.crn), gpa, rmp, prof: bundleProf(secs, input.profScores), alternatives: [secs] };
}

const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * Backups for every section of `schedule`. A backup replaces that section (and, when the course's link groups require
 * it, its linked sections) with a bundle of the same course that keeps every must-have, doesn't clash with the other
 * courses, isn't Closed, and keeps a lunch break if one is required. Backups that change fewer of the course's
 * sections come first (a full lab is replaced by another lab of the same lecture), then by the schedule's score.
 * Locks don't stop backups: a locked section can fill too.
 */
export function backupsFor(schedule: Schedule, inputs: CourseInput[], term: string, prefs: Prefs, opts: { n?: number; statusOf?: StatusOf } = {}): SectionBackups[] {
  const n = opts.n ?? 3;
  const credits = schedule.bundles.map((b) => inputs.find((i) => i.key === b.course)?.credits || 3);
  const scoreOf = (bundles: Bundle[]) => scoreSchedule(scheduleStats(bundles, credits), bundles, prefs);
  const base = scoreOf(schedule.bundles);
  const out: SectionBackups[] = [];
  schedule.bundles.forEach((cur, bi) => {
    const input = inputs.find((i) => i.key === cur.course);
    const block = input?.course.terms[term];
    if (!input || !block) return;
    const others = schedule.bundles.filter((_, k) => k !== bi);
    const otherMtgs = timed(others.flatMap((b) => b.meetings));
    const curProfs = profs(cur.sections);
    const curSig = sig(cur.meetings);
    // every bundle of the course, and why each one can't be used (if it can't)
    const cands = buildBundles(block.sections, input.key, prefs.includeSpecial, []).map((secs) => {
      const b = makeBundle(input, secs);
      let why: string | null = null;
      if (secs.some((s) => closed(s, opts.statusOf))) why = "closed";
      else if (prefs.eligibleOnly && secs.some((s) => input.cannot?.includes(s.crn))) why = "restricted";
      else {
        const rule = brokenRule(b.meetings, prefs);
        if (rule) why = `rule:${rule}`;
        else {
          const clash = others.find((o) => timed(o.meetings).some((x) => timed(b.meetings).some((y) => meetingsConflict(x, y))));
          if (clash) why = `clash:${clash.course}`;
          else if (prefs.lunch && !hasLunch([...otherMtgs, ...timed(b.meetings)], lunchOf(prefs))) why = "lunch";
        }
      }
      return { b, why };
    });
    for (const section of cur.sections) {
      const pool = cands.filter((c) => !c.b.crns.includes(section.crn));
      const ok = pool
        .filter((c) => c.why === null)
        .map((c) => {
          const bundles = schedule.bundles.map((x, k) => (k === bi ? c.b : x));
          const changed = c.b.sections.filter((s) => !cur.crns.includes(s.crn));
          return { bundle: c.b, changed, delta: scoreOf(bundles) - base, sameTime: sig(c.b.meetings) === curSig, sameProf: profs(c.b.sections) === curProfs };
        })
        .sort((a, b) => a.changed.length - b.changed.length || b.delta - a.delta || (a.sameTime === b.sameTime ? 0 : a.sameTime ? -1 : 1))
        .slice(0, n);
      out.push({ course: cur.course, section, backups: ok, none: ok.length ? null : noneReason(cur.course, section, pool.map((c) => c.why!)) });
    }
  });
  return out;
}

/** "No other lecture of CS 124 fits: 2 are closed, 1 clashes with MATH 221." */
function noneReason(course: string, section: Section, whys: string[]): string {
  const what = section.component === "primary" ? "lecture" : (section.type_name || section.type || "section").toLowerCase();
  if (!whys.length) return `${course} has no other ${what} this term.`;
  const parts: string[] = [];
  const nClosed = whys.filter((w) => w === "closed").length;
  if (nClosed) parts.push(`${nClosed} ${nClosed === 1 ? "is" : "are"} closed`);
  const clashes = [...new Set(whys.filter((w) => w.startsWith("clash:")).map((w) => w.slice(6)))];
  const nClash = whys.filter((w) => w.startsWith("clash:")).length;
  if (nClash) parts.push(`${nClash} ${nClash === 1 ? "clashes" : "clash"} with ${list(clashes)}`);
  const rules = whys.filter((w) => w.startsWith("rule:"));
  if (rules.length) parts.push(`${rules.length} break${rules.length === 1 ? "s" : ""} a must-have (${rules[0].slice(5)})`);
  const restricted = whys.filter((w) => w === "restricted").length;
  if (restricted) parts.push(`${restricted} ${restricted === 1 ? "is" : "are"} restricted to students you aren't`);
  const lunch = whys.filter((w) => w === "lunch").length;
  if (lunch) parts.push(`${lunch} leave${lunch === 1 ? "s" : ""} no lunch break`);
  return `No backup for ${course} ${section.code}: of the other options, ${list(parts)}.`;
}
