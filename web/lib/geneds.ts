import type { GenedRow } from "./types";

export const GENED_GROUPS: { cat: string; label: string; codes: string[] }[] = [
  { cat: "COMP", label: "Composition", codes: ["COMP1", "ACP"] },
  { cat: "CS", label: "Cultural Studies", codes: ["US", "WCC", "NW"] },
  { cat: "HUM", label: "Humanities & the Arts", codes: ["HP", "LA"] },
  { cat: "NAT", label: "Natural Sciences & Technology", codes: ["LS", "PS"] },
  { cat: "QR", label: "Quantitative Reasoning", codes: ["QR1", "QR2"] },
  { cat: "SBS", label: "Social & Behavioral Sciences", codes: ["SS", "BSC"] },
];

export type SortKey = "gpa" | "pctA" | "rmp" | "open";

export type Filters = {
  codes: string[]; // any of these gen-ed codes
  credits: number | null; // course must be able to award this many hours
  earliest: number | null; // minutes; some section bundle must start at or after this (e.g. 540 = no 8am)
  noFriday: boolean;
  onlineOnly: boolean;
  openNext: boolean;
  minRmp: number | null;
  doubleDip: boolean; // satisfies 2+ categories
  minStudents: number; // GPA sample size floor (0 = off)
};

export const DEFAULT_FILTERS: Filters = {
  codes: [],
  credits: null,
  earliest: null,
  noFriday: false,
  onlineOnly: false,
  openNext: false,
  minRmp: null,
  doubleDip: false,
  minStudents: 200,
};

/** Filters + sort <-> URL query, so Back / reload / sharing keep them. */
export function filtersToQuery(f: Filters, sort: SortKey): string {
  const p = new URLSearchParams();
  if (f.codes.length) p.set("codes", f.codes.join(","));
  if (f.credits !== null) p.set("cr", String(f.credits));
  if (f.earliest !== null) p.set("e", String(f.earliest));
  if (f.noFriday) p.set("nf", "1");
  if (f.onlineOnly) p.set("on", "1");
  if (f.openNext) p.set("nx", "1");
  if (f.minRmp !== null) p.set("rmp", String(f.minRmp));
  if (f.doubleDip) p.set("dd", "1");
  if (f.minStudents !== DEFAULT_FILTERS.minStudents) p.set("min", String(f.minStudents));
  if (sort !== "gpa") p.set("sort", sort);
  return p.toString();
}

export function filtersFromQuery(q: string): { f: Filters; sort: SortKey } {
  const p = new URLSearchParams(q);
  const num = (k: string) => (p.has(k) && !Number.isNaN(Number(p.get(k))) ? Number(p.get(k)) : null);
  const sort = (["gpa", "pctA", "rmp", "open"] as SortKey[]).find((k) => k === p.get("sort")) ?? "gpa";
  return {
    sort,
    f: {
      codes: (p.get("codes") ?? "").split(",").filter((c) => /^[A-Z0-9]{2,5}$/.test(c)),
      credits: num("cr"),
      earliest: num("e"),
      noFriday: p.get("nf") === "1",
      onlineOnly: p.get("on") === "1",
      openNext: p.get("nx") === "1",
      minRmp: num("rmp"),
      doubleDip: p.get("dd") === "1",
      minStudents: num("min") ?? DEFAULT_FILTERS.minStudents,
    },
  };
}

/** Number of sections that count as "open next term": known-open if status is published, else listed. */
export function openCount(r: GenedRow): number {
  return r.statusKnown ? (r.nOpen ?? 0) : r.nSec;
}

function timeOk(r: GenedRow, f: Filters): boolean {
  if (f.earliest === null && !f.noFriday && !f.onlineOnly) return true;
  return r.opts.some(([start, days, online]) => {
    if (f.onlineOnly && !online) return false;
    if (f.earliest !== null && start !== -1 && start < f.earliest) return false;
    if (f.noFriday && days & 16) return false;
    return true;
  });
}

export function matches(r: GenedRow, f: Filters): boolean {
  if (f.codes.length && !r.codes.some((c) => f.codes.includes(c))) return false;
  if (f.doubleDip && r.cats.length < 2) return false;
  if (f.minStudents && r.gpaN < f.minStudents) return false;
  if (f.credits !== null && !(r.cr[0] <= f.credits && f.credits <= r.cr[1])) return false;
  if (f.openNext && openCount(r) === 0) return false;
  if (f.minRmp !== null && (r.rmp === null || r.rmp < f.minRmp)) return false;
  if ((f.earliest !== null || f.noFriday || f.onlineOnly) && !r.opts.length) return false;
  return timeOk(r, f);
}

const nullsLast = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity);

export function sortRows(rows: GenedRow[], key: SortKey): GenedRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    let d = 0;
    if (key === "gpa") d = nullsLast(a.gpa, b.gpa);
    else if (key === "pctA") d = nullsLast(a.pctA, b.pctA);
    else if (key === "rmp") d = nullsLast(a.rmp, b.rmp);
    else d = openCount(b) - openCount(a);
    return d || nullsLast(a.gpa, b.gpa) || `${a.s}${a.n}`.localeCompare(`${b.s}${b.n}`);
  });
  return out;
}

export function applyFilters(rows: GenedRow[], f: Filters, key: SortKey): GenedRow[] {
  return sortRows(
    rows.filter((r) => matches(r, f)),
    key,
  );
}
