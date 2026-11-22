// Map 4 (#96): getting to class from where you live, and between classes, on foot or by MTD bus.
// Bus times are MTD's published timetable (transit.json, pipeline/transit.py); building locations are
// OpenStreetMap's (buildings.json, #93). Everything here is an estimate, and the page says so.
// One bus, no transfers: the campus routes run between the halls and the buildings directly (DECISIONS.md D50).

export type Place = { name: string; lat: number; lon: number };
export type Home = Place & { kind: "hall" | "apartments" };
export type BuildingMap = Record<string, { name: string; short: string | null; lat: number; lon: number }>;
export type Pattern = { r: number; h: string; s: number[]; o: number[]; t: [number, number][] };
export type Transit = {
  credit: string;
  feed: { version: string | null; start: string | null; end: string | null };
  week: Record<string, string>;
  routes: [string, string, string, string][]; // short name, long name, colour, text colour
  stops: [string, number, number][]; // name, lat, lon
  patterns: Pattern[];
  homes: Home[];
};

export const WALK_M_PER_MIN = 80; // 4.8 km/h
export const DETOUR = 1.3; // streets and paths aren't a straight line
export const STOP_WALK_MAX = 8; // minutes to a stop worth using
export const AT_STOP_EARLY = 1; // be at the stop a minute before the bus
export const EARLY = 2; // arrive this long before class starts
export const BUS_SAVES = 5; // the bus is suggested when it saves at least this many minutes

export function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

/** Minutes on foot: straight-line distance times DETOUR at WALK_M_PER_MIN, rounded up. */
export function walkMinutes(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return Math.ceil((metres(a, b) * DETOUR) / WALK_M_PER_MIN);
}

export type Ride = {
  route: string; // "22 Illini"
  color: string;
  textColor: string;
  headsign: string;
  from: string; // stop names
  to: string;
  board: number; // minutes after midnight
  alight: number;
  walkTo: number; // minutes from the start to the first stop
  walkFrom: number; // from the last stop to the destination
  leave: number; // when to set off
  arrive: number; // when you get there
};

function nearStops(t: Transit, p: { lat: number; lon: number }): Map<number, number> {
  const out = new Map<number, number>();
  t.stops.forEach(([, lat, lon], i) => {
    const w = walkMinutes(p, { lat, lon });
    if (w <= STOP_WALK_MAX) out.set(i, w);
  });
  return out;
}

/** Every one-bus way from `a` to `b` on a day (`dayBit`: Monday 1 ... Sunday 64), the quickest pair of stops per trip. */
export function rides(t: Transit, a: { lat: number; lon: number }, b: { lat: number; lon: number }, dayBit: number): Ride[] {
  const na = nearStops(t, a);
  const nb = nearStops(t, b);
  if (!na.size || !nb.size) return [];
  const out: Ride[] = [];
  for (const p of t.patterns) {
    // the best boarding and alighting stop of this pattern: least walking plus riding
    let best: { i: number; j: number; cost: number } | null = null;
    for (let i = 0; i < p.s.length; i++) {
      const wa = na.get(p.s[i]);
      if (wa === undefined) continue;
      for (let j = i + 1; j < p.s.length; j++) {
        const wb = nb.get(p.s[j]);
        if (wb === undefined) continue;
        const cost = wa + (p.o[j] - p.o[i]) + wb;
        if (!best || cost < best.cost) best = { i, j, cost };
      }
    }
    if (!best) continue;
    const [short, long, color, text] = t.routes[p.r];
    const walkTo = na.get(p.s[best.i])!;
    const walkFrom = nb.get(p.s[best.j])!;
    for (const [t0, mask] of p.t) {
      if (!(mask & dayBit)) continue;
      const board = t0 + p.o[best.i];
      const alight = t0 + p.o[best.j];
      out.push({
        route: `${short} ${long}`.trim(),
        color: color ? `#${color}` : "",
        textColor: text ? `#${text}` : "",
        headsign: p.h,
        from: t.stops[p.s[best.i]][0],
        to: t.stops[p.s[best.j]][0],
        board,
        alight,
        walkTo,
        walkFrom,
        leave: board - walkTo - AT_STOP_EARLY,
        arrive: alight + walkFrom,
      });
    }
  }
  return out;
}

/** The ride that lets you leave latest and still arrive by `by`. */
export function arriveBy(rs: Ride[], by: number): Ride | null {
  let best: Ride | null = null;
  for (const r of rs) if (r.arrive <= by && (!best || r.leave > best.leave || (r.leave === best.leave && r.arrive < best.arrive))) best = r;
  return best;
}

/** The ride that gets you there soonest, setting off no earlier than `after`. */
export function departAfter(rs: Ride[], after: number): Ride | null {
  let best: Ride | null = null;
  for (const r of rs) if (r.leave >= after && (!best || r.arrive < best.arrive || (r.arrive === best.arrive && r.leave > best.leave))) best = r;
  return best;
}

export type DayMeeting = { course: string; s: number; e: number; b: string };

export type Leg = {
  kind: "to-class" | "between" | "home";
  from: string;
  to: string;
  walk: number; // minutes on foot
  ride: Ride | null; // the bus, when it's the better way (or the only way to make it)
  leave: number; // when to set off
  arrive: number;
  late: number; // minutes late for the next class, 0 if on time
};

/** One day's trips: home to the first class, between classes in different buildings, and the last class home.
 *  Meetings whose building has no location are left out, and `missing` names them. */
export function planDay(
  meetings: DayMeeting[],
  home: Place | null,
  buildings: BuildingMap,
  transit: Transit | null,
  dayBit: number,
): { legs: Leg[]; missing: string[] } {
  const missing: string[] = [];
  const located = [...meetings]
    .sort((a, b) => a.s - b.s)
    .flatMap((m) => {
      const p = buildings[m.b];
      if (!p) {
        if (m.b && !missing.includes(m.b)) missing.push(m.b);
        return [];
      }
      return [{ ...m, at: { name: p.name, lat: p.lat, lon: p.lon } }];
    });
  const legs: Leg[] = [];
  const byBus = (a: Place, b: Place) => (transit && transit.patterns.length ? rides(transit, a, b, dayBit) : []);
  if (!located.length) return { legs, missing };

  const first = located[0];
  if (home) {
    const walk = walkMinutes(home, first.at);
    const ride = arriveBy(byBus(home, first.at), first.s - EARLY);
    const bus = ride && ride.arrive - ride.leave + BUS_SAVES <= walk ? ride : null;
    legs.push({
      kind: "to-class", from: home.name, to: first.at.name, walk, ride: bus,
      leave: bus ? bus.leave : first.s - EARLY - walk, arrive: bus ? bus.arrive : first.s - EARLY, late: 0,
    });
  }
  for (let k = 1; k < located.length; k++) {
    const a = located[k - 1];
    const b = located[k];
    if (a.at.name === b.at.name) continue;
    const walk = walkMinutes(a.at, b.at);
    const gap = b.s - a.e;
    const ride = departAfter(byBus(a.at, b.at), a.e);
    const busOnTime = ride && ride.arrive <= b.s ? ride : null;
    // the bus when walking won't make it and the bus will, or when it saves real time
    const bus = busOnTime && (walk > gap || busOnTime.arrive - busOnTime.leave + BUS_SAVES <= walk) ? busOnTime : null;
    const arrive = bus ? bus.arrive : a.e + walk;
    legs.push({ kind: "between", from: a.at.name, to: b.at.name, walk, ride: bus, leave: bus ? bus.leave : a.e, arrive, late: Math.max(0, arrive - b.s) });
  }
  const last = located[located.length - 1];
  if (home) {
    const walk = walkMinutes(last.at, home);
    const ride = departAfter(byBus(last.at, home), last.e);
    const bus = ride && ride.arrive - last.e + BUS_SAVES <= walk ? ride : null;
    legs.push({ kind: "home", from: last.at.name, to: home.name, walk, ride: bus, leave: bus ? bus.leave : last.e, arrive: bus ? bus.arrive : last.e + walk, late: 0 });
  }
  return { legs, missing };
}

// ---- Best bus line (#216): one line from near home that reaches the most of the week's classes ----

export const NEAR_WALK = 10; // a class this close to home is a walk, not a bus

export type LineStop = { courses: string[]; building: string; lat: number; lon: number; stop: string; walkFrom: number; ride: number; walk: number };
export type BestLine = {
  route: string;
  color: string;
  textColor: string;
  headsign: string;
  board: string; // the stop near home
  walkTo: number;
  covered: LineStop[];
  courses: number; // classes it reaches
  path: [number, number][]; // [lon, lat] of its stops from the boarding stop to the last class stop
};
/** Minutes on foot over a week's trips on a line: to the stop once per class building, and from each stop. */
const lineWalking = (l: BestLine) => l.walkTo * l.covered.length + l.covered.reduce((n, c) => n + c.walkFrom, 0);

export type LinePlan = { lines: BestLine[]; walk: { courses: string[]; building: string; walk: number }[]; missing: string[]; total: number };

/**
 * The bus lines that take you from near home straight to the most of your classes (one bus, no transfers). A class
 * counts when the walk to the stop and from the last stop is at least BUS_SAVES minutes less than walking all the way.
 * Classes within NEAR_WALK minutes of home are left to walk. Best line first; ties go to less walking.
 */
export function bestLines(t: Transit, home: Place, classes: { course: string; b: string }[], buildings: BuildingMap, limit = 3): LinePlan {
  const by = new Map<string, { at: Place; courses: string[] }>();
  const missing: string[] = [];
  for (const c of classes) {
    const p = buildings[c.b];
    if (!p) {
      if (c.b && !missing.includes(c.b)) missing.push(c.b);
      continue;
    }
    const g = by.get(p.name) ?? { at: { name: p.name, lat: p.lat, lon: p.lon }, courses: [] };
    if (!g.courses.includes(c.course)) g.courses.push(c.course);
    by.set(p.name, g);
  }
  const groups = [...by.values()].map((g) => ({ ...g, walk: walkMinutes(home, g.at) }));
  const walk = groups.filter((g) => g.walk <= NEAR_WALK).map((g) => ({ courses: g.courses, building: g.at.name, walk: g.walk }));
  const far = groups.filter((g) => g.walk > NEAR_WALK).map((g) => ({ ...g, near: nearStops(t, g.at) }));
  const total = groups.reduce((n, g) => n + g.courses.length, 0);
  const atHome = nearStops(t, home);
  const weekday = t.patterns.filter((p) => p.t.some(([, mask]) => mask & 31));
  const lines: BestLine[] = [];
  for (let r = 0; r < t.routes.length; r++) {
    const pats = weekday.filter((p) => p.r === r);
    let best: BestLine | null = null;
    for (const [stop, walkTo] of atHome) {
      const covered: LineStop[] = [];
      let bestPat: { p: Pattern; i: number; j: number; n: number } | null = null;
      const perPat = new Map<Pattern, { i: number; j: number; n: number }>();
      for (const g of far) {
        let hit: { p: Pattern; i: number; j: number; wb: number; ride: number } | null = null;
        for (const p of pats) {
          const i = p.s.indexOf(stop);
          if (i < 0) continue;
          for (let j = i + 1; j < p.s.length; j++) {
            const wb = g.near.get(p.s[j]);
            if (wb === undefined) continue;
            const ride = p.o[j] - p.o[i];
            if (!hit || wb + ride < hit.wb + hit.ride) hit = { p, i, j, wb, ride };
          }
        }
        if (!hit || walkTo + hit.wb + BUS_SAVES > g.walk) continue;
        covered.push({ courses: g.courses, building: g.at.name, lat: g.at.lat, lon: g.at.lon, stop: t.stops[hit.p.s[hit.j]][0], walkFrom: hit.wb, ride: hit.ride, walk: g.walk });
        const e = perPat.get(hit.p) ?? { i: hit.i, j: hit.j, n: 0 };
        e.j = Math.max(e.j, hit.j);
        e.n += g.courses.length;
        perPat.set(hit.p, e);
      }
      if (!covered.length) continue;
      for (const [p, e] of perPat) if (!bestPat || e.n > bestPat.n) bestPat = { p, ...e };
      const courses = covered.reduce((n, c) => n + c.courses.length, 0);
      const walking = walkTo * covered.length + covered.reduce((n, c) => n + c.walkFrom, 0);
      if (best && (courses < best.courses || (courses === best.courses && walking >= lineWalking(best)))) continue;
      const [short, long, color, text] = t.routes[r];
      const pat = bestPat!;
      best = {
        route: `${short} ${long}`.trim(),
        color: color ? `#${color}` : "",
        textColor: text ? `#${text}` : "",
        headsign: pat.p.h,
        board: t.stops[stop][0],
        walkTo,
        covered: covered.sort((a, b) => b.courses.length - a.courses.length || a.walkFrom - b.walkFrom),
        courses,
        path: pat.p.s.slice(pat.i, pat.j + 1).map((k) => [t.stops[k][2], t.stops[k][1]] as [number, number]),
      };
    }
    if (best) lines.push(best);
  }
  lines.sort((a, b) => b.courses - a.courses || lineWalking(a) - lineWalking(b));
  return { lines: lines.slice(0, limit), walk, missing, total };
}

// ---- Map 3 (#95): a day's classes as numbered stops ----

export type MapStop = {
  n: number; // 1, 2, 3 in class order
  courses: string[]; // "CS 124" (two when back-to-back classes share a building)
  name: string; // the building's OpenStreetMap name
  lat: number;
  lon: number;
  start: number;
  end: number;
  walkNext: number | null; // minutes on foot to the next stop; null for the last
  gapNext: number | null; // minutes between this stop's last class and the next stop's first
};

/** The day's classes in order as map stops: back-to-back classes in one building share a stop. */
export function stopsForDay(meetings: DayMeeting[], buildings: BuildingMap): { stops: MapStop[]; missing: string[] } {
  const missing: string[] = [];
  const stops: MapStop[] = [];
  for (const m of [...meetings].sort((a, b) => a.s - b.s)) {
    const p = buildings[m.b];
    if (!p) {
      if (m.b && !missing.includes(m.b)) missing.push(m.b);
      continue;
    }
    const last = stops[stops.length - 1];
    if (last && last.name === p.name) {
      last.courses.push(m.course);
      last.end = Math.max(last.end, m.e);
      continue;
    }
    stops.push({ n: stops.length + 1, courses: [m.course], name: p.name, lat: p.lat, lon: p.lon, start: m.s, end: m.e, walkNext: null, gapNext: null });
  }
  for (let i = 0; i + 1 < stops.length; i++) {
    stops[i].walkNext = walkMinutes(stops[i], stops[i + 1]);
    stops[i].gapNext = stops[i + 1].start - stops[i].end;
  }
  return { stops, missing };
}

// ---- where you live, kept in this browser only (never in share links, like About you) ----

export const HOME_KEY = "illini-scheduler:home:v1";

// A dropped pin is saved as "pin:<lat>,<lon>" in the same key, rounded to PIN_DECIMALS places (~110 m north-south,
// ~85 m east-west here): close enough for walking and bus estimates, without keeping someone's exact address.
export const PIN_PREFIX = "pin:";
export const PIN_DECIMALS = 3;
export const PIN_NAME = "Your pin";
/** Champaign, Urbana and Savoy: MTD's area. A pin outside it isn't saved. */
export const PIN_AREA = { south: 40.03, north: 40.17, west: -88.33, east: -88.13 };

export function inPinArea(lat: number, lon: number): boolean {
  return lat >= PIN_AREA.south && lat <= PIN_AREA.north && lon >= PIN_AREA.west && lon <= PIN_AREA.east;
}

/** "pin:40.105,-88.227", or null when the spot is outside Champaign-Urbana. */
export function encodePin(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inPinArea(lat, lon)) return null;
  return `${PIN_PREFIX}${lat.toFixed(PIN_DECIMALS)},${lon.toFixed(PIN_DECIMALS)}`;
}

/** The saved pin as a place, or null if `v` isn't a valid pin (a hall's name, or something edited by hand). */
export function decodePin(v: string | null): Place | null {
  if (!v || !v.startsWith(PIN_PREFIX)) return null;
  const m = v.slice(PIN_PREFIX.length).match(/^(-?\d{1,3}\.\d{1,6}),(-?\d{1,3}\.\d{1,6})$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return inPinArea(lat, lon) ? { name: PIN_NAME, lat, lon } : null;
}

export function readHome(): string | null {
  try {
    return window.localStorage.getItem(HOME_KEY);
  } catch {
    return null;
  }
}

export function writeHome(name: string | null): void {
  try {
    if (name) window.localStorage.setItem(HOME_KEY, name);
    else window.localStorage.removeItem(HOME_KEY);
  } catch {
    /* private mode: it just isn't remembered */
  }
}

/** Places to pick as home: residence halls, apartment buildings, then class buildings, each name once. */
export function homeChoices(t: Transit | null, buildings: BuildingMap): { group: string; places: Place[] }[] {
  const seen = new Set<string>();
  const take = (ps: Place[]) => ps.filter((p) => !seen.has(p.name) && seen.add(p.name)).sort((a, b) => a.name.localeCompare(b.name));
  const homes = t?.homes ?? [];
  return [
    { group: "Residence halls and houses", places: take(homes.filter((h) => h.kind === "hall")) },
    { group: "Apartment buildings", places: take(homes.filter((h) => h.kind === "apartments")) },
    { group: "Campus buildings", places: take(Object.values(buildings).map((b) => ({ name: b.name, lat: b.lat, lon: b.lon }))) },
  ].filter((g) => g.places.length);
}
