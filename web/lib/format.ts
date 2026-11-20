// Formatting helpers shared by server and client components.

const SEASON: Record<string, string> = { sp: "Spring", su: "Summer", fa: "Fall", wi: "Winter" };

export function termLabel(term: string | null | undefined): string {
  if (!term) return "";
  const [y, s] = term.split("-");
  return `${SEASON[s] ?? s} ${y}`;
}

export function termRange(a?: string, b?: string): string {
  if (!a) return "";
  if (!b || a === b) return termLabel(a);
  return `${termLabel(a)} to ${termLabel(b)}`;
}

export function termOrder(term: string): number {
  const [y, s] = term.split("-");
  return Number(y) * 10 + ({ wi: 0, sp: 1, su: 2, fa: 3 } as Record<string, number>)[s];
}

export function fmtTime(min: number | null | undefined): string {
  if (min === null || min === undefined) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

export const DAY_LETTERS: [string, number][] = [
  ["M", 1],
  ["T", 2],
  ["W", 4],
  ["R", 8],
  ["F", 16],
  ["S", 32],
  ["U", 64],
];

export function daysStr(mask: number): string {
  return DAY_LETTERS.filter(([, b]) => mask & b)
    .map(([l]) => l)
    .join("");
}

export function fmtGpa(x: number | null | undefined): string {
  return x === null || x === undefined || Number.isNaN(x) ? "–" : x.toFixed(2);
}

export function fmtPct(x: number | null | undefined, digits = 0): string {
  return x === null || x === undefined || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(digits)}%`;
}

export function fmtDelta(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  const r = Math.round(x * 100) / 100;
  if (r === 0) return "±0.00";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}`;
}

export function fmtInt(n: number | null | undefined): string {
  return n === null || n === undefined ? "–" : n.toLocaleString("en-US");
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // A bare date ("2026-11-16") is a calendar day, not UTC midnight: don't shift it into Chicago's previous evening.
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso.trim());
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: dayOnly ? "UTC" : "America/Chicago" });
}

export const GENED_NAMES: Record<string, string> = {
  ACP: "Advanced Composition",
  COMP1: "Composition I",
  US: "US Minority Cultures",
  WCC: "Western Cultures",
  NW: "Non-Western Cultures",
  HP: "Humanities: Hist & Phil",
  LA: "Humanities: Lit & Arts",
  PS: "Physical Sciences",
  LS: "Life Sciences",
  QR1: "Quantitative Reasoning I",
  QR2: "Quantitative Reasoning II",
  SS: "Social Sciences",
  BSC: "Behavioral Sciences",
};

/** Short names for tight spots (the gen-ed finder's chips and its "Counts for" column); GENED_NAMES has the full ones. */
export const GENED_SHORT: Record<string, string> = {
  ACP: "Advanced Comp",
  COMP1: "Composition I",
  US: "US Minority",
  WCC: "Western",
  NW: "Non-Western",
  HP: "Hist & Phil",
  LA: "Lit & Arts",
  PS: "Physical Sci",
  LS: "Life Sci",
  QR1: "Quant Reasoning I",
  QR2: "Quant Reasoning II",
  SS: "Social Sci",
  BSC: "Behavioral Sci",
};

export const GENED_CATEGORY_NAMES: Record<string, string> = {
  ACP: "Advanced Composition",
  CS: "Cultural Studies",
  HUM: "Humanities & Arts",
  NAT: "Natural Sciences & Tech",
  QR: "Quantitative Reasoning",
  SBS: "Social & Behavioral Sci",
  COMP1: "Composition I",
};

export function basePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

/** A data file's URL. The Cloudflare build sets NEXT_PUBLIC_DATA_URL so data comes from GitHub Pages (docs/CLOUDFLARE.md). */
export function dataUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_DATA_URL ?? `${basePath()}/data`}/${path}`;
}

export function courseHref(subject: string, number: string): string {
  return `/course/${subject}/${number}/`;
}

/** RMP's "add a rating" page for a matched professor. It takes RMP's numeric (legacy) id; anything else gets the profile page. */
export function rmpRateUrl(rmp: { id: string; url: string }): string {
  return /^\d+$/.test(rmp.id) ? `https://www.ratemyprofessors.com/add/professor-rating/${rmp.id}` : rmp.url;
}

export function cisUrl(term: string, subject: string, number: string, crn?: string): string {
  const [y, s] = term.split("-");
  const season = { sp: "spring", su: "summer", fa: "fall", wi: "winter" }[s] ?? s;
  const base = `https://courses.illinois.edu/schedule/${y}/${season}/${subject}/${number}`;
  return crn ? `${base}?sectionId=${crn}` : base;
}

export const SELF_SERVICE_URL = "https://banner.apps.uillinois.edu/StudentRegistrationSSB/";

/** "today", "yesterday", "3 days ago", or a date. */
export function fmtAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return fmtDate(iso);
}

/** Opened / closed / changed, in words. */
export function seatVerb(oldStatus: string, newStatus: string): "opened" | "closed" | "changed" {
  const open = (x: string) => x.toLowerCase().includes("open");
  if (open(newStatus) && !open(oldStatus)) return "opened";
  if (newStatus.toLowerCase().includes("closed")) return "closed";
  return "changed";
}

/** Teachers Ranked as Excellent label: "2024-fa Excellent" -> "Fall 2024, Excellent". */
export function treLabel(s: string): string {
  const m = /^(\d{4}-(?:sp|su|fa|wi))\s+(.+)$/.exec(s.trim());
  return m ? `${termLabel(m[1])}, ${m[2]}` : s;
}
