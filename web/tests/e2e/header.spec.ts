import { expect, test } from "@playwright/test";

// The header after its critique (redesign): five tabs, search from every page, keyboard and phone fixes.

test("search from any page: the Search button and the / key open it, Escape closes it", async ({ page }) => {
  await page.goto("./course/CS/124/");
  const search = page.getByRole("button", { name: "Search", exact: true });
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await search.click();
  const box = page.getByRole("search", { name: "Search the site" }).getByRole("combobox");
  await expect(box).toBeFocused();
  await box.fill("math 2");
  await expect(page.locator("#site-search-q-results").getByRole("option").first()).toBeVisible();
  // Escape closes it and gives focus back to the button
  await page.keyboard.press("Escape");
  await expect(page.locator("#site-search")).toBeHidden();
  await expect(search).toBeFocused();
  // the / key opens it from anywhere that isn't a text field
  await page.locator("h1").click();
  await page.keyboard.press("/");
  await expect(box).toBeFocused();
  await box.fill("cs 128");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/course\/CS\/128\/$/);
  await expect(page.locator("#site-search")).toBeHidden(); // a new page closes it
});

test("the home page keeps its own search: no header search, and / focuses the page's box", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
  await page.locator("h1").click();
  await page.keyboard.press("/");
  await expect(page.locator("#q")).toBeFocused();
});

test("Just opened isn't a tab, but the page is still there and in the footer", async ({ page }) => {
  await page.goto("./opened/");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Just opened" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Just opened" })).toBeVisible();
  await expect(page.locator("h1")).toBeVisible();
});

test("375px: Search and Menu are 44px tall, Escape closes the menu, and the cart count is read out", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./course/CS/124/");
  await page.getByRole("button", { name: "Add to schedule" }).click();
  const menu = page.getByRole("button", { name: /^Menu\b.*1 course in your schedule$/ });
  for (const b of [menu, page.getByRole("button", { name: "Search", exact: true })]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await menu.click();
  const nav = page.locator("#mobile-nav");
  await expect(nav.getByRole("link", { name: "Schedule builder" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(menu).toBeFocused();
  // tapping outside closes it too
  await menu.click();
  await page.locator("h1").click();
  await expect(nav).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("after Add to schedule, the course page links straight to the builder", async ({ page }) => {
  await page.goto("./course/CS/124/");
  await expect(page.getByTestId("open-builder")).toHaveCount(0);
  await page.getByRole("button", { name: "Add to schedule" }).click();
  await page.getByTestId("open-builder").click();
  await expect(page).toHaveURL(/\/schedule\//);
});

test("the header slides away on the way down and comes back on the way up, above the course page's sticky bar", async ({ page }) => {
  await page.goto("./course/CS/124/");
  const header = page.locator("header.site-header");
  // keep scrolling until it hides: a scroll that lands before the page hydrates has no listener to see it
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 500);
      return (await header.boundingBox())!.y;
    })
    .toBeLessThan(0);
  // and on until the strip is stuck to the top: scrolling back up from short of it would leave it in the page's flow
  const strip = page.getByRole("navigation", { name: "On this page" });
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 500);
      return Math.round((await strip.boundingBox())!.y);
    })
    .toBeLessThanOrEqual(0);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
  await expect.poll(async () => Math.round((await strip.boundingBox())!.y)).toBe(Math.round((await header.boundingBox())!.height));
});
