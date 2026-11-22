// Walking time between buildings (#94): buildings.json's locations (OpenStreetMap, #93) with Getting there's walking
// estimate (lib/commute.ts), so a walk takes as long in the schedule as on the map. Rough on purpose (DECISIONS D52).
import { areaOf } from "./campus";
import { walkMinutes as walkBetween } from "./commute";

export type Point = { lat: number; lon: number };
/** Classes further apart than `window` minutes never make a rushed walk. */
export const WALK = { window: 30 };

let points: Record<string, Point> = {};
/** buildings.json's `buildings`, once it has loaded; until then (or if it fails) walks fall back to campus areas. */
export function setBuildings(b: Record<string, Point> | null | undefined): void {
  points = b ?? {};
}

/** Minutes to walk between two buildings, or null when either has no location. */
export function walkMinutes(a: string, b: string): number | null {
  if (!a || !b) return null;
  if (a === b) return 0;
  const p = points[a],
    q = points[b];
  return p && q ? walkBetween(p, q) : null;
}

type Timed = { d: number; s: number | null; e: number | null; b: string };

/**
 * The walk from one class to the next when it's longer than the gap between them, or null. `x` ends before `y`
 * starts on a shared day. Without locations, two classes 10 minutes or less apart in different campus areas count.
 */
export function rushedWalk(x: Timed, y: Timed): { walk: number | null; gap: number } | null {
  if (x.e === null || y.s === null || !(x.d & y.d)) return null;
  const gap = y.s - x.e;
  if (gap < 0 || gap > WALK.window) return null;
  const walk = walkMinutes(x.b, y.b);
  if (walk !== null) return walk > gap ? { walk, gap } : null;
  const ax = areaOf(x.b),
    ay = areaOf(y.b);
  return gap <= 10 && ax !== ay && ax !== "?" && ay !== "?" ? { walk: null, gap } : null;
}
