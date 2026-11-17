import { expect, test } from "@playwright/test";
import pkg from "../../package.json";

// v0.5.0: the footer names the version that's live and links to its release notes.
test("the footer shows the version and links to its release", async ({ page }) => {
  await page.goto("./");
  const version = page.getByTestId("site-version");
  await expect(version).toContainText(`Version ${pkg.version}`);
  await expect(version.getByRole("link", { name: "What's new" })).toHaveAttribute("href", new RegExp(`/releases/tag/v${pkg.version.replace(/\./g, "\.")}$`));
});
