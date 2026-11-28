// Summer and winter courses (#35, #121, #270): the newest summer's classes from web/public/data/summer.json, and the
// coming winter session's from winter.json, both written by pipeline/summer.py with the same fields. They show on
// course pages, in the search and in the gen-ed finder's Summer and Winter views; /summer/ redirects there. Pure
// functions, so they're unit tested.

/** One course's classes in the summer shown. */
export type SummerRow = {
  s: string;
  n: string;
  t: string;
  cr: [number, number] | null;
  codes: string[]; // gen-ed codes
  nSec: number;
  online: "all" | "some" | "none"; // how many of its class sections are online
  sess: string[]; // session ids (SESSION_LABEL)
  ran: number; // of the last `recent` summers (up to 3), how many it ran in
  gpa: number | null;
  page: boolean; // has a course page (offered in the current or next term)
};
/** `upcoming`: the summer shown is still ahead (its schedule is out); otherwise it's last summer's, until the next is out. */
export type SummerData = { term: string; label: string; recent: string[]; upcoming: boolean; next: string; next_label: string; courses: SummerRow[] };

/** Which file a term's classes come from: "2027-wi" -> winter.json, anything else -> summer.json. */
export type Season = "summer" | "winter";
export const seasonOf = (term: string): Season => (term.endsWith("-wi") ? "winter" : "summer");

/** pipeline/summer.py SESSIONS, by the id the page filters on. Weeks are from Summer 2026's dates. */
export const SESSION_LABEL: Record<string, string> = {
  S1: "Session I (4 weeks, from mid-May)",
  S18: "First 8 weeks (from mid-May)",
  A: "First 6 weeks (from mid-May)",
  full: "Full summer (12 weeks)",
  S2: "Session II (8 weeks, from mid-June)",
  S2A: "First half of Session II (4 weeks)",
  S2B: "Second half of Session II (4 weeks)",
  B: "Second 6 weeks (from late June)",
  other: "Dates vary",
};
export const SESSION_SHORT: Record<string, string> = {
  S1: "Session I",
  S18: "First 8 weeks",
  A: "First 6 weeks",
  full: "Full summer",
  S2: "Session II",
  S2A: "Session II, first half",
  S2B: "Session II, second half",
  B: "Second 6 weeks",
  other: "Dates vary",
};

/** `gened`: "any" (the default, in the gen-ed finder) any gen-ed, "all" every class, or one gen-ed code. */
export type SummerFilters = { q: string; gened: string; session: string; online: boolean; campus: boolean; every: boolean; undergrad: boolean };
export const DEFAULT_SUMMER: SummerFilters = { q: "", gened: "any", session: "", online: false, campus: false, every: false, undergrad: true };

/** "cs 1", "CS124", "algorithms": subject and number, or words of the title. */
export function matchesQuery(r: SummerRow, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const code = t.replace(/\s+/g, "");
  if (`${r.s}${r.n}`.toLowerCase().startsWith(code)) return true;
  return t.split(/\s+/).every((w) => r.t.toLowerCase().includes(w) || r.s.toLowerCase() === w);
}

export function summerMatches(r: SummerRow, f: SummerFilters, recent: number): boolean {
  if (f.undergrad && Number(r.n) >= 500) return false;
  if (f.gened === "any" ? !r.codes.length : f.gened !== "all" && !r.codes.includes(f.gened)) return false;
  if (f.session && !r.sess.includes(f.session)) return false;
  if (f.online && r.online === "none") return false;
  if (f.campus && r.online === "all") return false;
  if (f.every && r.ran < recent) return false;
  return matchesQuery(r, f.q);
}

export function filterSummer(rows: SummerRow[], f: SummerFilters, recent: number): SummerRow[] {
  return rows.filter((r) => summerMatches(r, f, recent));
}

/** Filters in the URL (only what differs from the defaults), so Back, reload and shared links keep them. */
export function summerToQuery(f: SummerFilters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.gened !== DEFAULT_SUMMER.gened) p.set("gened", f.gened);
  if (f.session) p.set("session", f.session);
  if (f.online) p.set("online", "1");
  if (f.campus) p.set("campus", "1");
  if (f.every) p.set("every", "1");
  if (!f.undergrad) p.set("grad", "1");
  return p.toString();
}

export function summerFromQuery(q: string): SummerFilters {
  const p = new URLSearchParams(q);
  const session = p.get("session") ?? "";
  const gened = p.get("gened") ?? "";
  return {
    q: p.get("q") ?? "",
    gened: /^[A-Z0-9]{2,5}$|^any$|^all$/.test(gened) ? gened : DEFAULT_SUMMER.gened,
    session: session in SESSION_LABEL ? session : "",
    online: p.get("online") === "1",
    campus: p.get("campus") === "1",
    every: p.get("every") === "1",
    undergrad: p.get("grad") !== "1",
  };
}

/** The gen-ed finder's Summer (or Winter) view with these filters: `?term=summer&...`. Winter has one session, so it
 * carries no session filter. */
export function summerHref(f: SummerFilters, season: Season = "summer"): string {
  const q = summerToQuery(season === "winter" ? { ...f, session: "" } : f);
  return `/geneds/?term=${season}${q ? `&${q}` : ""}`;
}

/**
 * An old /summer/ link (#124) -> the gen-ed finder's Summer view with the same filters. The Summer courses page listed
 * every class unless a gen-ed was picked, so a link without one asks for every class.
 */
export function summerRedirect(search: string): string {
  const old = new URLSearchParams(search);
  const f = summerFromQuery(search);
  return summerHref(old.get("gened") ? f : { ...f, gened: "all" });
}

export const WHERE: Record<SummerRow["online"], string> = { all: "online", some: "online or on campus", none: "on campus" };

/** "Session II, Session I" for a summer class; "Winter session" for a winter one (it's one session). */
export function sessionText(r: SummerRow, term: string): string {
  return seasonOf(term) === "winter" ? "Winter session" : r.sess.map((x) => SESSION_SHORT[x] ?? x).join(", ");
}

/** The course page's Summer line: "Summer 2027: Session II, online. Ran in 3 of the last 3 summers." A winter one:
 * "Winter 2027: Winter session, online. Ran in 3 of the last 3 winters." */
export function summerLine(r: SummerRow, d: Pick<SummerData, "term" | "label" | "recent" | "upcoming" | "next_label">): string {
  const sessions = sessionText(r, d.term);
  const ran = d.recent.length > 1 ? ` in ${r.ran} of the last ${d.recent.length} ${seasonOf(d.term)}s` : "";
  return d.upcoming
    ? `${d.label}: ${sessions}, ${WHERE[r.online]}.${ran ? ` Ran${ran}.` : ""}`
    : `Ran in ${d.label} (${sessions}, ${WHERE[r.online]})${ran ? `, and${ran}` : ""}. ${d.next_label}'s schedule isn't out yet.`;
}
