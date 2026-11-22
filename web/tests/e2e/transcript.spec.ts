import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Transcript and DARS import (#20): pasted text is previewed, applied to My courses, and never leaves the page.
const fixture = (f: string) => fs.readFileSync(path.join(__dirname, "../unit/fixtures/transcript", f), "utf8");

test("paste a transcript, preview it, apply it, and the checklist updates", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => sent.push(r.url() + (r.postData() ?? "")));
  // CS 128 already in My courses as in progress; an AP CS Principles score gives estimated credit
  await page.goto("./degree/?p=computer-science-bs&m=CS128~p&a=CSP-4");
  const progress = page.getByTestId("degree-progress");
  await expect(progress).toBeVisible();
  const before = await progress.innerText();

  await page.getByRole("button", { name: "Paste your transcript or DARS audit" }).click();
  await page.getByRole("textbox", { name: "Pasted transcript or DARS audit" }).fill(fixture("self-service.txt"));
  await page.getByRole("button", { name: "Read courses" }).click();
  const preview = page.getByTestId("transcript-preview");
  await expect(page.getByTestId("transcript-summary")).toHaveText("Adds 13, updates 1 (3 in progress).");
  await expect(preview).toContainText("CS 128: In progress → Completed");
  await expect(page.getByTestId("transcript-skipped")).toContainText("ECON 1-- (Fall 2024): elective credit, not a single course");
  await expect(page.getByTestId("transcript-unreadable")).toContainText("ENG 100");
  // the transcript's AP credit replaces the estimate's
  await expect(page.getByTestId("transcript-replaces")).toContainText("switch off");

  // leave one course out
  await preview.getByRole("checkbox", { name: /^RHET 105/ }).uncheck();
  await preview.getByRole("button", { name: "Apply to My courses" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Done:" })).toContainText("added 12 courses, updated 1, switched off");
  await expect(page.getByTestId("transcript-preview")).toHaveCount(0);

  const mine = page.getByTestId("my-courses");
  await expect(mine).toContainText("CS 225");
  await expect(mine).toContainText("MATH 257");
  await expect(mine).not.toContainText("RHET 105");
  await expect(page).toHaveURL(/CS225(~|%7E)p/);
  await expect(page).toHaveURL(/MATH220(~|%7E)c/);
  await expect(progress).not.toHaveText(before);

  // nothing pasted went over the network
  expect(sent.some((s) => /Discrete|Orientation|Academic(%20|\+| )History|Good(%20|\+| )Standing/i.test(s))).toBe(false);
});

test("a DARS audit reads the same courses", async ({ page }) => {
  await page.goto("./degree/?p=computer-science-bs");
  await expect(page.getByTestId("degree-progress")).toBeVisible();
  await page.getByRole("button", { name: "Paste your transcript or DARS audit" }).click();
  await page.getByRole("textbox", { name: "Pasted transcript or DARS audit" }).fill(fixture("dars.txt"));
  await page.getByRole("button", { name: "Read courses" }).click();
  await expect(page.getByTestId("transcript-summary")).toHaveText("Adds 10, updates 0 (2 in progress).");
  await expect(page.getByTestId("transcript-unreadable")).toContainText("FA25 STAT 4 3.0 A MALFORMED NUMBER");
  await page.getByRole("button", { name: "Apply to My courses" }).click();
  await expect(page).toHaveURL(/CS173(%2C|,|&|$)/);
});
