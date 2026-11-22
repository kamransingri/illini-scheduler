// Transcript and DARS import (#20): reads the text a student copies off Self-Service's Academic History (unofficial
// transcript) or a DARS audit, in the browser only, into My courses. Nothing is sent anywhere (DECISIONS.md D48).
//
// Self-Service rows: "CS 124  UG  Intro to Computer Science I  A  3.000 12.00" under "Term: Fall 2023" headings, in
// the sections INSTITUTION CREDIT, TRANSFER CREDIT ACCEPTED BY INSTITUTION and COURSES IN PROGRESS (no grade there).
// DARS rows: "FA23 CS 124  3.0 A  INTRO COMPUTER SCIENCE I", the term first and the grade after the hours.
// Grade codes are the registrar's transcript key (registrar.illinois.edu/transcript-key-2/), plus IP/TR/T, which DARS
// and transfer rows use.
import type { CourseStatus } from "./mycourses";

export type ImportedCourse = { s: string; n: string; status: CourseStatus; grade: string; term: string };
export type SkippedCourse = { code: string; grade: string; term: string; why: string };
export type TranscriptImport = {
  found: ImportedCourse[];
  /** attempts that don't count (withdrawn, failed, audited…), unless the course was passed another time */
  skipped: SkippedCourse[];
  /** lines that start like a course row but couldn't be read: shown to the student, never dropped silently */
  unreadable: string[];
  /** a transfer or test-credit section (AP, IB, proficiency) was in the text */
  testCredit: boolean;
};

const PASS = new Set(["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "CR", "PS", "S", "P", "PP", "PZ", "TR", "T", "HON", "SR"]);
const CREDIT = new Set(["PS", "TR", "T"]); // test-based or transfer credit wherever it appears
const IN_PROGRESS = new Set(["IP", "PR", "DFR"]);
const NOT_COUNTED: Record<string, string> = {
  F: "failed",
  FR: "failed",
  ABS: "failed (absent from the final)",
  W: "withdrawn",
  NC: "no credit",
  U: "unsatisfactory",
  NP: "no pass",
  NZ: "no pass",
  AU: "audited",
  NR: "grade not reported",
  NV: "not valid",
  I: "incomplete",
};
const gradeOf = (tok: string | undefined) => {
  if (!tok) return null;
  const g = tok.toUpperCase().replace(/[H*&]$/, (m) => (tok.length > 1 ? "" : m)); // "AH" (honors), "A*", "B&"
  return PASS.has(g) || IN_PROGRESS.has(g) || g in NOT_COUNTED ? g : null;
};

const SEASON: Record<string, string> = { FA: "Fall", SP: "Spring", SU: "Summer", WI: "Winter" };
const TERM_HEADING = /^(?:term:\s*)?(fall|spring|summer|winter)\s+(\d{4})\b/i;
const ROW = /^(?:(FA|SP|SU|WI)(\d{2})\s+)?([A-Z]{2,5})\s*(\d{3}|[1-4]--)(?=\s|$)\s*(.*)$/;
/** starts like a row ("STAT 4 3.0 A") but isn't one: reported */
const ROW_LIKE = /^(?:(?:FA|SP|SU|WI)\d{2}\s+)?[A-Z]{2,5}\s+\d/;
const HOURS = /^\d{1,2}\.\d{1,3}$/;
const LEVEL = /^(UG|GR|1U|2G|LW|MD|VM|UIUC|URBANA)$/i;

type Section = "institution" | "transfer" | "progress";
const RANK: Record<CourseStatus, number> = { done: 3, credit: 2, in_progress: 1 };

/** Read a pasted transcript or DARS audit. Order doesn't matter; a course passed in any term counts once, at its best. */
export function parseTranscript(text: string): TranscriptImport {
  const best = new Map<string, ImportedCourse>();
  const failed: SkippedCourse[] = [];
  const unreadable: string[] = [];
  let section: Section = "institution";
  let term = "";
  let testCredit = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    // the links at the top of Self-Service's page name every section on one line
    if (/institution credit/i.test(line) && /in progress/i.test(line)) continue;
    // section headings
    if (/courses? in progress|in-progress courses|currently enrolled/i.test(line)) {
      section = "progress";
      continue;
    }
    const th = TERM_HEADING.exec(line);
    if (th) term = `${th[1][0].toUpperCase()}${th[1].slice(1).toLowerCase()} ${th[2]}`;
    // "TRANSFER CREDIT ACCEPTED BY INSTITUTION", and under it "Fall 2024: Advanced Placement" (a term and a source)
    const test = /test credit|advanced placement|\bAP credit|international baccalaureate|proficiency (exam|credit)/i.test(line);
    if ((test || /transfer credit/i.test(line)) && !ROW.test(line)) {
      section = "transfer";
      testCredit ||= test;
      continue;
    }
    if (/^institution credit|^transcript totals/i.test(line)) {
      section = /^institution/i.test(line) ? "institution" : section;
      continue;
    }
    if (th) continue;

    const m = ROW.exec(line);
    if (!m) {
      if (ROW_LIKE.test(line)) unreadable.push(line);
      continue;
    }
    const [, season, yy, subj, num, rest] = m;
    // "Course Level Title" headers and totals rows aren't course rows; neither is prose that happens to start like one
    if (/^(?:THE|AND|FOR|NOTE|TERM|TOTAL|SELECT|NEEDS?)$/.test(subj)) continue;
    const rowTerm = season ? `${SEASON[season.toUpperCase()]} 20${yy}` : term;
    const code = `${subj} ${num}`;
    const toks = rest.split(" ").filter(Boolean);
    const h = toks.findIndex((t) => HOURS.test(t));
    let grade: string | null = null;
    if (h >= 0) {
      // Self-Service: the grade sits just before the hours; DARS: just after (and the title follows)
      const before = h > 0 && !LEVEL.test(toks[h - 1]) ? gradeOf(toks[h - 1]) : null;
      grade = section === "progress" ? null : (before ?? gradeOf(toks[h + 1]));
    } else if (section !== "progress") {
      // a wrapped Self-Service row: the grade ends the line, the hours are on the next one
      grade = gradeOf(toks[toks.length - 1]);
    }
    let status: CourseStatus | null = null;
    if (section === "progress") status = "in_progress";
    else if (!grade) status = null;
    else if (IN_PROGRESS.has(grade)) status = "in_progress";
    else if (PASS.has(grade)) status = section === "transfer" || CREDIT.has(grade) ? "credit" : "done";
    else {
      failed.push({ code, grade, term: rowTerm, why: NOT_COUNTED[grade] });
      continue;
    }
    if (!status) {
      unreadable.push(line);
      continue;
    }
    if (num.endsWith("--")) {
      // elective credit ("MATH 1--"): no one course to add, but say it was seen
      failed.push({ code, grade: grade ?? "", term: rowTerm, why: "elective credit, not a single course" });
      continue;
    }
    const old = best.get(code);
    if (!old || RANK[status] > RANK[old.status]) best.set(code, { s: subj, n: num, status, grade: grade ?? "", term: rowTerm });
  }

  return {
    found: [...best.values()],
    skipped: failed.filter((f) => !best.has(f.code)),
    unreadable,
    testCredit,
  };
}

/** What applying an import would change in My courses: courses added, statuses changed, and courses it doesn't list. */
export type ImportDiff = {
  adds: ImportedCourse[];
  changes: { course: ImportedCourse; from: CourseStatus }[];
  same: ImportedCourse[];
  /** in My courses but not in the paste: kept (a transfer course added by hand, say) */
  notListed: string[];
};

export function diffImport(found: ImportedCourse[], mine: { s: string; n: string; status: CourseStatus }[]): ImportDiff {
  const have = new Map(mine.map((c) => [`${c.s} ${c.n}`, c.status]));
  const listed = new Set(found.map((c) => `${c.s} ${c.n}`));
  const out: ImportDiff = { adds: [], changes: [], same: [], notListed: [] };
  for (const c of found) {
    const was = have.get(`${c.s} ${c.n}`);
    if (!was) out.adds.push(c);
    else if (was !== c.status) out.changes.push({ course: c, from: was });
    else out.same.push(c);
  }
  out.notListed = mine.map((c) => `${c.s} ${c.n}`).filter((c) => !listed.has(c));
  return out;
}
