import { describe, expect, it } from "vitest";
import { arriveBy, departAfter, homeChoices, metres, planDay, rides, walkMinutes, type BuildingMap, type Transit } from "@/lib/commute";

// A made-up line due north: home at the south end, a class building 1.7 km north, a stop beside each.
const LON = -88.23;
const HOME = { name: "Nugent Hall", lat: 40.1, lon: LON };
const B: BuildingMap = {
  "Far North Bldg": { name: "Far North Building", short: null, lat: 40.115, lon: LON },
  "Near Home Bldg": { name: "Near Home Building", short: null, lat: 40.1005, lon: LON },
};
const MON = 1;
const TUE = 2;
const SAT = 32;

function transit(over: Partial<Transit> = {}): Transit {
  return {
    credit: "Data provided by Champaign-Urbana Mass Transit District",
    feed: { version: "test", start: "2026-08-09", end: "2026-12-19" },
    week: {},
    routes: [["22", "Illini", "5a1d5a", "ffffff"]],
    stops: [
      ["Home stop", 40.1003, LON],
      ["North stop", 40.1147, LON],
    ],
    patterns: [
      // northbound: 6 minutes between the stops
      { r: 0, h: "North", s: [0, 1], o: [0, 6], t: [[570, 31], [585, 31], [600, MON], [540, SAT]] },
      // southbound
      { r: 0, h: "South", s: [1, 0], o: [0, 6], t: [[651, 31], [652, MON]] },
    ],
    homes: [{ name: "Nugent Hall", kind: "hall", lat: 40.1, lon: LON }],
    ...over,
  };
}

describe("distances", () => {
  it("measures metres and walking minutes", () => {
    expect(metres({ lat: 40.1, lon: LON }, { lat: 40.101, lon: LON })).toBeCloseTo(111.2, 0);
    // 1,668 m x 1.3 at 80 m/min = 27.1 -> 28 minutes
    expect(walkMinutes(HOME, B["Far North Bldg"])).toBe(28);
    expect(walkMinutes(HOME, HOME)).toBe(0);
  });
});

describe("rides", () => {
  it("finds one-bus rides that run that day, with the walk at each end", () => {
    const mon = rides(transit(), HOME, B["Far North Bldg"], MON);
    expect(mon.map((r) => r.board).sort((a, b) => a - b)).toEqual([570, 585, 600]); // northbound only, Saturday's left out
    const r = mon.find((x) => x.board === 585)!;
    expect(r).toMatchObject({ route: "22 Illini", color: "#5a1d5a", from: "Home stop", to: "North stop", alight: 591, walkTo: 1, walkFrom: 1 });
    expect(r.leave).toBe(583); // 1 min walk + 1 min early at the stop
    expect(r.arrive).toBe(592);
    expect(rides(transit(), HOME, B["Far North Bldg"], SAT).map((x) => x.board)).toEqual([540]);
  });

  it("picks the latest ride that arrives in time, and the soonest one after a time", () => {
    const rs = rides(transit(), HOME, B["Far North Bldg"], MON);
    expect(arriveBy(rs, 598)!.board).toBe(585); // class at 10:00, 2 minutes early
    expect(arriveBy(rs, 570)).toBeNull();
    expect(departAfter(rs, 580)!.board).toBe(585);
  });

  it("finds nothing when no stop is within walking distance", () => {
    const far = { name: "Far away", lat: 40.2, lon: LON };
    expect(rides(transit(), far, B["Far North Bldg"], MON)).toEqual([]);
  });
});

describe("planDay", () => {
  const day = [
    { course: "CS 124", s: 600, e: 650, b: "Far North Bldg" },
    { course: "RHET 105", s: 660, e: 710, b: "Near Home Bldg" },
  ];

  it("plans home to class, class to class and back home", () => {
    const { legs, missing } = planDay(day, HOME, B, transit(), MON);
    expect(missing).toEqual([]);
    expect(legs.map((l) => l.kind)).toEqual(["to-class", "between", "home"]);
    // 28 minutes on foot against a 9-minute bus: take the 9:45
    expect(legs[0]).toMatchObject({ walk: 28, leave: 583, arrive: 592, late: 0 });
    expect(legs[0].ride!.board).toBe(585);
    // 10 minutes between classes 1.6 km apart: only the 10:52 Monday bus makes it
    expect(legs[1].ride!.board).toBe(652);
    expect(legs[1]).toMatchObject({ late: 0, arrive: 659 });
    // the last class is next door: walk
    expect(legs[2]).toMatchObject({ ride: null, walk: 1, arrive: 711 });
  });

  it("says how late you'd be when no bus makes it", () => {
    const { legs } = planDay(day, HOME, B, transit(), TUE); // the 10:52 runs on Mondays only
    expect(legs[1].ride).toBeNull();
    expect(legs[1].late).toBe(650 + legs[1].walk - 660);
  });

  it("walks when there are no bus times, and without a home plans only between classes", () => {
    const { legs } = planDay(day, null, B, null, MON);
    expect(legs.map((l) => l.kind)).toEqual(["between"]);
    expect(legs[0].ride).toBeNull();
    expect(planDay(day, HOME, B, transit({ patterns: [] }), MON).legs.every((l) => l.ride === null)).toBe(true);
  });

  it("leaves out classes with no location and names them, and skips staying in one building", () => {
    const { legs, missing } = planDay(
      [
        { course: "CS 124", s: 600, e: 650, b: "Far North Bldg" },
        { course: "CS 128", s: 660, e: 710, b: "Far North Bldg" },
        { course: "ART 101", s: 720, e: 770, b: "Nowhere Hall" },
      ],
      null,
      B,
      transit(),
      MON,
    );
    expect(legs).toEqual([]);
    expect(missing).toEqual(["Nowhere Hall"]);
  });
});

describe("homeChoices", () => {
  it("groups halls, apartments and campus buildings, each name once", () => {
    const t = transit({
      homes: [
        { name: "Nugent Hall", kind: "hall", lat: 40.1, lon: LON },
        { name: "Bankier Apartments", kind: "apartments", lat: 40.11, lon: LON },
      ],
    });
    const g = homeChoices(t, { ...B, Dup: { name: "Nugent Hall", short: null, lat: 0, lon: 0 } });
    expect(g.map((x) => x.group)).toEqual(["Residence halls and houses", "Apartment buildings", "Campus buildings"]);
    expect(g[2].places.map((p) => p.name)).toEqual(["Far North Building", "Near Home Building"]);
  });
});
