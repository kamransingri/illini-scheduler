// "My courses": what a student has finished, has credit for, or is taking. Stored in this browser (localStorage) and
// encodable into the URL like the cart (lib/cart.ts); nothing is sent anywhere or committed.

export type CourseStatus = "done" | "credit" | "in_progress";
export type MyCourse = { s: string; n: string; status: CourseStatus };
export type MyState = { courses: MyCourse[]; program: string; ticked: string[] };

export const STATUS_LABEL: Record<CourseStatus, string> = {
  done: "Completed",
  credit: "AP or transfer credit",
  in_progress: "In progress",
};

const KEY = "illini-scheduler:mycourses:v1";
const EVENT = "illini-mycourses-change";
const SUFFIX: Record<CourseStatus, string> = { done: "", credit: "~c", in_progress: "~p" };

export const EMPTY: MyState = { courses: [], program: "", ticked: [] };

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

export function encodeState(st: MyState): string {
  return JSON.stringify({ c: encodeCourses(st.courses), p: st.program, x: st.ticked });
}

export function decodeState(raw: string | null): MyState {
  if (!raw) return EMPTY;
  try {
    const o = JSON.parse(raw) as { c?: string; p?: string; x?: unknown };
    return {
      courses: decodeCourses(o.c),
      program: typeof o.p === "string" && /^[a-z0-9-]*$/.test(o.p) ? o.p : "",
      ticked: Array.isArray(o.x) ? o.x.filter((t): t is string => typeof t === "string" && /^[a-z0-9-]+$/.test(t)) : [],
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

/** URL params for a shareable checklist: ?p=<program>&m=<courses>&x=<ticked groups>. */
export function stateToParams(st: MyState, params: URLSearchParams): void {
  if (st.program) params.set("p", st.program);
  else params.delete("p");
  if (st.courses.length) params.set("m", encodeCourses(st.courses));
  else params.delete("m");
  if (st.ticked.length) params.set("x", st.ticked.join(","));
  else params.delete("x");
}

export function stateFromParams(params: URLSearchParams): MyState | null {
  if (!params.has("m") && !params.has("p") && !params.has("x")) return null;
  const p = params.get("p") ?? "";
  return {
    courses: decodeCourses(params.get("m")),
    program: /^[a-z0-9-]*$/.test(p) ? p : "",
    ticked: (params.get("x") ?? "").split(",").filter((t) => /^[a-z0-9-]+$/.test(t)),
  };
}

export function sameState(a: MyState, b: MyState): boolean {
  return encodeState(a) === encodeState(b);
}
