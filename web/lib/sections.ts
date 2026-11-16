// Grouping and per-professor views of a term's sections (pure functions, shared by the course page and tests).
import type { Course, Instructor, Section } from "./types";

export const COMPONENT_NAMES: Record<string, string> = {
  primary: "Lecture",
  DIS: "Discussion",
  LAB: "Lab",
  LBD: "Lab-discussion",
  Q: "Quiz",
  OD: "Online discussion",
  OLB: "Online lab",
  PR: "Practice",
};

export function componentName(c: string, plural = false): string {
  const n = COMPONENT_NAMES[c] ?? c;
  return plural ? `${n.toLowerCase()}s` : n.toLowerCase();
}

export function sortSections(sections: Section[]): Section[] {
  return [...sections].sort(
    (a, b) => (a.component === "primary" ? 0 : 1) - (b.component === "primary" ? 0 : 1) || a.code.localeCompare(b.code, "en", { numeric: true }),
  );
}

export type SectionGroup = { key: string; title: string | null; hint: string | null; sections: Section[] };

/**
 * Sections that are registered for together, grouped the way the link rule in pipeline/course_explorer.py (D1.3)
 * pairs them: a letter group (AL1 + AD*), any-with-any ("*"), or standalone sections.
 */
export function groupSections(sections: Section[]): SectionGroup[] {
  const sorted = sortSections(sections);
  const comps = [...new Set(sorted.map((s) => s.component))];
  if (comps.length < 2) return [{ key: "all", title: null, hint: null, sections: sorted }];
  const needs = comps.filter((c) => c !== "primary").map((c) => componentName(c));
  const byGroup = new Map<string, Section[]>();
  for (const s of sorted) byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), s]);
  const out: SectionGroup[] = [];
  for (const [g, secs] of byGroup) {
    const has = new Set(secs.map((s) => s.component));
    const gNeeds = [...has].filter((c) => c !== "primary").map((c) => componentName(c));
    if (g === "*") {
      out.push({ key: g, title: "Any lecture with any " + needs.join(" and any "), hint: `Take one lecture and one ${needs.join(" and one ")}; any combination works.`, sections: secs });
    } else {
      const lectures = secs.filter((s) => s.component === "primary").map((s) => s.code);
      out.push({
        key: g,
        title: `Group ${g}${lectures.length ? `: ${lectures.join(", ")}` : ""}`,
        hint: gNeeds.length ? `Take one lecture and one ${gNeeds.join(" and one ")} from this group.` : "Standalone section.",
        sections: secs,
      });
    }
  }
  return out;
}

export type Tally = { total: number; open: number; restricted: number; closed: number; known: boolean };

/** Status counts over primary (lecture) sections. "Open (Restricted)" and "CrossListOpen" count as open, as on the rest of the site. */
export function tally(sections: Section[]): Tally {
  const prim = sections.filter((s) => s.component === "primary");
  const t: Tally = { total: prim.length, open: 0, restricted: 0, closed: 0, known: prim.some((s) => s.status) };
  for (const s of prim) {
    const st = s.status.toLowerCase();
    if (st.includes("open")) {
      t.open += 1;
      if (st.includes("restricted")) t.restricted += 1;
    } else if (st.includes("closed")) t.closed += 1;
  }
  return t;
}

export type ProfEntry = { key: string; ins: Instructor; sections: Section[]; lectures: number; tally: Tally };

/**
 * Professors for a term: everyone on a lecture (primary) section, then the people who only lead discussions/labs.
 * `past` = everyone with grade history in this course who isn't teaching that term.
 */
export function professorsFor(course: Course, term: string | null): { profs: ProfEntry[]; assistants: ProfEntry[]; past: ProfEntry[] } {
  const secs = term ? (course.terms[term]?.sections ?? []) : [];
  const entry = (key: string): ProfEntry => {
    const mine = sortSections(secs.filter((s) => s.instructors.includes(key)));
    return { key, ins: course.instructors[key], sections: mine, lectures: mine.filter((s) => s.component === "primary").length, tally: tally(mine) };
  };
  const onLecture: string[] = [];
  const onOther: string[] = [];
  for (const s of sortSections(secs))
    for (const k of s.instructors) {
      if (!course.instructors[k]) continue;
      if (s.component === "primary") {
        if (!onLecture.includes(k)) onLecture.push(k);
      } else if (!onOther.includes(k)) onOther.push(k);
    }
  const teaching = new Set([...onLecture, ...onOther]);
  return {
    profs: onLecture.map(entry),
    assistants: onOther.filter((k) => !onLecture.includes(k)).map(entry),
    past: Object.keys(course.instructors)
      .filter((k) => !teaching.has(k) && course.instructors[k].gpa)
      .map(entry),
  };
}

/** "CS124" / "cs 124" / "CS-124" -> "CS 124" (RMP stores the class as the student typed it). */
export function normCourse(code: string): string {
  const m = /^([A-Za-z]{2,5})\s*-?\s*(\d{3})/.exec(code.trim());
  return m ? `${m[1].toUpperCase()} ${m[2]}` : code.trim().toUpperCase();
}

/** A stable, CSS-safe element id for a professor row ("challen|geoffrey" -> "prof-challen-geoffrey"). */
export function profDomId(key: string): string {
  return `prof-${key.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`;
}
