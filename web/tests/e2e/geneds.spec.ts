import { expect, test } from "@playwright/test";

test("one category + next term + sorted by GPA: rows sorted and all in that category", async ({ page }) => {
  await page.goto("./geneds/");
  await expect(page.getByText(/\d+ courses/)).toBeVisible();
  await page.getByText("Humanities: Hist & Phil", { exact: true }).first().click();
  await page.getByLabel(/in Spring 2027/).check();
  await page.getByLabel("Sort by").selectOption("gpa");
  const rows = page.locator('[data-testid="gened-results"] > li');
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
