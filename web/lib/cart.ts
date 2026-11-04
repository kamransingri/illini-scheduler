// Cart: list of courses (with optional locked CRNs), stored in localStorage and encodable into the URL.

export type CartItem = { s: string; n: string; locked: string[] };

const KEY = "illini-scheduler:cart:v1";
const EVENT = "illini-cart-change";

export function encodeCart(items: CartItem[]): string {
  return items.map((i) => `${i.s}${i.n}${i.locked.length ? "!" + i.locked.join("!") : ""}`).join(",");
}

export function decodeCart(param: string | null | undefined): CartItem[] {
  if (!param) return [];
  const out: CartItem[] = [];
  for (const part of param.split(",")) {
    const [code, ...locked] = part.trim().split("!");
    const m = /^([A-Za-z]{2,5})(\d{3})$/.exec(code);
    if (!m) continue;
    const item = { s: m[1].toUpperCase(), n: m[2], locked: locked.filter((c) => /^\d{5}$/.test(c)) };
    if (!out.some((o) => o.s === item.s && o.n === item.n)) out.push(item);
  }
  return out;
}

export function readCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? decodeCart(raw) : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]): void {
  try {
    window.localStorage.setItem(KEY, encodeCart(items));
  } catch {
    /* storage unavailable: cart still lives in the URL */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(s: string, n: string): CartItem[] {
  const items = readCart();
  if (!items.some((i) => i.s === s && i.n === n)) items.push({ s, n, locked: [] });
  writeCart(items);
  return items;
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
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
