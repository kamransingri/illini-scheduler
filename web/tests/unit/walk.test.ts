import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFS, generate, type CourseInput } from "@/lib/schedule";
import type { Course, Section } from "@/lib/types";
import { rushedWalk, setBuildings, walkMinutes } from "@/lib/walk";

// Walking time (#94). Two buildings about 1.3 km apart (straight line) and one next door.
const B = { North: { lat: 40.1138, lon: -88.2249 }, East: { lat: 40.1022, lon: -88.2224 }, NextDoor: { lat: 40.1141, lon: -88.2249 } };
afterEach(() => setBuildings(null));

let crn = 1;
const lec = (d: number, s: number, b: string): Section => ({
  crn: String(crn++), code: `L${crn}`, type: "LEC", type_name: "", component: "primary", group: "*", part: "1", status: "", status_code: "A", credits: "",
  title: "", text: "", instructors: [], instructors_raw: [], special: "", meetings: [{ d, s, e: s + 50, b, r: "1" }],
});
const input = (n: string, sections: Section[]): CourseInput => {
  const course = {
    subject: "X", number: n, title: "t", subject_name: "", credits: "3 hours.", credit_range: [3, 3], description: "", prereq: "", section_info: "",
    schedule_info: "", latest_term: "2027-sp", geneds: { codes: [], categories: [] }, gpa: null, pattern: null, history: [], instructors: {}, changes: [],
    biggest_change: null, exam_course: null, notes: [],
    terms: { "2027-sp": { label: "", checked_at: "", source: "", status_known: false, n_primary: 0, n_open: null, sections } },
  } as unknown as Course;
  return { key: `X ${n}`, course, credits: 3, locked: [] };
};

describe("walking time", () => {
  it("is distance times a detour at an easy pace, and null without a location", () => {
    setBuildings(B);
    expect(walkMinutes("North", "East")).toBeGreaterThanOrEqual(20);
    expect(walkMinutes("North", "East")).toBeLessThanOrEqual(25);
    expect(walkMinutes("North", "NextDoor")).toBe(1);
    expect(walkMinutes("North", "North")).toBe(0);
    expect(walkMinutes("North", "Nowhere")).toBeNull();
  });

  it("flags a walk longer than the gap, not one that fits", () => {
    setBuildings(B);
    const at = (s: number, b: string) => ({ d: 1, s, e: s + 50, b });
    expect(rushedWalk(at(540, "North"), at(600, "East"))).toMatchObject({ gap: 10 });
    expect(rushedWalk(at(540, "North"), at(600, "NextDoor"))).toBeNull();
    expect(rushedWalk(at(540, "North"), at(660, "East"))).toBeNull(); // 70 minutes between
  });

  it("the schedule lists the rushed walk, and the must-have drops schedules that have one", () => {
    setBuildings(B);
    const inputs = [input("101", [lec(1, 540, "North")]), input("102", [lec(1, 600, "East"), lec(1, 660, "East")])];
    const all = generate(inputs, "2027-sp", DEFAULT_PREFS);
    expect(all.schedules).toHaveLength(2);
    const tight = all.schedules.find((s) => s.bundles[1].meetings[0].s === 600 || s.bundles[0].meetings[0].s === 600)!;
    expect(tight.stats.walks).toEqual([expect.objectContaining({ day: "Mon", from: "North", to: "East", fromCourse: "X 101", toCourse: "X 102", gap: 10 })]);
    const strict = generate(inputs, "2027-sp", { ...DEFAULT_PREFS, noRushedWalks: true });
    expect(strict.schedules).toHaveLength(1);
    expect(strict.schedules[0].stats.walks).toEqual([]);
  });
});
