import { expect, test, type Page } from "@playwright/test";

// Best bus line (#216). The test serves its own sections, buildings, timetable and map style: STAT 107 meets 1.6 km
// north of "Test Hall" and RHET 105 2.8 km north. The 22 runs north past both, the 5 only to the first.
const LON = -88.23;
const STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#eeeeee" } }] };
const BUILDINGS = {
  "North Test Hall": { name: "North Test Hall", short: null, lat: 40.1145, lon: LON },
  "Far Test Hall": { name: "Far Test Hall", short: null, lat: 40.125, lon: LON },
};
const every10 = () => Array.from({ length: 60 }, (_, i) => [420 + i * 10, 31]);
const TRANSIT = {
  credit: "Data provided by Champaign-Urbana Mass Transit District",
  feed: { version: "test", start: "2026-08-09", end: "2026-12-19" },
  week: {},
  routes: [
    ["5", "Green", "008000", "ffffff"],
    ["22", "Illini", "5a1d5a", "ffffff"],
  ],
  stops: [
    ["Test Hall stop", 40.1003, LON],
    ["North stop", 40.1147, LON],
    ["Far stop", 40.1248, LON],
  ],
  patterns: [
    { r: 1, h: "North", s: [0, 1, 2], o: [0, 5, 8], t: every10() },
    { r: 0, h: "North", s: [0, 1], o: [0, 5], t: every10() },
  ],
  homes: [{ name: "Test Hall", kind: "hall", lat: 40.1, lon: LON }],
};

async function fake(page: Page, path: string, start: number, building: string) {
  await page.route(`**/data/course/${path}.json`, async (route) => {
    const course = await (await route.fetch()).json();
    const base = course.terms["2027-sp"].sections.find((s: { component: string }) => s.component === "primary");
    course.terms["2027-sp"].sections = [{ ...base, crn: `8${start}`, code: "T1", component: "primary", group: "*", part: "1", status: "Open", meetings: [{ d: 1 | 4, s: start, e: start + 50, b: building, r: "100" }] }];
    await route.fulfill({ json: course });
  });
}

test("the best bus from where you live reaches the most classes, with the others to compare and the line on a map", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/data/transit.json", (r) => r.fulfill({ json: TRANSIT }));
  await page.route("**/data/buildings.json", (r) => r.fulfill({ json: { credit: "", osm_base: null, buildings: BUILDINGS } }));
  await page.route("https://tiles.openfreemap.org/**", (r) => r.fulfill({ json: STYLE }));
  await fake(page, "STAT/107", 540, "North Test Hall");
  await fake(page, "RHET/105", 660, "Far Test Hall");

  await page.goto("./schedule/?c=STAT107,RHET105&t=2027-sp");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  await page.getByRole("tab", { name: "Getting there" }).click();
  const there = page.getByTestId("getting-there");
  await expect(there.getByTestId("best-bus")).toHaveCount(0); // nothing until you pick where you live
  await there.getByTestId("home-picker").selectOption("Test Hall");

  const best = there.getByTestId("best-bus");
  await expect(best.getByTestId("best-bus-line")).toContainText("22 Illini from Test Hall stop");
  await expect(best.getByTestId("best-bus-line")).toContainText("2 of your 2 classes");
  await expect(best.getByTestId("best-bus-stops")).toContainText("RHET 105 at Far Test Hall: get off at Far stop");
  await expect(best.getByTestId("best-bus-stops")).toContainText("STAT 107 at North Test Hall: get off at North stop");
  await expect(best.getByTestId("best-bus-others")).toContainText("5 Green from Test Hall stop reaches 1");

  await best.getByRole("button", { name: "Show the line on the map" }).click();
  await expect(best.getByTestId("day-map-canvas").or(best.getByText("can’t draw the map"))).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
  expect(errors).toEqual([]);
});
