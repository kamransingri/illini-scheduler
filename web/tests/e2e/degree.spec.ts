import { expect, test } from "@playwright/test";

const req = (page: import("@playwright/test").Page, id: string) => page.locator(`[data-group="${id}"]`);

test("adding a finished course updates the checklist and the URL", async ({ page }) => {
  await page.goto("./degree/");
  const program = page.getByRole("combobox", { name: "Major", exact: true });
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

test("an Advanced Composition course also counts for its other gen-ed category, as campus policy allows (#18)", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science&m=HIST140"); // ACP, Historical & Philosophical and Western
  await expect(req(page, "acp")).toHaveAttribute("data-status", "done");
  await expect(req(page, "hum")).toHaveAttribute("data-status", "partial");
  await expect(req(page, "hum")).toContainText("HIST 140");
  await expect(req(page, "hum")).not.toContainText("isn't counted twice");
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
  await page.goto("./degree/?p=computer-engineering-bs");
  await expect(page.getByTestId("generated-note")).toContainText("Read automatically from the catalog page");
  await expect(page.getByRole("combobox", { name: "Major", exact: true })).toHaveValue("Computer Engineering, BS");
  const manual = page.locator('[data-group^="technical-electives"]').first();
  await expect(manual).toHaveAttribute("data-status", "open");
  await expect(manual.getByTestId("catalog-words")).not.toBeEmpty();
});

test("a hand-checked major (Computer Science): no import note, focus areas in one requirement, technical electives counted (#17)", async ({ page }) => {
  // six 400-level CS courses, one from the team project list; CS 421 is in the core, so it isn't a technical elective too
  await page.goto("./degree/?p=computer-science-bs&m=CS411,CS412,CS440,CS446,CS447,CS473,CS421");
  await expect(page.getByTestId("degree-progress")).toBeVisible();
  await expect(page.getByTestId("generated-note")).toHaveCount(0);
  await expect(req(page, "orientation")).toContainText(/CS 210|CS 211/); // required again, not a tick box
  const focus = req(page, "focus-area");
  await expect(focus.getByTestId("catalog-words")).toContainText("single focus area");
  await expect(focus.getByTestId("catalog-words")).toContainText("Software Foundations: CS 407");
  await expect(focus.getByTestId("catalog-words").getByRole("link", { name: "CS 422" })).toBeVisible(); // a listed course links to its page
  await expect(page.locator('[data-group^="software-foundations"]')).toHaveCount(0); // one requirement, not eight
  await expect(req(page, "technical-electives")).toHaveAttribute("data-status", "done"); // 18 hours from CS 4xx
  await expect(req(page, "technical-electives")).not.toContainText("CS 421");
  await expect(req(page, "team-project")).toHaveAttribute("data-status", "done"); // CS 411 counts for both, as the catalog says
});

test("the major picker searches all majors by name, acronym and college", async ({ page }) => {
  await page.goto("./degree/");
  const program = page.getByRole("combobox", { name: "Major", exact: true });
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
  await expect(page.getByText(/No major matches “zzzz”/)).toBeVisible();
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

test("the college filter narrows the major list without scrolling", async ({ page }) => {
  await page.goto("./degree/");
  const major = page.getByRole("combobox", { name: "Major", exact: true });
  const list = page.getByTestId("program-list");
  await page.getByLabel("Show majors from one college").selectOption("Gies College of Business");
  await expect(list).toBeVisible(); // choosing a college opens its list
  await expect(list.getByRole("group")).toHaveCount(1);
  await expect(list.getByRole("option").first()).toBeVisible();
  for (const name of await list.getByRole("option").allTextContents()) expect(name).not.toMatch(/Computer Science, BS/);
  // typing searches within that college only
  await major.fill("data");
  await expect(page.getByText(/^\d+ of \d+ majors in Gies Business$/)).toBeVisible();
  await expect(list.getByRole("option", { name: /Finance \+ Data Science/ })).toBeVisible();
  await expect(list.getByRole("option", { name: /Statistics & Computer Science/ })).toHaveCount(0); // an LAS major
  await list.getByRole("option").first().click();
  await expect(page).toHaveURL(/p=/);
  await expect(page.getByTestId("degree-progress")).toBeVisible();
});

test("a minor gets its own checklist from the same course list, and can be removed", async ({ page }) => {
  await page.goto("./degree/?p=computer-science-bs&m=FSHN220,FSHN420");
  await expect(page.getByTestId("degree-progress")).toBeVisible();
  await expect(page.getByTestId("minor-checklist")).toHaveCount(0); // optional: none until you pick one
  const minor = page.getByRole("combobox", { name: /Minor/ });
  await minor.fill("nutrition");
  await page.getByRole("option", { name: /^Human Nutrition Minor/ }).click();
  await expect(page).toHaveURL(/mn=nutrition-minor/);
  const checklist = page.getByTestId("minor-checklist");
  await expect(checklist.getByRole("heading", { name: /Human Nutrition Minor/ })).toBeVisible();
  // the courses you've added count toward the minor too
  const required = checklist.locator('[data-group^="required-courses"]');
  await expect(required).toHaveAttribute("data-status", "partial");
  await expect(required).toContainText("FSHN 220");
  await expect(checklist.locator('[data-group^="select-two"]')).toContainText("2 more courses (0 of 2)");
  await expect(page.getByTestId("minor-progress")).toContainText("0 of 2");
  // the major's checklist is still there, and the link carries both
  await expect(page.getByTestId("degree-progress")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("minor-checklist")).toBeVisible();
  await expect(minor).toHaveValue("Human Nutrition Minor");
  // remove it
  await page.getByRole("button", { name: "Remove Human Nutrition Minor" }).click();
  await expect(page.getByTestId("minor-checklist")).toHaveCount(0);
  await expect(page).not.toHaveURL(/mn=/);
});

test("a minor's tick boxes are kept apart from the major's", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science&mn=history-minor");
  const more = page.getByTestId("minor-checklist").locator('[data-group^="more-requirements"]');
  await more.getByLabel("I've met this requirement").check();
  await expect(more).toHaveAttribute("data-status", "done");
  await expect(page).toHaveURL(/x=history-minor--more-requirements/);
  await expect(req(page, "language")).toHaveAttribute("data-status", "open"); // the major's boxes are untouched
});

test("a link from before #111, with one minor and its old ticks, opens as it did", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science&mn=history-minor&x=mn--more-requirements-2");
  const more = page.getByTestId("minor-checklist").locator('[data-group^="more-requirements"]');
  await expect(more).toHaveAttribute("data-status", "done");
  await expect(page).toHaveURL(/x=history-minor--more-requirements/);
});

test("two minors: each gets its own checklist and ticks, and the link brings both back", async ({ page }) => {
  await page.goto("./degree/?p=computer-science-bs&m=FSHN220");
  await page.getByRole("combobox", { name: /Minor/ }).fill("nutrition");
  await page.getByRole("option", { name: /^Human Nutrition Minor/ }).click();
  const another = page.getByRole("combobox", { name: /Another minor/ });
  await another.fill("history");
  // a minor you've picked isn't offered again
  await expect(page.getByRole("option", { name: /^Human Nutrition Minor/ })).toHaveCount(0);
  await page.getByRole("option", { name: /^History Minor/ }).click();
  await expect(page).toHaveURL(/mn=nutrition-minor%2Chistory-minor|mn=nutrition-minor,history-minor/);
  const nutrition = page.locator('[data-testid="minor-checklist"][data-minor="nutrition-minor"]');
  const history = page.locator('[data-testid="minor-checklist"][data-minor="history-minor"]');
  await expect(nutrition.getByRole("heading", { name: /Human Nutrition Minor/ })).toBeVisible();
  await expect(history.getByRole("heading", { name: /History Minor/ })).toBeVisible();
  await history.locator('[data-group^="more-requirements"]').getByLabel("I've met this requirement").check();
  await expect(page).toHaveURL(/x=history-minor--more-requirements/);
  await expect(page.getByRole("combobox", { name: "Third minor" })).toHaveCount(0);

  await page.reload();
  await expect(nutrition.locator('[data-group^="required-courses"]')).toContainText("FSHN 220");
  await expect(history.locator('[data-group^="more-requirements"]')).toHaveAttribute("data-status", "done");
  await expect(page.getByRole("combobox", { name: "Second minor" })).toHaveValue("History Minor");

  // removing the first moves the second up, with its ticks
  await page.getByRole("button", { name: "Remove Human Nutrition Minor" }).click();
  await expect(page.getByTestId("minor-checklist")).toHaveCount(1);
  await expect(page).toHaveURL(/mn=history-minor(&|$)/);
  await expect(history.locator('[data-group^="more-requirements"]')).toHaveAttribute("data-status", "done");
});
