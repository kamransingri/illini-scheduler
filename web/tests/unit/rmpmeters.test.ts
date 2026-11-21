import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RmpMeters, { rmpMeters } from "@/components/course/RmpMeters";
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
    expect(rows[1].note).toBe("lower is easier");
    expect(label).toBe("Quality 2.2 of 5, difficulty 3.5 of 5, 26% would take again, from 38 ratings (all courses)");
  });

  it("shows – and an empty meter for missing values", () => {
    const { rows, label } = rmpMeters(rmp({ rating: null, difficulty: null, would_take_again: null }));
    expect(rows.map((r) => [r.value, r.share])).toEqual([["–", 0], ["–", 0], ["–", 0]]);
    expect(label).toBe("Quality – of 5, difficulty – of 5, would-take-again not reported, from 38 ratings (all courses)");
  });

  it("renders the label on a role=img and the count with the fetch date", () => {
    const html = renderToStaticMarkup(createElement(RmpMeters, { rmp: rmp({}) }));
    expect(html).toContain('role="img" aria-label="Rate My Professors: Quality 2.2 of 5');
    expect(html).toContain("width:44%");
    expect(html).toMatch(/38 ratings \(all courses\), fetched/);
  });
});
