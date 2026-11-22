import { expect, test } from "@playwright/test";

// Data sources (#191): linked from every page's footer and from the course page's withheld-grades note.
test("the footer links to the data sources page, which quotes the FERPA exclusion", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./");
  await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Data sources" }).click();
  await expect(page).toHaveURL(/\/data-sources\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Data sources");
  await expect(page.getByTestId("ferpa-quote")).toContainText("Family Educational Rights and Privacy Act (FERPA) (20 U.S.C. §1232g)");
  await expect(page.getByTestId("exclusion-quote")).toHaveText(
    "Based on analysis, courses with 20 or fewer students were excluded (the smallest course in the dataset has 21 students).",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("a course with no grade data links its note to the data sources page", async ({ page }) => {
  await page.goto("./course/RHET/105/");
  const note = page.getByRole("link", { name: "Sections of 20 or fewer students are withheld" });
  test.skip((await note.count()) === 0, "RHET 105 has grade data in this build");
  await note.click();
  await expect(page).toHaveURL(/\/data-sources\/#gpa$/);
});

// #193: the GPA source note names Wade's dataset, links it, and says what released the terms shown
test("CS 124's GPA source note credits the dataset and Senate item EP.25.072", async ({ page }) => {
  await page.goto("./course/CS/124/");
  const info = page.getByRole("button", { name: /Source for recent course GPA/i });
  await info.focus();
  const note = page.getByTestId("gpa-source");
  await expect(note).toContainText("Senate item EP.25.072");
  await expect(note.getByRole("link", { name: "Wade Fagen-Ulmschneider's GPA dataset" })).toHaveAttribute("href", "https://github.com/wadefagen/datasets/tree/main/gpa");
  await page.keyboard.press("Tab");
  await expect(note.getByRole("link", { name: "Wade Fagen-Ulmschneider's GPA dataset" })).toBeFocused();
  await expect(info).toHaveAttribute("aria-expanded", "true");
});
