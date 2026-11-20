import { expect, test } from "@playwright/test";

// Terms of use (#143) and the AI use policy (#144): both linked from every page's footer.
test("the footer links to the terms of use and the AI use policy", async ({ page }) => {
  await page.goto("./");
  const footer = page.getByRole("navigation", { name: "Footer" });
  await expect(footer.getByRole("link", { name: "AI use policy" })).toHaveAttribute("href", /\/blob\/main\/docs\/AI-USE\.md$/);

  await footer.getByRole("link", { name: "Terms of use" }).click();
  await expect(page).toHaveURL(/\/terms\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of use");
  await expect(page.locator("main")).toContainText("isn't affiliated with, endorsed by or run by the University of Illinois");
  await expect(page.locator("main")).toContainText("Nothing here registers you for anything");
  await expect(page.locator("main").getByRole("link", { name: "privacy page" })).toHaveAttribute("href", /\/privacy\/$/);
  await expect(page.locator("body")).not.toContainText(/undefined|NaN/);
});
