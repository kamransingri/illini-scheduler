import { expect, test } from "@playwright/test";

// Degree checklist: each course option steps through its next-term professors, and the row's GPA, score, RMP and open
// lectures follow the one shown. STAT 107 gets three made-up professors for the test.
const PROFS = [
  { k: "xu|a", name: "Ada Xu", d: 0.2, dn: 900, g: 3.71, rmp: [4.6, 2.1, 90, 40], open: [1, 2] },
  { k: "yates|b", name: "Ben Yates", d: -0.3, dn: 800, g: 3.2, rmp: [3.1, 3.5, 50, 12], open: [0, 1] },
  { k: "zane|c", name: "Cy Zane", d: null, dn: 0, g: null, rmp: null, open: [1, 1] },
];
// what the row shows for each: GPA (theirs, or the course's), RMP, open lectures
const SHOWS: Record<string, [string, string, string]> = { "Ada Xu": ["3.71", "4.6", "1 of 2"], "Ben Yates": ["3.20", "3.1", "0 of 1"], "Cy Zane": ["3.50", "–", "1 of 1"] };

test("degree checklist: step through a course's professors, and its GPA, score, RMP and open lectures follow", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/data/degrees/gened-courses.json", async (route) => {
    const data = await (await route.fetch()).json();
    data["STAT 107"] = { ...data["STAT 107"], nx: 1, nSec: 4, nOpen: 2, known: true, gpa: 3.5, gn: 5000, profs: PROFS };
    await route.fulfill({ json: data });
  });
  await page.goto("./degree/?p=finance-data-science");
  const group = page.locator('[data-group="ds-fundamentals"]');
  const row = group.locator('[data-code="STAT 107"]');
  await expect(row).toBeVisible();
  await expect(page.getByText(/Best professor/)).toHaveCount(0);
  await expect(group.getByText("Professor", { exact: true }).first()).toBeAttached();

  const stepper = row.getByTestId("prof-stepper");
  await expect(stepper).toContainText("1 of 3, best");
  const seen: string[] = [];
  const scores: string[] = [];
  for (let i = 0; i < 3; i++) {
    const shown = (await row.textContent())!;
    const who = Object.keys(SHOWS).find((n) => shown.includes(n))!;
    expect(who, `step ${i}`).toBeTruthy();
    expect(seen).not.toContain(who);
    seen.push(who);
    const [gpa, rmp, open] = SHOWS[who];
    await expect(row).toContainText(gpa);
    await expect(row).toContainText(rmp);
    await expect(row).toContainText(open);
    await expect(stepper).toContainText(`${i + 1} of 3`);
    scores.push((await row.locator(".text-lg").first().textContent()) ?? "");
    await stepper.getByRole("button", { name: "Next professor for STAT 107" }).click();
  }
  expect(seen[0]).toBe("Ada Xu"); // the best one comes first
  expect(new Set(scores).size).toBeGreaterThan(1); // the score changes with the professor
  // it wraps around, and Previous goes back
  await expect(stepper).toContainText("1 of 3, best");
  await expect(row).toContainText("Ada Xu");
  await stepper.getByRole("button", { name: "Previous professor for STAT 107" }).click();
  await expect(row).toContainText(seen[2]);
  await expect(stepper).toContainText("3 of 3");
});
