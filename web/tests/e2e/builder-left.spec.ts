import { expect, test } from "@playwright/test";

// The schedule builder's left column after #238: three must-haves in view, the rest under "More options" with a count,
// the priority presets in view and the sliders under "Customize", and the lock dropdowns behind "Pick sections".

test("a fresh visit shows at most 3 selects and no option checkboxes until More options or Customize is opened", async ({ page }) => {
  await page.goto("./schedule/?c=STAT107&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(1);
  const left = page.locator("div.space-y-8").first();
  await expect(left.locator("select:visible")).toHaveCount(3); // term, No classes before, Done by
  // the only checkboxes in view are the Days off toggles
  const boxes = left.locator('input[type="checkbox"]:visible');
  expect(await boxes.evaluateAll((els) => els.filter((e) => !e.closest("fieldset")).length)).toBe(0);
  expect(await left.getByRole("slider").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).length)).toBe(0);
  await expect(page.getByTestId("more-options-toggle")).toHaveText(/^More options$/);
  // Customize shows the sliders; More options shows the rest
  await page.getByRole("button", { name: "Customize" }).click();
  await expect(page.getByRole("slider", { name: "Higher expected GPA" })).toBeVisible();
  await page.getByTestId("more-options-toggle").click();
  await expect(page.getByLabel("Keep a lunch break")).toBeVisible();
  await expect(page.getByLabel("Student level")).toBeVisible();
});

test("a link with a lunch break, blocked times and custom sliders opens with all of them on, and More options says so", async ({ page }) => {
  await page.goto("./schedule/?c=STAT107&t=2027-sp");
  await page.getByTestId("more-options-toggle").click();
  await page.getByLabel("Keep a lunch break").check();
  await page.getByTestId("more-options").locator("label[title=\"Tuesday\"]").click(); // the day toggle is its label
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("slider", { name: "More days off" }).fill("3");
  await expect(page.getByTestId("preset-custom")).toBeVisible();
  const link = page.url();

  const fresh = await page.context().browser()!.newContext();
  const other = await fresh.newPage();
  await other.goto(link);
  await expect(other.getByTestId("more-options-toggle")).toContainText("2 on"); // lunch and the blocked time
  await expect(other.getByTestId("preset-custom")).toBeVisible();
  await other.getByTestId("more-options-toggle").click();
  await expect(other.getByLabel("Keep a lunch break")).toBeChecked();
  await expect(other.getByTestId("more-options")).toContainText("T 5:00pm–7:00pm");
  await other.getByRole("button", { name: "Customize" }).click();
  await expect(other.getByRole("slider", { name: "More days off" })).toHaveValue("3");
  await fresh.close();
});

test("a section is picked before generating, and the course row says what's locked", async ({ page }) => {
  await page.goto("./schedule/?c=STAT107&t=2027-sp");
  const row = page.getByTestId("cart").locator("li", { hasText: "STAT 107" });
  await expect(row.getByLabel("Lock Lecture for STAT 107")).toBeHidden();
  await row.getByText("Pick sections").click();
  const lecture = row.getByLabel("Lock Lecture for STAT 107");
  await lecture.selectOption((await lecture.locator("option", { hasText: /^L1 LEC/ }).getAttribute("value"))!);
  await expect(row.getByTestId("cart-locked")).toContainText("Locked: L1");
  await row.getByRole("button", { name: "Unlock every section of STAT 107" }).click();
  await expect(row.getByTestId("cart-locked")).toHaveCount(0);
});
