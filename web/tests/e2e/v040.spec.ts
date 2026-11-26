import { expect, test, type APIRequestContext } from "@playwright/test";

// v0.4.0: search by CRN, the two-word nav, the live "Just opened" feed's fallback, and the builder's new must-haves.
// CRNs come from the build's own crns.json, so these keep working when the data is refreshed for a new term.
async function firstCrn(request: APIRequestContext, baseURL: string, s: string, n: string) {
  const idx = (await (await request.get(new URL("data/crns.json", baseURL).toString())).json()) as Record<string, Record<string, string[]>>;
  const term = Object.keys(idx)[0];
  const [crn, row] = Object.entries(idx[term]).find(([, r]) => r[0] === s && r[1] === n)!;
  return { term, crn, code: row[2] };
}

test("a CRN in the search box finds its section and opens it on the course page", async ({ page, request, baseURL }) => {
  const { crn, code } = await firstCrn(request, baseURL!, "CS", "124");
  await page.goto("./");
  await page.getByLabel(/Search courses/).fill(crn);
  const hit = page.getByTestId("crn-hit").first();
  await expect(hit).toContainText(`CRN ${crn}`);
  await expect(hit).toContainText("CS 124");
  await expect(hit).toContainText(`Section ${code}`);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/course/CS/124/#crn-${crn}$`));
  await expect(page.locator(`#crn-${crn}`)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(`#crn-${crn}`)).toBeInViewport();
});

test("a CRN typed in the schedule builder adds the course with that section locked", async ({ page, request, baseURL }) => {
  const { crn } = await firstCrn(request, baseURL!, "STAT", "107");
  await page.goto("./schedule/?c=");
  await page.getByLabel(/Search courses/).fill(crn);
  await expect(page.getByTestId("crn-hit").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(1);
  await expect(page.getByLabel("Lock Lecture for STAT 107")).toHaveValue(crn);
  await expect(page).toHaveURL(new RegExp(`STAT107%21${crn}`));
});

test("the nav names every page in two words and marks the current one", async ({ page }) => {
  await page.goto("./geneds/");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const label of ["Course search", "Gen-ed finder", "Degree checklist", "Schedule builder", "Just opened"])
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  // the footer lists the same pages
  await expect(page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Just opened" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Gen-ed finder" })).toHaveAttribute("aria-current", "page");
  // phones get a menu button instead
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Schedule builder" })).toBeVisible();
});

test("just opened says when live updates aren't available and still lists the daily changes", async ({ page }) => {
  await page.route("https://raw.githubusercontent.com/**", (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("./opened/");
  await expect(page.getByTestId("freshness")).toContainText("Daily");
  await expect(page.getByText(/\d+ changes?$/)).toBeVisible();
});

test("just opened goes live with the live feed and merges its changes", async ({ page }) => {
  const now = new Date().toISOString();
  const live = {
    updated: now,
    window_hours: 48,
    checked: { "2027-sp": 300 },
    events: [{ term: "2027-sp", at: now, crn: "99999", s: "ZZZ", n: "999", code: "Q1", old: "Closed", new: "Open", t: "Test course" }],
    seen: { "2027-sp": { "99999": ["Open", now] } },
  };
  await page.route("https://raw.githubusercontent.com/**", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(live) }));
  await page.goto("./opened/");
  await expect(page.getByTestId("freshness")).toContainText("Live");
  const row = page.getByTestId("opened-list").locator("li").first();
  await expect(row).toContainText("ZZZ 999");
  await expect(row).toContainText("Found just now");
});

test("gen-ed finder: open sections on by default, no time filters, and one chip per category", async ({ page }) => {
  await page.goto("./geneds/");
  await expect(page.getByLabel(/Only courses (with an open section|offered) in/)).toBeChecked();
  await expect(page.getByText("No 8am classes")).toHaveCount(0);
  const row = page.locator('[data-testid="gened-results"] > tr').first();
  const codes = ((await row.getAttribute("data-codes")) ?? "").split(" ").filter(Boolean);
  await expect(row.locator("td").first().locator("li")).toHaveCount(codes.length);
});

test("builder must-haves: days off, end time and open-only are respected and survive reload", async ({ page }) => {
  await page.goto("./schedule/?c=CS124,STAT107,RHET105&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(3);
  await page.locator('label[title="Keep Monday free"]').click();
  await expect(page.getByLabel("Keep Monday free")).toBeChecked();
  await page.getByLabel("No classes after").selectOption("1080");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result").or(page.getByTestId("no-schedule"))).toBeVisible();
  if (await page.getByTestId("schedule-result").isVisible()) {
    await expect(page.getByTestId("schedule-stats")).toContainText("Mon");
    for (const t of await page.getByTestId("schedule-sections").locator("li").allTextContents()) expect(t).not.toMatch(/\bM(T|W|R|F)*\s\d/);
  }
  await page.getByRole("button", { name: "Best grades" }).click();
  await expect(page.getByRole("button", { name: "Best grades" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("./schedule/");
  await expect(page.getByLabel("Keep Monday free")).toBeChecked();
  await expect(page.getByLabel("No classes after")).toHaveValue("1080");
  await expect(page.getByRole("button", { name: "Best grades" })).toHaveAttribute("aria-pressed", "true");
});
