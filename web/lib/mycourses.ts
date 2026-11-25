// "My courses": what a student has finished, has credit for, or is taking, plus their AP and IB scores. Stored in this browser
// (localStorage) and encodable into the URL like the cart (lib/cart.ts); nothing is sent anywhere or committed.
import { decodeAp, decodeIb, decodeTest, encodeAp, encodeIb, encodeTest, type ApScore, type IbScore, type TestScore } from "./apcredit";
import { decodePlan, EMPTY_PLAN, encodePlanTerms, type Plan } from "./plan";

export type CourseStatus = "done" | "credit" | "in_progress";
/** `hours` and `ap` are set only on courses worked out from AP or IB scores (lib/apcredit.ts), never on the student's own. */
export type MyCourse = { s: string; n: string; status: CourseStatus; hours?: number; ap?: string };
/**
 * `program` is the major; `minors` are optional (up to MAX_MINORS). `ticked` holds the major's hand-ticked group ids and
 * each minor's as minorTick(minor) + id ("history-minor--language"): group and program ids never contain "--", so none
 * can collide. Lists and links from before #111 held one minor and wrote its ticks as "mn--language"; they're read as
 * the first minor's.
 * `year`: the AP and IB tables' entering year ("2026" = 2026-2027; "" = the newest). `declined`: AP or IB credit switched off.
 * `plan`: the four-year plan (lib/plan.ts); lists and links from before #114 have none.
 */
export type MyState = { courses: MyCourse[]; program: string; minors: string[]; ticked: string[]; ap: ApScore[]; ib: IbScore[]; tests: TestScore[]; tracks: string[]; year: string; declined: string[]; plan: Plan };
export const MAX_MINORS = 3;
/** The prefix of a minor's tick ids. */
export const minorTick = (minor: string) => `${minor}--`;
const OLD_MINOR_TICK = "mn--";

export const STATUS_LABEL: Record<CourseStatus, string> = {
  done: "Completed",
  credit: "AP, IB or transfer credit",
  in_progress: "In progress",
};

const KEY = "illini-scheduler:mycourses:v1";
const EVENT = "illini-mycourses-change";
const SUFFIX: Record<CourseStatus, string> = { done: "", credit: "~c", in_progress: "~p" };

export const EMPTY: MyState = { courses: [], program: "", minors: [], ticked: [], ap: [], ib: [], tests: [], tracks: [], year: "", declined: [], plan: EMPTY_PLAN };
const SLUG = /^[a-z0-9-]*$/;
const TICK = /^[a-z0-9-]+$/;

/** "nutrition-minor,history-minor": program ids, deduplicated, at most MAX_MINORS. */
function decodeMinors(param: unknown): string[] {
  if (typeof param !== "string") return [];
  const out: string[] = [];
  for (const id of param.split(",")) if (id && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && !out.includes(id) && out.length < MAX_MINORS) out.push(id);
  return out;
}

/** Tick ids, with the one-minor format ("mn--x") moved to the first minor, and a minor's ticks kept only while it's picked. */
function decodeTicks(raw: unknown[], minors: string[]): string[] {
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string" || !TICK.test(t)) continue;
    let id = t;
    if (t.startsWith(OLD_MINOR_TICK)) {
      if (!minors.length) continue;
      id = minorTick(minors[0]) + t.slice(OLD_MINOR_TICK.length);
    } else if (t.includes("--") && !minors.some((m) => t.startsWith(minorTick(m)))) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** The tick ids of one program: the major's when `minor` is "", else that minor's (without its prefix). */
export function ticksOf(ticked: string[], minor = ""): string[] {
  if (!minor) return ticked.filter((t) => !t.includes("--"));
  const pre = minorTick(minor);
  return ticked.filter((t) => t.startsWith(pre)).map((t) => t.slice(pre.length));
}

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

/** Declined AP or IB credit in the link: "MATH220,RHET1--". */
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

const TRACK = /^[a-z0-9-]+:[a-z0-9-]+$/;

/** "economics-minor:macroeconomics-track,physics-bs:astrophysics-track": one picked track per program. */
export function decodeTracks(param: string | null | undefined): string[] {
  const out = new Map<string, string>();
  for (const part of (param ?? "").split(",")) if (TRACK.test(part)) out.set(part.split(":")[0], part);
  return [...out.values()];
}

/** The track slug picked for a program, if any. */
export const pickedTrack = (tracks: string[], program: string) => tracks.find((t) => t.startsWith(`${program}:`))?.slice(program.length + 1);

/** Pick a track for a program ("" clears it). */
export const setTrack = (tracks: string[], program: string, slug: string) => [...tracks.filter((t) => !t.startsWith(`${program}:`)), ...(slug ? [`${program}:${slug}`] : [])];

export function encodeState(st: MyState): string {
  return JSON.stringify({
    c: encodeCourses(st.courses),
    p: st.program,
    n: st.minors.join(","),
    x: st.ticked,
    a: encodeAp(st.ap),
    i: encodeIb(st.ib),
    t: encodeTest(st.tests),
    tr: st.tracks.join(","),
    y: st.year,
    d: encodeCodes(st.declined),
    g: st.plan.grad,
    gs: st.plan.summers,
    pl: encodePlanTerms(st.plan),
  });
}

export function decodeState(raw: string | null): MyState {
  if (!raw) return EMPTY;
  try {
    const o = JSON.parse(raw) as { c?: string; p?: string; n?: string; x?: unknown; a?: unknown; i?: unknown; t?: unknown; tr?: unknown; y?: unknown; d?: unknown; g?: unknown; gs?: unknown; pl?: unknown };
    const minors = decodeMinors(o.n);
    return {
      courses: decodeCourses(o.c),
      program: typeof o.p === "string" && SLUG.test(o.p) ? o.p : "",
      minors,
      ticked: Array.isArray(o.x) ? decodeTicks(o.x, minors) : [],
      ap: decodeAp(typeof o.a === "string" ? o.a : ""),
      ib: decodeIb(typeof o.i === "string" ? o.i : ""),
      tests: decodeTest(typeof o.t === "string" ? o.t : ""),
      tracks: decodeTracks(typeof o.tr === "string" ? o.tr : ""),
      year: cleanYear(o.y),
      declined: decodeCodes(typeof o.d === "string" ? o.d : ""),
      plan: decodePlan(o.g, o.gs, o.pl),
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
 * URL params for a shareable checklist: ?p=<major>&mn=<minor>,<minor>&m=<courses>&x=<ticked groups>&a=<AP scores>
 * &i=<IB scores>&t=<ACT and SAT scores>&tr=<program:track picked>&y=<entering year>&d=<declined AP or IB credit>&g=<graduation term>&gs=1 (summers)&pl=<planned terms>.
 */
export function stateToParams(st: MyState, params: URLSearchParams): void {
  const put = (k: string, v: string) => (v ? params.set(k, v) : params.delete(k));
  put("p", st.program);
  put("mn", st.minors.join(","));
  put("m", encodeCourses(st.courses));
  put("x", st.ticked.join(","));
  put("a", encodeAp(st.ap));
  put("i", encodeIb(st.ib));
  put("t", encodeTest(st.tests));
  put("tr", st.tracks.join(","));
  const exams = st.ap.length + st.ib.length + st.tests.length;
  put("y", exams ? st.year : "");
  put("d", exams ? encodeCodes(st.declined) : "");
  put("g", st.plan.grad);
  put("gs", st.plan.summers ? "1" : "");
  put("pl", encodePlanTerms(st.plan));
}

const PARAMS = ["m", "p", "mn", "x", "a", "i", "t", "tr", "y", "d", "g", "pl"];

export function stateFromParams(params: URLSearchParams): MyState | null {
  if (!PARAMS.some((k) => params.has(k))) return null;
  const p = params.get("p") ?? "";
  const minors = decodeMinors(params.get("mn"));
  return {
    courses: decodeCourses(params.get("m")),
    program: SLUG.test(p) ? p : "",
    minors,
    ticked: decodeTicks((params.get("x") ?? "").split(","), minors),
    ap: decodeAp(params.get("a")),
    ib: decodeIb(params.get("i")),
    tests: decodeTest(params.get("t")),
    tracks: decodeTracks(params.get("tr")),
    year: cleanYear(params.get("y")),
    declined: decodeCodes(params.get("d")),
    plan: decodePlan(params.get("g"), params.get("gs"), params.get("pl")),
  };
}

export function sameState(a: MyState, b: MyState): boolean {
  return encodeState(a) === encodeState(b);
}
