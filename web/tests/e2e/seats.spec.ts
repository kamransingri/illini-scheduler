import { expect, test } from "@playwright/test";

test("course page has a seat-changes section with an RSS feed that exists", async ({ page, request }) => {
  await page.goto("./course/CS/124/");
  await expect(page.getByRole("heading", { name: "Seat changes" })).toBeVisible();
  const link = page.getByRole("link", { name: /Watch seats for CS 124/ });
  const href = await link.getAttribute("href");
  const res = await request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  expect(await res.text()).toContain("<rss");
});

test("just-opened page loads and filters", async ({ page }) => {
  await page.goto("./opened/");
  await expect(page.getByText(/\d+ changes?$/)).toBeVisible();
  await page.getByLabel("Filter by subject").fill("CS");
  for (const code of await page.getByTestId("opened-list").locator("li a").allTextContents()) expect(code.startsWith("CS")).toBe(true);
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
});

test("search handles a typo and a nickname", async ({ page }) => {
  await page.goto("./");
  const box = page.getByLabel(/Search courses/);
  await box.fill("calc 2");
  await expect(page.getByRole("listbox").locator("li").first()).toContainText("MATH 231");
  await box.fill("calclus");
  await expect(page.getByRole("listbox")).toContainText("Calculus");
});

test("watch a section on its course page; Just opened lists it, filters to it and shares it (#15)", async ({ page, browser }) => {
  await page.goto("./course/CS/124/");
  const row = page.getByTestId("section-row").first();
  const watch = row.getByRole("button", { name: /^Watch CS 124 / });
  await watch.click();
  await expect(row.getByRole("button", { name: /^Watching CS 124 / })).toHaveAttribute("aria-pressed", "true");
  const crn = (await row.getByRole("button", { name: /^Copy \d{5}$/ }).textContent())!.replace(/\D/g, "");

  await page.goto("./opened/?watch=1");
  const panel = page.getByTestId("watched");
  await expect(panel.getByRole("heading", { name: "Sections you watch (1)" })).toBeVisible();
  const item = panel.getByTestId("watched-row");
  await expect(item).toContainText("CS 124");
  await expect(item).toContainText(/checked|not published|Loading/);
  await expect(page.getByLabel("Only sections I watch (1)")).toBeChecked();
  for (const t of await page.getByTestId("opened-list").locator("li").allTextContents()) expect(t).toContain("CS 124");
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);

  // the share link opens elsewhere without replacing that browser's list
  const link = new URL(page.url());
  link.search = `?w=${encodeURIComponent(`2027-sp.CS124.X.${crn}`)}`;
  const other = await browser.newPage();
  await other.goto(link.toString());
  const banner = other.getByTestId("shared-watch");
  await expect(banner).toContainText("This link shares a watched section: CS 124 X");
  await banner.getByRole("button", { name: "Watch it too" }).click();
  await expect(other.getByTestId("watched").getByTestId("watched-row")).toHaveCount(1);
  await expect(banner).toBeHidden();
  await other.close();

  // stop watching from Just opened
  await item.getByRole("button", { name: /^Watching CS 124 / }).click();
  await expect(page.getByTestId("watched")).toBeHidden();
});
