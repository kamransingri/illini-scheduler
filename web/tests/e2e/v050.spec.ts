import { expect, test } from "@playwright/test";
import pkg from "../../package.json";

// The footer names the live version and the ones before it; all of them are on the Versions page (CHANGELOG.md).
test("the footer shows the version and links to the Versions page", async ({ page }) => {
  await page.goto("./");
  const version = page.getByTestId("site-version");
  await expect(version).toContainText(`Version ${pkg.version}`);
  await expect(version).toContainText("Earlier:");
  await version.getByRole("link", { name: "All versions" }).click();
  await expect(page).toHaveURL(/\/versions\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Versions");
  const current = page.locator(`[id="v${pkg.version}"]`);
  await expect(current.getByRole("heading", { level: 2 })).toHaveText(`Version ${pkg.version}`);
  await expect(current).toContainText("This site");
  await expect(current.locator("li").first()).toBeVisible();
  expect(await page.getByTestId("release").count()).toBeGreaterThan(5);
  await expect(page.locator("body")).not.toContainText(/undefined|NaN|\*\*|\]\(/);
});
