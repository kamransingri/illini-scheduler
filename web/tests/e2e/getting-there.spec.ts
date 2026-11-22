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

test("drop a pin for where you live: saved rounded, used for every trip, kept after a reload, not in the link (#96)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = await (await page.request.get("./data/course/RHET/105.json")).json();
  const names = new Set<string>();
  for (const t of Object.values(course.terms) as { sections: { meetings: { b: string }[] }[] }[])
    for (const s of t.sections) for (const m of s.meetings) if (m.b && m.b !== "Location Pending") names.add(m.b);
  const buildings = Object.fromEntries([...names].map((b) => [b, { name: b, short: null, lat: 40.115, lon: -88.2272 }]));
  await page.route("**/data/buildings.json", (r) => r.fulfill({ json: { credit: "", osm_base: null, buildings } }));
  await page.route("**/data/transit.json", (r) => r.fulfill({ status: 404, body: "" }));
  await page.route("https://tiles.openfreemap.org/**", (r) =>
    r.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#eeeeee" } }] } }),
  );

  await page.goto("./schedule/?c=RHET105");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await page.getByRole("tab", { name: "Getting there" }).click();
  await page.getByRole("button", { name: "Drop a pin" }).click();
  const picker = page.getByTestId("pin-picker");
  await expect(picker.getByRole("button", { name: "Use this spot" })).toBeDisabled();
  const canvas = page.getByTestId("pin-map-canvas");
  await expect(canvas).toHaveAttribute("data-ready", "1");
  // the map opens on the Illini Union (40.1092, -88.2272); the keyboard way puts the pin in its middle
  await picker.getByRole("button", { name: "Put the pin in the middle of the map" }).click();
  await picker.getByRole("button", { name: "Use this spot" }).click();
  await expect(picker).toHaveCount(0);

  const home = page.getByTestId("home-picker");
  await expect(home).toHaveValue("pin:40.109,-88.227");
  await expect(home.locator("option:checked")).toHaveText("Your pin");
  expect(await page.evaluate(() => localStorage.getItem("illini-scheduler:home:v1"))).toBe("pin:40.109,-88.227");
  await expect(page.locator('[data-testid="trip-leg"][data-kind="to-class"]').first()).toContainText("walk");
  await expect(page.locator('[data-testid="trip-leg"][data-kind="home"]').first()).toContainText("Your pin");
  expect(page.url()).not.toContain("pin");

  // clicking the map moves the pin too
  await page.getByRole("button", { name: "Move your pin" }).click();
  await expect(canvas).toHaveAttribute("data-ready", "1");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2 + 60, y: box.height / 2 } });
  await picker.getByRole("button", { name: "Use this spot" }).click();
  const moved = await page.evaluate(() => localStorage.getItem("illini-scheduler:home:v1"));
  expect(moved).toMatch(/^pin:40\.1\d\d,-88\.2\d\d$/);
  expect(moved).not.toBe("pin:40.109,-88.227");

  await page.reload();
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await page.getByRole("tab", { name: "Getting there" }).click();
  await expect(page.getByTestId("home-picker")).toHaveValue(moved!);
  expect(errors).toEqual([]);
});
