import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeWatch, encodeWatch, latestStatus, MAX_WATCH, mergeWatch, readWatch, toggleWatch, type Watched } from "@/lib/watch";

const AL1: Watched = { t: "2027-sp", crn: "31152", s: "CS", n: "124", code: "AL1" };
const AD: Watched = { t: "2027-sp", crn: "40001", s: "STAT", n: "107", code: "AD@" };
const FALL: Watched = { t: "2026-fa", crn: "31152", s: "MATH", n: "221", code: "AL1" };

describe("watch list encoding", () => {
  it("round-trips, including codes with symbols and the same CRN in two terms", () => {
    const enc = encodeWatch([AL1, AD, FALL]);
    expect(enc).toBe("2027-sp.CS124.AL1.31152,2027-sp.STAT107.AD@.40001,2026-fa.MATH221.AL1.31152");
    expect(decodeWatch(enc)).toEqual([AL1, AD, FALL]);
    // through a share link: URLSearchParams escapes "@", "#" and "&"
    const viaUrl = new URLSearchParams(String(new URLSearchParams({ w: encodeWatch([{ ...AD, code: "A#&" }]) }))).get("w");
    expect(decodeWatch(viaUrl)[0].code).toBe("A#&");
  });
  it("drops malformed entries and duplicates, and keeps at most MAX_WATCH", () => {
    expect(decodeWatch("2027-sp.CS124.AL1.31152,2027-sp.CS124.AL1.31152,junk,2027-xx.CS124.A.1,2027-sp.cs124.AL1.3115")).toEqual([AL1]);
    expect(decodeWatch("2027-sp.cs124.al1.31152")).toEqual([{ ...AL1, code: "al1" }]);
    expect(decodeWatch(null)).toEqual([]);
    const many = Array.from({ length: MAX_WATCH + 5 }, (_, i) => ({ ...AL1, crn: String(10000 + i) }));
    expect(decodeWatch(encodeWatch(many))).toHaveLength(MAX_WATCH);
  });
  it("a shared list adds to yours without replacing it", () => {
    expect(mergeWatch([AL1], [AD, AL1])).toEqual([AL1, AD]);
  });
});

describe("watching in the browser", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) },
      dispatchEvent: () => true,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("toggles a section on and off and refuses a new one when the list is full", () => {
    expect(toggleWatch(AL1)).toBe(true);
    expect(readWatch()).toEqual([AL1]);
    expect(toggleWatch(AL1)).toBe(false);
    expect(readWatch()).toEqual([]);
    for (let i = 0; i < MAX_WATCH; i++) toggleWatch({ ...AL1, crn: String(10000 + i) });
    expect(toggleWatch(AD)).toBe(false);
    expect(readWatch()).toHaveLength(MAX_WATCH);
  });
});

describe("a watched section's latest status", () => {
  const daily: [string, string] = ["Closed", "2026-11-17T04:30:00+00:00"];
  it("takes the newer of the daily check and the seat feed", () => {
    expect(latestStatus(daily, undefined, undefined)).toEqual(daily);
    expect(latestStatus(daily, ["Open", "2026-11-17T15:00:00+00:00"], undefined)).toEqual(["Open", "2026-11-17T15:00:00+00:00"]);
    expect(latestStatus(daily, ["Open", "2026-11-16T15:00:00+00:00"], undefined)).toEqual(daily);
    expect(latestStatus(null, ["Open", "2026-11-16T15:00:00Z"], undefined)).toEqual(["Open", "2026-11-16T15:00:00Z"]);
  });
  it("a later live re-read with no change keeps the status and moves the time", () => {
    expect(latestStatus(daily, undefined, "2026-11-17T16:00:00+00:00")).toEqual(["Closed", "2026-11-17T16:00:00+00:00"]);
    expect(latestStatus(daily, undefined, "2026-11-16T16:00:00+00:00")).toEqual(daily);
    expect(latestStatus(null, undefined, "2026-11-17T16:00:00+00:00")).toBeNull();
  });
});
