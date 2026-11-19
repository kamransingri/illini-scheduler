import { expect, test } from "@playwright/test";

// Summer courses everywhere (#121): the gen-ed finder's Summer view (#123), a line on course pages (#122), summer in
// the search, and /summer/ redirecting with its filters (#124). The summer is read from the build's summer.json.
type Summer = { label: string; upcoming: boolean; courses: { s: string; n: string; t: string; page: boolean }[] };

test("the gen-ed finder's Summer view filters by gen-ed, session and online, and keeps them in the link", async ({ page }) => {
  await page.goto("./geneds/?term=summer");
  await expect(page.getByTestId("gened-term").getByRole("button", { name: "Summer" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("summer-note")).toContainText("Summer 20");
  const table = page.getByTestId("summer-table");
  await expect(table.locator("tbody tr").first()).toBeVisible();
  // gen-eds only by default
  for (const cell of await table.locator("tbody tr td:nth-child(5)").allTextContents()) expect(cell.trim()).not.toBe("");

  const count = page.getByTestId("summer-count");
  const total = Number((await count.textContent())!.split(" ")[0]);
  await page.getByLabel("Gen-ed", { exact: true }).selectOption({ label: "Quantitative Reasoning I" });
  await expect(count).not.toHaveText(new RegExp(`^${total} `));
  for (const cell of await table.locator("tbody tr td:nth-child(5)").allTextContents()) expect(cell).toContain("Quant Reasoning I");
  await expect(page).toHaveURL(/\?term=summer&gened=QR1/);

  await page.getByLabel("Session", { exact: true }).selectOption("S1");
  for (const cell of await table.locator("tbody tr td:nth-child(2)").allTextContents()) expect(cell).toContain("Session I");
  await page.getByLabel("Session", { exact: true }).selectOption("");
  await page.getByRole("checkbox", { name: "On campus" }).check();
  for (const cell of await table.locator("tbody tr td:nth-child(3)").allTextContents()) expect(cell).not.toBe("Online");
  await expect(page).toHaveURL(/campus=1/);

  // back to next term's gen-eds
  await page.getByTestId("gened-term").getByRole("button", { name: /^Spring|^Fall/ }).click();
  await expect(page.getByTestId("gened-results").locator("tr").first()).toBeVisible();
  await expect(page).not.toHaveURL(/term=summer/);
});

test("old /summer/ links land on the same classes in the gen-ed finder", async ({ page }) => {
  await page.goto("./summer/?q=cs%20124");
  await expect(page).toHaveURL(/\/geneds\/\?term=summer&q=cs\+124&gened=all$/);
  await expect(page.getByLabel("Course or subject")).toHaveValue("cs 124");
  const table = page.getByTestId("summer-table");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator('[data-course="CS 124"]')).toContainText("Session II");
  await table.getByRole("link", { name: "CS 124" }).click();
  await expect(page).toHaveURL(/course\/CS\/124/);
});

test("a course page says when the course runs in summer", async ({ page }) => {
  await page.goto("./course/CS/124/");
  const line = page.getByTestId("summer-line");
  await expect(line).toContainText(/Summer 20\d\d/);
  await expect(line).toContainText("Session II");
  await page.getByRole("link", { name: "Every summer CS class" }).click();
  await expect(page).toHaveURL(/\/geneds\/\?term=summer&q=CS&gened=all$/);
  await expect(page.getByTestId("summer-table").locator('[data-course="CS 124"]')).toBeVisible();
});

test("the search marks summer courses and finds summer-only ones", async ({ page, request, baseURL }) => {
  const summer = (await (await request.get(new URL("data/summer.json", baseURL).toString())).json()) as Summer;
  await page.goto("./");
  const box = page.getByLabel(/Search courses/);
  await box.fill("cs 124");
  await expect(page.getByRole("listbox").locator("li").first()).toContainText(summer.label);

  // a summer class with no course page: not in the search index
  const index = (await (await request.get(new URL("data/search.json", baseURL).toString())).json()) as { courses: { s: string; n: string }[] };
  const paged = new Set(index.courses.map((c) => `${c.s} ${c.n}`));
  const only = summer.courses.find((r) => !r.page && !paged.has(`${r.s} ${r.n}`))!;
  await box.fill(`${only.s} ${only.n}`);
  const hit = page.getByTestId("summer-hit").first();
  await expect(hit).toContainText(`${only.s} ${only.n}`);
  await expect(hit).toContainText("opens Course Explorer");
  await expect(hit).toHaveAttribute("href", new RegExp(`courses\\.illinois\\.edu/schedule/\\d{4}/summer/${only.s}/${only.n}$`));

  // a course with a page isn't listed a second time as a summer-only class (builds before the pipeline set `page` for
  // courses with only recent grades have some)
  const both = summer.courses.find((r) => !r.page && paged.has(`${r.s} ${r.n}`));
  if (both) {
    await box.fill(`${both.s} ${both.n}`);
    await expect(page.getByRole("listbox").locator("li").first()).toContainText(`${both.s} ${both.n}`);
    await expect(page.getByTestId("summer-hit")).toHaveCount(0);
  }
});

test("the header has five tabs and no Summer courses page", async ({ page }) => {
  await page.goto("./");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.locator("li")).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Summer courses" })).toHaveCount(0);
});

test("the home page is the search, often-searched courses and Just opened", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByLabel(/Search courses/)).toBeVisible();
  await expect(page.getByTestId("home-popular").getByRole("link", { name: "CS 124" })).toBeVisible();
  await expect(page.getByTestId("home-live")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How it works" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Everything you need before registration" })).toHaveCount(0);
});

test("375px: the Summer view doesn't make the page scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./geneds/?term=summer");
  await expect(page.getByTestId("summer-table")).toBeVisible();
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
});
