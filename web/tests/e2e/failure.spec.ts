import { expect, test } from "@playwright/test";

test("course details unreachable: clear message, summary still shown", async ({ page }) => {
  await page.route("**/data/course/**", (r) => r.abort());
  await page.goto("./course/CS/124/");
  await expect(page.getByText(/Couldn't load section and professor details/)).toBeVisible();
  await expect(page.getByText("Before you register")).toBeVisible();
});

test("search index unreachable: clear message", async ({ page }) => {
  await page.route("**/data/search.json", (r) => r.abort());
  await page.goto("./");
  await expect(page.getByText(/Search data couldn't load/)).toBeVisible();
});

test("gen-ed list unreachable: clear message", async ({ page }) => {
  await page.route("**/data/geneds.json", (r) => r.abort());
  await page.goto("./geneds/");
  await expect(page.getByText(/Couldn't load the gen-ed list/)).toBeVisible();
});

test("every professor row has RMP data or says why not, and its panel links to RMP", async ({ page }) => {
  await page.goto("./course/MATH/221/");
  const rows = page.getByTestId("prof-row");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    await expect(row).toContainText(/\d ratings|No RMP match|RMP unavailable in this build|no ratings yet/);
    await row.getByRole("button", { expanded: false }).first().click();
    await expect(row).toContainText(/Rate My Professors page|RMP unavailable in this build|Search Rate My Professors/);
  }
});

test("unknown course is a 404, not a blank page", async ({ page }) => {
  const r = await page.goto("./course/ZZZ/999/");
  expect(r?.status()).toBe(404);
  await expect(page.locator("body")).toContainText(/404|could not be found/i);
});
