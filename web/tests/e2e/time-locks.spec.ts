import { expect, test } from "@playwright/test";

// Time locks (#139): keep a course at a time, in whichever section meets then.
test("set a time lock: every schedule has the course at that time, and the share link carries it", async ({ page }) => {
  await page.goto("./schedule/?c=STAT107,RHET105&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();

  const keep = page.getByRole("button", { name: /^Keep (STAT 107|RHET 105) at .+, any section$/ }).first();
  test.skip((await keep.count()) === 0, "no two sections share a time in this build");
  const label = (await keep.getAttribute("aria-label"))!;
  const [, course, time, days] = label.match(/^Keep (\S+ \d+) at (\S+) (\S+), any section$/)!;
  await keep.click();
  await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/%40\d+-\d+/);

  const rows = page.getByTestId("schedule-sections").locator("li").filter({ hasText: course });
  const n = Math.min(5, Number((await page.getByText(/Schedule \d+ of \d+/).textContent())!.match(/of (\d+)/)![1]));
  for (let i = 0; i < n; i++) {
    await expect(rows.filter({ hasText: `${days} ${time}` }).first()).toBeVisible();
    if (i < n - 1) await page.getByRole("button", { name: "Next schedule" }).click();
  }

  await page.reload();
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Unlock all" }).click();
  await expect(page).not.toHaveURL(/%40/);
});
