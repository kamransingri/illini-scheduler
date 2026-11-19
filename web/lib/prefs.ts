// Builder rules/weights <-> URL params and localStorage, so share links reproduce the same schedules.
// Only what differs from DEFAULT_PREFS is written. Links from before v0.4.0 (nf=1, 6-digit weights) still open, and
// links with 8-digit weights (before Best professor) keep its default.
import { fmtTime } from "./format";
import { DEFAULT_PREFS, type Prefs } from "./schedule";

/** The active plan's must-haves and priorities (lib/plans.ts keeps the other plans). */
export const PREFS_KEY = "illini-scheduler:prefs:v1";
const W_ORDER: (keyof Prefs["weights"])[] = ["gpa", "rmp", "early", "daysOff", "compact", "walking", "late", "open", "prof"];
const PARAMS = ["e", "l", "do", "nf", "lu", "lf", "lt", "lm", "oo", "sp", "eo", "b", "w", "se", "sl"];

const minutes = (v: string | null, lo = 0, hi = 1440): number | null => {
  if (v === null || v === "" || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= lo && n <= hi ? n : null;
};

export function prefsToParams(p: Prefs, params: URLSearchParams): void {
  for (const k of PARAMS) params.delete(k);
  if (p.earliest !== null) params.set("e", String(p.earliest));
  if (p.latest !== null) params.set("l", String(p.latest));
  if (p.daysOff) params.set("do", String(p.daysOff));
  if (p.lunch) params.set("lu", "1");
  if (p.lunchFrom !== DEFAULT_PREFS.lunchFrom) params.set("lf", String(p.lunchFrom));
  if (p.lunchTo !== DEFAULT_PREFS.lunchTo) params.set("lt", String(p.lunchTo));
  if (p.lunchMin !== DEFAULT_PREFS.lunchMin) params.set("lm", String(p.lunchMin));
  if (p.openOnly) params.set("oo", "1");
  if (p.includeSpecial) params.set("sp", "1");
  if (!p.eligibleOnly) params.set("eo", "0");
  if (p.blocked.length) params.set("b", p.blocked.map((b) => `${b.d}-${b.s}-${b.e}`).join("."));
  if (p.softEarly !== DEFAULT_PREFS.softEarly) params.set("se", String(p.softEarly));
  if (p.softLate !== DEFAULT_PREFS.softLate) params.set("sl", String(p.softLate));
  const w = W_ORDER.map((k) => p.weights[k]).join("");
  if (w !== W_ORDER.map((k) => DEFAULT_PREFS.weights[k]).join("")) params.set("w", w);
}

/** Saved or linked rules in one canonical form ("" for the defaults), to tell whether two plans have the same rules. */
export function normPrefs(raw: string | null | undefined): string {
  const params = new URLSearchParams();
  prefsToParams(prefsFromParams(new URLSearchParams(raw ?? "")), params);
  return params.toString();
}

export function hasPrefParams(params: URLSearchParams): boolean {
  return PARAMS.some((k) => params.has(k));
}

export function prefsFromParams(params: URLSearchParams): Prefs {
  const p: Prefs = { ...DEFAULT_PREFS, weights: { ...DEFAULT_PREFS.weights }, blocked: [] };
  p.earliest = minutes(params.get("e"), 0, 1439);
  p.latest = minutes(params.get("l"), 1, 1440);
  p.daysOff = (minutes(params.get("do"), 0, 31) ?? 0) | (params.get("nf") === "1" ? 16 : 0);
  p.lunch = params.get("lu") === "1";
  // the lunch window (#56); one that can't hold its own break falls back to 11am-2pm, 45 minutes
  const lf = minutes(params.get("lf"), 0, 1439) ?? DEFAULT_PREFS.lunchFrom;
  const lt = minutes(params.get("lt"), 1, 1440) ?? DEFAULT_PREFS.lunchTo;
  const lm = minutes(params.get("lm"), 5, 240) ?? DEFAULT_PREFS.lunchMin;
  if (lt - lf >= lm) Object.assign(p, { lunchFrom: lf, lunchTo: lt, lunchMin: lm });
  p.openOnly = params.get("oo") === "1";
  p.includeSpecial = params.get("sp") === "1";
  p.eligibleOnly = params.get("eo") !== "0";
  p.softEarly = minutes(params.get("se"), 0, 1439) ?? DEFAULT_PREFS.softEarly;
  p.softLate = minutes(params.get("sl"), 1, 1440) ?? DEFAULT_PREFS.softLate;
  for (const part of (params.get("b") ?? "").split(".")) {
    const [d, s, en] = part.split("-").map(Number);
    if (d > 0 && d < 128 && s >= 0 && en > s && en <= 1440) p.blocked.push({ d, s, e: en });
  }
  const w = params.get("w");
  if (w && /^[0-3]{6}([0-3]{2}[0-3]?)?$/.test(w)) W_ORDER.forEach((k, i) => i < w.length && (p.weights[k] = Number(w[i])));
  return p;
}

export function savePrefs(p: Prefs): void {
  try {
    const params = new URLSearchParams();
    prefsToParams(p, params);
    window.localStorage.setItem(PREFS_KEY, params.toString());
  } catch {
    /* ignore */
  }
}

/** Calls `fn` when the saved rules change in another tab (the schedule builder open next to the gen-ed finder). */
export function onPrefsChange(fn: () => void): () => void {
  const h = (e: StorageEvent) => {
    if (e.key === PREFS_KEY || e.key === null) fn();
  };
  window.addEventListener("storage", h);
  return () => window.removeEventListener("storage", h);
}

const DAY_NAMES: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [4, "Wed"],
  [8, "Thu"],
  [16, "Fri"],
];

/** The start time, end time and days off in plain words: "start 10:00am or later", "done by 5:00pm", "Mon, Fri off". */
export function timeRulesSummary(p: Pick<Prefs, "earliest" | "latest" | "daysOff">): string[] {
  const out: string[] = [];
  if (p.earliest !== null) out.push(`start ${fmtTime(p.earliest)} or later`);
  if (p.latest !== null) out.push(`done by ${fmtTime(p.latest)}`);
  if (p.daysOff) out.push(`${DAY_NAMES.filter(([b]) => p.daysOff & b).map(([, n]) => n).join(", ")} off`);
  return out;
}

export function loadPrefs(): Prefs | null {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw === null ? null : prefsFromParams(new URLSearchParams(raw));
  } catch {
    return null;
  }
}

/** One-click starting points for "What matters to you" (the student can still move every slider). */
export const PRESETS: { id: string; label: string; weights: Prefs["weights"] }[] = [
  { id: "balanced", label: "Balanced", weights: DEFAULT_PREFS.weights },
  { id: "gpa", label: "Best grades", weights: { gpa: 3, rmp: 2, early: 0, late: 0, daysOff: 0, compact: 0, walking: 1, open: 1, prof: 2 } },
  { id: "prof", label: "Best professors", weights: { gpa: 1, rmp: 1, early: 0, late: 0, daysOff: 0, compact: 0, walking: 1, open: 1, prof: 3 } },
  { id: "sleep", label: "Sleep in", weights: { gpa: 1, rmp: 1, early: 3, late: 0, daysOff: 1, compact: 1, walking: 1, open: 1, prof: 1 } },
  { id: "compact", label: "Fewer days on campus", weights: { gpa: 1, rmp: 1, early: 0, late: 0, daysOff: 3, compact: 2, walking: 1, open: 1, prof: 1 } },
  { id: "open", label: "Can register now", weights: { gpa: 1, rmp: 1, early: 1, late: 0, daysOff: 1, compact: 1, walking: 1, open: 3, prof: 1 } },
];
