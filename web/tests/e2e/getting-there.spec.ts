import { expect, test } from "@playwright/test";

// Map 4 (#96). The bus timetable and building locations are served by the test, so it doesn't depend on which
// pipeline database the build used: every building RHET 105 meets in is put 1.7 km north of "Test Hall", with a
// stop beside each and a bus every 5 minutes, all week.
const LON = -88.23;

function every5(from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  for (let t = from; t <= to; t += 5) out.push([t, 127]);
  return out;
}

test("pick where you live, see the bus to class, and keep it after a reload, never in the link", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const course = await (await page.request.get("./data/course/RHET/105.json")).json();
  const names = new Set<string>();
  for (const t of Object.values(course.terms) as { sections: { meetings: { b: string }[] }[] }[])
    for (const s of t.sections) for (const m of s.meetings) if (m.b && m.b !== "Location Pending") names.add(m.b);
  expect(names.size).toBeGreaterThan(0);
  const buildings = Object.fromEntries([...names].map((b) => [b, { name: b, short: null, lat: 40.115, lon: LON }]));
  const transit = {
    credit: "Data provided by Champaign-Urbana Mass Transit District",
    feed: { version: "test", start: "2026-08-09", end: "2026-12-19" },
    week: {},
    routes: [["22", "Illini", "5a1d5a", "ffffff"]],
    stops: [
      ["Test Hall stop", 40.1003, LON],
      ["Campus stop", 40.1147, LON],
    ],
    patterns: [
      { r: 0, h: "North", s: [0, 1], o: [0, 6], t: every5(360, 1380) },
      { r: 0, h: "South", s: [1, 0], o: [0, 6], t: every5(360, 1380) },
    ],
    homes: [{ name: "Test Hall", kind: "hall", lat: 40.1, lon: LON }],
  };
  await page.route("**/data/transit.json", (r) => r.fulfill({ json: transit }));
  await page.route("**/data/buildings.json", (r) => r.fulfill({ json: { credit: "© OpenStreetMap contributors", osm_base: null, buildings } }));

  await page.goto("./schedule/?c=RHET105");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  await page.getByRole("tab", { name: "Getting there" }).click();

  const there = page.getByTestId("getting-there");
  await expect(there).toContainText("Pick where you live");
  await there.getByTestId("home-picker").selectOption("Test Hall");
  // 1.7 km is a 28-minute walk; the bus takes 6 minutes, so the first trip of each day is by bus
  const first = there.getByTestId("trip-leg").first();
  await expect(first).toHaveAttribute("data-kind", "to-class");
  await expect(first).toHaveAttribute("data-bus", "1");
  await expect(first).toContainText("22 Illini");
  await expect(first).toContainText("Test Hall stop");
  await expect(there).toContainText("Data provided by Champaign-Urbana Mass Transit District");
  await expect(page.locator("body")).not.toContainText(/NaN|undefined/);

  // kept in this browser, not in the share link
  expect(page.url()).not.toContain("Test");
  await page.reload();
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await page.getByRole("tab", { name: "Getting there" }).click();
  await expect(page.getByTestId("home-picker")).toHaveValue("Test Hall");
  await expect(page.getByTestId("trip-leg").first()).toHaveAttribute("data-bus", "1");
  expect(errors).toEqual([]);
});

test("with no bus times or building locations, the tab says so instead of breaking", async ({ page }) => {
  await page.route("**/data/transit.json", (r) => r.fulfill({ status: 404, body: "" }));
  await page.route("**/data/buildings.json", (r) => r.fulfill({ json: { credit: "", osm_base: null, buildings: {} } }));
  await page.goto("./schedule/?c=RHET105");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await page.getByRole("tab", { name: "Getting there" }).click();
  const there = page.getByTestId("getting-there");
  await expect(there).toContainText("Bus times couldn’t be loaded");
  await expect(there).toContainText("No location yet for");
  await expect(there.getByTestId("trip-leg")).toHaveCount(0);
});
