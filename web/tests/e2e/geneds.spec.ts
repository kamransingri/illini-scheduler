import { expect, test } from "@playwright/test";

test("one category + next term + sorted by GPA: rows sorted and all in that category", async ({ page }) => {
  await page.goto("./geneds/");
  await expect(page.getByText(/\d+ courses/)).toBeVisible();
  await page.getByText("Humanities: Hist & Phil", { exact: true }).first().click();
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
