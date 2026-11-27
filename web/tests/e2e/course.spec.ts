import { expect, test } from "@playwright/test";

test("search cs124 lands on CS 124 with sections, a professor row and grades over time, no console errors", async ({ page }) => {
  const errors: string[] = [];
  // the live seat feed (raw.githubusercontent.com) may not exist yet; the page falls back to the daily data on its own
  page.on("console", (m) => m.type() === "error" && !m.location().url.includes("raw.githubusercontent.com") && errors.push(`${m.text()} ${m.location().url}`));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./");
  await page.getByLabel(/Search courses/).fill("cs124");
  await expect(page.getByRole("listbox")).toContainText("Introduction to Computer Science I");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/course\/CS\/124\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Introduction to Computer Science I");
  await expect(page.getByRole("heading", { name: "Sections" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Copy 71571/ })).toBeVisible();
  await expect(page.getByTestId("prof-row").first()).toBeVisible();
  await expect(page.getByRole("table", { name: /Grade distribution and average GPA by term/ })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
  expect(errors).toEqual([]);
});

for (const path of ["./course/CS/124/", "./course/MATH/221/", "./course/STAT/107/", "./course/RHET/105/"]) {
  test(`no horizontal scroll at 375px: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Sections" })).toBeVisible();
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw);
    await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
  });
}

test("course not offered next term says so and shows the other term", async ({ page }) => {
  await page.goto("./course/MATH/221/");
  await expect(page.getByText("Not offered", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Fall 2026" })).toHaveAttribute("aria-selected", "true");
});

test("course with no GPA data says so", async ({ page }) => {
  await page.goto("./course/RHET/105/");
  await expect(page.getByText("No grade data", { exact: true })).toBeVisible();
});

test("Took this course? is one line under Professors that sends students to Rate My Professors, not to GitHub", async ({ page }) => {
  await page.goto("./course/CS/124/");
  const block = page.getByTestId("review-block");
  await expect(block).toContainText("Rate them on RMP");
  await expect(block).toContainText("pick CS 124 as the course");
  await expect(page.getByRole("heading", { name: "Took this course?" })).toHaveCount(0);
  await block.getByRole("link", { name: "your professor's row" }).click();
  await expect(page).toHaveURL(/#professors$/);
  await expect(page.locator('a[href*="/issues/new"]')).toHaveCount(0);
});

test("the course page says each thing once (#241)", async ({ page }) => {
  await page.goto("./course/STAT/107/");
  await expect(page.getByRole("heading", { name: /^Sections/ })).toBeVisible();
  // the in-page nav: Professors, Sections and Grades; What changed and Seat changes are no longer sections
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveText(["Professors", "Sections", "Grades"]);
  await expect(page.getByRole("heading", { name: "What changed" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Seat changes" })).toHaveCount(0);
  // the best-pick weights sit behind one closed control under the professor list
  const how = page.getByRole("button", { name: "How the best pick is scored" });
  await expect(how).toHaveAttribute("aria-expanded", "false");
  await how.click();
  await expect(page.getByRole("slider", { name: "Course GPA" })).toBeVisible();
});

test("Biggest recent change opens every change in place (#241)", async ({ page }) => {
  await page.goto("./course/STAT/107/");
  const all = page.getByRole("button", { name: "All changes" });
  await expect(all).toHaveAttribute("aria-expanded", "false");
  await all.click();
  await expect(page.getByTestId("all-changes").locator("li").first()).toBeVisible();
});

test("a section's latest seat change shows on its row (#241)", async ({ page }) => {
  await page.goto("./course/CS/124/");
  const row = page.getByTestId("section-row").first();
  const crn = (await row.getByRole("button", { name: /^Copy \d{5}$/ }).textContent())!.replace(/\D/g, "");
  const term = (await page.getByRole("tab", { selected: true }).first().getAttribute("data-term"))!;
  // replace the course file's seat changes with one that opened this section yesterday
  await page.route("**/data/course/CS/124.json", async (r) => {
    const json = await (await r.fetch()).json();
    const at = new Date(Date.now() - 86400000 - 3600000).toISOString();
    json.seat_events = [{ term, at, crn, s: "CS", n: "124", code: "X", old: "Closed", new: "Open" }];
    await r.fulfill({ json });
  });
  await page.reload();
  await expect(page.getByTestId("section-row").first().getByTestId("seat-change")).toHaveText("Opened yesterday");
});

test("a renumbered course: the old URL and the old number lead to it, and it says what it was (#29)", async ({ page }) => {
  await page.goto("./course/SPAN/200/");
  await expect(page).toHaveURL(/\/course\/SPAN\/210\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Readings in Hispanic Texts");
  await expect(page.getByTestId("formerly")).toContainText("Formerly SPAN 200");
  await page.goto("./");
  await page.getByLabel(/Search courses/).fill("span 200");
  const first = page.getByRole("listbox").locator("li").first();
  await expect(first).toContainText("SPAN 210");
  await expect(first).toContainText("Formerly SPAN 200");
});
