// Final exams of a schedule and the exam conflicts the Student Code recognizes (issues #83-#85, DECISIONS.md D36).
// Student Code § 3-201(a)(8): two synchronous exams that overlap, or three or more final exams whose starting times
// all fall within a 24-hour window. § 3-201(a)(11): the course whose exam has the lowest priority sets up the
// conflict exam (Registrar "Non Combined" exams outrank "Combined" ones); on a tie, the course with the most students.
import type { Schedule } from "./schedule";

export const STUDENT_CODE_EXAMS = "https://studentcode.illinois.edu/article3/part2/3-201";

export type FinalExam = { course: string; code: string; crn: string; date: string; s: number; e: number; type: string };

/** Each course's main final exam(s) in a schedule (the "Conflict" rows are the make-up slot, not the exam). */
export function finalsOf(schedule: Schedule): FinalExam[] {
  const out: FinalExam[] = [];
  for (const b of schedule.bundles)
    for (const sec of b.sections)
      for (const [date, s, e, type] of sec.fx ?? []) {
        if (/conflict/i.test(type) || s === null || e === null) continue;
        const same = out.find((x) => x.course === b.course && x.date === date && x.s === s);
        if (!same) out.push({ course: b.course, code: sec.code, crn: sec.crn, date, s, e, type });
        else if (/extra space/i.test(same.type)) same.type = type; // an extra room for the same exam: keep the exam's own type
      }
  return out.sort((a, b) => at(a) - at(b));
}

/** Courses in the schedule with no final listed (not scheduled yet, or no final). */
export function finalsPending(schedule: Schedule): string[] {
  const have = new Set(finalsOf(schedule).map((x) => x.course));
  return schedule.bundles.map((b) => b.course).filter((c) => !have.has(c));
}

/** Minutes since the epoch (dates are local exam dates; only differences matter). */
const at = (x: FinalExam) => Date.UTC(+x.date.slice(0, 4), +x.date.slice(5, 7) - 1, +x.date.slice(8, 10)) / 60000 + x.s;
const DAY = 24 * 60;

export const examDay = (x: { date: string }) =>
  new Date(`${x.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
export const clock = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")}${m < 720 ? "am" : "pm"}`;
export const examTime = (x: FinalExam) => `${clock(x.s)}–${clock(x.e)}`;

/** § 3-201(a)(11) order for Registrar-scheduled exams: higher number = lower priority. Unknown types: null. */
function priority(type: string): number | null {
  if (/^non[- ]?combined$/i.test(type.trim())) return 2;
  if (/^combined$/i.test(type.trim())) return 3;
  return null;
}

/** Who sets up the conflict exam, in words, or null when the exam types don't say. */
export function whoOffers(exams: FinalExam[]): string | null {
  const ranks = exams.map((x) => priority(x.type));
  if (ranks.some((r) => r === null)) return null;
  const low = Math.max(...(ranks as number[]));
  const lowest = exams.filter((_, i) => ranks[i] === low);
  if (lowest.length === 1)
    return `${lowest[0].course} is the one to offer it (its final is a combined-section exam, which the Student Code ranks below the others)`;
  return `${lowest.map((x) => x.course).join(" or ")}, whichever has more students, offers it`;
}

export type ExamConflict = { kind: "overlap" | "three-in-24h" | "exactly-24h"; exams: FinalExam[]; text: string };

const CONTACT = "Contact the instructors by the last day of class.";

/** Every exam conflict in a schedule: overlapping finals, and three or more finals starting within 24 hours. */
export function examConflicts(schedule: Schedule): ExamConflict[] {
  const exams = finalsOf(schedule);
  const out: ExamConflict[] = [];
  for (let i = 0; i < exams.length; i++)
    for (let j = i + 1; j < exams.length; j++) {
      const a = exams[i];
      const b = exams[j];
      if (a.course === b.course || a.date !== b.date || !(a.s < b.e && b.s < a.e)) continue;
      const who = whoOffers([a, b]);
      out.push({
        kind: "overlap",
        exams: [a, b],
        text: `Final exams overlap: ${a.course} (${examDay(a)}, ${examTime(a)}) and ${b.course} (${examTime(b)}). You can ask for a conflict exam${who ? `; ${who}` : ""}. ${CONTACT}`,
      });
    }
  // three or more starts within 24 hours: each maximal run of exams (one per course) whose first and last start are
  // under 24 hours apart. Exactly 24 hours is reported separately, since "within a 24-hour window" could go either way.
  const one = exams.filter((x, i) => exams.findIndex((y) => y.course === x.course) === i);
  let lastEnd = -1;
  for (let i = 0; i < one.length; i++) {
    let j = i;
    while (j + 1 < one.length && at(one[j + 1]) - at(one[i]) <= DAY) j++;
    if (j - i + 1 < 3 || j <= lastEnd) continue;
    lastEnd = j;
    const run = one.slice(i, j + 1);
    const strict = run.filter((x) => at(x) - at(run[0]) < DAY);
    const list = (xs: FinalExam[]) => {
      const parts = xs.map((x) => `${x.course} (${examDay(x)}, ${clock(x.s)})`);
      return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
    };
    if (strict.length >= 3) {
      const who = whoOffers(strict);
      out.push({
        kind: "three-in-24h",
        exams: strict,
        text: `${strict.length === 3 ? "Three" : strict.length} finals within 24 hours: ${list(strict)}. The Student Code counts this as an exam conflict, so you can ask for a conflict exam${who ? `; ${who}` : ""}. ${CONTACT}`,
      });
    } else
      out.push({
        kind: "exactly-24h",
        exams: run,
        text: `Three finals in exactly 24 hours: ${list(run)}. The Student Code's conflict rule is three finals starting "within a 24-hour window"; ask your instructors whether this counts.`,
      });
  }
  return out;
}

export type FinalsDay = { date: string; exams: FinalExam[] };

/** Exams grouped by day, in order. */
export function finalsByDay(schedule: Schedule): FinalsDay[] {
  const days: FinalsDay[] = [];
  for (const x of finalsOf(schedule)) {
    const d = days.find((y) => y.date === x.date);
    if (d) d.exams.push(x);
    else days.push({ date: x.date, exams: [x] });
  }
  return days;
}

/** A short summary for the comparison table: "1 conflict", "2 on Tue", "1 a day", or "not listed yet". */
export function finalsSummary(schedule: Schedule): string {
  const n = examConflicts(schedule).filter((c) => c.kind !== "exactly-24h").length;
  if (n) return `${n} conflict${n > 1 ? "s" : ""}`;
  const days = finalsByDay(schedule);
  if (!days.length) return "not listed yet";
  const busiest = days.reduce((a, d) => (d.exams.length > a.exams.length ? d : a));
  return busiest.exams.length > 1 ? `${busiest.exams.length} on ${examDay(busiest).split(",")[0]}` : "1 a day";
}
