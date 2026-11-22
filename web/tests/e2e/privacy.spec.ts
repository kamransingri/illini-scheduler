import { expect, test } from "@playwright/test";

// The privacy page (#142): linked from the footer, lists what's stored, and deletes it on request.
test("the footer links to the privacy page, which lists what's stored and deletes it all", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("illini-scheduler:cart:v1", "CS124");
    localStorage.setItem("illini-scheduler:watch:v1", "2027-sp.CS124.AL1.31152");
    localStorage.setItem("someone-else", "kept");
  });
  await page.goto("./");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
  const table = page.getByTestId("stored-keys");
  await expect(table.locator("tbody tr")).toHaveCount(9);
  await expect(table).toContainText("illini-scheduler:mycourses:v1");

  await page.getByRole("button", { name: "Delete everything this site saved in this browser" }).click();
  await page.getByRole("button", { name: "Keep it" }).click(); // one press isn't enough
  expect(await page.evaluate(() => localStorage.getItem("illini-scheduler:cart:v1"))).toBe("CS124");
  await page.getByRole("button", { name: "Delete everything this site saved in this browser" }).click();
  await page.getByRole("button", { name: "Yes, delete it all" }).click();
  await expect(page.getByTestId("cleared")).toContainText("2 saved items deleted");
  expect(await page.evaluate(() => [localStorage.getItem("illini-scheduler:cart:v1"), localStorage.getItem("illini-scheduler:watch:v1"), localStorage.getItem("someone-else")])).toEqual([null, null, "kept"]);
  await expect(page.locator("body")).not.toContainText(/undefined|NaN/);
});
