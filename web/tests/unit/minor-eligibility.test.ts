import { describe, expect, it } from "vitest";
import { notOpenRules, type Degree } from "@/lib/degree";

const quote = "Students pursuing a major in the College of Media are not eligible for a minor in Media.";
const mediaMinor = {
  not_open_to: [{ colleges: ["College of Media"], quote, source: "https://catalog.illinois.edu/undergraduate/media/minors/media/" }],
} as Pick<Degree, "not_open_to">;

describe("minor eligibility (#230)", () => {
  it("matches a College of Media major and retains its exact catalog quote", () => {
    const [rule] = notOpenRules(mediaMinor, { id: "journalism-bs", college: "College of Media" });
    expect(rule.quote).toBe(quote);
    expect(rule.source).toContain("/minors/media/");
  });

  it("matches the Economics BALAS restriction", () => {
    const minor = {
      not_open_to: [{
        majors: ["economics-balas", "econometrics-quantitative-economics-bslas", "computer-science-economics-bslas"],
        quote: "All University of Illinois Urbana-Champaign undergraduate students are eligible to earn the Minor in Economics except for those enrolled in one of these majors: Economics BALAS, Econometrics & Quantitative Economics BSLAS, or Computer Science + Economics BSLAS.",
        source: "https://catalog.illinois.edu/undergraduate/las/minors/economics/",
      }],
    } as Pick<Degree, "not_open_to">;
    const [rule] = notOpenRules(minor, { id: "economics-balas", college: "College of Liberal Arts and Sciences" });
    expect(rule.quote).toContain("Economics BALAS");
    expect(notOpenRules(minor, { id: "economics-bs", college: "College of Liberal Arts and Sciences" })).toHaveLength(0);
  });

  it("leaves a minor with no stated rule open to everyone", () => {
    expect(notOpenRules({}, { id: "media-bs", college: "College of Media" })).toEqual([]);
  });

  it("matches concentration ids only when that concentration is named", () => {
    const minor = {
      not_open_to: [{ majors: ["crop-sciences-bs-horticultural-food-systems"], quote, source: "https://catalog.illinois.edu/" }],
    } as Pick<Degree, "not_open_to">;
    expect(notOpenRules(minor, { id: "crop-sciences-bs-horticultural-food-systems", college: "ACES" })).toHaveLength(1);
    expect(notOpenRules(minor, { id: "crop-sciences-bs", college: "ACES" })).toHaveLength(0);
  });

  it("an only-open-to rule closes the minor to everyone outside the named college or majors", () => {
    const minor = {
      not_open_to: [{ only_colleges: ["Gies College of Business"], only_majors: ["economics-balas"], quote, source: "https://catalog.illinois.edu/" }],
    } as Pick<Degree, "not_open_to">;
    expect(notOpenRules(minor, { id: "finance-bs", college: "Gies College of Business" })).toEqual([]);
    expect(notOpenRules(minor, { id: "economics-balas", college: "College of Liberal Arts and Sciences" })).toEqual([]);
    expect(notOpenRules(minor, { id: "media-bs", college: "College of Media" })).toHaveLength(1);
  });
});
