import { expect, test } from "@playwright/test";

// Map 3 (#95). Building locations and the map style are served by the test: each building RHET 105 or STAT 107 meets
// in gets its own spot along a line, and the "map" is a plain background, so nothing goes to OpenFreeMap.
const STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#eeeeee" } }] };

async function serveData(page: import("@playwright/test").Page) {
  const names = new Set<string>();
  for (const c of ["RHET/105", "STAT/107"]) {
    const course = await (await page.request.get(`./data/course/${c}.json`)).json();
    for (const t of Object.values(course.terms) as { sections: { meetings: { b: string }[] }[] }[])
      for (const s of t.sections) for (const m of s.meetings) if (m.b && m.b !== "Location Pending") names.add(m.b);
  }
  const buildings = Object.fromEntries([...names].map((b, i) => [b, { name: `Place ${b}`, short: null, lat: 40.1 + i * 0.001, lon: -88.23 }]));
  await page.route("**/data/buildings.json", (r) => r.fulfill({ json: { credit: "© OpenStreetMap contributors", osm_base: null, buildings } }));
  await page.route("**/data/transit.json", (r) => r.fulfill({ status: 404, body: "" }));
  await page.route("https://tiles.openfreemap.org/**", (r) => r.fulfill({ json: STYLE }));
}

test("no map code loads until a day's map is opened; then its stops are in class order and match the list", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const mapRequests: string[] = [];
  page.on("request", (r) => {
    if (/maplibre|openfreemap/i.test(r.url())) mapRequests.push(r.url());
  });
  await serveData(page);

  await page.goto("./schedule/?c=RHET105,STAT107");
  await page.getByRole("button", { name: "Generate schedules" }).click();
  await expect(page.getByTestId("schedule-result")).toBeVisible();
  await page.getByRole("tab", { name: "Getting there" }).click();
  const showMap = page.getByRole("button", { name: /^Show \w+'s map$/ }).first();
  await expect(showMap).toBeVisible();
  expect(mapRequests).toEqual([]); // the builder and the tab are open, no map yet

  await showMap.click();
  const map = page.getByTestId("day-map");
  await expect(map).toBeVisible();
  await expect.poll(() => mapRequests.some((u) => /maplibre/i.test(u))).toBe(true);
  // the map drew (or, without WebGL, said so) and the list beside it numbers the stops in time order
  await expect(page.getByTestId("day-map-canvas").or(map.getByText("can’t draw the map"))).toBeVisible();
  const stops = map.getByTestId("map-stop");
  const n = await stops.count();
  expect(n).toBeGreaterThan(0);
  const items = await stops.evaluateAll((els) =>
    els.map((e) => ({ n: Number(e.getAttribute("data-n")), name: e.getAttribute("data-name")!, text: (e as HTMLElement).innerText })),
  );
  expect(items.map((x) => x.n)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
  const times = items.map((x) => {
    const m = x.text.match(/(\d{1,2}):(\d{2})(am|pm)/)!;
    return ((Number(m[1]) % 12) + (m[3] === "pm" ? 12 : 0)) * 60 + Number(m[2]);
  });
  expect(times).toEqual([...times].sort((a, b) => a - b));
  for (const x of items) expect(x.text).toContain("Place ");
  if (n > 1) await expect(stops.first()).toContainText("min walk to 2");
  // the map's label names the same stops in the same order
  const canvas = page.getByTestId("day-map-canvas");
  if (await canvas.count()) expect(await canvas.getAttribute("aria-label")).toContain(items.map((x) => `${x.n} ${x.name}`).join(", "));

  await page.getByRole("button", { name: /^Hide \w+'s map$/ }).click();
  await expect(map).toHaveCount(0);
  expect(errors).toEqual([]);
});
