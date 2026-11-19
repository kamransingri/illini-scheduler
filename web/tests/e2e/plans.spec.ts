import { expect, test, type Page } from "@playwright/test";

// Named schedules (#26): several plans, each with its own courses, must-haves, share link and calendar file.

async function addViaSearch(page: Page, q: string) {
  const box = page.getByLabel(/Search courses/);
  await box.fill(q);
  await page.getByRole("listbox").getByRole("button", { name: "Add to schedule" }).first().click();
  await box.fill("");
}

const plan = (page: Page, name: RegExp) => page.getByRole("group", { name: "Open a plan" }).getByRole("button", { name });
const cart = (page: Page) => page.getByTestId("cart");

/** Plan A with CS 124 and STAT 100; Plan B, a copy, with PSYC 100 instead of STAT 100 and Fridays free. */
async function twoPlans(page: Page) {
  await page.goto("./schedule/?c=CS124,STAT100&t=2027-sp");
  await expect(cart(page).locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Duplicate Plan A" }).click();
  await expect(plan(page, /^Plan B/)).toHaveAttribute("aria-pressed", "true");
  await expect(cart(page).locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Remove STAT 100" }).click();
  await addViaSearch(page, "psyc100");
  await expect(cart(page)).toContainText("PSYC 100");
  const must = page.getByRole("button", { name: "Must-haves" }); // folded on a phone
  if ((await must.getAttribute("aria-expanded")) === "false") await must.click();
  await page.locator('label[title="Keep Friday free"]').click();
}

test("two plans keep their own courses, rules, links and calendar files through switches and reloads (#118)", async ({ page }) => {
  await twoPlans(page);
  await page.getByRole("button", { name: "Rename Plan B" }).click();
  await page.getByLabel("New name for Plan B").fill("Plan B if STAT 100 fills");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(plan(page, /^Plan B if STAT 100 fills/)).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/pn=Plan\+B\+if\+STAT\+100\+fills/);
  await expect(page).toHaveURL(/c=CS124%2CPSYC100/);
  const linkB = page.url();

  await plan(page, /^Plan A/).click();
  await expect(cart(page)).toContainText("STAT 100");
  await expect(cart(page)).not.toContainText("PSYC 100");
  await expect(page.getByLabel("Keep Friday free")).not.toBeChecked();
  await expect(page).toHaveURL(/c=CS124%2CSTAT100/);
  await expect(page).not.toHaveURL(/pn=/);
  const linkA = page.url();

  await page.reload();
  await expect(plan(page, /^Plan A/)).toHaveAttribute("aria-pressed", "true");
  await expect(cart(page)).toContainText("STAT 100");

  await plan(page, /^Plan B/).click();
  await expect(cart(page)).toContainText("PSYC 100");
  await expect(page.getByLabel("Keep Friday free")).toBeChecked();
  await page.reload();
  await expect(plan(page, /^Plan B/)).toHaveAttribute("aria-pressed", "true");
  await expect(cart(page)).toContainText("PSYC 100");

  // each plan's calendar file has its name
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .ics" }).click()]);
  expect(dl.suggestedFilename()).toBe("illini-schedule-2027-sp-plan-b-if-stat-100-fills.ics");

  // a plan's own link opens that plan, not a copy
  await page.goto(linkA);
  await expect(page.getByTestId("plan-notice")).toContainText("This link is your plan “Plan A”");
  await expect(plan(page, /^Plan A/)).toHaveAttribute("aria-pressed", "true");
  await page.goto(linkB);
  await expect(plan(page, /^Plan B/)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Open a plan" }).getByRole("button")).toHaveCount(2);

  // delete, with undo
  await page.getByRole("button", { name: "Delete Plan B if STAT 100 fills" }).click();
  await expect(plan(page, /^Plan B/)).toHaveCount(0);
  await expect(cart(page)).toContainText("STAT 100");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(plan(page, /^Plan B/)).toHaveAttribute("aria-pressed", "true");
  await expect(cart(page)).toContainText("PSYC 100");
});

test("compare plans side by side: what differs, and picking one opens it (#119)", async ({ page }) => {
  await twoPlans(page);
  await page.getByRole("button", { name: "Compare plans" }).click();
  const box = page.getByTestId("plan-compare");
  await expect(box.locator("th[data-plan]")).toHaveCount(2);
  await expect(box.locator("th[data-plan]").getByText("Open now")).toBeVisible();
  // Plan A against the open Plan B: STAT 100 instead of PSYC 100, and class on Friday
  const diff = box.getByTestId("plan-diff").first();
  await expect(diff).toContainText("adds STAT 100");
  await expect(diff).toContainText("without PSYC 100");
  await expect(box.locator("td[data-differs]").first()).toBeVisible();
  await box.getByRole("button", { name: "Open Plan A" }).click();
  await expect(box).toHaveCount(0);
  await expect(plan(page, /^Plan A/)).toHaveAttribute("aria-pressed", "true");
  await expect(cart(page)).toContainText("STAT 100");
  await expect(page.getByTestId("schedule-result")).toBeVisible();
});

test("375px: the plan switcher and the comparison don't make the page scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await twoPlans(page);
  await page.getByRole("button", { name: "Compare plans" }).click();
  await expect(page.getByTestId("plan-compare").locator("th[data-plan]")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  // keyboard: the plans are buttons in order, and Enter opens one
  await plan(page, /^Plan A/).focus();
  await page.keyboard.press("Enter");
  await expect(plan(page, /^Plan A/)).toHaveAttribute("aria-pressed", "true");
});
