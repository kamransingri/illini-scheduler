import { expect, test } from "@playwright/test";

// The "Use it from your AI app" page (#101): the footer links to it, and it gives the npx setup for the MCP server
// from the latest release, with a link to the full guide.
test("the footer links to the AI app page, which sets up the MCP server with npx", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Use it from your AI app" }).click();
  await expect(page).toHaveURL(/\/ai\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Use it from your AI app");
  const pkg = "https://github.com/kamransingri/illini-scheduler/releases/latest/download/illini-scheduler-mcp.tgz";
  await expect(page.locator("pre").first()).toHaveText(`claude mcp add illini-scheduler -- npx -y ${pkg}`);
  const config = JSON.parse((await page.locator("pre").nth(1).textContent()) ?? "");
  expect(config.mcpServers["illini-scheduler"]).toEqual({ command: "npx", args: ["-y", pkg] });
  await expect(page.getByRole("link", { name: "full setup guide" })).toHaveAttribute("href", /\/blob\/main\/mcp\/README\.md$/);
  await expect(page.getByRole("button", { name: "Copy command" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/undefined|NaN/);
});
