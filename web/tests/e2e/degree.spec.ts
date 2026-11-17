import { expect, test } from "@playwright/test";

const req = (page: import("@playwright/test").Page, id: string) => page.locator(`[data-group="${id}"]`);

test("adding a finished course updates the checklist and the URL", async ({ page }) => {
  await page.goto("./degree/");
  const program = page.getByRole("combobox", { name: "Program" });
  await program.fill("finance data");
  await page.getByRole("option", { name: /^Finance \+ Data Science, BS/ }).click();
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
  await expect(page.getByTestId("degree-progress")).toBeVisible(); // course data loaded
  await page.getByLabel("Course code").fill("CMN 101");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("my-courses")).toContainText("CMN 101");
  await expect(req(page, "business-core")).toHaveAttribute("data-status", "partial");
});

test("programs imported from the catalog say so and show prose rules in the catalog's words", async ({ page }) => {
  await page.goto("./degree/?p=computer-science-bs");
  await expect(page.getByTestId("generated-note")).toContainText("Read automatically from the catalog page");
  await expect(page.getByRole("combobox", { name: "Program" })).toHaveValue("Computer Science, BS");
  const focus = page.locator('[data-group^="software-foundations"]');
  await expect(focus).toHaveAttribute("data-status", "open");
  await expect(focus.getByTestId("catalog-words")).toContainText("single focus area");
  await expect(focus.getByTestId("catalog-words").getByRole("link", { name: "CS 422" })).toBeVisible(); // a listed course links to its page
  await expect(page.locator('[data-group^="computer-science-technical-core"]')).toContainText(/more courses/);
});

test("the program picker searches all programs by name, acronym and college", async ({ page }) => {
  await page.goto("./degree/");
  const program = page.getByRole("combobox", { name: "Program" });
  const list = page.getByTestId("program-list");
  // focus shows every program, grouped by college
  await program.click();
  await expect(list.getByRole("group").first()).toBeVisible();
  expect(await list.getByRole("option").count()).toBeGreaterThan(100);
  // an acronym: the plain major first, then the CS + X programs
  await program.fill("cs");
  await expect(list.getByRole("option").first()).toContainText("Computer Science, BS");
  await expect(list.getByRole("option").filter({ hasText: "Computer Science +" }).first()).toBeVisible();
  // keyboard: Enter picks the highlighted program and the checklist loads
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/p=computer-science-bs/);
  await expect(program).toHaveValue("Computer Science, BS");
  await expect(page.getByText("The Grainger College of Engineering, 2026-2027 catalog", { exact: true })).toBeVisible();
  await expect(page.getByTestId("degree-progress")).toBeVisible();
  // nothing matches: say so; Escape puts the current program back
  await program.click();
  await program.fill("zzzz");
  await expect(page.getByText(/No program matches “zzzz”/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(program).toHaveValue("Computer Science, BS");
  // a college finds its programs; arrows move the highlight
  await program.fill("gies");
  await expect(list.getByRole("option").first()).toContainText("Gies College of Business");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL(/p=computer-science-bs/);
});

test("finished courses link to their professors, so students can rate them", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science&m=STAT107,CS124~p");
  const mine = page.getByTestId("my-courses");
  await expect(mine.getByRole("link", { name: "STAT 107" })).toHaveAttribute("href", /\/course\/STAT\/107\/#professors$/);
  await expect(mine).toContainText("CS 124");
  await expect(mine.getByRole("link", { name: "CS 124" })).toHaveCount(0); // in progress, not finished
  await expect(page.getByTestId("rate-hint")).toBeVisible();
});
