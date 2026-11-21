import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Score import (#199, #200): pasted AP and IB results give the same credit as typing each exam, and never leave the page.
const fixture = (f: string) => fs.readFileSync(path.join(__dirname, "../unit/fixtures/scoreimport", f), "utf8");
const panel = (page: Page) => page.getByTestId("ap-credit");

async function paste(page: Page, text: string) {
  const sent: string[] = [];
  page.on("request", (r) => sent.push(r.url() + (r.postData() ?? "")));
  await page.getByRole("button", { name: "Paste your AP or IB scores" }).click();
  await page.getByRole("textbox", { name: "Pasted scores" }).fill(text);
  await page.getByRole("button", { name: "Read scores" }).click();
  return sent;
}

test("pasted AP scores preview, apply, and match typing the same exams", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science");
  await expect(page.getByRole("combobox", { name: "AP exam", exact: true })).toBeEnabled();
  const sent = await paste(page, fixture("ap-college-board.txt"));
  const preview = page.getByTestId("score-preview");
  await expect(preview).toContainText("7 AP exams found, 1 not recognised");
  await expect(preview).toContainText("AP Chemistry was taken 2 times");
  await expect(page.getByTestId("score-unknown")).toContainText("AP Underwater Basket Weaving");
  await preview.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("status")).toContainText("Added 7 AP exams.");
  await expect(panel(page).locator('[data-exam="CALCBC"]')).toContainText("MATH 231");
  const pasted = await panel(page).innerText();

  await page.goto("./degree/?p=finance-data-science&a=CALCBC-5-5,CHEM-4,ENGLANG-4,PHYSCM-3,BIO-3,USHIST-5,CSP-4");
  await expect(panel(page).locator('[data-exam="CALCBC"]')).toContainText("MATH 231");
  expect(await panel(page).innerText()).toBe(pasted);
  expect(sent.some((s) => s.includes("Underwater") || s.includes("Calculus AB Subscore"))).toBe(false);
});

test("pasted IB results skip the diploma core and match typing them", async ({ page }) => {
  await page.goto("./degree/?p=finance-data-science");
  await expect(page.getByRole("combobox", { name: "AP exam", exact: true })).toBeEnabled();
  const sent = await paste(page, fixture("ib-results.txt"));
  const preview = page.getByTestId("score-preview");
  await expect(preview).toContainText("6 IB exams found, 1 not recognised");
  await expect(preview).toContainText("Not used for credit: THEORY OF KNOWLEDGE B, EXTENDED ESSAY A, Total points 41.");
  await preview.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/MATHAA-HL-7/);
  const pasted = await panel(page).innerText();

  await page.goto(`./degree/?p=finance-data-science&i=${encodeURIComponent("ENGLAL-SL-6,MATHAA-HL-7,PHYS-HL-6,ECON-HL-5,SPANB-SL-6,PSYCH-SL-5")}`);
  await expect(panel(page)).toContainText("Mathematics: Analysis and Approaches");
  expect(await panel(page).innerText()).toBe(pasted);
  expect(sent.some((s) => s.includes("SANSKRIT") || s.includes("THEORY OF KNOWLEDGE"))).toBe(false);
});
