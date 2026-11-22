import { expect, test, type Page } from "@playwright/test";

// Term tabs (#140). STAT 107 is served with Spring 2027 sections only, so it's a spring-only course whatever the
// build's data. This term is Fall 2026; Summer 2027 and Fall 2027 aren't published in the test data.
async function springOnly(page: Page, path: string) {
  await page.route(`**/data/course/${path}.json`, async (route) => {
    const course = await (await route.fetch()).json();
    for (const t of Object.keys(course.terms)) if (t !== "2027-sp") delete course.terms[t];
    await route.fulfill({ json: course });
  });
}
const tab = (page: Page, name: string) => page.getByRole("tablist", { name: "Term" }).locator("visible=true").getByRole("tab", { name, exact: true });

test("a course offered only in spring shows four tabs, with Fall 2027 disabled and Fall 2026 not offered", async ({ page }) => {
  await springOnly(page, "STAT/107");
  await page.goto("./course/STAT/107/");
  const tabs = page.getByRole("tablist", { name: "Term" }).locator("visible=true").getByRole("tab");
  await expect(tabs).toHaveText(["Fall 2026", "Spring 2027", "Summer 2027", "Fall 2027"]);
  await expect(tab(page, "Spring 2027")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Fall 2027")).toHaveAttribute("aria-disabled", "true");
  await expect(tab(page, "Fall 2026")).toHaveAttribute("data-state", "none");
  await expect(page.getByTestId("term-notes")).toContainText("Fall 2027 sections aren't out yet. Course Explorer usually posts them in March.");

  await tab(page, "Fall 2027").click({ force: true });
  await expect(tab(page, "Spring 2027")).toHaveAttribute("aria-selected", "true"); // disabled: nothing happens
  await tab(page, "Fall 2026").click();
  await expect(page.getByRole("heading", { name: "Sections in Fall 2026" })).toBeVisible();
  await expect(page.locator("#sections")).toContainText("Not offered in Fall 2026");
});

test("arrow keys move between the tabs that can be opened, and the summer tab shows the summer line", async ({ page }) => {
  await springOnly(page, "CS/124");
  await page.goto("./course/CS/124/");
  await tab(page, "Spring 2027").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "Summer 2027")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Summer 2027")).toBeFocused();
  const summer = await tab(page, "Summer 2027").getAttribute("data-state");
  if (summer === "summer") await expect(page.getByTestId("summer-tab")).toHaveText(await page.getByTestId("summer-line").innerText());
  else await expect(page.locator("#sections")).toContainText("Not offered in Summer 2027");
  await page.keyboard.press("ArrowRight"); // Fall 2027 isn't published: skipped, wrapping round to Fall 2026
  await expect(tab(page, "Fall 2026")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(tab(page, "Summer 2027")).toHaveAttribute("aria-selected", "true");
});

test("375px: the tabs scroll inside their bar, not the page", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./course/STAT/107/");
  await expect(page.getByRole("tablist", { name: "Term" }).locator("visible=true").getByRole("tab")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
