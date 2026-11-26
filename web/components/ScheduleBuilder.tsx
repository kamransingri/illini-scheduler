"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { decodeCart, encodeCart, onCartChange, parseAt, readCart, writeCart, type CartItem } from "@/lib/cart";
import { courseHref, dataUrl, daysStr, fmtGpa, fmtTime, seatChangeText, SELF_SERVICE_URL, termLabel } from "@/lib/format";
import { fmtCredits, hourWarnings, totalHours } from "@/lib/credits";
import { examConflicts, examDay, examTime, finalsByDay, finalsOf, finalsPending, finalsSummary, STUDENT_CODE_EXAMS } from "@/lib/finals";
import { backupsFor, type Backup, type SectionBackups } from "@/lib/backups";
import { buildIcs } from "@/lib/ics";
import { eligibility, type AboutYou, type Eligibility, type Level, type Standing } from "@/lib/restrictions";
import { useAboutYou } from "@/lib/useAboutYou";
import { currentStatus, fmtSince, useNow, useSeatFeed } from "@/lib/live";
import { courseInput, profScoresFor, type InputContext } from "@/lib/inputs";
import {
  activePlan,
  createPlan,
  deletePlan,
  icsFileName,
  MAX_NAME,
  MAX_PLANS,
  onPlansChange,
  openLink,
  planDifferences,
  readPlans,
  renamePlan,
  restorePlan,
  switchPlan,
  type Deleted,
  type Plan,
  type Plans,
} from "@/lib/plans";
import { hasPrefParams, loadPrefs, prefsFromParams, prefsToParams, PRESETS, savePrefs, timeRulesSummary } from "@/lib/prefs";
import {
  bundleOpen,
  clashingPairs,
  DEFAULT_PREFS,
  explainEmpty,
  generate,
  locksToBlame,
  LUNCH,
  sectionsToWatch,
  summaryLine,
  warnings,
  type CourseInput,
  type GenerateResult,
  type LockBlame,
  type Prefs,
  type Schedule,
} from "@/lib/schedule";
import type { ScorePriors } from "@/lib/score";
import { breakNames, tabTerms, TERM_DATES } from "@/lib/terms";
import { useWeights } from "@/lib/weights";
import { scheduleSummary } from "@/lib/askai";
import { setBuildings } from "@/lib/walk";
import type { Course, Section } from "@/lib/types";
import AskAi from "./AskAi";
import CopyButton from "./CopyButton";
import GettingThere from "./GettingThere";
import { Badge, SeatStatus } from "./ui/Badge";
import Icon from "./ui/Icon";
import Info from "./ui/Info";
import Toast from "./ui/Toast";
import SearchBox from "./SearchBox";
import WatchButton from "./WatchButton";
import WeekCalendar, { COURSE_COLORS } from "./WeekCalendar";

type MetaLite = {
  next_term: string;
  current_term: string;
  rmpAvailable: boolean;
  rmpPrior?: number | null;
  scorePriors?: ScorePriors | null;
  /** live seat feed (#77) and when each term's section data was read, so only newer live statuses override it */
  liveUrl?: string;
  checkedAt?: Record<string, string>;
};
type W = keyof Prefs["weights"];

const COMPONENT_NAMES: Record<string, string> = { primary: "Lecture", DIS: "Discussion", LAB: "Lab", LBD: "Lab-discussion", Q: "Quiz", OD: "Online discussion", OLB: "Online lab", PR: "Practice" };
const WEEKDAYS: [number, string, string][] = [
  [1, "M", "Monday"],
  [2, "T", "Tuesday"],
  [4, "W", "Wednesday"],
  [8, "R", "Thursday"],
  [16, "F", "Friday"],
];
const LEVEL = ["Off", "Low", "Medium", "High"];
const range = (from: number, to: number, step = 30) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
const START_TIMES = range(420, 720); // 7:00am - 12:00pm
const END_TIMES = range(720, 1320); // 12:00pm - 10:00pm
const SOFT_EARLY = range(480, 720, 60); // 8am - 12pm
const SOFT_LATE = range(900, 1260, 60); // 3pm - 9pm
const LUNCH_FROM = range(600, 810); // 10:00am - 1:30pm
const LUNCH_TO = range(720, 930); // 12:00pm - 3:30pm
const LUNCH_LENGTHS = [30, 45, 60, 75, 90];

const courseCache = new Map<string, Promise<Course>>();
function loadCourse(s: string, n: string): Promise<Course> {
  const k = `${s}/${n}`;
  if (!courseCache.has(k)) {
    const p = fetch(dataUrl(`course/${s}/${n}.json`)).then((r) => {
      if (!r.ok) throw new Error(`${s} ${n}: HTTP ${r.status}`);
      return r.json() as Promise<Course>;
    });
    p.catch(() => courseCache.delete(k));
    courseCache.set(k, p);
  }
  return courseCache.get(k)!;
}

function parseHHMM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function sectionLabel(s: Section): string {
  const t = s.meetings.map((m) => (m.s === null ? "no set time" : `${daysStr(m.d)} ${fmtTime(m.s)}`)).join(", ");
  const st = /closed/i.test(s.status) ? ", closed" : "";
  return `${s.code} ${s.type}, ${t}, CRN ${s.crn}${st}${s.special ? ", special" : ""}`;
}

/** A share link that opened as a new plan (a banner), or as one of yours, or a delete to undo (toasts). */
type Notice = { kind: "created"; name: string; id: string; from: Plan } | { kind: "switched"; name: string } | { kind: "deleted"; deleted: Deleted };

// the shared-link banner and its two buttons (#240)
const BANNER = "rounded bg-panel p-3";
const BTN_MAIN = "rounded bg-action px-3 py-1.5 font-semibold text-white hover:bg-action-dark";
const BTN_SECOND = "rounded border border-action bg-white px-3 py-1.5 font-semibold text-action hover:bg-action-tint";

/** The rules as their share-link parameters ("" for the defaults). */
function prefsParams(p: Prefs): string {
  const u = new URLSearchParams();
  prefsToParams(p, u);
  return u.toString();
}

function fmtHours(min: number): string {
  if (!min) return "none";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

/** The options of a select plus its current value (a shared link can carry a time between the listed steps). */
const withCurrent = (opts: number[], cur: number) => (opts.includes(cur) ? opts : [...opts, cur].sort((a, b) => a - b));

/** A schedule's sections as one string, to find the same schedule again after the list changes. */
const crnKey = (s: Schedule) => s.bundles.flatMap((b) => b.crns).sort().join(",");

const lunchIsDefault = (p: Prefs) => p.lunchFrom === LUNCH.from && p.lunchTo === LUNCH.to && p.lunchMin === LUNCH.min;

/** "Junior, undergraduate, Computer Science, BS" for the collapsed About you panel. */
function aboutSummary(me: AboutYou): string {
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const level = me.level === "undergrad" ? "undergraduate" : me.level;
  return [me.standing ? cap(me.standing) : "", me.standing === "graduate" ? "" : level, me.program?.name ?? ""].filter(Boolean).join(", ");
}

/** Plain-words list of the must-haves that are on, for a collapsed panel. */
function mustSummary(p: Prefs): string[] {
  const out = timeRulesSummary(p);
  if (p.lunch) out.push(lunchIsDefault(p) ? "lunch break" : `${p.lunchMin}-minute lunch ${fmtTime(p.lunchFrom)}–${fmtTime(p.lunchTo)}`);
  if (p.openOnly) out.push("open sections only");
  if (p.noRushedWalks) out.push("no rushed walks");
  if (p.includeSpecial) out.push("special sections allowed");
  if (!p.eligibleOnly) out.push("restricted sections allowed");
  if (p.blocked.length) out.push(`${p.blocked.length} blocked time${p.blocked.length > 1 ? "s" : ""}`);
  return out;
}

/** A titled block of the left column that folds away; the summary says what's inside while it's folded. */
function Panel({ title, summary, open, onToggle, children, testId }: { title: string; summary?: string; open: boolean; onToggle: () => void; children: React.ReactNode; testId?: string }) {
  const id = useId();
  return (
    <section className="border-t-4 border-navy pt-3" data-testid={testId}>
      <h2 className="font-display text-xl font-bold text-heading">
        <button type="button" className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          {title}
          <Icon name="chevronDown" className={`size-5 text-action transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </button>
      </h2>
      {!open && summary && <p className="mt-1 text-sm text-muted">{summary}</p>}
      <div id={id} hidden={!open} className="mt-3 space-y-4">
        {children}
      </div>
    </section>
  );
}

export default function ScheduleBuilder({ meta }: { meta: MetaLite }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [term, setTerm] = useState(meta.next_term);
  const [courses, setCourses] = useState<Record<string, Course>>({});
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [blame, setBlame] = useState<LockBlame | null>(null); // when nothing fits: the locks that rule every schedule out
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false); // after the first run, results follow every change
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  // a link shown without being saved: past MAX_PLANS (`mine` is your list), or your plan's courses with other rules
  const [shared, setShared] = useState<{ mine: CartItem[]; rules?: { plan: string; name: string | null } } | null>(null);
  const [blockForm, setBlockForm] = useState({ days: 0, s: "17:00", e: "19:00" });
  const [icsError, setIcsError] = useState<string | null>(null);
  const [view, setView] = useState<"week" | "finals" | "travel">("week");
  const feed = useSeatFeed(meta.liveUrl);
  const now = useNow();
  const [icsFinals, setIcsFinals] = useState(true);
  const [panels, setPanels] = useState({ must: true, soft: true });
  const [moreOpen, setMoreOpen] = useState(false); // must-haves beyond the first three (#238)
  const [customOpen, setCustomOpen] = useState(false); // the priority sliders behind the presets (#238)
  const { me, about, setAbout: setAboutField } = useAboutYou(); // #80
  const autoRun = useRef<number | null>(null); // schedule index to open once a shared link's courses load
  const keepOpen = useRef<string | null>(null); // after a lock from the results, the CRNs of the schedule to stay on
  const [plans, setPlans] = useState<Plans | null>(null); // named schedules (#117)
  const [notice, setNotice] = useState<Notice | null>(null);
  const [comparing, setComparing] = useState(false);
  const activeId = useRef<string | null>(null);
  const plan = plans ? activePlan(plans) : null;
  activeId.current = plan?.id ?? null;

  // Initial state. A share link never overwrites a saved plan (#117): it's one of your plans, fills an empty one, or
  // opens as a new plan. With your plan's courses but other rules, or past MAX_PLANS, it's shown without being saved
  // and you choose what happens to it (D40.2).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    if (t && /^\d{4}-(sp|su|fa|wi)$/.test(t)) setTerm(t);
    const linkRules = hasPrefParams(params) ? params.toString() : null;
    if (params.has("c")) {
      const fromUrl = decodeCart(params.get("c"));
      const out = openLink(fromUrl, linkRules, params.get("pn"));
      if (out.kind === "full") setShared({ mine: readCart() });
      else if (out.kind === "rules") setShared({ mine: readCart(), rules: { plan: out.plan.name, name: params.get("pn") } });
      else if (out.kind === "created") setNotice({ kind: "created", name: out.plan.name, id: out.plan.id, from: out.from });
      else if (out.kind === "switched") setNotice({ kind: "switched", name: out.plan.name });
      setCart(out.kind === "full" ? fromUrl : readCart());
      // a link with rules, or to one schedule of the list (`i`, as build_schedules in the MCP server gives), opens it
      if (linkRules !== null || params.has("i")) autoRun.current = Math.max(0, Number(params.get("i") ?? 0) || 0);
    } else setCart(readCart());
    if (linkRules !== null) setPrefs(prefsFromParams(params));
    else setPrefs(loadPrefs() ?? DEFAULT_PREFS);
    setPlans(readPlans());
    // On a phone the rules fold away so the results are closer; they stay open on a wide screen.
    if (!window.matchMedia("(min-width: 1024px)").matches) setPanels({ must: false, soft: false });
    setReady(true);
    const offCart = onCartChange(() => {
      setShared((s) => (s?.rules ? s : null)); // the link's rules wait for an answer; a shared list is now yours
      setCart(readCart());
      setPlans(readPlans());
    });
    // another tab switched plans: follow it, so this tab doesn't write one plan's rules into another
    const offPlans = onPlansChange(() => {
      const p = readPlans();
      setPlans(p);
      if (activeId.current && p.active !== activeId.current) {
        setCart(readCart());
        setPrefs(loadPrefs() ?? DEFAULT_PREFS);
        setResult(null);
      }
    });
    return () => {
      offCart();
      offPlans();
    };
  }, []);

  // Keep the URL shareable (courses + term + rules + which schedule + the plan's name) and remember rules locally.
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    url.searchParams.set("t", term);
    if (cart.length) url.searchParams.set("c", encodeCart(cart));
    else url.searchParams.delete("c");
    prefsToParams(prefs, url.searchParams);
    if (result && idx > 0) url.searchParams.set("i", String(idx));
    else url.searchParams.delete("i");
    if (!shared) {
      if (plan && plan.name !== "Plan A") url.searchParams.set("pn", plan.name);
      else url.searchParams.delete("pn");
    }
    window.history.replaceState(null, "", url.toString());
    if (!shared) savePrefs(prefs);
  }, [cart, term, prefs, ready, idx, result, shared, plan]);

  /** After the active plan changed: show its courses and rules, and its schedules when `show` (or results were on). */
  const afterSwitch = (show: boolean) => {
    setShared(null);
    setResult(null);
    setBlame(null);
    setIdx(0);
    keepOpen.current = null;
    lastRun.current = null;
    setCart(readCart());
    setPrefs(loadPrefs() ?? DEFAULT_PREFS);
    setPlans(readPlans());
    autoRun.current = show || auto ? 0 : null;
    if (!show && !auto) setAuto(false);
  };
  const switchTo = (id: string, show = false) => {
    if (id === plan?.id) return;
    setNotice(null);
    switchPlan(id);
    afterSwitch(show);
  };

  // Load course data for the cart.
  useEffect(() => {
    let alive = true;
    Promise.allSettled(cart.map((c) => loadCourse(c.s, c.n))).then((res) => {
      if (!alive) return;
      const next: Record<string, Course> = {};
      const errs: string[] = [];
      res.forEach((r, i) => {
        if (r.status === "fulfilled") next[`${cart[i].s} ${cart[i].n}`] = r.value;
        else errs.push(`${cart[i].s} ${cart[i].n}`);
      });
      setCourses(next);
      setLoadErrors(errs);
    });
    return () => {
      alive = false;
    };
  }, [cart]);

  // Each lecturer's best-pick score for the chosen term, exactly as the course page ranks them (#49).
  const scoreWeights = useWeights();
  const ctx = useMemo<InputContext>(() => ({ rmpPrior: meta.rmpPrior ?? null, priors: meta.scorePriors ?? null, weights: scoreWeights, me }), [meta.rmpPrior, meta.scorePriors, scoreWeights, me]);
  const profRanks = useMemo(() => {
    const out: Record<string, { scores: Record<string, number | null>; best: string | null }> = {};
    for (const [key, course] of Object.entries(courses)) {
      const r = profScoresFor(course, term, ctx.priors, ctx.weights);
      if (r) out[key] = r;
    }
    return out;
  }, [courses, term, ctx]);
  /** Each section's eligibility for this student (#81), by CRN, for the courses in the cart. */
  const elig = useMemo(() => {
    const m = new Map<string, Eligibility>();
    for (const c of Object.values(courses)) for (const x of c.terms[term]?.sections ?? []) m.set(x.crn, eligibility(x.text, x.status, me));
    return m;
  }, [courses, term, me]);
  const inputs: CourseInput[] = useMemo(
    () =>
      cart
        .filter((c) => courses[`${c.s} ${c.n}`])
        .map((c) => {
          const key = `${c.s} ${c.n}`;
          const at = (c.at ?? []).flatMap((v) => parseAt(v) ?? []);
          return { ...courseInput(key, courses[key], c.locked, term, ctx, profRanks[key]?.scores), ...(at.length ? { at } : {}) };
        }),
    [cart, courses, profRanks, term, ctx],
  );
  const loaded = inputs.length + loadErrors.length >= cart.length;

  // Building locations for walking times (#94); every run waits for them, and without them rushed walks fall back
  // to campus areas.
  const buildings = useRef<Promise<void> | null>(null);
  useEffect(() => {
    buildings.current = fetch(dataUrl("buildings.json"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBuildings(d?.buildings))
      .catch(() => setBuildings(null));
  }, []);

  const lastRun = useRef<{ inputs: CourseInput[]; term: string; prefs: Prefs } | null>(null);
  const run = useCallback(
    (openIndex = 0) => {
      lastRun.current = { inputs, term, prefs };
      setBusy(true);
      setAuto(true);
      void (buildings.current ?? Promise.resolve()).then(() => setTimeout(() => {
        const r = generate(inputs, term, prefs);
        setResult(r);
        setBlame(r.schedules.length ? null : locksToBlame(inputs, term, prefs));
        // locking a section of the schedule on screen keeps it on screen: it is still in the (smaller) top list
        const kept = keepOpen.current === null ? -1 : r.schedules.findIndex((x) => crnKey(x) === keepOpen.current);
        keepOpen.current = null;
        setIdx(kept >= 0 ? kept : Math.min(openIndex, Math.max(0, r.schedules.length - 1)));
        setBusy(false);
      }, 10));
    },
    [inputs, term, prefs],
  );

  // Shared link with rules: regenerate the same schedules once every course has loaded.
  useEffect(() => {
    if (autoRun.current === null || !cart.length || !loaded) return;
    const i = autoRun.current;
    autoRun.current = null;
    run(i);
  }, [loaded, cart.length, run]);

  // Once schedules have been generated, they follow every change to the courses, term, rules and priorities.
  useEffect(() => {
    if (!auto || autoRun.current !== null || !loaded) return;
    const last = lastRun.current;
    if (last && last.inputs === inputs && last.term === term && last.prefs === prefs) return; // already shown
    if (!inputs.length) {
      setResult(null);
      return;
    }
    const t = setTimeout(() => run(0), 250);
    return () => clearTimeout(t);
  }, [auto, loaded, inputs, term, prefs, run]);

  const colorOf = useCallback((course: string) => COURSE_COLORS[Math.max(0, cart.findIndex((c) => `${c.s} ${c.n}` === course)) % COURSE_COLORS.length], [cart]);
  const sched = result?.schedules[idx] ?? null;
  const warns = warnings(inputs, term, sched, termLabel(term), (course, s) => {
    const e = elig.get(s.crn);
    if (!e) return undefined;
    if (e.status === "open") return /restricted/i.test(s.status) ? undefined : null;
    if (e.status === "ok") return null;
    const locked = cart.find((c) => `${c.s} ${c.n}` === course)?.locked.includes(s.crn); // itemOf is declared below
    if (e.status === "no") return `${course} ${s.code} (CRN ${s.crn}) ${locked ? "is locked, but its restriction leaves you out" : "is restricted to students you aren't"}: ${e.because.join(" ")}`;
    return `${course} ${s.code} (CRN ${s.crn}) may be restricted: ${e.because.join(" ")}${aboutSummary(me) ? "" : " Fill in About you to check."}`;
  });
  // live seat statuses newer than this term's section data (#77): a section that closes during registration shows
  // as closed and its backup moves up, without regenerating the schedules under the student's feet
  const nEvents = feed.events?.length ?? 0;
  const live = useMemo(() => {
    const since = meta.checkedAt?.[term] ?? "";
    const m = new Map<string, [string, string]>();
    for (const [k, v] of currentStatus(feed.events ?? [], feed.live)) if (k.startsWith(`${term}|`) && v[1] > since) m.set(k.slice(term.length + 1), v);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feed.events is rebuilt every render; its length and live.json decide
  }, [nEvents, feed.live, term, meta.checkedAt]);
  const backups = useMemo(
    () => (sched ? backupsFor(sched, inputs, term, prefs, { statusOf: (crn) => live.get(crn)?.[0] }) : []),
    [sched, inputs, term, prefs, live],
  );
  const justClosed = sched
    ? sched.bundles.flatMap((b) => b.sections.filter((s) => /closed/i.test(live.get(s.crn)?.[0] ?? "") && !/closed/i.test(s.status)).map((s) => ({ course: b.course, s })))
    : [];
  /** Swap a backup in (#76): lock its sections, and stay on the schedule that has it with everything else unchanged. */
  const swapBackup = (course: string, bk: Backup) => {
    const it = itemOf(course);
    if (!it || !sched) return;
    keepOpen.current = crnKey({ ...sched, bundles: sched.bundles.map((b) => (b.course === course ? bk.bundle : b)) });
    updateItem(it.s, it.n, (c) => ({ ...c, locked: bk.bundle.crns }));
  };
  // credit hours (#82): the generated schedule's courses once there is one, else what's in the cart and offered this term
  const offered = inputs.filter((i) => i.course.terms[term]?.sections.length);
  const counted = sched ? offered.filter((i) => sched.bundles.some((b) => b.course === i.key)) : offered;
  const hoursRange = totalHours(counted.map((i) => i.course.credit_range));
  const cartHours = totalHours(offered.map((i) => i.course.credit_range));
  const hourWarns = hourWarnings(
    hoursRange,
    counted.length,
    term,
    termLabel(term),
    counted.filter((i) => i.course.credit_range[0] && i.course.credit_range[0] !== i.course.credit_range[1]).map((i) => i.key),
    !!sched,
  );
  const updateItem = (s: string, n: string, f: (c: CartItem) => CartItem) => writeCart(cart.map((c) => (c.s === s && c.n === n ? f(c) : c)));
  const remove = (s: string, n: string) => writeCart(cart.filter((c) => !(c.s === s && c.n === n)));
  const itemOf = (course: string) => cart.find((c) => `${c.s} ${c.n}` === course);
  const isLockedSec = (course: string, crn: string) => !!itemOf(course)?.locked.includes(crn);
  /** Lock a section of the schedule on screen (#67): every schedule from now on has it. Unlocking frees it again. */
  const toggleLock = (course: string, sec: Section) => {
    const it = itemOf(course);
    if (!it) return;
    const block = courses[course]?.terms[term];
    const sameComponent = (crn: string) => block?.sections.some((x) => x.crn === crn && x.component === sec.component) ?? false;
    if (sched) keepOpen.current = crnKey(sched);
    updateItem(it.s, it.n, (c) => ({ ...c, locked: c.locked.includes(sec.crn) ? c.locked.filter((x) => x !== sec.crn) : [...c.locked.filter((x) => !sameComponent(x)), sec.crn] }));
  };
  /** Lock every section of the schedule on screen (#138), or free every course again. One write, so the URL updates once. */
  const lockAll = (on: boolean) => {
    if (on && sched) keepOpen.current = crnKey(sched);
    writeCart(cart.map((c) => (on ? { ...c, locked: sched?.bundles.find((b) => b.course === `${c.s} ${c.n}`)?.crns ?? c.locked } : { ...c, locked: [], at: [] })));
  };
  const unlockCourse = (course: string) => {
    const it = itemOf(course);
    if (it) updateItem(it.s, it.n, (c) => ({ ...c, locked: [], at: [] }));
  };
  /** A section's first timed meeting as a time lock ("21-660"), when another section of its kind meets then too (#139). */
  const atOf = (course: string, sec: Section): string | null => {
    const m = sec.meetings.find((x) => x.s !== null);
    if (!m) return null;
    const same = courses[course]?.terms[term]?.sections.filter((x) => x.component === sec.component && x.meetings.some((y) => y.d === m.d && y.s === m.s)) ?? [];
    return same.length > 1 ? `${m.d}-${m.s}` : null;
  };
  const hasAt = (course: string, at: string) => !!itemOf(course)?.at?.includes(at);
  /** Keep the course at this time in every schedule, in any section that meets then (#139). */
  const toggleAt = (course: string, at: string) => {
    const it = itemOf(course);
    if (!it) return;
    if (sched) keepOpen.current = crnKey(sched);
    updateItem(it.s, it.n, (c) => ({ ...c, at: c.at?.includes(at) ? c.at.filter((x) => x !== at) : [...(c.at ?? []), at] }));
  };
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  const setW = (k: W, v: number) => setPrefs((p) => ({ ...p, weights: { ...p.weights, [k]: v } }));
  const termOptions = [meta.next_term, meta.current_term].filter((t, i, a) => a.indexOf(t) === i);
  const missing = result ? result.emptyCourses.map((k) => ({ key: k, why: explainEmpty(inputs.find((x) => x.key === k)!, term, prefs) })) : [];
  const clashes = result && !result.schedules.length ? clashingPairs(inputs, term, prefs) : [];
  const lockedCourses = inputs.filter((i) => i.locked.some((crn) => i.course.terms[term]?.sections.some((s) => s.crn === crn))).map((i) => i.key);
  const must = mustSummary(prefs);
  const wKeys = Object.keys(DEFAULT_PREFS.weights) as W[];
  const preset = PRESETS.find((p) => wKeys.every((k) => p.weights[k] === prefs.weights[k]));
  const softChanged = wKeys.some((k) => prefs.weights[k] !== DEFAULT_PREFS.weights[k]) || prefs.softEarly !== DEFAULT_PREFS.softEarly || prefs.softLate !== DEFAULT_PREFS.softLate;
  const mustDefault = must.length === 0;
  // the rules under More options that differ from a fresh visit, so a folded "More options" still says they're on (#238)
  const moreOn = [prefs.lunch, prefs.blocked.length > 0, prefs.openOnly, prefs.noRushedWalks, prefs.includeSpecial, !prefs.eligibleOnly].filter(Boolean).length;

  const weightRow = (k: W, label: React.ReactNode, ariaLabel: string, disabled = false, note?: string) => (
    <div key={k} className={`grid grid-cols-[minmax(0,1fr)_6.5rem_3.75rem] items-center gap-x-2 ${disabled ? "opacity-50" : ""}`}>
      <span>
        {label}
        {note && <span className="block text-sm text-muted">{note}</span>}
      </span>
      <input
        type="range"
        min={0}
        max={3}
        step={1}
        value={disabled ? 0 : prefs.weights[k]}
        disabled={disabled}
        onChange={(e) => setW(k, Number(e.target.value))}
        aria-label={ariaLabel}
        aria-valuetext={LEVEL[prefs.weights[k]]}
        className="w-full accent-action"
      />
      <span className={`text-sm ${prefs.weights[k] ? "font-semibold text-heading" : "text-muted"}`}>{disabled ? "Off" : LEVEL[prefs.weights[k]]}</span>
    </div>
  );
  const timeSelect = (value: number, options: number[], onChange: (v: number) => void, label: string) => (
    <select className="rounded border border-line bg-white px-1 py-0.5 text-sm" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
      {options.map((t) => (
        <option key={t} value={t}>
          {fmtTime(t)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      {plans && plan && (
        <PlanBar
          plans={plans}
          plan={plan}
          comparing={comparing}
          onCompare={() => setComparing((c) => !c)}
          onSwitch={(id) => switchTo(id)}
          onNew={(copy) => {
            setNotice(null);
            // a new plan starts blank: no courses and the default must-haves and priorities; Duplicate copies (D40.3)
            if (createPlan(copy ? { copyOf: plan.id } : {})) afterSwitch(false);
          }}
          onRename={(name) => setPlans(renamePlan(plan.id, name))}
          onDelete={() => {
            const r = deletePlan(plan.id);
            if (!r) return;
            afterSwitch(false);
            setNotice({ kind: "deleted", deleted: r.deleted });
          }}
        />
      )}
      {/* one shared-link banner at a time, with at most two actions; short notices are toasts (#240) */}
      {notice?.kind === "created" ? (
        <div className={BANNER} role="status" data-testid="link-banner" data-kind="created">
          <p>
            You opened a shared schedule, so it&apos;s a new plan, &ldquo;{notice.name}&rdquo;. Your other plans are unchanged.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={BTN_MAIN} onClick={() => switchTo(notice.from.id)}>
              Back to {notice.from.name}
            </button>
            <button
              type="button"
              className={BTN_SECOND}
              onClick={() => {
                deletePlan(notice.id);
                setNotice(null);
                if (readPlans().active !== notice.from.id) switchPlan(notice.from.id);
                afterSwitch(false);
              }}
            >
              Don&apos;t keep it
            </button>
          </div>
        </div>
      ) : shared?.rules && plan ? (
        <div className={BANNER} role="status" data-testid="link-banner" data-kind="rules">
          <p>
            This link has the same courses as your plan &ldquo;{plan.name}&rdquo; with different must-haves or priorities. They&apos;re used below but
            aren&apos;t saved until you choose.
          </p>
          <details className="mt-1 text-sm">
            <summary className="cursor-pointer text-action">How they differ</summary>
            <p className="mt-1">
              The link&apos;s must-haves: {must.join(", ") || "none"}. {plan.name}&apos;s: {mustSummary(loadPrefs() ?? DEFAULT_PREFS).join(", ") || "none"}.
            </p>
          </details>
          <div className="mt-2 flex flex-wrap gap-2">
            {plans && plans.plans.length >= MAX_PLANS ? (
              // no room for another plan: the link's rules can still go into this one
              <button type="button" className={BTN_MAIN} onClick={() => setShared(null)}>
                Use them in {plan.name}
              </button>
            ) : (
              <button
                type="button"
                className={BTN_MAIN}
                onClick={() => {
                  if (createPlan({ name: shared.rules?.name ?? "Shared plan", cart: encodeCart(cart), prefs: prefsParams(prefs) })) afterSwitch(true);
                }}
              >
                Save as a new plan
              </button>
            )}
            <button
              type="button"
              className={BTN_SECOND}
              onClick={() => {
                setPrefs(loadPrefs() ?? DEFAULT_PREFS);
                setShared(null);
              }}
            >
              Keep {plan.name}&apos;s
            </button>
          </div>
        </div>
      ) : shared && !shared.rules ? (
        <div className={BANNER} role="status" data-testid="link-banner" data-kind="full">
          <p>You opened a shared schedule. You already have {MAX_PLANS} plans, the most this browser keeps, so it isn&apos;t saved as a new plan.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={BTN_MAIN}
              onClick={() => {
                writeCart(cart);
                setShared(null);
              }}
            >
              Replace {plan ? `“${plan.name}”` : "my plan"} with it
            </button>
            <button
              type="button"
              className={BTN_SECOND}
              onClick={() => {
                setCart(shared.mine);
                setPrefs(loadPrefs() ?? DEFAULT_PREFS);
                setShared(null);
                setResult(null);
              }}
            >
              Back to my plan
            </button>
          </div>
        </div>
      ) : null}
      {notice?.kind === "switched" && (
        <Toast key={`switched-${notice.name}`} onDone={() => setNotice(null)}>
          This link is your plan &ldquo;{notice.name}&rdquo;, so that plan is open.
        </Toast>
      )}
      {notice?.kind === "deleted" && (
        <Toast key={`deleted-${notice.deleted.plan.id}`} ms={8000} onDone={() => setNotice(null)}>
          <span>Deleted &ldquo;{notice.deleted.plan.name}&rdquo;.</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              if (restorePlan(notice.deleted)) afterSwitch(false);
              setNotice(null);
            }}
          >
            Undo
          </button>
        </Toast>
      )}
      {comparing && plans && plans.plans.length > 1 && (
        <PlanCompare
          term={term}
          ctx={ctx}
          activeId={plans.active}
          live={{ cart: encodeCart(cart), prefs: prefsParams(prefs), names: plans.plans.map((p) => `${p.id}:${p.name}`).join() }}
          onPick={(id) => {
            setComparing(false);
            if (id === plan?.id) {
              if (!result && inputs.length) run(0);
            } else switchTo(id, true);
          }}
          onClose={() => setComparing(false)}
        />
      )}
      <div className="grid gap-8 lg:grid-cols-[23rem_minmax(0,1fr)]">
        {/* ---------------- left: courses, must-haves, priorities ---------------- */}
        <div className="space-y-8">
          <section aria-labelledby="cart-h" className="space-y-3 border-t-4 border-navy pt-3">
            <div className="flex items-center justify-between gap-2">
              <h2 id="cart-h" className="font-display text-xl font-bold text-heading">
                Your courses
              </h2>
              <select className="min-w-0 max-w-[11rem] rounded border border-line bg-white px-2 py-1.5" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Term">
                {termOptions.map((t) => (
                  <option key={t} value={t}>
                    {termLabel(t)}
                  </option>
                ))}
                {tabTerms(meta.current_term)
                  .filter((t) => !termOptions.includes(t))
                  .map((t) => (
                    <option key={t} value={t} disabled>
                      {termLabel(t)} (not out yet)
                    </option>
                  ))}
              </select>
            </div>
            <SearchBox
              nextTerm={meta.next_term}
              withCart
              placeholder="Add a course or CRN: cs124, 31152…"
              onPick={(s, n, crn) =>
                writeCart(cart.some((c) => c.s === s && c.n === n) ? cart.map((c) => (crn && c.s === s && c.n === n ? { ...c, locked: [crn] } : c)) : [...cart, { s, n, locked: crn ? [crn] : [] }])
              }
            />
            {ready && !cart.length && <p className="text-muted">Your cart is empty. Search above (a CRN adds that exact section), or add courses from a course page or the gen-ed finder.</p>}
            {loadErrors.length > 0 && (
              <p className="flex items-start gap-2" role="alert">
                <Icon name="alert" className="mt-1" />
                Couldn&apos;t load {loadErrors.join(", ")}.
              </p>
            )}
            <ul className="border-t border-line" data-testid="cart">
              {cart.map((c) => {
                const key = `${c.s} ${c.n}`;
                const course = courses[key];
                const block = course?.terms[term];
                const comps = block ? [...new Set(block.sections.map((s) => s.component))].sort((a, b) => (a === "primary" ? -1 : b === "primary" ? 1 : a.localeCompare(b))) : [];
                const prim = block?.sections.filter((s) => s.component === "primary") ?? [];
                const openPrim = prim.filter((s) => !/closed/i.test(s.status)).length;
                const lockedCodes = block ? block.sections.filter((s) => c.locked.includes(s.crn)).map((s) => s.code) : [];
                return (
                  <li key={key} className={`course-swatch border-b border-l-4 border-b-line py-3 pl-3 ${colorOf(key)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={courseHref(c.s, c.n)} className="font-semibold text-action hover:underline">
                          {key}
                        </Link>{" "}
                        <span>{course?.title ?? "…"}</span>
                        {course && (
                          <span className="block text-sm text-muted">
                            {course.credits.replace(" hours.", "")} credit hours
                            {block?.status_known && prim.length > 0 ? `, ${openPrim} of ${prim.length} lectures open` : ""}
                          </span>
                        )}
                        {course && block && prim.length > 0 && prim.every((x) => elig.get(x.crn)?.status === "no") && (
                          <span className="mt-0.5 flex items-start gap-1 text-sm font-semibold" data-testid="cart-restricted">
                            <Icon name="alert" className="mt-1 shrink-0" />
                            <span>
                              Every lecture is restricted to students you aren&apos;t: {elig.get(prim[0].crn)!.because[0]}
                            </span>
                          </span>
                        )}
                        {course && (!block || !block.sections.length) && (
                          <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold">
                            <Icon name="alert" />
                            Not offered in {termLabel(term)}
                          </span>
                        )}
                      </div>
                      <button
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted hover:bg-panel hover:text-action"
                        onClick={() => remove(c.s, c.n)}
                        aria-label={`Remove ${key}`}
                        title="Remove"
                      >
                        <Icon name="x" />
                      </button>
                    </div>
                    {block && block.sections.length > 0 && (
                      <>
                        {lockedCodes.length > 0 && (
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm" data-testid="cart-locked">
                            <span>
                              <Icon name="lock" className="mr-1 align-[-2px] text-heading" />
                              <span className="font-semibold text-heading">Locked:</span> {lockedCodes.join(", ")}
                            </span>
                            <button
                              type="button"
                              className="font-semibold text-action hover:underline"
                              onClick={() => updateItem(c.s, c.n, (it) => ({ ...it, locked: [] }))}
                              aria-label={`Unlock every section of ${key}`}
                            >
                              Unlock
                            </button>
                          </p>
                        )}
                        <details className="group mt-1" data-testid="pick-sections">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-action hover:underline [&::-webkit-details-marker]:hidden">
                            {lockedCodes.length ? "Change sections" : "Pick sections"}
                            <Icon name="chevronDown" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                          </summary>
                          <div className="mt-2 space-y-1.5">
                            {comps.map((comp) => {
                          // once a lecture is locked, only offer sections from its link group
                          const lockedPrimary = block.sections.find((s) => s.component === "primary" && c.locked.includes(s.crn));
                          const opts = block.sections.filter(
                            (s) => s.component === comp && (comp === "primary" || !lockedPrimary || lockedPrimary.group === "*" || s.group === lockedPrimary.group),
                          );
                          const current = opts.find((s) => c.locked.includes(s.crn))?.crn ?? "";
                          const label = `${COMPONENT_NAMES[comp] ?? comp} for ${key}`;
                          return (
                            <select
                              key={comp}
                              className={`w-full rounded border bg-white px-2 py-1 text-sm ${current ? "border-action font-semibold" : "border-line"}`}
                              value={current}
                              aria-label={`Lock ${label}`}
                              onChange={(e) =>
                                updateItem(c.s, c.n, (it) => ({
                                  ...it,
                                  locked: [...it.locked.filter((x) => !opts.some((o) => o.crn === x)), ...(e.target.value ? [e.target.value] : [])],
                                }))
                              }
                            >
                              <option value="">{COMPONENT_NAMES[comp] ?? comp}: any section</option>
                              {opts.map((s) => (
                                <option key={s.crn} value={s.crn}>
                                  {sectionLabel(s)}
                                </option>
                              ))}
                            </select>
                          );
                        })}
                          </div>
                        </details>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {offered.length > 0 && (
              <p className="mt-2 text-sm text-muted" data-testid="cart-hours">
                Total: <span className="font-semibold text-heading tnum">{fmtCredits(cartHours)}</span> credit hours in {termLabel(term)}
              </p>
            )}
          </section>

          <Panel title="Must-haves" summary={mustDefault ? "None set: any time, any day." : must.join(", ")} open={panels.must} onToggle={() => setPanels((p) => ({ ...p, must: !p.must }))} testId="must-haves">
            <p className="text-sm text-muted">A schedule that breaks one of these is never shown.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-heading">No classes before</span>
                <select
                  className="mt-1 block w-full rounded border border-line bg-white px-2 py-1.5"
                  value={prefs.earliest ?? ""}
                  onChange={(e) => set("earliest", e.target.value ? Number(e.target.value) : null)}
                  aria-label="No classes before"
                >
                  <option value="">Any time</option>
                  {START_TIMES.map((t) => (
                    <option key={t} value={t}>
                      {fmtTime(t)}
                      {t === 540 ? " (no 8am)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-heading">Done by</span>
                <select
                  className="mt-1 block w-full rounded border border-line bg-white px-2 py-1.5"
                  value={prefs.latest ?? ""}
                  onChange={(e) => set("latest", e.target.value ? Number(e.target.value) : null)}
                  aria-label="No classes after"
                >
                  <option value="">Any time</option>
                  {END_TIMES.map((t) => (
                    <option key={t} value={t}>
                      {fmtTime(t)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold text-heading">Days off</legend>
              <div className="mt-1 flex gap-1">
                {WEEKDAYS.map(([bit, l, name]) => {
                  const on = !!(prefs.daysOff & bit);
                  return (
                    <label
                      key={l}
                      title={`Keep ${name} free`}
                      className={`inline-flex h-9 min-w-11 cursor-pointer items-center justify-center rounded border px-2 font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-action ${on ? "border-action bg-action text-white" : "border-line bg-white hover:border-action"}`}
                    >
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => set("daysOff", prefs.daysOff ^ bit)} aria-label={`Keep ${name} free`} />
                      {name.slice(0, 3)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <button
              type="button"
              className="flex min-h-11 w-fit items-center gap-1.5 font-semibold text-action hover:underline"
              aria-expanded={moreOpen}
              aria-controls="more-options"
              onClick={() => setMoreOpen((v) => !v)}
              data-testid="more-options-toggle"
            >
              More options
              {moreOn > 0 && <span className="rounded-full bg-action-tint px-2 text-sm leading-6 text-heading tnum">{moreOn} on</span>}
              <Icon name="chevronDown" className={`transition-transform motion-reduce:transition-none ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            <div id="more-options" hidden={!moreOpen} className="space-y-4" data-testid="more-options">
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <input id="lunch-on" type="checkbox" className="mt-1 size-4 accent-action" checked={prefs.lunch} onChange={(e) => set("lunch", e.target.checked)} />
                <div>
                  <label htmlFor="lunch-on">Keep a lunch break</label>
                  {prefs.lunch ? (
                    // only combinations that can hold the break are offered, so the window is never shorter than the break
                    <span className="flex flex-wrap items-center gap-1 text-sm text-muted" role="group" aria-label="Lunch break">
                      At least
                      <select className="rounded border border-line bg-white px-1 py-0.5 text-sm" value={prefs.lunchMin} onChange={(e) => set("lunchMin", Number(e.target.value))} aria-label="Lunch break length">
                        {withCurrent(LUNCH_LENGTHS.filter((m) => m <= prefs.lunchTo - prefs.lunchFrom), prefs.lunchMin).map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                      free between
                      {timeSelect(prefs.lunchFrom, withCurrent(LUNCH_FROM.filter((t) => t <= prefs.lunchTo - prefs.lunchMin), prefs.lunchFrom), (v) => set("lunchFrom", v), "Lunch window starts")}
                      and
                      {timeSelect(prefs.lunchTo, withCurrent(LUNCH_TO.filter((t) => t >= prefs.lunchFrom + prefs.lunchMin), prefs.lunchTo), (v) => set("lunchTo", v), "Lunch window ends")}
                      on every day with class
                    </span>
                  ) : (
                    <span className="block text-sm text-muted">
                      At least {prefs.lunchMin} minutes free between {fmtTime(prefs.lunchFrom)} and {fmtTime(prefs.lunchTo)} on every day with class
                    </span>
                  )}
                </div>
              </div>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 size-4 accent-action" checked={prefs.openOnly} onChange={(e) => set("openOnly", e.target.checked)} />
                <span>
                  Open sections only
                  <span className="block text-sm text-muted">Skip sections that were Closed at the last check (sections you lock are kept)</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 size-4 accent-action" checked={prefs.noRushedWalks} onChange={(e) => set("noRushedWalks", e.target.checked)} />
                <span>
                  No rushed walks between classes
                  <span className="block text-sm text-muted">Skip schedules where the walk to your next class is longer than the time between them</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 size-4 accent-action" checked={prefs.eligibleOnly} onChange={(e) => set("eligibleOnly", e.target.checked)} />
                <span>
                  Only sections I can register for
                  <span className="block text-sm text-muted">
                    Skip sections whose restrictions clearly leave you out, going by About you below (sections you lock are kept). Unclear ones stay and are marked.
                  </span>
                </span>
              </label>
              <div className="ml-6 space-y-2 rounded bg-panel p-3" role="group" aria-label="About you" data-testid="about-you">
                <p className="font-semibold text-heading">
                  About you
                  <Info label="Why About you is asked">
                    Used to check each section&apos;s restrictions (&ldquo;Restricted to Junior or Senior class standing&rdquo;, &ldquo;Restricted to CS majors&rdquo;). Kept
                    in this browser only, and not put in share links.
                  </Info>
                </p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-sm font-semibold text-heading">You are</span>
                      <select className="mt-1 block w-full rounded border border-line bg-white px-2 py-1.5" value={about.level} onChange={(e) => setAboutField("level", e.target.value as Level | "")} aria-label="Student level">
                        <option value="">Not set</option>
                        <option value="undergrad">An undergraduate</option>
                        <option value="graduate">A graduate student</option>
                        <option value="professional">In a professional program</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-heading">Class standing in {termLabel(term)}</span>
                      <select className="mt-1 block w-full rounded border border-line bg-white px-2 py-1.5" value={about.standing} onChange={(e) => setAboutField("standing", e.target.value as Standing | "")} aria-label="Class standing">
                        <option value="">Not set</option>
                        <option value="freshman">Freshman</option>
                        <option value="sophomore">Sophomore</option>
                        <option value="junior">Junior</option>
                        <option value="senior">Senior</option>
                        <option value="graduate">Graduate</option>
                      </select>
                    </label>
                  </div>
                  <p className="text-sm" data-testid="about-major">
                    <span className="font-semibold text-heading">Major:</span> {me.program ? `${me.program.name} (${me.program.college})` : "not picked"}
                    {me.minors.length > 0 && (
                      <>
                        {"; "}
                        <span className="font-semibold text-heading">{me.minors.length === 1 ? "minor" : "minors"}:</span> {me.minors.map((m) => m.name).join(", ")}
                      </>
                    )}
                    .{" "}
                    <Link href="/degree/" className="text-action underline">
                      {me.program ? "Change it in the degree checklist" : "Pick it in the degree checklist"}
                    </Link>
                  </p>
              </div>
              <div className="flex items-start gap-1">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1 size-4 accent-action" checked={prefs.includeSpecial} onChange={(e) => set("includeSpecial", e.target.checked)} />
                  <span>Include special sections</span>
                </label>
                <Info label="What special sections are">
                  Sections with odd codes like &ldquo;AD@&rdquo;, lectures without the discussion every other lecture has, or notes saying they are reserved for a
                  group. They are often restricted to a program, so they are skipped unless you include them or lock one.
                </Info>
              </div>
            </div>
            <div className="rounded bg-panel p-3" role="group" aria-labelledby="blocked-h">
              <p id="blocked-h" className="font-semibold text-heading">
                Blocked times
              </p>
              <p className="text-sm text-muted">Work, practice, anything that can&apos;t move.</p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {WEEKDAYS.map(([bit, l, name]) => (
                  <label
                    key={l}
                    title={name}
                    className={`inline-flex size-8 cursor-pointer items-center justify-center rounded border font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-action ${blockForm.days & bit ? "border-action bg-action text-white" : "border-line bg-white"}`}
                  >
                    <input type="checkbox" className="sr-only" checked={!!(blockForm.days & bit)} onChange={() => setBlockForm((f) => ({ ...f, days: f.days ^ bit }))} aria-label={`Block ${name}`} />
                    {l}
                  </label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <input type="time" className="rounded border border-line bg-white px-1 py-1 text-sm" value={blockForm.s} onChange={(e) => setBlockForm((f) => ({ ...f, s: e.target.value }))} aria-label="Blocked from" />
                <span>to</span>
                <input type="time" className="rounded border border-line bg-white px-1 py-1 text-sm" value={blockForm.e} onChange={(e) => setBlockForm((f) => ({ ...f, e: e.target.value }))} aria-label="Blocked until" />
                <button
                  type="button"
                  className="rounded border border-action bg-white px-2.5 py-1 text-sm font-semibold text-action hover:bg-action-tint disabled:border-line disabled:text-muted"
                  disabled={!blockForm.days || (parseHHMM(blockForm.s) ?? 0) >= (parseHHMM(blockForm.e) ?? 0)}
                  onClick={() => {
                    setPrefs((p) => ({ ...p, blocked: [...p.blocked, { d: blockForm.days, s: parseHHMM(blockForm.s)!, e: parseHHMM(blockForm.e)! }] }));
                    setBlockForm((f) => ({ ...f, days: 0 }));
                  }}
                >
                  Add
                </button>
              </div>
              {prefs.blocked.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {prefs.blocked.map((b, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 border-t border-line pt-1">
                      <span className="tnum">
                        {daysStr(b.d)} {fmtTime(b.s)}–{fmtTime(b.e)}
                      </span>
                      <button className="font-semibold text-action underline" onClick={() => setPrefs((p) => ({ ...p, blocked: p.blocked.filter((_, j) => j !== i) }))}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </div>
            {!mustDefault && (
              <button
                type="button"
                className="font-semibold text-action hover:underline"
                onClick={() => setPrefs((p) => ({ ...p, earliest: null, latest: null, daysOff: 0, lunch: false, openOnly: false, noRushedWalks: false, includeSpecial: false, blocked: [] }))}
              >
                Clear must-haves
              </button>
            )}
          </Panel>

          <Panel
            title="What matters to you"
            summary={preset ? `${preset.label}${prefs.softEarly !== DEFAULT_PREFS.softEarly || prefs.softLate !== DEFAULT_PREFS.softLate ? ", custom times" : ""}` : "Custom priorities"}
            open={panels.soft}
            onToggle={() => setPanels((p) => ({ ...p, soft: !p.soft }))}
            testId="priorities"
          >
            <p className="text-sm text-muted">Schedules are ranked by these. Off ignores one; High counts it three times as much as Low.</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Starting points">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={preset?.id === p.id}
                  onClick={() => setPrefs((x) => ({ ...x, weights: { ...p.weights } }))}
                  className={`rounded border px-2 text-sm leading-7 font-semibold ${preset?.id === p.id ? "border-action bg-action-tint text-heading" : "border-line bg-white text-action hover:border-action"}`}
                >
                  {p.label}
                </button>
              ))}
              {!preset && (
                <span className="rounded border border-action bg-action-tint px-2 text-sm leading-7 font-semibold text-heading" data-testid="preset-custom">
                  Custom
                </span>
              )}
            </div>
            <button
              type="button"
              className="flex min-h-11 w-fit items-center gap-1.5 font-semibold text-action hover:underline"
              aria-expanded={customOpen}
              aria-controls="priority-sliders"
              onClick={() => setCustomOpen((v) => !v)}
            >
              Customize
              <Icon name="chevronDown" className={`transition-transform motion-reduce:transition-none ${customOpen ? "rotate-180" : ""}`} />
            </button>
            <div id="priority-sliders" hidden={!customOpen} className="space-y-4">
            <div className="space-y-2.5" role="group" aria-label="Priorities">
              {weightRow("gpa", "Higher expected GPA", "Higher expected GPA")}
              {weightRow(
                "prof",
                <span className="inline-flex items-center">
                  Best professor
                  <Info label="About Best professor">
                    Prefers each course&apos;s lecture taught by the professor with the highest best-pick score, the same score and order as the
                    course page (course GPA, the professor&apos;s GPA difference, RMP and open seats, small samples pulled toward an average). A
                    lecture with no scored professor counts as average.
                  </Info>
                </span>,
                "Best professor",
                !meta.scorePriors,
                !meta.scorePriors ? "No scores in this build" : undefined,
              )}
              {weightRow("rmp", "Better-rated professors", "Better-rated professors", !meta.rmpAvailable, !meta.rmpAvailable ? "RMP unavailable in this build" : undefined)}
              {weightRow("open", "Sections open right now", "Sections open right now")}
              {weightRow("daysOff", "More days off", "More days off")}
              {weightRow("compact", "Fewer gaps between classes", "Fewer gaps between classes")}
              {weightRow(
                "early",
                <span className="inline-flex flex-wrap items-center gap-1">
                  Avoid classes before {timeSelect(prefs.softEarly, SOFT_EARLY, (v) => set("softEarly", v), "Too early means before")}
                </span>,
                "Avoid early classes",
              )}
              {weightRow(
                "late",
                <span className="inline-flex flex-wrap items-center gap-1">
                  Avoid classes after {timeSelect(prefs.softLate, SOFT_LATE, (v) => set("softLate", v), "Too late means after")}
                </span>,
                "Avoid late classes",
              )}
              {weightRow("walking", "Avoid rushed walks across campus", "Avoid rushed walks across campus")}
            </div>
            {softChanged && (
              <button
                type="button"
                className="font-semibold text-action hover:underline"
                onClick={() => setPrefs((p) => ({ ...p, weights: { ...DEFAULT_PREFS.weights }, softEarly: DEFAULT_PREFS.softEarly, softLate: DEFAULT_PREFS.softLate }))}
              >
                Reset to balanced
              </button>
            )}
            </div>
          </Panel>
        </div>

        {/* ---------------- right: results ---------------- */}
        <section aria-labelledby="results-h" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-4 border-navy pt-3">
            <h2 id="results-h" className="font-display text-xl font-bold text-heading">
              Schedules for {termLabel(term)}
            </h2>
            <span className="flex items-center gap-3">
              {auto && (
                <span className="text-sm text-muted" aria-live="polite">
                  {busy ? "Updating…" : "Updates as you change things"}
                </span>
              )}
              <button type="button" onClick={() => run(0)} disabled={!inputs.length || busy} className="inline-flex items-center gap-1.5 rounded bg-action px-4 py-2 font-semibold text-white hover:bg-action-dark disabled:opacity-50">
                <Icon name={auto ? "refresh" : "calendar"} />
                {busy && !auto ? "Generating…" : "Generate schedules"}
              </button>
            </span>
          </div>
          {warns.length + hourWarns.length > 0 && (
            <ul className="space-y-1 rounded bg-panel p-3" data-testid="warnings">
              {hourWarns.map((w) => (
                <li key={w.kind} className="flex items-start gap-2" data-testid="hour-warning" data-kind={w.kind}>
                  <Icon name="alert" className="mt-1 shrink-0 text-heading" />
                  <span>
                    {w.text}{" "}
                    <a href={w.href} target="_blank" rel="noreferrer" className="text-action underline">
                      Registrar&apos;s limits
                    </a>
                  </span>
                </li>
              ))}
              {warns.map((w) => (
                <li key={w} className="flex items-start gap-2">
                  <Icon name="alert" className="mt-1 text-heading" />
                  {w}
                </li>
              ))}
            </ul>
          )}
          {!result && (
            <div className="rounded border border-dashed border-line p-6 text-center">
              <Icon name="calendar" className="size-6 text-muted" />
              <p className="mt-2 font-semibold text-heading">{inputs.length ? "Ready when you are" : "Add courses to get started"}</p>
              <p className="mt-1 text-muted">
                {inputs.length
                  ? `${inputs.length} course${inputs.length > 1 ? "s" : ""} loaded. Set your must-haves and priorities, then press “Generate schedules”.`
                  : "Search on the left for a course code, title, professor or CRN."}
              </p>
            </div>
          )}
          {missing.length > 0 && (
            <div className="rounded border-l-4 border-heading bg-panel p-3" role="alert" data-testid="missing">
              {missing.map((m) => (
                <p key={m.key}>
                  <strong>{m.key} can&apos;t be scheduled:</strong> {m.why}.
                </p>
              ))}
              {result && result.schedules.length > 0 && <p className="mt-1">The schedules below are incomplete: they leave {missing.length > 1 ? "these courses" : "it"} out.</p>}
            </div>
          )}
          {result && !result.schedules.length && (
            <div className="rounded border-l-4 border-heading bg-panel p-3" role="alert" data-testid="no-schedule">
              <p className="font-semibold">No conflict-free schedule exists for these courses and must-haves.</p>
              {clashes.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {clashes.map((c) => (
                    <li key={c.text}>
                      {c.text}. {c.locked ? "Unlock a section, drop one of the courses or pick another." : "Drop one of them or pick another course."}
                    </li>
                  ))}
                </ul>
              )}
              {blame && (blame.each.length > 0 || blame.all) ? (
                <div className="mt-2" data-testid="lock-blame">
                  <p>
                    {blame.each.length === 1
                      ? `Your locked ${blame.each[0]} section is what rules every schedule out: unlock it and schedules fit again.`
                      : blame.each.length > 1
                        ? `Your locked sections are what rule every schedule out: unlocking ${blame.each.length === 2 ? `either ${blame.each.join(" or ")}` : `any one of ${blame.each.slice(0, -1).join(", ")} or ${blame.each.at(-1)}`} lets schedules fit again.`
                        : "Your locked sections together rule every schedule out: no single unlock is enough, but unlocking all of them lets schedules fit again."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(blame.each.length ? blame.each : lockedCourses).map((k) => (
                      <button key={k} type="button" className="inline-flex items-center gap-1.5 rounded border border-action bg-white px-2.5 py-1 text-sm font-semibold text-action hover:bg-action-tint" onClick={() => unlockCourse(k)}>
                        <Icon name="unlock" />
                        Unlock {k}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                clashes.length === 0 && (
                  <p className="mt-1">
                    Every pair of courses can fit, but not all of them at once{prefs.lunch ? " with a lunch break" : ""}.{" "}
                    {lockedCourses.length ? "Unlocking sections wouldn't help on its own: try removing a must-have or a course." : "Try removing a must-have or a course."}
                  </p>
                )
              )}
            </div>
          )}
          {sched && result && (
            <div className="space-y-4" data-testid="schedule-result">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="inline-flex size-9 items-center justify-center rounded border border-action text-action hover:bg-action-tint disabled:border-line disabled:text-muted"
                  onClick={() => setIdx((i) => i - 1)}
                  disabled={idx === 0}
                  aria-label="Previous schedule"
                >
                  <Icon name="chevronRight" className="rotate-180" />
                </button>
                <span className="font-semibold tnum" aria-live="polite">
                  Schedule {idx + 1} of {result.schedules.length}
                </span>
                <button
                  className="inline-flex size-9 items-center justify-center rounded border border-action text-action hover:bg-action-tint disabled:border-line disabled:text-muted"
                  onClick={() => setIdx((i) => i + 1)}
                  disabled={idx >= result.schedules.length - 1}
                  aria-label="Next schedule"
                >
                  <Icon name="chevronRight" />
                </button>
                <span className="text-sm text-muted">
                  {result.schedules.length === 50 ? "top 50 shown, " : ""}ranked from {result.total.toLocaleString()} conflict-free combinations
                  {result.truncated ? " (search stopped early to stay fast)" : ""}
                </span>
              </div>
              <p className="text-lg font-semibold text-heading" data-testid="summary">
                {summaryLine(sched.stats, (m) => fmtTime(m))}
                {missing.length > 0 && <span> (without {missing.map((m) => m.key).join(", ")})</span>}
              </p>
              {sched.stats.walks.length > 0 && (
                <ul className="space-y-0.5 text-sm" data-testid="rushed-walks" aria-label="Rushed walks">
                  {sched.stats.walks.map((w, k) => (
                    <li key={k}>
                      <span className="font-semibold text-heading">{w.day}:</span> {w.fromCourse} in {w.from} to {w.toCourse} in {w.to},{" "}
                      {w.walk === null ? `another part of campus with ${w.gap} min between` : `${w.walk} min walk, ${w.gap} min gap`}
                    </li>
                  ))}
                </ul>
              )}
              <dl className="grid grid-cols-2 gap-y-3 border-y border-line py-3 sm:grid-cols-3 xl:grid-cols-6 xl:divide-x xl:divide-line" data-testid="schedule-stats">
                {(
                  [
                    ["Expected GPA", sched.stats.expectedGpa === null ? "–" : fmtGpa(sched.stats.expectedGpa)],
                    ["Credit hours", fmtCredits(hoursRange)],
                    ["Days off", sched.stats.daysOff.length ? sched.stats.daysOff.join(", ") : "none"],
                    ["Day span", sched.stats.earliest === null ? "–" : `${fmtTime(sched.stats.earliest)}–${fmtTime(sched.stats.latest)}`.replace(/:00/g, "")],
                    ["Gaps a week", fmtHours(sched.stats.gapMinutes)],
                    ["Open now", `${sched.bundles.filter((b) => bundleOpen(b)).length} of ${sched.bundles.length}`],
                  ] as [string, string][]
                ).map(([l, v]) => (
                  <div key={l} className="flex flex-col xl:px-3 xl:first:pl-0">
                    <dt className="text-sm text-muted">{l}</dt>
                    <dd className="order-first font-semibold text-heading tnum">{v}</dd>
                  </div>
                ))}
              </dl>
              <div role="tablist" aria-label="Calendar view" className="flex gap-1 border-b border-line">
                {(
                  [
                    ["week", "Week", "calendar"],
                    ["finals", "Finals week", "clock"],
                    ["travel", "Getting there", "bus"],
                  ] as const
                ).map(([v, label, icon]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 font-semibold ${view === v ? "border-action text-action" : "border-transparent text-muted hover:text-action"}`}
                  >
                    <Icon name={icon} />
                    {label}
                    {v === "finals" && examConflicts(sched).some((c) => c.kind !== "exactly-24h") && <Icon name="alert" className="text-heading" />}
                  </button>
                ))}
              </div>
              {view === "week" ? (
                <WeekCalendar schedule={sched} colorOf={colorOf} blocked={prefs.blocked} daysOff={prefs.daysOff} isLocked={isLockedSec} onToggleLock={toggleLock} />
              ) : view === "finals" ? (
                <FinalsWeek schedule={sched} colorOf={colorOf} termName={termLabel(term)} />
              ) : (
                <GettingThere schedule={sched} termName={termLabel(term)} />
              )}
              {justClosed.length > 0 && (
                <ul className="space-y-1 rounded border-2 border-heading p-3" data-testid="just-closed" role="status">
                  {justClosed.map(({ course, s }) => {
                    const bk = backups.find((x) => x.section.crn === s.crn)?.backups[0];
                    return (
                      <li key={s.crn} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Icon name="alert" className="text-heading" />
                        <strong>
                          {course} {s.code} {seatChangeText(s.status, live.get(s.crn)![0])}
                        </strong>
                        <span className="text-sm text-muted">(checked {fmtSince(live.get(s.crn)![1], now)})</span>
                        {bk ? (
                          <>
                            <span>
                              Backup: {bk.changed.map((x) => x.code).join(" + ")}, CRN {bk.changed.map((x) => x.crn).join(", ")}
                            </span>
                            <button type="button" className="font-semibold text-action underline" onClick={() => swapBackup(course, bk)}>
                              Use the backup
                            </button>
                          </>
                        ) : (
                          <span>{backups.find((x) => x.section.crn === s.crn)?.none ?? "No backup fits."}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <ul className="border-t border-line" data-testid="schedule-sections">
                {sched.bundles.flatMap((b) =>
                  b.sections.map((s) => (
                    <li key={s.crn} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2" data-start={Math.min(...s.meetings.map((m) => m.s ?? 9999))}>
                      <span className={`course-swatch inline-block size-3 rounded-sm border-l-[12px] ${colorOf(b.course)}`} aria-hidden />
                      <span className="w-24 font-semibold">{b.course}</span>
                      <span className="w-24">
                        {s.code} {s.type}
                      </span>
                      <CopyButton text={s.crn} />
                      <button
                        type="button"
                        aria-pressed={isLockedSec(b.course, s.crn)}
                        aria-label={`Lock ${b.course} ${s.code}`}
                        title={isLockedSec(b.course, s.crn) ? "Locked: every schedule keeps this section. Press again to unlock it." : "Keep this section in every schedule and build the others around it"}
                        onClick={() => toggleLock(b.course, s)}
                        className={`inline-flex items-center gap-1 rounded border px-2 text-sm leading-7 font-semibold ${isLockedSec(b.course, s.crn) ? "border-action bg-action text-white" : "border-line bg-white text-action hover:border-action"}`}
                      >
                        <Icon name={isLockedSec(b.course, s.crn) ? "lock" : "unlock"} />
                        Lock
                      </button>
                      {(() => {
                        const at = atOf(b.course, s);
                        if (!at) return null;
                        const t = parseAt(at)!;
                        const on = hasAt(b.course, at);
                        return (
                          <button
                            type="button"
                            aria-pressed={on}
                            aria-label={`Keep ${b.course} at ${fmtTime(t.s)} ${daysStr(t.d)}, any section`}
                            title={on ? "Every schedule has this course at this time, in any section that meets then. Press again to remove." : "Keep this time in every schedule, whichever section meets then"}
                            onClick={() => toggleAt(b.course, at)}
                            className={`inline-flex items-center gap-1 rounded border px-2 text-sm leading-7 font-semibold ${on ? "border-action bg-action text-white" : "border-line bg-white text-action hover:border-action"}`}
                          >
                            <Icon name={on ? "lock" : "clock"} />
                            Keep {fmtTime(t.s).replace(":00", "")} {daysStr(t.d)}, any section
                          </button>
                        );
                      })()}
                      <span className="min-w-[9rem] flex-1 tnum">{s.meetings.map((m) => (m.s === null ? "No set time" : `${daysStr(m.d)} ${fmtTime(m.s)}–${fmtTime(m.e)}`)).join("; ")}</span>
                      {s.status && <SeatStatus status={s.status} />}
                      <RestrictionBadge e={elig.get(s.crn)} />
                      <span className="text-sm text-muted">{s.instructors_raw.join("; ") || "TBA"}</span>
                      {b.prof && s.component === "primary" && s.instructors.includes(b.prof.key) && (
                        <ProfBadge name={inputs.find((x) => x.key === b.course)?.course.instructors[b.prof.key]?.name ?? ""} score={b.prof.score} best={profRanks[b.course]?.best === b.prof.key} />
                      )}
                      {s.special && (
                        <span className="w-full">
                          <Badge icon="alert">Special section: {s.special}</Badge>
                        </span>
                      )}
                      <BackupLine
                        info={backups.find((x) => x.section.crn === s.crn)}
                        live={live}
                        now={now}
                        onUse={(bk) => swapBackup(b.course, bk)}
                      />
                    </li>
                  )),
                )}
              </ul>
              <WatchList schedule={sched} term={term} openWeight={prefs.weights.open} />
              {sched.bundles.some((b) => b.alternatives.length > 1) && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-action">Same-time alternatives (identical times and area)</summary>
                  <ul className="mt-1 space-y-0.5">
                    {sched.bundles
                      .filter((b) => b.alternatives.length > 1)
                      .map((b) => (
                        <li key={b.course}>
                          <strong>{b.course}:</strong>{" "}
                          {b.alternatives
                            .filter((alt) => alt.map((x) => x.crn).join() !== b.crns.join())
                            .map((alt) => alt.map((x) => `${x.code} (${x.crn})`).join(" + "))
                            .join("; ")}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
              <div className="flex flex-wrap gap-2">
                <CopyButton text={sched.bundles.flatMap((b) => b.crns).join(", ")} label="Copy all CRNs" className="!px-3 !leading-9" />
                {!sched.bundles.every((b) => b.crns.every((crn) => isLockedSec(b.course, crn))) && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded border border-line bg-white px-3 font-semibold leading-9 hover:border-action hover:text-action"
                    title="Keep every section of this schedule, so changing the rules can't swap them out"
                    onClick={() => lockAll(true)}
                  >
                    <Icon name="lock" />
                    Lock this schedule
                  </button>
                )}
                {cart.some((c) => c.locked.length || c.at?.length) && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded border border-line bg-white px-3 font-semibold leading-9 hover:border-action hover:text-action"
                    onClick={() => lockAll(false)}
                  >
                    <Icon name="unlock" />
                    Unlock all
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded border border-line bg-white px-3 font-semibold leading-9 hover:border-action hover:text-action"
                  onClick={() => {
                    try {
                      setIcsError(null);
                      const ics = buildIcs(sched, term, termLabel(term), new Date(), { finals: icsFinals });
                      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = icsFileName(term, shared && !shared.rules ? null : (plan?.name ?? null));
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (e) {
                      setIcsError((e as Error).message);
                    }
                  }}
                >
                  <Icon name="calendar" className="text-muted" />
                  Download .ics
                </button>
                {finalsOf(sched).length > 0 && (
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={icsFinals} onChange={(e) => setIcsFinals(e.target.checked)} />
                    Include final exams in the .ics
                  </label>
                )}
                <ShareButton />
                <a href={SELF_SERVICE_URL} className="inline-flex items-center gap-1.5 rounded bg-action px-3 font-semibold leading-9 text-white hover:bg-action-dark" rel="noopener">
                  Register in Self-Service
                  <Icon name="external" />
                </a>
              </div>
              <AskAi text={scheduleSummary(sched, term, must, courses)} what="this schedule" />
              {icsError && (
                <p className="flex items-start gap-2" role="alert">
                  <Icon name="alert" className="mt-1" />
                  {icsError}
                </p>
              )}
              {result.schedules.length > 1 && <CompareTop schedules={result.schedules} idx={idx} onPick={setIdx} />}
              <p className="text-sm text-muted">
                Expected GPA uses each section&apos;s instructor GPA for that course (GPA dataset), else the course average:{" "}
                {sched.bundles.map((b) => `${b.course} ${b.gpa === null ? "no data" : fmtGpa(b.gpa)}`).join(", ")}.
                {TERM_DATES[term] &&
                  (TERM_DATES[term].estimated
                    ? ` Calendar dates are estimates (${TERM_DATES[term].start} to ${TERM_DATES[term].end}); the Registrar hasn't published this term's calendar yet.`
                    : ` Calendar export: ${TERM_DATES[term].start} to ${TERM_DATES[term].end}, skipping ${breakNames(TERM_DATES[term])}, from the Registrar's academic calendar.`)}{" "}
                Seats and restrictions: confirm in Self-Service.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** The top schedules side by side, so trade-offs (GPA vs days off vs start time) are visible at a glance. */
function diffFromFirst(first: Schedule, s: Schedule): string {
  const parts = s.bundles
    .filter((b) => first.bundles.find((x) => x.course === b.course)?.crns.join() !== b.crns.join())
    .map((b) => `${b.course} ${b.sections.map((x) => x.code).join("+")}`);
  return parts.join(", ") || "same sections";
}

/** The lecture's professor score, and "Best pick" when they're the course's top-scored professor this term (#49). */
function ProfBadge({ name, score, best }: { name: string; score: number; best: boolean }) {
  return (
    <span data-testid="prof-pick" data-best={best || undefined} title={`${name}: best-pick score ${score} of 100, as on the course page`}>
      <Badge icon={best ? "award" : undefined}>{best ? `Best pick, ${score}` : `Professor score ${score}`}</Badge>
    </span>
  );
}

function CompareTop({ schedules, idx, onPick }: { schedules: Schedule[]; idx: number; onPick: (i: number) => void }) {
  const [n, setN] = useState(8);
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="text-lg font-semibold text-heading">
        Compare the top schedules
      </h3>
      <div className="mt-2 overflow-x-auto rounded border border-line" role="region" aria-labelledby={id} tabIndex={0}>
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead className="bg-panel text-heading">
            <tr>
              {["#", "Expected GPA", "Days off", "Earliest", "Latest", "Gaps a week", "Open now", "Finals", "Different sections from #1"].map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedules.slice(0, n).map((s, i) => (
              <tr key={i} className={`border-t border-line ${i === idx ? "bg-action-tint font-semibold" : "hover:bg-panel"}`} aria-current={i === idx ? "true" : undefined}>
                <td className="px-2 py-1.5">
                  <button type="button" className="font-semibold text-action underline" onClick={() => onPick(i)} aria-label={`Show schedule ${i + 1}`}>
                    {i + 1}
                  </button>
                </td>
                <td className="px-2 py-1.5 tnum">{s.stats.expectedGpa === null ? "–" : fmtGpa(s.stats.expectedGpa)}</td>
                <td className="px-2 py-1.5">{s.stats.daysOff.join(", ") || "none"}</td>
                <td className="px-2 py-1.5 tnum">{s.stats.earliest === null ? "–" : fmtTime(s.stats.earliest)}</td>
                <td className="px-2 py-1.5 tnum">{s.stats.latest === null ? "–" : fmtTime(s.stats.latest)}</td>
                <td className="px-2 py-1.5 tnum">{fmtHours(s.stats.gapMinutes)}</td>
                <td className="px-2 py-1.5 tnum">
                  {s.bundles.filter((b) => bundleOpen(b)).length} of {s.bundles.length}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap" data-testid="compare-finals">
                  {finalsSummary(s)}
                </td>
                <td className="px-2 py-1.5">{i === 0 ? <span className="text-muted">Top pick</span> : diffFromFirst(schedules[0], s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {schedules.length > n && (
        <button type="button" className="mt-2 font-semibold text-action hover:underline" onClick={() => setN((x) => x + 10)}>
          Show {Math.min(10, schedules.length - n)} more
        </button>
      )}
    </section>
  );
}

/** A section's restriction for this student (#81): left out, unclear, or restricted to students like them. */
function RestrictionBadge({ e }: { e: Eligibility | undefined }) {
  if (!e || e.status === "open") return null;
  const label = e.status === "no" ? "Not for you" : e.status === "maybe" ? "May be restricted" : "Restricted: you qualify";
  return (
    <span data-testid="restriction" data-status={e.status} title={e.because.join(" ")}>
      <Badge icon={e.status === "ok" ? "check" : "alert"}>{label}</Badge>
    </span>
  );
}

/** The backup under one section of the shown schedule (#76): its first choice inline, the others behind "more". */
function BackupLine({ info, live, now, onUse }: { info: SectionBackups | undefined; live: Map<string, [string, string]>; now: number; onUse: (bk: Backup) => void }) {
  if (!info) return null;
  const desc = (bk: Backup) => {
    const times = bk.changed
      .flatMap((x) => x.meetings.map((m) => (m.s === null ? "no set time" : `${daysStr(m.d)} ${fmtTime(m.s)}–${fmtTime(m.e)}`)))
      .join("; ");
    const why = [bk.sameTime ? "same time" : null, bk.sameProf ? "same professor" : null].filter(Boolean).join(", ");
    return { times, why };
  };
  const row = (bk: Backup, first: boolean) => {
    const { times, why } = desc(bk);
    const status = (x: Section) => live.get(x.crn)?.[0] ?? x.status;
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid={first ? "backup" : "backup-more"}>
        {first && <span className="font-semibold text-heading">Backup:</span>}
        <span>
          {bk.changed.map((x) => `${x.code} ${x.type}`).join(" + ")} <span className="tnum">{times}</span>
        </span>
        {bk.changed.map((x) => (
          <CopyButton key={x.crn} text={x.crn} />
        ))}
        {bk.changed.map((x) => status(x) && <SeatStatus key={`st-${x.crn}`} status={status(x)} />)}
        {bk.changed.some((x) => live.has(x.crn)) && <span className="text-sm text-muted">checked {fmtSince(live.get(bk.changed.find((x) => live.has(x.crn))!.crn)![1], now)}</span>}
        {why && <span className="text-sm text-muted">{why}</span>}
        <button type="button" className="font-semibold text-action underline" onClick={() => onUse(bk)} aria-label={`Use ${bk.changed.map((x) => x.code).join(" + ")} instead of ${info.section.code} for ${info.course}`}>
          Use this instead
        </button>
      </span>
    );
  };
  if (!info.backups.length)
    return (
      <span className="w-full text-sm text-muted" data-testid="no-backup">
        {info.none}
      </span>
    );
  return (
    <div className="w-full border-l-2 border-line pl-3 text-sm">
      {row(info.backups[0], true)}
      {info.backups.length > 1 && (
        <details>
          <summary className="cursor-pointer text-action">
            {info.backups.length - 1} more backup{info.backups.length > 2 ? "s" : ""}
          </summary>
          <div className="mt-1 space-y-1">{info.backups.slice(1).map((bk) => <div key={bk.bundle.crns.join()}>{row(bk, false)}</div>)}</div>
        </details>
      )}
    </div>
  );
}

/** Finals week for one schedule (#85): each day's exams, the Student Code conflicts, and courses with no final listed. */
function FinalsWeek({ schedule, colorOf, termName }: { schedule: Schedule; colorOf: (course: string) => string; termName: string }) {
  const days = finalsByDay(schedule);
  const conflicts = examConflicts(schedule);
  const pending = finalsPending(schedule);
  const inConflict = (crn: string, date: string, s: number) =>
    conflicts.some((c) => c.kind !== "exactly-24h" && c.exams.some((x) => x.crn === crn && x.date === date && x.s === s));
  if (!days.length)
    return (
      <p className="rounded border border-dashed border-line p-4 text-center" data-testid="finals-week">
        No final exams are listed for {termName} yet. The Registrar usually publishes the final exam schedule around the middle of the
        term; check back then.
      </p>
    );
  return (
    <div className="space-y-3" data-testid="finals-week">
      {conflicts.length > 0 && (
        <ul className="space-y-1 rounded bg-panel p-3" data-testid="exam-conflicts">
          {conflicts.map((c) => (
            <li key={c.text} className="flex items-start gap-2" data-kind={c.kind}>
              <Icon name="alert" className="mt-1 shrink-0 text-heading" />
              <span>
                {c.text}{" "}
                <a href={STUDENT_CODE_EXAMS} target="_blank" rel="noreferrer" className="text-action underline">
                  Student Code § 3-201
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {days.map((d) => (
          <li key={d.date} className="rounded border border-line p-2" data-date={d.date}>
            <h4 className="font-semibold text-heading">
              {examDay(d)}
              {d.exams.length > 1 && <span className="font-normal text-muted"> · {d.exams.length} finals</span>}
            </h4>
            <ul className="mt-1 space-y-1">
              {d.exams.map((x) => (
                <li
                  key={`${x.crn}-${x.s}`}
                  className={`course-swatch border-l-4 pl-2 ${colorOf(x.course)} ${inConflict(x.crn, x.date, x.s) ? "font-semibold" : ""}`}
                  data-conflict={inConflict(x.crn, x.date, x.s) || undefined}
                >
                  <span className="block">
                    {x.course} <span className="text-sm text-muted">{x.code}</span>
                    {inConflict(x.crn, x.date, x.s) && <Icon name="alert" className="ml-1 inline text-heading" />}
                  </span>
                  <span className="block text-sm tnum">{examTime(x)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {pending.length > 0 && (
        <p className="text-sm text-muted">
          No final listed for {pending.join(", ")}: not scheduled yet, scheduled by the department, or no final. Check the syllabus.
        </p>
      )}
      <p className="text-sm text-muted">From Course Explorer&apos;s final exam schedule. Times and rooms can change; check the course page before finals week.</p>
    </div>
  );
}

/** Closed sections the shown schedule depends on (#27): what to watch (#15), and where waitlist numbers live. */
function WatchList({ schedule, term, openWeight }: { schedule: Schedule; term: string; openWeight: number }) {
  const id = useId();
  const watch = sectionsToWatch(schedule);
  if (!watch.length) return null;
  const n = watch.length;
  return (
    <section aria-labelledby={id} className="rounded border border-line bg-panel p-3" data-testid="watch-list">
      <h3 id={id} className="flex items-center gap-2 font-semibold text-heading">
        <Icon name="bell" className="text-muted" />
        Sections to watch
      </h3>
      <p className="mt-1">
        This schedule needs {n === 1 ? "a section that was" : `${n} sections that were`} Closed at the last check. The site only knows open or closed, not
        whether there&apos;s a waitlist or how long it is:{" "}
        <a href={SELF_SERVICE_URL} className="text-action underline" rel="noopener">
          Self-Service
        </a>{" "}
        shows that.
      </p>
      <ul className="mt-2 border-t border-line">
        {watch.map(({ course, section: s }) => {
          const [subj, num] = course.split(" ");
          return (
            <li key={s.crn} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-1.5">
              <span className="w-24 font-semibold">{course}</span>
              <span className="w-24">
                {s.code} {s.type}
              </span>
              <CopyButton text={s.crn} />
              <SeatStatus status={s.status} />
              <Link href={`${courseHref(subj, num)}#crn-${s.crn}`} className="text-sm text-action underline">
                On the course page
              </Link>
              <WatchButton item={{ t: term, crn: s.crn, s: subj, n: num, code: s.code }} />
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm">
        <Link href="/opened/?mine=1" className="font-semibold text-action underline">
          Just opened
        </Link>{" "}
        lists your schedule&apos;s sections as soon as a seat opens. Press Watch to follow a section:{" "}
        <Link href="/opened/?watch=1" className="text-action underline">
          your watched sections
        </Link>{" "}
        are listed at the top of Just opened with their latest status, and the page can notify you when one opens.
        {openWeight < 3 && " To rank schedules that need fewer closed sections first, raise “Sections open right now” under What matters to you."}
      </p>
    </section>
  );
}

/** The plan switcher (#118). Each plan keeps its own courses, locks and must-haves, so its own share link and .ics. */
function PlanBar({
  plans,
  plan,
  comparing,
  onCompare,
  onSwitch,
  onNew,
  onRename,
  onDelete,
}: {
  plans: Plans;
  plan: Plan;
  comparing: boolean;
  onCompare: () => void;
  onSwitch: (id: string) => void;
  onNew: (copy: boolean) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [open, setOpen] = useState(false); // one "Plan: name" control opens the rest (#240)
  const box = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => setRenaming(null), [plan.id]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const full = plans.plans.length >= MAX_PLANS;
  const fullNote = `${MAX_PLANS} plans is the most this browser keeps: delete one first`;
  const count = (p: Plan) => (p.cart ? p.cart.split(",").length : 0);
  const pick = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  const item = "flex w-full items-center gap-2 rounded px-2 text-left leading-9 font-semibold text-action hover:bg-action-tint disabled:text-muted disabled:hover:bg-transparent";
  return (
    <section ref={box} aria-label="Plans" className="relative space-y-2" data-testid="plans">
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-1.5 rounded border border-line bg-white px-3 leading-9 hover:border-action"
        data-testid="plan-menu-toggle"
      >
        <span className="text-muted">Plan:</span>
        <span className="truncate font-semibold text-heading">{plan.name}</span>
        {plans.plans.length > 1 && <span className="shrink-0 text-sm text-muted tnum">of {plans.plans.length}</span>}
        <Icon name="chevronDown" className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        id={menuId}
        hidden={!open}
        className="absolute left-0 z-30 w-80 max-w-[calc(100vw-2rem)] rounded border border-line bg-white p-1 shadow-lg"
        data-testid="plan-menu"
      >
        <div role="group" aria-label="Open a plan" className="border-b border-line pb-1">
          {plans.plans.map((p) => {
            const on = p.id === plan.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={pick(() => onSwitch(p.id))}
                className={`flex w-full items-center gap-2 rounded px-2 text-left leading-9 hover:bg-action-tint ${on ? "font-semibold text-heading" : "text-action"}`}
              >
                <Icon name="check" className={on ? "shrink-0 text-action" : "shrink-0 invisible"} />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto shrink-0 text-sm text-muted tnum" aria-hidden>
                  {count(p)}
                </span>
                <span className="sr-only">
                  , {count(p)} course{count(p) === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="pt-1">
          <button type="button" className={item} disabled={full} title={full ? fullNote : "An empty plan: no courses, and the default must-haves and priorities"} onClick={pick(() => onNew(false))}>
            <Icon name="plus" />
            New plan
          </button>
          <button
            type="button"
            className={item}
            disabled={full}
            title={full ? fullNote : "A copy to change, like “Plan B if CS 225 fills”"}
            aria-label={`Duplicate ${plan.name}`}
            onClick={pick(() => onNew(true))}
          >
            <Icon name="copy" />
            Duplicate
          </button>
          <button type="button" className={item} aria-label={`Rename ${plan.name}`} onClick={pick(() => setRenaming(plan.name))}>
            <span aria-hidden className="w-4 shrink-0" />
            Rename
          </button>
          <button type="button" className={item} disabled={plans.plans.length < 2} aria-label={`Delete ${plan.name}`} onClick={pick(onDelete)}>
            <Icon name="x" />
            Delete
          </button>
          {plans.plans.length > 1 && (
            <button type="button" className={item} aria-pressed={comparing} onClick={pick(onCompare)}>
              <Icon name="table" />
              {comparing ? "Close the comparison" : "Compare plans"}
            </button>
          )}
        </div>
      </div>
      {renaming !== null && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onRename(renaming);
            setRenaming(null);
          }}
        >
          <label className="block">
            <span className="text-sm font-semibold text-heading">New name for {plan.name}</span>
            <input
              autoFocus
              value={renaming}
              maxLength={MAX_NAME}
              placeholder="Plan B if CS 225 fills"
              onChange={(e) => setRenaming(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setRenaming(null);
              }}
              className="mt-1 block w-72 max-w-full rounded border border-line bg-white px-2 py-1.5"
            />
          </label>
          <button type="submit" className="rounded bg-action px-3 leading-9 font-semibold text-white hover:bg-action-dark disabled:opacity-50" disabled={!renaming.trim()}>
            Save
          </button>
          <button type="button" className="leading-9 font-semibold text-action underline" onClick={() => setRenaming(null)}>
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}

type PlanBest = { plan: Plan; courses: string[]; best: Schedule | null; hours: [number, number]; note: string | null };

/** "MWF 2:00pm" for the first timed meeting of a course's sections (an online lecture's discussion still has a time). */
const briefTime = (secs: Section[]) => {
  const m = secs.flatMap((s) => s.meetings).find((x) => x.s !== null);
  return m ? `${daysStr(m.d)} ${fmtTime(m.s)}` : "no set time";
};

/**
 * Each plan's best schedule side by side (#119), each ranked by that plan's own must-haves and priorities, with what it
 * does differently from the plan that's open. The open plan comes from the builder as it is now (`live`).
 */
function PlanCompare({
  activeId,
  live,
  term,
  ctx,
  onPick,
  onClose,
}: {
  activeId: string;
  live: { cart: string; prefs: string; names: string };
  term: string;
  ctx: InputContext;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [rows, setRows] = useState<PlanBest[] | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    const list = readPlans().plans.map((p) => (p.id === activeId ? { ...p, cart: live.cart, prefs: live.prefs } : p));
    (async () => {
      const out: PlanBest[] = [];
      for (const p of list) {
        const items = decodeCart(p.cart);
        const got = await Promise.allSettled(items.map((c) => loadCourse(c.s, c.n)));
        await new Promise((r) => setTimeout(r, 0)); // one plan at a time, so the page stays responsive
        if (!alive) return;
        const inputs = items.flatMap((c, i) => {
          const r = got[i];
          return r.status === "fulfilled" ? [courseInput(`${c.s} ${c.n}`, r.value, c.locked, term, ctx)] : [];
        });
        const prefs = prefsFromParams(new URLSearchParams(p.prefs ?? ""));
        const res = inputs.length ? generate(inputs, term, prefs) : null;
        const best = res?.schedules[0] ?? null;
        const counted = inputs.filter((i) => i.course.terms[term]?.sections.length && (!best || best.bundles.some((b) => b.course === i.key)));
        const left = res?.emptyCourses ?? [];
        out.push({
          plan: p,
          courses: items.map((c) => `${c.s} ${c.n}`),
          best,
          hours: totalHours(counted.map((i) => i.course.credit_range)),
          note: !items.length
            ? "No courses yet."
            : !best
              ? "No schedule fits this plan's courses and must-haves."
              : left.length
                ? `Leaves out ${left.join(", ")}: ${explainEmpty(inputs.find((x) => x.key === left[0])!, term, prefs)}.`
                : null,
        });
      }
      setRows(out);
    })();
    return () => {
      alive = false;
    };
  }, [activeId, live.cart, live.prefs, live.names, term, ctx]);
  const open = rows?.find((r) => r.plan.id === activeId);
  const metrics = (r: PlanBest): Record<string, string> =>
    r.best
      ? {
          gpa: r.best.stats.expectedGpa === null ? "–" : fmtGpa(r.best.stats.expectedGpa),
          hours: fmtCredits(r.hours),
          off: r.best.stats.daysOff.join(", ") || "none",
          span: r.best.stats.earliest === null ? "–" : `${fmtTime(r.best.stats.earliest)}–${fmtTime(r.best.stats.latest)}`.replace(/:00/g, ""),
          gaps: fmtHours(r.best.stats.gapMinutes),
          open: `${r.best.bundles.filter((b) => bundleOpen(b)).length} of ${r.best.bundles.length}`,
          finals: finalsSummary(r.best),
        }
      : {};
  const ROWS: [string, string][] = [
    ["gpa", "Expected GPA"],
    ["hours", "Credit hours"],
    ["off", "Days off"],
    ["span", "Day span"],
    ["gaps", "Gaps a week"],
    ["open", "Open now"],
    ["finals", "Finals"],
  ];
  const cell = "px-2 py-1.5 align-top";
  return (
    <section aria-labelledby={id} className="space-y-2 border-t-4 border-navy pt-3" data-testid="plan-compare">
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="font-display text-xl font-bold text-heading">
          Compare your plans
        </h2>
        <button type="button" onClick={onClose} aria-label="Close the comparison" className="inline-flex size-8 items-center justify-center rounded text-muted hover:bg-panel hover:text-action">
          <Icon name="x" />
        </button>
      </div>
      <p className="text-sm text-muted">
        The best schedule of each plan for {termLabel(term)}, ranked by that plan&apos;s own must-haves and priorities. Values in bold differ from the plan
        that&apos;s open.
      </p>
      {!rows ? (
        <p role="status">Building each plan&apos;s best schedule…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-line" role="region" aria-labelledby={id} tabIndex={0}>
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead className="bg-panel text-heading">
              <tr>
                <td className={cell} />
                {rows.map((r) => (
                  <th key={r.plan.id} scope="col" className={cell} data-plan={r.plan.name}>
                    <span className="block font-semibold">{r.plan.name}</span>
                    {r.plan.id === activeId ? (
                      <span className="font-normal text-muted">Open now</span>
                    ) : (
                      <button type="button" className="font-semibold text-action underline" onClick={() => onPick(r.plan.id)}>
                        Open {r.plan.name}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                <th scope="row" className={`${cell} font-semibold whitespace-nowrap text-heading`}>
                  Courses
                </th>
                {rows.map((r) => (
                  <td key={r.plan.id} className={cell}>
                    {r.courses.join(", ") || "none"}
                  </td>
                ))}
              </tr>
              {ROWS.map(([k, label]) => (
                <tr key={k} className="border-t border-line">
                  <th scope="row" className={`${cell} font-semibold whitespace-nowrap text-heading`}>
                    {label}
                  </th>
                  {rows.map((r) => {
                    const v = metrics(r)[k];
                    const differs = !!open?.best && r !== open && v !== undefined && v !== metrics(open)[k];
                    return (
                      <td key={r.plan.id} className={`${cell} tnum ${differs ? "font-semibold text-heading" : ""}`} data-differs={differs || undefined}>
                        {v ?? "–"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-line">
                <th scope="row" className={`${cell} font-semibold whitespace-nowrap text-heading`}>
                  Sections
                </th>
                {rows.map((r) => (
                  <td key={r.plan.id} className={cell}>
                    {r.best && (
                      <ul className="space-y-0.5">
                        {r.best.bundles.map((b) => (
                          <li key={b.course}>
                            {b.course} {b.sections.map((s) => s.code).join(" + ")} <span className="text-muted tnum">{briefTime(b.sections)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.note && <p className={r.best ? "mt-1 text-muted" : ""}>{r.note}</p>}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-line">
                <th scope="row" className={`${cell} font-semibold text-heading`}>
                  Different from the open plan
                </th>
                {rows.map((r) => (
                  <td key={r.plan.id} className={`${cell} font-semibold text-heading`} data-testid="plan-diff">
                    {r === open ? <span className="font-normal text-muted">This is the open plan</span> : r.best && open?.best ? planDifferences(open.best, r.best).join(", ") || "Same schedule" : "–"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ShareButton() {
  const [href, setHref] = useState("");
  useEffect(() => {
    const update = () => setHref(window.location.href);
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, []);
  return <CopyButton text={href} label="Copy share link" className="!px-3 !leading-9" />;
}
