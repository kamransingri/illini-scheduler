// Winter courses: the newest winter's classes from web/public/data/winter.json (pipeline/winter.py). A course that ran
// last winter gets a Winter line and tab on its course page. Pure functions, so they're unit tested.

/** One course's classes in the winter shown. */
export type WinterRow = {
  s: string;
  n: string;
  nSec: number;
  online: "all" | "some" | "none"; // how many of its class sections are online
  ran: number; // of the last `recent` winters (up to 3), how many it ran in
};
/** `upcoming`: the winter shown is still ahead (its schedule is out); otherwise it's last winter's, until the next is out. */
export type WinterData = { term: string; label: string; recent: string[]; upcoming: boolean; next: string; next_label: string; courses: WinterRow[] };

const WHERE: Record<WinterRow["online"], string> = { all: "online", some: "online or on campus", none: "on campus" };

/** The course page's Winter line: "Winter 2027: online. Ran in 3 of the last 3 winters." */
export function winterLine(r: WinterRow, d: Pick<WinterData, "label" | "recent" | "upcoming" | "next_label">): string {
  const ran = d.recent.length > 1 ? ` in ${r.ran} of the last ${d.recent.length} winters` : "";
  return d.upcoming
    ? `${d.label}: ${WHERE[r.online]}.${ran ? ` Ran${ran}.` : ""}`
    : `Ran in ${d.label} (${WHERE[r.online]})${ran ? `, and${ran}` : ""}. ${d.next_label}'s schedule isn't out yet.`;
}
