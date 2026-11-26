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
  // the edited link opened as a new plan, "Shared plan" (#117), and each plan's calendar file has its name (#118)
  expect(dl.suggestedFilename()).toBe("illini-schedule-2027-sp-shared-plan.ics");
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
  await page.getByRole("button", { name: "Customize" }).click(); // the sliders fold away (#238)
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
  await page.getByRole("button", { name: "Customize" }).click(); // the sliders fold away (#238)
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
  await page.getByTestId("cart").locator("li", { hasText: "STAT 107" }).getByText(/^(Pick|Change) sections$/).click(); // the lock dropdowns fold away (#238)
  const lecture = page.getByLabel("Lock Lecture for STAT 107");
  await lecture.selectOption((await lecture.locator("option", { hasText: /^L1 LEC/ }).getAttribute("value"))!);
  await page.getByLabel("No classes before").selectOption("630");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("missing")).toContainText("your locked L1 LEC");
  await expect(page.getByTestId("missing")).toContainText("before 10:30am");
});

test("lunch break: the window and length can be changed and go into the share link (#56)", async ({ page }) => {
  await page.goto("./schedule/?c=STAT107&t=2027-sp");
  await page.getByTestId("more-options-toggle").click(); // lunch is under More options (#238)
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

test("credit hours: a running total, the 18-hour overload warning, and under 12 once a schedule is built (#82)", async ({ page }) => {
  await page.goto("./schedule/?c=CS124,CS128,CS225,RHET105,STAT107&t=2027-sp");
  const total = page.getByTestId("cart-hours");
  await expect(total).toContainText("Total: 18 credit hours in Spring 2027");
  await expect(page.getByTestId("hour-warning")).toHaveCount(0); // 18 is the limit, not over it

  await page.goto("./schedule/?c=CS124,CS128,CS225,RHET105,STAT107,MATH231&t=2027-sp");
  await expect(total).toContainText("Total: 21 credit hours");
  const over = page.locator('[data-testid="hour-warning"][data-kind="over"]');
  await expect(over).toContainText("over the 18-hour limit for Spring 2027, so your college office has to approve an overload");
  await expect(over.getByRole("link", { name: "Registrar's limits" })).toHaveAttribute("href", /registrar\.illinois\.edu\/registration\/registration-process\/max-min-enrollment-levels/);

  // a light cart says nothing until a schedule is built, then flags full-time
  await page.goto("./schedule/?c=CS124,STAT200&t=2027-sp");
  await expect(total).toContainText("Total: 6 credit hours");
  await expect(page.getByTestId("hour-warning")).toHaveCount(0);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.locator('[data-testid="hour-warning"][data-kind="under"]')).toContainText("6 credit hours: under 12, so you wouldn't be full-time");
  await expect(page.getByTestId("schedule-stats")).toContainText("Credit hours");
});

test("finals week: three finals in 24 hours is flagged with the Student Code rule, in the table and the .ics (#83)", async ({ page }) => {
  // Spring finals aren't published until mid-term, so give each course a final on the same Monday
  const finals: Record<string, [string, number, number, string][]> = {
    "CS/124": [["2027-05-10", 480, 660, "Combined"], ["2027-05-12", 480, 660, "Conflict"]],
    "STAT/107": [["2027-05-10", 810, 990, "Non Combined"]],
    "RHET/105": [["2027-05-10", 1140, 1320, "Combined"]],
  };
  for (const [path, fx] of Object.entries(finals))
    await page.route(`**/data/course/${path}.json`, async (route) => {
      const course = await (await route.fetch()).json();
      for (const s of course.terms["2027-sp"].sections) s.fx = fx;
      await route.fulfill({ json: course });
    });
  await page.goto("./schedule/?c=CS124,STAT107,RHET105&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(3);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("warnings")).toContainText("Three finals within 24 hours: CS 124 (Mon, May 10, 8:00am), STAT 107 (Mon, May 10, 1:30pm) and RHET 105 (Mon, May 10, 7:00pm).");

  await page.getByRole("tab", { name: "Finals week" }).click();
  const fw = page.getByTestId("finals-week");
  await expect(fw.locator('[data-date="2027-05-10"]')).toContainText("3 finals");
  const conflict = page.getByTestId("exam-conflicts").locator('[data-kind="three-in-24h"]');
  await expect(conflict).toContainText("CS 124 or RHET 105, whichever has more students, offers it"); // combined exams rank below STAT 107's
  await expect(conflict.getByRole("link", { name: "Student Code § 3-201" })).toHaveAttribute("href", "https://studentcode.illinois.edu/article3/part2/3-201");
  await expect(fw.locator("[data-conflict]")).toHaveCount(3);
  await expect(page.getByTestId("compare-finals").first()).toHaveText("1 conflict");

  // the .ics carries the finals unless the box is unticked
  const box = page.getByLabel("Include final exams in the .ics");
  await expect(box).toBeChecked();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .ics" }).click()]);
  const text = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
  expect(text).toContain("SUMMARY:CS 124 final exam");
  expect(text).toContain("DTSTART;TZID=America/Chicago:20270510T190000");

  await page.getByRole("tab", { name: "Week", exact: true }).click();
  await expect(fw).toBeHidden();
});

test("finals week before the Registrar publishes finals says so (#85)", async ({ page }) => {
  await page.route("**/data/course/STAT/200.json", async (route) => {
    const course = await (await route.fetch()).json();
    for (const s of course.terms["2027-sp"].sections) delete s.fx;
    await route.fulfill({ json: course });
  });
  await page.goto("./schedule/?c=STAT200&t=2027-sp");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await page.getByRole("tab", { name: "Finals week" }).click();
  await expect(page.getByTestId("finals-week")).toContainText("No final exams are listed for Spring 2027 yet");
  await expect(page.getByLabel("Include final exams in the .ics")).toHaveCount(0);
});

test("registration backups: each section has a backup with its CRN, and one click swaps it in (#74)", async ({ page }) => {
  await page.goto("./schedule/?c=CS124,RHET105&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  const rows = page.getByTestId("schedule-sections").locator("li");
  await expect(rows.first()).toBeVisible();
  // the first RHET 105 row has a backup line with a CRN to copy
  const statRow = rows.filter({ hasText: "RHET 105" }).first();
  const backup = statRow.getByTestId("backup");
  await expect(backup).toContainText("Backup:");
  const before = (await statRow.locator("span.w-24").nth(1).textContent())!.trim();
  const swap = backup.getByRole("button", { name: /^Use .* instead of / });
  const label = (await swap.getAttribute("aria-label"))!;
  const newCode = /^Use (.+?) instead of /.exec(label)![1];
  await swap.click();
  // the schedule now has the backup, locked into the share link, and the old section is offered as a backup
  const statRow2 = page.getByTestId("schedule-sections").locator("li").filter({ hasText: "RHET 105" }).first();
  await expect(statRow2).toContainText(newCode.split(" + ")[0]);
  await expect(page).toHaveURL(/RHET105(!|%21)\d{5}/);
  // the swap is a lock, so it survives a reload and goes into the share link
  await page.reload();
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-sections").locator("li").filter({ hasText: "RHET 105" }).first()).toContainText(newCode.split(" + ")[0]);
  expect(before).not.toBe("");
});

test("a chosen section that closes during registration is flagged with its backup, from the live feed (#77)", async ({ page }) => {
  let closedCrn: string | null = null;
  await page.route("https://raw.githubusercontent.com/**", (r) =>
    r.fulfill({
      json: { updated: new Date().toISOString(), window_hours: 1, checked: {}, events: [], seen: closedCrn ? { "2027-sp": { [closedCrn]: ["Closed", new Date().toISOString()] } } : {} },
    }),
  );
  await page.goto("./schedule/?c=CS124,RHET105&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  const statRow = page.getByTestId("schedule-sections").locator("li").filter({ hasText: "RHET 105" }).first();
  await expect(statRow).toBeVisible();
  closedCrn = /Copy (\d{5})/.exec((await statRow.getByRole("button", { name: /^Copy \d{5}$/ }).first().getAttribute("aria-label"))!)![1];
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const banner = page.getByTestId("just-closed");
  await expect(banner).toContainText(/RHET 105 \S+ just closed/);
  await expect(banner).toContainText("Backup:");
  await banner.getByRole("button", { name: "Use the backup" }).click();
  await expect(page.getByTestId("schedule-sections").locator("li").filter({ hasText: "RHET 105" }).first()).not.toContainText(closedCrn);
});

test("375px: backup lines don't make the schedule scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./schedule/?c=CS124,RHET105,CS128&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(3);
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("backup").first()).toBeVisible();
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
});

test("restrictions: About you decides which sections are left out, and the reason is Course Explorer's own words (#78)", async ({ page }) => {
  // a junior Finance major; CS 124 AL1 is restricted to CS majors, AL2 is not intended for them
  await page.addInitScript(() => {
    if (!localStorage.getItem("illini-scheduler:mycourses:v1")) localStorage.setItem("illini-scheduler:mycourses:v1", JSON.stringify({ c: "", p: "finance-bs", n: "", x: [] }));
  });
  await page.goto("./schedule/?c=CS124&t=2027-sp");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(1);
  const about = page.getByTestId("about-you");
  await page.getByTestId("more-options-toggle").click(); // About you is under More options (#238)
  await expect(about.getByTestId("about-major")).toContainText("Finance, BS (Gies College of Business)");
  await page.getByLabel("Student level").selectOption("undergrad");
  await page.getByLabel("Class standing").selectOption("junior");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  const rows = page.getByTestId("schedule-sections").locator("li");
  await expect(rows.first()).toBeVisible();
  // the CS-majors lecture is never picked; the one for non-majors is, and it counts as yours
  await expect(rows.filter({ hasText: "AL1" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "AL2" }).getByTestId("restriction")).toHaveAttribute("data-status", "ok");
  // turning the must-have off brings AL1 back, flagged with its reason
  await page.getByLabel("Only sections I can register for").uncheck();
  await expect(page).toHaveURL(/eo=0/);
  await page.getByTestId("cart").locator("li", { hasText: "CS 124" }).getByText(/^(Pick|Change) sections$/).click(); // the lock dropdowns fold away (#238)
  const lec = page.getByLabel("Lock Lecture for CS 124");
  await lec.selectOption({ label: (await lec.locator("option", { hasText: "AL1" }).first().textContent())!.trim() });
  await expect(page.getByTestId("warnings")).toContainText("is locked, but its restriction leaves you out: Restricted to CS and blended CS majors students.");
  await expect(rows.filter({ hasText: "AL1" }).getByTestId("restriction")).toHaveAttribute("data-status", "no");
  // About you stays in this browser: not in the share link
  await expect(page).not.toHaveURL(/junior|finance/);
});

test("restrictions on the course page follow About you (#81)", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("illini-scheduler:mycourses:v1", JSON.stringify({ c: "", p: "computer-science-bs", n: "", x: [] }));
    localStorage.setItem("illini-scheduler:about-you:v1", JSON.stringify({ level: "undergrad", standing: "sophomore" }));
  });
  await page.goto("./course/CS/124/");
  const rows = page.locator('[id^="crn-"]');
  await expect(rows.first()).toBeVisible(); // the course file has loaded
  const forMajors = rows.filter({ hasText: "Restricted to CS and blended CS majors" }).first();
  const notForMajors = rows.filter({ hasText: "Not intended for CS and blended CS majors" }).first();
  await expect(notForMajors.getByTestId("restriction")).toHaveAttribute("data-status", "no"); // CS 124 has a non-majors lecture every term
  if (await forMajors.count()) await expect(forMajors.getByTestId("restriction")).toHaveAttribute("data-status", "ok");
});
