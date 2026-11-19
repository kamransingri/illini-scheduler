// What each MCP tool answers, as pure functions of the site's JSON (docs/API.md). The search, gen-ed filters and the
// best-pick score are the site's own code in web/lib, so an AI app gets the same answers as the site.
import { encodeCart, type CartItem } from "../../web/lib/cart";
import { fmtCredits, hourWarnings, totalHours } from "../../web/lib/credits";
import { examConflicts, finalsSummary } from "../../web/lib/finals";
import { applyFilters, DEFAULT_FILTERS, filtersToQuery, GENED_GROUPS, type Filters, type SortKey } from "../../web/lib/geneds";
import { cisUrl, daysStr, fmtTime, GENED_NAMES, termLabel, termRange } from "../../web/lib/format";
import { courseInput, type InputContext } from "../../web/lib/inputs";
import { prefsFromParams, prefsToParams, PRESETS, timeRulesSummary } from "../../web/lib/prefs";
import { rankCourse } from "../../web/lib/rank";
import { NOBODY, parseRestrictions } from "../../web/lib/restrictions";
import { bundleOpen, clashingPairs, DEFAULT_PREFS, explainEmpty, generate, locksToBlame, summaryLine, warnings, type Prefs, type Schedule } from "../../web/lib/schedule";
import { DEFAULT_WEIGHTS } from "../../web/lib/score";
import { search } from "../../web/lib/search";
import { TERM_DATES } from "../../web/lib/terms";
import type { Course, GenedRow, Meta, SearchCourse, SearchIndex, Section } from "../../web/lib/types";

export const CHECK_NOTE = "Unofficial data; confirm sections, seats and restrictions in Course Explorer and Self-Service before registering.";
const CATEGORIES: Record<string, string[]> = Object.fromEntries(GENED_GROUPS.map((g) => [g.cat, g.codes]));
const CATEGORY_NAMES: Record<string, string> = Object.fromEntries(GENED_GROUPS.map((g) => [g.cat, g.label]));
export const GENED_HELP = [
  ...Object.entries(GENED_NAMES).map(([c, n]) => `${c} ${n}`),
  ...GENED_GROUPS.map((g) => `${g.cat} = ${g.label} (any of ${g.codes.join(", ")})`),
].join("; ");

/** The build every answer comes from, so the AI can say how fresh it is. */
function data(meta: Meta, term?: string) {
  return { built_at: meta.built_at, ...(term ? { term, term_label: termLabel(term) } : {}), note: CHECK_NOTE };
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 100));
const gpa = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
const genedLabel = (code: string) => (GENED_NAMES[code] ? `${code} (${GENED_NAMES[code]})` : code);
const credits = (cr: [number, number] | null) => (!cr ? null : cr[0] === cr[1] ? `${cr[0]}` : `${cr[0]}-${cr[1]}`);
const courseUrl = (site: string, s: string, n: string) => `${site}/course/${s}/${n}/`;

/** "3", "3 OR 4", "1 TO 4" (search.json `c`) -> [fewest, most]. */
export function creditRange(c: string): [number, number] | null {
  const nums = (c.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return nums.length ? [Math.min(...nums), Math.max(...nums)] : null;
}

/** Each wanted gen-ed is a code (HP: the course has it) or a category (HUM: it has any of the category's codes). */
export function genedsMatch(codes: string[], wanted: string[]): boolean {
  return wanted.every((w) => (CATEGORIES[w] ? CATEGORIES[w].some((c) => codes.includes(c)) : codes.includes(w)));
}

export function unknownGeneds(wanted: string[]): string[] {
  return wanted.filter((w) => !GENED_NAMES[w] && !CATEGORIES[w]);
}

// ---- term_info --------------------------------------------------------------------------------------------------

export function termInfo(meta: Meta, site: string) {
  const term = (t: string) => {
    const d = TERM_DATES[t];
    return {
      id: t,
      label: termLabel(t),
      sections_and_seats_checked_at: meta.terms[t]?.checked_at ?? null,
      instruction: d
        ? {
            first_day: d.start,
            last_day: d.end,
            first_half_ends: d.aEnd,
            second_half_starts: d.bStart,
            no_classes: d.breaks.map(([from, to, name]) => ({ name, from, to })),
            ...(d.estimated ? { estimated: true } : {}),
            source: d.source,
          }
        : null,
    };
  };
  return {
    current_term: term(meta.current_term),
    next_term: term(meta.next_term),
    registering_for: termLabel(meta.next_term),
    gpa_data: { terms: termRange(meta.gpa.window[0], meta.gpa.window[1]), recent: termRange(meta.gpa.recent[0], meta.gpa.recent[meta.gpa.recent.length - 1]) },
    rate_my_professors: meta.rmp_status,
    courses: meta.n_courses,
    site,
    data: data(meta),
    ...(meta.format_version !== undefined ? { format_version: meta.format_version } : {}),
  };
}

// ---- search_courses ---------------------------------------------------------------------------------------------

export type SearchArgs = {
  query?: string;
  subject?: string;
  gened?: string[];
  credits?: number;
  min_gpa?: number;
  offered?: "next" | "current" | "either" | "any";
  sort?: "relevance" | "gpa" | "code";
  limit?: number;
};

export function searchCourses(index: SearchIndex, meta: Meta, site: string, a: SearchArgs) {
  const q = a.query?.trim() ?? "";
  const hits = q ? search(index, q, 100000) : [];
  let rows: SearchCourse[] = q ? hits.flatMap((h) => (h.kind === "course" ? [h.course] : [])) : [...index.courses];
  const subject = a.subject?.trim().toUpperCase();
  const gened = (a.gened ?? []).map((g) => g.trim().toUpperCase());
  const offered = a.offered ?? "any";
  rows = rows.filter((c) => {
    if (subject && c.s !== subject) return false;
    if (gened.length && !genedsMatch(c.g, gened)) return false;
    if (a.credits !== undefined) {
      const cr = creditRange(c.c);
      if (!cr || a.credits < cr[0] || a.credits > cr[1]) return false;
    }
    if (a.min_gpa !== undefined && (c.gpa === null || c.gpa < a.min_gpa)) return false;
    if (offered === "next" && !c.nx) return false;
    if (offered === "current" && !c.cu) return false;
    if (offered === "either" && !c.nx && !c.cu) return false;
    return true;
  });
  const sort = a.sort ?? (q ? "relevance" : "code");
  if (sort === "gpa") rows.sort((x, y) => (y.gpa ?? -1) - (x.gpa ?? -1));
  else if (sort === "code" || !q) rows.sort((x, y) => x.s.localeCompare(y.s) || Number(x.n) - Number(y.n));
  const limit = Math.min(Math.max(a.limit ?? 20, 1), 100);
  const instructors = q && !subject && !gened.length ? hits.flatMap((h) => (h.kind === "instructor" ? [h.instructor] : [])).slice(0, 10) : [];
  return {
    terms: { current: termLabel(meta.current_term), next: termLabel(meta.next_term) },
    matches: rows.length,
    shown: Math.min(limit, rows.length),
    courses: rows.slice(0, limit).map((c) => ({
      code: `${c.s} ${c.n}`,
      title: c.t,
      credit_hours: c.c,
      gen_eds: c.g.map(genedLabel),
      average_gpa: gpa(c.gpa),
      offered_next_term: Boolean(c.nx),
      offered_this_term: Boolean(c.cu),
      ...(c.f?.length ? { formerly: c.f } : {}),
      url: courseUrl(site, c.s, c.n),
    })),
    ...(instructors.length ? { instructors: instructors.map((i) => ({ name: i.name, teaching_next_term: i.c })) } : {}),
    ...(unknownGeneds(gened).length ? { warning: `Unknown gen-ed codes: ${unknownGeneds(gened).join(", ")}. Known: ${GENED_HELP}` } : {}),
    data: data(meta),
  };
}

// ---- get_course -------------------------------------------------------------------------------------------------

export type CourseArgs = { term?: string; lectures_only?: boolean; max_sections?: number };

const PART: Record<string, string> = { "1": "full term", A: "first 8 weeks", B: "second 8 weeks" };

/** The term to show: the one asked for, else next term, else this term, else the newest one the file has. */
export function pickTerm(course: Course, meta: Meta, asked?: string): string | null {
  const have = Object.keys(course.terms);
  if (asked) return have.includes(asked) ? asked : null;
  return [meta.next_term, meta.current_term].find((t) => have.includes(t)) ?? have.sort().at(-1) ?? null;
}

function section(s: Section, course: Course, statusKnown: boolean) {
  const restrictions = parseRestrictions(s.text).map((c) => c.text);
  return {
    crn: s.crn,
    section: s.code,
    type: s.type_name || s.type,
    ...(s.component !== "primary" ? { taken_with_a_lecture: true } : {}),
    link_group: s.group === "*" ? "any" : s.group,
    part_of_term: PART[s.part] ?? s.part,
    meets: s.meetings.map((m) => ({
      days: daysStr(m.d) || null,
      time: m.s === null ? "no set time (online or arranged)" : `${fmtTime(m.s)}-${fmtTime(m.e)}`,
      where: [m.b, m.r].filter(Boolean).join(" ") || null,
    })),
    instructors: s.instructors.map((k, i) => course.instructors[k]?.name ?? s.instructors_raw[i] ?? k),
    seats: statusKnown ? s.status || "unknown" : "not published yet",
    ...(s.status_code === "P" ? { pending: true } : {}),
    ...(restrictions.length ? { restrictions } : {}),
    ...(s.special ? { special: s.special } : {}),
    ...(s.title ? { section_title: s.title } : {}),
    ...(s.credits ? { credit_hours: s.credits } : {}),
    ...(s.fx?.length ? { final_exams: s.fx.map(([date, st, en, type]) => ({ date, time: st === null ? null : `${fmtTime(st)}-${fmtTime(en)}`, type })) } : {}),
  };
}

export function getCourse(course: Course, meta: Meta, site: string, a: CourseArgs = {}) {
  const term = pickTerm(course, meta, a.term);
  const block = term ? course.terms[term] : undefined;
  const all = block?.sections ?? [];
  const wanted = a.lectures_only ? all.filter((s) => s.component === "primary") : all;
  const max = Math.min(Math.max(a.max_sections ?? 100, 1), 300);
  const g = course.gpa;
  const known = Object.entries(course.exam_course ?? {}).filter(([, f]) => f.value !== "unknown" && !(Array.isArray(f.value) && !f.value.length));
  const people = Object.entries(course.instructors)
    .map(([key, p]) => ({ key, p, now: term ? p.teaching.includes(term) : false }))
    .sort((x, y) => Number(y.now) - Number(x.now) || (y.p.gpa?.students ?? 0) - (x.p.gpa?.students ?? 0))
    .filter((x, i) => x.now || i < 12);
  return {
    code: `${course.subject} ${course.number}`,
    title: course.title,
    ...(course.subject_name ? { subject: course.subject_name } : {}),
    credit_hours: course.credits,
    description: course.description,
    prerequisites: course.prereq || null,
    gen_eds: course.geneds.codes.map(genedLabel),
    ...(course.formerly?.length ? { formerly: course.formerly.map((f) => f.code) } : {}),
    average_gpa: g
      ? {
          recent: gpa(g.recent),
          recent_terms: termRange(g.recent_terms[0], g.recent_terms[1]),
          recent_students: g.recent_students,
          all_time: gpa(g.avg),
          all_time_students: g.students,
          grades_percent: { A: pct(g.pct.A), B: pct(g.pct.B), C: pct(g.pct.C), D_or_F: pct(g.pct.DF), W: pct(g.pct.W) },
        }
      : null,
    usually_offered: course.pattern ? `${course.pattern.label}. ${course.pattern.likelihood} chance in ${termLabel(course.pattern.target)}: ${course.pattern.reason}.` : null,
    term: term ? termLabel(term) : null,
    ...(a.term && !term ? { warning: `No sections for ${termLabel(a.term)}. Terms in the data: ${Object.keys(course.terms).map(termLabel).join(", ") || "none"}.` } : {}),
    other_terms: Object.keys(course.terms).filter((t) => t !== term).map((t) => ({ id: t, label: termLabel(t) })),
    seat_status_checked_at: block?.status_known ? block.checked_at : null,
    lectures: block?.n_primary ?? 0,
    open_lectures: block?.n_open ?? null,
    sections_shown: Math.min(max, wanted.length),
    sections_total: all.length,
    sections: wanted.slice(0, max).map((s) => section(s, course, Boolean(block?.status_known))),
    instructors: people.map(({ p, now }) => ({
      name: p.name,
      ...(term ? { teaching_this_term: now } : {}),
      gpa_in_this_course: p.gpa
        ? { recent: gpa(p.gpa.recent), all_time: gpa(p.gpa.avg), students: p.gpa.students, vs_course_average: gpa(p.gpa.delta), terms_taught: p.gpa.n_terms, ...(p.gpa.limited ? { few_grades: true } : {}) }
        : null,
      rate_my_professors: p.rmp
        ? { quality: p.rmp.rating, difficulty: p.rmp.difficulty, would_take_again_percent: p.rmp.would_take_again !== null && p.rmp.would_take_again >= 0 ? Math.round(p.rmp.would_take_again) : null, ratings: p.rmp.num_ratings, url: p.rmp.url }
        : null,
      ...(p.tre.length ? { teachers_ranked_excellent: p.tre.map(termLabel) } : {}),
    })),
    ...(known.length ? { exam_hints: Object.fromEntries(known.map(([k, f]) => [k, f.value])) } : {}),
    ...(course.notes.length ? { notes: course.notes.map((n) => n.text) } : {}),
    links: { page: courseUrl(site, course.subject, course.number), ...(term ? { course_explorer: cisUrl(term, course.subject, course.number) } : {}) },
    data: data(meta, term ?? undefined),
  };
}

// ---- find_geneds ------------------------------------------------------------------------------------------------

export type GenedArgs = {
  gened?: string[];
  credits?: number;
  open_only?: boolean;
  min_gpa_students?: number;
  min_rmp?: number;
  two_or_more_categories?: boolean;
  sort?: SortKey;
  limit?: number;
};

export function findGeneds(rows: GenedRow[], meta: Meta, site: string, a: GenedArgs) {
  const wanted = (a.gened ?? []).map((g) => g.trim().toUpperCase());
  const codes = wanted.filter((w) => GENED_NAMES[w]);
  const cats = wanted.filter((w) => CATEGORIES[w]);
  const f: Filters = {
    ...DEFAULT_FILTERS,
    codes,
    credits: a.credits ?? null,
    openNext: a.open_only ?? DEFAULT_FILTERS.openNext,
    minRmp: a.min_rmp ?? null,
    doubleDip: a.two_or_more_categories ?? false,
    minStudents: a.min_gpa_students ?? DEFAULT_FILTERS.minStudents,
  };
  const priors = meta.score_priors ?? null;
  const sort: SortKey = a.sort === "score" && !priors ? "gpa" : (a.sort ?? (priors ? "score" : "gpa"));
  const ranked = new Map(rows.map((r) => [`${r.s} ${r.n}`, rankCourse(`${r.s} ${r.n}`, { gpa: r.gpa, gn: r.gpaN, nSec: r.nSec, nOpen: r.nOpen, known: r.statusKnown, profs: r.profs }, priors, DEFAULT_WEIGHTS)]));
  const scoreOf = (r: GenedRow) => ranked.get(`${r.s} ${r.n}`)?.score?.score ?? null;
  const out = applyFilters(rows.filter((r) => genedsMatch(r.codes, cats)), f, sort, scoreOf);
  const limit = Math.min(Math.max(a.limit ?? 20, 1), 100);
  const statusKnown = rows.some((r) => r.statusKnown);
  return {
    term: termLabel(meta.next_term),
    ranked_by:
      sort === "score"
        ? "best-pick score (0-100): course GPA, the best next-term professor's GPA and Rate My Professors ratings, and open sections, with small samples pulled toward the average"
        : { gpa: "recent average GPA", pctA: "share of A grades", rmp: "best Rate My Professors quality among next term's lecturers", open: "open lectures next term" }[sort],
    seat_status: statusKnown ? "open_lectures is from the last seat check" : `seat status for ${termLabel(meta.next_term)} isn't published yet, so open_lectures counts every lecture`,
    matches: out.length,
    shown: Math.min(limit, out.length),
    courses: out.slice(0, limit).map((r) => {
      const rk = ranked.get(`${r.s} ${r.n}`);
      return {
        code: `${r.s} ${r.n}`,
        title: r.t,
        counts_for: r.codes.map(genedLabel),
        categories: r.cats.map((c) => CATEGORY_NAMES[c] ?? c),
        credit_hours: credits(r.cr),
        average_gpa: gpa(r.gpa),
        gpa_students: r.gpaN,
        percent_A: pct(r.pctA),
        lectures_next_term: r.nSec,
        open_lectures: r.statusKnown ? r.nOpen : null,
        ...(rk?.score?.score !== null && rk?.score?.score !== undefined ? { best_pick_score: rk.score.score } : {}),
        ...(rk?.best ? { best_professor: rk.best.name } : r.best ? { best_professor: r.best.name } : {}),
        best_rmp_quality: r.rmp,
        url: courseUrl(site, r.s, r.n),
      };
    }),
    ...(cats.length ? {} : { gened_finder_url: `${site}/geneds/${filtersToQuery(f, sort) ? `?${filtersToQuery(f, sort)}` : ""}` }),
    ...(unknownGeneds(wanted).length ? { warning: `Unknown gen-ed codes: ${unknownGeneds(wanted).join(", ")}. Known: ${GENED_HELP}` } : {}),
    data: data(meta, meta.next_term),
  };
}

// ---- build_schedules --------------------------------------------------------------------------------------------

export type Weights = Partial<
  Record<"gpa" | "best_professor" | "professor_ratings" | "open_seats" | "more_days_off" | "fewer_gaps" | "avoid_early" | "avoid_late" | "short_walks", number>
>;

export type BuildArgs = {
  courses: string[];
  term?: string;
  locked_crns?: string[];
  no_classes_before?: string;
  done_by?: string;
  days_off?: string[];
  lunch_break?: boolean | { from?: string; to?: string; minutes?: number };
  blocked_times?: { days: string; from: string; to: string }[];
  open_sections_only?: boolean;
  include_special_sections?: boolean;
  what_matters?: Weights & { preset?: string; too_early_before?: string; too_late_after?: string };
  limit?: number;
};

/** A course of the request as read from the data, after following a renumbering. */
export type Loaded = { course: Course; renumbered?: string };

/** build_schedules' names for the site's "What matters to you" sliders (Prefs.weights). */
const WEIGHT_KEYS: [keyof Weights, keyof Prefs["weights"]][] = [
  ["gpa", "gpa"],
  ["best_professor", "prof"],
  ["professor_ratings", "rmp"],
  ["open_seats", "open"],
  ["more_days_off", "daysOff"],
  ["fewer_gaps", "compact"],
  ["avoid_early", "early"],
  ["avoid_late", "late"],
  ["short_walks", "walking"],
];
export const PRESET_IDS = PRESETS.map((p) => p.id) as [string, ...string[]];
export const PRESET_HELP = PRESETS.map((p) => `'${p.id}' (${p.label})`).join(", ");

/** "10am", "9:30 am", "2pm", "14:30" as minutes after midnight. Without am/pm, 1 to 6 o'clock is the afternoon. */
export function parseClock(v: string): number | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m?\.?)?\s*$/i.exec(v);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (min > 59 || h > 24 || (ap && (h < 1 || h > 12))) return null;
  if (ap === "p" && h < 12) h += 12;
  else if (ap === "a" && h === 12) h = 0;
  else if (!ap && h >= 1 && h <= 6) h += 12;
  const t = h * 60 + min;
  return t <= 1440 ? t : null;
}

const DAY_NAMES: [RegExp, number][] = [
  [/^mo(n(day)?)?$/i, 1],
  [/^tu(e(s(day)?)?)?$/i, 2],
  [/^we(d(nesday)?)?$/i, 4],
  [/^th(u(r(s(day)?)?)?)?$/i, 8],
  [/^fr(i(day)?)?$/i, 16],
];
const LETTERS: Record<string, number> = { M: 1, T: 2, W: 4, R: 8, F: 16 };

/** "F", "Fri", "Friday", "MWF", "TR" (R is Thursday) as a day mask (M=1 ... F=16); null when it isn't weekdays. */
export function parseDays(v: string): number | null {
  const t = v.trim();
  for (const [re, bit] of DAY_NAMES) if (re.test(t)) return bit;
  if (!/^[MTWRF]+$/i.test(t)) return null;
  return [...t.toUpperCase()].reduce((m, l) => m | LETTERS[l], 0);
}

/** The must-haves in plain words. */
function mustWords(p: Prefs): string[] {
  const out = timeRulesSummary(p);
  if (p.lunch) out.push(`a ${p.lunchMin}-minute lunch break between ${fmtTime(p.lunchFrom)} and ${fmtTime(p.lunchTo)} on every day with class`);
  for (const b of p.blocked) out.push(`no class ${daysStr(b.d)} ${fmtTime(b.s)}-${fmtTime(b.e)}`);
  if (p.openOnly) out.push("open sections only");
  if (p.includeSpecial) out.push("special sections allowed");
  return out;
}

/** The request's must-haves and priorities as the site's Prefs, and what couldn't be read. */
export function prefsOf(a: BuildArgs): { prefs: Prefs; problems: string[] } {
  const problems: string[] = [];
  const clock = (v: string | undefined, what: string): number | null => {
    if (v === undefined || v === "") return null;
    const t = parseClock(v);
    if (t === null) problems.push(`${what}: '${v}' isn't a time like '10am', '2:30pm' or '14:30', so it's ignored.`);
    return t;
  };
  const p: Prefs = { ...DEFAULT_PREFS, weights: { ...DEFAULT_PREFS.weights }, blocked: [] };
  p.earliest = clock(a.no_classes_before, "no_classes_before");
  p.latest = clock(a.done_by, "done_by");
  for (const d of a.days_off ?? []) {
    const m = parseDays(d);
    if (m === null) problems.push(`days_off: '${d}' isn't a weekday (M, T, W, R for Thursday, F, or a day name), so it's ignored.`);
    else p.daysOff |= m;
  }
  if (a.lunch_break) {
    p.lunch = true;
    if (typeof a.lunch_break === "object") {
      p.lunchFrom = clock(a.lunch_break.from, "lunch_break.from") ?? p.lunchFrom;
      p.lunchTo = clock(a.lunch_break.to, "lunch_break.to") ?? p.lunchTo;
      p.lunchMin = a.lunch_break.minutes ?? p.lunchMin;
    }
  }
  for (const b of a.blocked_times ?? []) {
    const d = parseDays(b.days);
    const s = clock(b.from, "blocked_times.from");
    const e = clock(b.to, "blocked_times.to");
    if (d === null) problems.push(`blocked_times: '${b.days}' isn't weekdays like 'TR' or 'MWF', so that blocked time is ignored.`);
    else if (s !== null && e !== null && e > s) p.blocked.push({ d, s, e });
    else if (s !== null && e !== null) problems.push(`blocked_times: ${b.from} to ${b.to} ends before it starts, so it's ignored.`);
  }
  p.openOnly = a.open_sections_only ?? false;
  p.includeSpecial = a.include_special_sections ?? false;
  const w = a.what_matters ?? {};
  const preset = w.preset ? PRESETS.find((x) => x.id === w.preset) : undefined;
  if (preset) p.weights = { ...preset.weights };
  for (const [k, key] of WEIGHT_KEYS) {
    const v = w[k];
    if (v !== undefined) p.weights[key] = Math.min(3, Math.max(0, Math.round(v)));
  }
  p.softEarly = clock(w.too_early_before, "what_matters.too_early_before") ?? p.softEarly;
  p.softLate = clock(w.too_late_after, "what_matters.too_late_after") ?? p.softLate;
  // the site's own round trip, so the link carries exactly what's ranked here (a lunch window too short for its
  // break falls back to the default, as on the site)
  const params = new URLSearchParams();
  prefsToParams(p, params);
  const prefs = prefsFromParams(params);
  if (p.lunch && (prefs.lunchFrom !== p.lunchFrom || prefs.lunchTo !== p.lunchTo || prefs.lunchMin !== p.lunchMin))
    problems.push("lunch_break: the window can't hold the break, so the site's default is used: 45 minutes free between 11am and 2pm.");
  return { prefs, problems };
}

/** The builder's link to schedule `i` of these courses and rules: the cart, term, must-have and schedule parameters. */
export function scheduleLink(site: string, term: string, items: CartItem[], prefs: Prefs, i: number): string {
  const u = new URLSearchParams();
  u.set("t", term);
  u.set("c", encodeCart(items));
  prefsToParams(prefs, u);
  u.set("i", String(i));
  return `${site}/schedule/?${u}`;
}

function scheduleSection(course: Course, b: Schedule["bundles"][number], s: Section, statusKnown: boolean) {
  const prof = b.prof && s.component === "primary" && s.instructors.includes(b.prof.key) ? b.prof : null;
  return {
    course: b.course,
    crn: s.crn,
    section: s.code,
    type: s.type_name || s.type,
    meets: s.meetings.map((m) => ({
      days: daysStr(m.d) || null,
      time: m.s === null ? "no set time (online or arranged)" : `${fmtTime(m.s)}-${fmtTime(m.e)}`,
      where: [m.b, m.r].filter(Boolean).join(" ") || null,
    })),
    instructors: s.instructors.map((k, i) => course.instructors[k]?.name ?? s.instructors_raw[i] ?? k),
    seats: statusKnown ? s.status || "unknown" : "not published yet",
    ...(prof ? { professor_best_pick_score: prof.score } : {}),
  };
}

/**
 * The schedule builder for an AI app (#100): the site's own generator, ranking and "why nothing fits", so the top
 * schedule is the one the site shows for the same courses and rules. `missing` says which courses weren't found.
 */
export function buildSchedules(found: Loaded[], missing: string[], meta: Meta, site: string, a: BuildArgs) {
  const problems = [...missing];
  let term = a.term ?? meta.next_term;
  if (!/^\d{4}-(sp|su|fa|wi)$/.test(term)) {
    problems.push(`term: '${term}' isn't a term id like '${meta.next_term}', so ${termLabel(meta.next_term)} is used.`);
    term = meta.next_term;
  }
  const label = termLabel(term);
  const { prefs, problems: ruleProblems } = prefsOf(a);
  problems.push(...ruleProblems);
  const items: CartItem[] = found.map((f) => ({ s: f.course.subject, n: f.course.number, locked: [] }));
  for (const crn of a.locked_crns ?? []) {
    const i = found.findIndex((f) => f.course.terms[term]?.sections.some((s) => s.crn === crn));
    if (i < 0) problems.push(`locked_crns: ${crn} isn't a section of ${items.map((x) => `${x.s} ${x.n}`).join(", ")} in ${label}, so it isn't locked.`);
    else if (!items[i].locked.includes(crn)) items[i].locked.push(crn);
  }
  // a student who just opened the site: the default best-pick weights and About you not filled in
  const ctx: InputContext = { rmpPrior: meta.score_priors?.rmp.quality ?? null, priors: meta.score_priors ?? null, weights: DEFAULT_WEIGHTS, me: NOBODY };
  const inputs = found.map((f, i) => courseInput(`${items[i].s} ${items[i].n}`, f.course, items[i].locked, term, ctx));
  const res = generate(inputs, term, prefs);
  const limit = Math.min(Math.max(a.limit ?? 3, 1), 10);
  const offeredNote = new Set(warnings(inputs, term, null, label)); // "X is not offered": cannot_schedule says it
  const schedules = res.schedules.slice(0, limit).map((s, i) => {
    const counted = inputs.filter((x) => s.bundles.some((b) => b.course === x.key));
    const hours = totalHours(counted.map((x) => x.course.credit_range));
    const variable = counted.filter((x) => x.course.credit_range[0] && x.course.credit_range[0] !== x.course.credit_range[1]).map((x) => x.key);
    const notes = [...hourWarnings(hours, counted.length, term, label, variable, true).map((h) => h.text), ...warnings(inputs, term, s, label).filter((x) => !offeredNote.has(x))];
    return {
      rank: i + 1,
      summary: summaryLine(s.stats, fmtTime),
      expected_gpa: gpa(s.stats.expectedGpa),
      credit_hours: fmtCredits(hours),
      days_off: s.stats.daysOff,
      first_class_starts: s.stats.earliest === null ? null : fmtTime(s.stats.earliest),
      last_class_ends: s.stats.latest === null ? null : fmtTime(s.stats.latest),
      gaps_minutes_a_week: s.stats.gapMinutes,
      rushed_walks: s.stats.backToBackFar,
      open_now: `${s.bundles.filter((b) => bundleOpen(b)).length} of ${s.bundles.length}`,
      finals: finalsSummary(s),
      ...(examConflicts(s).some((c) => c.kind !== "exactly-24h") ? { exam_conflict: true } : {}),
      crns: s.bundles.flatMap((b) => b.crns),
      sections: s.bundles.flatMap((b) => {
        const inp = inputs.find((x) => x.key === b.course)!;
        return b.sections.map((x) => scheduleSection(inp.course, b, x, Boolean(inp.course.terms[term]?.status_known)));
      }),
      ...(notes.length ? { warnings: notes } : {}),
      open_on_site: scheduleLink(site, term, items, prefs, i),
    };
  });
  const cannot = res.emptyCourses.map((k) => ({ course: k, why: explainEmpty(inputs.find((x) => x.key === k)!, term, prefs) }));
  let none: string[] | null = null;
  if (!res.schedules.length && inputs.length > res.emptyCourses.length) {
    none = clashingPairs(inputs, term, prefs).map((c) => `${c.text}.`);
    const blame = locksToBlame(inputs, term, prefs);
    if (blame.each.length) none.push(`The locked sections are what rule every schedule out: unlocking ${blame.each.join(" or ")} lets schedules fit again.`);
    else if (blame.all) none.push("The locked sections together rule every schedule out: no single unlock is enough, but unlocking all of them lets schedules fit again.");
    if (!none.length) none.push(`Every pair of courses can fit, but not all of them at once${prefs.lunch ? " with a lunch break" : ""}. Try removing a must-have or a course.`);
  }
  const renumbered = found.flatMap((f) => (f.renumbered ? [f.renumbered] : []));
  return {
    term: label,
    courses: inputs.map((x) => ({ code: x.key, ...(x.locked.length ? { locked_crns: x.locked } : {}) })),
    ...(renumbered.length ? { renumbered } : {}),
    must_haves: mustWords(prefs),
    schedules_that_fit: res.total,
    ...(res.truncated ? { search_stopped_early: true } : {}),
    shown: schedules.length,
    schedules,
    ...(cannot.length ? { cannot_schedule: cannot } : {}),
    ...(none ? { why_no_schedule: none } : {}),
    ...(problems.length ? { warnings: problems } : {}),
    check_before_registering: "Open a schedule's open_on_site link to see it in the site's schedule builder, where seats are live and restrictions are checked against About you.",
    data: data(meta, term),
  };
}
