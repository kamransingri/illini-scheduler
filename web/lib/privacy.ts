// What this site keeps in the browser, for the privacy page (#142). tests/unit/privacy.test.ts fails when the code
// writes a storage key that isn't listed here, or this lists one the code no longer writes.
import { loadPushConfig, stopAlerts } from "./push";

export type Stored = { key: string; what: string; where: string };

export const STORED: Stored[] = [
  { key: "illini-scheduler:cart:v1", what: "The courses in your schedule and the sections you locked", where: "Schedule builder" },
  { key: "illini-scheduler:prefs:v1", what: "Your must-haves (times, days off, lunch) and what matters to you", where: "Schedule builder" },
  { key: "illini-scheduler:plans:v1", what: "Your named plans, each with its courses, locks and rules", where: "Schedule builder" },
  { key: "illini-scheduler:about-you:v1", what: "Your level (undergraduate, graduate) and class standing, to check section restrictions", where: "About you" },
  { key: "illini-scheduler:home:v1", what: "The hall or building you picked as where you live (its name only)", where: "Schedule builder, Getting there" },
  { key: "illini-score-weights", what: "How much GPA, ratings and the other factors count in the best-pick score", where: "Every page that ranks courses" },
  {
    key: "illini-scheduler:mycourses:v1",
    what: "My courses (taken, credit, in progress), AP and IB scores, your major and minors, boxes you ticked, and your four-year plan",
    where: "Degree checklist",
  },
  { key: "illini-scheduler:watch:v1", what: "The sections you watch (term, course, section, CRN)", where: "Course pages and Just opened" },
  { key: "illini-scheduler:alerts:v1", what: "The watched sections you turned seat alerts on for (term and CRN)", where: "Just opened" },
];

/**
 * Delete everything this site saved in this browser: every key above, a seat-alert subscription (the alert server is
 * told to forget it first), and the service worker. Returns how many keys were there.
 */
export async function clearEverything(): Promise<number> {
  let n = 0;
  try {
    for (const { key } of STORED) {
      if (window.localStorage.getItem(key) !== null) n++;
      window.localStorage.removeItem(key);
    }
  } catch {
    /* storage blocked: nothing was saved */
  }
  try {
    const cfg = await loadPushConfig();
    if (cfg) await stopAlerts(cfg);
  } catch {
    /* the alert server can't be reached: the browser's subscription still goes with the service worker below */
  }
  try {
    for (const reg of (await navigator.serviceWorker?.getRegistrations()) ?? []) await reg.unregister();
  } catch {
    /* no service worker support */
  }
  return n;
}
