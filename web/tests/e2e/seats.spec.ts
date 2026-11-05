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
  const box = page.getByLabel("Search courses or instructors");
  await box.fill("calc 2");
  await expect(page.getByRole("listbox").locator("li").first()).toContainText("MATH 231");
  await box.fill("calclus");
  await expect(page.getByRole("listbox")).toContainText("Calculus");
});
