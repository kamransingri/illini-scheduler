import { expect, test } from "@playwright/test";

// Locks 1 (#138): lock and unlock a class straight from the week calendar, and lock or free a whole schedule.
test("lock a class on the calendar: every schedule after that has it, and the share link carries the lock", async ({ page }) => {
  await page.goto("./schedule/?c=CS124,STAT107&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();

  const block = page.getByTestId("calendar-class").filter({ hasText: "STAT" }).first();
  const label = (await block.getAttribute("aria-label"))!;
  expect(label).toMatch(/^Lock STAT 107 \S+, (Mon|Tue|Wed|Thu|Fri) \d/);
  const code = label.match(/^Lock STAT 107 (\S+),/)![1];
  await block.focus();
  await page.keyboard.press("Enter");

  const locked = page.getByRole("button", { name: `Lock STAT 107 ${code}`, exact: true }); // the section list's button
  await expect(locked).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/STAT107%21\d{5}/);
  const onCalendar = page.getByTestId("calendar-class").filter({ hasText: code }).filter({ hasText: "STAT" }).first();
  await expect(onCalendar).toHaveAttribute("aria-pressed", "true");
  await expect(onCalendar).toHaveAttribute("aria-label", new RegExp(`^Unlock STAT 107 ${code},`));

  const n = Math.min(4, Number((await page.getByText(/Schedule \d+ of \d+/).textContent())!.match(/of (\d+)/)![1]));
  for (let i = 0; i < n; i++) {
    await expect(locked).toHaveAttribute("aria-pressed", "true");
    if (i < n - 1) await page.getByRole("button", { name: "Next schedule" }).click();
  }

  // unlock from the calendar again
  await page.getByTestId("calendar-class").filter({ hasText: code }).filter({ hasText: "STAT" }).first().click();
  await expect(locked).toHaveAttribute("aria-pressed", "false");
  await expect(page).not.toHaveURL(/STAT107%21/);
});

test("Lock this schedule locks every section on screen, and Unlock all frees them", async ({ page }) => {
  await page.goto("./schedule/?c=CS124,STAT107&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await page.getByRole("button", { name: "Next schedule" }).click();
  const rows = page.getByTestId("schedule-sections").locator("li");
  const before = await rows.allTextContents();

  await page.getByRole("button", { name: "Lock this schedule" }).click();
  await expect(page.getByText(/Schedule 1 of 1\b/)).toBeVisible(); // nothing left to choose
  expect(await rows.allTextContents()).toEqual(before);
  const lists = page.getByTestId("schedule-sections").getByRole("button", { name: /^Lock / });
  for (const b of await lists.all()) await expect(b).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Lock this schedule" })).toHaveCount(0);
  await expect(page).toHaveURL(/CS124%21/);
  await expect(page).toHaveURL(/STAT107%21/);

  await page.getByRole("button", { name: "Unlock all" }).click();
  for (const b of await lists.all()) await expect(b).toHaveAttribute("aria-pressed", "false");
  await expect(page).not.toHaveURL(/%21/);
  await expect(page.getByRole("button", { name: "Unlock all" })).toHaveCount(0);
});

test("375px: a tap on a class opens its details with a Lock button", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./schedule/?c=STAT107&t=2027-sp");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await page.getByTestId("calendar-class").first().click();
  const menu = page.getByTestId("calendar-menu");
  await expect(menu).toContainText("STAT 107");
  await menu.getByRole("button", { name: "Lock" }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId("calendar-class").first()).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
