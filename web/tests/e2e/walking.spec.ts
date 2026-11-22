import { expect, test, type Page } from "@playwright/test";

// Walking time (#94): STAT 107 at 9:00 in one building and RHET 105 at 10:00 (or 11:00) across campus. The buildings
// and sections are set here so the test doesn't depend on the real timetable.
const BUILDINGS = { "North Test Hall": { name: "North Test Hall", short: null, lat: 40.1138, lon: -88.2249 }, "South Test Hall": { name: "South Test Hall", short: null, lat: 40.1022, lon: -88.2224 } };

async function fake(page: Page, path: string, starts: number[], building: string) {
  await page.route(`**/data/course/${path}.json`, async (route) => {
    const course = await (await route.fetch()).json();
    const base = course.terms["2027-sp"].sections.find((s: { component: string }) => s.component === "primary");
    course.terms["2027-sp"].sections = starts.map((s, i) => ({ ...base, crn: `9${path.length}${i}0${s}`, code: `T${i}`, component: "primary", group: "*", part: "1", status: "Open", meetings: [{ d: 1, s, e: s + 50, b: building, r: "100" }] }));
    await route.fulfill({ json: course });
  });
}

test("a cross-campus walk with 10 minutes between classes is flagged, and the must-have skips it", async ({ page }) => {
  await page.route("**/data/buildings.json", (route) => route.fulfill({ json: { credit: "", osm_base: null, buildings: BUILDINGS } }));
  await fake(page, "STAT/107", [540], "North Test Hall");
  await fake(page, "RHET/105", [600, 660], "South Test Hall");
  await page.goto("./schedule/?c=STAT107,RHET105&t=2027-sp&w=000000000");
  await expect(page.getByTestId("cart").locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate schedules" }).click();

  // with every priority at 0 both schedules tie; find the one with the 10:00 section
  await expect(page.getByText(/Schedule 1 of 2/)).toBeVisible();
  const walks = page.getByTestId("rushed-walks");
  for (let i = 0; i < 2 && !(await walks.isVisible()); i++) await page.getByRole("button", { name: "Next schedule" }).click();
  await expect(walks).toContainText(/Mon: STAT 107 in North Test Hall to RHET 105 in South Test Hall, \d+ min walk, 10 min gap/);
  await expect(page.getByTestId("summary")).toContainText("1 rushed walk");

  await page.getByLabel("No rushed walks between classes").check();
  await expect(page.getByTestId("summary")).not.toContainText("rushed walk");
  await expect(walks).toHaveCount(0);
  await expect(page).toHaveURL(/nw=1/);
});
