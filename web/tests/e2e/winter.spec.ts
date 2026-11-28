import { expect, test, type APIRequestContext } from "@playwright/test";

// Winter session (#270): the gen-ed finder's Winter view, a line on course pages and winter in the search, all read from
// the build's winter.json (pipeline/summer.py). A build without a coming winter has none of them, so these tests skip.
type Winter = { term: string; label: string; upcoming: boolean; recent: string[]; courses: { s: string; n: string; t: string; page: boolean; codes: string[] }[] };

/** A winter course with a built page (a PAGES_LIMIT build has only some). */
async function winterPage(request: APIRequestContext, baseURL: string | undefined, w: Winter) {
  for (const c of w.courses.filter((r) => r.page)) if ((await request.get(new URL(`course/${c.s}/${c.n}/`, baseURL).toString())).ok()) return c;
  return null;
}

async function comingWinter(request: APIRequestContext, baseURL: string | undefined): Promise<Winter | null> {
  const r = await request.get(new URL("data/winter.json", baseURL).toString());
  if (!r.ok()) return null;
  const w = (await r.json()) as Winter;
  return w.upcoming ? w : null;
}

test("the gen-ed finder's Winter view lists winter classes, with no session filter", async ({ page, request, baseURL }) => {
  const w = await comingWinter(request, baseURL);
  test.skip(!w, "no coming winter in this build");
  await page.goto("./geneds/");
  const row = page.getByTestId("gened-term");
  // Winter comes right before the spring after it
  const labels = (await row.getByRole("button").allTextContents()).map((t) => t.split(",")[0]);
  const at = labels.indexOf(w!.label);
  expect(at).toBeGreaterThanOrEqual(0);
  expect(labels[at + 1]).toBe(`Spring ${w!.term.slice(0, 4)}`);

  await row.getByRole("button", { name: w!.label }).click();
  await expect(row.getByRole("button", { name: w!.label })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?term=winter/);
  await expect(page.getByTestId("summer-note")).toContainText(w!.label);
  await expect(page.getByLabel("Session", { exact: true })).toHaveCount(0);
  const table = page.getByTestId("summer-table");
  await expect(table.getByRole("columnheader", { name: "Winters" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Session" })).toHaveCount(0);
  // gen-eds only by default
  const genedCount = w!.courses.filter((r) => r.codes.length && Number(r.n) < 500).length;
  await expect(page.getByTestId("summer-count")).toHaveText(`${genedCount} of ${w!.courses.length} classes`);
  await page.getByLabel("Gen-ed", { exact: true }).selectOption("all");
  await expect(page).toHaveURL(/\?term=winter&gened=all/);

  // a reload keeps the Winter view
  await page.reload();
  await expect(row.getByRole("button", { name: w!.label })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Gen-ed", { exact: true })).toHaveValue("all");
});

test("a course page says when the course runs in winter", async ({ page, request, baseURL }) => {
  const w = await comingWinter(request, baseURL);
  test.skip(!w, "no coming winter in this build");
  const c = await winterPage(request, baseURL, w!);
  test.skip(!c, "no winter course page in this build");
  await page.goto(`./course/${c!.s}/${c!.n}/`);
  await expect(page.getByTestId("winter-line")).toContainText(`${w!.label}: Winter session`);
  await page.getByRole("link", { name: `Every winter ${c!.s} class` }).click();
  await expect(page).toHaveURL(new RegExp(`/geneds/\\?term=winter&q=${c!.s}&gened=all$`));
  await expect(page.getByTestId("summer-table").locator(`[data-course="${c!.s} ${c!.n}"]`)).toBeVisible();
});

test("the search marks courses that run in winter", async ({ page, request, baseURL }) => {
  const w = await comingWinter(request, baseURL);
  test.skip(!w, "no coming winter in this build");
  const c = w!.courses.find((r) => r.page)!;
  await page.goto("./");
  await page.getByLabel(/Search courses/).fill(`${c.s} ${c.n}`);
  await expect(page.getByRole("listbox").locator("li").first()).toContainText(w!.label);
});

test("375px: the Winter view doesn't make the page scroll sideways", async ({ page, request, baseURL }) => {
  const w = await comingWinter(request, baseURL);
  test.skip(!w, "no coming winter in this build");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("./geneds/?term=winter");
  await expect(page.getByTestId("summer-table")).toBeVisible();
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
});
