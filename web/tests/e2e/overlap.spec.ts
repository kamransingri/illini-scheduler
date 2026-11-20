import { expect, test } from "@playwright/test";

// A minor's coursework that must be distinct from the major (#112), on the Landscape minor's catalog rule:
// "At least six hours of coursework for the minor should be advanced ... and must be distinct from credit earned for
// your major or another minor."
test("a minor's advanced hours distinct from the major: met, maybe shared, and short", async ({ page }) => {
  const note = page.locator('[data-minor="landscape-minor"]').getByTestId("major-overlap");

  // Finance + Data Science uses no LA courses: LA 430 (2 hours) and LA 446 (4) both count
  await page.goto("./degree/?p=finance-data-science&mn=landscape-minor&m=LA101,LA430,LA446");
  await expect(note).toHaveAttribute("data-met", "true");
  await expect(note).toContainText("At least 6 advanced hours (300- or 400-level) for the minor must not also count toward your major or another minor.");
  await expect(note).toContainText("Met: 6 hours (LA 430 and LA 446).");
  await expect(note.getByRole("button", { name: "The catalog's words" })).toHaveAccessibleDescription(/must be distinct from credit earned for your major or another minor/);

  // Sustainable Design lists both among its major electives, which are ticked by hand
  await page.goto("./degree/?p=sustainable-design-bs&mn=landscape-minor&m=LA101,LA430,LA446");
  await expect(note).toHaveAttribute("data-met", "true");
  await expect(note).toContainText("LA 430 and LA 446 are also on a list for your major or another minor, which you tick by hand");

  // Fine and Applied Arts counts LA 387 and LA 480 itself: only LA 446 is left for the minor
  await page.goto("./degree/?p=fine-applied-arts-ba&mn=landscape-minor&m=LA101,LA387,LA480,LA446");
  await expect(note).toHaveAttribute("data-met", "false");
  await expect(note).toContainText("4 hours so far (LA 446).");
  await expect(note).toContainText("LA 387 and LA 480 count toward your major or another minor too");
  await expect(note).toContainText("this minor leans on courses your major already uses");
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
});

test("a minor without such a rule shows none", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science&mn=nutrition-minor&m=FSHN220");
  await expect(page.locator('[data-minor="nutrition-minor"]').getByTestId("minor-progress")).toBeVisible();
  await expect(page.getByTestId("major-overlap")).toHaveCount(0);
});
