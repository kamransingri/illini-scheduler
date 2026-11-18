import { expect, test } from "@playwright/test";

// Summer courses (#35): the newest summer's classes, filtered by session, place and gen-ed, kept in the link.
test("summer classes filter by gen-ed, session and online, and the filters stay in the link", async ({ page }) => {
  await page.goto("./summer/");
  await expect(page.getByTestId("summer-note")).toContainText("Summer 2026");
  const table = page.getByTestId("summer-table");
  await expect(table.locator("tbody tr").first()).toBeVisible();

  const count = page.getByTestId("summer-count");
  const total = Number((await count.textContent())!.split(" ")[0]);
  await page.getByLabel("Gen-ed").selectOption({ label: "Quantitative Reasoning I" });
  await expect(count).not.toHaveText(new RegExp(`^${total} `));
  for (const cell of await table.locator("tbody tr td:nth-child(5)").allTextContents()) expect(cell).toContain("Quant Reasoning I");
  await expect(page).toHaveURL(/gened=QR1/);

  await page.getByLabel("Session").selectOption("S1");
  for (const cell of await table.locator("tbody tr td:nth-child(2)").allTextContents()) expect(cell).toContain("Session I");
  await page.getByLabel("Session").selectOption("");
  await page.getByRole("checkbox", { name: "On campus" }).check();
  for (const cell of await table.locator("tbody tr td:nth-child(3)").allTextContents()) expect(cell).not.toBe("Online");
  await expect(page).toHaveURL(/campus=1/);

  // a shared link opens with its filters
  await page.goto("./summer/?q=cs%20124");
  await expect(page.getByRole("searchbox")).toHaveValue("cs 124");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator('[data-course="CS 124"]')).toContainText("Session II");
  await table.getByRole("link", { name: "CS 124" }).click();
  await expect(page).toHaveURL(/course\/CS\/124/);
});

test("375px: the summer page doesn't make the page scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./summer/");
  await expect(page.getByTestId("summer-table")).toBeVisible();
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
});
