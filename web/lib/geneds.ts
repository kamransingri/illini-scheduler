import type { Prefs } from "./schedule";
import type { GenedRow } from "./types";

export const GENED_GROUPS: { cat: string; label: string; codes: string[] }[] = [
  { cat: "COMP", label: "Composition", codes: ["COMP1", "ACP"] },
  { cat: "CS", label: "Cultural Studies", codes: ["US", "WCC", "NW"] },
  { cat: "HUM", label: "Humanities & the Arts", codes: ["HP", "LA"] },
  { cat: "NAT", label: "Natural Sciences & Technology", codes: ["LS", "PS"] },
  { cat: "QR", label: "Quantitative Reasoning", codes: ["QR1", "QR2"] },
  { cat: "SBS", label: "Social & Behavioral Sciences", codes: ["SS", "BSC"] },
];

export type SortKey = "score" | "gpa" | "pctA" | "rmp" | "open";
export const DEFAULT_SORT: SortKey = "score";

export type Filters = {
  codes: string[]; // the course must carry every one of these gen-ed codes
  credits: number | null; // course must be able to award this many hours
  openNext: boolean; // has an open section next term (on by default; status unknown = any section)
  minRmp: number | null;
  doubleDip: boolean; // satisfies 2+ categories
  minStudents: number; // GPA sample size floor (0 = off)
  fits: boolean; // only courses that fit the schedule builder's start time, end time and days off (#30)
};

// Times and days are set in the schedule builder (D14.5); `fits` reads them from there instead of having its own.
export const DEFAULT_FILTERS: Filters = {
  codes: [],
  credits: null,
  openNext: true,
  minRmp: null,
  doubleDip: false,
  minStudents: 200,
  fits: false,
};

/** The schedule builder's must-haves that `fitsTimes` checks (and the two that decide which sections count). */
export type TimeRules = Pick<Prefs, "earliest" | "latest" | "daysOff" | "openOnly" | "includeSpecial">;

export function hasTimeRules(p: TimeRules | null): p is TimeRules {
  return !!p && (p.earliest !== null || p.latest !== null || p.daysOff !== 0);
}

// Flags on an `opts` entry (pipeline/export.py bundle_opts)
const OPT_CLOSED = 1;
const OPT_WITH_SPECIAL = 2;
const OPT_BY_DEFAULT = 4;

/**
 * How the course fares with the schedule builder's must-haves. "fits": the builder would keep at least one way to take
 * it, with every meeting inside the start and end times and none on a day off (untimed meetings always fit), as hardOk
 * in lib/schedule.ts. Otherwise why not: "special" (all its sections look special, which the builder leaves out unless
 * allowed), "closed" (no open section, with "Open sections only" on) or "times". Null when it has no sections. Blocked
 * times and the lunch break aren't checked here; the builder still applies them.
 */
export type Fit = "fits" | "times" | "special" | "closed";

export function timesFit(r: GenedRow, p: TimeRules): Fit | null {
  if (!r.opts.length) return null;
  const made = r.opts.filter(([, , , fl]) => fl & (p.includeSpecial ? OPT_WITH_SPECIAL : OPT_BY_DEFAULT));
  if (!made.length) return "special";
  const usable = p.openOnly ? made.filter(([, , , fl]) => !(fl & OPT_CLOSED)) : made;
  if (!usable.length) return "closed";
  const inside = ([s, e, d]: number[]) => s < 0 || ((p.earliest === null || s >= p.earliest) && (p.latest === null || e <= p.latest) && !(d & p.daysOff));
  return usable.some(inside) ? "fits" : "times";
}

export function fitsTimes(r: GenedRow, p: TimeRules): boolean {
  return timesFit(r, p) === "fits";
}

/** Filters + sort <-> URL query, so Back / reload / sharing keep them. Only what differs from the defaults is written. */
export function filtersToQuery(f: Filters, sort: SortKey): string {
  const p = new URLSearchParams();
  if (f.codes.length) p.set("codes", f.codes.join(","));
  if (f.credits !== null) p.set("cr", String(f.credits));
  if (!f.openNext) p.set("nx", "0");
  if (f.minRmp !== null) p.set("rmp", String(f.minRmp));
  if (f.doubleDip) p.set("dd", "1");
  if (f.minStudents !== DEFAULT_FILTERS.minStudents) p.set("min", String(f.minStudents));
  if (f.fits) p.set("fit", "1");
  if (sort !== DEFAULT_SORT) p.set("sort", sort);
  return p.toString();
}

export function filtersFromQuery(q: string): { f: Filters; sort: SortKey } {
  const p = new URLSearchParams(q);
  const num = (k: string) => (p.has(k) && !Number.isNaN(Number(p.get(k))) ? Number(p.get(k)) : null);
  const sort = (["score", "gpa", "pctA", "rmp", "open"] as SortKey[]).find((k) => k === p.get("sort")) ?? DEFAULT_SORT;
  return {
    sort,
    f: {
      codes: (p.get("codes") ?? "").split(",").filter((c) => /^[A-Z0-9]{2,5}$/.test(c)),
      credits: num("cr"),
      openNext: p.get("nx") !== "0",
      minRmp: num("rmp"),
      doubleDip: p.get("dd") === "1",
      minStudents: num("min") ?? DEFAULT_FILTERS.minStudents,
      fits: p.get("fit") === "1",
    },
  };
}

/** Number of sections that count as "open next term": known-open if status is published, else listed. */
export function openCount(r: GenedRow): number {
  return r.statusKnown ? (r.nOpen ?? 0) : r.nSec;
}

/** `rules`: the schedule builder's saved must-haves; `fits` does nothing without time rules among them. */
export function matches(r: GenedRow, f: Filters, rules: TimeRules | null = null): boolean {
  // every selected gen-ed code: picking Humanities and Non-Western shows only courses that count for both
  if (f.codes.length && !f.codes.every((c) => r.codes.includes(c))) return false;
  if (f.doubleDip && r.cats.length < 2) return false;
  if (f.minStudents && r.gpaN < f.minStudents) return false;
  if (f.credits !== null && !(r.cr[0] <= f.credits && f.credits <= r.cr[1])) return false;
  if (f.openNext && openCount(r) === 0) return false;
  if (f.minRmp !== null && (r.rmp === null || r.rmp < f.minRmp)) return false;
  if (f.fits && hasTimeRules(rules) && !fitsTimes(r, rules)) return false;
  return true;
}

const nullsLast = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity);

/** Sort rows; "score" needs `scoreOf` (the best-pick score with the student's weights, lib/rank.ts). */
export function sortRows(rows: GenedRow[], key: SortKey, scoreOf?: (r: GenedRow) => number | null): GenedRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    let d = 0;
    if (key === "score") d = scoreOf ? nullsLast(scoreOf(a), scoreOf(b)) : 0;
    else if (key === "gpa") d = nullsLast(a.gpa, b.gpa);
    else if (key === "pctA") d = nullsLast(a.pctA, b.pctA);
    else if (key === "rmp") d = nullsLast(a.rmp, b.rmp);
    else d = openCount(b) - openCount(a);
    return d || nullsLast(a.gpa, b.gpa) || `${a.s}${a.n}`.localeCompare(`${b.s}${b.n}`);
  });
  return out;
}

export function applyFilters(rows: GenedRow[], f: Filters, key: SortKey, scoreOf?: (r: GenedRow) => number | null, rules: TimeRules | null = null): GenedRow[] {
  return sortRows(
    rows.filter((r) => matches(r, f, rules)),
    key,
    scoreOf,
  );
}
