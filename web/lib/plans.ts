// Named schedules (#26): several plans, each with its own courses, locks and must-haves (#117). The active plan's
// courses and must-haves stay where every page already reads them (the cart and prefs keys of lib/cart.ts and
// lib/prefs.ts); this file keeps the list of plans and swaps a plan in and out of those keys.
import { CART_EVENT, CART_KEY, decodeCart, encodeCart, type CartItem } from "./cart";
import { daysStr, fmtTime } from "./format";
import { normPrefs, PREFS_KEY } from "./prefs";
import type { Schedule } from "./schedule";
import { componentName } from "./sections";
import type { Section } from "./types";

export const PLANS_KEY = "illini-scheduler:plans:v1";
export const PLANS_EVENT = "illini-plans-change";
/** How many plans this browser keeps, so storage stays small. A share link past it opens without being saved. */
export const MAX_PLANS = 10;
export const MAX_NAME = 40;

/** `cart` is encodeCart's string; `prefs` the must-have URL parameters (lib/prefs.ts), null for the defaults. */
export type Plan = { id: string; name: string; cart: string; prefs: string | null };
export type Plans = { active: string; plans: Plan[] };
export type PlanStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const memory = new Map<string, string>();
/** localStorage, or a stand-in that lasts until the tab closes when it's blocked. */
function local(): PlanStore {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* blocked */
  }
  return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) };
}

function notify(cartChanged: boolean): void {
  if (typeof window === "undefined") return;
  if (cartChanged) window.dispatchEvent(new Event(CART_EVENT));
  window.dispatchEvent(new Event(PLANS_EVENT));
}

/** Calls `fn` when the plans change here or in another tab. */
export function onPlansChange(fn: () => void): () => void {
  const h = (e: Event) => {
    if (!(e instanceof StorageEvent) || e.key === null || e.key === PLANS_KEY) fn();
  };
  window.addEventListener(PLANS_EVENT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(PLANS_EVENT, h);
    window.removeEventListener("storage", h);
  };
}

export const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
const letterName = (i: number) => `Plan ${i < 26 ? String.fromCharCode(65 + i) : i + 1}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** "Plan A", "Plan B", ...: the first one not taken. */
export function nextName(p: Plans): string {
  for (let i = 0; ; i++) if (!p.plans.some((x) => same(x.name, letterName(i)))) return letterName(i);
}

/** `name`, or "name (2)" when another plan already has it. */
export function uniqueName(p: Plans, name: string, except?: string): string {
  const base = cleanName(name) || nextName(p);
  const taken = (n: string) => p.plans.some((x) => x.id !== except && same(x.name, n));
  if (!taken(base)) return base;
  for (let i = 2; ; i++) if (!taken(`${base} (${i})`)) return `${base} (${i})`;
}

function parse(raw: string | null): Plans | null {
  let v: unknown;
  try {
    v = JSON.parse(raw ?? "null");
  } catch {
    return null;
  }
  const o = v as { active?: unknown; plans?: unknown } | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.plans)) return null;
  const plans: Plan[] = [];
  for (const x of o.plans as Record<string, unknown>[]) {
    if (!x || typeof x.id !== "string" || plans.some((y) => y.id === x.id) || plans.length >= MAX_PLANS) continue;
    plans.push({
      id: x.id,
      name: cleanName(String(x.name ?? "")) || letterName(plans.length),
      cart: encodeCart(decodeCart(typeof x.cart === "string" ? x.cart : "")),
      prefs: typeof x.prefs === "string" ? x.prefs : null,
    });
  }
  if (!plans.length) return null;
  return { active: plans.some((x) => x.id === o.active) ? (o.active as string) : plans[0].id, plans };
}

function save(store: PlanStore, p: Plans): void {
  try {
    store.setItem(PLANS_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: the plans last until the tab closes */
  }
}

/** Put a plan's courses and must-haves where the builder and the rest of the site read them. */
function setLive(store: PlanStore, plan: Plan): void {
  try {
    store.setItem(CART_KEY, plan.cart);
    if (plan.prefs === null) store.removeItem(PREFS_KEY);
    else store.setItem(PREFS_KEY, plan.prefs);
  } catch {
    /* see save() */
  }
}

/**
 * Every plan, the active one with what the cart and prefs keys hold right now. The first call moves the single cart
 * and must-haves from before named schedules into "Plan A", so nothing is lost.
 */
export function readPlans(store: PlanStore = local()): Plans {
  const live = { cart: encodeCart(decodeCart(store.getItem(CART_KEY))), prefs: store.getItem(PREFS_KEY) };
  const saved = parse(store.getItem(PLANS_KEY));
  if (!saved) {
    const first: Plans = { active: "p1", plans: [{ id: "p1", name: letterName(0), ...live }] };
    save(store, first);
    return first;
  }
  return { ...saved, plans: saved.plans.map((x) => (x.id === saved.active ? { ...x, ...live } : x)) };
}

export const activePlan = (p: Plans): Plan => p.plans.find((x) => x.id === p.active) ?? p.plans[0];

function newId(p: Plans): string {
  let i = p.plans.length + 1;
  while (p.plans.some((x) => x.id === `p${i}`)) i++;
  return `p${i}`;
}

/** Make plan `id` the active one. The plan that was active keeps what it has. */
export function switchPlan(id: string, store: PlanStore = local()): Plans {
  const p = readPlans(store);
  const to = p.plans.find((x) => x.id === id);
  if (!to || id === p.active) return p;
  const next = { ...p, active: id };
  save(store, next);
  setLive(store, to);
  notify(true);
  return next;
}

/**
 * A new plan, made active: a copy of plan `copyOf`, or the given courses and must-haves (none by default). Null when
 * there are already MAX_PLANS.
 */
export function createPlan(opts: { name?: string; copyOf?: string; cart?: string; prefs?: string | null } = {}, store: PlanStore = local()): Plans | null {
  const p = readPlans(store);
  if (p.plans.length >= MAX_PLANS) return null;
  const src = opts.copyOf ? p.plans.find((x) => x.id === opts.copyOf) : undefined;
  const plan: Plan = {
    id: newId(p),
    name: uniqueName(p, opts.name ?? nextName(p)),
    cart: src ? src.cart : encodeCart(decodeCart(opts.cart ?? "")),
    prefs: src ? src.prefs : (opts.prefs ?? null),
  };
  const next = { active: plan.id, plans: [...p.plans, plan] };
  save(store, next);
  setLive(store, plan);
  notify(true);
  return next;
}

export function renamePlan(id: string, name: string, store: PlanStore = local()): Plans {
  const p = readPlans(store);
  if (!cleanName(name) || !p.plans.some((x) => x.id === id)) return p;
  const next = { ...p, plans: p.plans.map((x) => (x.id === id ? { ...x, name: uniqueName(p, name, id) } : x)) };
  save(store, next);
  notify(false);
  return next;
}

export type Deleted = { plan: Plan; index: number; wasActive: boolean };

/** Delete a plan (never the last one). Deleting the active plan opens its neighbour. `deleted` is for undo. */
export function deletePlan(id: string, store: PlanStore = local()): { plans: Plans; deleted: Deleted } | null {
  const p = readPlans(store);
  const index = p.plans.findIndex((x) => x.id === id);
  if (index < 0 || p.plans.length < 2) return null;
  const plans = p.plans.filter((x) => x.id !== id);
  const wasActive = id === p.active;
  const next = { active: wasActive ? plans[Math.min(index, plans.length - 1)].id : p.active, plans };
  save(store, next);
  if (wasActive) setLive(store, activePlan(next));
  notify(wasActive);
  return { plans: next, deleted: { plan: p.plans[index], index, wasActive } };
}

/** Undo a delete: the plan comes back where it was, and active again if it was. Null when there's no room. */
export function restorePlan(d: Deleted, store: PlanStore = local()): Plans | null {
  const p = readPlans(store);
  if (p.plans.length >= MAX_PLANS) return null;
  const plan = { ...d.plan, id: p.plans.some((x) => x.id === d.plan.id) ? newId(p) : d.plan.id, name: uniqueName(p, d.plan.name) };
  const next = { active: d.wasActive ? plan.id : p.active, plans: [...p.plans.slice(0, d.index), plan, ...p.plans.slice(d.index)] };
  save(store, next);
  if (d.wasActive) setLive(store, plan);
  notify(d.wasActive);
  return next;
}

export type LinkOutcome =
  /** the link is the active plan */
  | { kind: "same" }
  /** the active plan had no courses, so the link's went into it */
  | { kind: "filled" }
  /** the link is another saved plan, which is now active */
  | { kind: "switched"; plan: Plan }
  /** the link opened as a new plan; `from` was active before */
  | { kind: "created"; plan: Plan; from: Plan }
  /** there are MAX_PLANS already: the link is shown without being saved */
  | { kind: "full" };

/**
 * Open a share link without overwriting a saved plan (#117). `linkPrefs` is the link's query string, or null when it
 * has no must-have parameters (then a plan's own apply); `name` is its plan name (`pn`), if any.
 */
export function openLink(cart: CartItem[], linkPrefs: string | null, name: string | null, store: PlanStore = local()): LinkOutcome {
  const p = readPlans(store);
  const enc = encodeCart(cart);
  const rules = linkPrefs === null ? null : normPrefs(linkPrefs);
  const matches = (x: Plan) => x.cart === enc && (rules === null || normPrefs(x.prefs) === rules);
  const active = activePlan(p);
  if (matches(active)) return { kind: "same" };
  const other = p.plans.find((x) => x.id !== active.id && matches(x));
  if (other) {
    switchPlan(other.id, store);
    return { kind: "switched", plan: other };
  }
  const named = name && cleanName(name) ? cleanName(name) : null;
  if (!active.cart) {
    const filled = { ...active, cart: enc, prefs: rules ?? active.prefs, name: named ? uniqueName(p, named, active.id) : active.name };
    save(store, { ...p, plans: p.plans.map((x) => (x.id === active.id ? filled : x)) });
    setLive(store, filled);
    notify(true);
    return { kind: "filled" };
  }
  const made = createPlan({ name: named ?? "Shared plan", cart: enc, prefs: rules }, store);
  return made ? { kind: "created", plan: activePlan(made), from: active } : { kind: "full" };
}

// --------------------------------------------------------------------------------------------------------------
// Comparing plans (#119)
// --------------------------------------------------------------------------------------------------------------

const PLURAL: Record<string, string> = { Mon: "Mondays", Tue: "Tuesdays", Wed: "Wednesdays", Thu: "Thursdays", Fri: "Fridays" };
/** "Mondays", "Mondays and Fridays", "Mondays, Wednesdays and Fridays" */
const days = (list: string[]) => {
  const w = list.map((d) => PLURAL[d] ?? d);
  return w.length > 1 ? `${w.slice(0, -1).join(", ")} and ${w.at(-1)}` : (w[0] ?? "");
};

/** "at 2pm MWF", or "with no set time" for an online or arranged section. */
function when(s: Section): string {
  const m = s.meetings.find((x) => x.s !== null);
  return m ? `at ${fmtTime(m.s).replace(":00", "")} ${daysStr(m.d)}` : "with no set time";
}

/**
 * What one plan's best schedule does differently from another's, in a few words: "CS 225 at 2pm MWF", "adds STAT
 * 107", "without CHEM 102", "Fridays off", "class on Mondays". Empty when it's the same schedule.
 */
export function planDifferences(base: Schedule, other: Schedule): string[] {
  const out: string[] = [];
  const before = new Map(base.bundles.map((b) => [b.course, b]));
  for (const b of other.bundles) {
    const was = before.get(b.course);
    if (!was) out.push(`adds ${b.course}`);
    else if ([...was.crns].sort().join() !== [...b.crns].sort().join()) {
      const moved = b.sections.find((s) => {
        const old = was.sections.find((x) => x.component === s.component);
        return !old || when(old) !== when(s);
      });
      out.push(moved ? `${b.course}${moved.component === "primary" ? "" : ` ${componentName(moved.component)}`} ${when(moved)}` : `${b.course} ${b.sections.map((s) => s.code).join(" + ")}, same times`);
    }
  }
  for (const b of base.bundles) if (!other.bundles.some((x) => x.course === b.course)) out.push(`without ${b.course}`);
  const off = other.stats.daysOff.filter((d) => !base.stats.daysOff.includes(d));
  const on = base.stats.daysOff.filter((d) => !other.stats.daysOff.includes(d));
  if (off.length) out.push(`${days(off)} off`);
  if (on.length) out.push(`class on ${days(on)}`);
  return out;
}

/** "illini-schedule-2027-sp-plan-b.ics": each plan's calendar file has its name (#118); the first plan's keeps the old name. */
export function icsFileName(term: string, planName: string | null): string {
  const slug = (planName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `illini-schedule-${term}${slug && slug !== "plan-a" ? `-${slug}` : ""}.ics`;
}
