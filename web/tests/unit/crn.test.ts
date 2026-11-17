import { describe, expect, it } from "vitest";
import { looksLikeCrn, searchCrn, type CrnIndex } from "@/lib/crn";
import { currentStatus, fmtSince, mergeEvents, type LiveFile } from "@/lib/live";
import type { SeatEvent } from "@/lib/types";

const INDEX: CrnIndex = {
  "2027-sp": { "31152": ["CS", "124", "AL1", "Lecture"], "31153": ["CS", "124", "AYA", "Discussion/Recitation"], "40001": ["STAT", "107", "L1", "Lecture"] },
  "2026-fa": { "31152": ["MATH", "221", "AL1", "Lecture"], "31199": ["RHET", "105", "A", "Lecture-Discussion"] },
};

describe("search by CRN", () => {
  it("only digit queries (3-5 digits, optional 'CRN') look like CRNs", () => {
    expect(looksLikeCrn("31152")).toBe(true);
    expect(looksLikeCrn("crn 31152")).toBe(true);
    expect(looksLikeCrn("CRN: 311")).toBe(true);
    expect(looksLikeCrn("31")).toBe(false);
    expect(looksLikeCrn("cs124")).toBe(false);
    expect(looksLikeCrn("311525")).toBe(false);
  });
  it("an exact CRN comes first, next term before the current one", () => {
    const hits = searchCrn(INDEX, "31152");
    expect(hits.map((h) => `${h.term} ${h.s} ${h.n} ${h.code}`)).toEqual(["2027-sp CS 124 AL1", "2026-fa MATH 221 AL1"]);
    expect(hits.every((h) => h.exact)).toBe(true);
  });
  it("a partial CRN lists sections that start with it", () => {
    expect(searchCrn(INDEX, "3115").map((h) => h.crn)).toEqual(["31152", "31153", "31152"]);
    expect(searchCrn(INDEX, "311").map((h) => h.crn)).toContain("31199");
    expect(searchCrn(INDEX, "99999")).toEqual([]);
  });
});

const ev = (at: string, crn: string, old: string, nw: string): SeatEvent => ({ term: "2027-sp", at, crn, s: "CS", n: "124", code: "AL1", old, new: nw });

describe("live seat feed", () => {
  it("the same change found by the live job and the daily crawl shows once, at the earlier time", () => {
    const live = [ev("2026-11-17T14:00:00Z", "1", "Closed", "Open")];
    const daily = [ev("2026-11-18T04:30:00Z", "1", "Closed", "Open"), ev("2026-11-17T09:00:00Z", "2", "Open", "Closed")];
    const out = mergeEvents(daily, live);
    expect(out.map((e) => `${e.crn} ${e.at}`)).toEqual(["1 2026-11-17T14:00:00Z", "2 2026-11-17T09:00:00Z"]);
  });
  it("open, closed, open again are three changes", () => {
    const out = mergeEvents([ev("2026-11-17T10:00:00Z", "1", "Closed", "Open"), ev("2026-11-17T11:00:00Z", "1", "Open", "Closed"), ev("2026-11-17T12:00:00Z", "1", "Closed", "Open")]);
    expect(out.length).toBe(3);
    expect(out[0].at).toBe("2026-11-17T12:00:00Z");
  });
  it("current status: the live job's later check wins over the last event", () => {
    const events = [ev("2026-11-17T10:00:00Z", "1", "Closed", "Open")];
    const live = { seen: { "2027-sp": { "1": ["Closed", "2026-11-17T10:20:00Z"] } } } as unknown as LiveFile;
    expect(currentStatus(events, live).get("2027-sp|1")).toEqual(["Closed", "2026-11-17T10:20:00Z"]);
    expect(currentStatus(events, null).get("2027-sp|1")).toEqual(["Open", "2026-11-17T10:00:00Z"]);
  });
  it("time since, in words", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    expect(fmtSince("2026-11-17T11:59:30Z", now)).toBe("just now");
    expect(fmtSince("2026-11-17T11:56:00Z", now)).toBe("4 min ago");
    expect(fmtSince("2026-11-17T09:00:00Z", now)).toBe("3 h ago");
    expect(fmtSince("2026-11-16T09:00:00Z", now)).toBe("yesterday");
  });
});
