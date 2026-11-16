"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeCart, encodeCart, onCartChange, readCart, writeCart, type CartItem } from "@/lib/cart";
import { courseHref, dataUrl, daysStr, fmtGpa, fmtTime, SELF_SERVICE_URL, termLabel } from "@/lib/format";
import { buildIcs } from "@/lib/ics";
import { hasPrefParams, loadPrefs, prefsFromParams, prefsToParams, savePrefs } from "@/lib/prefs";
import {
  clashingPairs,
  DEFAULT_PREFS,
  explainEmpty,
  generate,
  summaryLine,
  warnings,
  type CourseInput,
  type GenerateResult,
  type Prefs,
} from "@/lib/schedule";
import { TERM_DATES } from "@/lib/terms";
import type { Course, Section } from "@/lib/types";
import CopyButton from "./CopyButton";
import { Badge } from "./ui/Badge";
import Icon from "./ui/Icon";
import Info from "./ui/Info";
import SearchBox from "./SearchBox";
import WeekCalendar, { COURSE_COLORS } from "./WeekCalendar";

type MetaLite = { next_term: string; current_term: string; rmpAvailable: boolean; rmpPrior?: number | null };

const WEIGHT_LABELS: [keyof Prefs["weights"], string][] = [
  ["gpa", "Higher expected GPA"],
  ["rmp", "Better RMP ratings"],
  ["early", "Avoid classes before 10am"],
  ["daysOff", "More days off"],
  ["compact", "Fewer gaps between classes"],
  ["walking", "Avoid rushed walks across campus"],
];

const COMPONENT_NAMES: Record<string, string> = { primary: "Lecture", DIS: "Discussion", LAB: "Lab", LBD: "Lab-discussion", Q: "Quiz", OD: "Online discussion", OLB: "Online lab", PR: "Practice" };

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
  return `${s.code} ${s.type}, ${t}, CRN ${s.crn}${s.special ? ", special" : ""}`;
}

function sameCart(a: CartItem[], b: CartItem[]): boolean {
  return encodeCart(a) === encodeCart(b);
}

export default function ScheduleBuilder({ meta }: { meta: MetaLite }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [term, setTerm] = useState(meta.next_term);
  const [courses, setCourses] = useState<Record<string, Course>>({});
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const [shared, setShared] = useState<{ mine: CartItem[] } | null>(null);
  const [blockForm, setBlockForm] = useState({ days: 0, s: "17:00", e: "19:00" });
  const [icsError, setIcsError] = useState<string | null>(null);
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

  useEffect(() => {
    if (autoRun.current === null) setResult(null);
  }, [cart, term, prefs]);

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

  const run = useCallback(
    (openIndex = 0) => {
      setBusy(true);
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
    if (autoRun.current === null || !cart.length || inputs.length + loadErrors.length < cart.length) return;
    const i = autoRun.current;
    autoRun.current = null;
    run(i);
  }, [inputs, cart.length, loadErrors.length, run]);

  const colorOf = useCallback((course: string) => COURSE_COLORS[Math.max(0, cart.findIndex((c) => `${c.s} ${c.n}` === course)) % COURSE_COLORS.length], [cart]);
  const sched = result?.schedules[idx] ?? null;
  const warns = warnings(inputs, term, sched, termLabel(term));
  const updateItem = (s: string, n: string, f: (c: CartItem) => CartItem) => writeCart(cart.map((c) => (c.s === s && c.n === n ? f(c) : c)));
  const remove = (s: string, n: string) => writeCart(cart.filter((c) => !(c.s === s && c.n === n)));
  const setW = (k: keyof Prefs["weights"], v: number) => setPrefs((p) => ({ ...p, weights: { ...p.weights, [k]: v } }));
  const termOptions = [meta.next_term, meta.current_term].filter((t, i, a) => a.indexOf(t) === i);
  const missing = result ? result.emptyCourses.map((k) => ({ key: k, why: explainEmpty(inputs.find((x) => x.key === k)!, term, prefs) })) : [];
  const clashes = result && !result.schedules.length ? clashingPairs(inputs, term, prefs) : [];

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
      <div className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ---------------- left: cart + rules ---------------- */}
        <div className="space-y-8">
          <section aria-labelledby="cart-h" className="space-y-3">
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
              placeholder="Add a course: cs124, calculus…"
              onPick={(s, n) => writeCart(cart.some((c) => c.s === s && c.n === n) ? cart : [...cart, { s, n, locked: [] }])}
            />
            {ready && !cart.length && <p className="text-muted">Your cart is empty. Search above, or add courses from a course page or the gen-ed finder.</p>}
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
                return (
                  <li key={key} className={`course-swatch border-b border-l-4 border-b-line py-3 pl-3 ${colorOf(key)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={courseHref(c.s, c.n)} className="font-semibold text-action hover:underline">
                          {key}
                        </Link>{" "}
                        <span>{course?.title ?? "…"}</span>
                        {course && <span className="block text-sm text-muted">{course.credits.replace(" hours.", "")} credit hours</span>}
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
                              className="w-full rounded border border-line bg-white px-2 py-1 text-sm"
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

          <section aria-labelledby="rules-h" className="space-y-3">
            <h2 id="rules-h" className="font-display text-xl font-bold text-heading">
              Rules
            </h2>
            <label className="flex items-center justify-between gap-2">
              <span>No classes before</span>
              <select
                className="rounded border border-line bg-white px-2 py-1.5"
                value={prefs.earliest ?? ""}
                onChange={(e) => setPrefs((p) => ({ ...p, earliest: e.target.value ? Number(e.target.value) : null }))}
                aria-label="No classes before"
              >
                <option value="">Any time</option>
                <option value="540">9:00am (no 8am)</option>
                <option value="600">10:00am</option>
                <option value="660">11:00am</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-action" checked={prefs.noFriday} onChange={(e) => setPrefs((p) => ({ ...p, noFriday: e.target.checked }))} />
              No Friday classes
            </label>
            <div className="flex items-start gap-1">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 size-4 accent-action" checked={prefs.includeSpecial} onChange={(e) => setPrefs((p) => ({ ...p, includeSpecial: e.target.checked }))} />
                <span>Include special sections</span>
              </label>
              <Info label="What special sections are">
                Sections with odd codes like &ldquo;AD@&rdquo;, lectures without the discussion every other lecture has, or notes saying they are reserved for a
                group. They are often restricted to a program, so they are skipped unless you include them or lock one.
              </Info>
            </div>
            <div className="rounded bg-panel p-3" role="group" aria-labelledby="blocked-h">
              <p id="blocked-h" className="mb-2 font-semibold">
                Blocked times (work, practice)
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    [1, "M"],
                    [2, "T"],
                    [4, "W"],
                    [8, "R"],
                    [16, "F"],
                  ] as [number, string][]
                ).map(([bit, l]) => (
                  <label key={l} className={`inline-flex size-8 cursor-pointer items-center justify-center rounded border font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-action ${blockForm.days & bit ? "border-action bg-action text-white" : "border-line bg-white"}`}>
                    <input type="checkbox" className="sr-only" checked={!!(blockForm.days & bit)} onChange={() => setBlockForm((f) => ({ ...f, days: f.days ^ bit }))} />
                    {l}
                  </label>
                ))}
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
                    <li key={i}>
                      {daysStr(b.d)} {fmtTime(b.s)}–{fmtTime(b.e)}{" "}
                      <button className="font-semibold text-action underline" onClick={() => setPrefs((p) => ({ ...p, blocked: p.blocked.filter((_, j) => j !== i) }))}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="weights-h" className="space-y-2">
            <h2 id="weights-h" className="font-display text-xl font-bold text-heading">
              What matters to you
            </h2>
            {WEIGHT_LABELS.map(([k, label]) => {
              const off = k === "rmp" && !meta.rmpAvailable;
              return (
                <label key={k} className={`flex items-center justify-between gap-2 ${off ? "opacity-50" : ""}`}>
                  <span>
                    {label}
                    {off && <span className="block text-sm text-muted">RMP unavailable in this build</span>}
                  </span>
                  <input type="range" min={0} max={3} step={1} value={off ? 0 : prefs.weights[k]} disabled={off} onChange={(e) => setW(k, Number(e.target.value))} aria-label={label} className="w-28 accent-action" />
                </label>
              );
            })}
          </section>

          <button type="button" onClick={() => run(0)} disabled={!inputs.length || busy} className="w-full rounded bg-action px-4 py-2.5 text-lg font-semibold text-white hover:bg-action-dark disabled:opacity-50">
            {busy ? "Generating…" : "Generate schedules"}
          </button>
        </div>

        {/* ---------------- right: results ---------------- */}
        <section aria-labelledby="results-h" className="min-w-0 space-y-4">
          <h2 id="results-h" className="font-display text-xl font-bold text-heading">
            Schedules for {termLabel(term)}
          </h2>
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
          {!result && <p className="text-muted">{inputs.length ? "Press “Generate schedules”." : "Add courses to get started."}</p>}
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
              <p className="font-semibold">No conflict-free schedule exists for these courses and rules.</p>
              {clashes.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {clashes.map((c) => (
                    <li key={c}>{c}. Drop one of them or pick another course.</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1">Every pair of courses can fit, but not all of them at once. Try removing a rule, a locked section or a course.</p>
              )}
            </div>
          )}
          {sched && result && (
            <div className="space-y-3" data-testid="schedule-result">
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
              <WeekCalendar schedule={sched} colorOf={colorOf} blocked={prefs.blocked} />
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
              <p className="text-sm text-muted">
                Expected GPA uses each section&apos;s instructor GPA for that course (GPA dataset), else the course average:{" "}
                {sched.bundles.map((b) => `${b.course} ${b.gpa === null ? "no data" : fmtGpa(b.gpa)}`).join(", ")}.
              </p>
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
              {TERM_DATES[term] && (
                <p className="text-sm text-muted">
                  Calendar dates are estimates ({TERM_DATES[term].start} to {TERM_DATES[term].end}, break skipped); check the official academic calendar. Seats and restrictions:
                  confirm in Self-Service.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
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
