// Watched sections (#15): the sections a student is waiting on. Stored in this browser (localStorage) and encodable into
// a link, like the cart (lib/cart.ts) and My courses; nothing is sent anywhere. Just opened lists them with their latest
// status, filters to them and notifies on them. The live seat job re-reads the busiest courses and those on
// data/watch.txt, not the ones watched here (docs/LIMITATIONS.md "Watching a section").

export type Watched = { t: string; crn: string; s: string; n: string; code: string };

const KEY = "illini-scheduler:watch:v1";
const EVENT = "illini-watch-change";
/** Keeps a share link around 1 KB. */
export const MAX_WATCH = 40;

export const watchKey = (t: string, crn: string) => `${t}|${crn}`;

/** "2027-sp.CS124.AL1.31152,..." (section codes never hold "." or ","; URLSearchParams escapes "#", "&" and "@"). */
export function encodeWatch(items: Watched[]): string {
  return items.map((i) => `${i.t}.${i.s}${i.n}.${i.code}.${i.crn}`).join(",");
}

export function decodeWatch(param: string | null | undefined): Watched[] {
  if (!param) return [];
  const out: Watched[] = [];
  for (const part of param.split(",")) {
    const m = /^(\d{4}-(?:sp|su|fa|wi))\.([A-Za-z]{2,5})(\d{3})\.([^.,\s]{1,8})\.(\d{5})$/.exec(part.trim());
    if (!m) continue;
    const item = { t: m[1], s: m[2].toUpperCase(), n: m[3], code: m[4], crn: m[5] };
    if (!out.some((o) => o.t === item.t && o.crn === item.crn) && out.length < MAX_WATCH) out.push(item);
  }
  return out;
}

export function readWatch(): Watched[] {
  try {
    return decodeWatch(window.localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function writeWatch(items: Watched[]): void {
  try {
    window.localStorage.setItem(KEY, encodeWatch(items.slice(0, MAX_WATCH)));
  } catch {
    /* storage unavailable: the list still lives in a share link */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function isWatched(items: Watched[], t: string, crn: string): boolean {
  return items.some((i) => i.t === t && i.crn === crn);
}

/** Watch or stop watching a section. Returns the new state; false without a change when the list is full. */
export function toggleWatch(item: Watched): boolean {
  const items = readWatch();
  if (isWatched(items, item.t, item.crn)) {
    writeWatch(items.filter((i) => !(i.t === item.t && i.crn === item.crn)));
    return false;
  }
  if (items.length >= MAX_WATCH) return false;
  writeWatch([...items, item]);
  return true;
}

/** `mine` first, then the sections of `other` not in it, up to MAX_WATCH. */
export function mergeWatch(mine: Watched[], other: Watched[]): Watched[] {
  return [...mine, ...other.filter((o) => !isWatched(mine, o.t, o.crn))].slice(0, MAX_WATCH);
}

export function onWatchChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

const ms = (iso: string) => new Date(iso).getTime() || 0;

/**
 * A watched section's latest status and when it was last checked, as [status, checked at]: the newer of the course
 * page's daily check and the seat feed (lib/live.ts currentStatus). When the live job re-read the course after that and
 * logged no change, the status still holds at that later time.
 */
export function latestStatus(daily: [string, string] | null, feed: [string, string] | undefined, readAt: string | undefined): [string, string] | null {
  let cur = daily;
  if (feed && (!cur || ms(feed[1]) >= ms(cur[1]))) cur = feed;
  if (cur && readAt && ms(readAt) > ms(cur[1])) cur = [cur[0], readAt];
  return cur;
}
