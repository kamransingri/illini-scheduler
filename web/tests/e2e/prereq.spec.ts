import { expect, test } from "@playwright/test";

// Prerequisites checked against My courses (#21): each course option says met / not met / can't tell next to the
// catalog's words, and "You can take next" lists the courses whose prerequisites are met.
test("prerequisites in the checklist and the courses you can take next", async ({ page }) => {
  await page.goto("./degree/?p=computer-science-bs&m=CS124,CS128,CS173,MATH221");
  const next = page.getByTestId("next-courses");
  await expect(next).toBeVisible();
  // CS 233 needs CS 225 alongside ("credit or concurrent enrollment")
  await expect(next.locator('[data-code="CS 233"]')).toContainText("take with CS 225");
  // CS 374 needs CS 225 first, so it isn't listed
  await expect(next.locator('[data-code="CS 374"]')).toHaveCount(0);

  // the course option's own line, with the catalog text
  const option = page.locator('[data-code="CS 374"]').filter({ has: page.locator("[data-prereq]") }).first();
  await expect(option.locator("[data-prereq]")).toHaveAttribute("data-prereq", "no");
  await expect(option.locator("[data-prereq]")).toContainText("Prerequisites not met: needs CS 225.");
  await expect(option.locator("[data-prereq]")).toContainText("Catalog: One of CS 173, MATH 213; CS 225.");

  // finishing CS 225 opens CS 374 and CS 341's other half
  await page.goto("./degree/?p=computer-science-bs&m=CS124,CS128,CS173,MATH221,CS225");
  await next.getByRole("button", { name: /^Show all/ }).click();
  await expect(next.locator('[data-code="CS 374"]')).toBeVisible();
  await expect(next.locator('[data-code="CS 233"]')).not.toContainText("take with");
});

test("the four-year plan warns when a planned course's prerequisites won't be met by then", async ({ page }) => {
  // CS 374 planned before CS 225
  await page.goto("./degree/?p=computer-science-bs&m=CS124,CS128,CS173&g=2029-sp&pl=2027-fa.CS374_2028-sp.CS225");
  const course = page.getByTestId("plan-course").filter({ hasText: "CS 374" });
  await expect(course.getByTestId("prereq-warning")).toHaveText("Prerequisites not met by Fall 2027: needs CS 225.");
  // move CS 225 earlier and the warning goes
  await page.getByRole("combobox", { name: "Move CS 225 to another term" }).selectOption("2027-sp");
  await expect(course.getByTestId("prereq-warning")).toHaveCount(0);
});
