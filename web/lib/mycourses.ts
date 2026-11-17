// "My courses": what a student has finished, has credit for, or is taking, plus their AP scores. Stored in this browser
// (localStorage) and encodable into the URL like the cart (lib/cart.ts); nothing is sent anywhere or committed.
import { decodeAp, encodeAp, type ApScore } from "./apcredit";

export type CourseStatus = "done" | "credit" | "in_progress";
/** `hours` and `ap` are set only on courses worked out from AP scores (lib/apcredit.ts), never on the student's own. */
export type MyCourse = { s: string; n: string; status: CourseStatus; hours?: number; ap?: string };
/**
 * `program` is the major; `minor` is optional (""). `ticked` holds the major's hand-ticked group ids and the minor's as
 * MINOR_TICK + id ("mn--language"): group ids never contain "--", so the two can't collide.
 * `year`: the AP table's entering year ("2026" = 2026-2027; "" = the newest). `declined`: AP credit switched off.
 */
export type MyState = { courses: MyCourse[]; program: string; minor: string; ticked: string[]; ap: ApScore[]; year: string; declined: string[] };
export const MINOR_TICK = "mn--";

export const STATUS_LABEL: Record<CourseStatus, string> = {
  done: "Completed",
  credit: "AP or transfer credit",
  in_progress: "In progress",
};

const KEY = "illini-scheduler:mycourses:v1";
const EVENT = "illini-mycourses-change";
const SUFFIX: Record<CourseStatus, string> = { done: "", credit: "~c", in_progress: "~p" };

export const EMPTY: MyState = { courses: [], program: "", minor: "", ticked: [], ap: [], year: "", declined: [] };
const SLUG = /^[a-z0-9-]*$/;

/** "STAT107,MATH220~c,CS124~p" (no suffix = completed, ~c = AP/transfer credit, ~p = in progress). */
export function encodeCourses(items: MyCourse[]): string {
  return items.map((i) => `${i.s}${i.n}${SUFFIX[i.status]}`).join(",");
}

export function decodeCourses(param: string | null | undefined): MyCourse[] {
  if (!param) return [];
  const out: MyCourse[] = [];
  for (const part of param.split(",")) {
    const m = /^([A-Za-z]{2,5})\s*(\d{3})(~[cp])?$/.exec(part.trim());
    if (!m) continue;
    const item: MyCourse = { s: m[1].toUpperCase(), n: m[2], status: m[3] === "~c" ? "credit" : m[3] === "~p" ? "in_progress" : "done" };
    if (!out.some((o) => o.s === item.s && o.n === item.n)) out.push(item);
  }
  return out;
}

/** Declined AP credit in the link: "MATH220,RHET1--". */
const encodeCodes = (codes: string[]) => codes.map((c) => c.replace(" ", "")).join(",");
function decodeCodes(param: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of (param ?? "").split(",")) {
    const m = /^([A-Za-z]{2,5})\s*(\d{3}|[1-4]--)$/.exec(part.trim());
    const code = m && `${m[1].toUpperCase()} ${m[2]}`;
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}
const cleanYear = (y: unknown) => (typeof y === "string" && /^\d{4}$/.test(y) ? y : "");

export function encodeState(st: MyState): string {
  return JSON.stringify({ c: encodeCourses(st.courses), p: st.program, n: st.minor, x: st.ticked, a: encodeAp(st.ap), y: st.year, d: encodeCodes(st.declined) });
}

export function decodeState(raw: string | null): MyState {
  if (!raw) return EMPTY;
  try {
    const o = JSON.parse(raw) as { c?: string; p?: string; n?: string; x?: unknown; a?: unknown; y?: unknown; d?: unknown };
    return {
      courses: decodeCourses(o.c),
      program: typeof o.p === "string" && SLUG.test(o.p) ? o.p : "",
      minor: typeof o.n === "string" && SLUG.test(o.n) ? o.n : "",
      ticked: Array.isArray(o.x) ? o.x.filter((t): t is string => typeof t === "string" && /^[a-z0-9-]+$/.test(t)) : [],
      ap: decodeAp(typeof o.a === "string" ? o.a : ""),
      year: cleanYear(o.y),
      declined: decodeCodes(typeof o.d === "string" ? o.d : ""),
    };
  } catch {
    return EMPTY;
  }
}

export function readMine(): MyState {
  try {
    return decodeState(window.localStorage.getItem(KEY));
  } catch {
    return EMPTY;
  }
}

export function writeMine(st: MyState): void {
  try {
    window.localStorage.setItem(KEY, encodeState(st));
  } catch {
    /* storage unavailable: the list still lives in the URL */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onMineChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

/**
 * URL params for a shareable checklist: ?p=<major>&mn=<minor>&m=<courses>&x=<ticked groups>&a=<AP scores>
 * &y=<entering year>&d=<declined AP credit>.
 */
export function stateToParams(st: MyState, params: URLSearchParams): void {
  const put = (k: string, v: string) => (v ? params.set(k, v) : params.delete(k));
  put("p", st.program);
  put("mn", st.minor);
  put("m", encodeCourses(st.courses));
  put("x", st.ticked.join(","));
  put("a", encodeAp(st.ap));
  put("y", st.ap.length ? st.year : "");
  put("d", st.ap.length ? encodeCodes(st.declined) : "");
}

const PARAMS = ["m", "p", "mn", "x", "a", "y", "d"];

export function stateFromParams(params: URLSearchParams): MyState | null {
  if (!PARAMS.some((k) => params.has(k))) return null;
  const p = params.get("p") ?? "";
  const mn = params.get("mn") ?? "";
  return {
    courses: decodeCourses(params.get("m")),
    program: SLUG.test(p) ? p : "",
    minor: SLUG.test(mn) ? mn : "",
    ticked: (params.get("x") ?? "").split(",").filter((t) => /^[a-z0-9-]+$/.test(t)),
    ap: decodeAp(params.get("a")),
    year: cleanYear(params.get("y")),
    declined: decodeCodes(params.get("d")),
  };
}

export function sameState(a: MyState, b: MyState): boolean {
  return encodeState(a) === encodeState(b);
}
