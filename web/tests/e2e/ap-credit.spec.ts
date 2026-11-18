import { expect, test, type Page } from "@playwright/test";

// AP credit in the degree checklist (docs/AP-CREDIT.md): scores in, expected courses out, from CITL's table.
const req = (page: Page, id: string) => page.locator(`[data-group="${id}"]`);
const exam = (page: Page) => page.getByRole("combobox", { name: "AP exam", exact: true });
const score = (page: Page) => page.getByRole("combobox", { name: "Score", exact: true });
const addExam = (page: Page) => page.getByRole("button", { name: "Add exam" });
const panel = (page: Page) => page.getByTestId("ap-credit");

test("AP scores fill requirements, show CITL's placement message, and can be switched off", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science");
  await expect(page.getByTestId("degree-progress")).toBeVisible();
  await expect(exam(page)).toBeEnabled(); // the AP table has loaded

  await exam(page).selectOption({ label: "Calculus AB" });
  await score(page).selectOption("3");
  await addExam(page).click();
  const calc = panel(page).locator('[data-exam="CALCAB"]');
  await expect(calc).toContainText("AP Calculus AB, 3");
  await expect(calc).toContainText("MATH 234");
  await expect(calc).toContainText("If your program requires MATH 220 or MATH 221, you will not receive credit towards graduation for MATH 234.");
  await expect(req(page, "calculus")).toHaveAttribute("data-status", "done"); // this program takes MATH 234
  await expect(page).toHaveURL(/a=CALCAB-3/);

  await exam(page).selectOption({ label: "English Language and Composition" });
  await score(page).selectOption("4");
  await addExam(page).click();
  await expect(req(page, "comp1")).toHaveAttribute("data-status", "done");
  await req(page, "comp1").getByRole("button", { name: /Show what counts/ }).click();
  await expect(req(page, "comp1")).toContainText("RHET 105, AP credit");
  await expect(page.getByTestId("hours-so-far")).toContainText("8 hours in My courses (8 from AP credit)");

  // declining the credit (to take the course instead) reopens the requirement and is kept in the link
  await panel(page).getByRole("checkbox", { name: /RHET 105/ }).uncheck();
  await expect(req(page, "comp1")).toHaveAttribute("data-status", "open");
  await expect(page).toHaveURL(/d=RHET105/);

  // removing an exam removes its credit
  await panel(page).getByRole("button", { name: "Remove AP Calculus AB, 3" }).click();
  await expect(req(page, "calculus")).toHaveAttribute("data-status", "open");
  await expect(page).not.toHaveURL(/CALCAB/);
});

test("a Calculus BC 3 asks for the AB subscore before it can be added", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science");
  await expect(exam(page)).toBeEnabled();
  await exam(page).selectOption({ label: "Calculus BC" });
  await score(page).selectOption("3");
  const sub = page.getByRole("combobox", { name: "Calculus AB subscore" });
  await expect(sub).toBeVisible();
  await expect(addExam(page)).toBeDisabled();
  await sub.selectOption({ label: "Calculus AB subscore 4" });
  await addExam(page).click();
  await expect(panel(page)).toContainText("AP Calculus BC, 3 (Calculus AB subscore: 4)");
  await expect(panel(page)).toContainText("MATH 220");
  await expect(page).toHaveURL(/a=CALCBC-3-4/);
  // a 4 needs no subscore
  await exam(page).selectOption({ label: "Calculus BC" });
  await score(page).selectOption("4");
  await expect(page.getByRole("combobox", { name: "Calculus AB subscore" })).toHaveCount(0);
});

test("a shared link: Grainger programs get Grainger's Calculus rows, and the starting year picks the table", async ({ page }) => {
  await page.goto("./degree/?p=computer-science-bs&a=CALCBC-4,PHYSCM-5,FR-3");
  const calc = panel(page).locator('[data-exam="CALCBC"]');
  await expect(calc).toContainText("Grainger Engineering recommends taking MATH 231");
  const math = req(page, "foundational-mathematics-and-science-13");
  await expect(math).toContainText("MATH 231");
  await expect(math).toContainText("PHYS 211");
  await expect(math).toHaveAttribute("data-status", "partial"); // MATH 221 is still required
  // 2026-2027 renumbered French: a 3 gives FR 203; a student who started in 2025 gets FR 103
  const fr = panel(page).locator('[data-exam="FR"]');
  await expect(fr).toContainText("FR 203");
  // the year's general notes, word for word, follow the year
  const notes = page.getByTestId("ap-year-notes");
  await expect(notes).toContainText("CITL's notes for 2026-2027");
  await expect(notes).toContainText("To see AP credit in your academic record, run a new DARS report.");
  await page.getByLabel("Starting term at Illinois").selectOption({ label: "Summer 2025, Fall 2025 or Spring 2026" });
  await expect(fr).toContainText("FR 103");
  await expect(page).toHaveURL(/y=2025/);
  await expect(notes).toContainText("CITL's notes for 2025-2026");
  await expect(notes).toContainText("The credit policies in effect when you first enrolled at Illinois are the ones that apply to you.");
});

test("375px: the AP panel doesn't make the page scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./degree/?p=computer-science-bs&a=CALCBC-5,CHEM-5,MUSTH-5-5,ENGLIT-4,ENGLANG-5&m=CS124");
  await expect(panel(page).locator('[data-exam="MUSTH"]')).toContainText("MUS 107");
  await expect(page.getByTestId("degree-progress")).toBeVisible();
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
});
