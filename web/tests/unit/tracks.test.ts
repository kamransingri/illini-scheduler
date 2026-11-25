import { describe, expect, it } from "vitest";
import { evaluate, trackOf, tracksOf, withTrack, type Degree, type DegreeGroup } from "@/lib/degree";
import { decodeTracks, pickedTrack, setTrack } from "@/lib/mycourses";

// Tracks: pick one, see only its requirements (the Economics minor's shape).
const g = (id: string, name: string, p: Partial<DegreeGroup> = {}): DegreeGroup => ({
  id, name, section: "Requirements", kind: "program", rule: "all", n: null, hours: null, items: [], from: [], eligible: [], exclude: [],
  max_hours: {}, min_from: {}, not_with: [], exclusive: null, source: null, notes: [], ...p,
});
const ECON: Degree = {
  id: "economics-minor", type: "minor", program: "Economics Minor", college: "LAS", catalog_year: "2026-2027", source: "", read_on: "", total_hours: 18,
  notes: [], double_counting: [], courses: {}, unknown: [],
  groups: [
    g("core", "Core Economics Requirements", { items: [[["ECON 102"]]] }),
    g("pick", "Core Economics Requirements", { rule: "manual", notes: ["Students will select one of the following tracks:"] }),
    g("micro", "Microeconomics Track", { items: [[["ECON 411"]]] }),
    g("macro-1", "Macroeconomics Track", { items: [[["ECON 303"]]] }),
    g("macro-2", "Macroeconomics Track", { items: [[["ECON 420"]]] }),
  ],
};

describe("tracks", () => {
  it("finds the tracks, ignoring a trailing note in brackets, and only when there is a choice", () => {
    expect(trackOf({ name: "Computer Science Technical Track (two options)" })).toBe("Computer Science Technical Track");
    expect(trackOf({ name: "Track Option Electives" })).toBeNull();
    expect(tracksOf(ECON)).toEqual(["Microeconomics Track", "Macroeconomics Track"]);
    expect(tracksOf({ groups: [g("a", "Specialization Track")] })).toEqual([]);
  });

  it("shows one placeholder until a track is picked, then only that track", () => {
    const none = withTrack(ECON, undefined);
    expect(none.groups.map((x) => x.id)).toEqual(["core", "track"]);
    expect(evaluate(none, [{ s: "ECON", n: "102", status: "done" }]).results.map((r) => r.status)).toEqual(["done", "open"]);
    const macro = withTrack(ECON, "macroeconomics-track");
    expect(macro.groups.map((x) => x.id)).toEqual(["core", "macro-1", "macro-2"]);
    expect(macro.track).toBe("Macroeconomics Track");
    expect(withTrack(ECON, "no-such-track").track).toBeNull();
  });

  it("keeps one pick per program in the link", () => {
    const t = setTrack(decodeTracks("economics-minor:micro,physics-bs:astrophysics-track,BAD"), "economics-minor", "macroeconomics-track");
    expect(t).toEqual(["physics-bs:astrophysics-track", "economics-minor:macroeconomics-track"]);
    expect(pickedTrack(t, "economics-minor")).toBe("macroeconomics-track");
    expect(setTrack(t, "physics-bs", "")).toEqual(["economics-minor:macroeconomics-track"]);
  });
});
