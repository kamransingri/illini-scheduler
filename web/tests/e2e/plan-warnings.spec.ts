import { expect, test, type Page } from "@playwright/test";

// Four-year plan 3 (#116): a course placed in a term it doesn't usually run in, and a term's hours against the
// Registrar's limits. The offering patterns are set here (search.json `o`) so the test doesn't depend on real history.
const term = (page: Page, t: string) => page.locator(`[data-testid="plan-term"][data-term="${t}"]`);
const course = (page: Page, t: string, code: string) => term(page, t).locator(`[data-testid="plan-course"][data-code="${code}"]`);

test("a course in a term it doesn't usually run in is flagged, and the warning goes when it's moved", async ({ page }) => {
  await page.route("**/data/search.json", async (route) => {
    const res = await route.fetch();
    const data = await res.json();
    for (const c of data.courses) {
      if (c.s === "MATH" && c.n === "257") c.o = "f"; // fall only
      if (c.s === "IS" && c.n === "467") c.o = "f,s";
    }
    await route.fulfill({ response: res, json: data });
  });
  await page.goto("./degree/?p=finance-data-science&g=2028-fa&pl=2027-fa.ACCY201.ACCY202.FIN221.ECON102.ECON103.STAT207.CS277_2028-sp.MATH257.IS467");

  await expect(course(page, "2028-sp", "MATH 257").getByTestId("offering-warning")).toHaveText("Usually runs in fall only, not in Spring 2028.");
  await expect(course(page, "2028-sp", "IS 467").getByTestId("offering-warning")).toHaveCount(0);

  // hours: 23 in Fall 2027 is over the limit; 6 or 7 in Spring 2028 isn't full-time
  await expect(term(page, "2027-fa").locator('[data-testid="plan-hours-warning"][data-kind="over"]')).toContainText("over the 18-hour limit for Fall 2027");
  await expect(term(page, "2028-sp").locator('[data-testid="plan-hours-warning"]').first()).toContainText("full-time");
  await expect(term(page, "2028-fa").getByTestId("plan-hours-warning")).toHaveCount(0); // empty

  await page.getByLabel("Move MATH 257 to another term").selectOption({ label: "Fall 2028" });
  await expect(course(page, "2028-fa", "MATH 257")).toBeVisible();
  await expect(page.getByTestId("offering-warning")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
});
