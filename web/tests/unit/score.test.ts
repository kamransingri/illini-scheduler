import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, K_COURSE_STUDENTS, K_PROF_STUDENTS, K_RMP_RATINGS, scoreOf, type ScoreInput, type ScorePriors } from "@/lib/score";

const priors: ScorePriors = { rmp: { quality: 3.5, difficulty: 3.0, would_take_again: 65 }, subject_gpa: { CS: 3.3 }, campus_gpa: 3.4 };

const base: ScoreInput = {
  subject: "CS",
  courseGpa: 3.5,
  courseN: 5000,
  delta: 0,
  deltaN: 2000,
  rmp: { quality: 4, difficulty: 3, wouldTakeAgain: 80, n: 200 },
  openShare: 0.5,
};

describe("best pick score", () => {
  it("is 0–100 and goes up with every part", () => {
    const s0 = scoreOf(base, priors).score!;
    expect(s0).toBeGreaterThan(0);
    expect(s0).toBeLessThanOrEqual(100);
    expect(scoreOf({ ...base, courseGpa: 3.8 }, priors).score!).toBeGreaterThan(s0);
    expect(scoreOf({ ...base, delta: 0.3 }, priors).score!).toBeGreaterThan(s0);
    expect(scoreOf({ ...base, rmp: { ...base.rmp!, quality: 4.8 } }, priors).score!).toBeGreaterThan(s0);
    expect(scoreOf({ ...base, rmp: { ...base.rmp!, difficulty: 2 } }, priors).score!).toBeGreaterThan(s0);
    expect(scoreOf({ ...base, rmp: { ...base.rmp!, wouldTakeAgain: 95 } }, priors).score!).toBeGreaterThan(s0);
    expect(scoreOf({ ...base, openShare: 1 }, priors).score!).toBeGreaterThan(s0);
  });

  it("shrinks a 23-student course GPA toward the subject average", () => {
    const small = scoreOf({ ...base, courseGpa: 4.0, courseN: 23 }, priors);
    const big = scoreOf({ ...base, courseGpa: 4.0, courseN: 5000 }, priors);
    const g = small.parts.find((p) => p.key === "courseGpa")!;
    expect(Number(g.adjusted)).toBeCloseTo((23 * 4 + K_COURSE_STUDENTS * 3.3) / (23 + K_COURSE_STUDENTS), 2);
    expect(g.note).toMatch(/CS average/);
    expect(small.score!).toBeLessThan(big.score!);
    // a perfect 4.0 from 23 students doesn't beat a solid 3.7 from thousands
    expect(small.score!).toBeLessThan(scoreOf({ ...base, courseGpa: 3.7, courseN: 4000 }, priors).score!);
  });

  it("shrinks a professor with 3 RMP ratings toward the UIUC average", () => {
    const few = scoreOf({ ...base, rmp: { quality: 5, difficulty: 1, wouldTakeAgain: 100, n: 3 } }, priors);
    const q = few.parts.find((p) => p.key === "quality")!;
    expect(Number(q.adjusted)).toBeCloseTo((3 * 5 + K_RMP_RATINGS * 3.5) / (3 + K_RMP_RATINGS), 2);
    const many = scoreOf({ ...base, rmp: { quality: 4.3, difficulty: 2.5, wouldTakeAgain: 85, n: 150 } }, priors);
    expect(few.score!).toBeLessThan(many.score!);
  });

  it("shrinks a small-sample GPA difference toward the course average", () => {
    const p = scoreOf({ ...base, delta: 0.6, deltaN: 40 }, priors).parts.find((x) => x.key === "profGpa")!;
    expect(Number(p.adjusted)).toBeCloseTo((0.6 * 40) / (40 + K_PROF_STUDENTS), 2);
    expect(p.note).toMatch(/sample size/);
  });

  it("leaves RMP out (and says so) when there are no ratings", () => {
    const r = scoreOf({ ...base, rmp: null }, priors);
    expect(r.parts.map((p) => p.key)).toEqual(["courseGpa", "profGpa", "seats"]);
    expect(r.missing.join(" ")).toMatch(/Rate My Professors/);
    expect(r.score).not.toBeNull();
  });

  it("counts a professor with no grade history as the course average", () => {
    const r = scoreOf({ ...base, delta: null, deltaN: 0 }, priors);
    const p = r.parts.find((x) => x.key === "profGpa")!;
    expect(p.value).toBe(0.5);
    expect(p.note).toMatch(/course average/);
  });

  it("leaves seats out when status isn't published, and course GPA when there's no grade data", () => {
    const r = scoreOf({ ...base, openShare: null, courseGpa: null, courseN: 0 }, priors);
    expect(r.parts.some((p) => p.key === "seats" || p.key === "courseGpa")).toBe(false);
    expect(r.missing).toHaveLength(2);
  });

  it("uses the student's weights; a weight of 0 removes a part", () => {
    const noSeats = scoreOf({ ...base, openShare: 0 }, priors, { ...DEFAULT_WEIGHTS, seats: 0 });
    const withSeats = scoreOf({ ...base, openShare: 0 }, priors, DEFAULT_WEIGHTS);
    expect(noSeats.score!).toBeGreaterThan(withSeats.score!);
    const allZero = scoreOf(base, priors, { courseGpa: 0, profGpa: 0, quality: 0, difficulty: 0, wouldTakeAgain: 0, seats: 0 });
    expect(allZero.score).toBeNull();
  });

  it("falls back to the campus average for a subject with no GPA history, and to raw values with no priors", () => {
    const r = scoreOf({ ...base, subject: "ZZZ", courseGpa: 4, courseN: 10 }, priors);
    expect(Number(r.parts[0].adjusted)).toBeCloseTo((10 * 4 + K_COURSE_STUDENTS * 3.4) / (10 + K_COURSE_STUDENTS), 2);
    const none = scoreOf({ ...base, courseGpa: 4, courseN: 10 }, { rmp: { quality: null, difficulty: null, would_take_again: null }, subject_gpa: {}, campus_gpa: null });
    expect(none.parts[0].adjusted).toBe("4.00");
  });
});
