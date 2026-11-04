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
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "America/Chicago" });
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

export function dataUrl(path: string): string {
  return `${basePath()}/data/${path}`;
}

export function courseHref(subject: string, number: string): string {
  return `/course/${subject}/${number}/`;
}

export function cisUrl(term: string, subject: string, number: string, crn?: string): string {
  const [y, s] = term.split("-");
  const season = { sp: "spring", su: "summer", fa: "fall", wi: "winter" }[s] ?? s;
  const base = `https://courses.illinois.edu/schedule/${y}/${season}/${subject}/${number}`;
  return crn ? `${base}?sectionId=${crn}` : base;
}

export const SELF_SERVICE_URL = "https://banner.apps.uillinois.edu/StudentRegistrationSSB/";
