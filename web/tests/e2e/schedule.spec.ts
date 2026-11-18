import { expect, test } from "@playwright/test";

async function addViaSearch(page: import("@playwright/test").Page, q: string) {
  const box = page.getByLabel(/Search courses/);
  await box.fill(q);
  const list = page.getByRole("listbox");
  await list.getByRole("button", { name: "Add to schedule" }).first().click();
  await box.fill("");
}

test("CS 124 + MATH 221 + RHET 105 + STAT 107, no 8am: no schedule has an 8am class", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./schedule/");
  await addViaSearch(page, "cs124");
  await addViaSearch(page, "rhet105");
  await addViaSearch(page, "stat107");
  // MATH 221 isn't offered in Spring 2027, so search shows no add button; add it through a shared link instead
  const url = new URL(page.url());
  url.searchParams.set("c", `${url.searchParams.get("c")},MATH221`);
  await page.goto(url.toString());
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(4);
  await expect(page.getByTestId("warnings")).toContainText("MATH 221 is not offered in Spring 2027");
  await page.getByLabel("No classes before").selectOption("540");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  await expect(page.getByTestId("summary")).toContainText("Expected GPA");
  const counter = await page.getByText(/Schedule 1 of \d+/).textContent();
  const n = Number(counter!.match(/of (\d+)/)![1]);
  expect(n).toBeGreaterThan(1);
  for (let i = 0; i < n; i++) {
    const starts = await page.getByTestId("schedule-sections").locator("li").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-start"))));
    for (const s of starts) expect(s).toBeGreaterThanOrEqual(540);
    if (i < n - 1) await page.getByRole("button", { name: "Next schedule" }).click();
  }
  // export: .ics download works
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .ics" }).click()]);
  expect(dl.suggestedFilename()).toBe("illini-schedule-2027-sp.ics");
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
  expect(errors).toEqual([]);
});

test("cart survives reload and the URL is shareable", async ({ page }) => {
  await page.goto("./schedule/?c=CS124,STAT107&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.goto("./schedule/");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await expect(page).toHaveURL(/c=CS124%2CSTAT107/); // the URL is written just after the list renders
});

test("6-course cart generates quickly in the browser", async ({ page }) => {
  await page.goto("./schedule/?c=PHYS211,RHET105,CHEM102,MATH231,CS124,ECON102&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Generate schedules" })).toBeEnabled();
  await page.waitForTimeout(500);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(2000);
});

test("empty cart shows guidance, not a blank page", async ({ page }) => {
  await page.goto("./schedule/?c=");
  await expect(page.getByText("Your cart is empty")).toBeVisible();
});

test("sections to watch: a schedule that needs closed sections lists them and links to Just opened (#27)", async ({ page }) => {
  // every STAT 107 section closed, as after a busy registration day
  await page.route("**/data/course/STAT/107.json", async (route) => {
    const course = await (await route.fetch()).json();
    for (const t of Object.values(course.terms) as { sections: { status: string }[] }[]) for (const s of t.sections) s.status = "Closed";
    await route.fulfill({ json: course });
  });
  await page.goto("./schedule/?c=STAT107,RHET105&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  const watch = page.getByTestId("watch-list");
  await expect(watch).toBeVisible();
  await expect(watch).toContainText(/needs (a section that was|\d+ sections that were) Closed/);
  const rows = watch.locator("li");
  expect(await rows.count()).toBeGreaterThan(0);
  for (const t of await rows.allTextContents()) expect(t).toContain("STAT 107");
  await expect(watch.getByRole("link", { name: "Self-Service" })).toHaveAttribute("href", /^https:/);
  await watch.getByRole("link", { name: "Just opened" }).click();
  await expect(page).toHaveURL(/\/opened\/\?mine=1$/);
  await expect(page.getByLabel(/Only my schedule's courses/)).toBeChecked();
});
