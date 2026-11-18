"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { decodeCart, encodeCart, onCartChange, readCart, writeCart, type CartItem } from "@/lib/cart";
import { courseHref, dataUrl, daysStr, fmtGpa, fmtTime, SELF_SERVICE_URL, termLabel } from "@/lib/format";
import { buildIcs } from "@/lib/ics";
import { hasPrefParams, loadPrefs, prefsFromParams, prefsToParams, PRESETS, savePrefs, timeRulesSummary } from "@/lib/prefs";
import {
  bundleOpen,
  clashingPairs,
  DEFAULT_PREFS,
  explainEmpty,
  generate,
  LUNCH,
  summaryLine,
  warnings,
  type CourseInput,
  type GenerateResult,
  type Prefs,
  type Schedule,
} from "@/lib/schedule";
import { TERM_DATES } from "@/lib/terms";
import type { Course, Section } from "@/lib/types";
import CopyButton from "./CopyButton";
import { Badge, SeatStatus } from "./ui/Badge";
import Icon from "./ui/Icon";
import Info from "./ui/Info";
import SearchBox from "./SearchBox";
import WeekCalendar, { COURSE_COLORS } from "./WeekCalendar";

type MetaLite = { next_term: string; current_term: string; rmpAvailable: boolean; rmpPrior?: number | null };
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

function sameCart(a: CartItem[], b: CartItem[]): boolean {
  return encodeCart(a) === encodeCart(b);
}

function fmtHours(min: number): string {
  if (!min) return "none";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

/** Plain-words list of the must-haves that are on, for a collapsed panel. */
function mustSummary(p: Prefs): string[] {
  const out = timeRulesSummary(p);
  if (p.lunch) out.push("lunch break");
  if (p.openOnly) out.push("open sections only");
  if (p.includeSpecial) out.push("special sections allowed");
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
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false); // after the first run, results follow every change
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const [shared, setShared] = useState<{ mine: CartItem[] } | null>(null);
  const [blockForm, setBlockForm] = useState({ days: 0, s: "17:00", e: "19:00" });
  const [icsError, setIcsError] = useState<string | null>(null);
  const [panels, setPanels] = useState({ must: true, soft: true });
  const autoRun = useRef<number | null>(null); // schedule index to open once a shared link's courses load

  // Initial state: a shared link (URL) shows its list; it only replaces your saved list if you say so.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    if (t && /^\d{4}-(sp|su|fa|wi)$/.test(t)) setTerm(t);
    const mine = readCart();
    if (params.has("c")) {
      const fromUrl = decodeCart(params.get("c"));
      if (mine.length && fromUrl.length && !sameCart(mine, fromUrl)) setShared({ mine });
      else writeCart(fromUrl);
      setCart(fromUrl);
    } else setCart(mine);
    if (hasPrefParams(params)) {
      setPrefs(prefsFromParams(params));
      if (params.has("c")) autoRun.current = Math.max(0, Number(params.get("i") ?? 0) || 0);
    } else {
      const saved = loadPrefs();
      if (saved) setPrefs(saved);
    }
    // On a phone the rules fold away so the results are closer; they stay open on a wide screen.
    if (!window.matchMedia("(min-width: 1024px)").matches) setPanels({ must: false, soft: false });
    setReady(true);
    return onCartChange(() => {
      setShared(null);
      setCart(readCart());
    });
  }, []);

  // Keep the URL shareable (courses + term + rules + which schedule) and remember rules locally.
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    url.searchParams.set("t", term);
    if (cart.length) url.searchParams.set("c", encodeCart(cart));
    else url.searchParams.delete("c");
    prefsToParams(prefs, url.searchParams);
    if (result && idx > 0) url.searchParams.set("i", String(idx));
    else url.searchParams.delete("i");
    window.history.replaceState(null, "", url.toString());
    if (!shared) savePrefs(prefs);
  }, [cart, term, prefs, ready, idx, result, shared]);

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

  const inputs: CourseInput[] = useMemo(
    () =>
      cart
        .filter((c) => courses[`${c.s} ${c.n}`])
        .map((c) => {
          const course = courses[`${c.s} ${c.n}`];
          return { key: `${c.s} ${c.n}`, course, credits: course.credit_range[1] || 3, locked: c.locked, rmpPrior: meta.rmpPrior ?? null };
        }),
    [cart, courses, meta.rmpPrior],
  );
  const loaded = inputs.length + loadErrors.length >= cart.length;

  const lastRun = useRef<{ inputs: CourseInput[]; term: string; prefs: Prefs } | null>(null);
  const run = useCallback(
    (openIndex = 0) => {
      lastRun.current = { inputs, term, prefs };
      setBusy(true);
      setAuto(true);
      setTimeout(() => {
        const r = generate(inputs, term, prefs);
        setResult(r);
        setIdx(Math.min(openIndex, Math.max(0, r.schedules.length - 1)));
        setBusy(false);
      }, 10);
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
  const warns = warnings(inputs, term, sched, termLabel(term));
  const updateItem = (s: string, n: string, f: (c: CartItem) => CartItem) => writeCart(cart.map((c) => (c.s === s && c.n === n ? f(c) : c)));
  const remove = (s: string, n: string) => writeCart(cart.filter((c) => !(c.s === s && c.n === n)));
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  const setW = (k: W, v: number) => setPrefs((p) => ({ ...p, weights: { ...p.weights, [k]: v } }));
  const termOptions = [meta.next_term, meta.current_term].filter((t, i, a) => a.indexOf(t) === i);
  const missing = result ? result.emptyCourses.map((k) => ({ key: k, why: explainEmpty(inputs.find((x) => x.key === k)!, term, prefs) })) : [];
  const clashes = result && !result.schedules.length ? clashingPairs(inputs, term, prefs) : [];
  const must = mustSummary(prefs);
  const wKeys = Object.keys(DEFAULT_PREFS.weights) as W[];
  const preset = PRESETS.find((p) => wKeys.every((k) => p.weights[k] === prefs.weights[k]));
  const softChanged = wKeys.some((k) => prefs.weights[k] !== DEFAULT_PREFS.weights[k]) || prefs.softEarly !== DEFAULT_PREFS.softEarly || prefs.softLate !== DEFAULT_PREFS.softLate;
  const mustDefault = must.length === 0;
  const creditsOf = (s: Schedule) => s.bundles.reduce((a, b) => a + (inputs.find((x) => x.key === b.course)?.credits ?? 0), 0);

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
      {shared && (
        <div className="rounded bg-panel p-4" role="status">
          You opened a shared course list. Your own saved list ({shared.mine.map((c) => `${c.s} ${c.n}`).join(", ")}) is untouched.
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="rounded bg-action px-3 py-1.5 font-semibold text-white hover:bg-action-dark"
              onClick={() => {
                writeCart(cart);
                setShared(null);
              }}
            >
              Use this list
            </button>
            <button
              className="rounded border border-action bg-white px-3 py-1.5 font-semibold text-action hover:bg-action-tint"
              onClick={() => {
                setCart(shared.mine);
                setShared(null);
                setResult(null);
              }}
            >
              Back to my list
            </button>
          </div>
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[23rem_minmax(0,1fr)]">
        {/* ---------------- left: courses, must-haves, priorities ---------------- */}
        <div className="space-y-8">
          <section aria-labelledby="cart-h" className="space-y-3 border-t-4 border-navy pt-3">
            <div className="flex items-center justify-between gap-2">
              <h2 id="cart-h" className="font-display text-xl font-bold text-heading">
                Your courses
              </h2>
              <select className="rounded border border-line bg-white px-2 py-1.5" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Term">
                {termOptions.map((t) => (
                  <option key={t} value={t}>
                    {termLabel(t)}
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
                    )}
                  </li>
                );
              })}
            </ul>
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
            <div className="space-y-1.5">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 size-4 accent-action" checked={prefs.lunch} onChange={(e) => set("lunch", e.target.checked)} />
                <span>
                  Keep a lunch break
                  <span className="block text-sm text-muted">
                    At least {LUNCH.min} minutes free between {fmtTime(LUNCH.from)} and {fmtTime(LUNCH.to)} on every day with class
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 size-4 accent-action" checked={prefs.openOnly} onChange={(e) => set("openOnly", e.target.checked)} />
                <span>
                  Open sections only
                  <span className="block text-sm text-muted">Skip sections that were Closed at the last check (sections you lock are kept)</span>
                </span>
              </label>
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
            {!mustDefault && (
              <button
                type="button"
                className="font-semibold text-action hover:underline"
                onClick={() => setPrefs((p) => ({ ...p, earliest: null, latest: null, daysOff: 0, lunch: false, openOnly: false, includeSpecial: false, blocked: [] }))}
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
            </div>
            <div className="space-y-2.5" role="group" aria-label="Priorities">
              {weightRow("gpa", "Higher expected GPA", "Higher expected GPA")}
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
          {warns.length > 0 && (
            <ul className="space-y-1 rounded bg-panel p-3" data-testid="warnings">
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
              {clashes.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {clashes.map((c) => (
                    <li key={c}>{c}. Drop one of them or pick another course.</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1">
                  Every pair of courses can fit, but not all of them at once{prefs.lunch ? " with a lunch break" : ""}. Try removing a must-have, a locked section or a course.
                </p>
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
              <dl className="grid grid-cols-2 gap-y-3 border-y border-line py-3 sm:grid-cols-3 xl:grid-cols-6 xl:divide-x xl:divide-line" data-testid="schedule-stats">
                {(
                  [
                    ["Expected GPA", sched.stats.expectedGpa === null ? "–" : fmtGpa(sched.stats.expectedGpa)],
                    ["Credit hours", String(creditsOf(sched))],
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
              <WeekCalendar schedule={sched} colorOf={colorOf} blocked={prefs.blocked} daysOff={prefs.daysOff} />
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
                      <span className="min-w-[9rem] flex-1 tnum">{s.meetings.map((m) => (m.s === null ? "No set time" : `${daysStr(m.d)} ${fmtTime(m.s)}–${fmtTime(m.e)}`)).join("; ")}</span>
                      {s.status && <SeatStatus status={s.status} />}
                      <span className="text-sm text-muted">{s.instructors_raw.join("; ") || "TBA"}</span>
                      {s.special && (
                        <span className="w-full">
                          <Badge icon="alert">Special section: {s.special}</Badge>
                        </span>
                      )}
                    </li>
                  )),
                )}
              </ul>
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
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded border border-line bg-white px-3 font-semibold leading-9 hover:border-action hover:text-action"
                  onClick={() => {
                    try {
                      setIcsError(null);
                      const ics = buildIcs(sched, term, termLabel(term));
                      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `illini-schedule-${term}.ics`;
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
                <ShareButton />
                <a href={SELF_SERVICE_URL} className="inline-flex items-center gap-1.5 rounded bg-action px-3 font-semibold leading-9 text-white hover:bg-action-dark" rel="noopener">
                  Register in Self-Service
                  <Icon name="external" />
                </a>
              </div>
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
                  ` Calendar dates are estimates (${TERM_DATES[term].start} to ${TERM_DATES[term].end}, break skipped); check the official academic calendar.`}{" "}
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
              {["#", "Expected GPA", "Days off", "Earliest", "Latest", "Gaps a week", "Open now", "Different sections from #1"].map((h) => (
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
