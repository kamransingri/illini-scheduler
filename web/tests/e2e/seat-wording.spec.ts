import { expect, test } from "@playwright/test";

// Seat changes in one wording, and Just opened's one Show control (#242). The daily feed is replaced with three changes.
test("Just opened: one Show control, Closings too and the search box, with one wording for each change", async ({ page }) => {
  const at = new Date().toISOString();
  const ev = (s: string, n: string, code: string, crn: string, old: string, now: string) => ({ term: "2027-sp", at, crn, s, n, code, old, new: now, t: `${s} ${n} test` });
  const events = [
    ev("CS", "124", "AL1", "91001", "Closed", "Open"),
    ev("STAT", "107", "AL2", "91002", "Closed", "Open (Restricted)"),
    ev("STAT", "107", "AL3", "91003", "Open", "Closed"),
  ];
  await page.route("**/data/seat-events.json", (r) => r.fulfill({ json: events }));
  await page.route("https://raw.githubusercontent.com/**", (r) => r.fulfill({ status: 404, body: "" }));
  await page.addInitScript(() => localStorage.setItem("illini-scheduler:cart:v1", "STAT107"));
  await page.goto("./opened/");

  const show = page.getByTestId("opened-show");
  const list = page.getByTestId("opened-list").locator("li");
  await expect(show.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  await expect(list).toHaveCount(2);
  await expect(list.filter({ hasText: "CS 124" })).toContainText("AL1 Opened");
  await expect(list.filter({ hasText: "STAT 107" })).toContainText("AL2 Opened, restricted");

  await page.getByLabel("Closings too").check();
  await expect(list).toHaveCount(3);
  await expect(list.filter({ hasText: "AL3" })).toContainText("AL3 Closed");

  await show.getByRole("button", { name: /^My schedule/ }).click();
  await expect(show.getByRole("button", { name: /^My schedule/ })).toHaveAttribute("aria-pressed", "true");
  await expect(list).toHaveCount(2);
  for (const t of await list.allTextContents()) expect(t).toContain("STAT 107");

  await show.getByRole("button", { name: "Watched" }).click();
  await expect(list).toHaveCount(0);
  await expect(page.getByText(/You aren't watching any sections yet/)).toBeVisible();

  await show.getByRole("button", { name: "All" }).click();
  await page.getByLabel("Filter by subject or course").fill("CS 124");
  await expect(list).toHaveCount(1);

  // ?mine=1 and ?watch=1 still pick the matching Show option
  await page.goto("./opened/?mine=1");
  await expect(show.getByRole("button", { name: /^My schedule/ })).toHaveAttribute("aria-pressed", "true");
  await page.goto("./opened/?watch=1");
  await expect(show.getByRole("button", { name: "Watched" })).toHaveAttribute("aria-pressed", "true");
});

test("home: Live openings words each change the same way and links to all openings", async ({ page }) => {
  const at = new Date().toISOString();
  await page.route("**/data/seat-events.json", (r) =>
    r.fulfill({ json: [{ term: "2027-sp", at, crn: "91002", s: "STAT", n: "107", code: "AL2", old: "Closed", new: "Open (Restricted)", t: "Test" }] }),
  );
  await page.route("https://raw.githubusercontent.com/**", (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("./");
  await expect(page.getByText(/^Opened, restricted, found/)).toBeVisible();
  await expect(page.getByRole("link", { name: "All openings" })).toHaveAttribute("href", /\/opened\/$/);
});
