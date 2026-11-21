import { expect, test } from "@playwright/test";

test("a professor row expands to show their sections, grades and reviews in one panel", async ({ page }) => {
  await page.goto("./course/MATH/221/");
  const row = page.getByTestId("prof-row").first();
  const name = page.getByTestId("prof-row").first().getByRole("button", { expanded: false }).first();
  await expect(name).toBeVisible();
  await name.click();
  const panel = row.locator('[id$="-panel"]');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: /Sections in Fall 2026/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Copy \d{5}$/ }).first()).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Rate My Professors" })).toBeVisible();
  // collapses again
  await row.getByRole("button", { expanded: true }).first().click();
  await expect(panel).toBeHidden();
});

test("clicking a section's professor opens and scrolls to that professor's row", async ({ page }) => {
  await page.goto("./course/MATH/221/");
  const section = page.getByTestId("section-row").first();
  const prof = section.getByRole("button").filter({ hasNotText: /^\d{5}/ }).first();
  const name = (await prof.textContent())!.trim();
  await prof.click();
  const row = page.getByTestId("prof-row").filter({ has: page.getByRole("button", { name, exact: true }) }).first();
  await expect(row.locator('[id$="-panel"]')).toBeVisible();
  await expect(row).toBeInViewport();
  await expect(row.getByRole("button", { name, exact: true })).toBeFocused();
});

test("reviews sit under their professor and say when they were written for another course", async ({ page }) => {
  await page.goto("./course/CS/124/");
  const row = page.getByTestId("prof-row").first();
  await row.getByRole("button", { expanded: false }).first().click();
  const reviews = row.locator("blockquote");
  const n = await reviews.count();
  test.skip(n === 0, "no RMP reviews in this build");
  expect(n).toBeLessThanOrEqual(2); // two by default
  for (const label of await row.locator("li:has(> blockquote) > p").allTextContents()) expect(label).toMatch(/^(CS 124|Written for )/);
});

test("compare view sorts professors by a column", async ({ page }) => {
  await page.goto("./course/MATH/221/");
  await page.getByRole("button", { name: "Compare" }).click();
  const table = page.getByRole("table", { name: /Professors compared/ });
  await expect(table).toBeVisible();
  await table.getByRole("button", { name: /GPA here/ }).click();
  await expect(table.getByRole("columnheader", { name: /GPA here/ })).toHaveAttribute("aria-sort", "descending");
  const gpas = (await table.locator("tbody tr td:nth-of-type(2)").allTextContents()).map(Number).filter((x) => !Number.isNaN(x));
  for (let i = 1; i < gpas.length; i++) expect(gpas[i]).toBeLessThanOrEqual(gpas[i - 1]);
});

test("375px: an open professor panel doesn't scroll the page sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./course/CS/124/");
  await page.getByTestId("prof-row").first().getByRole("button", { expanded: false }).first().click();
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
});

test("keyboard: a professor row opens and closes with Enter, and a source popover opens on focus", async ({ page }) => {
  await page.goto("./course/MATH/221/");
  const row = page.getByTestId("prof-row").first();
  const name = row.getByRole("button", { expanded: false }).first();
  await name.focus();
  await page.keyboard.press("Enter");
  await expect(row.locator('[id$="-panel"]')).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(row.locator('[id$="-panel"]')).toBeHidden();
  const info = page.getByRole("button", { name: /Source for recent course GPA/i });
  await info.focus();
  await expect(info).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(`[id="${await info.getAttribute("aria-describedby")}"]`)).toContainText("UIUC GPA dataset");
  await page.keyboard.press("Escape");
  await expect(info).toHaveAttribute("aria-expanded", "false");
});

test("matched professors link to RMP's page for adding a rating", async ({ page }) => {
  const RATE = /^https:\/\/www\.ratemyprofessors\.com\/add\/professor-rating\/\d+$/;
  await page.goto("./course/RHET/105/");
  const rows = page.getByTestId("prof-row");
  await expect(rows.first()).toBeVisible();
  // on RMP without ratings yet: the link is right in the row
  const first = rows.getByTestId("rmp-rate");
  test.skip((await first.count()) === 0, "no unrated RMP match in this build");
  await expect(first.first()).toHaveText("Be the first to rate");
  await expect(first.first()).toHaveAttribute("href", RATE);
  // rated: next to the profile link in the open panel
  const rated = rows.filter({ has: page.getByText(/^[\d,]+ ratings$/) }).first();
  await rated.getByRole("button", { expanded: false }).first().click();
  const panel = rated.locator('[id$="-panel"]');
  await expect(panel.getByRole("link", { name: /Rate My Professors page/ })).toBeVisible();
  await expect(panel.getByTestId("rmp-rate")).toContainText("Took RHET 105 with them? Rate them on RMP");
  await expect(panel.getByTestId("rmp-rate")).toHaveAttribute("href", RATE);
});

test("RMP averages show as three meters with a label that reads the numbers (#197)", async ({ page }) => {
  await page.goto("./course/CS/124/");
  const rows = page.getByTestId("prof-row");
  const n = await rows.count();
  let meters = null;
  for (let i = 0; i < n && !meters; i++) {
    await rows.nth(i).getByRole("button", { expanded: false }).first().click();
    const m = rows.nth(i).getByTestId("rmp-meters");
    if (await m.count()) meters = m;
  }
  test.skip(!meters, "no professor with RMP ratings in this build");
  await expect(meters!.locator("[data-meter]")).toHaveCount(3);
  await expect(meters!.locator('[data-meter="difficulty"]')).toContainText("lower is easier");
  await expect(meters!.getByRole("img")).toHaveAttribute("aria-label", /^Rate My Professors: Quality (\d\.\d|–) of 5, difficulty (\d\.\d|–) of 5, .+ from [\d,]+ ratings \(all courses\)$/);
  await expect(meters!).toContainText(/ratings \(all courses\), fetched/);
});
