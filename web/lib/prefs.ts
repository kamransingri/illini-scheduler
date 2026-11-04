// Builder rules/weights <-> URL params and localStorage, so share links reproduce the same schedules.
import { DEFAULT_PREFS, type Prefs } from "./schedule";

const KEY = "illini-scheduler:prefs:v1";
const W_ORDER: (keyof Prefs["weights"])[] = ["gpa", "rmp", "early", "daysOff", "compact", "walking"];

export function prefsToParams(p: Prefs, params: URLSearchParams): void {
  for (const k of ["e", "nf", "b", "w", "sp"]) params.delete(k);
  if (p.earliest !== null) params.set("e", String(p.earliest));
  if (p.noFriday) params.set("nf", "1");
  if (p.includeSpecial) params.set("sp", "1");
  if (p.blocked.length) params.set("b", p.blocked.map((b) => `${b.d}-${b.s}-${b.e}`).join("."));
  const w = W_ORDER.map((k) => p.weights[k]).join("");
  if (w !== W_ORDER.map((k) => DEFAULT_PREFS.weights[k]).join("")) params.set("w", w);
}

export function hasPrefParams(params: URLSearchParams): boolean {
  return ["e", "nf", "b", "w", "sp"].some((k) => params.has(k));
}

export function prefsFromParams(params: URLSearchParams): Prefs {
  const p: Prefs = { ...DEFAULT_PREFS, weights: { ...DEFAULT_PREFS.weights }, blocked: [] };
  const e = Number(params.get("e"));
  if (params.has("e") && e >= 0 && e < 1440) p.earliest = e;
  p.noFriday = params.get("nf") === "1";
  p.includeSpecial = params.get("sp") === "1";
  for (const part of (params.get("b") ?? "").split(".")) {
    const [d, s, en] = part.split("-").map(Number);
    if (d > 0 && d < 128 && s >= 0 && en > s && en <= 1440) p.blocked.push({ d, s, e: en });
  }
  const w = params.get("w");
  if (w && /^[0-3]{6}$/.test(w)) W_ORDER.forEach((k, i) => (p.weights[k] = Number(w[i])));
  return p;
}

export function savePrefs(p: Prefs): void {
  try {
    const params = new URLSearchParams();
    prefsToParams(p, params);
    window.localStorage.setItem(KEY, params.toString());
  } catch {
    /* ignore */
  }
}

export function loadPrefs(): Prefs | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? null : prefsFromParams(new URLSearchParams(raw));
  } catch {
    return null;
  }
}
