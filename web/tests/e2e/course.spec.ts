import { expect, test } from "@playwright/test";

test("search cs124 lands on CS 124 with sections, an instructor card and a GPA chart, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.getByLabel("Search courses or instructors").fill("cs124");
  await expect(page.getByRole("listbox")).toContainText("Introduction to Computer Science I");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/course\/CS\/124\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Introduction to Computer Science I");
  await expect(page.getByRole("heading", { name: "Sections" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Copy 71571/ })).toBeVisible();
  await expect(page.locator("#inst-h ~ ul > li").first()).toBeVisible();
  await expect(page.getByRole("img", { name: /Grade distribution and average GPA by term/ })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
  expect(errors).toEqual([]);
});

for (const path of ["/course/CS/124/", "/course/MATH/221/", "/course/STAT/107/", "/course/RHET/105/"]) {
  test(`no horizontal scroll at 375px: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Sections" })).toBeVisible();
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw);
    await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
  });
}

test("course not offered next term says so and shows the other term", async ({ page }) => {
  await page.goto("/course/MATH/221/");
  await expect(page.getByText("Not offered", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Fall 2026" })).toHaveAttribute("aria-selected", "true");
});

test("course with no GPA data says so", async ({ page }) => {
  await page.goto("/course/RHET/105/");
  await expect(page.getByText("No grade data", { exact: true })).toBeVisible();
});
