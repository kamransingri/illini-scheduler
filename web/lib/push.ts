// Seat alerts with the site closed (#16, this part #90): Web Push. "Alert me" on a watched section asks for
// notification permission once, subscribes this browser with its push service, and sends the alert server (#91) the
// subscription and the sections to alert on: nothing else. The server pushes when one opens and public/sw.js shows it.
// public/push.json says where the server is; empty means alerts aren't set up and the page keeps its in-tab "Notify
// me". docs/PUSH.md has the server's side.

import { basePath } from "./format";
import { readWatch } from "./watch";

export type PushConfig = { api: string; vapid_public_key: string };
/** off: no alert server configured. ios-install: iPhone/iPad Safari tab, which gets push only from the Home Screen. */
export type PushSupport = "off" | "unsupported" | "ios-install" | "denied" | "ready";

const KEY = "illini-scheduler:alerts:v1";
const EVENT = "illini-alerts-change";

/** "2027-sp.31152": the term and CRN, all the server gets about a section. */
export const alertKey = (t: string, crn: string) => `${t}.${crn}`;
const VALID = /^\d{4}-(?:sp|su|fa|wi)\.\d{5}$/;

export function readAlerts(): string[] {
  try {
    return (window.localStorage.getItem(KEY) ?? "").split(",").filter((k) => VALID.test(k));
  } catch {
    return [];
  }
}

export function writeAlerts(keys: string[]): void {
  try {
    window.localStorage.setItem(KEY, [...new Set(keys)].join(","));
  } catch {
    /* storage unavailable: the server still has the list */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onAlertsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

let config: Promise<PushConfig | null> | null = null;
export function loadPushConfig(): Promise<PushConfig | null> {
  config ??= fetch(`${basePath()}/push.json`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((c: Partial<PushConfig> | null) => (c?.api && c.vapid_public_key ? { api: c.api.replace(/\/+$/, ""), vapid_public_key: c.vapid_public_key } : null))
    .catch(() => null);
  return config;
}

/** iPhone, iPod or iPad (iPadOS says it's a Mac but has a touch screen). */
export function isIos(ua: string, platform: string, touchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

/** What this browser can do with alerts, before asking anything. */
export function pushSupport(cfg: PushConfig | null): PushSupport {
  if (!cfg || typeof window === "undefined") return "off";
  const nav = navigator as Navigator & { standalone?: boolean };
  const installed = nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
  // Safari on iOS has Web Push only for sites added to the Home Screen (iOS 16.4 or later); in a tab it has no PushManager
  if (isIos(nav.userAgent, nav.platform, nav.maxTouchPoints ?? 0) && !installed) return "ios-install";
  if (!("serviceWorker" in nav) || !("PushManager" in window) || typeof Notification === "undefined") return "unsupported";
  return Notification.permission === "denied" ? "denied" : "ready";
}

export class PushError extends Error {
  constructor(
    readonly reason: "denied" | "failed",
    message: string,
  ) {
    super(message);
  }
}

/** The VAPID public key (base64url) as the bytes pushManager.subscribe wants. */
export function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(`${basePath()}/sw.js`, { scope: `${basePath()}/` });
  return navigator.serviceWorker.ready;
}

/** One request for everything: this subscription's sections become `sections`; an empty list removes it. */
async function send(cfg: PushConfig, sub: PushSubscription, sections: string[]): Promise<void> {
  const { endpoint, keys } = sub.toJSON();
  let res: Response;
  try {
    res = await fetch(`${cfg.api}/subscriptions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint, keys, sections }),
    });
  } catch {
    throw new PushError("failed", "Couldn't reach the alert server. Check your connection and try again.");
  }
  if (!res.ok) throw new PushError("failed", `The alert server didn't accept that (HTTP ${res.status}). Try again later.`);
}

/**
 * Alerts for exactly `sections` from now on. Asks for notification permission first (only while it's never been
 * answered, and still inside the click that called this, which Safari requires), then subscribes if needed.
 */
export async function setAlerts(cfg: PushConfig, sections: string[]): Promise<void> {
  if (!sections.length) return stopAlerts(cfg);
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new PushError("denied", "Notifications are blocked for this site in your browser settings.");
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.vapid_public_key) });
  } catch {
    throw new PushError("failed", "Your browser couldn't set up alerts. Try again, or use Notify me while this tab is open.");
  }
  await send(cfg, sub, sections);
}

/** No more alerts: the server forgets this browser, and the browser drops the subscription. */
export async function stopAlerts(cfg: PushConfig): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration(`${basePath()}/`);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await send(cfg, sub, []);
  await sub.unsubscribe();
}

/** Alerts only for sections still watched: stopping watching a section (anywhere) stops its alert on the server too. */
export async function pruneAlerts(): Promise<void> {
  const watched = new Set(readWatch().map((w) => alertKey(w.t, w.crn)));
  const now = readAlerts();
  const kept = now.filter((k) => watched.has(k));
  if (kept.length === now.length) return;
  const cfg = await loadPushConfig();
  if (!cfg) return;
  await setAlerts(cfg, kept);
  writeAlerts(kept);
}
