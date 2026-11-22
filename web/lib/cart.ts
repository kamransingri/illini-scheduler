// Cart: list of courses (with optional locked CRNs), stored in localStorage and encodable into the URL.

/** `locked`: CRNs every schedule must have. `at`: time locks (#139), "21-660" = MWF (days mask) at 11:00am (minutes):
 * one of the course's sections must meet then, whichever section it is. */
export type CartItem = { s: string; n: string; locked: string[]; at?: string[] };

const AT = /^(\d{1,3})-(\d{1,4})$/;
/** A time lock as days mask and start minute, or null when it can't be read. */
export function parseAt(v: string): { d: number; s: number } | null {
  const m = AT.exec(v);
  if (!m) return null;
  const d = Number(m[1]);
  const s = Number(m[2]);
  return d > 0 && d < 128 && s < 1440 ? { d, s } : null;
}

/** The active plan's courses (lib/plans.ts keeps the other plans). */
export const CART_KEY = "illini-scheduler:cart:v1";
export const CART_EVENT = "illini-cart-change";

export function encodeCart(items: CartItem[]): string {
  return items.map((i) => `${i.s}${i.n}${i.locked.length ? "!" + i.locked.join("!") : ""}${i.at?.length ? "@" + i.at.join("@") : ""}`).join(",");
}

export function decodeCart(param: string | null | undefined): CartItem[] {
  if (!param) return [];
  const out: CartItem[] = [];
  for (const part of param.split(",")) {
    const [head, ...times] = part.trim().split("@");
    const [code, ...locked] = head.split("!");
    const m = /^([A-Za-z]{2,5})(\d{3})$/.exec(code);
    if (!m) continue;
    const at = [...new Set(times.filter((t) => parseAt(t)))];
    const item: CartItem = { s: m[1].toUpperCase(), n: m[2], locked: locked.filter((c) => /^\d{5}$/.test(c)), ...(at.length ? { at } : {}) };
    if (!out.some((o) => o.s === item.s && o.n === item.n)) out.push(item);
  }
  return out;
}

export function readCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    return raw ? decodeCart(raw) : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]): void {
  try {
    window.localStorage.setItem(CART_KEY, encodeCart(items));
  } catch {
    /* storage unavailable: cart still lives in the URL */
  }
  window.dispatchEvent(new Event(CART_EVENT));
}

/** Add a course; with `lock`, also pin that section (a CRN found by search), replacing the course's other locks. */
export function addToCart(s: string, n: string, lock?: string): CartItem[] {
  const items = readCart();
  const cur = items.find((i) => i.s === s && i.n === n);
  if (!cur) items.push({ s, n, locked: lock ? [lock] : [] });
  else if (lock) cur.locked = [lock];
  writeCart(items);
  return items;
}

export function isLocked(s: string, n: string, crn: string): boolean {
  return readCart().some((i) => i.s === s && i.n === n && i.locked.includes(crn));
}

export function removeFromCart(s: string, n: string): CartItem[] {
  const items = readCart().filter((i) => !(i.s === s && i.n === n));
  writeCart(items);
  return items;
}

export function inCart(s: string, n: string): boolean {
  return readCart().some((i) => i.s === s && i.n === n);
}

export function onCartChange(fn: () => void): () => void {
  window.addEventListener(CART_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(CART_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
