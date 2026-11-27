import { expect, test } from "@playwright/test";

// "Ask your AI" (#103): the button copies exactly the text the preview shows, on a course page and a schedule.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("a course page copies the summary shown in its preview", async ({ page }) => {
  const sent: string[] = [];
  await page.goto("./course/CS/124/");
  page.on("request", (r) => sent.push(r.url()));
  await page.getByRole("button", { name: "Ask your AI" }).click();
  const preview = page.getByTestId("ask-ai-text");
  await expect(preview).toContainText("CS 124:");
  await expect(preview).toContainText("Question:");
  await page.getByRole("button", { name: "Copy summary" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await preview.textContent());
  await expect(page.getByTestId("ask-ai").getByRole("link", { name: "Connect it to Illini Scheduler" })).toHaveAttribute("href", /\/ai\/$/);
  expect(sent.filter((u) => !u.startsWith(new URL(page.url()).origin))).toEqual([]); // nothing leaves the site
});

test("a schedule copies its sections and must-haves", async ({ page }) => {
  await page.goto("./schedule/?c=STAT107&t=2027-sp&e=540");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  await page.getByRole("button", { name: "Save or share" }).click(); // Ask your AI is in the Save or share menu (#239)
  await page.getByTestId("schedule-result").getByRole("button", { name: "Ask your AI" }).click();
  const preview = page.getByTestId("ask-ai-text");
  await expect(preview).toContainText("My Spring 2027 schedule");
  await expect(preview).toContainText(/STAT 107 \S+ LEC \(CRN \d{5}\)/);
  await expect(preview).toContainText("My must-haves: start 9:00am or later.");
  await page.getByRole("button", { name: "Copy summary" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await preview.textContent());
});
