import { expect, test, type Page } from "@playwright/test";

// Four-year plan (#114): terms from the next one to graduation, courses in each, hours per term, the term each
// requirement is finished in, and the plan in the share link.
const term = (page: Page, name: string) => page.getByTestId("plan-term").filter({ has: page.getByRole("heading", { name }) });
const req = (page: Page, id: string) => page.locator(`[data-group="${id}"]`).first();

async function addTo(page: Page, name: string, code: string) {
  const box = page.getByLabel(`Add a course to ${name}`);
  await box.fill(code);
  await box.press("Enter");
}

test("plan the terms to graduation: hours per term, when each requirement is finished, and the share link", async ({ page, browser, baseURL }) => {
  await page.goto("./degree/?p=finance-data-science&m=MATH220~c");
  const plan = page.getByTestId("plan");
  await expect(plan.getByTestId("plan-term")).toHaveCount(0); // nothing until a graduation term is chosen
  await plan.getByLabel("Expected graduation").selectOption({ label: "Spring 2029" });
  await expect(plan.getByTestId("plan-term")).toHaveCount(5); // Spring 2027 to Spring 2029, no summers
  await expect(plan.getByTestId("plan-term").first()).toHaveAttribute("data-term", "2027-sp");

  await addTo(page, "Fall 2027", "math 257");
  await addTo(page, "Spring 2028", "IS 467");
  await addTo(page, "Fall 2028", "IS 477");
  await expect(term(page, "Fall 2027").getByTestId("term-hours")).toHaveText("3 hours");
  await expect(term(page, "Spring 2028").getByTestId("term-hours")).toHaveText("3+ hours"); // 3 to 4 credit hours
  await expect(term(page, "Spring 2029").getByTestId("term-hours")).toHaveText("No courses yet");

  await expect(req(page, "linear-algebra").getByTestId("finish-term")).toHaveText("Finished in Fall 2027 in your plan");
  await expect(req(page, "social-impact").getByTestId("finish-term")).toHaveText("Finished in Fall 2028 in your plan");
  await expect(req(page, "capstone").getByTestId("finish-term")).toHaveText("Not finished in your plan");
  await expect(req(page, "calculus").getByTestId("finish-term")).toHaveCount(0); // already met by My courses

  // a course can't be planned twice, or planned when it's already done
  await addTo(page, "Spring 2029", "MATH 257");
  await expect(term(page, "Spring 2029").getByRole("alert")).toHaveText("MATH 257 is already in Fall 2027. Use its Move to menu to move it.");
  await addTo(page, "Spring 2029", "MATH 220");
  await expect(term(page, "Spring 2029").getByRole("alert")).toHaveText("MATH 220 is already in My courses.");

  // the link carries the plan: open it in a new browser
  await expect(page).toHaveURL(/g=2029-sp/);
  await expect(page).toHaveURL(/pl=2027-fa\.MATH257_2028-sp\.IS467_2028-fa\.IS477/);
  const other = await browser.newPage();
  await other.goto(new URL(page.url().replace(/^.*?\/degree\//, "degree/"), baseURL).toString());
  await expect(other.getByTestId("plan-term")).toHaveCount(5);
  await expect(other.locator('[data-group="social-impact"]').first().getByTestId("finish-term")).toHaveText("Finished in Fall 2028 in your plan");
  await other.close();

  // remove a course; summers add their terms
  await term(page, "Fall 2028").getByRole("button", { name: "Remove IS 477 from Fall 2028" }).click();
  await expect(req(page, "social-impact").getByTestId("finish-term")).toHaveText("Not finished in your plan");
  await plan.getByLabel("Summer terms").check();
  await expect(plan.getByTestId("plan-term")).toHaveCount(7);
  await page.reload();
  await expect(plan.getByTestId("plan-term")).toHaveCount(7); // saved in the browser
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
});

test("375px: the plan doesn't scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./degree/?p=finance-data-science&g=2029-sp&pl=2027-fa.MATH257.CS277_2028-sp.IS467");
  await expect(page.getByTestId("plan-term")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
