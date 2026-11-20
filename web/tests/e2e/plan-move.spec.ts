import { expect, test, type Page } from "@playwright/test";

// Four-year plan 2 (#115): drag a course from the checklist's options into a term and between terms, the same moves
// with a "Move to" menu (keyboard and screen readers), and the layout at 375px.
const PLAN = "./degree/?p=finance-data-science&g=2028-fa&pl=2027-fa.MATH257_2028-sp.IS467";
const term = (page: Page, t: string) => page.locator(`[data-testid="plan-term"][data-term="${t}"]`);
const course = (page: Page, t: string, code: string) => term(page, t).locator(`[data-testid="plan-course"][data-code="${code}"]`);
const finish = (page: Page, id: string) => page.locator(`[data-group="${id}"]`).first().getByTestId("finish-term");

test("drag a course between terms and from the requirements into a term", async ({ page }) => {
  await page.goto(PLAN);
  await expect(finish(page, "linear-algebra")).toHaveText("Finished in Fall 2027 in your plan");

  // between terms
  await course(page, "2027-fa", "MATH 257").dragTo(term(page, "2028-fa"));
  await expect(course(page, "2028-fa", "MATH 257")).toBeVisible();
  await expect(course(page, "2027-fa", "MATH 257")).toHaveCount(0);
  await expect(finish(page, "linear-algebra")).toHaveText("Finished in Fall 2028 in your plan");
  await expect(page.getByTestId("plan-said")).toHaveText("Moved MATH 257 from Fall 2027 to Fall 2028.");
  await expect(page).toHaveURL(/pl=2028-sp\.IS467_2028-fa\.MATH257/);

  // from a requirement's course options: IS 477 finishes Social impact with IS 467
  const option = page.locator('[data-group="social-impact"]').first().locator('[data-code="IS 477"]');
  await expect(option).toHaveAttribute("draggable", "true");
  // the option is far below the plan: a mouse drag would scroll mid-drag, so send the drag events themselves
  const data = await page.evaluateHandle(() => new DataTransfer());
  await option.dispatchEvent("dragstart", { dataTransfer: data });
  await term(page, "2027-fa").dispatchEvent("dragover", { dataTransfer: data });
  await term(page, "2027-fa").dispatchEvent("drop", { dataTransfer: data });
  await expect(course(page, "2027-fa", "IS 477")).toBeVisible();
  await expect(finish(page, "social-impact")).toHaveText("Finished in Spring 2028 in your plan");
  await expect(page.getByTestId("plan-said")).toHaveText("Added IS 477 to Fall 2027.");
});

test("the same move with the keyboard, using a course's Move to menu", async ({ page }) => {
  await page.goto(PLAN);
  const menu = page.getByLabel("Move IS 467 to another term");
  await menu.focus();
  await menu.selectOption({ label: "Spring 2027" }); // what pressing a key on a focused select does
  await expect(course(page, "2027-sp", "IS 467")).toBeVisible();
  await expect(course(page, "2028-sp", "IS 467")).toHaveCount(0);
  await expect(page.getByTestId("plan-said")).toHaveText("Moved IS 467 from Spring 2028 to Spring 2027.");
  // the menu offers every other term, and the course page link isn't a drag handle
  await expect(page.getByLabel("Move MATH 257 to another term").locator("option")).toHaveText(["Move to…", "Spring 2027", "Spring 2028", "Fall 2028"]);
  await expect(course(page, "2027-fa", "MATH 257").getByRole("link", { name: "MATH 257" })).toHaveAttribute("draggable", "false");
});

test("375px: terms stack, the Move to menu works, nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PLAN);
  await expect(page.getByTestId("plan-term")).toHaveCount(4);
  const boxes = await page.getByTestId("plan-term").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  expect(new Set(boxes).size).toBe(1); // one column
  await page.getByLabel("Move MATH 257 to another term").selectOption({ label: "Spring 2028" });
  await expect(course(page, "2028-sp", "MATH 257")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
