import { expect, test } from "@playwright/test";

async function addViaSearch(page: import("@playwright/test").Page, q: string) {
  const box = page.getByLabel(/Search courses/);
  await box.fill(q);
  const list = page.getByRole("listbox");
  await list.getByRole("button", { name: "Add to schedule" }).first().click();
  await box.fill("");
}

test("CS 124 + MATH 221 + RHET 105 + STAT 107, no 8am: no schedule has an 8am class", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("./schedule/");
  await addViaSearch(page, "cs124");
  await addViaSearch(page, "rhet105");
  await addViaSearch(page, "stat107");
  // MATH 221 isn't offered in Spring 2027, so search shows no add button; add it through a shared link instead
  const url = new URL(page.url());
  url.searchParams.set("c", `${url.searchParams.get("c")},MATH221`);
  await page.goto(url.toString());
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(4);
  await expect(page.getByTestId("warnings")).toContainText("MATH 221 is not offered in Spring 2027");
  await page.getByLabel("No classes before").selectOption("540");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  await expect(page.getByTestId("summary")).toContainText("Expected GPA");
  const counter = await page.getByText(/Schedule 1 of \d+/).textContent();
  const n = Number(counter!.match(/of (\d+)/)![1]);
  expect(n).toBeGreaterThan(1);
  for (let i = 0; i < n; i++) {
    const starts = await page.getByTestId("schedule-sections").locator("li").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-start"))));
    for (const s of starts) expect(s).toBeGreaterThanOrEqual(540);
    if (i < n - 1) await page.getByRole("button", { name: "Next schedule" }).click();
  }
  // export: .ics download works
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .ics" }).click()]);
  expect(dl.suggestedFilename()).toBe("illini-schedule-2027-sp.ics");
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
  expect(errors).toEqual([]);
});

test("cart survives reload and the URL is shareable", async ({ page }) => {
  await page.goto("./schedule/?c=CS124,STAT107&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.goto("./schedule/");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await expect(page).toHaveURL(/c=CS124%2CSTAT107/); // the URL is written just after the list renders
});

test("6-course cart generates quickly in the browser", async ({ page }) => {
  await page.goto("./schedule/?c=PHYS211,RHET105,CHEM102,MATH231,CS124,ECON102&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Generate schedules" })).toBeEnabled();
  await page.waitForTimeout(500);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(2000);
});

test("empty cart shows guidance, not a blank page", async ({ page }) => {
  await page.goto("./schedule/?c=");
  await expect(page.getByText("Your cart is empty")).toBeVisible();
});

test("sections to watch: a schedule that needs closed sections lists them and links to Just opened (#27)", async ({ page }) => {
  // every STAT 107 section closed, as after a busy registration day
  await page.route("**/data/course/STAT/107.json", async (route) => {
    const course = await (await route.fetch()).json();
    for (const t of Object.values(course.terms) as { sections: { status: string }[] }[]) for (const s of t.sections) s.status = "Closed";
    await route.fulfill({ json: course });
  });
  await page.goto("./schedule/?c=STAT107,RHET105&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  const watch = page.getByTestId("watch-list");
  await expect(watch).toBeVisible();
  await expect(watch).toContainText(/needs (a section that was|\d+ sections that were) Closed/);
  const rows = watch.locator("li");
  expect(await rows.count()).toBeGreaterThan(0);
  for (const t of await rows.allTextContents()) expect(t).toContain("STAT 107");
  await expect(watch.getByRole("link", { name: "Self-Service" })).toHaveAttribute("href", /^https:/);
  // watch one (#15): it's on Just opened's list
  await rows.first().getByRole("button", { name: /^Watch STAT 107 / }).click();
  await expect(rows.first().getByRole("button", { name: /^Watching STAT 107 / })).toHaveAttribute("aria-pressed", "true");
  await expect(watch.getByRole("link", { name: "your watched sections" })).toHaveAttribute("href", /\/opened\/\?watch=1$/);
  await watch.getByRole("link", { name: "Just opened" }).click();
  await expect(page).toHaveURL(/\/opened\/\?mine=1$/);
  await expect(page.getByLabel(/Only my schedule's courses/)).toBeChecked();
  const watched = page.getByTestId("watched").getByTestId("watched-row");
  await expect(watched).toContainText("STAT 107");
  await expect(watched).toContainText(/checked/); // its course file has loaded (through the route above)
});

test("Best professor: the top schedule takes the lecture of the course page's best pick (#49)", async ({ page }) => {
  // the course page's best pick for STAT 107 next term
  await page.goto("./course/STAT/107/");
  const firstRow = page.getByTestId("prof-row").first();
  await expect(firstRow).toContainText(/Best pick \d+/);
  const bestName = (await firstRow.getByRole("button").first().textContent())!.trim();
  const bestScore = (await firstRow.getByText(/Best pick \d+/).first().textContent())!.match(/\d+/)![0];
  // only "Best professor" on (weights: gpa, rmp, early, daysOff, compact, walking, late, open, prof)
  await page.goto("./schedule/?c=STAT107&t=2027-sp&w=000000003");
  await expect(page.getByRole("slider", { name: "Best professor" })).toHaveValue("3");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  const pick = page.getByTestId("schedule-sections").getByTestId("prof-pick").first();
  await expect(pick).toHaveAttribute("data-best", "true");
  await expect(pick).toContainText(`Best pick, ${bestScore}`);
  await expect(page.getByTestId("schedule-sections").getByTestId("prof-pick")).toHaveCount(1); // on the lecture only, not its lab
  expect((await pick.getAttribute("title"))!.startsWith(`${bestName}: best-pick score ${bestScore} of 100`)).toBe(true);
});

test("the Best professors preset turns the priority up, and an old 8-digit link keeps it at its default", async ({ page }) => {
  await page.goto("./schedule/?c=STAT107&t=2027-sp&w=21101101");
  await expect(page.getByRole("slider", { name: "Best professor" })).toHaveValue("2");
  await page.getByRole("button", { name: "Best professors" }).click();
  await expect(page.getByRole("slider", { name: "Best professor" })).toHaveValue("3");
});

test("lock a section from the results: the same schedule stays open and every schedule keeps it (#67)", async ({ page }) => {
  await page.goto("./schedule/?c=CS124,STAT107&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  await page.getByRole("button", { name: "Next schedule" }).click();
  const rows = page.getByTestId("schedule-sections").locator("li");
  const ranked = page.getByText(/ranked from/);
  const before = { rows: await rows.allTextContents(), ranked: (await ranked.textContent())! };
  const lock = page.getByRole("button", { name: /^Lock STAT 107 L\d$/ });
  const name = (await lock.getAttribute("aria-label"))!;
  const locked = page.getByRole("button", { name, exact: true });
  await lock.click();
  await expect(locked).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Lock Lecture for STAT 107")).not.toHaveValue("");
  await expect(page).toHaveURL(/STAT107%21\d{5}/);
  await expect(ranked).not.toHaveText(before.ranked); // regenerated: fewer combinations
  expect(await rows.allTextContents()).toEqual(before.rows);
  const prev = page.getByRole("button", { name: "Previous schedule" });
  while (await prev.isEnabled()) await prev.click();
  const n = Math.min(5, Number((await page.getByText(/Schedule \d+ of \d+/).textContent())!.match(/of (\d+)/)![1]));
  for (let i = 0; i < n; i++) {
    await expect(locked).toHaveAttribute("aria-pressed", "true");
    if (i < n - 1) await page.getByRole("button", { name: "Next schedule" }).click();
  }
  await locked.click();
  await expect(locked).toHaveAttribute("aria-pressed", "false");
  await expect(page).not.toHaveURL(/STAT107%21/);
});

test("a locked section that breaks a must-have is named with the rule it breaks (#67)", async ({ page }) => {
  await page.goto("./schedule/?c=STAT107&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(1);
  const lecture = page.getByLabel("Lock Lecture for STAT 107");
  await lecture.selectOption((await lecture.locator("option", { hasText: /^L1 LEC/ }).getAttribute("value"))!);
  await page.getByLabel("No classes before").selectOption("630");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("missing")).toContainText("your locked L1 LEC");
  await expect(page.getByTestId("missing")).toContainText("before 10:30am");
});

test("lunch break: the window and length can be changed and go into the share link (#56)", async ({ page }) => {
  await page.goto("./schedule/?c=STAT107&t=2027-sp");
  await page.getByLabel("Keep a lunch break").check();
  await page.getByLabel("Lunch break length").selectOption("60");
  await page.getByLabel("Lunch window starts").selectOption("690");
  await expect(page).toHaveURL(/lm=60/);
  await expect(page).toHaveURL(/lf=690/);
  // the window can't end before the break fits
  const ends = await page.getByLabel("Lunch window ends").locator("option").evaluateAll((os) => os.map((o) => Number((o as HTMLOptionElement).value)));
  expect(Math.min(...ends)).toBeGreaterThanOrEqual(750);
  await page.reload();
  await expect(page.getByLabel("Lunch break length")).toHaveValue("60");
  await expect(page.getByLabel("Lunch window starts")).toHaveValue("690");
});
