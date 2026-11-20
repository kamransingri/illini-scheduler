import { expect, test, type Page } from "@playwright/test";

// Seat alerts with the site closed (#90). The browser's push service and the alert server (#91) are mocked: a fake
// PushManager records what the page does, and requests to the alert server are caught here.
const API = "https://alerts.example.test";
const KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const WATCH = "2027-sp.CS124.AL1.31152";

type Sent = { endpoint: string; keys: Record<string, string>; sections: string[] };

async function setUp(page: Page, { answer = "granted", configured = true, iphone = false } = {}) {
  await page.addInitScript(
    ({ watch, answer, iphone }) => {
      if (!sessionStorage.getItem("mock-seeded")) {
        localStorage.setItem("illini-scheduler:watch:v1", watch);
        sessionStorage.setItem("mock-seeded", "1");
      }
      const log = { subscribed: 0, unsubscribed: 0, asked: 0 };
      (window as unknown as { pushLog: typeof log }).pushLog = log;
      const sub = {
        endpoint: "https://push.example.test/abc",
        toJSON: () => ({ endpoint: sub.endpoint, keys: { p256dh: "P", auth: "A" }, expirationTime: null }),
        unsubscribe: async () => {
          log.unsubscribed++;
          current = null;
          localStorage.removeItem("mock-push-sub");
          return true;
        },
      };
      // like a real browser, the subscription outlives a reload
      let current: typeof sub | null = localStorage.getItem("mock-push-sub") ? sub : null;
      const reg = {
        pushManager: {
          getSubscription: async () => current,
          subscribe: async () => {
            log.subscribed++;
            localStorage.setItem("mock-push-sub", "1");
            return (current = sub);
          },
        },
      };
      let permission = "default";
      const N = function () {} as unknown as { permission: string; requestPermission: () => Promise<string> };
      Object.defineProperty(N, "permission", { get: () => permission });
      N.requestPermission = async () => {
        log.asked++;
        return (permission = answer);
      };
      Object.defineProperty(window, "Notification", { value: N, configurable: true });
      Object.defineProperty(navigator, "serviceWorker", {
        value: { register: async () => reg, ready: Promise.resolve(reg), getRegistration: async () => reg },
        configurable: true,
      });
      if (iphone) {
        Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" });
        delete (window as { PushManager?: unknown }).PushManager;
      }
    },
    { watch: WATCH, answer, iphone },
  );
  await page.route("**/push.json", (r) => r.fulfill({ json: configured ? { api: API, vapid_public_key: KEY } : { api: "", vapid_public_key: "" } }));
  const sent: Sent[] = [];
  await page.route(`${API}/**`, async (r) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST" };
    if (r.request().method() === "POST") sent.push(r.request().postDataJSON());
    await r.fulfill({ status: 204, headers: cors });
  });
  return sent;
}

const pushLog = (page: Page) => page.evaluate(() => (window as unknown as { pushLog: { subscribed: number; unsubscribed: number; asked: number } }).pushLog);

test("Alert me subscribes and sends only the push address and the section; Stop all alerts unsubscribes (#90)", async ({ page }) => {
  const sent = await setUp(page);
  await page.goto("./opened/");
  const panel = page.getByTestId("watched");
  const bar = panel.getByTestId("alerts-bar");
  await expect(bar).toContainText("Alert me sends a notification when that section opens, even with the site closed.");
  await expect(bar.getByRole("button", { name: "What alerts send" })).toHaveAccessibleDescription(/push address .* term and CRN .* Nothing else: no name, email, account or other courses/);

  await panel.getByRole("button", { name: /^Alert me when CS 124 AL1, CRN 31152 opens$/ }).click();
  const on = panel.getByRole("button", { name: /^Stop alerts for CS 124 AL1, CRN 31152$/ });
  await expect(on).toHaveAttribute("aria-pressed", "true");
  await expect(on).toHaveText("Alert on");
  await expect(bar).toContainText("Alerts are on for 1 section");
  expect(sent).toEqual([{ endpoint: "https://push.example.test/abc", keys: { p256dh: "P", auth: "A" }, sections: ["2027-sp.31152"] }]);
  expect(await pushLog(page)).toEqual({ subscribed: 1, unsubscribed: 0, asked: 1 });

  // still on after a reload, without asking again
  await page.reload();
  await expect(panel.getByRole("button", { name: /^Stop alerts for CS 124/ })).toBeVisible();

  await bar.getByRole("button", { name: "Stop all alerts" }).click();
  await expect(panel.getByRole("button", { name: /^Alert me when CS 124/ })).toHaveAttribute("aria-pressed", "false");
  await expect(bar).not.toContainText("Alerts are on");
  expect(sent.at(-1)).toEqual({ endpoint: "https://push.example.test/abc", keys: { p256dh: "P", auth: "A" }, sections: [] });
  expect((await pushLog(page)).unsubscribed).toBe(1);
});

test("no longer watching a section stops its alert (#90)", async ({ page }) => {
  const sent = await setUp(page);
  await page.goto("./opened/");
  const panel = page.getByTestId("watched");
  await panel.getByRole("button", { name: /^Alert me when CS 124/ }).click();
  await expect(panel.getByRole("button", { name: /^Stop alerts for CS 124/ })).toBeVisible();
  await panel.getByRole("button", { name: /^Watching CS 124 AL1/ }).click();
  await expect(page.getByTestId("watched")).toHaveCount(0);
  await expect.poll(() => sent.at(-1)?.sections).toEqual([]);
  expect((await pushLog(page)).unsubscribed).toBe(1);
});

test("refusing notifications sends nothing and says how to allow them (#90)", async ({ page }) => {
  const sent = await setUp(page, { answer: "denied" });
  await page.goto("./opened/");
  const panel = page.getByTestId("watched");
  await panel.getByRole("button", { name: /^Alert me when CS 124/ }).click();
  await expect(panel.getByRole("alert")).toHaveText("Notifications are blocked for this site in your browser settings.");
  await expect(panel.getByRole("button", { name: /^Alert me when/ })).toHaveCount(0);
  expect(sent).toEqual([]);
  expect((await pushLog(page)).subscribed).toBe(0);
  await expect(page.getByRole("button", { name: "Notify me" })).toBeVisible(); // the in-tab notifications are still there
});

test("without an alert server nothing changes, and an iPhone tab is told about the Home Screen (#90)", async ({ page, browser, baseURL }) => {
  await setUp(page, { configured: false });
  await page.goto("./opened/");
  await expect(page.getByTestId("watched-row")).toHaveCount(1);
  await expect(page.getByTestId("alerts-bar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Alert me/ })).toHaveCount(0);

  const phone = await browser.newPage();
  await setUp(phone, { iphone: true });
  await phone.goto(new URL("opened/", baseURL).toString());
  await expect(phone.getByTestId("alerts-bar")).toContainText("tap Share, then Add to Home Screen");
  await expect(phone.getByRole("button", { name: /^Alert me/ })).toHaveCount(0);
  await phone.close();
});

test("the service worker and the manifest are served (#90)", async ({ request, baseURL }) => {
  const sw = await request.get(new URL("sw.js", baseURL).toString());
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain('addEventListener("push"');
  const manifest = await request.get(new URL("manifest.webmanifest", baseURL).toString());
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ name: "Illini Scheduler", display: "standalone" });
  const config = await request.get(new URL("push.json", baseURL).toString());
  expect(await config.json()).toEqual({ api: "", vapid_public_key: "" });
});
