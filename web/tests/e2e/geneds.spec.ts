import { expect, test } from "@playwright/test";

test("one category + next term + sorted by GPA: rows sorted and all in that category", async ({ page }) => {
  await page.goto("./geneds/");
  await expect(page.getByText(/\d+ courses/)).toBeVisible();
  await page.getByText("Hist & Phil", { exact: true }).first().click();
  await page.getByTestId("more-filters-toggle").click();
  await page.getByLabel(/in Spring 2027/).check();
  await page.getByLabel("Sort by").selectOption("gpa");
  const rows = page.locator('[data-testid="gened-results"] > tr');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  expect(n).toBeGreaterThan(5);
  const gpas: number[] = [];
  for (let i = 0; i < n; i++) {
    const codes = (await rows.nth(i).getAttribute("data-codes")) ?? "";
    expect(codes.split(" ")).toContain("HP");
    const g = await rows.nth(i).getAttribute("data-gpa");
    if (g) gpas.push(Number(g));
    await expect(rows.nth(i)).not.toContainText("Not offered");
  }
  for (let i = 1; i < gpas.length; i++) expect(gpas[i]).toBeLessThanOrEqual(gpas[i - 1]);
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
});

test("picking several categories shows only courses that count for all of them, or nothing", async ({ page }) => {
  await page.goto("./geneds/?codes=HP,NW&min=0");
  const rows = page.locator('[data-testid="gened-results"] > tr');
  await expect(rows.first()).toBeVisible();
  for (const codes of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-codes") ?? ""))) {
    expect(codes.split(" ")).toEqual(expect.arrayContaining(["HP", "NW"]));
  }
  await page.goto("./geneds/?codes=ACP,QR1,LS&min=0");
  await expect(page.getByText(/No course counts for all of Advanced Composition, Quantitative Reasoning I, Life Sciences/)).toBeVisible();
  await expect(page.locator('[data-testid="gened-results"]')).toHaveCount(0);
});

test("375px: the gen-ed table scrolls inside its own box, not the page", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./geneds/?codes=HP,NW");
  await expect(page.locator('[data-testid="gened-results"] > tr').first()).toBeAttached();
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
});

test("the finder checks courses against the schedule builder's times and hands the picks back to it (#30)", async ({ page }) => {
  await page.goto("./geneds/");
  await expect(page.getByTestId("gened-times")).toContainText("Set a start time, end time or days off");
  await expect(page.locator('[data-testid="gened-results"] > tr[data-fit]')).toHaveCount(0);

  // must-haves set in the builder: nothing before 10am, Fridays free
  await page.goto("./schedule/");
  await page.getByLabel("No classes before").selectOption("600");
  await page.locator('label[title="Keep Friday free"]').click();
  await expect(page.getByLabel("Keep Friday free")).toBeChecked();

  await page.goto("./geneds/");
  const times = page.getByTestId("gened-times");
  await expect(times).toContainText("start 10:00am or later, Fri off");
  const rows = page.locator('[data-testid="gened-results"] > tr');
  await expect(rows.first()).toHaveAttribute("data-fit", /^(fits|times|special|closed)$/);
  const before = await rows.count();
  await page.getByTestId("more-filters-toggle").click();
  await times.getByLabel("Only courses that fit them").check();
  await expect(page).toHaveURL(/fit=1/);
  await expect(rows.first()).toBeVisible();
  for (const v of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-fit")))) expect(v).toBe("fits");
  expect(await rows.count()).toBeLessThanOrEqual(before);

  // add the top pick and open it in the builder, which keeps the must-haves and finds a schedule with them
  const code = ((await rows.first().locator("th a span").first().textContent()) ?? "").trim();
  await rows.first().getByRole("button", { name: `Add to schedule: ${code}` }).click();
  await page.getByTestId("gened-handoff").getByRole("link", { name: "Plan it in the schedule builder" }).click();
  await expect(page.getByTestId("cart")).toContainText(code);
  await expect(page.getByLabel("No classes before")).toHaveValue("600");
  await expect(page.getByLabel("Keep Friday free")).toBeChecked();
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  const sections = page.getByTestId("schedule-sections").locator("li");
  for (const start of await sections.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-start"))))) expect(start).toBeGreaterThanOrEqual(600);
  for (const t of await sections.locator("span.tnum").allTextContents()) expect(t).not.toMatch(/(^|; )[MTWR]*F /);
});

test("a fresh visit shows the term, categories, Double-dips only and sort; the rest is under More filters (#244)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./geneds/");
  await expect(page.getByText(/\d+ courses/)).toBeVisible();
  await expect(page.getByTestId("gened-term")).toBeVisible();
  await expect(page.getByText("Hist & Phil", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Double-dips only (2+ categories)")).toBeVisible();
  await expect(page.getByLabel("Sort by")).toBeVisible();
  const toggle = page.getByTestId("more-filters-toggle");
  await expect(toggle).toHaveText("More filters");
  await expect(page.getByTestId("more-filters")).toBeHidden();
  await expect(page.getByRole("button", { name: "Reset filters" })).toHaveCount(0);
  await toggle.click();
  await expect(page.getByLabel("Credit hours")).toBeVisible();
  await expect(page.getByTestId("gened-times")).toBeVisible();
});

test("a link with every filter set opens with them on, and More filters says how many (#244)", async ({ page }) => {
  await page.goto("./geneds/?codes=HP&dd=1&nx=0&min=0&cr=3&rmp=4");
  await expect(page.getByTestId("more-filters-toggle")).toContainText("4 on");
  await expect(page.getByLabel("Double-dips only (2+ categories)")).toBeChecked();
  await expect(page.getByLabel("Humanities: Hist & Phil")).toBeChecked();
  await page.getByTestId("more-filters-toggle").click();
  await expect(page.getByLabel(/Only courses (with an open section|offered) in/)).not.toBeChecked();
  await expect(page.getByLabel("Only GPA from 200+ students")).not.toBeChecked();
  await expect(page.getByLabel("Credit hours")).toHaveValue("3");
  await expect(page.getByLabel("Minimum RMP rating")).toHaveValue("4");
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByTestId("more-filters-toggle")).toHaveText("More filters");
  await expect(page).toHaveURL(/\/geneds\/$/);

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./geneds/?codes=HP&dd=1&cr=3");
  await expect(page.getByRole("button", { name: "Filters, 3 on" })).toBeVisible();
});
