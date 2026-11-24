import { describe, expect, it } from "vitest";
import { bestLines, type BuildingMap, type Transit } from "@/lib/commute";

// Best bus line (#216). Home at the south end; two lines leave from a stop beside it. The 22 runs north past two
// class buildings, the 5 runs east to one. One more class is next door to home.
const LON = -88.23;
const HOME = { name: "Your pin", lat: 40.1, lon: LON };
const B: BuildingMap = {
  "North A": { name: "North A Hall", short: null, lat: 40.112, lon: LON },
  "North B": { name: "North B Hall", short: null, lat: 40.118, lon: LON },
  "East C": { name: "East C Hall", short: null, lat: 40.1, lon: -88.212 },
  "Next Door": { name: "Next Door Hall", short: null, lat: 40.1006, lon: LON },
};
const T: Transit = {
  credit: "",
  feed: { version: "t", start: null, end: null },
  week: {},
  routes: [
    ["5", "Green", "008000", "ffffff"],
    ["22", "Illini", "5a1d5a", "ffffff"],
  ],
  stops: [
    ["Home stop", 40.1003, LON],
    ["Stop A", 40.1118, LON],
    ["Stop B", 40.1178, LON],
    ["Stop C", 40.1003, -88.2122],
  ],
  patterns: [
    { r: 1, h: "North", s: [0, 1, 2], o: [0, 4, 7], t: [[480, 31]] },
    { r: 0, h: "East", s: [0, 3], o: [0, 5], t: [[480, 31]] },
    { r: 0, h: "East (weekends)", s: [0, 1], o: [0, 3], t: [[480, 96]] }, // Saturday and Sunday only: not counted
  ],
  homes: [],
};
const classes = [
  { course: "CS 124", b: "North A" },
  { course: "CS 124", b: "North A" }, // the same class on another day counts once
  { course: "MATH 231", b: "North B" },
  { course: "ECON 102", b: "North B" },
  { course: "PSYC 100", b: "East C" },
  { course: "RHET 105", b: "Next Door" },
  { course: "CHEM 102", b: "Nowhere" },
];

describe("bestLines", () => {
  it("ranks the line that reaches the most classes first and leaves nearby classes to walking", () => {
    const plan = bestLines(T, HOME, classes, B);
    expect(plan.total).toBe(5);
    expect(plan.missing).toEqual(["Nowhere"]);
    expect(plan.walk).toEqual([{ courses: ["RHET 105"], building: "Next Door Hall", walk: 2 }]);
    expect(plan.lines.map((l) => [l.route, l.courses])).toEqual([
      ["22 Illini", 3],
      ["5 Green", 1],
    ]);
    const best = plan.lines[0];
    expect(best).toMatchObject({ board: "Home stop", headsign: "North", color: "#5a1d5a" });
    expect(best.covered.map((c) => [c.building, c.stop, c.ride])).toEqual([
      ["North B Hall", "Stop B", 7],
      ["North A Hall", "Stop A", 4],
    ]);
    expect(best.path).toEqual([
      [LON, 40.1003],
      [LON, 40.1118],
      [LON, 40.1178],
    ]);
  });

  it("skips a bus that doesn't save walking, and says when nothing does", () => {
    const close = { "Mid": { name: "Mid Hall", short: null, lat: 40.1035, lon: LON } }; // a 6-minute walk
    expect(bestLines(T, HOME, [{ course: "CS 124", b: "Mid" }], close).lines).toEqual([]);
    expect(bestLines(T, { name: "far away", lat: 40.2, lon: LON }, classes, B).lines).toEqual([]); // no stop near home
  });

  it("counts the ride: a slow loop that beats the walk only on foot-minutes isn't suggested", () => {
    const loop = { ...T, patterns: [{ ...T.patterns[0], o: [0, 30, 40] }, ...T.patterns.slice(1)] };
    expect(bestLines(loop, HOME, classes, B).lines.map((l) => l.route)).toEqual(["5 Green"]);
  });

  it("lists a line MTD has under two route ids once", () => {
    const twice = { ...T, routes: [...T.routes, T.routes[1]], patterns: [...T.patterns, { ...T.patterns[0], r: 2 }] };
    expect(bestLines(twice, HOME, classes, B).lines.map((l) => l.route)).toEqual(["22 Illini", "5 Green"]);
  });
});
