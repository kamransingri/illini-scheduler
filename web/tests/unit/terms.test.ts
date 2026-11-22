import { expect, it } from "vitest";
import { tabTerms, termAfter } from "@/lib/terms";

// Course pages' term tabs (#140): this term, next term, and the next summer and fall.
it("tabTerms lists this term, the next, and the next summer and fall in order", () => {
  expect(termAfter("2026-fa")).toBe("2027-sp");
  expect(termAfter("2027-sp")).toBe("2027-su");
  expect(tabTerms("2026-fa")).toEqual(["2026-fa", "2027-sp", "2027-su", "2027-fa"]);
  expect(tabTerms("2027-sp")).toEqual(["2027-sp", "2027-su", "2027-fa"]);
  expect(tabTerms("2027-su")).toEqual(["2027-su", "2027-fa", "2028-sp", "2028-su"]);
});
