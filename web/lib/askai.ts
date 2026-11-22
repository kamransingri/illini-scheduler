// "Ask your AI" (#103): a short plain-text summary of a course or a schedule, with a starter question, for the
// student to paste into any AI app. The site sends nothing; the student sees exactly this text before copying it.
import { daysStr, fmtGpa, fmtTime, GENED_NAMES, termLabel } from "./format";
import type { Schedule } from "./schedule";
import type { Course, Section } from "./types";

const SITE = "https://kamransingri.github.io/illini-scheduler";

const times = (s: Section) => s.meetings.map((m) => (m.s === null ? "no set time" : `${daysStr(m.d)} ${fmtTime(m.s)}-${fmtTime(m.e)}`)).join("; ");

function rmpLine(course: Course, key: string): string {
  const r = course.instructors[key]?.rmp;
  return r && r.rating !== null ? `, Rate My Professors ${r.rating.toFixed(1)}/5 from ${r.num_ratings} ratings` : "";
}

/** A course and its sections next term, for an AI app. */
export function courseSummary(course: Course, term: string): string {
  const code = `${course.subject} ${course.number}`;
  const lines = [`${code}: ${course.title} (${course.credits.replace(/\.$/, "")}), University of Illinois Urbana-Champaign.`];
  const g = course.gpa;
  if (g?.recent !== null && g?.recent !== undefined) lines.push(`Average GPA ${fmtGpa(g.recent)} over the last 8 fall and spring terms (${g.recent_students} students).`);
  if (course.geneds.codes.length) lines.push(`Gen eds: ${course.geneds.codes.map((c) => GENED_NAMES[c] ?? c).join(", ")}.`);
  if (course.prereq) lines.push(`Prerequisite: ${course.prereq}`);
  const block = course.terms[term];
  const lectures = block?.sections.filter((s) => s.component === "primary") ?? [];
  if (lectures.length) {
    lines.push(`${termLabel(term)} lectures:`);
    for (const s of lectures.slice(0, 8)) {
      const who = s.instructors.map((k) => `${course.instructors[k]?.name ?? k}${rmpLine(course, k)}`).join("; ") || "instructor TBA";
      lines.push(`- ${s.code} (CRN ${s.crn}): ${times(s)}, ${who}${s.status ? `, ${s.status}` : ""}`);
    }
    if (lectures.length > 8) lines.push(`- and ${lectures.length - 8} more`);
  } else lines.push(`Not offered in ${termLabel(term)} as far as Course Explorer shows.`);
  lines.push(`From Illini Scheduler (${SITE}/course/${course.subject}/${course.number}/); check Course Explorer before registering.`);
  lines.push("", `Question: Is ${code} a good fit for me, and which section would you pick? Ask me what you need to know about my goals and schedule.`);
  return lines.join("\n");
}

/** A built schedule, with the student's must-haves, for an AI app. */
export function scheduleSummary(schedule: Schedule, term: string, mustHaves: string[], courses: Record<string, Course | undefined>): string {
  const lines = [`My ${termLabel(term)} schedule at the University of Illinois Urbana-Champaign:`];
  for (const b of schedule.bundles)
    for (const s of b.sections) {
      const c = courses[b.course];
      const who = s.instructors.map((k) => `${c?.instructors[k]?.name ?? k}${c ? rmpLine(c, k) : ""}`).join("; ") || "instructor TBA";
      lines.push(`- ${b.course} ${s.code} ${s.type} (CRN ${s.crn}): ${times(s)}, ${who}`);
    }
  const st = schedule.stats;
  const facts = [
    st.expectedGpa !== null ? `expected GPA ${st.expectedGpa.toFixed(2)}` : "",
    st.daysOff.length ? `${st.daysOff.join(", ")} off` : "",
    st.walks.length ? `${st.walks.length} rushed walk${st.walks.length > 1 ? "s" : ""} between classes` : "",
  ].filter(Boolean);
  if (facts.length) lines.push(`${facts.join(", ")}.`);
  if (mustHaves.length) lines.push(`My must-haves: ${mustHaves.join(", ")}.`);
  lines.push("From Illini Scheduler; check Course Explorer before registering.");
  lines.push("", "Question: Does this schedule look manageable? What would you change, and what should I watch out for?");
  return lines.join("\n");
}
