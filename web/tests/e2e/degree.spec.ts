import { expect, test } from "@playwright/test";

const req = (page: import("@playwright/test").Page, id: string) => page.locator(`[data-group="${id}"]`);

test("adding a finished course updates the checklist and the URL", async ({ page }) => {
  await page.goto("./degree/");
  await expect(page.getByLabel("Program", { exact: true })).toHaveValue("finance-data-science"); // the only program is picked for you
  await expect(page.getByTestId("degree-progress")).toContainText("0 of 19");
  await page.getByLabel("Course code").fill("stat 107");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("my-courses")).toContainText("STAT 107");
  await expect(req(page, "ds-fundamentals")).toHaveAttribute("data-status", "partial");
  await expect(req(page, "qr")).toHaveAttribute("data-status", "partial");
  await expect(page).toHaveURL(/m=STAT107/);
  // a code the site doesn't know is refused with a reason
  await page.getByLabel("Course code").fill("ZZZ 999");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ZZZ 999" })).toContainText("ZZZ 999 isn't in the course data");
});

test("a shared checklist: done groups fold away, AP credit counts, gen-eds double count where the catalog allows", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science&m=ECON102,ECON103,STAT107,MATH220~c");
  const sbs = req(page, "sbs");
  await expect(sbs).toHaveAttribute("data-status", "done"); // ECON 102 + 103 also count as social science
  await expect(sbs.locator("[data-code]")).toHaveCount(0); // no options listed for a finished requirement
  await expect(req(page, "calculus")).toHaveAttribute("data-status", "done"); // AP credit
  await expect(req(page, "qr")).toHaveAttribute("data-status", "done");
  await expect(req(page, "business-core")).toContainText("ECON 102");
  // options that also fill another open requirement say so
  await expect(page.getByText(/^Also counts for /).first()).toBeVisible();
});

test("the language requirement is ticked by hand", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science");
  const lang = req(page, "language");
  await expect(lang).toHaveAttribute("data-status", "open");
  await lang.getByLabel("I've met this requirement").check();
  await expect(lang).toHaveAttribute("data-status", "done");
  await expect(page).toHaveURL(/x=language/);
});

test("Add to schedule from the checklist puts the course in the schedule builder", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science&m=STAT107");
  const row = req(page, "finance-required").locator("[data-code]").first();
  const code = (await row.getAttribute("data-code"))!;
  await row.getByRole("button", { name: "Add to schedule" }).click();
  await expect(row.getByRole("button", { name: "In schedule" })).toBeVisible();
  await page.goto("./schedule/");
  await expect(page.getByTestId("cart")).toContainText(code);
});

test("opening a shared checklist doesn't overwrite your own list", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science&m=CMN101");
  await expect(page.getByTestId("my-courses")).toContainText("CMN 101"); // saved as your own list
  await page.goto("./degree/?p=finance-data-science&m=ECON102,ECON103");
  await expect(page.getByText("You opened a shared checklist")).toBeVisible();
  await page.getByRole("button", { name: "Back to my list" }).click();
  await expect(page.getByTestId("my-courses")).toContainText("CMN 101");
  await expect(page.getByTestId("my-courses")).not.toContainText("ECON 102");
});

test("375px: the checklist doesn't scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./degree/?p=finance-data-science&m=STAT107,CMN101,ECON102,ECON103,BUS101,MATH220~c,MATH221~c,MATH234~c");
  await expect(page.getByTestId("degree-progress")).toBeVisible();
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
});

test("keyboard: type a course code and press Enter to add it", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science");
  await page.getByLabel("Course code").fill("CMN 101");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("my-courses")).toContainText("CMN 101");
  await expect(req(page, "business-core")).toHaveAttribute("data-status", "partial");
});
