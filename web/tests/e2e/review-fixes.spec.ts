import { expect, test } from "@playwright/test";

test("two courses that always overlap are named", async ({ page }) => {
  await page.goto("./schedule/?c=GER261,STAT200&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("no-schedule")).toContainText(/GER 261 .* always overlaps STAT 200/);
});

test("an impossible lock is explained and the schedule is marked incomplete", async ({ page }) => {
  await page.goto("./schedule/?c=MATH231,CS124&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  const lec = page.getByLabel("Lock Lecture for MATH 231");
  const dis = page.getByLabel("Lock Discussion for MATH 231");
  // wait until course data has loaded and the selects list sections
  await expect(dis.locator("option")).not.toHaveCount(1);
  await expect(lec.locator("option")).not.toHaveCount(1);
  // lock a discussion first, then a lecture from a different group (the lecture list isn't filtered)
  const disFirst = (await dis.locator("option").allTextContents()).find((o) => o.includes("CRN"))!;
  await dis.selectOption({ label: disFirst });
  const disGroup = disFirst.replace("🔒", "").trim()[0];
  const lecOther = (await lec.locator("option").allTextContents()).find((o) => o.includes("CRN") && !o.replace("🔒", "").trim().startsWith(disGroup))!;
  await lec.selectOption({ label: lecOther });
  // with a lecture locked, the discussion list only offers that lecture's group
  const lecGroup = lecOther.replace("🔒", "").trim()[0];
  for (const o of (await dis.locator("option").allTextContents()).filter((x) => x.includes("CRN") && !x.includes(disFirst.slice(3, 12))))
    expect(o.replace("🔒", "").trim()[0]).toBe(lecGroup);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("missing")).toContainText("MATH 231 can't be scheduled");
  await expect(page.getByTestId("missing")).toContainText("can't be taken together");
  await expect(page.getByTestId("summary")).toContainText("without MATH 231");
  // choosing the placeholder clears a lock
  await dis.selectOption("");
  await expect(dis).toHaveValue("");
});

test("opening a share link doesn't overwrite your own list", async ({ page }) => {
  await page.goto("./schedule/?c=PHYS211,CHEM102&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.goto("./schedule/?c=CS124,STAT200&t=2027-sp&e=540");
  await expect(page.getByText("You opened a shared course list")).toBeVisible();
  await expect(page.getByTestId("schedule-result")).toBeVisible(); // rules in the link -> auto-generated
  await expect(page.getByLabel("No classes before")).toHaveValue("540");
  await page.getByRole("button", { name: "Back to my list" }).click();
  await expect(page.getByTestId("cart")).toContainText("PHYS 211");
  await expect(page.getByTestId("cart")).not.toContainText("CS 124");
});

test("rules survive reload", async ({ page }) => {
  await page.goto("./schedule/?c=CS124&t=2027-sp");
  await page.getByLabel("No Friday classes").check();
  await page.goto("./schedule/");
  await expect(page.getByLabel("No Friday classes")).toBeChecked();
});

test("Enter in the builder's search adds the course instead of leaving", async ({ page }) => {
  await page.goto("./schedule/?c=CS124&t=2027-sp");
  await page.getByLabel("Search courses or instructors").fill("stat 200");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/schedule/);
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
});

test("gen-ed filters survive Back", async ({ page }) => {
  await page.goto("./geneds/");
  await page.getByText("Humanities: Hist & Phil", { exact: true }).first().click();
  await expect(page).toHaveURL(/codes=HP/);
  const count = await page.getByText(/^\d+ courses?$/).textContent();
  await page.locator('[data-testid="gened-results"] a').first().click();
  await expect(page.getByRole("heading", { name: "Sections" })).toBeVisible();
  await page.goBack();
  await expect(page.getByText(/^\d+ courses?$/)).toHaveText(count!);
});

test("lower-case course URL redirects", async ({ page }) => {
  await page.goto("./course/cs/124/");
  await expect(page).toHaveURL(/\/course\/CS\/124\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Introduction to Computer Science I");
});

test("special sections are flagged and skipped by default", async ({ page }) => {
  await page.goto("./course/CS/124/");
  await expect(page.getByText("special", { exact: true }).first()).toBeVisible();
});
