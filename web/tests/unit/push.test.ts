import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertKey, isIos, keyBytes, PushError, pushSupport, readAlerts, setAlerts, stopAlerts, writeAlerts, type PushConfig } from "@/lib/push";

const CFG: PushConfig = { api: "https://alerts.example.test", vapid_public_key: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U" };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

let store: Record<string, string>;
function browser({ ua = CHROME, push = true, permission = "default" as NotificationPermission, standalone = false } = {}) {
  store = {};
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) },
    dispatchEvent: () => true,
    matchMedia: () => ({ matches: standalone }),
    ...(push ? { PushManager: class {} } : {}),
  });
  vi.stubGlobal("navigator", { userAgent: ua, platform: ua === IPHONE ? "iPhone" : "Win32", maxTouchPoints: ua === IPHONE ? 5 : 0, ...(push ? { serviceWorker: {} } : {}) });
  vi.stubGlobal("Notification", { permission, requestPermission: vi.fn(async () => "granted") });
}
afterEach(() => vi.unstubAllGlobals());

describe("what a browser can do with alerts", () => {
  it("is off without an alert server, and ready in a browser with Web Push", () => {
    browser();
    expect(pushSupport(null)).toBe("off");
    expect(pushSupport(CFG)).toBe("ready");
  });
  it("tells iPhone users to add it to the Home Screen, where push works", () => {
    browser({ ua: IPHONE, push: false });
    expect(pushSupport(CFG)).toBe("ios-install");
    browser({ ua: IPHONE, push: true, standalone: true });
    expect(pushSupport(CFG)).toBe("ready");
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", "MacIntel", 5)).toBe(true); // iPadOS
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", "MacIntel", 0)).toBe(false); // a Mac
  });
  it("says when push is missing or notifications are blocked", () => {
    browser({ push: false });
    expect(pushSupport(CFG)).toBe("unsupported");
    browser({ permission: "denied" });
    expect(pushSupport(CFG)).toBe("denied");
  });
});

describe("the alert list", () => {
  beforeEach(() => browser());
  it("keeps term-and-CRN keys and drops anything else", () => {
    writeAlerts([alertKey("2027-sp", "31152"), "2027-sp.31152", "junk", "2027-sp.123"]);
    expect(readAlerts()).toEqual(["2027-sp.31152"]);
  });
  it("decodes the VAPID key", () => {
    expect([...keyBytes(CFG.vapid_public_key)]).toEqual([...Buffer.from(CFG.vapid_public_key, "base64url")]);
    expect(keyBytes(CFG.vapid_public_key)).toHaveLength(65);
  });
});

describe("subscribing and unsubscribing", () => {
  const sub = { toJSON: () => ({ endpoint: "https://push.example.test/abc", keys: { p256dh: "P", auth: "A" }, expirationTime: null }), unsubscribe: vi.fn(async () => true) };
  let current: typeof sub | null;
  let pm: { getSubscription: () => Promise<typeof sub | null>; subscribe: ReturnType<typeof vi.fn> };
  let fetchFn: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    browser();
    current = null;
    pm = { getSubscription: async () => current, subscribe: vi.fn(async () => (current = sub)) };
    const reg = { pushManager: pm };
    Object.assign(navigator, { serviceWorker: { register: vi.fn(async () => reg), ready: Promise.resolve(reg), getRegistration: async () => reg } });
    fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchFn);
  });
  const sent = (i: number) => JSON.parse(fetchFn.mock.calls[i][1].body);

  it("asks once, subscribes, and sends only the push address and the sections", async () => {
    await setAlerts(CFG, ["2027-sp.31152"]);
    expect(Notification.requestPermission).toHaveBeenCalledOnce();
    expect(pm.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: keyBytes(CFG.vapid_public_key) });
    expect(fetchFn.mock.calls[0][0]).toBe("https://alerts.example.test/subscriptions");
    expect(sent(0)).toEqual({ endpoint: "https://push.example.test/abc", keys: { p256dh: "P", auth: "A" }, sections: ["2027-sp.31152"] });
    // a second section reuses the subscription and sends the whole list
    Object.assign(Notification, { permission: "granted" });
    await setAlerts(CFG, ["2027-sp.31152", "2027-sp.40001"]);
    expect(Notification.requestPermission).toHaveBeenCalledOnce();
    expect(pm.subscribe).toHaveBeenCalledOnce();
    expect(sent(1).sections).toEqual(["2027-sp.31152", "2027-sp.40001"]);
  });

  it("stopping sends an empty list, then drops the subscription", async () => {
    current = sub;
    await setAlerts(CFG, []);
    expect(sent(0)).toEqual({ endpoint: "https://push.example.test/abc", keys: { p256dh: "P", auth: "A" }, sections: [] });
    expect(sub.unsubscribe).toHaveBeenCalled();
    fetchFn.mockClear();
    current = null;
    await stopAlerts(CFG); // nothing subscribed: nothing to send
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does nothing when notifications are refused, and says so when the server fails", async () => {
    Object.assign(Notification, { requestPermission: vi.fn(async () => "denied") });
    await expect(setAlerts(CFG, ["2027-sp.31152"])).rejects.toMatchObject({ reason: "denied" });
    expect(pm.subscribe).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    Object.assign(Notification, { permission: "granted" });
    fetchFn.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const err = await setAlerts(CFG, ["2027-sp.31152"]).catch((e) => e);
    expect(err).toBeInstanceOf(PushError);
    expect(err).toMatchObject({ reason: "failed", message: expect.stringContaining("HTTP 500") });
  });
});
