import { expect, test, type Page } from "@playwright/test";

// Named schedules (#26): several plans, each with its own courses, must-haves, share link and calendar file.

async function addViaSearch(page: Page, q: string) {
  const box = page.getByLabel(/Search courses/);
  await box.fill(q);
  await page.getByRole("listbox").getByRole("button", { name: "Add to schedule" }).first().click();
  await box.fill("");
}

const cart = (page: Page) => page.getByTestId("cart");
// One "Plan: name" control opens the plans and their actions (#240)
const toggle = (page: Page) => page.getByTestId("plan-menu-toggle");
async function menu(page: Page) {
  if ((await toggle(page).getAttribute("aria-expanded")) !== "true") await toggle(page).click();
  return page.getByTestId("plan-menu");
}
const openPlan = async (page: Page, name: RegExp) => (await menu(page)).getByRole("group", { name: "Open a plan" }).getByRole("button", { name }).click();
const act = async (page: Page, name: string) => (await menu(page)).getByRole("button", { name, exact: true }).click();
const planCount = (page: Page) => page.getByTestId("plan-menu").locator('[role="group"] button');

/** Plan A with CS 124 and STAT 100; Plan B, a copy, with PSYC 100 instead of STAT 100 and Fridays free. */
async function twoPlans(page: Page) {
  await page.goto("./schedule/?c=CS124,STAT100&t=2027-sp");
  await expect(cart(page).locator("li")).toHaveCount(2);
  await act(page, "Duplicate Plan A");
  await expect(toggle(page)).toContainText("Plan B");
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
  await act(page, "Rename Plan B");
  await page.getByLabel("New name for Plan B").fill("Plan B if STAT 100 fills");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(toggle(page)).toContainText("Plan B if STAT 100 fills");
  await expect(page).toHaveURL(/pn=Plan\+B\+if\+STAT\+100\+fills/);
  await expect(page).toHaveURL(/c=CS124%2CPSYC100/);
  const linkB = page.url();

  await openPlan(page, /^Plan A/);
  await expect(cart(page)).toContainText("STAT 100");
  await expect(cart(page)).not.toContainText("PSYC 100");
  await expect(page.getByLabel("Keep Friday free")).not.toBeChecked();
  await expect(page).toHaveURL(/c=CS124%2CSTAT100/);
  await expect(page).not.toHaveURL(/pn=/);
  const linkA = page.url();

  await page.reload();
  await expect(toggle(page)).toContainText("Plan A");
  await expect(cart(page)).toContainText("STAT 100");

  await openPlan(page, /^Plan B/);
  await expect(cart(page)).toContainText("PSYC 100");
  await expect(page.getByLabel("Keep Friday free")).toBeChecked();
  await page.reload();
  await expect(toggle(page)).toContainText("Plan B");
  await expect(cart(page)).toContainText("PSYC 100");

  // each plan's calendar file has its name
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .ics" }).click()]);
  expect(dl.suggestedFilename()).toBe("illini-schedule-2027-sp-plan-b-if-stat-100-fills.ics");

  // a plan's own link opens that plan, not a copy
  await page.goto(linkA);
  await expect(page.getByTestId("toast")).toContainText("This link is your plan “Plan A”"); // a toast, not a banner
  await expect(page.getByTestId("link-banner")).toHaveCount(0);
  await expect(toggle(page)).toContainText("Plan A");
  await page.goto(linkB);
  await expect(toggle(page)).toContainText("Plan B");
  await expect(planCount(page)).toHaveCount(2);

  // delete, with undo in a toast that goes away on its own
  await act(page, "Delete Plan B if STAT 100 fills");
  await expect(toggle(page)).toContainText("Plan A");
  await expect(planCount(page)).toHaveCount(1);
  await expect(cart(page)).toContainText("STAT 100");
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(toggle(page)).toContainText("Plan B");
  await expect(cart(page)).toContainText("PSYC 100");
  await act(page, "Delete Plan B if STAT 100 fills");
  await expect(page.getByTestId("toast")).toBeVisible();
  await expect(page.getByTestId("toast")).toHaveCount(0, { timeout: 12_000 });
});

test("compare plans side by side: what differs, and picking one opens it (#119)", async ({ page }) => {
  await twoPlans(page);
  await act(page, "Compare plans");
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
  await expect(toggle(page)).toContainText("Plan A");
  await expect(cart(page)).toContainText("STAT 100");
  await expect(page.getByTestId("schedule-result")).toBeVisible();
});

test("375px: the plan control is one line, and the comparison doesn't make the page scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await twoPlans(page);
  const box = await toggle(page).boundingBox();
  expect(box!.height).toBeLessThanOrEqual(44);
  await act(page, "Compare plans");
  await expect(page.getByTestId("plan-compare").locator("th[data-plan]")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  // keyboard: Enter opens the menu, the plans are buttons in order, Enter opens one, Escape closes it
  await toggle(page).focus();
  await page.keyboard.press("Enter");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(toggle(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByTestId("plan-menu").getByRole("button", { name: /^Plan A/ }).focus();
  await page.keyboard.press("Enter");
  await expect(toggle(page)).toContainText("Plan A");
  await expect(page.getByTestId("plan-menu")).toBeHidden();
});

test("a link with your plan's courses but other must-haves asks before changing anything (D40.2)", async ({ page }) => {
  await page.goto("./schedule/?c=CS124,STAT100&t=2027-sp&e=540");
  await expect(page.getByLabel("No classes before")).toHaveValue("540");
  // the same courses with another start time: shown, not saved, and no new plan
  await page.goto("./schedule/?c=CS124,STAT100&t=2027-sp&e=600&pn=Late+start");
  const ask = page.getByTestId("link-banner");
  await expect(ask).toHaveAttribute("data-kind", "rules");
  await expect(ask).toContainText("same courses as your plan “Plan A”");
  await expect(ask.getByRole("button")).toHaveCount(2); // one banner, two actions (#240)
  await ask.getByText("How they differ").click();
  await expect(ask).toContainText("The link's must-haves: start 10:00am or later");
  await expect(page.getByLabel("No classes before")).toHaveValue("600");
  await expect(planCount(page)).toHaveCount(1);
  await ask.getByRole("button", { name: "Keep Plan A's" }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.getByLabel("No classes before")).toHaveValue("540");

  await page.goto("./schedule/?c=CS124,STAT100&t=2027-sp&e=600&pn=Late+start");
  await page.getByTestId("link-banner").getByRole("button", { name: "Save as a new plan" }).click();
  await expect(toggle(page)).toContainText("Late start");
  await expect(page.getByLabel("No classes before")).toHaveValue("600");
  await openPlan(page, /^Plan A/);
  await expect(page.getByLabel("No classes before")).toHaveValue("540");

  // New plan is blank: no courses and the default must-haves
  await act(page, "New plan");
  await expect(toggle(page)).toContainText("Plan B");
  await expect(page.getByText("Your cart is empty")).toBeVisible();
  await expect(page.getByLabel("No classes before")).toHaveValue("");
});

test("with 10 plans already, each shared-link case is still one banner with two buttons (#240)", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("illini-scheduler:plans:v1")) return;
    const plans = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Plan ${i}`, cart: i ? "RHET105" : "CS124,STAT107", prefs: null }));
    localStorage.setItem("illini-scheduler:plans:v1", JSON.stringify({ active: "p0", plans }));
    localStorage.setItem("illini-scheduler:cart:v1", "CS124,STAT107");
  });
  // the same courses with other must-haves: no room for a new plan, so the link's rules can go into this one
  await page.goto("./schedule/?c=CS124,STAT107&t=2027-sp&e=600");
  let banner = page.getByTestId("link-banner");
  await expect(banner).toHaveAttribute("data-kind", "rules");
  await expect(banner.getByRole("button")).toHaveCount(2);
  await banner.getByRole("button", { name: "Use them in Plan 0" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("No classes before")).toHaveValue("600");

  // other courses: not saved as a plan, and two choices
  await page.goto("./schedule/?c=MATH221&t=2027-sp");
  banner = page.getByTestId("link-banner");
  await expect(banner).toHaveAttribute("data-kind", "full");
  await expect(banner.getByRole("button")).toHaveCount(2);
  await banner.getByRole("button", { name: "Back to my plan" }).click();
  await expect(page.getByTestId("cart")).toContainText("CS 124");
  await expect(page.getByTestId("link-banner")).toHaveCount(0);
});
