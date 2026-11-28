import { describe, expect, it } from "vitest";
import { winterLine, type WinterRow } from "@/lib/winter";

const d = { label: "Winter 2026", recent: ["2024-wi", "2025-wi", "2026-wi"], next_label: "Winter 2027" };
const row = (p: Partial<WinterRow> = {}): WinterRow => ({ s: "BADM", n: "275", nSec: 1, online: "all", ran: 3, ...p });

describe("winter line", () => {
  it("says last winter's until the next is out", () => {
    expect(winterLine(row(), { ...d, upcoming: false })).toBe("Ran in Winter 2026 (online), and in 3 of the last 3 winters. Winter 2027's schedule isn't out yet.");
  });
  it("says the coming winter once it's out", () => {
    expect(winterLine(row({ ran: 1, online: "none" }), { ...d, label: "Winter 2027", upcoming: true })).toBe("Winter 2027: on campus. Ran in 1 of the last 3 winters.");
    expect(winterLine(row(), { ...d, recent: ["2026-wi"], upcoming: true })).toBe("Winter 2026: online.");
  });
});
