import { describe, expect, it } from "vitest";
import { rmpRateUrl, rmpSearchUrl } from "@/components/course/ProfessorLedger";

describe("RMP links", () => {
  it("turns a stored profile URL into RMP's rating form", () => {
    expect(rmpRateUrl("https://www.ratemyprofessors.com/professor/209729")).toBe("https://www.ratemyprofessors.com/add/professor-rating/209729");
    expect(rmpRateUrl("https://www.ratemyprofessors.com/professor/209729/")).toBe("https://www.ratemyprofessors.com/add/professor-rating/209729");
  });

  it("leaves anything else alone, and adds no tracking parameters", () => {
    expect(rmpRateUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(rmpRateUrl("https://www.ratemyprofessors.com/professor/209729")).not.toMatch(/[?#]/);
    expect(rmpSearchUrl("Whittlesey, K")).toBe("https://www.ratemyprofessors.com/search/professors?q=Whittlesey%2C%20K%20University%20of%20Illinois");
  });
});
