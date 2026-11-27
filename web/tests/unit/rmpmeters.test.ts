import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RmpMeters, { meterColor, rmpMeters } from "@/components/course/RmpMeters";
import type { Rmp } from "@/lib/types";

const rmp = (p: Partial<Rmp>): Rmp => ({ id: "1", url: "", rating: 2.2, difficulty: 3.5, would_take_again: 26.4, num_ratings: 38, tags: [], reviews: [], fetched_at: "2026-11-18", ...p });

describe("rmpMeters", () => {
  it("gives each average as a share of its scale and reads the same numbers as the old sentence", () => {
    const { rows, label } = rmpMeters(rmp({}));
    expect(rows.map((r) => [r.key, r.value, +r.share.toFixed(3)])).toEqual([
      ["quality", "2.2", 0.44],
      ["difficulty", "3.5", 0.7],
      ["again", "26%", 0.264],
    ]);
    // how good each is for a student, 0 to 1: quality and would-take-again high, difficulty low (RMP's 1 to 5)
    expect(rows.map((r) => +r.good!.toFixed(3))).toEqual([0.3, 0.375, 0.264]);
    expect(label).toBe("Quality 2.2 of 5, difficulty 3.5 of 5, 26% would take again, from 38 ratings (all courses)");
  });

  it("shows – and an empty meter for missing values", () => {
    const { rows, label } = rmpMeters(rmp({ rating: null, difficulty: null, would_take_again: null }));
    expect(rows.map((r) => [r.value, r.share, r.good])).toEqual([["–", 0, null], ["–", 0, null], ["–", 0, null]]);
    expect(label).toBe("Quality – of 5, difficulty – of 5, would-take-again not reported, from 38 ratings (all courses)");
  });

  it("renders the label on a role=img and the count with the fetch date", () => {
    const html = renderToStaticMarkup(createElement(RmpMeters, { rmp: rmp({}) }));
    expect(html).toContain('role="img" aria-label="Rate My Professors: Quality 2.2 of 5');
    expect(html).toContain("width:44%");
    expect(html).toMatch(/38 ratings \(all courses\), fetched/);
    expect(html).not.toContain("lower is easier");
  });

  it("colours a bar from red when it's bad for a student to green when it's good", () => {
    expect(meterColor(0)).toBe("color-mix(in oklch, var(--color-up) 0%, var(--color-down))");
    expect(meterColor(1)).toBe("color-mix(in oklch, var(--color-up) 100%, var(--color-down))");
    const easy = rmpMeters(rmp({ difficulty: 1.0, rating: 5, would_take_again: 100 })).rows;
    expect(easy.map((r) => r.good)).toEqual([1, 1, 1]);
    const hard = rmpMeters(rmp({ difficulty: 5, rating: 1, would_take_again: 0 })).rows;
    expect(hard.map((r) => r.good)).toEqual([0, 0, 0]);
  });
});
